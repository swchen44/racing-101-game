// cars/pickup.js — 悍將皮卡:高底盤大輪 + 雙門座艙 + 開放貨斗 + 車頂LED光條 + 粗壯保桿 + side step
import * as THREE from 'three';
import {
  getCarEnvTexture, makeWheels, makeHeadlights, makeHeadlightPool,
  makeUnderglow, makeTailBar, makePaint,
} from './common.js';

export function build(def = {}) {
  const car = new THREE.Group();
  const envMap = getCarEnvTexture();
  const paint = makePaint(def.paint ?? 0x3a4048, { metalness: 0.3, roughness: 0.5, emissiveScale: 0.55 });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.6, roughness: 0.5 });
  const matteWell = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x2c3138, metalness: 0.85, roughness: 0.35, envMap, envMapIntensity: 1.0,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0e1c2c, metalness: 0.9, roughness: 0.08,
    envMap, envMapIntensity: 2.6,
  });

  // ---- 高底盤大梁 (外露車架 → 高離地感)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 4.9), matteWell);
  frame.position.set(0, 0.6, 0);
  car.add(frame);

  // ---- 引擎蓋段:高聳方正機艙 + 水箱罩
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.52, 1.55), paint);
  hood.position.set(0, 1.1, 1.9);
  hood.castShadow = true;
  car.add(hood);
  const hoodBulge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 1.2), paint);
  hoodBulge.position.set(0, 1.4, 1.85);
  car.add(hoodBulge);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.44, 0.08), matteWell);
  grille.position.set(0, 1.08, 2.66);
  car.add(grille);
  for (const y of [0.95, 1.08, 1.21]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.05, 0.05), steel);
    slat.position.set(0, y, 2.7);
    car.add(slat);
  }
  // 方形頭燈塊
  const headBlockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe9f3ff, emissiveIntensity: 2.0 });
  for (const sx of [1, -1]) {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.07), headBlockMat);
    hb.position.set(sx * 0.68, 1.24, 2.68);
    car.add(hb);
  }

  // ---- 雙門座艙:短艙室 (單排) + 玻璃艙 + 車頂板
  const cabBase = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.55), paint);
  cabBase.position.set(0, 1.08, 0.22);
  cabBase.castShadow = true;
  car.add(cabBase);
  const cabShape = new THREE.Shape();
  cabShape.moveTo(1.0, 1.3);
  cabShape.lineTo(0.5, 1.94);
  cabShape.lineTo(-0.5, 1.96);
  cabShape.lineTo(-0.75, 1.32);   // 直立後窗 (單排座艙短)
  cabShape.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: 1.6, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2,
  });
  cabGeo.translate(0, 0, -0.8);
  cabGeo.rotateY(-Math.PI / 2);
  {
    const p = cabGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.max(0, p.getY(i) - 1.4);
      p.setX(i, p.getX(i) * (1 - 0.32 * h));
    }
    p.needsUpdate = true;
  }
  const cabin = new THREE.Mesh(cabGeo, glass);
  cabin.castShadow = true;
  car.add(cabin);
  cabin.position.z = 0.22;
  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.95), paint);
  roofCap.position.set(0, 1.99, 0.2);
  car.add(roofCap);

  // ---- 車頂 LED 光條:深色框 + 燈條 + 燈艙分格
  const barMount = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.1, 0.2), darkTrim);
  barMount.position.set(0, 2.06, 0.55);
  car.add(barMount);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xfff8e0, emissive: 0xfff2c8, emissiveIntensity: 2.4 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.045, 0.04), ledMat);
  led.position.set(0, 2.06, 0.66);
  car.add(led);
  for (const x of [-0.5, -0.17, 0.17, 0.5]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.05), darkTrim);
    pod.position.set(x, 2.06, 0.65);
    car.add(pod);
  }

  // ---- 開放貨斗:側牆 + 前隔板 + 尾門 + 深色斗底
  const bedWallGeo = new THREE.BoxGeometry(0.15, 0.5, 1.85);
  for (const sx of [1, -1]) {
    const wall = new THREE.Mesh(bedWallGeo, paint);
    wall.position.set(sx * 0.87, 1.08, -1.72);
    wall.castShadow = true;
    car.add(wall);
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 1.9), darkTrim);
    railTop.position.set(sx * 0.87, 1.35, -1.72);
    car.add(railTop);
  }
  const bulkhead = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.5, 0.1), paint);
  bulkhead.position.set(0, 1.08, -0.82);
  car.add(bulkhead);
  const tailgate = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.48, 0.13), paint);
  tailgate.position.set(0, 1.06, -2.6);
  tailgate.castShadow = true;
  car.add(tailgate);
  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.75), matteWell);
  bedFloor.position.set(0, 0.86, -1.72);
  car.add(bedFloor);
  // 貨斗內備胎 (斜靠) — 越野識別小物
  const spareGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
  const spare = new THREE.Mesh(spareGeo, new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 }));
  spare.position.set(-0.25, 1.05, -1.9);
  spare.rotation.set(0.35, 0, 1.25);
  car.add(spare);

  // ---- 粗壯前保桿 (bull bar):鋼管框架 + 護板 + 拖車鉤
  const tubeV = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10);
  for (const sx of [0.55, -0.55]) {
    const t = new THREE.Mesh(tubeV, steel);
    t.position.set(sx, 1.02, 2.82);
    car.add(t);
  }
  const tubeH = new THREE.CylinderGeometry(0.055, 0.055, 1.6, 10);
  tubeH.rotateZ(Math.PI / 2);
  for (const y of [1.28, 0.98]) {
    const t = new THREE.Mesh(tubeH, steel);
    t.position.set(0, y, 2.84);
    car.add(t);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, 0.28), darkTrim);
  bumper.position.set(0, 0.72, 2.62);
  car.add(bumper);
  const skid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 0.1), steel);
  skid.position.set(0, 0.6, 2.7);
  skid.rotation.x = 0.35;
  car.add(skid);
  const hookMat = new THREE.MeshStandardMaterial({ color: 0xc22c1e, roughness: 0.6, emissive: 0x5c130c, emissiveIntensity: 0.6 });
  for (const sx of [0.42, -0.42]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.14), hookMat);
    hook.position.set(sx, 0.56, 2.66);
    car.add(hook);
  }

  // ---- side step 側踏板 (含支架)
  for (const sx of [1, -1]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 1.6), darkTrim);
    step.position.set(sx * 1.04, 0.6, 0.55);
    car.add(step);
    for (const z of [1.1, 0.0]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), steel);
      strut.position.set(sx * 0.95, 0.72, z);
      car.add(strut);
    }
  }
  // 後視鏡
  for (const sx of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), darkTrim);
    arm.position.set(sx * 1.0, 1.62, 0.92);
    car.add(arm);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.2), darkTrim);
    mirror.position.set(sx * 1.08, 1.6, 0.9);
    car.add(mirror);
  }
  // 進氣呼吸管 (snorkel):右 A 柱
  const snorkel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.12), darkTrim);
  snorkel.position.set(0.92, 1.6, 1.06);
  snorkel.rotation.x = -0.32;
  car.add(snorkel);
  const snorkelHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.24), darkTrim);
  snorkelHead.position.set(0.92, 1.92, 0.92);
  car.add(snorkelHead);

  // ---- 車尾:尾門面板 + 全寬尾燈 + 直立尾燈塊
  const { tailMat, tailMidMat, brakeLight } = makeTailBar(car, { width: 1.6, y: 1.18, z: -2.68 });
  for (const sx of [0.86, -0.86]) {
    const vt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.05), tailMat);
    vt.position.set(sx, 1.06, -2.68);
    car.add(vt);
  }
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.26, 0.24), darkTrim);
  rearBumper.position.set(0, 0.68, -2.62);
  car.add(rearBumper);
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x6c737d, metalness: 1.0, roughness: 0.3 });
  const exGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10);
  exGeo.rotateX(Math.PI / 2);
  const ex = new THREE.Mesh(exGeo, exhaustMat);
  ex.position.set(0.62, 0.58, -2.6);
  car.add(ex);

  // ---- 大輪 + 輪拱 + 外擴葉子板
  const positions = [
    [0.98, 0.58, 1.75, true], [-0.98, 0.58, 1.75, true],
    [0.98, 0.58, -1.62, false], [-0.98, 0.58, -1.62, false],
  ];
  const wellGeo = new THREE.BoxGeometry(0.24, 1.1, 1.5);
  const flareGeo = new THREE.BoxGeometry(0.34, 0.3, 1.6);
  for (const [x, , z, steerable] of positions) {
    const sx = Math.sign(x);
    const well = new THREE.Mesh(wellGeo, matteWell);
    well.position.set(sx * 0.78, 0.72, z);
    car.add(well);
    const flare = new THREE.Mesh(flareGeo, darkTrim);
    flare.position.set(sx * 1.0, steerable ? 1.28 : 1.26, z);
    flare.castShadow = true;
    car.add(flare);
  }

  // ---- 共用件
  const { wheels, rimMatRear, wheelRadius } = makeWheels(car, positions, {
    radius: 0.58, width: 0.5, spokes: 6, rimEmissive: 0x5f6a76,
  });
  const underglow = makeUnderglow(car, { color: 0xffb63a, opacity: 0.1, w: 2.6, l: 5.4 });
  const headlights = makeHeadlights(car, { sx: 0.68, y: 1.24, z: 2.7, intensity: 85 });
  const headlightPool = makeHeadlightPool({ color: 0xc9d6e2, opacity: 0.11 });

  const rig = new THREE.Group();
  rig.add(car);
  rig.add(headlightPool);
  return {
    mesh: rig,
    parts: {
      bodyGroup: car, wheels, rimMatRear, wheelRadius,
      tailMat, tailMidMat, brakeLight,
      underglow, headlights, headlightPool,
    },
  };
}
