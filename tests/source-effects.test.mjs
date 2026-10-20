import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {createSourceLibrary} from '../js/cities/source-library.js';

async function library() {
  const all=JSON.parse(await readFile('assets/cities/taipei/manifest.json'));
  const manifest={...all,assets:all.assets.filter(a=>['source-fx','character-jie','character-police'].includes(a.id))};
  const docs=new Map(),textures=new Map(),dependencies=new Map();
  for(const a of manifest.assets){const d=JSON.parse(await readFile(a.url));docs.set(a.id,d);for(const t of d.textures??[])textures.set(t.id,new THREE.Texture());for(const f of d.dependencies??[])dependencies.set(f.url,JSON.parse(await readFile(f.url)));}
  const lib=createSourceLibrary(manifest,docs,textures,dependencies);
  return {...lib,getDependency:url=>dependencies.get(url)};
}

test('source FX instances retain original shaders and isolate capacity, clocks and disposal', async () => {
  const {SourceEffects}=await import('../js/cities/effects.js');
  const lease=await library(),scene=new THREE.Scene();
  const a=new SourceEffects(scene,lease,{id:'night'},{capacity:8,random:()=>.5});
  const b=new SourceEffects(scene,lease,{id:'day'},{capacity:8,random:()=>.5});
  a.addSmoke(0,0,2,0);a.addSkid(0,0,0,1);a.burstSparks(0,1,0,2);
  a.update(.1,null,null,{});b.update(.1,null,null,{});
  assert.equal(a.mesh.geometry.instanceCount,4);
  assert.equal(b.mesh.geometry.instanceCount,0);
  assert.notEqual(a.mesh.material.uniforms.uClock,b.mesh.material.uniforms.uClock);
  assert.match(a.mesh.material.fragmentShader,/skid mark/);
  assert.deepEqual([...a.mesh.geometry.attributes.iSize.array.filter((_,i)=>i%4===2).slice(0,4)].sort(),[0,4,4,9]);
  assert.equal(a.mesh.material.uniforms.uNight.value,1);
  assert.equal(b.mesh.material.uniforms.uNight.value,0);
  a.dispose();a.dispose();assert.equal(lease.instances.size,1);
  b.dispose();lease.dispose();
});

test('source FX uses actual rear wheel anchors and remains bounded under sustained drift and Boost', async () => {
  const {SourceEffects}=await import('../js/cities/effects.js');
  const lease=await library(),scene=new THREE.Scene(),body=new THREE.Group();scene.add(body);
  const wheels=[-1,1].map(x=>{const group=new THREE.Group();group.position.set(x,.4,-1.7);body.add(group);return {group,radius:.4,steerable:false};});
  const car={pos:new THREE.Vector3(),heading:0,vel:new THREE.Vector3(0,0,20),speed:20,speedKmh:72,drifting:true,boosting:true,wheels,bodyGroup:body,cameraAnchors:{exhaustAt:new THREE.Vector3(.4,.3,-2.4),headAt:new THREE.Vector3(0,.7,2.4)},collisionDimensions:{halfWidth:1,halfLength:2.5}};
  const fx=new SourceEffects(scene,lease,{id:'night',headlights:true},{capacity:32,random:()=>.5});
  for(let i=0;i<100;i++)fx.update(.016,car,null,{handbrake:true});
  assert.ok(fx.mesh.geometry.instanceCount<=32);
  assert.ok(fx.particles.some(p=>p.kind===9&&Math.abs(p.x)===1&&p.z===-1.7));
  assert.ok(fx.particles.some(p=>p.kind===4));
  for(const a of Object.values(fx.mesh.geometry.attributes))assert.ok([...a.array].every(Number.isFinite));
  fx.reset();fx.update(.1,null,null,{});assert.equal(fx.mesh.geometry.instanceCount,0);
  fx.dispose();lease.dispose();
});

test('source arrest uses original rigs/actions, timed camera and one completion without legacy geometry', async () => {
  const {runSourceArrestCutscene}=await import('../js/cities/arrest.js');
  const lease=await library(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60);camera.position.set(0,5,-10);
  let done=0;
  const ctrl=runSourceArrestCutscene({scene,camera,car:{pos:new THREE.Vector3(),heading:0},role:'thief',cityLease:lease,onDone:()=>done++});
  assert.equal(lease.instances.size,3);
  for(let i=0;i<50;i++)ctrl.update(.04);
  assert.equal(ctrl.cop.mesh.visible,true);assert.equal(ctrl.suspect.mesh.visible,true);
  assert.equal(ctrl.cop.currentClip,'walk');
  const meshObjects=[];scene.traverse(o=>{if(o.isMesh)meshObjects.push(o);});
  assert.ok(meshObjects.every(o=>['source-fx','character-police','character-jie'].includes(o.userData.sourceAssetId)));
  assert.ok(camera.fov<60);
  for(let i=0;i<35;i++)ctrl.update(.04);
  const held = ctrl.suspect.skeleton.bones.map(b => b.quaternion.toArray());
  for(let i=0;i<10;i++)ctrl.update(.04);
  assert.deepEqual(ctrl.suspect.skeleton.bones.map(b => b.quaternion.toArray()), held);
  for(let i=0;i<55;i++)ctrl.update(.04);
  assert.equal(done,1);assert.equal(ctrl.active,false);assert.equal(lease.instances.size,0);
  ctrl.dispose();ctrl.update(1);assert.equal(done,1);lease.dispose();
});

