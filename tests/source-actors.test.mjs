import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createSourceLibrary } from '../js/cities/source-library.js';
import { buildSourceVehicle, sourceCarDefinitions, sourcePoliceDefinition } from '../js/cities/vehicles.js';
import { buildSourceCharacter } from '../js/cities/characters.js';

const read = async (file) => JSON.parse(await readFile(new URL('../' + file, import.meta.url)));
async function fixture(ids) {
  const manifest = await read('assets/cities/taipei/manifest.json');
  const assets = manifest.assets.filter((asset) => ids.includes(asset.id));
  const documents = new Map(), textures = new Map(), dependencies = new Map();
  for (const asset of assets) {
    const data = await read(asset.url);
    documents.set(asset.id, data);
    for (const definition of data.textures ?? []) textures.set(definition.id, new THREE.Texture());
    for (const dependency of data.dependencies ?? []) dependencies.set(dependency.url, await read(dependency.url));
  }
  const library = createSourceLibrary({ ...manifest, assets }, documents, textures, dependencies);
  return { library, instantiate: (id) => library.instantiate(id), getAsset: (id) => library.getAsset(id),
    getDependency: (url) => dependencies.get(url), releaseObject: (root) => library.releaseObject(root) };
}
const meshes = (root) => { const result = []; root.traverse((object) => { if (object.isMesh) result.push(object); }); return result; };
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('source definitions preserve four player ids, police spec and original collision dimensions', async () => {
  assert.deepEqual(sourceCarDefinitions.map((def) => def.sourceAssetId), ['sedan', 'taxi', 'sports', 'suv']);
  const lease = await fixture(['sedan', 'taxi', 'sports', 'suv', 'police']);
  try {
    for (const def of [...sourceCarDefinitions, sourcePoliceDefinition]) {
      const source = lease.getAsset(def.sourceAssetId).parameters.definition;
      assert.equal(def.tune.carHalfWidth, source.halfW);
      near(def.tune.maxSpeed, source.maxSpeed);
      assert.ok(def.id.startsWith('taipei-'));
      assert.equal(def.builder, 'source');
      assert.ok(def.name && def.nameEn && def.desc && def.descEn && def.stats);
    }
  } finally { lease.library.dispose(); }
});

test('source wheels spin and steer around original pivots without mutating shared source geometry', async () => {
  const lease = await fixture(['sedan']);
  try {
    const car = buildSourceVehicle(sourceCarDefinitions[0], lease);
    const other = buildSourceVehicle(sourceCarDefinitions[0], lease);
    assert.equal(car.mesh.userData.sourceAssetId, 'sedan');
    assert.equal(car.parts.wheels.length, 4);
    assert.equal(car.parts.wheelRadius, .33);
    assert.equal(car.parts.wheels.filter((wheel) => wheel.steerable).length, 2);
    const source = lease.getAsset('sedan');
    car.mesh.updateMatrixWorld(true);
    for (const [i, wheel] of car.parts.wheels.entries()) {
      const pivot = source.parts.wheels[i].pivot;
      assert.deepEqual(wheel.group.position.toArray(), [-pivot[0], pivot[1], -pivot[2]]);
      const part = meshes(wheel.spinner)[0], twin = meshes(other.parts.wheels[i].spinner)[0];
      assert.equal(part.geometry, twin.geometry);
      const original = part.geometry.attributes.position.array.slice();
      const point = new THREE.Vector3().fromBufferAttribute(part.geometry.attributes.position, 0);
      const expected = point.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      near(part.localToWorld(point).distanceTo(expected), 0);
      const centerBefore = wheel.group.getWorldPosition(new THREE.Vector3());
      wheel.spinner.rotation.x = .8;
      if (wheel.steerable) wheel.group.rotation.y = .3;
      car.mesh.updateMatrixWorld(true);
      near(wheel.group.getWorldPosition(new THREE.Vector3()).distanceTo(centerBefore), 0);
      assert.deepEqual(part.geometry.attributes.position.array, original);
      assert.equal(other.parts.wheels[i].spinner.rotation.x, 0);
    }
    assert.equal(car.parts.bodyGroup.rotation.x, 0);
    assert.equal(car.parts.bodyGroup.rotation.y, 0);
    assert.ok(meshes(car.mesh).every((mesh) => mesh.userData.sourceAssetId === 'sedan'));
  } finally { lease.library.dispose(); }
});

