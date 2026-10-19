import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { commitCityCache, readCityReadiness, coreCacheName, runtimeURLs } from '../js/cities/offline.js';

const baseURL = 'https://example.test/game/';
const manifestURL = baseURL + 'assets/cities/taipei/manifest.json';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (value) => new TextEncoder().encode(value).buffer;
const key = (request) => typeof request === 'string' ? request : request.url ?? String(request);

// CacheStorage is a browser-only boundary. Keep Response cloning/consumption real.
class MemoryCaches {
  stores = new Map();
  failPut = null;
  async keys() { return [...this.stores.keys()]; }
  async delete(name) { return this.stores.delete(name); }
  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    const store = this.stores.get(name);
    return {
      match: async (request) => store.get(key(request))?.clone(),
      put: async (request, response) => {
        if (this.failPut?.(key(request))) throw new DOMException('Storage is full', 'QuotaExceededError');
        store.set(key(request), response.clone());
      },
      delete: async (request) => store.delete(key(request)),
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      addAll: async (urls) => { for (const url of urls) store.set(new URL(url, baseURL).href, new Response('core')); },
    };
  }
  async match(request) {
    for (const name of await this.keys()) {
      const hit = await (await this.open(name)).match(request);
      if (hit) return hit;
    }
  }
}

function fixture(version = 'v1') {
  const image = 'png-' + version;
  const texture = { id: 'atlas', url: 'assets/cities/taipei/atlas.png', sha256: hash(image) };
  const document = JSON.stringify({ schema: 1, format: 'taipei-source-buffer-v1', id: 'building', meshes: [], textures: [texture] });
  const asset = { id: 'building', url: 'assets/cities/taipei/building.json', sha256: hash(document) };
  const manifest = { schema: 1, id: 'taipei', version, format: 'taipei-source-buffer-v1', required: ['building'], assets: [asset] };
  const files = [[asset, document], [texture, image]].map(([entry, value]) => ({
    url: new URL(entry.url, baseURL).href + '?sha=' + entry.sha256, bytes: bytes(value),
  }));
  return { manifest, manifestURL, files };
}

async function environment() {
  const cacheStorage = new MemoryCaches();
  const core = await cacheStorage.open(coreCacheName(baseURL));
  for (const url of runtimeURLs(baseURL)) await core.put(url, new Response('runtime'));
  return { cacheStorage, baseURL };
}

test('city readiness requires cached runtime modules and every committed asset', async () => {
  const env = await environment(), input = fixture();
  const result = await commitCityCache({ ...input, ...env });
  assert.equal(result.ready, true);
  assert.equal((await readCityReadiness('taipei', env)).version, 'v1');
  const cache = await env.cacheStorage.open(result.cacheName);
  await cache.delete(input.files[1].url);
  assert.equal((await readCityReadiness('taipei', env)).ready, false);
  await cache.put(input.files[1].url, new Response(input.files[1].bytes));
  const core = await env.cacheStorage.open(coreCacheName(baseURL));
  await core.delete(baseURL + 'js/cities/source-library.js');
  const missingRuntime = await readCityReadiness('taipei', env);
  assert.equal(missingRuntime.ready, false);
  assert.ok(missingRuntime.missing.includes(baseURL + 'js/cities/source-library.js'));
});

test('a missing transitive texture cannot commit or replace the previous complete city', async () => {
  const env = await environment();
  await commitCityCache({ ...fixture(), ...env });
  const next = fixture('v2');
  await assert.rejects(commitCityCache({ ...next, files: next.files.slice(0, 1), ...env }), /missing/i);
  assert.equal((await readCityReadiness('taipei', env)).version, 'v1');
});

test('quota failure rolls back only the candidate and leaves previous city plus unrelated caches intact', async () => {
  const env = await environment();
  await (await env.cacheStorage.open('another-app-cache')).put(baseURL + 'private', new Response('keep'));
  const previous = await commitCityCache({ ...fixture(), ...env });
  const before = await env.cacheStorage.keys();
  env.cacheStorage.failPut = (url) => url.includes('atlas.png');
  await assert.rejects(commitCityCache({ ...fixture('v2'), ...env }), { name: 'QuotaExceededError' });
  assert.deepEqual(await env.cacheStorage.keys(), before);
  assert.equal((await readCityReadiness('taipei', env)).cacheName, previous.cacheName);
  assert.equal(await (await env.cacheStorage.match(baseURL + 'private')).text(), 'keep');
});

test('version update chooses the latest complete city and falls back if its files are evicted', async () => {
  const env = await environment();
  await commitCityCache({ ...fixture(), ...env });
  const newer = await commitCityCache({ ...fixture('v2'), ...env });
  assert.equal((await readCityReadiness('taipei', env)).version, 'v2');
  await (await env.cacheStorage.open(newer.cacheName)).delete(fixture('v2').files[0].url);
  assert.equal((await readCityReadiness('taipei', env)).version, 'v1');
});

test('incompatible manifests and corrupt hash-versioned bytes never commit', async () => {
  const env = await environment(), input = fixture();
  await assert.rejects(commitCityCache({ ...input, manifest: { ...input.manifest, format: 'future-v2' }, ...env }), /compatible|format/i);
  input.files[0].bytes = bytes('{}');
  await assert.rejects(commitCityCache({ ...input, ...env }), /hash/i);
  assert.equal((await readCityReadiness('taipei', env)).ready, false);
});

