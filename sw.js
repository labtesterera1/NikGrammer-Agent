// ===== Grammar AI — Service Worker =====
// Strategy:
//   • HTML  → NETWORK-FIRST  (always check for updates; cache only as offline fallback)
//   • Other → CACHE-FIRST    (icons, manifest — fine to serve cached)
// This means new index.html pushes to GitHub Pages are picked up
// on the next page load instead of being stuck in cache.

const VERSION = 'v2';                    // ← Bump this each time you ship a meaningful change
const CACHE   = 'grammar-ai-' + VERSION;

const PRECACHE = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install ────────────────────────────────────────────────
self.addEventListener('install', event => {
  // Activate new SW immediately on install (don't wait for old SW to release)
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.all(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] precache skipped:', url, err.message))
        )
      );
    })
  );
});

// ── Activate ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept cross-origin API calls
  if (
    url.hostname.includes('groq.com')        ||
    url.hostname.includes('cerebras.ai')     ||
    url.hostname.includes('googleapis.com')  ||
    url.hostname.includes('mistral.ai')      ||
    url.hostname.includes('workers.dev')
  ) return;

  // ── HTML / navigation: NETWORK-FIRST ─────────────────────
  // Always try the network so new deploys are picked up immediately.
  // Fall back to cache only if offline.
  const isHTML = req.mode === 'navigate' ||
                 req.destination === 'document' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('/');

  if (isHTML) {
    event.respondWith(
      fetch(req).then(res => {
        // Update cache copy in background for offline support
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // ── Other assets: CACHE-FIRST ────────────────────────────
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      });
    })
  );
});

// ── Allow page to trigger immediate update via postMessage ──
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
