// ui.js — All DOM manipulation functions. Never touches theme classes.

/* ─────────────────────────────────────────────
   DASHBOARD UI
───────────────────────────────────────────── */

/**
 * Update the big health score card.
 */
function updateScoreCard(score) {
  const el = document.getElementById('score-value');
  const badge = document.getElementById('score-badge');
  const desc = document.getElementById('score-description');
  if (el) el.textContent = score;
  if (badge) badge.textContent = window.Scoring.getScoreBadge(score);
  if (desc) {
    const ratings = {
      excellent: 'A highly balanced meal with excellent macronutrient distribution and nutrient density.',
      good: 'A solid meal composition with minor areas for optimization.',
      average: 'Adequate nutritional profile, but several key markers are below optimal thresholds.',
      poor: 'This meal contains significant nutritional imbalances. Review the clinical observations below.',
    };
    const s = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'average' : 'poor';
    desc.textContent = ratings[s];
  }
}

/**
 * Update macro breakdown bars and values.
 */
function updateMacros(nutrition) {
  const { proteinPct, carbsPct, fatPct } = window.Scoring.getMacroPercentages(nutrition);

  // Protein
  const pVal = document.getElementById('protein-value');
  const pBar = document.getElementById('protein-bar');
  if (pVal) pVal.textContent = `${nutrition.protein}g | ${proteinPct}%`;
  if (pBar) pBar.style.width = `${Math.min(proteinPct, 100)}%`;

  // Carbs
  const cVal = document.getElementById('carbs-value');
  const cBar = document.getElementById('carbs-bar');
  if (cVal) cVal.textContent = `${nutrition.carbs}g | ${carbsPct}%`;
  if (cBar) cBar.style.width = `${Math.min(carbsPct, 100)}%`;

  // Fat
  const fVal = document.getElementById('fat-value');
  const fBar = document.getElementById('fat-bar');
  if (fVal) fVal.textContent = `${nutrition.fat}g | ${fatPct}%`;
  if (fBar) fBar.style.width = `${Math.min(fatPct, 100)}%`;

  // Plate donut chart
  updatePlateChart(proteinPct, carbsPct, fatPct);

  // Quick macro snapshot
  const snapTarget = document.getElementById('macro-target-pct');
  const snapBar = document.getElementById('macro-target-bar');
  if (snapTarget || snapBar) {
    const targetMet = Math.min(100, Math.round((nutrition.protein / 30) * 40 + (nutrition.fiber / 8) * 30 + Math.max(0, 30 - nutrition.sugar) / 30 * 30));
    if (snapTarget) snapTarget.textContent = `${targetMet}%`;
    if (snapBar) snapBar.style.width = `${targetMet}%`;
  }

  // Sugar value in quick snapshot area if present
  const sugarVal = document.getElementById('sugar-value');
  if (sugarVal) sugarVal.textContent = `${nutrition.sugar}g`;

  // Calories
  const calVal = document.getElementById('calories-value');
  if (calVal) calVal.textContent = `${nutrition.calories} kcal`;
}

/**
 * Update the SVG donut plate chart.
 */
function updatePlateChart(proteinPct, carbsPct, fatPct) {
  const circumference = 2 * Math.PI * 45; // r=45 → ~282.7
  const proteinDash = (proteinPct / 100) * circumference;
  const carbsDash   = (carbsPct / 100)   * circumference;
  const fatDash     = (fatPct / 100)     * circumference;

  const pCircle = document.getElementById('plate-protein');
  const cCircle = document.getElementById('plate-carbs');
  const fCircle = document.getElementById('plate-fat');

  if (pCircle) {
    pCircle.setAttribute('stroke-dasharray', `${proteinDash.toFixed(1)} ${(circumference - proteinDash).toFixed(1)}`);
    pCircle.setAttribute('stroke-dashoffset', '0');
  }
  if (cCircle) {
    cCircle.setAttribute('stroke-dasharray', `${carbsDash.toFixed(1)} ${(circumference - carbsDash).toFixed(1)}`);
    cCircle.setAttribute('stroke-dashoffset', `-${proteinDash.toFixed(1)}`);
  }
  if (fCircle) {
    fCircle.setAttribute('stroke-dasharray', `${fatDash.toFixed(1)} ${(circumference - fatDash).toFixed(1)}`);
    fCircle.setAttribute('stroke-dashoffset', `-${(proteinDash + carbsDash).toFixed(1)}`);
  }
}

