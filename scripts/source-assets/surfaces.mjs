import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { Extractor } from './lazy-extractor.mjs';

export async function recoverSurfaces({ w, out, hash, source }) {
  const atlas = new (w.get('Uv'))(1);
  await atlas.buildMaterials(4, async () => {});
  const t = atlas.materials, { data, width, height, depth } = t.image;
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  fs.writeFileSync(path.join(out, 'source-surfaces.rgba'), bytes);
  return { id: 'source-surfaces', url: 'assets/cities/taipei/source-surfaces.rgba',
    sha256: hash(bytes), width, height, depth, dimension: '2d-array', format: 'rgba8',
    colorSpace: t.colorSpace, flipY: t.flipY, wrapS: t.wrapS, wrapT: t.wrapT,
    minFilter: t.minFilter, magFilter: t.magFilter, generateMipmaps: t.generateMipmaps,
    anisotropy: t.anisotropy, premultiplyAlpha: t.premultiplyAlpha,
    source: source('world-BwYfSiTY.js', 'Uv.buildMaterials / Jv / Kv / Gv'),
    layers: JSON.parse(JSON.stringify(w.get('X'))),
    interpretation: 'Original Kv vertically reversed RGB surface color plus alpha emission mask, not opacity.' };
}

export function attachSurfaces(document, texture) {
  document.textures = [...document.textures.filter(t => t.id !== texture.id), texture];
  for (const mesh of document.meshes ?? []) if (['lm', 'leaves'].includes(mesh.name)) mesh.material.surfaceMap = texture.id;
  document.limitations = (document.limitations ?? []).map(text => text.startsWith('Source LM procedural')
    ? 'Original LM 35-layer surface colors and emission masks recovered. Runtime must decode aSurf/aMat/aCol with source shader semantics. Glass refraction remains adapted.' : text);
  return document;
}

// Upgrade only building material records in an existing extraction; raw geometry
// and other independently recovered families remain byte-identical.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const sourceRoot = process.env.TAIPEI_SOURCE_ROOT || '/Users/swchen.tw/git/rea_study_gta_taipei/archive/taipei-rush-2026-10-18/files/assets';
  const out = path.resolve('assets/cities/taipei');
  const hash = data => crypto.createHash('sha256').update(data).digest('hex');
  const source = (file, symbol) => ({ file, symbol, sha256: hash(fs.readFileSync(path.join(sourceRoot, file))) });
  const extractor = new Extractor(sourceRoot), load = extractor.load.bind(extractor);
  extractor.load = name => {
    const mod = load(name);
    mod.box.document = { createElement(tag) { if (tag !== 'canvas') throw new Error('DOM forbidden'); return createCanvas(1, 1); } };
    return mod;
  };
  const texture = await recoverSurfaces({ w: extractor.load('world-BwYfSiTY.js'), out, hash, source });
  const manifestPath = path.join(out, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestPath));
  for (const asset of manifest.assets.filter(a => a.kind === 'building')) {
    const document = attachSurfaces(JSON.parse(fs.readFileSync(asset.url)), texture);
    const bytes = JSON.stringify(document);
    fs.writeFileSync(asset.url, bytes);
    attachSurfaces(asset, texture);
    asset.sha256 = hash(bytes);
  }
  manifest.version = 'source-v1-' + hash(manifest.assets.map(a => a.sha256).join('')).slice(0, 12);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync('docs/research/evidence/taipei-source/surface-extraction-trace.json', JSON.stringify(extractor.trace, null, 2));
  console.log(JSON.stringify({ version: manifest.version, texture }, null, 2));
}
