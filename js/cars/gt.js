// cars/gt.js — GT 熾焰:低趴寬體超跑 (楔形座艙、Kamm tail、全寬尾燈條)
import * as THREE from 'three';
import {
  getCarEnvTexture, makeWheels, makeHeadlights, makeHeadlightPool,
  makeUnderglow, makePaint,
} from './common.js';

export function build(def = {}) {
  const car = new THREE.Group();
  const envMap = getCarEnvTexture();
  const paint = makePaint(def.paint ?? 0xff9d0c);
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.6, roughness: 0.5 });
  const matteWell = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0e1c2c, metalness: 0.9, roughness: 0.08,
    envMap, envMapIntensity: 2.6,
  });

  // 沿車長方向車寬 taper:車頭收窄、車尾微收、中後段最寬
  const applyTaper = (geo) => {
    const posAttr = geo.attributes.position;
    const halfLen = 2.45;
    for (let i = 0; i < posAttr.count; i++) {
      const zn = THREE.MathUtils.clamp(posAttr.getZ(i) / halfLen, -1, 1);
      const scale = zn >= 0
        ? 1 - 0.16 * Math.pow(zn, 1.8)
        : 1 - 0.07 * Math.pow(-zn, 1.8);
      posAttr.setX(i, posAttr.getX(i) * scale);
    }
    posAttr.needsUpdate = true;
  };

  // ---- 主車身:側面輪廓 extrude,底線高於輪心 → 輪子外露
  const shape = new THREE.Shape();
  shape.moveTo(-2.30, 0.58);
  shape.lineTo(-2.34, 0.86);
  shape.quadraticCurveTo(-2.05, 0.92, -1.5, 0.92);
  shape.quadraticCurveTo(-0.6, 0.95, 0.2, 0.93);
  shape.quadraticCurveTo(1.25, 0.80, 1.9, 0.68);
  shape.quadraticCurveTo(2.3, 0.61, 2.36, 0.58);
  shape.lineTo(2.36, 0.54);
  shape.quadraticCurveTo(1.2, 0.52, 0, 0.52);
  shape.quadraticCurveTo(-1.2, 0.53, -2.30, 0.58);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.6, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 2,
  });
  bodyGeo.translate(0, 0, -0.8);
  bodyGeo.rotateY(-Math.PI / 2);
  applyTaper(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  car.add(body);

  // ---- 深色下段:側裙 + 車底封板
  const rocker = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.24, 1.62), darkTrim);
  rocker.position.set(0, 0.46, 0);
  car.add(rocker);
  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 3.9), matteWell);
  floorPan.position.set(0, 0.42, 0);
  car.add(floorPan);

  // ---- 座艙:低矮斜面楔形 + tumblehome 收窄
  const cabShape = new THREE.Shape();
  cabShape.moveTo(0.62, 0.86);
  cabShape.lineTo(0.10, 1.20);
  cabShape.lineTo(-0.52, 1.23);
  cabShape.lineTo(-1.35, 0.86);
  cabShape.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: 1.0, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2,
  });
  cabGeo.translate(0, 0, -0.5);
  cabGeo.rotateY(-Math.PI / 2);
  {
    const p = cabGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.max(0, p.getY(i) - 0.9);
      p.setX(i, p.getX(i) * (1 - 0.55 * h));
    }
    p.needsUpdate = true;
  }
  const cabin = new THREE.Mesh(cabGeo, glass);
  cabin.castShadow = true;
  car.add(cabin);

  // ---- 前下擾流 + 進氣口 + 後擾流翼
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.1, 0.55), darkTrim);
  splitter.position.set(0, 0.44, 2.28);
  car.add(splitter);
  const intake = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.08), matteWell);
  intake.position.set(0, 0.58, 2.42);
  car.add(intake);
  const wingPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.14), darkTrim);
  wingPost.position.set(0.55, 1.02, -2.1); car.add(wingPost);
  const wingPost2 = wingPost.clone(); wingPost2.position.x = -0.55; car.add(wingPost2);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.05, 0.36), paint);
  wing.position.set(0, 1.14, -2.14); wing.rotation.x = -0.1;
  wing.castShadow = true;
  car.add(wing);
  for (const sx of [0.93, -0.93]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.34), darkTrim);
    plate.position.set(sx, 1.12, -2.14);
    car.add(plate);
  }

  // ---- 頭燈:細長 LED 眉形
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.0 });
  const headGeo = new THREE.BoxGeometry(0.46, 0.045, 0.1);
  for (const sx of [1, -1]) {
    const h = new THREE.Mesh(headGeo, headMat);
    h.position.set(sx * 0.52, 0.67, 2.2);
    h.rotation.z = sx * 0.14;
    h.rotation.x = -0.35;
    car.add(h);
  }

  // ---- 車尾燈組:全寬紅色光條 + 深色尾面板
  const tailPanel = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.44, 0.08), darkTrim);
  tailPanel.position.set(0, 0.78, -2.38);
  car.add(tailPanel);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 1.6 });
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.06, 0.05), tailMat);
  tailBar.position.set(0, 0.86, -2.41);
  car.add(tailBar);
  const tailMidMat = new THREE.MeshStandardMaterial({ color: 0x2a0006, emissive: 0xff1a2e, emissiveIntensity: 0.8 });
  const tailMid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.05), tailMidMat);
  tailMid.position.set(0, 0.7, -2.41);
  car.add(tailMid);
  const reverseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 0.5 });
  for (const sx of [0.5, -0.5]) {
    const rv = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), reverseMat);
    rv.position.set(sx, 0.66, -2.4);
    car.add(rv);
  }
  const finGeo = new THREE.BoxGeometry(0.05, 0.14, 0.24);
  for (let i = -1.5; i <= 1.5; i++) {
    const fin = new THREE.Mesh(finGeo, darkTrim);
    fin.position.set(i * 0.34, 0.4, -2.24);
    car.add(fin);
  }
  const valance = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.2, 0.14), darkTrim);
  valance.position.set(0, 0.48, -2.3);
  car.add(valance);
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x6c737d, metalness: 1.0, roughness: 0.3 });
  const exhaustGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10);
  exhaustGeo.rotateX(Math.PI / 2);
  for (const sx of [0.42, -0.42]) {
    const ex = new THREE.Mesh(exhaustGeo, exhaustMat);
    ex.position.set(sx, 0.5, -2.38);
    car.add(ex);
  }

  // ---- 輪拱陰影井 + fender blister
  const positions = [
    [0.92, 0.48, 1.42, true], [-0.92, 0.48, 1.42, true],
    [0.98, 0.48, -1.42, false], [-0.98, 0.48, -1.42, false],
  ];
  const wellGeo = new THREE.BoxGeometry(0.2, 1.0, 1.24);
  const blisterGeo = new THREE.BoxGeometry(0.3, 0.24, 1.3);
  for (const [x, , z, steerable] of positions) {
    const sx = Math.sign(x);
    const well = new THREE.Mesh(wellGeo, matteWell);
    well.position.set(sx * (Math.abs(x) - 0.3), 0.52, z);
    car.add(well);
    const blister = new THREE.Mesh(blisterGeo, paint);
    blister.position.set(sx * (Math.abs(x) + 0.01), steerable ? 0.86 : 0.92, z);
    blister.castShadow = true;
    car.add(blister);
  }

  // ---- 共用件:輪組 / underglow / 頭燈 / 光池
  const { wheels, rimMatRear, wheelRadius } = makeWheels(car, positions);
  const underglow = makeUnderglow(car);
  const headlights = makeHeadlights(car);
  const headlightPool = makeHeadlightPool();

  const rig = new THREE.Group();
  rig.add(car);
  rig.add(headlightPool);
  return {
    mesh: rig,
    parts: {
      bodyGroup: car, wheels, rimMatRear, wheelRadius,
      tailMat, tailMidMat, brakeLight: tailBar,
      underglow, headlights, headlightPool,
    },
  };
}