/**
 * Update clinical observations (issues & insights) grid.
 */
function updateInsightCards(insights) {
  const container = document.getElementById('insights-grid');
  if (!container) return;

  container.innerHTML = '';
  insights.issues.forEach(issue => {
    const isError = issue.type === 'error';
    const isSuccess = issue.type === 'success';
    const borderColor = isError
      ? 'border-error dark:border-tertiary-fixed'
      : isSuccess
      ? 'border-primary dark:border-primary-fixed'
      : 'border-secondary-dim dark:border-neutral-600';
    const bgColor = isError
      ? 'bg-error/5 dark:bg-red-500/5'
      : isSuccess
      ? 'bg-primary/5 dark:bg-primary-fixed/5'
      : 'bg-secondary-container/20 dark:bg-neutral-800/30';
    const textColor = isError
      ? 'text-error dark:text-tertiary-fixed'
      : isSuccess
      ? 'text-primary dark:text-primary-fixed'
      : 'text-secondary-dim dark:text-neutral-400';

    container.innerHTML += `
      <div class="p-5 ${bgColor} rounded-lg border-l-4 ${borderColor}">
        <div class="flex items-center gap-3 mb-2">
          <span class="material-symbols-outlined ${textColor}">${issue.icon}</span>
          <span class="text-sm font-bold ${textColor} uppercase tracking-tight">${issue.title}</span>
        </div>
        <p class="text-xs text-on-surface-variant dark:text-neutral-400">${issue.text}</p>
      </div>`;
  });

  // If no issues at all
  if (insights.issues.length === 0) {
    container.innerHTML = `
      <div class="p-5 bg-primary/5 dark:bg-primary-fixed/5 rounded-lg border-l-4 border-primary dark:border-primary-fixed col-span-2">
        <div class="flex items-center gap-3 mb-2">
          <span class="material-symbols-outlined text-primary dark:text-primary-fixed">check_circle</span>
          <span class="text-sm font-bold text-primary dark:text-primary-fixed uppercase tracking-tight">All Clear</span>
        </div>
        <p class="text-xs text-on-surface-variant dark:text-neutral-400">No nutritional concerns detected. This meal meets optimal dietary parameters.</p>
      </div>`;
  }
}

/**
 * Update optimization suggestions list.
 */
function updateSuggestions(insights) {
  const container = document.getElementById('suggestions-list');
  if (!container) return;
  container.innerHTML = '';
  insights.suggestions.forEach(s => {
    container.innerHTML += `
      <li class="flex items-start gap-3">
        <span class="material-symbols-outlined text-primary dark:text-primary-fixed text-sm mt-0.5">${s.icon}</span>
        <p class="text-xs text-on-surface dark:text-neutral-300 leading-relaxed">${s.text}</p>
      </li>`;
  });
}

/**
 * Update the recent logs section on dashboard.
 */
function updateRecentLogs(meals) {
  const container = document.getElementById('recent-logs');
  if (!container) return;

  // Keep the "View All Logs" tile, only replace data tiles
  const tiles = container.querySelectorAll('[data-log-tile]');
  tiles.forEach(t => t.remove());

  const recent = meals.slice(0, 3);
  const insertBefore = container.querySelector('[data-view-all]');

  recent.forEach(meal => {
    const date = new Date(meal.date);
    const label = formatRelativeDate(date);
    const tile = document.createElement('div');
    tile.setAttribute('data-log-tile', '');
    tile.className = 'bg-surface-container-low dark:bg-neutral-900 p-6 rounded-lg border border-outline-variant/10 dark:border-neutral-800';
    tile.innerHTML = `
      <label class="text-[9px] font-bold text-on-surface-variant dark:text-neutral-500 uppercase mb-2 block">${label}</label>
      <div class="text-xl font-headline font-bold text-on-surface dark:text-neutral-50">${meal.score}<span class="text-xs font-normal text-outline dark:text-neutral-600">/100</span></div>
      <p class="text-[10px] text-on-surface-variant dark:text-neutral-600 mt-1 truncate">${meal.meal.slice(0, 30)}</p>`;
    if (insertBefore) container.insertBefore(tile, insertBefore);
    else container.appendChild(tile);
  });
}

