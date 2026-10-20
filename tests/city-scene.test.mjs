import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { Track } from '../js/track.js';
import { createSourceLibrary } from '../js/cities/source-library.js';
import { trackDef, zones } from '../js/cities/taipei.js';
import { buildSourceCity } from '../js/cities/scene.js';

async function fixture() {
  const manifest = JSON.parse(await readFile('assets/cities/taipei/manifest.json'));
  const documents = new Map(), textures = new Map(), dependencies = new Map();
  for (const asset of manifest.assets) {
    const data = JSON.parse(await readFile(asset.url));
    documents.set(asset.id, data);
    for (const texture of data.textures ?? []) textures.set(texture.id, new THREE.Texture());
    for (const dependency of data.dependencies ?? []) {
      if (!dependencies.has(dependency.url)) dependencies.set(dependency.url, JSON.parse(await readFile(dependency.url)));
    }
  }
  const library = createSourceLibrary(manifest, documents, textures, dependencies);
  library.getDependency = (url) => dependencies.get(url);
  return library;
}

test('Taipei route keeps existing flat driving widths and all four zones', () => {
  const track = new Track(trackDef);
  assert.equal(trackDef.id, 'taipei');
  assert.equal(trackDef.routeRevision, 'taipei-loop-v1');
  assert.deepEqual(zones.map((zone) => zone.id), ['book-street', 'night-market', 'temple-square', 'commercial']);
  assert.ok(track.length > 1000 && track.length < 1100);
  for (const sample of track.samples) assert.equal(sample.pos.y, 0);
});

test('source city has finite transforms, safe complete building footprints and no untagged geometry', async () => {
  const lease = await fixture();
  const original = lease.instantiate('road-surface');
  const positions = original.children[0].geometry.attributes.position.array.slice();
  const city = buildSourceCity(new Track(trackDef), lease, { id: 'day', emissiveMul: .12 });
  const audit = city.audit();
  assert.deepEqual(audit.missingSourceIds, []);
  assert.deepEqual(audit.invalidTransforms, []);
  assert.deepEqual(audit.unsafePlacements, []);
  assert.deepEqual(audit.overlappingBuildings, []);
  assert.ok(audit.placements.filter((placement) => placement.kind === 'building').length >= 25);
  assert.ok(audit.sourceIds.includes('cisheng-temple'));
  assert.ok(audit.sourceIds.includes('road-surface'));
  assert.ok(audit.sourceIds.includes('road-markings'));
  assert.ok(audit.sourceIds.includes('crosswalk'));
  const commercial = audit.placements.filter((placement) => placement.s >= .735 && placement.s < .995 && placement.clearance < 30);
  const traditional = new Set(['zhangxiexing-tea', 'linhefa-oil-rice', 'liting-bakery', 'shuanglian-sweet-soup', 'jinfeng-lurou', 'longmen-pepper-bun', 'goose-mama-noodles', 'dazhi-douhua']);
  assert.ok(commercial.filter((placement) => traditional.has(placement.id)).length <= 2, 'commercial forecourt is distinct from the food-shop streets');
  assert.ok(city.group.getObjectByName('commercial-inner-forecourt'));
  assert.ok(city.group.getObjectByName('commercial-outer-forecourt'));
  assert.ok(city.group.getObjectByName('commercial-corner-garden'));
  for (const side of ['near', 'far', 'start', 'end']) {
    const boundary = city.group.getObjectByName('commercial-corner-' + side + '-curb');
    assert.ok(boundary);
    boundary.traverse((object) => {
      if (!object.geometry) return;
      const normal = object.geometry.attributes.normal;
      assert.ok(Array.from({ length: normal.count }, (_, i) => normal.getY(i)).some((y) => y > .99), 'garden boundary retains an upward visible top');
    });
  }
  assert.equal(city.group.getObjectByName('tree-far'), undefined, 'LOD diamond crowns never appear as near street trees');
  assert.equal(city.group.children.filter((object) => object.userData.commercialGardenTree).length, 3);
  const nearStreet = audit.placements.filter((placement) => placement.clearance < 30);
  for (let i = 0; i < nearStreet.length; i++) {
    for (let j = i + 1; j < nearStreet.length; j++) {
      const one = nearStreet[i], two = nearStreet[j];
      if (one.id !== two.id) continue;
      const delta = Math.abs(one.s - two.s);
      assert.ok(Math.min(delta, 1 - delta) * new Track(trackDef).length >= 45, 'same source shop cannot repeat in adjacent street lots');
    }
  }
  const templeBuildings = audit.placements.filter((placement) => placement.s >= .46 && placement.s < .72);
  assert.ok(templeBuildings.length >= 12, 'temple district retains an urban background');
  assert.ok(templeBuildings.filter((placement) => placement.side > 0 && placement.clearance >= 35).length >= 5, 'inner garden has a distant building edge');
  assert.equal(templeBuildings.filter((placement) => placement.side < 0 && placement.s > .505 && placement.s < .58 && placement.id !== 'cisheng-temple' && placement.clearance < 65).length, 0, 'temple foreground remains open');
  assert.ok(city.group.getObjectByName('temple-inner-garden'));
  assert.ok(city.group.getObjectByName('temple-front-plaza'));
  assert.ok(city.group.getObjectByName('temple-garden-boundary'));
  for (const name of ['temple-inner-garden', 'temple-front-plaza', 'temple-garden-walk']) {
    const surface = city.group.getObjectByName(name);
    surface.traverse((object) => {
      if (!object.geometry) return;
      const normals = object.geometry.attributes.normal;
      for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > .99, name);
      assert.ok(object.userData.sourceDerivation, name);
    });
  }
  assert.ok(audit.sourceIds.includes('ground-plaza'));
  assert.ok(city.group.getObjectByName('temple-outer-green-edge'));
  assert.ok(templeBuildings.filter((placement) => placement.side < 0 && placement.layer === 'temple-background').length >= 12, 'outer horizon retains a continuous low source street edge');
  assert.ok(city.group.children.filter((object) => object.userData.templePeripheryTree).length >= 8);
  assert.ok(city.group.children.filter((object) => object.userData.templeGardenTree).length >= 10);
  const normal = city.group.getObjectByName('road-surface').children[0].geometry.attributes.normal;
  for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > .99, 'road remains flat and upward-facing');
  for (const placement of audit.placements.filter((item) => item.kind === 'building')) {
    assert.ok(placement.roadClearance >= 10.6, placement.id);
  }
  assert.deepEqual(original.children[0].geometry.attributes.position.array, positions);
  let changed = 0;
  city.group.traverse((object) => {
    if (!object.geometry) return;
    assert.ok(object.userData.sourceAssetId, object.name);
    const position = object.geometry.attributes.position;
    assert.ok([...position.array].every(Number.isFinite), object.name);
    if (object.userData.sourceMutableGeometry) {
      changed++;
      object.geometry.addEventListener('dispose', () => { changed--; });
    }
  });
  assert.ok(changed >= 5);
  city.update(.016, 2);
  city.dispose();
  assert.equal(changed, 0);
  assert.equal(lease.instances.size, 1);
  lease.dispose();
});


