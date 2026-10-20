import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { createSourceMaterial } from '../js/cities/source-materials.js';

const surfaceTexture = () => new THREE.DataArrayTexture(new Uint8Array(35 * 4).fill(255), 1, 1, 35);
function compile(material, lib = THREE.ShaderLib.standard) {
  const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(shader);
  return shader;
}
const lmDef = { type: 'standard', sourceBucket: 'lm', vertexColors: true, surfaceMap: 'source-surfaces' };

test('source ground alpha is a weather-gated puddle field, never a dry roughness map', async () => {
  const data = JSON.parse(await readFile('assets/cities/taipei/road-surface.json'));
  const map = new THREE.Texture(), mask = new THREE.Texture();
  const material = createSourceMaterial(data.meshes[0].material,
    new Map([['ground-asphalt', map], ['ground-asphalt-roughness', mask]]));
  assert.equal(material.roughness, .88, 'world:fs[ASPHALT] is the dry baseline');
  assert.equal(material.roughnessMap, null, 'source alpha must not multiply dry roughness');
  const shader = compile(material);
  assert.equal(shader.uniforms.uGroundMask.value, mask);
  assert.equal(shader.uniforms.uWet.value, 0);
  assert.match(shader.fragmentShader, /float wetA = uWet \* gWetK;/);
  assert.match(shader.fragmentShader, /mix\(roughnessFactor, 0\.3, wetA\)/);
  assert.match(shader.fragmentShader, /gPuddle \* smoothstep\(0\.2, 0\.75, uWet\)/);
  assert.match(shader.fragmentShader, /mix\(roughnessFactor, 0\.045, pud\)/);
  assert.match(shader.fragmentShader, /gTexAlpha \* 0\.4 \+ gMacro \* 0\.3 \+ gMacro2 \* 0\.42/);
  material.userData.setSourceWeather({ id: 'day', wet: 0 });
  assert.equal(shader.uniforms.uWet.value, 0);
  material.userData.setSourceWeather({ id: 'night', wet: .85 });
  assert.equal(shader.uniforms.uWet.value, .85);
  assert.equal(shader.uniforms.uNight.value, 1);
  assert.equal(map.repeat.x, 1, 'instance hooks do not mutate shared texture transforms');
  material.dispose(); map.dispose(); mask.dispose();
});

test('all exported paving layers use their original independent dry and wet coefficients', () => {
  for (const [name, roughness, wetK, repeat] of [['paver', .8, .95, 2.4], ['concrete', .9, .8, 3],
    ['grass', 1, .35, 4], ['plaza', .74, .95, 4.8], ['curb', .8, .75, 2], ['granite', .72, .95, 2.4]]) {
    const map = new THREE.Texture(), mask = new THREE.Texture();
    const material = createSourceMaterial({ map: `ground-${name}`, roughnessMap: `ground-${name}-roughness` },
      new Map([[`ground-${name}`, map], [`ground-${name}-roughness`, mask]]));
    assert.equal(material.roughness, roughness);
    const shader = compile(material);
    assert.equal(shader.uniforms.uGroundWetK.value, wetK);
    assert.equal(shader.uniforms.uGroundRepeat.value, repeat);
    material.dispose(); map.dispose(); mask.dispose();
  }
});