test('city context hides every legacy FX, preserves grading, swaps atomically and restores legacy visibility', async () => {
  const { Effects } = await import('../js/effects.js');
  const lease = await library(), scene = new THREE.Scene();
  // Exercise the actual public router without requiring a Node WebGL canvas.
  const fx = Object.create(Effects.prototype);
  const object = () => new THREE.Object3D();
  Object.assign(fx, {
    scene, bloom: { strength: .75 }, grade: { uniforms: { uSpeed: { value: 0 } } },
    skidInst: Object.assign(object(), { count: 2, instanceMatrix: {} }),
    sparkLines: object(), rain: object(), streaks: object(),
    brakePool: Object.assign(object(), { material: { opacity: .5 } }),
    smokes: [{ life: 1, sprite: object() }], sparks: [{ life: 1 }],
    _flames: [{ group: object() }],
  });
  const legacy = [fx.skidInst, fx.sparkLines, fx.rain, fx.streaks, fx.brakePool, fx.smokes[0].sprite, fx._flames[0].group];
  fx.setCityContext(lease, { id: 'day' });
  assert.ok(legacy.every(o => !o.visible));
  assert.equal(fx.bloom.strength, .12);
  fx.addSkid(0, 0, 0, 1); fx.addSmoke(0, 0, 0, 0); fx.burstSparks(0, 1, 0, 1);
  const car = { pos: new THREE.Vector3(), speed: 0, speedKmh: 140, heading: 0,
    headlightPool: object(), underglow: object() };
  fx.update(.01, car, null, 0, {});
  assert.ok(fx.grade.uniforms.uSpeed.value > 0);
  assert.equal(car.headlightPool.visible, false); assert.equal(car.underglow.visible, false);
  assert.equal(fx.sourceEffects.mesh.geometry.instanceCount, 3);
  fx.setCityContext(lease, { id: 'night' });
  assert.equal(lease.instances.size, 1);
  assert.equal(fx.bloom.strength, .32);
  const live = fx.sourceEffects;
  assert.throws(() => fx.setCityContext({ instantiate() { throw new Error('allocation'); } }), /allocation/);
  assert.equal(fx.sourceEffects, live);
  const stagedRoot = new THREE.Group();
  const prepared = fx.prepareCityContext(lease, { id: 'night' }, stagedRoot);
  assert.equal(fx.sourceEffects, live); // Preparation cannot tear down the playing race.
  assert.equal(prepared.root.parent, stagedRoot);
  assert.equal(lease.instances.size, 2);
  fx.setCityContext(lease, { id: 'night' }, prepared);
  assert.equal(fx.sourceEffects, prepared);
  assert.equal(live.disposed, true);
  assert.equal(lease.instances.size, 1);
  fx.resetTransient(); assert.equal(prepared.mesh.geometry.instanceCount, 0);
  fx.setCityContext(null);
  assert.equal(lease.instances.size, 0);
  assert.equal(fx.bloom.strength, .75);
  assert.equal(fx.skidInst.visible, true); assert.equal(fx.sparkLines.visible, true);
  assert.equal(fx.rain.visible, true); assert.equal(fx.streaks.visible, false);
  assert.equal(fx.smokes[0].sprite.visible, false);
  lease.dispose();
});

test('public source arrest dispatch cancels without completion and rolls back failed source allocation', async () => {
  const { runArrestCutscene } = await import('../js/arrest.js');
  const lease = await library(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  let done = 0;
  const opts = { scene, camera, car: { pos: new THREE.Vector3(), heading: 0 }, role: 'cop',
    target: { pos: new THREE.Vector3(5, 0, 5), yaw: 1 }, cityLease: lease, onDone: () => done++ };
  const ctrl = runArrestCutscene(opts);
  ctrl.update(.05); ctrl.dispose(); ctrl.dispose(); ctrl.update(10);
  assert.equal(done, 0); assert.equal(scene.children.length, 0); assert.equal(lease.instances.size, 0);
  const failing = { ...lease, instantiate(id) { if (id === 'character-jie') throw new Error('missing suspect'); return lease.instantiate(id); } };
  assert.throws(() => runArrestCutscene({ ...opts, cityLease: failing }), /missing suspect/);
  assert.equal(scene.children.length, 0); assert.equal(lease.instances.size, 0);
  lease.dispose();
});
