// Pre-deploy safety check (no dependencies). Fails the workflow if the PWA would be broken:
// a missing pre-cached file makes the service worker's install fail, so nobody could install or update.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(process.argv[2] || '.');
const errors = [];
const read = f => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { errors.push('missing file: ' + f); return ''; } };
const exists = f => fs.existsSync(path.join(root, f));
const syntax = (code, name) => { try { new vm.Script(code, { filename: name }); } catch (e) { errors.push(`syntax error in ${name}: ${e.message}`); } };

const sw = read('sw.js'), pwa = read('pwa.js'), html = read('index.html'), manifestText = read('manifest.webmanifest');
syntax(sw, 'sw.js'); syntax(pwa, 'pwa.js');
(html.match(/<script>([\s\S]*?)<\/script>/g) || []).forEach((s, i) => syntax(s.replace(/^<script>|<\/script>$/g, ''), 'index.html inline script #' + (i + 1)));

const m = sw.match(/const CORE = (\[[\s\S]*?\]);/);
if (!m) errors.push('sw.js: could not find the CORE file list');
else for (const f of eval(m[1])) if (f !== './' && !exists(f)) errors.push('sw.js pre-caches a file that does not exist: ' + f);

let manifest = {};
try { manifest = JSON.parse(manifestText); } catch (e) { errors.push('manifest.webmanifest is not valid JSON'); }
for (const k of ['name', 'short_name', 'start_url', 'display', 'icons']) if (manifest[k] === undefined) errors.push('manifest is missing "' + k + '"');
if (manifest.display && manifest.display !== 'standalone') errors.push('manifest display should be "standalone"');
for (const i of manifest.icons || []) {
  const f = i.src; if (!exists(f)) { errors.push('manifest icon missing: ' + f); continue; }
  const b = fs.readFileSync(path.join(root, f));
  if (b.slice(1, 4).toString() !== 'PNG') { errors.push('icon is not a PNG: ' + f); continue; }
  const want = i.sizes.split('x').map(Number);
  if (b.readUInt32BE(16) !== want[0] || b.readUInt32BE(20) !== want[1]) errors.push(`icon ${f} is ${b.readUInt32BE(16)}x${b.readUInt32BE(20)} but the manifest says ${i.sizes}`);
}
for (const need of [[192, 'any'], [512, 'any']]) if (!(manifest.icons || []).some(i => i.sizes === need[0] + 'x' + need[0] && String(i.purpose || 'any').includes('any'))) errors.push('manifest needs a ' + need[0] + 'x' + need[0] + ' icon');

if (!/<link rel="manifest" href="manifest\.webmanifest">/.test(html)) errors.push('index.html does not link the manifest');
const htmlNoData = html.replace(/url\("data:[^"]*"\)/g, '');
const refs = [...htmlNoData.matchAll(/(?:src|href)="([^"#]+)"/g)].map(x => x[1]).concat([...htmlNoData.matchAll(/url\((?!["']?data:)([^)]+)\)/g)].map(x => x[1]));
for (const r of refs.filter(r => !/^(https?:|data:)/.test(r))) if (!exists(r)) errors.push('index.html references a missing file: ' + r);

if (errors.length) { console.error('PWA check FAILED:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log('PWA check passed: service worker, manifest, icons and every referenced file are in place.');
