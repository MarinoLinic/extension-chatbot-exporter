// Explicit allowlist: private fixtures, notes, node_modules and scratch never enter releases.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = ['manifest.json', 'README.md', 'PRIVACY.md', 'AGENTS.md', ...['src', 'assets'].flatMap(dir => fs.readdirSync(path.join(root, dir)).map(f => `${dir}/${f}`))];
const destination = path.join(root, '.local', 'release');
fs.mkdirSync(destination, { recursive: true });
const staging = path.join(destination, 'conversation-exporter-' + Date.now());
fs.mkdirSync(staging);
for (const file of files) { const target = path.join(staging, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, file), target); }
const zip = staging + '.zip';
const quote = s => "'" + s.replace(/'/g, "''") + "'";
const entries = ['manifest.json', 'README.md', 'PRIVACY.md', 'AGENTS.md', 'src', 'assets'].map(file => quote(path.join(staging, file))).join(',');
cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -LiteralPath ${entries} -DestinationPath ${quote(zip)}`]);
console.log('Packaged allowlisted extension files only: ' + zip);