test('binary texture arrays retain bytes and use a binary response content type', async () => {
  const env = await environment(), input = fixture();
  const document = JSON.parse(new TextDecoder().decode(input.files[0].bytes));
  document.textures[0].url = 'assets/cities/taipei/source-surfaces.rgba';
  const data = JSON.stringify(document);
  input.manifest.assets[0].sha256 = hash(data);
  input.files[0] = { url: baseURL + input.manifest.assets[0].url + '?sha=' + hash(data), bytes: bytes(data) };
  input.files[1].url = baseURL + document.textures[0].url + '?sha=' + document.textures[0].sha256;
  const state = await commitCityCache({ ...input, ...env });
  const response = await (await env.cacheStorage.open(state.cacheName)).match(input.files[1].url);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.deepEqual(await response.arrayBuffer(), input.files[1].bytes);
});

test('successful version updates retain only the latest two complete generations', async () => {
  const env = await environment();
  const old = await commitCityCache({ ...fixture(), ...env });
  const prior = await commitCityCache({ ...fixture('v2'), ...env });
  const latest = await commitCityCache({ ...fixture('v3'), ...env });
  const keys = await env.cacheStorage.keys();
  assert.equal(keys.includes(old.cacheName), false);
  assert.equal(keys.includes(prior.cacheName), true);
  assert.equal(keys.includes(latest.cacheName), true);
});

let workerSerial = 0;
async function worker(env, requestFetch) {
  const handlers = new Map();
  globalThis.self = { location: new URL(baseURL + 'sw.js'), registration: { scope: baseURL },
    addEventListener: (type, callback) => handlers.set(type, callback), skipWaiting: async () => {}, clients: { claim: async () => {} } };
  globalThis.caches = env.cacheStorage;
  globalThis.fetch = requestFetch;
  await import('../sw.js?cache-test=' + ++workerSerial);
  return {
    async activate() { let job; handlers.get('activate')({ waitUntil: (promise) => { job = promise; } }); await job; },
    async install() { let job; handlers.get('install')({ waitUntil: (promise) => { job = promise; } }); await job; },
    async fetch(url) {
      let response;
      const waits = [];
      handlers.get('fetch')({ request: new Request(url), respondWith: (promise) => { response = promise; }, waitUntil: (promise) => waits.push(promise) });
      const result = await response;
      await Promise.all(waits);
      return result;
    },
  };
}

test('worker activation preserves cities and unrelated caches; install includes every runtime module', async (t) => {
  const saved = { self: globalThis.self, caches: globalThis.caches, fetch: globalThis.fetch };
  t.after(() => Object.assign(globalThis, saved));
  const env = await environment();
  const city = await commitCityCache({ ...fixture(), ...env });
  await env.cacheStorage.open('another-app-cache');
  await env.cacheStorage.open('mc101-pre-mc101-v2');
  const sw = await worker(env, async () => new Response('network'));
  await sw.install(); await sw.activate();
  assert.ok((await env.cacheStorage.keys()).includes(city.cacheName));
  assert.ok((await env.cacheStorage.keys()).includes('another-app-cache'));
  assert.ok(!(await env.cacheStorage.keys()).includes('mc101-pre-mc101-v2'));
  for (const directory of ['js', 'js/cars', 'js/cities']) {
    for (const file of await readdir(directory)) {
      if (file.endsWith('.js')) assert.ok(await env.cacheStorage.match(baseURL + directory + '/' + file), directory + '/' + file);
    }
  }
});

test('worker serves exact hash versions and only complete committed manifests offline', async (t) => {
  const saved = { self: globalThis.self, caches: globalThis.caches, fetch: globalThis.fetch };
  t.after(() => Object.assign(globalThis, saved));
  const env = await environment(), one = fixture(), two = fixture('v2');
  await commitCityCache({ ...one, ...env });
  const latest = await commitCityCache({ ...two, ...env });
  const sw = await worker(env, async () => { throw new TypeError('Offline'); });
  assert.equal((await (await sw.fetch(manifestURL)).json()).version, 'v2');
  assert.equal(await (await sw.fetch(one.files[1].url)).text(), 'png-v1');
  assert.equal(await (await sw.fetch(two.files[1].url)).text(), 'png-v2');
  await (await env.cacheStorage.open(latest.cacheName)).delete(two.files[0].url);
  assert.equal((await (await sw.fetch(manifestURL)).json()).version, 'v1');
  const absent = await sw.fetch(baseURL + 'assets/cities/taipei/atlas.png?sha=' + '0'.repeat(64));
  assert.equal(absent.status, 503);
});

test('worker rejects mismatched network content for hash-versioned assets', async (t) => {
  const saved = { self: globalThis.self, caches: globalThis.caches, fetch: globalThis.fetch };
  t.after(() => Object.assign(globalThis, saved));
  const env = await environment();
  const sw = await worker(env, async () => new Response('wrong-new-version'));
  const response = await sw.fetch(fixture().files[1].url);
  assert.equal(response.status, 502);
  assert.equal(await env.cacheStorage.match(fixture().files[1].url), undefined);
});
