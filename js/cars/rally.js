// cars/rally.js — 拉力 R4:掀背短尾 + 大後翼 + 車頂進氣孔 + 四顆輔助圓燈 + 賽事色帶 + 泥擋
import * as THREE from 'three';
import {
  getCarEnvTexture, makeWheels, makeHeadlights, makeHeadlightPool,
  makeUnderglow, makeTailBar, makePaint,
} from './common.js';

export function build(def = {}) {
  const car = new THREE.Group();
  const envMap = getCarEnvTexture();
  const paint = makePaint(def.paint ?? 0x2f6fe1);
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.6, roughness: 0.5 });
  const matteWell = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.0, roughness: 0.95 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0e1c2c, metalness: 0.9, roughness: 0.08,
    envMap, envMapIntensity: 2.6,
  });
  // 塗裝色帶材質:白 + 競技黃 (低 emissive 鎖色,夜景可讀)
  const liveryWhite = new THREE.MeshStandardMaterial({
    color: 0xe9edf4, roughness: 0.4, metalness: 0.1,
    emissive: 0x8b929e, emissiveIntensity: 0.55, envMap, envMapIntensity: 0.6,
  });
  const liveryYellow = new THREE.MeshStandardMaterial({
    color: 0xffc21e, roughness: 0.42, metalness: 0.1,
    emissive: 0x8a6a10, emissiveIntensity: 0.7, envMap, envMapIntensity: 0.6,
  });

  // 車寬 taper:車頭收窄、掀背尾微收
  const applyTaper = (geo, halfLen = 2.15) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zn = THREE.MathUtils.clamp(p.getZ(i) / halfLen, -1, 1);
      const s = zn >= 0 ? 1 - 0.14 * Math.pow(zn, 1.8) : 1 - 0.09 * Math.pow(-zn, 1.8);
      p.setX(i, p.getX(i) * s);
    }
    p.needsUpdate = true;
  };

  // ---- 主車身:掀背側面輪廓 (短尾高截斷、引擎蓋前傾) ~4.3m
  const shape = new THREE.Shape();
  shape.moveTo(-2.00, 0.60);
  shape.lineTo(-2.06, 1.02);                      // 高尾截斷 (掀背)
  shape.quadraticCurveTo(-1.65, 1.05, -1.20, 1.03);
  shape.quadraticCurveTo(-0.20, 1.03, 0.55, 0.98);
  shape.quadraticCurveTo(1.40, 0.90, 2.00, 0.80); // 引擎蓋下斜
  shape.quadraticCurveTo(2.26, 0.75, 2.28, 0.66);
  shape.lineTo(2.28, 0.56);
  shape.quadraticCurveTo(1.0, 0.52, 0, 0.52);
  shape.quadraticCurveTo(-1.0, 0.53, -2.00, 0.60);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.66, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.07, bevelSegments: 2,
  });
  bodyGeo.translate(0, 0, -0.83);
  bodyGeo.rotateY(-Math.PI / 2);
  applyTaper(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  car.add(body);

  // ---- 深色下段 + 車底封板
  const rocker = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.24, 1.5), darkTrim);
  rocker.position.set(0, 0.46, 0.05);
  car.add(rocker);
  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 3.6), matteWell);
  floorPan.position.set(0, 0.42, 0.05);
  car.add(floorPan);

  // ---- 座艙:掀背玻璃艙 (後窗陡、C柱短) + tumblehome
  const cabShape = new THREE.Shape();
  cabShape.moveTo(0.78, 0.98);
  cabShape.lineTo(0.22, 1.42);
  cabShape.lineTo(-0.90, 1.44);
  cabShape.lineTo(-1.52, 1.02);   // 陡後窗 → 短尾
  cabShape.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: 1.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2,
  });
  cabGeo.translate(0, 0, -0.58);
  cabGeo.rotateY(-Math.PI / 2);
  {
    const p = cabGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.max(0, p.getY(i) - 1.05);
      p.setX(i, p.getX(i) * (1 - 0.5 * h));
    }
    p.needsUpdate = true;
  }
  const cabin = new THREE.Mesh(cabGeo, glass);
  cabin.castShadow = true;
  car.add(cabin);

  // ---- 車頂進氣孔 (rally 標配):深色鏟形 + 黑色進氣嘴
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.56), darkTrim);
  scoop.position.set(0, 1.52, 0.18);
  scoop.rotation.x = 0.06;
  car.add(scoop);
  const scoopMouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), matteWell);
  scoopMouth.position.set(0, 1.53, 0.47);
  car.add(scoopMouth);
  // 車頂天線
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), darkTrim);
  aerial.position.set(-0.42, 1.6, -0.5);
  aerial.rotation.z = 0.12;
  car.add(aerial);

  // ---- 大後翼:高腳雙柱 + 寬翼板 + 端板 (掀背尾門上)
  for (const sx of [0.52, -0.52]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.16), darkTrim);
    post.position.set(sx, 1.2, -1.86);
    car.add(post);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.055, 0.4), paint);
  wing.position.set(0, 1.4, -1.9);
  wing.rotation.x = -0.14;
  wing.castShadow = true;
  car.add(wing);
  const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.02, 0.14), liveryWhite);
  wingStripe.position.set(0, 1.435, -1.87);
  wingStripe.rotation.x = -0.14;
  car.add(wingStripe);
  for (const sx of [0.84, -0.84]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.42), darkTrim);
    plate.position.set(sx, 1.4, -1.9);
    car.add(plate);
  }

  // ---- 車頭:輔助燈組 — 保桿上四顆小圓燈 (rally pod)
  const podBar = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.2, 0.1), darkTrim);
  podBar.position.set(0, 0.7, 2.26);
  car.add(podBar);
  const auxLensMat = new THREE.MeshStandardMaterial({
    color: 0xfff6dd, emissive: 0xffedbe, emissiveIntensity: 2.2,
  });
  const bezelGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.07, 14);
  bezelGeo.rotateX(Math.PI / 2);
  const lensGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14);
  lensGeo.rotateX(Math.PI / 2);
  for (const x of [-0.5, -0.2, 0.2, 0.5]) {
    const bezel = new THREE.Mesh(bezelGeo, darkTrim);
    bezel.position.set(x, 0.73, 2.3);
    car.add(bezel);
    const lens = new THREE.Mesh(lensGeo, auxLensMat);
    lens.position.set(x, 0.73, 2.34);
    car.add(lens);
  }
  // 主頭燈:兩側小眉燈
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.0 });
  for (const sx of [1, -1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.08), headMat);
    h.position.set(sx * 0.62, 0.74, 2.2);
    h.rotation.x = -0.3;
    car.add(h);
  }
  // 前下擾流
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.5), darkTrim);
  splitter.position.set(0, 0.44, 2.16);
  car.add(splitter);

  // ---- 賽事塗裝色帶 (幾何色塊)
  // 引擎蓋雙直條 (沿蓋面斜度貼合)
  const hoodAng = 0.124;
  for (const sx of [0.26, -0.26]) {
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 1.3), liveryWhite);
    s1.position.set(sx, 0.965, 1.3);
    s1.rotation.x = hoodAng;
    car.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 1.3), liveryYellow);
    s2.position.set(sx + Math.sign(sx) * 0.15, 0.962, 1.3);
    s2.rotation.x = hoodAng;
    car.add(s2);
  }
  // 車側色帶:白色寬帶 + 黃色細帶 (門板高度)
  for (const sx of [1, -1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 2.3), liveryWhite);
    w.position.set(sx * 0.885, 0.76, 0.1);
    car.add(w);
    const yl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 2.3), liveryYellow);
    yl.position.set(sx * 0.885, 0.65, 0.1);
    car.add(yl);
    // 門上賽事圓牌
    const roundelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.03, 18);
    roundelGeo.rotateZ(Math.PI / 2);
    const roundel = new THREE.Mesh(roundelGeo, liveryWhite);
    roundel.position.set(sx * 0.89, 0.85, 0.55);
    car.add(roundel);
  }

  // ---- 車尾:深色尾板 + 全寬尾燈 + 泥擋
  const tailPanel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.08), darkTrim);
  tailPanel.position.set(0, 0.82, -2.06);
  car.add(tailPanel);
  const { tailMat, tailMidMat, brakeLight } = makeTailBar(car, { width: 1.5, y: 0.94, z: -2.1 });
  const valance = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.2, 0.14), darkTrim);
  valance.position.set(0, 0.48, -2.0);
  car.add(valance);
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x6c737d, metalness: 1.0, roughness: 0.3 });
  const exGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10);
  exGeo.rotateX(Math.PI / 2);
  const ex = new THREE.Mesh(exGeo, exhaustMat);
  ex.position.set(0.45, 0.5, -2.06);
  car.add(ex);

  // ---- 輪組 / 輪拱 / 方箱葉子板 (box flare) / 泥擋
  const positions = [
    [0.88, 0.44, 1.32, true], [-0.88, 0.44, 1.32, true],
    [0.88, 0.44, -1.24, false], [-0.88, 0.44, -1.24, false],
  ];
  const wellGeo = new THREE.BoxGeometry(0.2, 0.94, 1.16);
  const flareGeo = new THREE.BoxGeometry(0.28, 0.26, 1.24);
  const flapGeo = new THREE.BoxGeometry(0.3, 0.32, 0.04);
  for (const [x, , z] of positions) {
    const sx = Math.sign(x);
    const well = new THREE.Mesh(wellGeo, matteWell);
    well.position.set(sx * (Math.abs(x) - 0.28), 0.5, z);
    car.add(well);
    const flare = new THREE.Mesh(flareGeo, paint);
    flare.position.set(sx * 0.92, 0.9, z);
    flare.castShadow = true;
    car.add(flare);
    // 泥擋:輪後懸掛橡膠板
    const flap = new THREE.Mesh(flapGeo, rubber);
    flap.position.set(sx * 0.9, 0.27, z - 0.56);
    car.add(flap);
  }

  // ---- 共用件
  const { wheels, rimMatRear, wheelRadius } = makeWheels(car, positions, {
    radius: 0.44, width: 0.42, spokes: 6, rimEmissive: 0xb08c3a, // 金圈
  });
  const underglow = makeUnderglow(car, { color: 0x2a8cff, opacity: 0.12, w: 2.3, l: 4.3 });
  const headlights = makeHeadlights(car, { sx: 0.45, y: 0.73, z: 2.3, intensity: 80 });
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
