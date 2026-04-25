// ===== Grammar AI — Service Worker =====
// Cache name — bump version to force update
const CACHE = 'grammar-ai-v1';

// Files to pre-cache on install (app shell)
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install: pre-cache app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(PRECACHE).catch(err => {
        // Non-fatal — icons may not exist yet, skip gracefully
        console.warn('[SW] Pre-cache partial failure:', err);
        return cache.add('./index.html');
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API calls, cache-first for app shell ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always skip non-GET and cross-origin API calls (Groq, Cerebras, Gemini, Workers)
  if (event.request.method !== 'GET') return;
  if (
    url.hostname.includes('groq.com')        ||
    url.hostname.includes('cerebras.ai')     ||
    url.hostname.includes('googleapis.com')  ||
    url.hostname.includes('mistral.ai')      ||
    url.hostname.includes('workers.dev')
  ) return;

  // For same-origin HTML/CSS/JS/images — cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache valid same-origin responses
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — serve index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Background sync (future use) ──
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
});
