// Backman service worker: makes the game installable and playable offline.
// The page itself is fetched network-first so updates show up as soon as you're online;
// everything else is served from the cache first.
const CACHE = 'bugmaze-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './assets/home-bg.jpg',
  './icons/ui/coin.png', './icons/ui/heart.png', './icons/ui/gear.png', './icons/ui/gift.webp', './icons/ui/mission.webp', './icons/ui/trophy.webp', './icons/ui/skins.webp',
  './icons/ui/stats.webp', './icons/ui/shop.webp', './icons/ui/house.png', './icons/ui/map.png', './icons/ui/star.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
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
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
