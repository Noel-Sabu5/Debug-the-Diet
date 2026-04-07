// generate-config.js
// Runs at Netlify build time — reads environment variables and writes config.js
// Never commit real keys. Set them in: Netlify → Site → Environment Variables

const fs = require('fs');

const groqKey = process.env.GROQ_KEY || '';
const usdaKey = process.env.USDA_KEY || '';

if (!groqKey) console.warn('[generate-config] WARNING: GROQ_KEY env var is not set');
if (!usdaKey) console.warn('[generate-config] WARNING: USDA_KEY env var is not set');

const content = `// config.js — AUTO-GENERATED at build time by generate-config.js
// Do not edit manually. Set keys in Netlify environment variables.
window.CONFIG = {
  GROQ_KEY: ${JSON.stringify(groqKey)},
  USDA_KEY: ${JSON.stringify(usdaKey)},
};
`;

fs.writeFileSync('config.js', content, 'utf8');
console.log('[generate-config] config.js written successfully \u2713');
