import * as THREE from 'three';
import { createResourcePool } from './resource-pool.js';
import { createSourceLibrary } from './source-library.js';
import { commitCityCache, readCityReadiness } from './offline.js';

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

async function decodeTexture(bytes, definition) {
  if (definition.dimension === '2d-array') {
    const { width, height, depth } = definition;
    if (definition.format !== 'rgba8' || ![width, height, depth].every((n) => Number.isInteger(n) && n > 0)
      || bytes.byteLength !== width * height * depth * 4) throw new Error(`Invalid source array texture: ${definition.id}`);
    const texture = new THREE.DataArrayTexture(new Uint8Array(bytes), width, height, depth);
    texture.colorSpace = definition.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.flipY = !!definition.flipY;
    texture.wrapS = definition.wrapS ?? (definition.wrap === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping);
    texture.wrapT = definition.wrapT ?? (definition.wrap === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping);
    texture.magFilter = definition.magFilter ?? THREE.LinearFilter;
    texture.minFilter = definition.minFilter ?? THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = definition.generateMipmaps ?? true;
    texture.anisotropy = definition.anisotropy ?? 1;
    texture.userData.shared = true;
    texture.needsUpdate = true;
    return texture;
  }
  const bitmap = await createImageBitmap(new Blob([bytes]), {
    imageOrientation: definition.flipY ? 'flipY' : 'none',
    premultiplyAlpha: definition.premultiplyAlpha ? 'premultiply' : 'none',
    colorSpaceConversion: 'none',
  });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false; // ImageBitmap already applied upload orientation/alpha semantics.
  texture.colorSpace = definition.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (definition.wrap === 'repeat') texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.userData.shared = true;
  texture.needsUpdate = true;
  return texture;
}

