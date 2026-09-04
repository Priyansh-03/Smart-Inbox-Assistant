// Writes src/env.js from API_BASE_URL for local `ng serve`. No default - fails if unset.
const fs = require('fs');
const url = process.env.API_BASE_URL;
if (!url) {
  console.error('API_BASE_URL is required (set it in the shell / .env.local)');
  process.exit(1);
}
fs.writeFileSync(__dirname + '/../src/env.js', `window.__API_BASE__ = ${JSON.stringify(url)};\n`);
console.log('frontend: API base set to ' + url);
