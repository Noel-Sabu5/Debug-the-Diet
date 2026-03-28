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

// ─── Offline nutrition table (per 100g, cooked unless noted) ───────────────
// Used as primary source; USDA API is fallback for unlisted foods.
const OFFLINE_DB = {
  // Grains & Staples
  'rice':            { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3,  fiber: 0.4, sugar: 0.1, sodium: 1   },
  'white rice':      { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3,  fiber: 0.4, sugar: 0.1, sodium: 1   },
  'brown rice':      { calories: 123, protein: 2.7, carbs: 25.6, fat: 0.9,  fiber: 1.8, sugar: 0.4, sodium: 5   },
  'roti':            { calories: 297, protein: 8.9, carbs: 56.5, fat: 3.7,  fiber: 4.2, sugar: 0.5, sodium: 5   },
  'chapati':         { calories: 297, protein: 8.9, carbs: 56.5, fat: 3.7,  fiber: 4.2, sugar: 0.5, sodium: 5   },
  'bread':           { calories: 265, protein: 9.0, carbs: 49.0, fat: 3.2,  fiber: 2.7, sugar: 5.0, sodium: 491 },
  'wheat bread':     { calories: 247, protein: 13.4,carbs: 41.3, fat: 4.2,  fiber: 6.0, sugar: 6.0, sodium: 450 },
  'oats':            { calories: 389, protein: 16.9,carbs: 66.3, fat: 6.9,  fiber: 10.6,sugar: 0.0, sodium: 2   },
  'pasta':           { calories: 158, protein: 5.8, carbs: 31.0, fat: 0.9,  fiber: 1.8, sugar: 0.6, sodium: 1   },
  'noodles':         { calories: 138, protein: 4.5, carbs: 25.0, fat: 2.1,  fiber: 1.0, sugar: 0.5, sodium: 8   },
  'idli':            { calories: 58,  protein: 2.0, carbs: 12.0, fat: 0.1,  fiber: 0.5, sugar: 0.0, sodium: 145 },
  'dosa':            { calories: 168, protein: 3.9, carbs: 30.0, fat: 3.7,  fiber: 1.0, sugar: 0.5, sodium: 12  },
  'poha':            { calories: 333, protein: 6.3, carbs: 76.9, fat: 0.4,  fiber: 1.5, sugar: 0.0, sodium: 10  },
  'upma':            { calories: 154, protein: 3.0, carbs: 22.0, fat: 6.5,  fiber: 1.5, sugar: 0.5, sodium: 200 },

  // Proteins
  'chicken':         { calories: 165, protein: 31.0,carbs: 0.0,  fat: 3.6,  fiber: 0.0, sugar: 0.0, sodium: 74  },
  'chicken breast':  { calories: 165, protein: 31.0,carbs: 0.0,  fat: 3.6,  fiber: 0.0, sugar: 0.0, sodium: 74  },
  'egg':             { calories: 155, protein: 13.0,carbs: 1.1,  fat: 11.0, fiber: 0.0, sugar: 1.1, sodium: 124 },
  'eggs':            { calories: 155, protein: 13.0,carbs: 1.1,  fat: 11.0, fiber: 0.0, sugar: 1.1, sodium: 124 },
  'fish':            { calories: 136, protein: 26.0,carbs: 0.0,  fat: 3.2,  fiber: 0.0, sugar: 0.0, sodium: 70  },
  'salmon':          { calories: 208, protein: 20.4,carbs: 0.0,  fat: 13.4, fiber: 0.0, sugar: 0.0, sodium: 59  },
  'tuna':            { calories: 132, protein: 28.0,carbs: 0.0,  fat: 1.3,  fiber: 0.0, sugar: 0.0, sodium: 50  },
  'paneer':          { calories: 265, protein: 18.3,carbs: 1.2,  fat: 20.8, fiber: 0.0, sugar: 0.0, sodium: 28  },
  'tofu':            { calories: 76,  protein: 8.0, carbs: 1.9,  fat: 4.8,  fiber: 0.3, sugar: 0.6, sodium: 7   },
  'dal':             { calories: 116, protein: 9.0, carbs: 20.0, fat: 0.4,  fiber: 8.0, sugar: 1.8, sodium: 2   },
  'lentils':         { calories: 116, protein: 9.0, carbs: 20.0, fat: 0.4,  fiber: 8.0, sugar: 1.8, sodium: 2   },
  'chickpeas':       { calories: 164, protein: 8.9, carbs: 27.4, fat: 2.6,  fiber: 7.6, sugar: 4.8, sodium: 7   },
  'kidney beans':    { calories: 127, protein: 8.7, carbs: 22.8, fat: 0.5,  fiber: 7.4, sugar: 0.3, sodium: 355 },

  // Vegetables
  'broccoli':        { calories: 34,  protein: 2.8, carbs: 6.6,  fat: 0.4,  fiber: 2.6, sugar: 1.7, sodium: 33  },
  'spinach':         { calories: 23,  protein: 2.9, carbs: 3.6,  fat: 0.4,  fiber: 2.2, sugar: 0.4, sodium: 79  },
  'carrot':          { calories: 41,  protein: 0.9, carbs: 9.6,  fat: 0.2,  fiber: 2.8, sugar: 4.7, sodium: 69  },
  'potato':          { calories: 77,  protein: 2.0, carbs: 17.5, fat: 0.1,  fiber: 2.2, sugar: 0.8, sodium: 6   },
  'sweet potato':    { calories: 86,  protein: 1.6, carbs: 20.1, fat: 0.1,  fiber: 3.0, sugar: 4.2, sodium: 55  },
  'tomato':          { calories: 18,  protein: 0.9, carbs: 3.9,  fat: 0.2,  fiber: 1.2, sugar: 2.6, sodium: 5   },
  'onion':           { calories: 40,  protein: 1.1, carbs: 9.3,  fat: 0.1,  fiber: 1.7, sugar: 4.2, sodium: 4   },

  // Dairy & Fats
  'milk':            { calories: 61,  protein: 3.2, carbs: 4.8,  fat: 3.3,  fiber: 0.0, sugar: 4.8, sodium: 50  },
  'curd':            { calories: 98,  protein: 11.0,carbs: 3.4,  fat: 4.7,  fiber: 0.0, sugar: 3.3, sodium: 364 },
  'yogurt':          { calories: 59,  protein: 10.0,carbs: 3.6,  fat: 0.4,  fiber: 0.0, sugar: 3.2, sodium: 36  },
  'butter':          { calories: 717, protein: 0.9, carbs: 0.1,  fat: 81.1, fiber: 0.0, sugar: 0.1, sodium: 714 },
  'ghee':            { calories: 900, protein: 0.0, carbs: 0.0,  fat: 99.9, fiber: 0.0, sugar: 0.0, sodium: 2   },
  'olive oil':       { calories: 884, protein: 0.0, carbs: 0.0,  fat: 100,  fiber: 0.0, sugar: 0.0, sodium: 2   },

  // Fruits
  'banana':          { calories: 89,  protein: 1.1, carbs: 22.8, fat: 0.3,  fiber: 2.6, sugar: 12.2,sodium: 1   },
  'apple':           { calories: 52,  protein: 0.3, carbs: 13.8, fat: 0.2,  fiber: 2.4, sugar: 10.4,sodium: 1   },
  'mango':           { calories: 60,  protein: 0.8, carbs: 15.0, fat: 0.4,  fiber: 1.6, sugar: 13.7,sodium: 1   },
  'orange':          { calories: 47,  protein: 0.9, carbs: 11.8, fat: 0.1,  fiber: 2.4, sugar: 9.4, sodium: 0   },

  // Nuts & Seeds
  'almonds':         { calories: 579, protein: 21.2,carbs: 21.6, fat: 49.9, fiber: 12.5,sugar: 4.4, sodium: 1   },
  'peanuts':         { calories: 567, protein: 25.8,carbs: 16.1, fat: 49.2, fiber: 8.5, sugar: 4.7, sodium: 18  },
  'quinoa':          { calories: 120, protein: 4.4, carbs: 21.3, fat: 1.9,  fiber: 2.8, sugar: 0.9, sodium: 7   },
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
   2.  Look up a single food (per 100g)
   Strategy 0: offline DB (instant, no API needed)
   Strategy 1: USDA Foundation + SR Legacy
   Strategy 2: All USDA databases
   Strategy 3: First meaningful keyword
───────────────────────────────────────────── */
async function lookupFood(foodName) {
  const key = foodName.trim().toLowerCase();
  if (_cache[key]) return _cache[key];

  /** Wrap offline DB entry into standard shape */
  function fromOffline(entry, label) {
    return {
      description: label,
      protein:  entry.protein,
      carbs:    entry.carbs,
      fat:      entry.fat,
      calories: entry.calories,
      fiber:    entry.fiber,
      sugar:    entry.sugar,
      sodium:   entry.sodium,
      sodiumHigh: entry.sodium > 600,
    };
  }

  // Strategy 0: exact offline match
  if (OFFLINE_DB[key]) {
    const r = fromOffline(OFFLINE_DB[key], key);
    _cache[key] = r;
    return r;
  }

  // Strategy 0b: partial offline match (e.g. "brown rice" → "rice")
  const offlineHit = Object.keys(OFFLINE_DB).find(k => key.includes(k) || k.includes(key));
  if (offlineHit) {
    const r = fromOffline(OFFLINE_DB[offlineHit], offlineHit);
    _cache[key] = r;
    return r;
  }

  /** Hit USDA with a query string and optional dataType filter */
  async function tryQuery(query, dataType = null) {
    try {
      let url = `${USDA_SEARCH}?api_key=${USDA_API_KEY}` +
        `&query=${encodeURIComponent(query)}&pageSize=3`;
      if (dataType) url += `&dataType=${encodeURIComponent(dataType)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data.foods?.[0] ?? null;
    } catch { return null; }
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

  // Strategy 1: strict USDA databases
  let food = await tryQuery(key, 'Foundation,SR Legacy');
  // Strategy 2: all USDA databases
  if (!food) food = await tryQuery(key);
  // Strategy 3: first meaningful word
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
