import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCityLoader } from '../js/cities/assets.js';

const document = JSON.stringify({ schema: 1, format: 'taipei-source-buffer-v1', id: 'box', meshes: [], textures: [] });
const sha256 = createHash('sha256').update(document).digest('hex');
const manifest = { schema: 1, id: 'taipei', version: 'test', required: ['box'], assets: [{ id: 'box', url: 'assets/cities/taipei/box.json', sha256 }] };

test('loader resolves app-root paths, shares one library and isolates lease release', async () => {
  const urls = [];
  const load = createCityLoader({ baseURL: 'https://example.test/game/', fetch: async (url) => {
    urls.push(String(url));
    return new Response(String(url).includes('manifest.json') ? JSON.stringify(manifest) : document);
  } });
  const [a, b] = await Promise.all([load('taipei'), load('taipei')]);
  const one = a.instantiate('box'), two = b.instantiate('box');
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1]).pathname, '/game/assets/cities/taipei/box.json');
  assert.equal(new URL(urls[1]).searchParams.get('sha'), sha256);
  a.release();
  assert.throws(() => a.instantiate('box'), /released/);
  assert.equal(b.instantiate('box').userData.sourceAssetId, 'box');
  assert.notEqual(one, two);
  b.release(); b.release();
});

test('a corrupted file rejects readiness and a subsequent clean download can retry', async () => {
  let corrupt = true;
  const load = createCityLoader({ baseURL: 'https://example.test/', fetch: async (url) => new Response(
    String(url).includes('manifest.json') ? JSON.stringify(manifest) : corrupt ? '{}' : document,
  ) });
  await assert.rejects(load('taipei'), /hash mismatch/);
  corrupt = false;
  const lease = await load('taipei'); lease.release();
  await assert.rejects(load('unknown'), /Unknown city/);
});

test('missing required manifest entries cannot produce a ready city', async () => {
  const load = createCityLoader({ baseURL: 'https://example.test/', fetch: async () => new Response(JSON.stringify({ ...manifest, required: ['missing'] })) });
  await assert.rejects(load('taipei'), /Missing required/);
});

test('conflicting shared texture descriptors reject readiness and release decoded images', async () => {
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  const texture = { id: 'shared', url: 'assets/cities/taipei/shared.png', sha256: hash('png'), colorSpace: 'srgb' };
  const docs = ['a', 'b'].map((id) => JSON.stringify({ schema: 1, format: 'taipei-source-buffer-v1', id, meshes: [],
    textures: [{ ...texture, ...(id === 'b' ? { url: 'assets/cities/taipei/missing.png' } : {}) }] }));
  const assets = docs.map((body, i) => ({ id: i ? 'b' : 'a', url: `assets/cities/taipei/${i}.json`, sha256: hash(body) }));
  let disposed = 0, closed = 0;
  const load = createCityLoader({ baseURL: 'https://example.test/', textureDecoder: async () => ({ dispose() { disposed++; }, image: { close() { closed++; } } }),
    fetch: async (url) => new Response(String(url).includes('manifest.json') ? JSON.stringify({ ...manifest, assets, required: ['a', 'b'] })
      : String(url).includes('.png') ? 'png' : docs[Number(new URL(url).pathname.split('/').pop()[0])]),
  });
  await assert.rejects(load('taipei'), /Conflicting source texture/);
  assert.equal(disposed, 1); assert.equal(closed, 1);
});
