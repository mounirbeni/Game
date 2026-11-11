// Backman service worker: makes the game installable and playable offline.
// The page itself is fetched network-first so updates show up as soon as you're online;
// everything else is served from the cache first.
const CACHE = 'bugmaze-v94';
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
  './assets/home-bg.jpg', './assets/level-map.webp', './assets/level-btn.webp', './assets/card-frame.webp', './assets/frame-long.webp', './assets/frame-mid.webp', './assets/frame-square.webp', './assets/frame-plain.webp', './assets/items/chest.webp', './assets/items/basket.webp', './assets/items/heart.webp', './assets/items/lantern.webp', './assets/items/shield.webp', './assets/items/icebomb.webp', './assets/items/boots.webp', './assets/items/magnet.webp', './assets/fonts/lilita-one.woff2', './assets/btn-green.webp', './assets/btn-blue.webp', './assets/scene-win.webp', './assets/scene-lose.webp', './assets/ladybug.webp', './assets/backman.webp', './assets/skins/zogha.webp', './assets/skins/es.webp', './assets/skins/sprout.webp', './assets/skins/fox.webp', './assets/skins/minty.webp', './assets/skins/mbn.webp', './assets/skins/midnight.webp', './assets/skins/shadow.webp', './assets/skins/ranger.webp', './assets/skins/seeker.webp', './assets/skins/voyager.webp', './assets/floor.webp', './assets/wall.webp', './assets/seed.webp', './assets/lantern.webp', './assets/mushroom.webp', './assets/coin-sprite.webp', './assets/ladybug-scared.webp',
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

// Push notifications from the game server (challenges, live rooms, leaderboard, daily reward).
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Bug Maze Adventure', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Bug Maze Adventure', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: './icons/icon-192.png', badge: './icons/favicon-32.png', data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (new URL(c.url).origin === self.location.origin) { c.focus(); c.postMessage({ type: 'open', url }); return; }
    return self.clients.openWindow(url);
  }));
});
