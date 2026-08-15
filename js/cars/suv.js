// cars/suv.js — 峰行 SUV:高車身兩箱式 + 車頂行李架 + 大面積玻璃 + 鍍鉻窗框線
import * as THREE from 'three';
import {
  getCarEnvTexture, makeWheels, makeHeadlights, makeHeadlightPool,
  makeUnderglow, makeTailBar, makePaint,
} from './common.js';

export function build(def = {}) {
  const car = new THREE.Group();
  const envMap = getCarEnvTexture();
  const paint = makePaint(def.paint ?? 0x8a2f3c, { metalness: 0.22, roughness: 0.4 });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.6, roughness: 0.5 });
  const matteWell = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xe8edf4, metalness: 1.0, roughness: 0.12,
    envMap, envMapIntensity: 1.9, emissive: 0x39404a, emissiveIntensity: 0.9,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0e1c2c, metalness: 0.9, roughness: 0.08,
    envMap, envMapIntensity: 2.6,
  });

  const applyTaper = (geo, halfLen = 2.4) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zn = THREE.MathUtils.clamp(p.getZ(i) / halfLen, -1, 1);
      const s = zn >= 0 ? 1 - 0.12 * Math.pow(zn, 1.8) : 1 - 0.07 * Math.pow(-zn, 1.8);
      p.setX(i, p.getX(i) * s);
    }
    p.needsUpdate = true;
  };

  // ---- 下箱體:高腰線兩箱式輪廓 ~4.8m (尾門直立、引擎蓋短高)
  const shape = new THREE.Shape();
  shape.moveTo(-2.28, 0.62);
  shape.lineTo(-2.34, 1.16);                       // 直立尾門
  shape.quadraticCurveTo(-1.6, 1.18, -0.8, 1.17);  // 平腰線
  shape.quadraticCurveTo(0.2, 1.16, 0.92, 1.13);
  shape.quadraticCurveTo(1.7, 1.06, 2.3, 1.0);     // 短高引擎蓋
  shape.quadraticCurveTo(2.4, 0.97, 2.4, 0.9);
  shape.lineTo(2.4, 0.58);
  shape.quadraticCurveTo(1.1, 0.55, 0, 0.55);
  shape.quadraticCurveTo(-1.1, 0.56, -2.28, 0.62);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.72, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2,
  });
  bodyGeo.translate(0, 0, -0.86);
  bodyGeo.rotateY(-Math.PI / 2);
  applyTaper(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  car.add(body);

  // ---- 深色下段防刮膠條 + 車底封板 (SUV cladding)
  const cladding = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.26, 3.7), darkTrim);
  cladding.position.set(0, 0.5, 0.05);
  car.add(cladding);
  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 4.2), matteWell);
  floorPan.position.set(0, 0.44, 0);
  car.add(floorPan);
  // 前後銀色護板
  const skidF = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.12), chrome);
  skidF.position.set(0, 0.52, 2.36);
  car.add(skidF);
  const skidR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.12), chrome);
  skidR.position.set(0, 0.52, -2.3);
  car.add(skidR);

  // ---- 大面積玻璃艙:長 greenhouse (直立尾窗 → 兩箱式) + tumblehome
  const cabShape = new THREE.Shape();
  cabShape.moveTo(1.0, 1.12);
  cabShape.lineTo(0.38, 1.8);
  cabShape.lineTo(-1.72, 1.82);
  cabShape.lineTo(-2.12, 1.16);   // 近垂直尾窗
  cabShape.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: 1.56, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2,
  });
  cabGeo.translate(0, 0, -0.78);
  cabGeo.rotateY(-Math.PI / 2);
  {
    const p = cabGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.max(0, p.getY(i) - 1.25);
      p.setX(i, p.getX(i) * (1 - 0.38 * h));
    }
    p.needsUpdate = true;
  }
  const cabin = new THREE.Mesh(cabGeo, glass);
  cabin.castShadow = true;
  car.add(cabin);
  // B/C 柱:深色細柱切分大玻璃 → 車窗節奏
  for (const sx of [1, -1]) {
    for (const [z, w] of [[0.25, 0.07], [-0.75, 0.09]]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.52, w), darkTrim);
      pillar.position.set(sx * 0.74, 1.42, z);
      pillar.rotation.z = sx * -0.12;
      car.add(pillar);
    }
  }

  // ---- 鍍鉻窗框線:腰線亮條 (兩側) + A柱前緣 + 尾窗下緣
  for (const sx of [1, -1]) {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 3.1), chrome);
    belt.position.set(sx * 0.92, 1.17, -0.35);
    car.add(belt);
  }
  const beltRear = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.045, 0.03), chrome);
  beltRear.position.set(0, 1.19, -2.33);
  car.add(beltRear);
  // 車門把手鍍鉻點綴
  for (const sx of [1, -1]) {
    for (const z of [0.62, -0.42]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.26), chrome);
      handle.position.set(sx * 0.93, 1.02, z);
      car.add(handle);
    }
  }

  // ---- 車頂行李架:縱向雙軌 (含腳座) + 三橫桿
  const railGeo = new THREE.BoxGeometry(0.07, 0.08, 2.1);
  for (const sx of [0.56, -0.56]) {
    const rail = new THREE.Mesh(railGeo, darkTrim);
    rail.position.set(sx, 1.92, -0.6);
    car.add(rail);
    for (const z of [0.35, -0.6, -1.55]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.12), darkTrim);
      foot.position.set(sx, 1.86, z);
      car.add(foot);
    }
  }
  const crossGeo = new THREE.BoxGeometry(1.2, 0.05, 0.07);
  for (const z of [0.15, -0.6, -1.35]) {
    const bar = new THREE.Mesh(crossGeo, chrome);
    bar.position.set(0, 1.95, z);
    car.add(bar);
  }
  // 尾門上小遮陽突簷
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.34), paint);
  spoiler.position.set(0, 1.84, -2.1);
  spoiler.rotation.x = 0.12;
  spoiler.castShadow = true;
  car.add(spoiler);

  // ---- 車頭:鍍鉻格柵 + 方正頭燈
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 0.06), matteWell);
  grille.position.set(0, 0.86, 2.43);
  car.add(grille);
  for (const y of [0.78, 0.88, 0.98]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.035, 0.04), chrome);
    slat.position.set(0, y, 2.46);
    car.add(slat);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.0 });
  for (const sx of [1, -1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.08), headMat);
    h.position.set(sx * 0.66, 1.02, 2.4);
    h.rotation.x = -0.2;
    car.add(h);
    // 霧燈
    const fog = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.06), headMat);
    fog.position.set(sx * 0.7, 0.62, 2.42);
    car.add(fog);
  }
  // 後視鏡
  for (const sx of [1, -1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.2), paint);
    mirror.position.set(sx * 1.0, 1.34, 0.98);
    car.add(mirror);
  }

  // ---- 車尾:深色尾板 + 全寬尾燈 + 鍍鉻尾門飾條
  const tailPanel = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, 0.07), darkTrim);
  tailPanel.position.set(0, 1.16, -2.38);
  car.add(tailPanel);
  const { tailMat, tailMidMat, brakeLight } = makeTailBar(car, { width: 1.56, y: 1.28, z: -2.42 });
  const tailChrome = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.04), chrome);
  tailChrome.position.set(0, 0.98, -2.42);
  car.add(tailChrome);
  const rearValance = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 0.12), darkTrim);
  rearValance.position.set(0, 0.52, -2.34);
  car.add(rearValance);

  // ---- 輪組 / 輪拱 / 塑膠輪眉
  const positions = [
    [0.93, 0.47, 1.5, true], [-0.93, 0.47, 1.5, true],
    [0.93, 0.47, -1.45, false], [-0.93, 0.47, -1.45, false],
  ];
  const wellGeo = new THREE.BoxGeometry(0.2, 1.0, 1.3);
  const flareGeo = new THREE.BoxGeometry(0.26, 0.24, 1.36);
  for (const [x, , z] of positions) {
    const sx = Math.sign(x);
    const well = new THREE.Mesh(wellGeo, matteWell);
    well.position.set(sx * 0.66, 0.55, z);
    car.add(well);
    const flare = new THREE.Mesh(flareGeo, darkTrim);
    flare.position.set(sx * 0.94, 0.97, z);
    flare.castShadow = true;
    car.add(flare);
  }

  // ---- 共用件
  const { wheels, rimMatRear, wheelRadius } = makeWheels(car, positions, {
    radius: 0.47, width: 0.4, spokes: 7, rimEmissive: 0x76828f,
  });
  const underglow = makeUnderglow(car, { color: 0xbfd7ff, opacity: 0.1, w: 2.4, l: 4.8 });
  const headlights = makeHeadlights(car, { sx: 0.66, y: 1.02, z: 2.42, intensity: 78 });
  const headlightPool = makeHeadlightPool();

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