// Injected transport makes corruption/partial download tests independent of WebGL.
export function createCityLoader({ baseURL, fetch: request = globalThis.fetch, textureDecoder = decodeTexture, cacheStorage = globalThis.caches } = {}) {
  const base = baseURL ?? (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
  const pool = createResourcePool(async (id) => {
    const manifestResponse = await request(new URL(`assets/cities/${id}/manifest.json`, base), { cache: 'no-cache' });
    if (!manifestResponse.ok) throw new Error(`City manifest load failed: ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (manifest.schema !== 1 || manifest.id !== id || !manifest.version || !Array.isArray(manifest.assets) || !Array.isArray(manifest.required)) {
      throw new Error('Unsupported city manifest');
    }
    const ids = new Set(manifest.assets.map((asset) => asset.id));
    if (ids.size !== manifest.assets.length) throw new Error('Duplicate source asset ids');
    for (const required of manifest.required) if (!ids.has(required)) throw new Error(`Missing required source asset: ${required}`);
    const documents = new Map(), textures = new Map(), dependencies = new Map();
    const textureDescriptors = new Map(), dependencyHashes = new Map();
    const verified = new Map();
    async function bytesFor(file) {
      if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`Missing source hash: ${file.url}`);
      const url = new URL(file.url, base);
      if (url.origin !== new URL(base).origin || !url.pathname.startsWith(new URL(`assets/cities/${id}/`, base).pathname)) {
        throw new Error(`Invalid source asset path: ${file.url}`);
      }
      url.searchParams.set('sha', file.sha256);
      if (!verified.has(url.href)) verified.set(url.href, (async () => {
        const response = await request(url);
        if (!response.ok) throw new Error(`Source load failed: ${file.url} (${response.status})`);
        const bytes = await response.arrayBuffer();
        if (await sha256(bytes) !== file.sha256) throw new Error(`Source hash mismatch: ${file.url}`);
        return bytes;
      })());
      return verified.get(url.href);
    }
    const jsonFor = async (file) => JSON.parse(new TextDecoder().decode(await bytesFor(file)));
    try {
      // Sequential decoding bounds peak parsing memory on phones. Shared files are deduplicated.
      for (const asset of manifest.assets) {
        const data = await jsonFor(asset);
        if (data.schema !== 1 || data.format !== 'taipei-source-buffer-v1' || data.id !== asset.id) throw new Error(`Invalid source document: ${asset.id}`);
        documents.set(asset.id, data);
        for (const definition of data.textures ?? []) {
          const signature = JSON.stringify([definition.url, definition.sha256, definition.colorSpace,
            !!definition.flipY, !!definition.premultiplyAlpha, definition.wrap ?? null,
            definition.dimension, definition.format, definition.width, definition.height, definition.depth,
            definition.minFilter, definition.magFilter, definition.generateMipmaps,
            definition.wrapS, definition.wrapT, definition.anisotropy]);
          if (textureDescriptors.has(definition.id) && textureDescriptors.get(definition.id) !== signature) {
            throw new Error(`Conflicting source texture: ${definition.id}`);
          }
          textureDescriptors.set(definition.id, signature);
          if (!textures.has(definition.id)) textures.set(definition.id, await textureDecoder(await bytesFor(definition), definition));
        }
        for (const dependency of data.dependencies ?? []) {
          if (dependencyHashes.has(dependency.url) && dependencyHashes.get(dependency.url) !== dependency.sha256) {
            throw new Error(`Conflicting source dependency: ${dependency.url}`);
          }
          dependencyHashes.set(dependency.url, dependency.sha256);
          if (!dependencies.has(dependency.url)) dependencies.set(dependency.url, await jsonFor(dependency));
        }
      }
      const library = createSourceLibrary(manifest, documents, textures, dependencies);
      library.offline = { ready: false, reason: 'cache-unavailable' };
      if (cacheStorage) {
        try {
          const files = await Promise.all([...verified].map(async ([url, bytes]) => ({ url, bytes: await bytes })));
          library.offline = await commitCityCache({ manifest, manifestURL: new URL(`assets/cities/${id}/manifest.json`, base).href, files, baseURL: base, cacheStorage });
        } catch (error) {
          library.offline = { ready: false, reason: error.name === 'QuotaExceededError' ? 'quota-exceeded' : 'cache-failed' };
        }
      }
      return library;
    } catch (error) {
      for (const texture of new Set(textures.values())) {
        texture.dispose();
        texture.image?.close?.();
      }
      throw error;
    }
  }, (library) => library.dispose());

  return async function prepareCity(id, options = {}) {
    if (id !== 'taipei') throw new Error(`Unknown city: ${id}`);
    const { value: library, release: releaseLibrary } = await pool.acquire(id, options);
    const roots = new Set();
    let released = false;
    const requireLive = () => { if (released) throw new Error('City lease has been released'); };
    const releaseObject = (root) => {
      if (!roots.delete(root)) return;
      library.releaseObject(root);
    };
    const lease = {
      manifest: library.manifest,
      offline: library.offline,
      async refreshOffline() {
        requireLive();
        let status = { ready: false, reason: 'cache-unavailable' };
        if (cacheStorage) {
          try { status = await readCityReadiness(id, { baseURL: base, cacheStorage }); }
          catch { status = { ready: false, reason: 'cache-failed' }; }
        }
        if (!released) lease.offline = status;
        return status;
      },
      getAsset(id) { requireLive(); return library.getAsset(id); },
      getDependency(url) { requireLive(); return library.dependencies.get(url); },
      instantiate(id) {
        requireLive();
        const root = library.instantiate(id);
        roots.add(root);
        root.userData.releaseSource = () => releaseObject(root);
        return root;
      },
      releaseObject,
      release() {
        if (released) return;
        released = true;
        for (const root of [...roots]) releaseObject(root);
        releaseLibrary();
      },
    };
    // An in-memory library can outlive an evicted cache. Readiness is evidence
    // about persistent files, not about whether this tab can still render.
    await lease.refreshOffline();
    if (options.signal?.aborted) {
      lease.release();
      throw new DOMException('Load cancelled', 'AbortError');
    }
    return lease;
  };
}

export const prepareCity = createCityLoader();
