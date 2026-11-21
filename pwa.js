/* PWA support for "Diary of": a first-visit welcome letter (with an optional native "Install as an App" action),
   a service worker and automatic updates. Independent of the 3D scene code. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const PWA = window.PWA = window.PWA || {};
  PWA.config = Object.assign({ welcomeDelayMs: 900, awayReloadMs: 60000, checkEveryMs: 30 * 60 * 1000, minGapMs: 10 * 60 * 1000 }, PWA.config);
  PWA.reload = PWA.reload || (() => location.reload());
  PWA.welcomeOpen = false;

  /* ---------- first-visit welcome letter ---------- */
  const root = $('welcome'), explore = $('w-explore'), inst = $('w-install'), appEl = $('app');
  const KEY = 'diary-of-welcomed', DECLINED = 'diary-of-install-declined', INSTALLED = 'diary-of-installed';
  const mem = {};                                           // last resort if the browser blocks storage
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } };
  const isStandalone = () =>
    ['standalone', 'window-controls-overlay', 'minimal-ui'].some(m => matchMedia('(display-mode: ' + m + ')').matches) ||
    navigator.standalone === true;

  let deferred = null;                                      // the browser's own install prompt, once it offers one
  let installed = get(INSTALLED) === '1', busy = false;
  const canInstall = () => !!deferred && !installed && !busy && get(DECLINED) !== '1' && !isStandalone();
  const renderInstall = () => { if (inst) inst.hidden = !canInstall(); };   // shown only where installing really works

  function open() {
    if (!root || PWA.welcomeOpen) return;
    PWA.welcomeOpen = true; set(KEY, '1');                  // remembered right away: a refresh never shows it again
    renderInstall();
    root.setAttribute('aria-hidden', 'false'); root.classList.add('on');
    setTimeout(() => { if (PWA.welcomeOpen) explore.focus({ preventScroll: true }); }, 350);
  }
  function close() {
    if (!root || !PWA.welcomeOpen) return;
    PWA.welcomeOpen = false;
    root.classList.remove('on'); root.setAttribute('aria-hidden', 'true');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (appEl) { appEl.style.pointerEvents = 'none'; setTimeout(() => { appEl.style.pointerEvents = ''; }, 450); }   // no stray click can start the scene
  }

  if (root) {
    explore.addEventListener('click', e => { e.stopPropagation(); close(); });
    root.addEventListener('click', e => { e.stopPropagation(); });                     // the dimmed background does nothing
    addEventListener('keydown', e => {
      if (!PWA.welcomeOpen) return;
      if (e.key === 'Escape') return close();
      if (e.key === 'Tab') {                                // keep keyboard focus inside the letter
        const f = [explore, inst].filter(b => b && !b.hidden), i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    inst.addEventListener('click', async e => {
      e.stopPropagation();
      if (!canInstall()) return;
      const prompt = deferred; deferred = null; busy = true; renderInstall();
      try {
        await prompt.prompt();                              // the real browser install dialog
        const choice = await prompt.userChoice;
        if (choice && choice.outcome === 'accepted') { installed = true; set(INSTALLED, '1'); busy = false; renderInstall(); close(); }
        else { set(DECLINED, '1'); busy = false; renderInstall(); }                    // declined once: never ask again
      } catch (err) { busy = false; renderInstall(); }
    });
    if (get(KEY) !== '1') {
      const go = () => setTimeout(open, PWA.config.welcomeDelayMs);
      document.readyState === 'complete' ? go() : addEventListener('load', go, { once: true });
    }
  }

  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; renderInstall(); });
  addEventListener('appinstalled', () => { deferred = null; installed = true; set(INSTALLED, '1'); renderInstall(); close(); });
  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then(a => { if (a && a.length) { installed = true; renderInstall(); } }).catch(() => {});
  }

  /* ---------- service worker + automatic updates (needs HTTPS or localhost) ----------
     The worker downloads new versions in the background and stages them completely. This page decides WHEN to
     switch, so a user is never interrupted:
       - on the start screen (nothing to lose)            -> switches right away
       - app window hidden / minimised for a while        -> switches silently
       - otherwise                                         -> waits; the next launch always opens the newest version
     Hooks for the app:  window.pwaIsIdle()  (true on the start screen)
                         window.pwaUnsaved() (return true while the user has unsaved work -> update waits)
                         window.PWA.reload   (override to customise how the page reloads)                      */
  const canWorker = 'serviceWorker' in navigator &&
    (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
  if (!canWorker) return;

  let reg = null, pending = false, applying = false, lastCheck = 0, awayTimer = 0;
  const send = msg => { const w = navigator.serviceWorker.controller || (reg && reg.active); if (w) w.postMessage(msg); };
  const idle = () => typeof window.pwaIsIdle === 'function' ? !!window.pwaIsIdle() : true;
  const unsaved = () => typeof window.pwaUnsaved === 'function' && !!window.pwaUnsaved();

  function apply() {
    let last = 0; try { last = +sessionStorage.getItem('diary-of-reloaded') || 0; } catch (e) {}
    if (Date.now() - last < 15000) return;                  // never reload twice in quick succession (no loops)
    applying = true; send({ type: 'APPLY' });
  }
  function consider() {                                     // is it a safe moment to switch to the staged version?
    if (!pending || applying || unsaved()) return;
    if (idle()) apply();
    else if (document.hidden && !awayTimer) awayTimer = setTimeout(() => {
      awayTimer = 0; if (document.hidden && pending && !unsaved()) apply();
    }, PWA.config.awayReloadMs);
  }
  function check(force) {                                   // ask the browser for a new worker AND the worker for new files
    const now = Date.now();
    if (!force && now - lastCheck < PWA.config.minGapMs) return;
    lastCheck = now;
    if (reg) reg.update().catch(() => {});
    send({ type: 'CHECK' });
  }

  navigator.serviceWorker.addEventListener('message', e => {
    const t = e.data && e.data.type;
    if (t === 'UPDATE_READY') { pending = true; consider(); }
    else if (t === 'APPLIED') {
      if (!applying) return;                                // another window applied; this one keeps running its loaded version
      try { sessionStorage.setItem('diary-of-reloaded', String(Date.now())); } catch (e2) {}
      PWA.reload();
    } else if (t === 'UP_TO_DATE') { pending = false; applying = false; }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) consider();
    else { clearTimeout(awayTimer); awayTimer = 0; check(false); }
  });
  addEventListener('online', () => check(false));
  setInterval(() => check(true), PWA.config.checkEveryMs);

  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })   // always re-fetch sw.js, never from the HTTP cache
      .then(r => { reg = r; return navigator.serviceWorker.ready; })
      .then(r => { reg = r; send({ type: 'HELLO' }); })                       // the worker answers with UPDATE_READY if one is staged
      .catch(err => console.warn('Service worker not registered:', err));
  });
})();
