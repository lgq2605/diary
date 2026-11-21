# Diary of — installable web app (PWA)

Everything in this folder is the whole site. It has no external dependencies (three.js and the two fonts are included),
so after the first visit it also opens offline.

## Put it online (HTTPS is required for installing)

**GitHub Pages with GitHub Actions (recommended — publish by pushing)**
1. Create a repository and upload *all* files and folders from this folder to the `main` branch, including the hidden
   `.github` folder (it holds the deploy workflow). Keep `icons/` and `fonts/`.
2. Repository → **Settings → Pages → Build and deployment → Source: "GitHub Actions"** (one time).
3. Push. The **Actions** tab runs "Deploy to GitHub Pages": it first checks that the service worker, manifest, icons and every
   file the app needs are present (a broken publish never replaces your working site), then deploys.
4. Your site is at `https://YOUR-NAME.github.io/YOUR-REPO/`. Every later `git push` updates it, and installed apps update by themselves.
If your default branch is `master`, change `branches: [main]` in `.github/workflows/deploy.yml`.
If you keep these files inside a sub-folder of a bigger repo, change `path: .` to that folder (and the check path above it).

**Other hosts:** Netlify / Cloudflare Pages / Vercel — drag this folder in (or connect the repo). No build step.

**Test on your computer first**
```
python3 -m http.server 8080
```
then open http://localhost:8080 in Chrome or Edge (localhost counts as secure).

## Check it works
Chrome/Edge → F12 → **Application** tab → *Manifest* (name, icons, "Installable") and *Service workers* (activated).
Lighthouse → *Progressive Web App* should pass.

## First visit and installing
On a visitor's first visit a small welcome letter appears ("Welcome to Diary of"). **Explore Diary** closes it; clicking the
dimmed background does nothing, so the scene never starts by accident. It is remembered in `localStorage`, so it never
returns — not after a refresh, not after it was dismissed. **Install as an App** appears under it only when the browser
really supports installing (Chrome, Edge, Android Chrome); it opens the browser's own install dialog, and if the visitor
declines it is never offered again. There is no install button anywhere else on the page. Safari and Firefox can still
install from their own menus (iPhone: Share → Add to Home Screen; Safari on Mac: File → Add to Dock).

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
`pwa.js` welcome letter, native install, service worker and updates · `.github/` Pages deploy workflow + safety check · `icons/` 192/512 (+ maskable), Apple and favicon icons ·
`_headers` optional (Netlify/Cloudflare) · `three.min.js`, `fonts/` bundled libraries
