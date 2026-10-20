// Cache format and runtime compatibility are separate from the source content version.
const CACHE_SCHEMA = 1;
const SOURCE_FORMAT = 'taipei-source-buffer-v1';
const CORE_VERSION = 'taipei-source-v2';
const JS_FILES = [
  'main', 'config', 'i18n', 'track', 'vehicle', 'taipei101', 'city', 'effects',
  'audio', 'hud', 'camera', 'opponents', 'police', 'leaderboard', 'touch',
  'reflections', 'carpreview', 'ghost', 'chase', 'arrest', 'sponsors',
  'cars/index', 'cars/common', 'cars/gt', 'cars/f1', 'cars/evsport', 'cars/rally',
  'cars/pickup', 'cars/taxi', 'cars/evcity', 'cars/suv',
  'cities/assets', 'cities/resource-pool', 'cities/selection', 'cities/source-library',
  'cities/source-materials', 'cities/vehicles', 'cities/characters', 'cities/effects',
  'cities/scene', 'cities/taipei', 'cities/arrest', 'cities/offline',
];
const THREE_MODULES = [
  'geometries/RoundedBoxGeometry', 'utils/BufferGeometryUtils',
  'postprocessing/EffectComposer', 'postprocessing/MaskPass', 'postprocessing/OutputPass',
  'postprocessing/Pass', 'postprocessing/RenderPass', 'postprocessing/ShaderPass',
  'postprocessing/UnrealBloomPass', 'shaders/CopyShader',
  'shaders/LuminosityHighPassShader', 'shaders/OutputShader',
];

function environment(options = {}) {
  const baseURL = new URL('./', options.baseURL ?? globalThis.document?.baseURI
    ?? globalThis.self?.registration?.scope ?? 'http://localhost/').href;
  return { baseURL, cacheStorage: options.cacheStorage ?? globalThis.caches };
}

export function cacheNamespace(baseURL) {
  return 'mc101:' + encodeURIComponent(new URL('./', baseURL).href) + ':';
}

export const coreCacheName = (baseURL) => cacheNamespace(baseURL) + 'core:' + CORE_VERSION;
export const runtimeCacheName = (baseURL) => cacheNamespace(baseURL) + 'runtime:' + CORE_VERSION;
const cityPrefix = (baseURL, id) => cacheNamespace(baseURL) + 'city:source-v1:' + id + ':';
const markerURL = (baseURL, id) => new URL('.offline/' + id + '/commit.json', baseURL).href;

export function runtimeURLs(baseURL) {
  return [new URL('index.html', baseURL).href,
    ...JS_FILES.map((file) => new URL('js/' + file + '.js', baseURL).href),
    'https://unpkg.com/three@0.160.0/build/three.module.js',
    ...THREE_MODULES.map((file) => 'https://unpkg.com/three@0.160.0/examples/jsm/' + file + '.js')];
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function compatible(manifest, id) {
  return manifest?.schema === 1 && manifest.id === id && /^[a-z0-9-]+$/.test(id)
    && typeof manifest.version === 'string' && !!manifest.version
    && manifest.format === SOURCE_FORMAT && Array.isArray(manifest.assets)
    && Array.isArray(manifest.required) && manifest.required.length > 0;
}

function assetURL(file, baseURL, id) {
  const url = new URL(file.url, baseURL);
  const root = new URL('assets/cities/' + id + '/', baseURL);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)
    || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid city cache asset path/hash');
  url.searchParams.set('sha', file.sha256);
  url.hash = '';
  return url.href;
}

// Validate the complete closure, not just the caller's list: a missing PNG or
// animation dependency must never be hidden by an incomplete files array.
async function validateFiles(manifest, files, baseURL) {
  const supplied = new Map();
  for (const file of files) {
    const url = new URL(file.url, baseURL);
    const expected = url.searchParams.get('sha');
    assetURL({ url: url.href, sha256: expected }, baseURL, manifest.id);
    if (await sha256(file.bytes) !== expected) throw new Error('City cache hash mismatch: ' + url.pathname);
    supplied.set(url.href, file.bytes);
  }
  const required = new Set();
  const need = (file) => {
    const url = assetURL(file, baseURL, manifest.id);
    if (!supplied.has(url)) throw new Error('Missing city cache file: ' + url);
    required.add(url);
    return supplied.get(url);
  };
  const ids = new Set();
  for (const asset of manifest.assets) {
    if (ids.has(asset.id)) throw new Error('Duplicate city cache asset: ' + asset.id);
    ids.add(asset.id);
    const document = JSON.parse(new TextDecoder().decode(need(asset)));
    if (document.schema !== 1 || document.format !== SOURCE_FORMAT || document.id !== asset.id) {
      throw new Error('Incompatible city cache document: ' + asset.id);
    }
    for (const entry of [...(document.textures ?? []), ...(document.dependencies ?? [])]) need(entry);
  }
  for (const id of manifest.required) if (!ids.has(id)) throw new Error('Missing required city cache asset: ' + id);
  return [...required].map((url) => ({ url, bytes: supplied.get(url) }));
}

