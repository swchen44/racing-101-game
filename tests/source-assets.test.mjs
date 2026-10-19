import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Taipei has traceable dynamic cars and textured buildings', async () => {
  const m = JSON.parse(await readFile('assets/cities/taipei/manifest.json'));
  for (const id of ['sedan', 'taxi', 'sports', 'suv', 'police']) {
    const a = m.assets.find(a => a.id === id);
    assert.equal(a?.parts?.wheels?.length, 4, id);
    assert.match(a.source.sha256, /^[a-f0-9]{64}$/);
  }
  assert.ok(m.assets.some(a => a.kind === 'building' && a.textures?.length));
});

import crypto from 'node:crypto';
import path from 'node:path';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const readJson = async p => JSON.parse(await readFile(p));
const sourceRoot = process.env.TAIPEI_SOURCE_ROOT || '/Users/swchen.tw/git/rea_study_gta_taipei/archive/taipei-rush-2026-10-18/files/assets';

test('every delivered asset, texture and dependency matches its receipt', async () => {
  const manifest = await readJson('assets/cities/taipei/manifest.json');
  assert.equal(new Set(manifest.assets.map(a => a.id)).size, manifest.assets.length);
  for (const a of manifest.assets) {
    assert.equal(hash(await readFile(a.url)), a.sha256, a.id);
    assert.equal(hash(await readFile(path.join(sourceRoot,a.source.file))), a.source.sha256, a.source.file);
    for (const f of [...(a.textures || []), ...(a.dependencies || [])]) assert.equal(hash(await readFile(f.url)), f.sha256, f.url);
    for (const t of a.textures || []) {
      const png = await readFile(t.url);
      assert.equal(png.subarray(1,4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), t.width);
      assert.equal(png.readUInt32BE(20), t.height);
    }
  }
});

test('source buffers have finite data, valid triangles and measured bounds', async () => {
  const manifest = await readJson('assets/cities/taipei/manifest.json');
  for (const a of manifest.assets) {
    const data = await readJson(a.url);
    const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
    let triangles = 0;
    for (const mesh of data.meshes) {
      const pos = mesh.attributes.position;
      const count = pos.array.length / pos.itemSize;
      assert.ok(count > 0, a.id);
      assert.equal(mesh.index.length % 3, 0, a.id);
      assert.ok(mesh.index.every(i => Number.isInteger(i) && i >= 0 && i < count), a.id);
      triangles += mesh.index.length / 3;
      for (const [name, attr] of Object.entries(mesh.attributes)) {
        assert.ok(attr.array.every(Number.isFinite), a.id + '/' + name);
        assert.equal(attr.array.length % attr.itemSize, 0, a.id + '/' + name);
      }
      pos.array.forEach((v,i) => { min[i%3] = Math.min(min[i%3],v); max[i%3] = Math.max(max[i%3],v); });
    }
    assert.equal(triangles,a.triangles,a.id);
    assert.deepEqual(min,a.bounds.min,a.id);
    assert.deepEqual(max,a.bounds.max,a.id);
  }
});

test('landmarks use actual painted atlas tiles and preserve glass and source materials', async () => {
  const manifest = await readJson('assets/cities/taipei/manifest.json');
  const buildings = manifest.assets.filter(a => a.kind === 'building');
  assert.ok(buildings.length >= 17);
  for (const a of buildings) {
    assert.ok(a.textures[0].textDrawCalls > 0,a.id + ' has original lettering');
    assert.ok(Object.keys(a.atlasRects).length > 1,a.id);
    const d = await readJson(a.url),art=d.meshes.find(m=>m.name==='art');
    assert.ok(art?.material.map,a.id);
    assert.ok(new Set(art.attributes.uv.array).size > 4,a.id+' uses distinct atlas rectangles');
    assert.ok(d.meshes.some(m=>m.attributes.aMat),a.id+' source surface material retained');
  }
  assert.ok((await readJson('assets/cities/taipei/regent-hotel.json')).meshes.some(m=>m.name==='glass'&&m.material.transparent));
});

