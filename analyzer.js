// analyzer.js — USDA FoodData Central API integration with weight-based nutrition

const USDA_API_KEY = 'DEMO_KEY'; // Free USDA key — 1000 req/hr
const USDA_SEARCH  = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// USDA nutrient IDs (stable across all food types)
const NUTRIENT = {
  protein:  1003,
  fat:      1004,
  carbs:    1005,
  calories: 1008,
  fiber:    1079,
  sugar:    2000,
  sodium:   1093,
};

// Session-level cache to avoid repeat API calls
const _cache = {};

/* ─────────────────────────────────────────────
   1.  PARSE MEAL INPUT
   Accepts comma or newline separated entries.
   Each entry: "chicken 150g" | "150g chicken" | "chicken" (default 100g)
───────────────────────────────────────────── */
function parseMealInput(raw) {
  const parts = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const items = [];

  for (const part of parts) {
    let name = part;
    let grams = 100; // default weight

    // Try: "chicken 150g" or "chicken 150"
    const tailMatch = name.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*g?$/i);
    // Try: "150g chicken" or "150 chicken"
    const headMatch = name.match(/^(\d+(?:\.\d+)?)\s*g?\s+(.+)$/i);

    if (tailMatch) {
      name  = tailMatch[1];
      grams = parseFloat(tailMatch[2]);
    } else if (headMatch) {
      grams = parseFloat(headMatch[1]);
      name  = headMatch[2];
    }

    // Sanitize name
    name = name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (name.length >= 2) items.push({ name, grams });
  }

  return items; // [{name, grams}, ...]
}

/* ─────────────────────────────────────────────
   2.  USDA API — look up a single food (per 100g)
   Tries multiple strategies before giving up.
───────────────────────────────────────────── */
async function lookupFood(foodName) {
  const key = foodName.trim().toLowerCase();
  if (_cache[key]) return _cache[key];

  /** Hit USDA with a query string and optional dataType filter */
  async function tryQuery(query, dataType = null) {
    let url = `${USDA_SEARCH}?api_key=${USDA_API_KEY}` +
      `&query=${encodeURIComponent(query)}&pageSize=3`;
    if (dataType) url += `&dataType=${encodeURIComponent(dataType)}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.foods?.[0] ?? null;
  }

  /** Parse nutrients from a USDA food object */
  function extractNutrients(food) {
    if (!food) return null;
    const get = (id) => {
      const n = food.foodNutrients?.find(fn => fn.nutrientId === id);
      return n ? Math.max(0, n.value || 0) : 0;
    };
    const sodiumMg = get(NUTRIENT.sodium);
    return {
      description: food.description || foodName,
      protein:     get(NUTRIENT.protein),
      carbs:       get(NUTRIENT.carbs),
      fat:         get(NUTRIENT.fat),
      calories:    get(NUTRIENT.calories),
      fiber:       get(NUTRIENT.fiber),
      sugar:       get(NUTRIENT.sugar),
      sodium:      sodiumMg,
      sodiumHigh:  sodiumMg > 600,
    };
  }

  // Strategy 1: strict databases (most nutritionally accurate)
  let food = await tryQuery(key, 'Foundation,SR Legacy');

  // Strategy 2: all USDA databases (Survey, Branded, etc.)
  if (!food) food = await tryQuery(key);

  // Strategy 3: use only the first meaningful word (handles "white rice", "brown rice", etc.)
  if (!food) {
    const firstWord = key.split(' ').find(w => w.length > 2);
    if (firstWord && firstWord !== key) food = await tryQuery(firstWord);
  }

  const result = extractNutrients(food);
  if (result) _cache[key] = result;
  return result;
}

/* ─────────────────────────────────────────────
   3.  CALCULATE — fetch all foods in parallel, scale by weight
   Returns { totals, breakdown, notFound }
───────────────────────────────────────────── */
async function calculateNutrition(foodItems) {
  const results = await Promise.allSettled(
    foodItems.map(({ name, grams }) =>
      lookupFood(name).then(per100g => {
        if (!per100g) return null;
        const s = grams / 100;
        return {
          name:        per100g.description,
          inputName:   name,
          grams,
          protein:     per100g.protein   * s,
          carbs:       per100g.carbs     * s,
          fat:         per100g.fat       * s,
          calories:    per100g.calories  * s,
          fiber:       per100g.fiber     * s,
          sugar:       per100g.sugar     * s,
          sodiumFlags: per100g.sodiumHigh ? 1 : 0,
          processedCount: 0,
        };
      })
    )
  );

  const breakdown  = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  const notFound = foodItems
    .filter((_, i) => results[i].status === 'rejected' || !results[i].value)
    .map(f => f.name);

  // Aggregate totals
  const totals = {
    protein: 0, carbs: 0, fat: 0, calories: 0,
    fiber: 0, sugar: 0, sodiumFlags: 0, processedCount: 0,
  };
  for (const b of breakdown) {
    totals.protein       += b.protein;
    totals.carbs         += b.carbs;
    totals.fat           += b.fat;
    totals.calories      += b.calories;
    totals.fiber         += b.fiber;
    totals.sugar         += b.sugar;
    totals.sodiumFlags   += b.sodiumFlags;
    totals.processedCount += b.processedCount;
  }

  // Round to 1 decimal
  for (const k of ['protein', 'carbs', 'fat', 'calories', 'fiber', 'sugar']) {
    totals[k] = Math.round(totals[k] * 10) / 10;
  }

  return { totals, breakdown, notFound };
}

// Export
window.Analyzer = { parseMealInput, lookupFood, calculateNutrition };
