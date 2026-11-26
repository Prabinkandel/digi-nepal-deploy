// Digi Prime Nepal — Admin PWA service worker (scope: /admin only)
// Strategy: network-first for everything, cache as fallback. API calls are
// never cached. The cache only holds admin shell assets so the panel can be
// installed and opened like an app.
const CACHE = 'digi-admin-v8';
const SHELL = [
  '/admin',
  '/admin.css?v=110',
  '/admin-mobile.css?v=110',
  '/theme.css?v=131',
  '/admin.js?v=121',
  '/admin-icon-192.png',
  '/admin-icon-512.png',
  '/apple-touch-icon.png',
  '/digi-prime-nepal-logo.png?v=2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // live data only, never cached
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && (url.pathname.startsWith('/admin') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.png'))) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }))
  );
});
