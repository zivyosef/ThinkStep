const fs   = require('fs');
const path = require('path');

const OPENROUTER_API_KEY = process.env.VITE_OPENROUTER_API_KEY || '';
const SUPABASE_URL        = process.env.VITE_SUPABASE_URL        || '';
const SUPABASE_ANON_KEY   = process.env.VITE_SUPABASE_ANON_KEY   || '';

if (!OPENROUTER_API_KEY) console.warn('[generate-config] WARNING: VITE_OPENROUTER_API_KEY not set');
if (!SUPABASE_URL)        console.warn('[generate-config] WARNING: VITE_SUPABASE_URL not set');
if (!SUPABASE_ANON_KEY)   console.warn('[generate-config] WARNING: VITE_SUPABASE_ANON_KEY not set');

const content = `// Auto-generated at build time — do not edit.
window.OPENROUTER_API_KEY = ${JSON.stringify(OPENROUTER_API_KEY)};
window.SUPABASE_URL        = ${JSON.stringify(SUPABASE_URL)};
window.SUPABASE_ANON_KEY   = ${JSON.stringify(SUPABASE_ANON_KEY)};
`;

fs.writeFileSync(path.resolve(__dirname, '../legacy/config.js'), content, 'utf8');
console.log('[generate-config] Wrote legacy/config.js ✓');
