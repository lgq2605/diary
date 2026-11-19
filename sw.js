/* Service worker for "Diary of" — automatic, atomic updates (no version number to bump).

   How it works
   - The app is versioned by a SHA-256 hash of its files. Whenever you publish different files, the hash changes.
   - Pages are always served from ONE complete, consistent cached version (so HTML, scripts and fonts never mix).
   - In the background the worker re-checks the site (conditional requests, bypassing the browser cache),
     downloads a changed version into a separate cache, and only offers it once EVERY file arrived intact.
   - The page then applies it at a safe moment (start screen, app window in the background, or next launch).
     Failed / partial downloads are discarded and the current version keeps working. Offline always works. */
const PREFIX = 'diary-of-';
const META = 'diary-of-meta';                       // tiny cache that records which version is active / staged
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'pwa.js', 'three.min.js',
  'fonts/cormorant-garamond-latin-600-italic.woff2', 'fonts/great-vibes-latin-400-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-16.png'
];
const THROTTLE = 5 * 60 * 1000;                     // background checks at most every 5 min (explicit CHECK ignores this)
let lastCheck = 0, checking = null;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async data => hex(await crypto.subtle.digest('SHA-256', data));
const META_URL = new URL('./__meta', self.location.href).href;

async function getMeta() {
  const r = await (await caches.open(META)).match(META_URL);
  return r ? r.json() : {};
}
async function setMeta(m) {
  await (await caches.open(META)).put(META_URL, new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }));
}
async function cleanup() {                          // keep only the active + staged versions
  const m = await getMeta(), keep = new Set([META, m.active && m.active.name, m.pending && m.pending.name]);
  for (const k of await caches.keys()) if (k.startsWith(PREFIX) && !keep.has(k)) await caches.delete(k);
}
async function broadcast(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })) c.postMessage(msg);
}

/* Download every core file fresh (revalidating with the server). Throws if anything is missing -> nothing is staged. */
async function fetchAll() {
  const files = [];
  for (const u of CORE) {
    const res = await fetch(new Request(u, { cache: 'no-cache' }));
    if (!res || !res.ok) throw new Error('Could not fetch ' + u);
    files.push({ u, res, hash: await sha(await res.clone().arrayBuffer()) });
  }
  const hash = (await sha(new TextEncoder().encode(files.map(f => f.u + ':' + f.hash).join('|')))).slice(0, 16);
  return { files, hash };
}
async function stage({ files, hash }) {             // write a COMPLETE cache for this version, or leave nothing behind
  const name = PREFIX + hash;
  await caches.delete(name);
  try {
    const c = await caches.open(name);
    for (const f of files) await c.put(new Request(f.u), f.res.clone());
  } catch (e) { await caches.delete(name); throw e; }
  return { name, hash };
}

function check(force) {
  const now = Date.now();
  if (checking) return checking;
  if (!force && now - lastCheck < THROTTLE) return Promise.resolve();
  lastCheck = now;
  checking = (async () => {
    try {
      const fresh = await fetchAll(), m = await getMeta();
      if (!m.active) { m.active = await stage(fresh); await setMeta(m); await cleanup(); return; }          // first install
      if (m.active.hash === fresh.hash) {                                                                 // nothing new
        if (m.pending) { m.pending = null; await setMeta(m); await cleanup(); }
        return;
      }
      if (m.pending && m.pending.hash === fresh.hash) { await broadcast({ type: 'UPDATE_READY' }); return; } // already staged
      m.pending = await stage(fresh); await setMeta(m); await cleanup();
      await broadcast({ type: 'UPDATE_READY' });
    } catch (e) { /* offline or partial download: keep the current version and try again later */ }
    finally { checking = null; }
  })();
  return checking;
}
async function apply() {                            // switch to the staged version (instant; it is already complete)
  const m = await getMeta();
  if (!m.pending) return false;
  m.active = m.pending; m.pending = null;
  await setMeta(m); await cleanup();
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await check(true);
    const m = await getMeta();
    if (!m.active) throw new Error('Pre-cache incomplete');   // fail the install so the browser retries later
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => { event.waitUntil(Promise.all([self.clients.claim(), cleanup()])); });

self.addEventListener('message', event => {
  const type = event.data && event.data.type, src = event.source;
  event.waitUntil((async () => {
    if (type === 'HELLO') {
      const m = await getMeta();
      if (src) src.postMessage({ type: m.pending ? 'UPDATE_READY' : 'UP_TO_DATE' });
      await check(false);
    } else if (type === 'CHECK') await check(true);
    else if (type === 'APPLY') await broadcast({ type: (await apply()) ? 'APPLIED' : 'UP_TO_DATE' });
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                // never touch other sites
  const nav = req.mode === 'navigate';
  if (nav) event.waitUntil(check(false));                         // every launch quietly looks for a new version
  event.respondWith((async () => {
    let m = await getMeta();
    if (nav && m.pending && (await self.clients.matchAll({ type: 'window' })).length === 0) { await apply(); m = await getMeta(); }   // fresh launch: adopt the staged update first
    const cache = m.active ? await caches.open(m.active.name) : null;
    const hit = cache && await cache.match(nav ? './index.html' : req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