async function committedRecords(id, { cacheStorage, baseURL }) {
  const records = [];
  for (const [order, name] of (await cacheStorage.keys()).entries()) {
    if (!name.startsWith(cityPrefix(baseURL, id))) continue;
    const cache = await cacheStorage.open(name);
    try {
      const response = await cache.match(markerURL(baseURL, id));
      if (!response) continue; // Candidate or interrupted write; never ready.
      const record = await response.json();
      if (record.schema !== CACHE_SCHEMA || record.compatibility !== SOURCE_FORMAT
        || record.cityId !== id || !Array.isArray(record.files) || !record.files.length) continue;
      const manifestResponse = await cache.match(record.manifestURL);
      if (!manifestResponse) continue;
      const manifestBytes = await manifestResponse.arrayBuffer();
      if (await sha256(manifestBytes) !== record.manifestHash) continue;
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      if (!compatible(manifest, id) || manifest.version !== record.version) continue;
      const missing = [];
      for (const url of record.files) if (!(await cache.match(url))) missing.push(url);
      records.push({ ...record, cacheName: name, order, missing });
    } catch {
      // A corrupt/incompatible marker is uncommitted from this runtime's perspective.
    }
  }
  return records.sort((a, b) => b.committedAt - a.committedAt || b.order - a.order);
}

export async function readCityReadiness(cityId, options = {}) {
  const env = environment(options);
  if (!env.cacheStorage) return { ready: false, cityReady: false, cityId, reason: 'cache-unavailable', missing: [] };
  const records = await committedRecords(cityId, env);
  const record = records.find((entry) => entry.missing.length === 0);
  if (!record) return { ready: false, cityReady: false, cityId, reason: 'city-incomplete', missing: records[0]?.missing ?? [] };
  const missing = [];
  if (options.includeRuntime !== false) {
    const core = await env.cacheStorage.open(coreCacheName(env.baseURL));
    for (const url of runtimeURLs(env.baseURL)) if (!(await core.match(url))) missing.push(url);
  }
  return { ready: missing.length === 0, cityReady: true, cityId, version: record.version,
    cacheName: record.cacheName, manifestURL: record.manifestURL,
    reason: missing.length ? 'runtime-incomplete' : null, missing };
}

export async function commitCityCache({ manifest, manifestURL, files, ...options }) {
  const env = environment(options), { cacheStorage, baseURL } = env;
  if (!cacheStorage) throw new Error('City offline cache is unavailable');
  if (!compatible(manifest, manifest?.id)) throw new Error('Incompatible city cache manifest format');
  const expectedManifestURL = new URL('assets/cities/' + manifest.id + '/manifest.json', baseURL).href;
  if (new URL(manifestURL, baseURL).href !== expectedManifestURL) throw new Error('Invalid city cache manifest path');
  const verified = await validateFiles(manifest, files, baseURL);
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const manifestHash = await sha256(manifestBytes);
  const records = await committedRecords(manifest.id, env);
  if (records.some((entry) => !entry.missing.length && entry.manifestHash === manifestHash)) {
    return readCityReadiness(manifest.id, env);
  }
  const name = cityPrefix(baseURL, manifest.id) + encodeURIComponent(manifest.version) + ':' + crypto.randomUUID();
  try {
    const cache = await cacheStorage.open(name);
    for (const file of verified) {
      const path = new URL(file.url).pathname;
      const type = path.endsWith('.json') ? 'application/json'
        : path.endsWith('.png') ? 'image/png' : 'application/octet-stream';
      await cache.put(file.url, new Response(file.bytes, { headers: { 'Content-Type': type } }));
    }
    await cache.put(expectedManifestURL, new Response(manifestBytes, { headers: { 'Content-Type': 'application/json' } }));
    // Recheck after writes: quota/eviction can invalidate earlier entries.
    for (const url of [expectedManifestURL, ...verified.map((file) => file.url)]) {
      if (!(await cache.match(url))) throw new Error('Missing city cache file after write: ' + url);
    }
    const record = { schema: CACHE_SCHEMA, compatibility: SOURCE_FORMAT, cityId: manifest.id,
      version: manifest.version, manifestURL: expectedManifestURL, manifestHash,
      files: verified.map((file) => file.url), committedAt: Date.now() };
    await cache.put(markerURL(baseURL, manifest.id), new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    await cacheStorage.delete(name);
    throw error;
  }
  // Keep current plus one previous complete generation. Never touch another
  // city, another application, or an in-flight candidate lacking a commit marker.
  const complete = (await committedRecords(manifest.id, env)).filter((record) => !record.missing.length);
  for (const record of complete.slice(2)) await cacheStorage.delete(record.cacheName);
  return readCityReadiness(manifest.id, env);
}
