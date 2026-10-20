import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceLibrary } from '../js/cities/source-library.js';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { WebGLShadowMap } from 'three/src/renderers/webgl/WebGLShadowMap.js';
const document = {id:'sample',meshes:[{name:'wall',attributes:{position:{type:'Float32Array',itemSize:3,array:[0,0,0,1,0,0,0,1,0]},aCol:{type:'Uint8Array',itemSize:4,normalized:true,array:[255,128,0,255,255,128,0,255,255,128,0,255]}},index:[0,1,2],material:{vertexColors:true,roughness:.8}}]};
const manifest = {assets:[{id:'sample',source:{file:'source.js',sha256:'a'.repeat(64)}}]};

test('instances share immutable geometry but isolate material and carry source proof', () => {
 const lib=createSourceLibrary(manifest,new Map([['sample',document]]),new Map());
 const a=lib.instantiate('sample'),b=lib.instantiate('sample');
 const ma=a.children[0],mb=b.children[0];
 assert.equal(ma.geometry,mb.geometry);assert.notEqual(ma.material,mb.material);
 ma.material.opacity=.3;assert.equal(mb.material.opacity,1);
 assert.equal(ma.userData.sourceAssetId,'sample');assert.equal(ma.geometry.attributes.color.itemSize,3);
 assert.equal(ma.geometry.attributes.color.getX(0),1);
 let geometries=0;ma.geometry.addEventListener('dispose',()=>geometries++);
 lib.releaseObject(a);assert.equal(geometries,0);assert.equal(lib.instances.size,1);
 lib.dispose();assert.equal(geometries,1);assert.equal(lib.instances.size,0);
 assert.throws(()=>lib.instantiate('sample'),/disposed/);
});

test('every recovered source asset can instantiate, including independent rigs and effect attributes', async () => {
 const manifest=JSON.parse(await readFile('assets/cities/taipei/manifest.json'));
 const documents=new Map(),textures=new Map();
 for(const asset of manifest.assets){
  const data=JSON.parse(await readFile(asset.url));documents.set(asset.id,data);
  for(const texture of data.textures??[])textures.set(texture.id,new THREE.Texture());
 }
 const lib=createSourceLibrary(manifest,documents,textures);
 for(const asset of manifest.assets){
  const root=lib.instantiate(asset.id);assert.equal(root.userData.sourceAssetId,asset.id);
 }
 const a=lib.instantiate('character-jie'),b=lib.instantiate('character-jie');
 const am=a.children.find(o=>o.isSkinnedMesh),bm=b.children.find(o=>o.isSkinnedMesh);
 assert.notEqual(am.skeleton,bm.skeleton);
 am.skeleton.bones[0].position.x=7;assert.notEqual(bm.skeleton.bones[0].position.x,7);
 const fx=lib.instantiate('source-fx'),other=lib.instantiate('source-fx');
 assert.equal(fx.children[0].material.isShaderMaterial,true);
 assert.notEqual(fx.children[0].geometry.attributes.iPos,other.children[0].geometry.attributes.iPos);
 lib.dispose();
});

test('missing assets and invalid geometry fail rather than substitute a legacy mesh', () => {
 const lib=createSourceLibrary(manifest,new Map([['sample',document]]),new Map());
 assert.throws(()=>lib.instantiate('absent'),/Missing source asset/);lib.dispose();
 const bad=structuredClone(document);bad.meshes[0].attributes.position.array[0]=NaN;
 assert.throws(()=>createSourceLibrary(manifest,new Map([['sample',bad]]),new Map()),/Non-finite/);
 const missing=structuredClone(document);missing.meshes[0].material.map='sign';
 assert.throws(()=>createSourceLibrary(manifest,new Map([['sample',missing]]),new Map()),/Missing source texture/);
});

test('source markers and FX never submit their hidden primitive geometry to the solid shadow pass', async () => {
  const documents = new Map([['sample', document]]), textures = new Map();
  for (const id of ['source-markers', 'source-fx']) {
    const data = JSON.parse(await readFile(`assets/cities/taipei/${id}.json`));
    documents.set(id, data);
    for (const texture of data.textures ?? []) textures.set(texture.id, new THREE.Texture());
  }
  const library = createSourceLibrary({ assets: [...documents.keys()].map((id) => ({ id })) }, documents, textures);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  for (const id of documents.keys()) scene.add(library.instantiate(id));
  const light = new THREE.DirectionalLight();
  light.position.set(1, 10, 1);
  scene.add(light, light.target);
  scene.updateMatrixWorld(true);
  // Run Three r160's actual shadow dispatcher. Replace only the GPU boundary:
  // marker iKind/aShape and FX particle uniforms must never reach MeshDepthMaterial.
  const submitted = [];
  const noop = () => {};
  const renderer = {
    getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: noop, clear: noop,
    state: { setBlending: noop, setScissorTest: noop, viewport: noop,
      buffers: { color: { setClear: noop }, depth: { setTest: noop } } },
    renderBufferDirect: (_camera, _scene, _geometry, material, object) => {
      submitted.push({ id: object.userData.sourceAssetId, material: material.type });
    },
  };
  try {
    const shadows = new WebGLShadowMap(renderer, { update: (object) => object.geometry }, { maxTextureSize: 4096 });
    shadows.enabled = true;
    shadows.render([light], scene, camera);
    assert.deepEqual(submitted, [{ id: 'sample', material: 'MeshDepthMaterial' }]);
  } finally {
    library.dispose();
    light.shadow.map?.dispose();
  }
});
