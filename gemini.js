// gemini.js — Google Gemini AI for personalized nutrition summaries

const GEMINI_KEY   = 'AIzaSyBKNbhUTL2ztZCK1ZwohuCci36w-nxAS_o';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

/**
 * Generate a personalized nutrition summary using Gemini 1.5 Flash.
 * @param {object} stats - from Storage.getInsightStats()
 * @returns {Promise<string>} - 2-3 sentence HTML string
 */
async function generateCuratedSummary(stats) {
  const { averageScore, trend, totalMeals, weeklyMeals, weeklyAvg, lastWeekAvg, dailyAvgs, windowDays } = stats;

  // Build a context block for Gemini
  const activeDays  = dailyAvgs.filter(d => d.score !== null);
  const bestDay     = activeDays.sort((a, b) => b.score - a.score)[0];
  const worstDay    = activeDays.sort((a, b) => a.score - b.score)[0];
  const periodLabel = windowDays === 30 ? 'last 30 days' : 'last 7 days';

  const context = `
User nutrition data (${periodLabel}):
- Total meals logged: ${totalMeals}
- Average nutrition score this period: ${averageScore}/100
- Average score this period: ${weeklyAvg}/100
- Average score previous period: ${lastWeekAvg || 'N/A'}/100
- Trend vs previous period: ${trend > 0 ? `+${trend} (improving)` : trend < 0 ? `${trend} (declining)` : 'stable'}
- Meals this period: ${weeklyMeals.length}
${bestDay  ? `- Best scoring day: ${bestDay.day} (${bestDay.score}/100)` : ''}
${worstDay ? `- Lowest scoring day: ${worstDay.day} (${worstDay.score}/100)` : ''}
`.trim();

  const prompt = `You are a clinical nutrition AI assistant inside an app called "Debug the Diet". 
Given this user's nutrition tracking data, write a concise, personalized 2-3 sentence summary.

${context}

Rules:
- Be specific to their actual numbers (mention the score, trend, meal count)
- Give ONE actionable recommendation
- Tone: clinical but encouraging, like a nutrition coach
- DO NOT use markdown formatting, asterisks, or headers
- Output plain text only, 2-3 sentences max`;

  const res = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:     0.7,
        maxOutputTokens: 180,
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');

  return text.trim();
}

window.Gemini = { generateCuratedSummary };
