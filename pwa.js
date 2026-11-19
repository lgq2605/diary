/* PWA support for "Diary of": service worker + a real "Install App" button.
   Uses the browser's native install prompt (beforeinstallprompt) where it exists and shows
   clear manual steps where it does not (Safari, Firefox, ...). Independent of the 3D scene code. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const btn = $('install-btn'), label = btn && btn.querySelector('span'), panel = $('install-panel'),
        body = $('ip-body'), title = $('ip-title'), toast = $('install-toast'), closeBtn = $('ip-close');
  if (!btn || !panel) return;

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  const isEdge = /Edg(e|A|iOS)?\//.test(ua);
  const isChromium = /Chrome|CriOS|Chromium/i.test(ua) && !isEdge && !/OPR\//.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|FxiOS|Edg|OPR\//i.test(ua);
  const isMac = /Macintosh/.test(ua) && !isIOS;
  const KEY = 'diary-of-installed';

  const isStandalone = () =>
    ['standalone', 'window-controls-overlay', 'minimal-ui'].some(m => matchMedia('(display-mode: ' + m + ')').matches) ||
    navigator.standalone === true;

  let deferred = null;     // the browser's install prompt, once it offers one
  let installed = false;   // true after the app was installed (this session or earlier)
  let lastFocus = null;

  /* ---------- button state ---------- */
  function render() {
    if (isStandalone()) { btn.hidden = true; return; }       // already running as the installed app
    btn.hidden = false;
    btn.disabled = false;
    btn.dataset.state = installed ? 'installed' : deferred ? 'ready' : 'manual';
    label.textContent = installed ? 'App Installed' : 'Install App';
    btn.setAttribute('aria-label', installed ? 'Diary of is installed. Show how to open it' : 'Install Diary of as an app');
  }

  function say(text) {
    toast.textContent = text; toast.classList.add('on');
    clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('on'), 4200);
  }

  /* ---------- manual instructions ---------- */
  function steps() {
    if (installed) {
      return ['Diary of is installed on this device.',
        ['Open it from your <b>desktop</b>, <b>Start menu / Launchpad</b>, or <b>home screen</b> — it opens in its own window without the browser bar.',
         'In Chrome or Edge you can also use the <b>Open in app</b> icon at the right end of the address bar.']];
    }
    if (!isSecureContext) {
      return ['This page is not served over HTTPS.',
        ['Installing needs a secure address. Open the hosted <b>https://</b> version of the site (or <b>http://localhost</b> while testing), then try again.']];
    }
    if (isIOS) {
      return ['Add Diary of to your Home Screen.',
        ['Tap the <b>Share</b> button' + (isSafari ? '' : ' (if you do not see it, open this page in <b>Safari</b> first)') + '.',
         'Scroll down and choose <b>Add to Home Screen</b>, then tap <b>Add</b>.',
         'Open the new <b>Diary</b> icon — it launches full screen like an app.']];
    }
    if (isMac && isSafari) {
      return ['Add Diary of to your Dock.',
        ['In the menu bar choose <b>File → Add to Dock…</b> (Safari 17 or newer).', 'Click <b>Add</b>. Open it any time from the Dock or Launchpad.']];
    }
    if (isFirefox) {
      return isAndroid
        ? ['Install from Firefox for Android.', ['Open the <b>⋮ menu</b>.', 'Tap <b>Install</b> (or <b>Add to Home screen</b>).']]
        : ['Firefox on desktop cannot install web apps.', ['Open this page in <b>Google Chrome</b> or <b>Microsoft Edge</b>, then click <b>Install App</b> again.']];
    }
    if (isEdge) {
      return ['Install from Microsoft Edge.',
        ['Click the <b>Install</b> icon at the right end of the address bar, or open <b>⋯ → Apps → Install this site as an app</b>.', 'Confirm with <b>Install</b>. You can pin it to the taskbar and Start menu.']];
    }
    if (isChromium) {
      return isAndroid
        ? ['Install from Chrome on Android.', ['Open the <b>⋮ menu</b>.', 'Tap <b>Install app</b> (or <b>Add to Home screen</b>).']]
        : ['Install from Google Chrome.',
           ['Click the <b>Install</b> icon at the right end of the address bar, or open <b>⋮ → Cast, save and share → Install page as app…</b>.',
            'Confirm with <b>Install</b>. The app appears on your desktop / Start menu and opens in its own window.',
            'No install icon? Reload the page once, or check whether it is already installed.']];
    }
    return ['Install this page as an app.', ['Look for <b>Install</b> or <b>Add to Home Screen</b> in your browser’s menu. Chrome and Edge give the most complete app experience.']];
  }
  function openPanel() {
    const [head, list] = steps();
    title.textContent = installed ? 'Diary of is installed' : 'Install Diary of';
    body.innerHTML = '<p>' + head + '</p><ol>' + list.map(s => '<li>' + s + '</li>').join('') + '</ol>';
    lastFocus = document.activeElement; panel.hidden = false; closeBtn.focus();
  }
  function closePanel() { panel.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }

  /* ---------- events ---------- */
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    if (installed) return openPanel();
    if (deferred) {                                          // the real browser install dialog
      const prompt = deferred; deferred = null; render();
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice && choice.outcome === 'accepted') say('Installing Diary of…');
        else say('You can install it any time from this button.');
      } catch (err) { openPanel(); }
      return;
    }
    openPanel();
  });
  closeBtn.addEventListener('click', e => { e.stopPropagation(); closePanel(); });
  panel.addEventListener('click', e => { if (e.target === panel) closePanel(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });

  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; render(); });
  addEventListener('appinstalled', () => {
    deferred = null; installed = true;
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    render(); say('Diary of is installed. Open it from your apps.');
  });
  try { matchMedia('(display-mode: standalone)').addEventListener('change', render); } catch (e) {}

  /* remember an earlier install, and ask the browser where it can */
  try { if (localStorage.getItem(KEY) === '1') installed = true; } catch (e) {}
  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then(apps => { if (apps && apps.length) { installed = true; render(); } }).catch(() => {});
  }
  render();

  /* ---------- service worker + automatic updates (needs HTTPS or localhost) ----------
     The worker downloads new versions in the background and stages them completely. This page decides WHEN to
     switch, so a user is never interrupted:
       - on the start screen (nothing to lose)            -> switches right away
       - app window hidden / minimised for a while        -> switches silently
       - otherwise                                         -> waits; the next launch always opens the newest version
     Hooks for the app:  window.pwaIsIdle()  (true on the start screen)
                         window.pwaUnsaved() (return true while the user has unsaved work -> update waits)
                         window.PWA.reload   (override to customise how the page reloads)                      */
  const PWA = window.PWA = window.PWA || {};
  PWA.config = Object.assign({ awayReloadMs: 60000, checkEveryMs: 30 * 60 * 1000, minGapMs: 10 * 60 * 1000 }, PWA.config);
  PWA.reload = PWA.reload || (() => location.reload());

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
