// gemini.js — Groq-powered (Llama 3.3 70B) personalized nutrition summaries

const GROQ_KEY_INSIGHTS   = (window.CONFIG && window.CONFIG.GROQ_KEY) || '';
const GROQ_URL_INSIGHTS = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_INSIGHTS = 'llama-3.3-70b-versatile';

/**
 * Generate a personalized nutrition summary using Groq (Llama 3.3 70B).
 * @param {object} stats - from Storage.getInsightStats() or getDailyStats()
 * @returns {Promise<string>} - 2-3 sentence plain text summary
 */
async function generateCuratedSummary(stats) {
  const { averageScore, trend, totalMeals, weeklyMeals, weeklyAvg, lastWeekAvg, dailyAvgs, windowDays } = stats;

  const activeDays  = (dailyAvgs || []).filter(d => d.score !== null);
  const bestDay     = [...activeDays].sort((a, b) => b.score - a.score)[0];
  const worstDay    = [...activeDays].sort((a, b) => a.score - b.score)[0];
  const periodLabel = windowDays === 1 ? 'today' : windowDays === 30 ? 'last 30 days' : 'last 7 days';

  const context = `
User nutrition data (${periodLabel}):
- Total meals logged: ${totalMeals}
- Average nutrition score: ${averageScore}/100
- Average score this period: ${weeklyAvg}/100
- Average score previous period: ${lastWeekAvg || 'N/A'}/100
- Trend vs previous period: ${trend > 0 ? `+${trend} (improving)` : trend < 0 ? `${trend} (declining)` : 'stable'}
- Meals this period: ${(weeklyMeals || []).length}
${bestDay  ? `- Best scoring day: ${bestDay.day} (${bestDay.score}/100)` : ''}
${worstDay ? `- Lowest scoring day: ${worstDay.day} (${worstDay.score}/100)` : ''}
`.trim();

  const systemMsg = `You are a clinical nutrition AI assistant inside an app called "Debug the Diet".
Rules:
- Write a concise, personalized 2-3 sentence summary about the user's nutrition data.
- Be specific to their actual numbers (mention the score, trend, meal count).
- Give ONE actionable recommendation at the end.
- Tone: clinical but encouraging, like a nutrition coach.
- DO NOT use markdown formatting, asterisks, headers, or bullet points.
- Output plain text only, 2-3 sentences max.`;

  const userMsg = `Here is the user's nutrition tracking data:\n\n${context}\n\nWrite the summary now.`;

  const res = await fetch(GROQ_URL_INSIGHTS, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + GROQ_KEY_INSIGHTS,
    },
    body: JSON.stringify({
      model: GROQ_MODEL_INSIGHTS,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg   },
      ],
      temperature:  0.6,
      max_tokens:   180,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq API ${res.status}: ${err?.error?.message || 'Unknown error'}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty Groq response');

  return text.trim();
}

window.Gemini = { generateCuratedSummary };