function formatRelativeDate(date) {
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `TODAY - ${time}`;
  if (diffDays === 1) return `YESTERDAY - ${time}`;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()} - ${time}`;
}

/**
 * Show/hide loading state on Analyze button.
 */
function setAnalyzeLoading(loading) {
  const btn = document.getElementById('analyze-btn');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Analyzing...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">analytics</span> Analyze Meal`;
  }
}

/**
 * Show a toast notification (non-intrusive).
 */
function showToast(message, type = 'success') {
  const existing = document.getElementById('dtd-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'dtd-toast';
  const color = type === 'error'
    ? 'bg-error text-white dark:bg-tertiary-fixed dark:text-black'
    : 'bg-primary dark:bg-primary-fixed text-white dark:text-on-primary-fixed';
  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-xl text-sm font-semibold ${color} transition-all duration-300 opacity-0 translate-y-2`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ─────────────────────────────────────────────
   HISTORY PAGE UI
───────────────────────────────────────────── */

/**
 * Render the full history list.
 */
function renderHistoryList(meals, searchQuery = '') {
  const container = document.getElementById('history-list');
  if (!container) return;

  let filtered = meals;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = meals.filter(m =>
      m.meal.toLowerCase().includes(q) ||
      (m.tokens && m.tokens.some(t => t.includes(q)))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-20 text-on-surface-variant dark:text-neutral-500">
        <span class="material-symbols-outlined text-5xl mb-4 block opacity-30">search_off</span>
        <p class="text-sm font-medium">${searchQuery ? 'No meals match your search.' : 'No meals logged yet. Analyze your first meal on the Dashboard!'}</p>
      </div>`;
    updatePaginationCount(0, 0);
    return;
  }

  const rating = window.Scoring.getRating;

  container.innerHTML = filtered.map(meal => {
    const r = rating(meal.score);
    const date = new Date(meal.date);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const scoreColor = meal.score >= 85
      ? 'text-primary dark:text-primary-fixed'
      : meal.score >= 70
      ? 'text-secondary-dim dark:text-secondary-fixed-dim'
      : meal.score >= 50
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-tertiary dark:text-tertiary-fixed';

    const nutrition = meal.nutrition || {};
    const cals = nutrition.calories ? Math.round(nutrition.calories) : '—';

    const mealLabel = meal.meal.length > 40 ? meal.meal.slice(0, 40) + '…' : meal.meal;
    const displayTokens = (meal.tokens || []).slice(0, 4).join(', ') || meal.meal;

    return `
      <div class="group bg-surface-container-low dark:bg-neutral-900/80 hover:bg-white dark:hover:bg-neutral-900 transition-all duration-300 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-6 ring-1 ring-slate-200/50 dark:ring-neutral-800/50" data-meal-id="${meal.id}">
        <div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-slate-200 dark:bg-neutral-800 flex items-center justify-center">
          <span class="material-symbols-outlined text-3xl text-slate-400 dark:text-neutral-600">restaurant</span>
        </div>
        <div class="flex-grow min-w-0">
          <div class="flex items-center gap-3 mb-1 flex-wrap">
            <h3 class="font-headline font-bold text-lg text-on-surface dark:text-neutral-50 truncate">${mealLabel}</h3>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${r.colorClass}">${r.label}</span>
          </div>
          <div class="flex items-center gap-4 text-sm text-on-surface-variant dark:text-neutral-500 flex-wrap">
            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">schedule</span> ${timeStr}</span>
            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">calendar_month</span> ${dateStr}</span>
            ${meal.tokens && meal.tokens.length ? `<span class="text-[10px] text-outline dark:text-neutral-600 hidden md:block truncate max-w-xs">${displayTokens}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-8 px-4 md:border-l border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <div class="text-center">
            <div class="text-[10px] font-bold text-on-surface-variant dark:text-neutral-600 uppercase tracking-widest mb-1">Score</div>
            <div class="font-headline text-2xl font-extrabold ${scoreColor}">${meal.score}</div>
          </div>
          <div class="text-center">
            <div class="text-[10px] font-bold text-on-surface-variant dark:text-neutral-600 uppercase tracking-widest mb-1">Cals</div>
            <div class="font-headline text-2xl font-extrabold text-on-surface dark:text-neutral-100">${cals}</div>
          </div>
        </div>
        <div class="md:ml-4 flex-shrink-0">
          <button onclick="window.App && window.App.deleteMealEntry('${meal.id}')" class="w-full md:w-auto px-5 py-2.5 rounded-lg border border-slate-200 dark:border-neutral-800 text-on-surface-variant dark:text-neutral-400 font-semibold text-sm hover:bg-white dark:hover:bg-neutral-800 hover:text-tertiary dark:hover:text-tertiary-fixed hover:border-tertiary dark:hover:border-tertiary-fixed transition-all active:scale-95">
            Delete
          </button>
        </div>
      </div>`;
  }).join('');

  updatePaginationCount(filtered.length, filtered.length);
}

function updatePaginationCount(showing, total) {
  const el = document.getElementById('pagination-count');
  if (el) el.textContent = `Showing ${showing} of ${total} entries`;
}

/* ─────────────────────────────────────────────
   INSIGHTS PAGE UI
───────────────────────────────────────────── */

/**
 * Update the insights page with computed stats.
 */
function updateInsightsPage(stats) {
  const isToday = stats.windowDays === 1;

  // Average score
  const avgEl = document.getElementById('avg-score');
  if (avgEl) avgEl.textContent = stats.averageScore || '—';

  // Trend — hide for Today view (no prior-day baseline)
  const trendEl   = document.getElementById('trend-value');
  const trendIcon = document.getElementById('trend-icon');
  if (trendEl) {
    if (isToday) {
      trendEl.textContent = '—';
    } else {
      const sign = stats.trend > 0 ? '+' : '';
      trendEl.textContent = stats.trend !== 0 ? `${sign}${stats.trend}%` : '—';
    }
  }
  if (trendIcon) {
    trendIcon.textContent = isToday ? 'today' : (stats.trend >= 0 ? 'trending_up' : 'trending_down');
  }

  // Meal count — show today's meals for Today view, lifetime total otherwise
  const totalEl = document.getElementById('total-meals');
  if (totalEl) {
    totalEl.textContent = isToday
      ? (stats.mealCount ?? (stats.todayMeals || []).length)
      : stats.totalMeals;
  }

  // Consistency label
  const daysEl = document.getElementById('days-in-range');
  if (daysEl) {
    if (isToday) {
      const goodMeals = (stats.todayMeals || []).filter(m => m.score >= 70).length;
      const totalToday = (stats.todayMeals || []).length;
      daysEl.textContent = totalToday === 0
        ? 'No meals logged today'
        : `${goodMeals} of ${totalToday} meals above target score`;
    } else {
      const daysInRange = (stats.weeklyMeals || []).filter(m => m.score >= 70).length;
      daysEl.textContent = `${Math.min(daysInRange, 7)} out of 7 days within target range`;
    }
  }

  // Primary deficit
  const deficitEl = document.getElementById('primary-deficit');
  if (deficitEl) {
    if (isToday && stats.primaryDeficit) {
      // getDailyStats pre-computes this
      deficitEl.textContent = stats.primaryDeficit;
    } else if (stats.weeklyMeals && stats.weeklyMeals.length > 0) {
      const avgProtein = stats.weeklyMeals.reduce((s, m) => s + (m.nutrition?.protein || 0), 0) / stats.weeklyMeals.length;
      const avgSugar   = stats.weeklyMeals.reduce((s, m) => s + (m.nutrition?.sugar   || 0), 0) / stats.weeklyMeals.length;
      if (avgSugar > 15)       deficitEl.textContent = 'Sugar';
      else if (avgProtein < 15) deficitEl.textContent = 'Protein';
      else                      deficitEl.textContent = 'None';
    }
  }

  // Update trend dots
  updateScoreTrendDots(stats.dailyAvgs || []);

  // Update curated summary
  updateCuratedSummary(stats);
}

/**
 * Update the daily score trend dots chart.
 * Each dot is 12px tall (h-3). To center it at score%, use calc(score% - 6px).
 * Days with no data are dimmed at the bottom; days with data are fully visible.
 */
function updateScoreTrendDots(dailyAvgs) {
  dailyAvgs.forEach((day) => {
    const dotEl  = document.getElementById(`trend-dot-${day.day}`);
    const lineEl = document.getElementById(`trend-line-${day.day}`);
    const hasData = day.score !== null && day.score !== undefined;

    if (hasData) {
      const pct = Math.max(6, Math.min(90, day.score));
      if (dotEl) {
        dotEl.style.bottom  = `calc(${pct}% - 6px)`;  // center 12px dot at pct
        dotEl.style.opacity = '1';
        dotEl.title = `${day.day}: ${day.score}/100`;
      }
      if (lineEl) lineEl.style.height = `${pct}%`;
    } else {
      // No data for this day — show a faint dot at the floor
      if (dotEl) {
        dotEl.style.bottom  = '4px';
        dotEl.style.opacity = '0.2';
        dotEl.title = `${day.day}: No data`;
      }
      if (lineEl) lineEl.style.height = '0%';
    }
  });
}

/**
 * Update the curated summary section (fallback).
 */
function updateCuratedSummary(stats) {
  const summaryEl = document.getElementById('curated-summary');
  if (!summaryEl) return;

  // ── TODAY VIEW ──────────────────────────────────
  if (stats.windowDays === 1) {
    const count = stats.mealCount || (stats.todayMeals || []).length;
    if (count === 0) {
      summaryEl.innerHTML = `<p class="text-lg text-on-surface-variant dark:text-neutral-400">No meals logged today. Head to the Dashboard to analyze your first meal of the day.</p>`;
      return;
    }
    const cals  = Math.round(stats.macroTotals?.calories || 0);
    const prot  = Math.round(stats.macroTotals?.protein  || 0);
    const best  = stats.bestMeal  ? `<span class="font-semibold text-on-surface dark:text-neutral-50">${stats.bestMeal.meal.slice(0, 30)}</span> (${stats.bestMeal.score}/100)` : '—';
    const worst = stats.worstMeal && stats.mealCount > 1
      ? `<span class="font-semibold text-on-surface dark:text-neutral-50">${stats.worstMeal.meal.slice(0, 30)}</span> (${stats.worstMeal.score}/100)`
      : null;
    const quality = stats.averageScore >= 80 ? 'excellent' : stats.averageScore >= 65 ? 'good' : 'below optimal';
    summaryEl.innerHTML = `
      <p class="text-lg">
        You've logged <span class="text-primary dark:text-primary-fixed font-semibold">${count} meal${count > 1 ? 's' : ''}</span> today
        with an average score of <span class="text-primary dark:text-primary-fixed font-semibold">${stats.averageScore}/100</span> — ${quality} nutritional quality.
        Total intake so far: <span class="font-semibold text-on-surface dark:text-neutral-50">${cals} kcal</span>
        · <span class="font-semibold text-on-surface dark:text-neutral-50">${prot}g protein</span>.
      </p>
      <p>
        Best meal today: ${best}.
        ${worst ? `Lowest-scoring: ${worst} — consider a nutrient-dense snack to balance the day.` : ''}
        ${stats.primaryDeficit !== 'None' && stats.primaryDeficit !== '—' ? `Primary deficit detected: <span class="font-semibold text-tertiary dark:text-tertiary-fixed">${stats.primaryDeficit}</span>.` : ''}
      </p>`;
    return;
  }

  // ── WEEKLY / MONTHLY VIEW ────────────────────────
  if (stats.totalMeals === 0) {
    summaryEl.innerHTML = `<p class="text-lg text-on-surface-variant dark:text-neutral-400">No meals logged yet. Start tracking on the Dashboard to see personalized insights here.</p>`;
    return;
  }

  const avg = stats.averageScore;
  const trend = stats.trend;
  const trendText = trend > 0
    ? `improving by <span class="text-primary dark:text-primary-fixed font-semibold">+${trend} pts</span> vs last period`
    : trend < 0
    ? `declining by <span class="text-tertiary dark:text-tertiary-fixed font-semibold">${trend} pts</span> vs last period`
    : 'stable compared to last period';

  const quality = avg >= 80 ? 'above the 80th percentile' : avg >= 65 ? 'within a healthy range' : 'below optimal thresholds';

  summaryEl.innerHTML = `
    <p class="text-lg">
      Your dietary precision is <span class="text-primary dark:text-primary-fixed font-semibold">${quality}</span> for this tracking period, ${trendText}. You have logged <span class="font-semibold text-on-surface dark:text-neutral-50">${stats.totalMeals} meals</span> in total.
    </p>
    <p>
      ${avg >= 75
        ? 'Consistent nutritional patterns are emerging. Focus on maintaining variety and micronutrient density as your primary optimization lever.'
        : 'There is meaningful room to improve meal quality. Prioritize increasing protein and fiber while reducing processed food intake.'}
    </p>`;
}

/**
 * Show AI loading shimmer in curated summary.
 */
function showCuratedLoading() {
  const el = document.getElementById('curated-summary');
  if (!el) return;
  el.innerHTML = `
    <div class="flex items-center gap-3 mb-3">
      <span class="material-symbols-outlined text-primary dark:text-primary-fixed animate-spin text-lg">autorenew</span>
      <span class="text-xs font-bold uppercase tracking-widest text-primary dark:text-primary-fixed">Gemini AI is analysing your data…</span>
    </div>
    <div class="space-y-2">
      <div class="h-4 bg-slate-200 dark:bg-neutral-800 rounded animate-pulse w-full"></div>
      <div class="h-4 bg-slate-200 dark:bg-neutral-800 rounded animate-pulse w-5/6"></div>
      <div class="h-4 bg-slate-200 dark:bg-neutral-800 rounded animate-pulse w-4/6"></div>
    </div>`;
}

/**
 * Render AI-generated curated summary text.
 */
function renderCuratedSummary(text) {
  const el = document.getElementById('curated-summary');
  if (!el) return;
  // Split into paragraphs on double-newline or ". " boundaries
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  el.innerHTML = paragraphs.length > 1
    ? paragraphs.map(p => `<p class="text-base leading-relaxed">${p.trim()}</p>`).join('')
    : `<p class="text-base leading-relaxed">${text}</p>`;

  // Add a small AI badge
  el.insertAdjacentHTML('beforeend', `
    <p class="flex items-center gap-1.5 mt-4 text-[10px] font-bold uppercase tracking-widest text-outline dark:text-neutral-600">
      <span class="material-symbols-outlined text-sm">auto_awesome</span>
      Generated by Gemini 1.5 Flash
    </p>`);
}

// Export
window.UI = {
  updateScoreCard,
  updateMacros,
  updatePlateChart,
  updateInsightCards,
  updateSuggestions,
  updateRecentLogs,
  setAnalyzeLoading,
  showToast,
  renderHistoryList,
  updatePaginationCount,
  updateInsightsPage,
  formatRelativeDate,
  showCuratedLoading,
  renderCuratedSummary,
  updateCuratedSummary,
};

