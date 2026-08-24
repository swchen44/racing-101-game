// sw.js — Service Worker:離線遊玩支援
// 策略:
//   同源 HTML/JS      → 網路優先、離線退快取 (確保有網路時永遠拿到最新版)
//   CDN (three/字型)  → 快取優先、背景補快取 (首次上線玩過一場後即可離線)
//   排行榜 API/IP查詢 → 純網路 (離線時遊戲自動退回本機排行榜)
const VERSION = 'mc101-v2';
const PRECACHE = 'mc101-pre-' + VERSION;
const RUNTIME = 'mc101-run-' + VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/main.js', './js/config.js', './js/i18n.js', './js/track.js', './js/vehicle.js',
  './js/taipei101.js', './js/city.js', './js/effects.js', './js/audio.js', './js/hud.js',
  './js/camera.js', './js/opponents.js', './js/police.js', './js/leaderboard.js',
  './js/touch.js', './js/reflections.js', './js/carpreview.js', './js/ghost.js',
  './js/chase.js', './js/arrest.js', './js/sponsors.js',
  './js/cars/index.js', './js/cars/common.js', './js/cars/gt.js', './js/cars/f1.js',
  './js/cars/evsport.js', './js/cars/rally.js', './js/cars/pickup.js', './js/cars/taxi.js',
  './js/cars/evcity.js', './js/cars/suv.js',
  './assets/tracks/xinyi.jpg', './assets/tracks/wangan.jpg',
  './assets/tracks/mountain.jpg', './assets/tracks/gp.jpg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/apple-touch-icon.png',
];

// 離線時不需要、也不該快取的端點
const NETWORK_ONLY = ['supabase.co', 'api.ipify.org'];
// CDN:快取優先 (three.js 模組鏈與 Google Fonts)
const CDN_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== PRECACHE && k !== RUNTIME).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (NETWORK_ONLY.some((h) => url.hostname.includes(h))) return; // 交給瀏覽器,離線自然失敗→遊戲退本機榜

  // CDN:快取優先,未中則抓網路並存入
  if (CDN_HOSTS.some((h) => url.hostname.includes(h))) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, clone));
        }
        return res;
      })));
    return;
  }

  // 同源:網路優先 (拿最新版),失敗退快取 (離線遊玩)
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() =>
        caches.match(req).then((hit) => hit
          || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))));
  }
});
