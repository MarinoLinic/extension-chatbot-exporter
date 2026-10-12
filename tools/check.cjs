const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '..'), manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const dirs = ['src', 'tests', 'tools'];
const files = dirs.flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(f => /\.(js|cjs)$/.test(f)).map(f => path.join(root, dir, f)));
for (const file of files) cp.execFileSync(process.execPath, ['--check', file]);
const assets = [manifest.action.default_popup, manifest.background.service_worker, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(c => c.js)];
for (const file of assets) if (!fs.existsSync(path.join(root, file))) throw new Error('Missing extension file: ' + file);
if (manifest.content_scripts.some(c => c.matches.includes('<all_urls>'))) throw new Error('Unexpected broad host access');
console.log(`${files.length} JavaScript files passed syntax checks; manifest assets and scoped hosts verified.`);
