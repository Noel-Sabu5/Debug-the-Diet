// app.js — Main application controller

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     GROQ AI CONFIGURATION (meal suggestions)
  ───────────────────────────────────────────── */
  const GROQ_API_KEY  = (window.CONFIG && window.CONFIG.GROQ_KEY) || '';
  const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_API_MODEL = 'llama-3.3-70b-versatile';

  async function getAIInsights(meal) {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: GROQ_API_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a clinical nutrition assistant. Analyze meals and provide concise health advice.',
          },
          {
            role: 'user',
            content: `Analyze this meal and give health issues and improvement suggestions in short bullet points. Meal: "${meal}". Respond with ONLY 3–4 concise bullet points (no headers, no markdown bold, just plain text lines starting with "•").`,
          },
        ],
        temperature:  0.4,
        max_tokens:   300,
      }),
    });

    if (!res.ok) throw new Error(`Groq API error: ${res.status}`);

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';

    return text
      .split('\n')
      .map(l => l.replace(/^[•\-*]\s*/, '').trim())
      .filter(l => l.length > 10)
      .slice(0, 4);
  }

  function appendAISuggestions(aiLines) {
    const container = document.getElementById('suggestions-list');
    if (!container || !aiLines.length) return;

    const sep = document.createElement('li');
    sep.className = 'pt-2 border-t border-outline-variant/10 dark:border-neutral-800';
    sep.innerHTML = `<span class="text-[9px] font-bold text-outline dark:text-neutral-600 uppercase tracking-widest">AI Analysis</span>`;
    container.appendChild(sep);

    aiLines.forEach(line => {
      const li = document.createElement('li');
      li.className = 'flex items-start gap-3';
      li.innerHTML = `
        <span class="material-symbols-outlined text-primary dark:text-primary-fixed text-sm mt-0.5">auto_awesome</span>
        <p class="text-xs text-on-surface dark:text-neutral-300 leading-relaxed">${line}</p>`;
      container.appendChild(li);
    });
  }

  /* ─────────────────────────────────────────────
     PAGE DETECTION
  ───────────────────────────────────────────── */
  function getCurrentPage() {
    const title = document.title.toLowerCase();
    if (title.includes('history')) return 'history';
    if (title.includes('insights')) return 'insights';
    return 'dashboard';
  }

  /* ─────────────────────────────────────────────
     LOGOUT + USERNAME
  ───────────────────────────────────────────── */
  function wireLogout() {
    // Show username in header (Firebase user has displayName or email)
    const nameEl = document.getElementById('nav-username');
    if (nameEl && window.Auth) {
      const user = window.Auth.getUser();
      if (user) {
        const display = user.displayName
          || user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        nameEl.textContent = display;
      }
    }
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && window.Auth) {
      logoutBtn.addEventListener('click', () => window.Auth.logout());
    }
  }

  /* ─────────────────────────────────────────────
     NAVIGATION WIRING
  ───────────────────────────────────────────── */
  function wireNavigation() {
    document.querySelectorAll('nav a').forEach(link => {
      const text = link.textContent.trim().toLowerCase();
      if (text === 'dashboard') link.href = 'dashboard.html';
      else if (text === 'history') link.href = 'history.html';
      else if (text === 'insights') link.href = 'insights.html';
    });

    const viewAll = document.querySelector('[data-view-all]');
    if (viewAll) viewAll.addEventListener('click', () => { window.location.href = 'history.html'; });

    const logNew = document.getElementById('log-new-btn');
    if (logNew) logNew.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
  }

  /* ─────────────────────────────────────────────
     QUICK-ADD BUTTONS — append "food 100g" format
  ───────────────────────────────────────────── */
  function wireQuickAdd() {
    const textarea = document.getElementById('meal-input');
    if (!textarea) return;
    document.querySelectorAll('[data-quick-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const food = btn.dataset.quickAdd;
        const entry = `${food} 100g`;
        const val = textarea.value.trim();
        textarea.value = val ? val + ', ' + entry : entry;
        textarea.focus();
      });
    });
  }

  /* ─────────────────────────────────────────────
     DASHBOARD LOGIC
  ───────────────────────────────────────────── */
  async function initDashboard() {
    const analyzeBtn = document.getElementById('analyze-btn');
    const textarea   = document.getElementById('meal-input');
    if (!analyzeBtn || !textarea) return;

    // Load recent meals from Firestore
    const recent = await window.Storage.getRecentMeals(3);
    window.UI.updateRecentLogs(recent);

    analyzeBtn.addEventListener('click', () => {
      const input = textarea.value.trim();
      if (!input) {
        window.UI.showToast('Enter food items, e.g: chicken 150g, rice 200g', 'error');
        return;
      }
      analyzeMeal(input);
    });

    textarea.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyzeBtn.click();
    });

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportLastAnalysis);
  }

  let lastAnalysis = null;

  /* ─────────────────────────────────────────────
     ANALYZE MEAL — Full pipeline
     1. Parse input into [{name, grams}]
     2. Fetch USDA nutrition for each (in parallel)
     3. Scale by weight, sum totals
     4. Score + insights → UI
     5. Save to localStorage
     6. AI suggestions (non-blocking)
  ───────────────────────────────────────────── */
  async function analyzeMeal(input) {
    window.UI.setAnalyzeLoading(true);

    // Parse food items from input string
    const foodItems = window.Analyzer.parseMealInput(input);

    if (foodItems.length === 0) {
      window.UI.setAnalyzeLoading(false);
      window.UI.showToast('No food items found. Try: "chicken 150g, rice 200g"', 'error');
      return;
    }

    // Inform user about API lookup (can take 1-2s)
    window.UI.showToast(
      `Looking up ${foodItems.length} food item${foodItems.length > 1 ? 's' : ''}…`,
      'success'
    );

    try {
      const { totals, breakdown, notFound } = await window.Analyzer.calculateNutrition(foodItems);

      if (breakdown.length === 0) {
        window.UI.setAnalyzeLoading(false);
        window.UI.showToast('No nutrition data found. Try more specific names.', 'error');
        return;
      }

      const tokens = breakdown.map(b => b.inputName);
      const score    = window.Scoring.calculateScore(totals, tokens, tokens.length);
      const insights = window.Scoring.generateInsights(totals, tokens);

      // Update all UI sections
      window.UI.updateScoreCard(score);
      window.UI.updateMacros(totals);
      window.UI.updateInsightCards(insights);
      window.UI.updateSuggestions(insights);

      // Inject weight breakdown into suggestions header
      injectBreakdown(breakdown);

      // Persist to Firestore
      await window.Storage.saveMeal(input, score, totals, tokens);
      lastAnalysis = { input, score, nutrition: totals, tokens, insights };

      const recent = await window.Storage.getRecentMeals(3);
      window.UI.updateRecentLogs(recent);

      const resultsSection = document.getElementById('results-section');
      if (resultsSection) resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const notFoundMsg = notFound.length
        ? ` (not found: ${notFound.slice(0, 3).join(', ')})`
        : '';
      window.UI.showToast(
        `Analysis complete — Score: ${score}/100${notFoundMsg}`,
        score >= 70 ? 'success' : 'error'
      );

    } catch (err) {
      console.error('Analysis failed:', err);
      window.UI.showToast('API error. Check your connection and try again.', 'error');
    }

    window.UI.setAnalyzeLoading(false);

    // Gemini AI in background (non-blocking, failure is silent)
    try {
      const aiLines = await getAIInsights(input);
      if (aiLines?.length) appendAISuggestions(aiLines);
    } catch (err) {
      console.warn('AI insights unavailable:', err.message);
    }
  }

  /**
   * Inject a per-food weight breakdown as a small info block
   * above the suggestions list (no layout change — injected into existing container).
   */
  function injectBreakdown(breakdown) {
    const container = document.getElementById('suggestions-list');
    if (!container || breakdown.length < 2) return;

    // Remove old breakdown if re-analyzing
    const old = document.getElementById('food-breakdown-block');
    if (old) old.remove();

    const block = document.createElement('li');
    block.id = 'food-breakdown-block';
    block.className = 'mb-2 pb-3 border-b border-outline-variant/10 dark:border-neutral-800';

    const rows = breakdown.map(b =>
      `<div class="flex justify-between text-[10px] text-on-surface-variant dark:text-neutral-500">
        <span class="truncate max-w-[60%]">${b.name.split(',')[0]}</span>
        <span>${b.grams}g · ${Math.round(b.calories)} kcal · P:${Math.round(b.protein)}g</span>
      </div>`
    ).join('');

    block.innerHTML = `
      <p class="text-[9px] font-bold text-outline dark:text-neutral-600 uppercase tracking-widest mb-2">Per-Food Breakdown</p>
      <div class="space-y-1">${rows}</div>`;

    container.insertBefore(block, container.firstChild);
  }

  /* ─────────────────────────────────────────────
     EXPORT
  ───────────────────────────────────────────── */
  function exportLastAnalysis() {
    if (!lastAnalysis) {
      window.UI.showToast('Analyze a meal first before exporting.', 'error');
      return;
    }
    const { input, score, nutrition, tokens } = lastAnalysis;
    const lines = [
      'DEBUG THE DIET — MEAL ANALYSIS REPORT',
      '========================================',
      `Date: ${new Date().toLocaleString()}`,
      `Meal: ${input}`,
      `Foods: ${tokens.join(', ')}`,
      '',
      `HEALTH SCORE: ${score}/100`,
      '',
      'MACRONUTRIENT TOTALS (scaled by entered weights)',
      `Protein:       ${nutrition.protein}g`,
      `Carbohydrates: ${nutrition.carbs}g`,
      `Fat:           ${nutrition.fat}g`,
      `Sugar:         ${nutrition.sugar}g`,
      `Calories:      ${nutrition.calories} kcal`,
      `Fiber:         ${nutrition.fiber}g`,
      '',
      'SOURCE: USDA FoodData Central API',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `dtd-analysis-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
    window.UI.showToast('Analysis exported!');
  }

  /* ─────────────────────────────────────────────
  /* ─────────────────────────────────────────────
     HISTORY LOGIC
  ───────────────────────────────────────────── */
  async function initHistory() {
    const searchInput   = document.getElementById('history-search');
    const dateFilter    = document.getElementById('date-range-filter');

    /** Fetch meals respecting current filter state, then render */
    async function refreshHistory() {
      try {
        const days  = dateFilter ? dateFilter.value : 'all';
        const meals = days === 'all'
          ? await window.Storage.getAllMeals()
          : await window.Storage.getMealsSince(Number(days));
        window.UI.renderHistoryList(meals, searchInput ? searchInput.value : '');
      } catch (err) {
        console.error('[History] Failed to load meals:', err);
        window.UI.renderHistoryList([]);
      }
    }

    await refreshHistory();

    if (searchInput) searchInput.addEventListener('input', refreshHistory);
    if (dateFilter)  dateFilter.addEventListener('change', refreshHistory);

    const clearBtn = document.getElementById('clear-all-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (confirm('Clear all meal history? This cannot be undone.')) {
          try {
            await window.Storage.clearAllMeals();
            window.UI.renderHistoryList([]);
            window.UI.showToast('All meals cleared.');
          } catch (err) { console.error('[History] Clear error:', err); }
        }
      });
    }
  }

  async function deleteMealEntry(id) {
    await window.Storage.deleteMeal(id);
    const searchInput = document.getElementById('history-search');
    const all = await window.Storage.getAllMeals();
    window.UI.renderHistoryList(all, searchInput ? searchInput.value : '');
    window.UI.showToast('Meal deleted.');
  }

  /* ─────────────────────────────────────────────
     INSIGHTS LOGIC
  ───────────────────────────────────────────── */
  async function initInsights() {
    const btn1  = document.getElementById('period-1');
    const btn7  = document.getElementById('period-7');
    const btn30 = document.getElementById('period-30');
    const titleEl = document.getElementById('insights-title');

    const TITLES = { 1: "Today's Insights", 7: 'Weekly Insights', 30: 'Monthly Insights' };

    const activeClass   = ['bg-surface-container-lowest', 'dark:bg-neutral-800', 'shadow-sm', 'text-primary', 'dark:text-primary-fixed'];
    const inactiveClass = ['text-on-surface-variant', 'dark:text-neutral-400', 'hover:text-on-surface', 'dark:hover:text-neutral-200'];

    function setActiveBtn(activeDays) {
      [btn1, btn7, btn30].forEach(btn => {
        if (!btn) return;
        btn.classList.remove(...activeClass, ...inactiveClass);
        const btnDays = Number(btn.id.replace('period-', ''));
        if (btnDays === activeDays) {
          btn.classList.add(...activeClass);
        } else {
          btn.classList.add(...inactiveClass);
        }
      });
      if (titleEl) titleEl.textContent = TITLES[activeDays] || 'Insights';
    }

    async function loadInsights(days) {
      try {
        setActiveBtn(days);
        const stats = days === 1
          ? await window.Storage.getDailyStats()
          : await window.Storage.getInsightStats(days);
        window.UI.updateInsightsPage(stats);

        // Kick off Gemini AI summary (non-blocking — shows shimmer then result)
        if (window.Gemini && stats.totalMeals > 0) {
          window.UI.showCuratedLoading();
          window.Gemini.generateCuratedSummary(stats)
            .then(text => window.UI.renderCuratedSummary(text))
            .catch(() => window.UI.updateCuratedSummary(stats)); // fallback to template
        }
      } catch (err) {
        console.error('[Insights] Failed to load stats:', err);
      }
    }

    // Default: last 7 days
    await loadInsights(7);

    if (btn1)  btn1.addEventListener('click',  () => loadInsights(1));
    if (btn7)  btn7.addEventListener('click',  () => loadInsights(7));
    if (btn30) btn30.addEventListener('click', () => loadInsights(30));
  }

  /* ─────────────────────────────────────────────
     THEME TOGGLE
  ───────────────────────────────────────────── */
  function wireThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem(
        'dtd_theme',
        document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      );
    });
    const saved = localStorage.getItem('dtd_theme');
    if (saved === 'light') document.documentElement.classList.remove('dark');
    else if (saved === 'dark') document.documentElement.classList.add('dark');
  }

  /* ─────────────────────────────────────────────
     BOOT — wait for Firebase auth state, then init
  ───────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    wireThemeToggle();

    // requireAuth is async (onAuthStateChanged)
    // It redirects to login.html if no session,
    // or calls the callback once authenticated.
    window.Auth.requireAuth(function (user) {
      // Reveal page (was hidden by auth guard)
      document.body.style.opacity = '1';

      wireLogout();
      wireNavigation();
      wireQuickAdd();

      // Initialise HealthBot chatbot (chatbot.js must be loaded after app.js)
      if (window.HealthBot) window.HealthBot.init(user);

      const page = getCurrentPage();
      if      (page === 'dashboard') { initDashboard(); if (window._loadDashboardSleepWidget) window._loadDashboardSleepWidget(); }
      else if (page === 'history')   initHistory();
      else if (page === 'insights')  initInsights();
    });
  });

  window.App = { deleteMealEntry, analyzeMeal };

})();

