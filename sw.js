// Backman service worker: makes the game installable and playable offline.
// The page itself is fetched network-first so updates show up as soon as you're online;
// everything else is served from the cache first.
const CACHE = 'bugmaze-v32';
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
  './assets/home-bg.jpg', './assets/level-map.webp', './assets/level-btn.webp', './assets/ladybug.webp', './assets/backman.webp', './assets/skins/zogha.webp', './assets/skins/es.webp', './assets/skins/sprout.webp', './assets/skins/fox.webp', './assets/skins/minty.webp', './assets/skins/mbn.webp', './assets/skins/midnight.webp', './assets/skins/shadow.webp', './assets/skins/ranger.webp', './assets/floor.webp', './assets/wall.webp', './assets/seed.webp', './assets/lantern.webp', './assets/mushroom.webp', './assets/coin-sprite.webp', './assets/ladybug-scared.webp',
  './icons/ui/coin.webp', './icons/ui/heart.webp', './icons/ui/gear.webp', './icons/ui/gift.webp', './icons/ui/mission.webp', './icons/ui/trophy.webp', './icons/ui/skins.webp',
  './icons/ui/stats.webp', './icons/ui/shop.webp', './icons/ui/house.webp', './icons/ui/map.webp', './icons/ui/star.webp',
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
  if (new URL(req.url).pathname.startsWith('/api/')) return;   // live data: never cache

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
