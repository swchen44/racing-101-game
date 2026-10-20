// Module worker: core and city caches share compatibility/readiness rules.
import { cacheNamespace, coreCacheName, runtimeCacheName, runtimeURLs,
  readCityReadiness, sha256 } from './js/cities/offline.js';

const BASE = self.registration.scope;
const PRECACHE = coreCacheName(BASE);
const RUNTIME = runtimeCacheName(BASE);
const PRECACHE_URLS = [...runtimeURLs(BASE), ...[
  './', './manifest.webmanifest',
  './assets/tracks/xinyi.jpg', './assets/tracks/wangan.jpg',
  './assets/tracks/mountain.jpg', './assets/tracks/gp.jpg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/apple-touch-icon.png',
].map((path) => new URL(path, BASE).href)];
const NETWORK_ONLY = ['supabase.co', 'api.ipify.org'];
const CDN_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const isHost = (hostname, domain) => hostname === domain || hostname.endsWith('.' + domain);
const unavailable = () => new Response('Offline asset unavailable', { status: 503 });

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  const namespace = cacheNamespace(BASE);
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((name) =>
    (name.startsWith(namespace + 'core:') && name !== PRECACHE)
    || (name.startsWith(namespace + 'runtime:') && name !== RUNTIME)
    || name === 'mc101-pre-mc101-v2' || name === 'mc101-run-mc101-v2',
  ).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

async function coreMatch(request) {
  return (await (await caches.open(RUNTIME)).match(request))
    || (await (await caches.open(PRECACHE)).match(request));
}

async function cityAsset(request, url) {
  // Exact query matching preserves old/new generations side-by-side.
  const namespace = cacheNamespace(BASE);
  for (const name of await caches.keys()) {
    if (!name.startsWith(namespace + 'city:')) continue;
    const response = await (await caches.open(name)).match(request);
    if (response) return response;
  }
  try {
    const response = await fetch(request);
    if (!response.ok) return response;
    if (await sha256(await response.clone().arrayBuffer()) !== url.searchParams.get('sha')) {
      return new Response('City asset hash mismatch', { status: 502 });
    }
    // Only the loader's complete verified transaction commits city responses.
    return response;
  } catch { return unavailable(); }
}

async function cityManifest(request, id) {
  try {
    const response = await fetch(request);
    if (response.ok) return response;
    // HTTP errors may accompany an interrupted deploy; a complete version can run.
  } catch { /* Use a fully committed compatible generation only. */ }
  const state = await readCityReadiness(id, { baseURL: BASE, cacheStorage: caches, includeRuntime: false });
  if (!state.cityReady) return unavailable();
  return (await (await caches.open(state.cacheName)).match(state.manifestURL)) || unavailable();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (NETWORK_ONLY.some((domain) => isHost(url.hostname, domain))) return;

  const cityRoot = new URL('assets/cities/', BASE);
  if (url.origin === cityRoot.origin && url.pathname.startsWith(cityRoot.pathname)) {
    const relative = url.pathname.slice(cityRoot.pathname.length);
    const manifest = relative.match(/^([a-z0-9-]+)\/manifest\.json$/);
    if (manifest) event.respondWith(cityManifest(request, manifest[1]));
    else if (/^[a-f0-9]{64}$/.test(url.searchParams.get('sha') ?? '')) event.respondWith(cityAsset(request, url));
    else event.respondWith(fetch(request).catch(unavailable));
    return;
  }

  if (CDN_HOSTS.some((domain) => isHost(url.hostname, domain))) {
    event.respondWith(coreMatch(request).then(async (hit) => {
      if (hit) return hit;
      try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          event.waitUntil(caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => {}));
        }
        return response;
      } catch { return unavailable(); }
    }));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    }).catch(async () => (await coreMatch(request))
      || (request.mode === 'navigate' ? await coreMatch(new URL('index.html', BASE).href) : null)
      || unavailable()));
  }
});
