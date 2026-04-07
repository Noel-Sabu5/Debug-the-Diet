// generate-config.js
// Netlify build script — injects API keys into HTML files AND writes config.js (for local dev)
// Keys come from Netlify environment variables (never committed to git).

const fs   = require('fs');
const path = require('path');

const groqKey = process.env.GROQ_KEY || '';
const usdaKey = process.env.USDA_KEY || '';

if (!groqKey) console.warn('[generate-config] WARNING: GROQ_KEY env var is not set');
if (!usdaKey) console.warn('[generate-config] WARNING: USDA_KEY env var is not set');

// 1. Write config.js for any direct requests
const configContent = `window.CONFIG = { GROQ_KEY: ${JSON.stringify(groqKey)}, USDA_KEY: ${JSON.stringify(usdaKey)} };\n`;
fs.writeFileSync('config.js', configContent, 'utf8');
console.log('[generate-config] config.js written ✓');

// 2. Inject an inline <script> into every HTML file to guarantee the config loads
//    (fallback in case config.js can't be fetched separately on Netlify)
const inlineScript = `<script>window.CONFIG = window.CONFIG || { GROQ_KEY: ${JSON.stringify(groqKey)}, USDA_KEY: ${JSON.stringify(usdaKey)} };</script>`;

const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
htmlFiles.forEach(file => {
  let html = fs.readFileSync(file, 'utf8');
  // Replace the external config.js script tag with an inline version
  const replaced = html.replace(
    /<script src="config\.js"[^>]*><\/script>/,
    inlineScript
  );
  if (replaced !== html) {
    fs.writeFileSync(file, replaced, 'utf8');
    console.log(`[generate-config] Injected inline config into ${file} ✓`);
  }
});

console.log('[generate-config] Done ✓');