test('LM decodes original array layers, AO, roughness/metalness and per-vertex masked emission', () => {
  const atlas = surfaceTexture();
  const material = createSourceMaterial(lmDef, new Map([['source-surfaces', atlas]]));
  assert.equal(material.vertexColors, false, 'aCol is decoded once instead of multiplying the generated color alias again');
  assert.equal(material.transparent, false);
  assert.equal(material.opacity, 1);
  const shader = compile(material);
  assert.equal(shader.uniforms.uAtlas.value, atlas);
  assert.match(shader.fragmentShader, /sampler2DArray uAtlas/);
  assert.match(shader.vertexShader, /vCol = aCol;/);
  assert.match(shader.vertexShader, /vLight = aLight;/);
  assert.match(shader.fragmentShader, /textureGrad\(uAtlas, vec3\(lmUv, lmLayer\)/);
  assert.match(shader.fragmentShader, /float roughnessFactor = vMatP\.x;/);
  assert.match(shader.fragmentShader, /float metalnessFactor = vMatP\.y;/);
  assert.match(shader.fragmentShader, /vLight\.rgb \* \(vLight\.a \* 8\.0\)/);
  assert.match(shader.fragmentShader, /lmEm \*= lmTex\.a;/);
  assert.match(shader.fragmentShader, /lmEm \*= lmK;/);
  assert.match(shader.fragmentShader, /reflectedLight\.indirectDiffuse \*= vCol\.a;/);
  assert.doesNotMatch(shader.fragmentShader, /diffuseColor\.a\s*\*=\s*vCol\.a/);
  material.dispose(); atlas.dispose();
});

test('LM window occupancy uses original stable per-cell hash and floodlighting is capped by source albedo', () => {
  const material = createSourceMaterial(lmDef, new Map([['source-surfaces', surfaceTexture()]]));
  const shader = compile(material);
  assert.match(shader.fragmentShader, /1664525u \+ 1013904223u/);
  assert.match(shader.fragmentShader, /float lit = step\(h, frac\);/);
  assert.match(shader.fragmentShader, /lmEm \*= lit \* \(0\.28 \+ 0\.42 \* v\) \* lmCeil \* tint;/);
  assert.match(shader.fragmentShader, /min\(fk, 0\.45\) \* uNight/);
  assert.match(shader.fragmentShader, /lmAlbedo \* uFloodColor/);
  assert.match(shader.vertexShader, /aInfo\.y/);
  assert.match(shader.vertexShader, /transformed\.x \+=/);
  material.dispose();
});

test('building weather and clocks are isolated per instance and update already-compiled shader uniforms', () => {
  const textures = new Map([['source-surfaces', surfaceTexture()]]);
  const day = createSourceMaterial(lmDef, textures), night = createSourceMaterial(lmDef, textures);
  const a = compile(day), b = compile(night);
  day.userData.setSourceWeather({ id: 'day', wet: .2 });
  night.userData.setSourceWeather({ id: 'night', wet: .8 });
  night.userData.setSourceTime(90);
  assert.equal(a.uniforms.uNight.value, 0);
  assert.equal(b.uniforms.uNight.value, 1);
  assert.equal(a.uniforms.uWet.value, .2);
  assert.equal(b.uniforms.uWet.value, .8);
  assert.equal(a.uniforms.uTime.value, 0);
  assert.equal(b.uniforms.uTime.value, 90);
  assert.notEqual(a.uniforms.uFloodColor, b.uniforms.uFloodColor);
  assert.deepEqual(b.uniforms.uFloodColor.value.toArray(), [1, .72, .44]);
  const version = night.version;
  night.userData.setSourceWeather({ id: 'dusk' });
  assert.equal(b.uniforms.uNight.value, .5);
  assert.equal(night.version, version, 'weather changes do not recompile shared shader programs');
  assert.equal(a.uniforms.uAtlas.value, b.uniforms.uAtlas.value);
  day.dispose(); night.dispose();
});

test('authored art keeps original unlit source material and color alpha is lighting influence rather than opacity', () => {
  const map = new THREE.Texture();
  const material = createSourceMaterial({ sourceBucket: 'art', map: 'art' }, new Map([['art', map]]));
  assert.ok(material.isMeshBasicMaterial);
  assert.equal(material.map, map);
  const shader = compile(material, THREE.ShaderLib.basic);
  assert.match(shader.fragmentShader, /mix\(uLight, vec3\(1\.0\), em\)/);
  assert.match(shader.fragmentShader, /diffuseColor\.a = opacity;/);
  assert.deepEqual(shader.uniforms.uLight.value.toArray(), [.95, .95, .95]);
  material.userData.setSourceWeather({ id: 'night' });
  assert.deepEqual(shader.uniforms.uLight.value.toArray(), [.95, .95, .95]);
  material.dispose(); map.dispose();
});

test('missing required LM surface arrays fail explicitly and ordinary/character/vehicle/marking hooks stay separate', () => {
  assert.throws(() => createSourceMaterial(lmDef, new Map()), /Missing source texture: source-surfaces/);
  const ordinary = createSourceMaterial({ type: 'standard' }, new Map());
  assert.equal(ordinary.userData.setSourceWeather, undefined);
  for (const type of ['source-character', 'source-vehicle', 'source-marking']) {
    const map = new THREE.Texture();
    const material = createSourceMaterial({ type, map: 'map' }, new Map([['map', map]]));
    assert.ok(material.isMeshStandardMaterial);
    assert.doesNotMatch(compile(material).fragmentShader, /sampler2DArray uAtlas/);
    material.dispose(); map.dispose();
  }
  ordinary.dispose();
});

test('current building library supplies normalized light/AO material channels with supported surface layers and flags', async () => {
  const manifest = JSON.parse(await readFile('assets/cities/taipei/manifest.json'));
  let lamps = 0, windows = 0, art = 0;
  for (const asset of manifest.assets.filter((entry) => entry.kind === 'building')) {
    const data = JSON.parse(await readFile(asset.url));
    for (const mesh of data.meshes) {
      if (mesh.material.sourceBucket === 'art') { art++; assert.equal(mesh.attributes.color.itemSize, 4); }
      if (!['lm', 'leaves'].includes(mesh.material.sourceBucket)) continue;
      assert.equal(mesh.material.surfaceMap, 'source-surfaces');
      for (const attr of ['aCol', 'aLight', 'aMat']) assert.equal(mesh.attributes[attr].normalized, true);
      assert.equal(mesh.attributes.aInfo.normalized, false);
      for (let i = 0; i < mesh.attributes.aInfo.array.length; i += 4) {
        const layer = mesh.attributes.aInfo.array[i], flags = mesh.attributes.aInfo.array[i + 1];
        assert.ok(layer >= 0 && layer < 35);
        assert.ok([0, 8, 32, 64].includes(flags));
        if (flags & 32) windows++;
        if (mesh.attributes.aLight.array[i + 3] > 0) lamps++;
      }
    }
  }
  assert.ok(lamps && windows && art);
});
