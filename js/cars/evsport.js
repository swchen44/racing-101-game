// cars/evsport.js — 雷霆 EV-S:電動超跑。光滑無格柵車頭、貫穿式 LED 燈條 (前白後紅)、
// 隱藏門把流線單體、發光底盤線條
import * as THREE from 'three';
import {
  getCarEnvTexture, makeWheels, makeHeadlights, makeHeadlightPool,
  makeUnderglow, makePaint, makeTailBar, bevelBox, makeCockpit,
} from './common.js';

export function build(def = {}) {
  const car = new THREE.Group();
  const envMap = getCarEnvTexture();
  const paint = makePaint(def.paint ?? 0x3ee6ff, { metalness: 0.3, roughness: 0.3 });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.6, roughness: 0.5 });
  const matteWell = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0e1c2c, metalness: 0.9, roughness: 0.06,
    envMap, envMapIntensity: 2.8,
  });

  // 車寬 taper:頭尾都圓滑收窄 (流線單體)
  const applyTaper = (geo, halfLen = 2.32) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zn = THREE.MathUtils.clamp(p.getZ(i) / halfLen, -1, 1);
      const scale = zn >= 0
        ? 1 - 0.20 * Math.pow(zn, 2.2)
        : 1 - 0.10 * Math.pow(-zn, 2.0);
      p.setX(i, p.getX(i) * scale);
    }
    p.needsUpdate = true;
  };

  // ---- 主車身:低伏連續曲面,車頭下垂無格柵、尾部 Kamm 切
  const shape = new THREE.Shape();
  shape.moveTo(-2.28, 0.55);
  shape.lineTo(-2.32, 0.90);
  shape.quadraticCurveTo(-1.4, 1.00, -0.3, 0.98);
  shape.quadraticCurveTo(1.0, 0.90, 1.85, 0.70);
  shape.quadraticCurveTo(2.28, 0.58, 2.32, 0.50);
  shape.lineTo(2.32, 0.44);
  shape.quadraticCurveTo(1.1, 0.40, 0, 0.42);
  shape.quadraticCurveTo(-1.2, 0.44, -2.28, 0.55);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.62, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.10, bevelSegments: 3,
  });
  bodyGeo.translate(0, 0, -0.81);
  bodyGeo.rotateY(-Math.PI / 2);
  applyTaper(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  car.add(body);

  // ---- 座艙:cab-forward 大曲面玻璃艙 (淚滴形)
  const cabShape = new THREE.Shape();
  cabShape.moveTo(1.28, 0.88);
  cabShape.quadraticCurveTo(0.55, 1.24, -0.15, 1.26);
  cabShape.quadraticCurveTo(-0.95, 1.22, -1.72, 0.90);
  cabShape.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: 1.02, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3,
  });
  cabGeo.translate(0, 0, -0.51);
  cabGeo.rotateY(-Math.PI / 2);
  {
    const p = cabGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.max(0, p.getY(i) - 0.92);
      p.setX(i, p.getX(i) * (1 - 0.6 * h));
    }
    p.needsUpdate = true;
  }
  const cabin = new THREE.Mesh(cabGeo, glass);
  cabin.castShadow = true;
  car.add(cabin);

  // ---- 深色下段:側裙 + 車底封板 + 平整前唇 (無進氣口)
  const rocker = new THREE.Mesh(bevelBox(1.82, 0.2, 1.7, 0.06, 2), darkTrim);
  rocker.position.set(0, 0.44, 0);
  car.add(rocker);
  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 3.9), matteWell);
  floorPan.position.set(0, 0.40, 0);
  car.add(floorPan);
  const chin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.5), darkTrim);
  chin.position.set(0, 0.40, 2.12);
  car.add(chin);

  // ---- 貫穿式前 LED 燈條 (白):全寬、微彎向下包角
  const drlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.1 });
  const drl = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.045, 0.06), drlMat);
  drl.position.set(0, 0.60, 2.28);
  car.add(drl);
  for (const s of [1, -1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.06), drlMat);
    tip.position.set(s * 0.82, 0.565, 2.22);
    tip.rotation.z = s * 0.5;
    tip.rotation.y = s * 0.45;
    car.add(tip);
  }

  // ---- 貫穿式後 LED 燈條 (紅) + 深色尾板 + 擴散器
  const tailPanel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 0.07), darkTrim);
  tailPanel.position.set(0, 0.76, -2.33);
  car.add(tailPanel);
  const { tailMat, tailMidMat, brakeLight } = makeTailBar(car, { width: 1.72, y: 0.90, z: -2.36 });
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.3), matteWell);
  diffuser.position.set(0, 0.36, -2.2);
  diffuser.rotation.x = 0.3;
  car.add(diffuser);
  const finGeo = new THREE.BoxGeometry(0.04, 0.13, 0.26);
  for (const sx of [-1.5, -0.5, 0.5, 1.5]) {
    const fin = new THREE.Mesh(finGeo, darkTrim);
    fin.position.set(sx * 0.4, 0.36, -2.18);
    car.add(fin);
  }

  // ---- 發光底盤線條:車側低位青色光刃 + 前後端連接 → 發光周界
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x0a2a30, emissive: 0x2ae0ff, emissiveIntensity: 1.7 });
  for (const s of [1, -1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 3.3), lineMat);
    blade.position.set(s * 0.93, 0.335, -0.05);
    car.add(blade);
  }
  const frontLine = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.03, 0.035), lineMat);
  frontLine.position.set(0, 0.35, 2.3);
  car.add(frontLine);
  const rearLine = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.035), lineMat);
  rearLine.position.set(0, 0.335, -2.26);
  car.add(rearLine);

  // ---- 隱藏門把暗示:與車身齊平的細凹線 (深色細縫)
  for (const s of [1, -1]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.34), darkTrim);
    seam.position.set(s * 0.945, 0.86, 0.55);
    car.add(seam);
  }

  // ---- 後視鏡 (流線小翼式)
  for (const s of [1, -1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.05), darkTrim);
    stalk.position.set(s * 0.98, 0.95, 0.98);
    car.add(stalk);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.16), paint);
    mir.position.set(s * 1.06, 0.97, 0.94);
    car.add(mir);
  }

  // ---- 輪拱井 + fender 隆起
  const positions = [
    [0.9, 0.46, 1.46, true], [-0.9, 0.46, 1.46, true],
    [0.94, 0.46, -1.48, false], [-0.94, 0.46, -1.48, false],
  ];
  const wellGeo = new THREE.BoxGeometry(0.2, 0.95, 1.2);
  const blisterGeo = bevelBox(0.26, 0.22, 1.26, 0.08, 3);
  for (const [x, , z, steerable] of positions) {
    const s = Math.sign(x);
    const well = new THREE.Mesh(wellGeo, matteWell);
    well.position.set(s * (Math.abs(x) - 0.3), 0.5, z);
    car.add(well);
    const blister = new THREE.Mesh(blisterGeo, paint);
    blister.position.set(s * (Math.abs(x) - 0.02), steerable ? 0.82 : 0.88, z);
    blister.castShadow = true;
    car.add(blister);
  }

  // ---- 共用件
  const { wheels, rimMatRear, wheelRadius } = makeWheels(car, positions, { radius: 0.46, width: 0.36, spokes: 5, rimEmissive: 0x3ec8de });
  const underglow = makeUnderglow(car, { color: 0x1ad2ff, opacity: 0.15, w: 2.4, l: 4.8 });
  const headlights = makeHeadlights(car, { sx: 0.55, y: 0.60, z: 2.24 });
  const headlightPool = makeHeadlightPool();

  // ---- 駕駛艙內裝 (僅玩家車) ----
  let steeringWheel = null, cockpitGroup = null;
  if (def._cockpit) {
    ({ steeringWheel, cockpitGroup } = makeCockpit(car, {
      width: 1.34, dashZ: 1.02, dashY: 0.92, wheelZ: 0.6, wheelY: 0.96,
      roofY: 1.2, pillarFrontZ: 1.18, accent: 0x2ae0ff, glassMats: glass,
    }));
  }

  const rig = new THREE.Group();
  rig.add(car);
  rig.add(headlightPool);
  return {
    mesh: rig,
    parts: {
      bodyGroup: car, wheels, rimMatRear, wheelRadius,
      tailMat, tailMidMat, brakeLight,
      underglow, headlights, headlightPool, steeringWheel, cockpitGroup,
    },
  };
}
