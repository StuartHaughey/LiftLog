// Bump this when you change JS/CSS/HTML so PWAs fetch fresh files
const CACHE = 'liftlog-cache-v19';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE)); // create/open the cache
});

self.addEventListener('activate', (event) => {
  // Clear out old versions so we don't bloat storage
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Only handle same-origin requests (skip CDNs/analytics/etc.)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      const fetcher = fetch(new Request(req, { cache: 'no-store' }))
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => hit); // offline: fall back to cache if we had it

      return hit || fetcher;
    })
  );
});







