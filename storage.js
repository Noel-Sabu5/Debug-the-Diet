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
   * Get meals newer than `days` days ago.
   */
  async function getMealsSince(days) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const all   = await getAllMeals();
    return all.filter(m => new Date(m.date) >= since);
  }

  /**
   * Compute stats for the Insights page.
   * @param {number} days - window size: 7 or 30 (default 7)
   */
  async function getInsightStats(days = 7) {
    const all = await getAllMeals();
    if (all.length === 0) {
      return { averageScore: 0, trend: 0, totalMeals: 0, weeklyMeals: [], weeklyAvg: 0, lastWeekAvg: 0, dailyAvgs: [] };
    }

    const now      = Date.now();
    const windowMs = days * 24 * 60 * 60 * 1000;
    const prevMs   = windowMs * 2;

    const windowMeals = all.filter(m => now - new Date(m.date).getTime() < windowMs);
    const prevMeals   = all.filter(m => {
      const age = now - new Date(m.date).getTime();
      return age >= windowMs && age < prevMs;
    });

    const avg = arr => arr.length
      ? Math.round(arr.reduce((s, m) => s + m.score, 0) / arr.length)
      : 0;

    const windowAvg  = avg(windowMeals);
    const prevAvg    = avg(prevMeals);
    const trend      = prevAvg > 0 ? windowAvg - prevAvg : 0;

    // Daily breakdown for the chart (last 7 days always shown in bar chart)
    const days7 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const last7Meals = all.filter(m => now - new Date(m.date).getTime() < 7 * 24 * 60 * 60 * 1000);
    const dailyScores = {};
    last7Meals.forEach(m => {
      const d = new Date(m.date).getDay();
      if (!dailyScores[d]) dailyScores[d] = [];
      dailyScores[d].push(m.score);
    });
    const dailyAvgs = days7.map((day, i) => ({
      day,
      score: dailyScores[i] ? avg(dailyScores[i]) : null,
    }));

    return {
      averageScore: windowAvg || avg(all),
      trend,
      totalMeals:  all.length,
      weeklyMeals: windowMeals,
      weeklyAvg:   windowAvg,
      lastWeekAvg: prevAvg,
      dailyAvgs,
      windowDays:  days,
    };
  }

  /**
   * Compute stats for TODAY only (midnight → now).
   * Returns a superset of getInsightStats so updateInsightsPage() works unchanged.
   */
  async function getDailyStats() {
    const all = await getAllMeals();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const todayMeals = all.filter(m => new Date(m.date).getTime() >= todayMs);

    const avg = arr => arr.length
      ? Math.round(arr.reduce((s, m) => s + m.score, 0) / arr.length)
      : 0;

    const avgScore = avg(todayMeals);

    // Macro totals for today
    const macroTotals = todayMeals.reduce((acc, m) => {
      const n = m.nutrition || {};
      acc.protein  += n.protein  || 0;
      acc.carbs    += n.carbs    || 0;
      acc.fat      += n.fat      || 0;
      acc.calories += n.calories || 0;
      acc.fiber    += n.fiber    || 0;
      acc.sugar    += n.sugar    || 0;
      return acc;
    }, { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0, sugar: 0 });

    // Best and worst meal today
    const sorted = [...todayMeals].sort((a, b) => b.score - a.score);
    const bestMeal  = sorted[0]  || null;
    const worstMeal = sorted[sorted.length - 1] || null;

    // Primary deficit (same logic as weekly)
    let primaryDeficit = '—';
    if (todayMeals.length > 0) {
      if (macroTotals.sugar / todayMeals.length > 15)   primaryDeficit = 'Sugar';
      else if (macroTotals.protein / todayMeals.length < 15) primaryDeficit = 'Protein';
      else primaryDeficit = 'None';
    }

    // Build dailyAvgs with just today's day filled in (rest null for chart)
    const days7 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const todayDayIndex = new Date().getDay();
    const dailyAvgs = days7.map((day, i) => ({
      day,
      score: i === todayDayIndex ? avgScore || null : null,
    }));

    return {
      averageScore:   avgScore,
      trend:          0,           // no previous day comparison
      totalMeals:     all.length,  // lifetime total
      todayMeals:     todayMeals,
      weeklyMeals:    todayMeals,  // reuse for daysInRange logic
      weeklyAvg:      avgScore,
      lastWeekAvg:    0,
      dailyAvgs,
      windowDays:     1,
      // Daily-specific extras
      macroTotals,
      bestMeal,
      worstMeal,
      primaryDeficit,
      mealCount:      todayMeals.length,
    };
  }

  // Expose globally
  window.Storage = {
    saveMeal,
    getAllMeals,
    getRecentMeals,
    getMealsSince,
    deleteMeal,
    clearAllMeals,
    getInsightStats,
    getDailyStats,
  };

})();
