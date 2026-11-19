# Diary of — installable web app (PWA)

Everything in this folder is the whole site. It has no external dependencies (three.js and the two fonts are included),
so after the first visit it also opens offline.

## Put it online (HTTPS is required for installing)

**GitHub Pages (free, HTTPS automatic)**
1. Create a repository and upload *all* files and folders from this folder (keep `icons/` and `fonts/`; keep the hidden `.nojekyll` file).
2. Repository → Settings → Pages → "Deploy from a branch" → `main` / `(root)` → Save.
3. Open `https://YOUR-NAME.github.io/YOUR-REPO/` — the Install App button appears there.

**Netlify / Cloudflare Pages / Vercel**: drag this folder into the dashboard (or connect the repo). No build step.

**Test on your computer first**
```
python3 -m http.server 8080
```
then open http://localhost:8080 in Chrome or Edge (localhost counts as secure).

## Check it works
Chrome/Edge → F12 → **Application** tab → *Manifest* (name, icons, "Installable") and *Service workers* (activated).
Lighthouse → *Progressive Web App* should pass.

## How people install it
- **Chrome / Edge (desktop and Android):** click **Install App** (top-right) → the browser's own install dialog.
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*. **Safari on Mac:** File → *Add to Dock*.
- **Firefox desktop** cannot install web apps; the button explains this.
After installing, the app has its own icon (desktop, Start menu, taskbar, home screen) and opens in its own window.

## Updates are automatic
Just publish your changed files — there is no version number to bump and nothing to rebuild.
- The app is versioned by a hash of its files. On every launch, when the app comes back to the foreground, when the device
  goes back online, and every 30 minutes, the service worker revalidates the site (bypassing the browser cache).
- If anything changed it downloads the **complete** new version into a separate cache. A failed or partial download is
  discarded and the current version keeps working. Pages, scripts, fonts and icons always come from one consistent version.
- The new version is applied at a safe moment, with no popup: immediately while the start screen is showing,
  silently when the app window has been in the background for about a minute, or on the next launch.
  It never reloads in the middle of someone using the diary.
- `sw.js`, `index.html` and every other file are always re-checked with the server, so GitHub Pages' own caching
  cannot keep old files alive. Installed users keep their icon and never reinstall.

**For Phase 3 (writing in the diary):** the page exposes two hooks so an update can never lose text.
`window.pwaUnsaved = () => hasUnsavedText;` makes the update wait; `window.pwaIsIdle` (already set) says when reloading is free.

**See it working:** open the site, DevTools → Application → *Cache Storage*, change a file on the server, wait or
reopen the app — a new `diary-of-…` cache appears, then replaces the old one.

## Files
`index.html` the site · `manifest.webmanifest` app name, icons, colours, standalone mode · `sw.js` offline cache + automatic updates ·
`pwa.js` install button and service-worker registration · `icons/` 192/512 (+ maskable), Apple and favicon icons ·
`_headers` optional (Netlify/Cloudflare) · `three.min.js`, `fonts/` bundled libraries