test('simultaneous player, ghost, preview and police have independent brake, opacity and siren state', async () => {
  const lease = await fixture(['sedan', 'police']);
  try {
    const player = buildSourceVehicle(sourceCarDefinitions[0], lease);
    const ghost = buildSourceVehicle(sourceCarDefinitions[0], lease);
    const preview = buildSourceVehicle(sourceCarDefinitions[0], lease);
    const police = buildSourceVehicle(sourcePoliceDefinition, lease);
    const secondPolice = buildSourceVehicle(sourcePoliceDefinition, lease);
    const p = meshes(player.mesh), g = meshes(ghost.mesh), v = meshes(preview.mesh);
    assert.equal(p[0].geometry, g[0].geometry);
    assert.notEqual(p[0].material, g[0].material);
    for (const mesh of g) { mesh.material.transparent = true; mesh.material.opacity = .3; }
    player.parts.setBraking(true);
    player.parts.setLights({ headlights: 1 });
    player.parts.updateLights(.1);
    police.parts.flashPolice(true);
    for (const mesh of p.filter((mesh) => [2, 3].includes(mesh.material.userData.sourceLightTag))) {
      assert.ok(mesh.material.emissiveIntensity >= 3.2);
    }
    assert.ok(p.every((mesh) => mesh.material.opacity === 1));
    assert.ok(v.every((mesh) => mesh.material.opacity === 1));
    const red = meshes(police.mesh).filter((mesh) => mesh.material.userData.sourceLightTag === 6);
    const blue = meshes(police.mesh).filter((mesh) => mesh.material.userData.sourceLightTag === 7);
    assert.ok(red.length && blue.length);
    assert.ok(red.every((mesh) => mesh.material.emissiveIntensity > 0));
    assert.ok(blue.every((mesh) => mesh.material.emissiveIntensity === 0));
    assert.ok(meshes(secondPolice.mesh).filter((mesh) => [6, 7].includes(mesh.material.userData.sourceLightTag)).every((mesh) => mesh.material.emissiveIntensity === 0));
    player.parts.setBraking(false);
    assert.ok(p.filter((mesh) => mesh.material.userData.sourceLightTag === 3).every((mesh) => mesh.material.emissiveIntensity === 0));
    const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>\n#include <emissivemap_fragment>' };
    red[0].material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb \* sourceLampIntensity/);
    assert.equal(shader.uniforms.sourceLampIntensity.value, red[0].material.emissiveIntensity);
    assert.ok(g[0].material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile);
  } finally { lease.library.dispose(); }
});

test('missing source vehicle or required wheel semantics fail explicitly without legacy geometry', async () => {
  const lease = await fixture(['sedan']);
  try {
    assert.throws(() => buildSourceVehicle({ id: 'gt', builder: 'gt' }, lease), /source vehicle/i);
    const bad = { ...lease.getAsset('sedan'), parts: { wheels: [] } };
    assert.throws(() => buildSourceVehicle(sourceCarDefinitions[0], { ...lease, getAsset: () => bad }), /wheel/i);
    assert.equal(lease.library.instances.size, 0);
  } finally { lease.library.dispose(); }
});

test('original character clips animate independent source rigs in place with scaled hips', async () => {
  const lease = await fixture(['character-jie', 'character-police']);
  try {
    const actor = buildSourceCharacter('suspect', lease);
    const twin = buildSourceCharacter('suspect', lease);
    const cop = buildSourceCharacter('cop', lease);
    assert.equal(actor.mesh.userData.sourceAssetId, 'character-jie');
    assert.equal(cop.mesh.userData.sourceAssetId, 'character-police');
    assert.equal(actor.skeleton.bones.length, 27);
    assert.notEqual(actor.skeleton, twin.skeleton);
    assert.notEqual(actor.mixer, twin.mixer);
    assert.equal(meshes(actor.mesh)[0].geometry, meshes(twin.mesh)[0].geometry);
    const twinPose = twin.skeleton.bones.map((bone) => bone.quaternion.toArray());
    actor.mesh.position.set(4, 0, 8);
    actor.play('walk', { fade: 0 });
    actor.update(.3);
    assert.ok(actor.skeleton.bones.some((bone, i) => bone.quaternion.toArray().some((value, j) => Math.abs(value - twinPose[i][j]) > .01)));
    assert.deepEqual(twin.skeleton.bones.map((bone) => bone.quaternion.toArray()), twinPose);
    assert.deepEqual(actor.mesh.position.toArray(), [4, 0, 8]);
    const data = lease.getAsset('character-jie');
    const animation = lease.getDependency(data.dependencies.find((dependency) => dependency.url.includes('animations')).url);
    const frame = 9, hips = animation.clips.find((clip) => clip.name === 'walk').hips.slice(frame * 3, frame * 3 + 3);
    hips.forEach((value, i) => near(actor.bones.hips.position.getComponent(i), value * data.skeleton.animationScale, 1e-5));
    actor.play('surrender', { fade: 0 });
    assert.equal(actor.currentClip, 'cheer');
    assert.throws(() => actor.play('nonexistent-clip'), /source animation/i);
    actor.dispose(); actor.dispose();
    assert.equal(lease.library.instances.size, 2);
    assert.throws(() => actor.update(.1), /disposed/i);
    twin.update(.2);
    assert.ok(twin.mesh.parent === null);
  } finally { lease.library.dispose(); }
});

test('characters keep their original rest feet and release mixers without disposing another instance geometry', async () => {
  const lease = await fixture(['character-ama']);
  try {
    const one = buildSourceCharacter('ama', lease), two = buildSourceCharacter('ama', lease);
    const geometry = meshes(two.mesh)[0].geometry;
    let disposed = 0;
    geometry.addEventListener('dispose', () => disposed++);
    assert.equal(one.mesh.position.y, 0);
    const rest = lease.getAsset('character-ama').skeleton.jointPositions;
    one.play('idle', { fade: 0 }); one.update(0);
    assert.ok(one.bones.footL.getWorldPosition(new THREE.Vector3()).y > -.1);
    assert.ok(rest[1] > 0);
    one.dispose();
    assert.equal(disposed, 0);
    two.play('walk'); two.update(.2);
    two.dispose();
    assert.equal(disposed, 0);
  } finally { lease.library.dispose(); }
});