test('four original wheel ranges preserve pivots, radius and steering axle', async () => {
  for (const id of ['sedan','taxi','sports','suv','police']) {
    const d = await readJson('assets/cities/taipei/'+id+'.json');
    const wheels = d.parts.wheels;
    assert.equal(wheels.length,4,id);
    assert.equal(wheels.filter(w=>w.steer).length,2,id);
    for (const w of wheels) {
      assert.ok(w.radius>0&&w.radius<1,id);
      assert.equal(w.pivot[1],w.radius,id);
      assert.equal(w.pivot[2],w.steer?d.parameters.tuning.frontAxle:d.parameters.tuning.rearAxle,id);
      const meshes=d.meshes.filter(m=>m.part===w.id);assert.ok(meshes.length,id+'/'+w.id);
      for(const m of meshes)assert.deepEqual(m.pivot,w.pivot);
    }
    assert.equal(wheels[0].pivot[0],-wheels[1].pivot[0]);
    assert.equal(wheels[2].pivot[0],-wheels[3].pivot[0]);
  }
});

test('characters preserve original rig, encoded painted atlas and real actions', async () => {
  for (const id of ['jie','police','ama','vendor']) {
    const d=await readJson('assets/cities/taipei/character-'+id+'.json');
    assert.equal(d.skeleton.parents.length,27);
    assert.equal(d.skeleton.parents.filter(p=>p===-1).length,1);
    assert.equal(d.skeleton.jointPositions.length,81);
    for (const m of d.meshes) {
      assert.equal(m.material.type,'source-character');
      assert.ok(m.attributes.uvRect.array.some(v=>v>0));
      assert.ok(m.attributes.skinIndex.array.every(v=>v>=0&&v<27));
      for(let i=0;i<m.attributes.skinWeight.array.length;i+=4)assert.ok(Math.abs(m.attributes.skinWeight.array.slice(i,i+4).reduce((a,b)=>a+b,0)-1)<1e-5);
    }
    assert.ok(d.textures[0].premultiplyAlpha);
  }
  const animation=await readJson('assets/cities/taipei/character-animations.json');
  assert.equal(animation.clips.length,48);
  for(const name of ['idle','walk','run','wave','knockdown_back'])assert.ok(animation.clips.some(c=>c.name===name));
  for(const clip of animation.clips)for(let i=0;i<clip.quaternions.length;i+=4)assert.ok(Math.abs(Math.hypot(...clip.quaternions.slice(i,i+4))-1)<1e-6);
});

test('street, road and effect source families are present', async () => {
  const m=await readJson('assets/cities/taipei/manifest.json');
  for(const id of ['road-surface','sidewalk','curb','street-lamp','tree-camphor','tree-banyan','signal-heads','roadblock','traffic-cone','checkpoint-sign','source-fx','source-markers','road-markings'])assert.ok(m.assets.some(a=>a.id===id),id);
});

test('encoded vehicle and road atlases cannot silently use a plain diffuse map', async () => {
  for(const id of ['sedan','taxi','sports','suv','police']){
    const d=await readJson('assets/cities/taipei/'+id+'.json');
    assert.ok(d.meshes.every(m=>m.material.type==='source-vehicle'));
    assert.equal(d.textures[0].premultiplyAlpha,true);
  }
  const d=await readJson('assets/cities/taipei/road-markings.json');
  assert.ok(d.meshes.every(m=>m.attributes.aRect&&m.material.type==='source-marking'));
});

test('transitive source files and frozen extraction identity are traceable', async () => {
  const m=await readJson('assets/cities/taipei/manifest.json');
  assert.match(m.version,/^source-v1-[a-f0-9]{12}$/);
  assert.ok(m.sourceFiles.length>20);
  for(const s of m.sourceFiles)assert.equal(hash(await readFile(path.join(sourceRoot,s.file))),s.sha256,s.file);
});
