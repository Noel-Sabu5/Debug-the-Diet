// storage.js — Firestore persistence layer (replaces localStorage)
// All functions are async — await them in app.js

(function () {
  'use strict';

  /** Returns the current user's meals collection reference */
  function mealsRef() {
    const uid = window._auth.currentUser?.uid;
    if (!uid) throw new Error('User not authenticated');
    return window._db.collection('users').doc(uid).collection('meals');
  }

  /**
   * Save a new meal to Firestore.
   */
  async function saveMeal(meal, score, nutrition, tokens) {
    await mealsRef().add({
      meal:      meal.trim(),
      score:     score,
      nutrition: nutrition,   // { protein, carbs, fat, calories, fiber, sugar }
      tokens:    tokens,      // string[] — food names
      date:      firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Get ALL meals for the current user, newest first.
   */
  async function getAllMeals() {
    const snap = await mealsRef().orderBy('date', 'desc').get();
    return snap.docs.map(d => {
      const data = d.data();
      // Convert Firestore Timestamp → ISO string so existing UI code works
      return {
        id:        d.id,
        meal:      data.meal,
        score:     data.score,
        nutrition: data.nutrition,
        tokens:    data.tokens,
        date:      data.date ? data.date.toDate().toISOString() : new Date().toISOString(),
      };
    });
  }

  /**
   * Get the N most recent meals.
   */
  async function getRecentMeals(n = 3) {
    const snap = await mealsRef().orderBy('date', 'desc').limit(n).get();
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id:        d.id,
        meal:      data.meal,
        score:     data.score,
        nutrition: data.nutrition,
        tokens:    data.tokens,
        date:      data.date ? data.date.toDate().toISOString() : new Date().toISOString(),
      };
    });
  }

  /**
   * Delete a meal by Firestore document ID.
   */
  async function deleteMeal(id) {
    const uid = window._auth.currentUser?.uid;
    if (!uid) return;
    await window._db.collection('users').doc(uid).collection('meals').doc(id).delete();
  }

  /**
   * Delete ALL meals for the current user (batch operation).
   */
  async function clearAllMeals() {
    const snap  = await mealsRef().get();
    const batch = window._db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  /**
   * Compute stats for the Insights page.
   * Returns same shape as the old localStorage version.
   */
  async function getInsightStats() {
    const all = await getAllMeals();
    if (all.length === 0) {
      return { averageScore: 0, trend: 0, totalMeals: 0, weeklyMeals: [], weeklyAvg: 0, lastWeekAvg: 0, dailyAvgs: [] };
    }

    const now      = Date.now();
    const oneWeek  = 7 * 24 * 60 * 60 * 1000;
    const twoWeeks = 2 * oneWeek;

    const weeklyMeals   = all.filter(m => now - new Date(m.date).getTime() < oneWeek);
    const lastWeekMeals = all.filter(m => {
      const age = now - new Date(m.date).getTime();
      return age >= oneWeek && age < twoWeeks;
    });

    const avg = arr => arr.length
      ? Math.round(arr.reduce((s, m) => s + m.score, 0) / arr.length)
      : 0;

    const weeklyAvg   = avg(weeklyMeals);
    const lastWeekAvg = avg(lastWeekMeals);
    const trend       = lastWeekAvg > 0 ? weeklyAvg - lastWeekAvg : 0;

    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dailyScores = {};
    weeklyMeals.forEach(m => {
      const d = new Date(m.date).getDay();
      if (!dailyScores[d]) dailyScores[d] = [];
      dailyScores[d].push(m.score);
    });
    const dailyAvgs = days.map((day, i) => ({
      day,
      score: dailyScores[i] ? avg(dailyScores[i]) : null,
    }));

    return {
      averageScore: weeklyAvg || avg(all),
      trend,
      totalMeals:  all.length,
      weeklyMeals,
      weeklyAvg,
      lastWeekAvg,
      dailyAvgs,
    };
  }

  // Expose globally
  window.Storage = {
    saveMeal,
    getAllMeals,
    getRecentMeals,
    deleteMeal,
    clearAllMeals,
    getInsightStats,
  };

})();