test('street characters use original in-place clips, open rest eyelids and release their mixers', async () => {
  const lease = await fixture();
  const city = buildSourceCity(new Track(trackDef), lease, { id: 'day' });
  const actors = [];
  city.group.traverse((object) => {
    if (object.userData.sourceCharacter) actors.push(object.userData.sourceCharacter);
  });
  assert.equal(actors.length, 3, 'all three street characters use the source controller');
  const positions = actors.map((actor) => actor.mesh.position.toArray());
  const poses = actors.map((actor) => actor.skeleton.bones.map((bone) => [...bone.position.toArray(), ...bone.quaternion.toArray()]));
  for (const actor of actors) {
    assert.ok(['idle', 'wave'].includes(actor.currentClip));
    assert.equal(actor.bones.lidL.scale.y, .001);
    assert.equal(actor.bones.lidR.scale.y, .001);
  }
  city.update(.35, .35);
  actors.forEach((actor, i) => {
    assert.ok(actor.skeleton.bones.some((bone, j) => [...bone.position.toArray(), ...bone.quaternion.toArray()]
      .some((value, k) => Math.abs(value - poses[i][j][k]) > 1e-6)), 'source bones animate during city.update');
  });
  for (let frame = 0; frame < 360; frame++) city.update(1 / 30);
  actors.forEach((actor, i) => assert.deepEqual(actor.mesh.position.toArray(), positions[i], 'idle gestures remain out of the driving lane'));
  city.dispose();
  city.dispose();
  for (const actor of actors) assert.throws(() => actor.update(.1), /disposed/i);
  assert.equal(lease.instances.size, 0);
  lease.dispose();
});
