// cars/evcity.js — 都會 e-GO:電動都會小車。短軸距兩門蛋形、大玻璃艙、圓潤友善、小輪
import * as THREE from 'three';
import {
  getCarEnvTexture, makeWheels, makeHeadlights, makeHeadlightPool,
  makeUnderglow, makePaint,
} from './common.js';

export function build(def = {}) {
  const car = new THREE.Group();
  const envMap = getCarEnvTexture();
  const paint = makePaint(def.paint ?? 0x7de07a, { metalness: 0.12, roughness: 0.45 });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.5, roughness: 0.55 });
  const matteWell = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x101f30, metalness: 0.85, roughness: 0.08,
    envMap, envMapIntensity: 2.4,
  });

  // 蛋形 taper:兩端強力收圓
  const eggTaper = (geo, halfLen = 1.66, f = 0.30, r = 0.28) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zn = THREE.MathUtils.clamp(p.getZ(i) / halfLen, -1, 1);
      const k = zn >= 0 ? f : r;
      p.setX(i, p.getX(i) * (1 - k * Math.pow(Math.abs(zn), 1.9)));
    }
    p.needsUpdate = true;
  };

  // ---- 下車身 (腰線以下):高圓潤剖面、頭尾上翹收圓
  const shape = new THREE.Shape();
  shape.moveTo(-1.5, 0.42);
  shape.quadraticCurveTo(-1.66, 0.62, -1.62, 0.88);
  shape.quadraticCurveTo(-1.58, 1.0, -1.42, 1.0);      // 圓尾
  shape.quadraticCurveTo(-0.4, 1.06, 0.5, 1.02);
  shape.quadraticCurveTo(1.3, 0.96, 1.56, 0.84);       // 圓短鼻
  shape.quadraticCurveTo(1.68, 0.72, 1.62, 0.52);
  shape.quadraticCurveTo(1.5, 0.34, 1.3, 0.32);
  shape.quadraticCurveTo(0.4, 0.28, -0.5, 0.30);
  shape.quadraticCurveTo(-1.2, 0.32, -1.5, 0.42);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.06, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.13, bevelSegments: 3,
  });
  bodyGeo.translate(0, 0, -0.53);
  bodyGeo.rotateY(-Math.PI / 2);
  eggTaper(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  car.add(body);

  // ---- 大玻璃艙:高聳圓拱、幾乎整個上半是玻璃
  const cabShape = new THREE.Shape();
  cabShape.moveTo(1.18, 0.92);
  cabShape.quadraticCurveTo(0.9, 1.3, 0.42, 1.46);
  cabShape.quadraticCurveTo(-0.2, 1.56, -0.72, 1.46);
  cabShape.quadraticCurveTo(-1.22, 1.3, -1.34, 0.92);
  cabShape.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: 0.94, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.08, bevelSegments: 3,
  });
  cabGeo.translate(0, 0, -0.47);
  cabGeo.rotateY(-Math.PI / 2);
  {
    const p = cabGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.max(0, p.getY(i) - 1.0);
      p.setX(i, p.getX(i) * (1 - 0.42 * h));         // tumblehome
      const zn = THREE.MathUtils.clamp(p.getZ(i) / 1.35, -1, 1);
      p.setX(i, p.getX(i) * (1 - 0.18 * Math.pow(Math.abs(zn), 2)));
    }
    p.needsUpdate = true;
  }
  const cabin = new THREE.Mesh(cabGeo, glass);
  cabin.castShadow = true;
  car.add(cabin);

  // ---- 車頂小帽 (paint 色):蛋形頂蓋,兩色調
  const roofGeo = new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.34);
  roofGeo.scale(0.62, 0.34, 1.18);
  const roof = new THREE.Mesh(roofGeo, paint);
  roof.position.set(0, 1.28, -0.14);
  roof.castShadow = true;
  car.add(roof);

  // ---- 圓形大眼頭燈 (友善) + 微笑飾條
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.0 });
  const eyeRingMat = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.6, roughness: 0.4 });
  for (const s of [1, -1]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.05, 18), eyeRingMat);
    ring.rotation.x = Math.PI / 2 + 0.25;
    ring.position.set(s * 0.45, 0.78, 1.56);
    car.add(ring);
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 18), eyeMat);
    eye.rotation.x = Math.PI / 2 + 0.25;
    eye.position.set(s * 0.45, 0.78, 1.585);
    car.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 16, Math.PI * 0.7), darkTrim);
  smile.position.set(0, 0.62, 1.62);
  smile.rotation.z = Math.PI + Math.PI * 0.15;
  car.add(smile);

  // ---- 圓形尾燈 (紅) + 小尾條
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 1.6 });
  let brakeLight = null;
  for (const s of [1, -1]) {
    const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 16), tailMat);
    tl.rotation.x = Math.PI / 2 - 0.2;
    tl.position.set(s * 0.5, 0.86, -1.6);
    car.add(tl);
    if (!brakeLight) brakeLight = tl;
  }
  const tailMidMat = new THREE.MeshStandardMaterial({ color: 0x2a0006, emissive: 0xff1a2e, emissiveIntensity: 0.8 });
  const tailStrip = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.05), tailMidMat);
  tailStrip.position.set(0, 0.86, -1.63);
  car.add(tailStrip);

  // ---- 深色下裙 + 充電孔蓋
  const rocker = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.16, 1.9), darkTrim);
  rocker.position.set(0, 0.32, 0);
  car.add(rocker);
  const chargePort = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12), darkTrim);
  chargePort.rotation.z = Math.PI / 2;
  chargePort.position.set(0.72, 0.9, -1.0);
  car.add(chargePort);

  // ---- 可愛小圓鏡
  for (const s of [1, -1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.04), darkTrim);
    stalk.position.set(s * 0.74, 1.0, 0.72);
    car.add(stalk);
    const mir = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), paint);
    mir.scale.set(0.7, 1, 1.3);
    mir.position.set(s * 0.8, 1.02, 0.7);
    car.add(mir);
  }

  // ---- 門縫線 (兩門暗示)
  for (const s of [1, -1]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.02), darkTrim);
    seam.position.set(s * 0.72, 0.62, -0.42);
    car.add(seam);
  }

  // ---- 小輪 + 輪拱井
  const positions = [
    [0.64, 0.36, 1.02, true], [-0.64, 0.36, 1.02, true],
    [0.64, 0.36, -1.02, false], [-0.64, 0.36, -1.02, false],
  ];
  const wellGeo = new THREE.BoxGeometry(0.18, 0.72, 0.9);
  for (const [x, , z] of positions) {
    const s = Math.sign(x);
    const well = new THREE.Mesh(wellGeo, matteWell);
    well.position.set(s * (Math.abs(x) - 0.24), 0.38, z);
    car.add(well);
  }
  const { wheels, rimMatRear, wheelRadius } = makeWheels(car, positions, { radius: 0.36, width: 0.24, spokes: 6, rimEmissive: 0x6fae72 });

  // ---- 共用件
  const underglow = makeUnderglow(car, { color: 0x59d96a, opacity: 0.1, w: 1.8, l: 3.4 });
  const headlights = makeHeadlights(car, { sx: 0.45, y: 0.78, z: 1.55, intensity: 60 });
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
