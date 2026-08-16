// cars/taxi.js — 台北小黃:三廂房車 (車頭-座艙-行李廂分明) + 車頂 TAXI 燈箱
// police.js 以深色 def.paint 共用此底盤;非黃色塗裝時自動省略燈箱與 55688 字樣
import * as THREE from 'three';
import {
  getCarEnvTexture, makeWheels, makeHeadlights, makeHeadlightPool,
  makeUnderglow, makePaint, makeTailBar, bevelBox,
} from './common.js';

const TAXI_YELLOW = 0xffc21e;

let _signTex = null;
// 車頂燈箱貼圖:暖白底 + 橘邊條 + 紅「TAXI」/ 藍「出租」
function getRoofSignTexture() {
  if (_signTex) return _signTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#fff6e2';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#ff8c1a';
  g.fillRect(0, 0, 256, 12);
  g.fillRect(0, 84, 256, 12);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#d8261e';
  g.font = '900 52px "Arial Black", Arial, sans-serif';
  g.fillText('TAXI', 92, 51);
  g.fillStyle = '#1c56c8';
  g.font = '700 46px "PingFang TC", "Microsoft JhengHei", sans-serif';
  g.fillText('出租', 202, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _signTex = tex;
  return tex;
}

let _decalTex = null;
// 車側字樣貼圖 (透明底):「個人 55688」深色字
function getSideDecalTexture() {
  if (_decalTex) return _decalTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 96);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#17324e';
  g.font = '700 54px "PingFang TC", "Microsoft JhengHei", sans-serif';
  g.fillText('個人', 96, 52);
  g.font = '900 62px "Arial Black", Arial, sans-serif';
  g.fillText('55688', 316, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _decalTex = tex;
  return tex;
}

export function build(def = {}) {
  const paintColor = def.paint ?? TAXI_YELLOW;
  const isYellowCab = paintColor === TAXI_YELLOW; // 警車等深色塗裝 → 無燈箱/字樣
  const car = new THREE.Group();
  const envMap = getCarEnvTexture();
  const paint = makePaint(paintColor, { emissiveScale: 0.42 });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x101318, metalness: 0.5, roughness: 0.55 });
  const matteWell = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xb9c2cc, metalness: 1.0, roughness: 0.22, envMap, envMapIntensity: 1.4,
  });
  // 座艙玻璃:深色鏡面 + 淡暖 emissive 透出車內光
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x13202e, metalness: 0.85, roughness: 0.12,
    envMap, envMapIntensity: 2.2,
    emissive: 0x5a3d1c, emissiveIntensity: 0.5,
  });

  // 車寬 taper:車頭收窄較多、車尾微收
  const applyTaper = (geo, { front = 0.10, rear = 0.05, halfLen = 2.26 } = {}) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zn = THREE.MathUtils.clamp(p.getZ(i) / halfLen, -1, 1);
      const s = zn >= 0 ? 1 - front * Math.pow(zn, 1.8) : 1 - rear * Math.pow(-zn, 1.8);
      p.setX(i, p.getX(i) * s);
    }
    p.needsUpdate = true;
  };

  // ---- 下半車身:三廂側面輪廓 (引擎蓋斜降 / 腰線 / 行李廂平台) extrude
  const shape = new THREE.Shape();
  shape.moveTo(-2.18, 0.46);
  shape.lineTo(-2.24, 0.60);
  shape.lineTo(-2.21, 0.82);
  shape.quadraticCurveTo(-1.95, 0.88, -1.55, 0.89);   // 行李廂平台
  shape.quadraticCurveTo(-0.70, 0.93, 0.50, 0.92);    // 座艙腰線
  shape.quadraticCurveTo(1.40, 0.87, 1.95, 0.79);     // 引擎蓋
  shape.quadraticCurveTo(2.18, 0.75, 2.23, 0.70);     // 車鼻
  shape.lineTo(2.26, 0.48);
  shape.quadraticCurveTo(1.10, 0.42, 0, 0.42);
  shape.quadraticCurveTo(-1.10, 0.43, -2.18, 0.46);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.6, bevelEnabled: true, bevelThickness: 0.10, bevelSize: 0.075, bevelSegments: 2,
  });
  bodyGeo.translate(0, 0, -0.8);
  bodyGeo.rotateY(-Math.PI / 2);
  applyTaper(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  car.add(body);

  // ---- 座艙玻璃罩:直立擋風 + 平頂 + 斜後窗,tumblehome 收窄
  const cabShape = new THREE.Shape();
  cabShape.moveTo(0.82, 0.90);
  cabShape.lineTo(0.32, 1.38);
  cabShape.lineTo(-0.72, 1.40);
  cabShape.lineTo(-1.34, 0.90);
  cabShape.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: 1.36, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 2,
  });
  cabGeo.translate(0, 0, -0.68);
  cabGeo.rotateY(-Math.PI / 2);
  {
    const p = cabGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.max(0, p.getY(i) - 0.95);
      p.setX(i, p.getX(i) * (1 - 0.35 * h));
    }
    p.needsUpdate = true;
  }
  const cabin = new THREE.Mesh(cabGeo, glass);
  cabin.castShadow = true;
  car.add(cabin);

  // ---- 車頂鈑件 (車色):蓋住玻璃罩頂,撐出房車頂線
  const roof = new THREE.Mesh(bevelBox(1.16, 0.05, 1.08, 0.02), paint);
  roof.position.set(0, 1.415, -0.20);
  roof.castShadow = true;
  car.add(roof);

  // ---- 車頂「TAXI 出租」燈箱:僅黃色塗裝 (警車深色塗裝自動省略)
  if (isYellowCab) {
    const signTex = getRoofSignTexture();
    const signFace = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: signTex,
      emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.05,
      roughness: 0.5,
    });
    const signSide = new THREE.MeshStandardMaterial({
      color: 0xfff0d0, emissive: 0xffdf9a, emissiveIntensity: 0.55, roughness: 0.6,
    });
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.17, 0.24),
      [signSide, signSide, signSide, signSide, signFace, signFace],
    );
    sign.position.set(0, 1.535, -0.06);
    car.add(sign);
  }

  // ---- 車側:「個人 55688」字樣 + 黑色防擦條 (黃車限定字樣)
  if (isYellowCab) {
    const decalMat = new THREE.MeshBasicMaterial({
      map: getSideDecalTexture(), transparent: true, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    const decalGeo = new THREE.PlaneGeometry(1.34, 0.25);
    for (const s of [1, -1]) {
      const d = new THREE.Mesh(decalGeo, decalMat);
      d.rotation.y = s * Math.PI / 2;
      d.position.set(s * 0.888, 0.71, 0.40);
      car.add(d);
    }
  }
  for (const s of [1, -1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 2.5), darkTrim);
    strip.position.set(s * 0.875, 0.585, 0.05);
    car.add(strip);
  }

  // ---- 前臉:水箱罩 + 鍍鉻飾條 + 圓角頭燈 + 方向燈
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.11, 0.06), matteWell);
  grille.position.set(0, 0.66, 2.30);
  car.add(grille);
  const chromeBar = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.025, 0.06), chrome);
  chromeBar.position.set(0, 0.725, 2.30);
  car.add(chromeBar);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.15, 0.20), darkTrim);
  bumperF.position.set(0, 0.485, 2.24);
  car.add(bumperF);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeef4ff, emissiveIntensity: 1.8 });
  const headGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.30, 12);
  headGeo.rotateZ(Math.PI / 2); // 橫置圓角燈殼
  const turnMat = new THREE.MeshStandardMaterial({ color: 0xffa018, emissive: 0xff9a12, emissiveIntensity: 0.7 });
  for (const s of [1, -1]) {
    const h = new THREE.Mesh(headGeo, headMat);
    h.position.set(s * 0.56, 0.67, 2.28);
    car.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.06), turnMat);
    t.position.set(s * 0.80, 0.66, 2.22);
    car.add(t);
  }

  // ---- 車尾:深色飾板 + 紅色橫置尾燈組 + 倒車燈 + 保桿
  const tailPanel = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.30, 0.06), darkTrim);
  tailPanel.position.set(0, 0.70, -2.24);
  car.add(tailPanel);
  const { tailMat, tailMidMat, brakeLight } = makeTailBar(car, { width: 1.5, y: 0.78, z: -2.28 });
  const reverseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 0.45 });
  for (const s of [0.52, -0.52]) {
    const rv = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.05, 0.05), reverseMat);
    rv.position.set(s, 0.585, -2.27);
    car.add(rv);
  }
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.15, 0.18), darkTrim);
  bumperR.position.set(0, 0.50, -2.22);
  car.add(bumperR);

  // ---- 車牌 (前後白牌)
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, emissive: 0xcdd6e0, emissiveIntensity: 0.25, roughness: 0.6 });
  const plateGeo = new THREE.BoxGeometry(0.34, 0.13, 0.02);
  const plateF = new THREE.Mesh(plateGeo, plateMat);
  plateF.position.set(0, 0.50, 2.35);
  car.add(plateF);
  const plateR = new THREE.Mesh(plateGeo, plateMat);
  plateR.position.set(0, 0.52, -2.32);
  car.add(plateR);

  // ---- 後視鏡 (車色殼 + 短柄) 與後檔天線
  for (const s of [1, -1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, 0.03), darkTrim);
    stalk.position.set(s * 0.90, 0.99, 0.78);
    car.add(stalk);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.17), paint);
    mirror.position.set(s * 0.97, 1.00, 0.76);
    car.add(mirror);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.016, 0.44, 6), darkTrim);
  antenna.position.set(0.60, 1.06, -1.62);
  antenna.rotation.x = -0.42;
  car.add(antenna);

  // ---- 輪拱陰影井 + 車色輪眉
  const positions = [
    [0.78, 0.36, 1.42, true], [-0.78, 0.36, 1.42, true],
    [0.78, 0.36, -1.42, false], [-0.78, 0.36, -1.42, false],
  ];
  const wellGeo = new THREE.BoxGeometry(0.22, 0.66, 0.92);
  const archGeo = new THREE.BoxGeometry(0.24, 0.16, 1.0);
  for (const [x, , z] of positions) {
    const sx = Math.sign(x);
    const well = new THREE.Mesh(wellGeo, matteWell);
    well.position.set(sx * (Math.abs(x) - 0.22), 0.44, z);
    car.add(well);
    const arch = new THREE.Mesh(archGeo, paint);
    arch.position.set(sx * (Math.abs(x) + 0.02), 0.72, z);
    arch.castShadow = true;
    car.add(arch);
  }

  // ---- 共用件:輪組 (小徑多輻,近似鐵圈) / underglow / 頭燈 / 光池
  const { wheels, rimMatRear, wheelRadius } = makeWheels(car, positions, {
    radius: 0.36, width: 0.28, spokes: 10, rimEmissive: 0x5f6872,
  });
  const underglow = makeUnderglow(car, {
    color: isYellowCab ? 0xffb63a : 0x1ad2ff, opacity: 0.11, l: 4.4,
  });
  const headlights = makeHeadlights(car, { sx: 0.56, y: 0.66, z: 2.24 });
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
