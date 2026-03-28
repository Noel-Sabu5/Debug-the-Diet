// scoring.js — Health score calculation & insight generation

/**
 * Calculate a 0-100 health score from nutrition data and token metadata.
 */
function calculateScore(nutrition, tokens, tokenCount) {
  let score = 60; // baseline

  // --- Protein bonus ---
  if (nutrition.protein >= 20) score += 10;
  else if (nutrition.protein >= 10) score += 5;
  else score -= 8;

  // --- Fiber bonus ---
  if (nutrition.fiber >= 5) score += 8;
  else if (nutrition.fiber >= 2) score += 4;
  else score -= 4;

  // --- Sugar penalty ---
  if (nutrition.sugar > 30) score -= 18;
  else if (nutrition.sugar > 15) score -= 10;
  else if (nutrition.sugar > 8) score -= 5;

  // --- Fat scoring ---
  if (nutrition.fat > 40) score -= 12;
  else if (nutrition.fat > 25) score -= 5;
  else if (nutrition.fat < 5 && tokenCount > 1) score -= 3; // too little fat

  // --- Processed food penalty ---
  if (nutrition.processedCount > 0) score -= nutrition.processedCount * 10;

  // --- Sodium penalty ---
  if (nutrition.sodiumFlags > 0) score -= nutrition.sodiumFlags * 8;

  // --- Variety bonus ---
  if (tokenCount >= 4) score += 7;
  else if (tokenCount >= 2) score += 3;

  // --- Calorie density penalty ---
  if (nutrition.calories > 900) score -= 10;
  else if (nutrition.calories > 600) score -= 5;
  else if (nutrition.calories > 0 && nutrition.calories < 100) score -= 5; // too little

  // --- Carb balance ---
  const total = nutrition.protein + nutrition.carbs + nutrition.fat;
  if (total > 0) {
    const carbRatio = nutrition.carbs / total;
    if (carbRatio > 0.7) score -= 8;
    else if (carbRatio < 0.15) score -= 3;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Generate rating label from score.
 */
function getRating(score) {
  if (score >= 85) return { label: 'Excellent', colorClass: 'bg-green-100 dark:bg-primary-fixed/10 text-green-700 dark:text-primary-fixed' };
  if (score >= 70) return { label: 'Good', colorClass: 'bg-blue-100 dark:bg-secondary-fixed/10 text-blue-700 dark:text-secondary-fixed-dim' };
  if (score >= 50) return { label: 'Average', colorClass: 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' };
  return { label: 'Poor', colorClass: 'bg-red-100 dark:bg-tertiary-fixed/10 text-red-700 dark:text-tertiary-fixed' };
}

/**
 * Generate score badge label (used in biometric card).
 */
function getScoreBadge(score) {
  if (score >= 85) return 'OPTIMAL RANGE';
  if (score >= 70) return 'GOOD RANGE';
  if (score >= 50) return 'NEEDS WORK';
  return 'BELOW TARGET';
}

/**
 * Generate clinical issues and suggestions from nutrition data.
 * Returns { issues: [{icon, title, text}], suggestions: [{icon, text}] }
 */
function generateInsights(nutrition, tokens) {
  const issues = [];
  const suggestions = [];

  // --- Issues ---
  if (nutrition.sugar > 30) {
    issues.push({ icon: 'warning', title: 'High Sugar Alert', text: 'Sugar content is significantly elevated. Prolonged high intake can impair metabolic function.', type: 'error' });
  } else if (nutrition.sugar > 15) {
    issues.push({ icon: 'warning', title: 'Moderate Sugar', text: 'Sugar intake is above the ideal single-meal threshold. Monitor daily cumulative intake.', type: 'error' });
  }

  if (nutrition.sodiumFlags > 0) {
    issues.push({ icon: 'warning', title: 'Sodium Alert', text: `Sodium content is elevated. High sodium intake increases cardiovascular risk markers.`, type: 'error' });
  }

  if (nutrition.fat > 35) {
    issues.push({ icon: 'warning', title: 'High Lipid Load', text: 'Total fat exceeds optimal single-meal threshold. Consider lighter cooking methods.', type: 'error' });
  }

  if (nutrition.processedCount > 0) {
    issues.push({ icon: 'warning', title: 'Processed Ingredients', text: `${nutrition.processedCount} processed item(s) detected. These typically contain additives and refined macros.`, type: 'error' });
  }

  if (nutrition.protein < 8 && tokens.length > 1) {
    issues.push({ icon: 'info', title: 'Low Protein', text: 'Protein intake is below optimal for satiety and muscle protein synthesis.', type: 'info' });
  }

  if (nutrition.fiber < 2) {
    issues.push({ icon: 'info', title: 'Low Fiber', text: 'Dietary fiber is minimal. Low fiber intake slows gut transit and raises GI inflammation markers.', type: 'info' });
  }

  // --- Positive issues ---
  if (nutrition.protein >= 20) {
    issues.push({ icon: 'check_circle', title: 'Strong Protein Profile', text: 'Amino acid density supports muscle protein synthesis and metabolic efficiency.', type: 'success' });
  }

  if (nutrition.fiber >= 5) {
    issues.push({ icon: 'check_circle', title: 'Excellent Fiber Intake', text: 'High fiber content supports gut microbiome diversity and satiety signaling.', type: 'success' });
  }

  // --- Suggestions ---
  if (nutrition.fiber < 5) {
    suggestions.push({ icon: 'trending_up', text: 'Add leafy greens or legumes to increase fiber content by 3–5g per serving.' });
  }
  if (nutrition.protein < 15) {
    suggestions.push({ icon: 'fitness_center', text: 'Incorporate a lean protein source (e.g., chicken, tofu, or eggs) to hit the 20g+ threshold.' });
  }
  if (nutrition.sodiumFlags > 0) {
    suggestions.push({ icon: 'water_drop', text: 'Increase hydration post-meal (300–400ml) to offset elevated sodium load.' });
  }
  if (nutrition.sugar > 15) {
    suggestions.push({ icon: 'reorder', text: 'Swap refined sugars for whole fruit or complex carbohydrates to stabilize blood glucose.' });
  }
  if (tokens.length < 3) {
    suggestions.push({ icon: 'add_circle', text: 'Diversify meal composition with 2–3 additional whole-food components for micronutrient coverage.' });
  }
  if (nutrition.fat > 30) {
    suggestions.push({ icon: 'eco', text: 'Opt for baking or steaming over frying to reduce total lipid intake by ~40%.' });
  }

  // Always have at least one suggestion
  if (suggestions.length === 0) {
    suggestions.push({ icon: 'check_circle', text: 'Your meal composition is well-optimized. Maintain this nutrient balance across all daily meals.' });
  }

  return { issues: issues.slice(0, 4), suggestions: suggestions.slice(0, 3) };
}

/**
 * Calculate macro percentages for chart display.
 * Returns { proteinPct, carbsPct, fatPct }
 */
function getMacroPercentages(nutrition) {
  const total = nutrition.protein + nutrition.carbs + nutrition.fat;
  if (total === 0) return { proteinPct: 33, carbsPct: 34, fatPct: 33 };
  return {
    proteinPct: Math.round((nutrition.protein / total) * 100),
    carbsPct:   Math.round((nutrition.carbs   / total) * 100),
    fatPct:     Math.round((nutrition.fat     / total) * 100),
  };
}

// Export
window.Scoring = { calculateScore, getRating, getScoreBadge, generateInsights, getMacroPercentages };
