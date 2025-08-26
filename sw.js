const CACHE = 'liftlog-cache-v6'; // bump this number each time you change CSS/JS
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE)); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
const req = e.request;
if (req.method !== 'GET') return;
e.respondWith(
caches.match(req).then(hit => {
const fetcher = fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); return res; }).catch(()=> hit);
return hit || fetcher;
})
);

});

