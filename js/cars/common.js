// cars/common.js — 各車型共用的程序化貼圖與工具 (模組層快取,只生成一次)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 倒角方盒:近攝時稜線吃到高光,不再是「方塊拼裝」的銳利硬邊
// (RoundedBoxGeometry 頂點數低、法線平滑,成本遠低於 EdgesGeometry 描邊)
export function bevelBox(w, h, d, radius = 0.045, seg = 2) {
  const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  if (r <= 0.004) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, seg, r);
}

// ---- 時段感知:白天 emissive 鎖色會讓車像自發光塑膠 ----
// 讀取優先序:window.__weatherEmissive (main 若接手可直接寫值)
//   → window.__game.setup.weather (QA 掛鉤,startRace 重建車輛時已存在)
//   → 預設夜晚 1.0
function weatherPaintMul() {
  if (typeof window === 'undefined') return 1;
  if (typeof window.__weatherEmissive === 'number') return window.__weatherEmissive;
  const wid = window.__game?.setup?.weather;
  if (wid === 'day') return 0.06;
  if (wid === 'dusk') return 0.45;
  return 1;
}

// 已建立的車漆/發光件登錄表 (弱引用語意:disposeObject 時移除),
// 供 window.__setPaintDaylight 之後由 main 即時切換時段
const _paintRegistry = new Set();
function registerEmissive(mat, baseIntensity, { dayEnvMul = null } = {}) {
  mat.userData.baseEmissiveIntensity = baseIntensity;
  mat.userData.baseEnvMapIntensity = mat.envMapIntensity;
  mat.userData.dayEnvMul = dayEnvMul;
  _paintRegistry.add(mat);
  return mat;
}
if (typeof window !== 'undefined') {
  // main 之後可接:__setPaintDaylight(true/false) 或 __setPaintDaylight(0.06)
  window.__setPaintDaylight = (v) => {
    const mul = typeof v === 'number' ? v : (v ? 0.06 : 1);
    window.__weatherEmissive = mul;
    for (const m of _paintRegistry) {
      m.emissiveIntensity = (m.userData.baseEmissiveIntensity ?? 0.5) * mul;
      if (m.userData.dayEnvMul != null && m.userData.baseEnvMapIntensity != null) {
        m.envMapIntensity = m.userData.baseEnvMapIntensity
          * (mul < 0.5 ? m.userData.dayEnvMul : 1);
      }
    }
  };
}

// 標記為共用快取:disposeObject 會跳過,避免換車/換賽道時誤殺模組層快取貼圖
function markShared(tex) { tex.userData.shared = true; return tex; }

// 徹底釋放物件樹 GPU 資源;userData.shared 的貼圖 (模組快取) 不釋放
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap', 'envMap']) {
        if (m[k] && m[k].dispose && !m[k].userData?.shared) m[k].dispose();
      }
      _paintRegistry.delete(m);
      m.dispose();
    }
  });
}

let _carEnvTex = null;
// 車漆專用環境貼圖:亮色天空漸層 + 霓虹色塊,讓夜景中車漆有明確反射讀點
export function getCarEnvTexture() {
  if (_carEnvTex) return _carEnvTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0.0, '#1e3a6e');
  grad.addColorStop(0.42, '#27436f');
  grad.addColorStop(0.55, '#b46a30');
  grad.addColorStop(0.62, '#241a14');
  grad.addColorStop(1.0, '#07080c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 64);
  const panels = [
    ['#2ae0ff', 8, 26, 16, 20], ['#ffd24a', 52, 24, 13, 22],
    ['#ffd24a', 90, 28, 11, 18], ['#2ae0ff', 112, 26, 10, 20],
    ['#9fffe0', 34, 30, 6, 14],
  ];
  for (const [col, x, y, w, h] of panels) { g.fillStyle = col; g.fillRect(x, y, w, h); }
  g.fillStyle = 'rgba(220,235,255,0.85)';
  g.fillRect(0, 4, 128, 5);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _carEnvTex = markShared(tex);
  return tex;
}

let _groundGlowTex = null;
// 橢圓漸層 (中心亮、慢收尾):光池/underglow 共用,additive 疊路面零硬邊
export function getGroundGlowTexture() {
  if (_groundGlowTex) return _groundGlowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.62)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.09)');
  grad.addColorStop(0.92, 'rgba(255,255,255,0.02)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _groundGlowTex = markShared(tex);
  return tex;
}

const _rimTexCache = new Map();
// 輪圈多輻貼圖:亮銀輻條 + 深底 + 外圈亮環 (map+emissiveMap 用)
export function getRimTexture(spokes = 7) {
  if (_rimTexCache.has(spokes)) return _rimTexCache.get(spokes);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1015';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#e7edf5';
  g.lineWidth = 7;
  g.beginPath(); g.arc(64, 64, 57, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < spokes; i++) {
    g.save();
    g.translate(64, 64);
    g.rotate((i / spokes) * Math.PI * 2);
    g.fillStyle = '#dde4ee';
    g.beginPath();
    g.moveTo(-8, -12);
    g.lineTo(-4.5, -56);
    g.lineTo(4.5, -56);
    g.lineTo(8, -12);
    g.closePath();
    g.fill();
    g.fillStyle = '#8d96a4';
    g.fillRect(-8, -50, 2.5, 38);
    g.restore();
  }
  g.fillStyle = '#ccd3de';
  g.beginPath(); g.arc(64, 64, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c01f2c';
  g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _rimTexCache.set(spokes, markShared(tex));
  return tex;
}

let _tireTex = null;
// 輪胎側壁貼圖:深灰胎體 + 淺灰胎字環
export function getTireSideTexture() {
  if (_tireTex) return _tireTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0c0e';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#7d838c';
  g.lineWidth = 4;
  g.setLineDash([9, 6]);
  g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#212429';
  g.lineWidth = 2;
  g.beginPath(); g.arc(64, 64, 47, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _tireTex = markShared(tex);
  return tex;
}

// 標準輪組:回傳 wheels 陣列 [{group, spinner, steerable}] 並掛到 car 上。
// positions: [x, y, z, steerable];radius/width 依車型
export function makeWheels(car, positions, { radius = 0.48, width = 0.4, spokes = 7, rimEmissive = 0x76828f } = {}) {
  const wheels = [];
  const wMul = Math.max(0.18, weatherPaintMul());  // 白天輪組發光降至微量 (保留一點金屬讀點)
  const tireSideTex = getTireSideTexture();
  const envMap = getCarEnvTexture();
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tireSideMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.75 });
  const tireCapMat = registerEmissive(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.9, map: tireSideTex,
    emissiveMap: tireSideTex, emissive: 0x42464e, emissiveIntensity: 1.4 * wMul,
  }), 1.4);
  const tireMats = [tireSideMat, tireCapMat, tireCapMat];
  const rimTex = getRimTexture(spokes);
  const rimR = radius * 0.71;
  const rimGeo = new THREE.CylinderGeometry(rimR, rimR, width + 0.04, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rimBarrelMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.9, roughness: 0.4 });
  const rimFace = registerEmissive(new THREE.MeshStandardMaterial({
    color: 0xf2f5fa, metalness: 0.9, roughness: 0.28,
    map: rimTex, emissiveMap: rimTex,
    emissive: rimEmissive, emissiveIntensity: 2.0 * wMul, envMap, envMapIntensity: 1.2,
  }), 2.0);
  const rimFaceRear = rimFace.clone();
  const rimMatsFront = [rimBarrelMat, rimFace, rimFace];
  const rimMatsRear = [rimBarrelMat, rimFaceRear, rimFaceRear];
  const lipGeo = new THREE.TorusGeometry(radius * 0.83, radius * 0.094, 8, 24);
  lipGeo.rotateY(Math.PI / 2);
  const lipMat = registerEmissive(new THREE.MeshStandardMaterial({
    color: 0xdde4ee, metalness: 1.0, roughness: 0.1, envMap, envMapIntensity: 1.6,
    emissive: 0x6a7480, emissiveIntensity: 1.1 * wMul,
  }), 1.1);
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xcc1622, emissive: 0x991018, emissiveIntensity: 0.7 });
  const caliperGeo = new THREE.BoxGeometry(0.07, radius * 0.35, radius * 0.27);
  for (const [x, y, z, steerable] of positions) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);
    const tire = new THREE.Mesh(tireGeo, tireMats);
    const rim = new THREE.Mesh(rimGeo, steerable ? rimMatsFront : rimMatsRear);
    const lipOut = new THREE.Mesh(lipGeo, lipMat);
    lipOut.position.x = width / 2 + 0.025;
    const lipIn = new THREE.Mesh(lipGeo, lipMat);
    lipIn.position.x = -(width / 2 + 0.025);
    tire.castShadow = true;
    const spinner = new THREE.Group();
    spinner.add(tire, rim, lipOut, lipIn);
    wheelGroup.add(spinner);
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(Math.sign(x) * radius * 0.4, radius * 0.25, steerable ? radius * 0.46 : -radius * 0.46);
    wheelGroup.add(caliper);
    car.add(wheelGroup);
    wheels.push({ group: wheelGroup, spinner, steerable });
  }
  return { wheels, rimMatRear: rimFaceRear, wheelRadius: radius };
}

// 標準頭燈:SpotLight ×2 + 假體積光束;回傳 headlights 陣列
export function makeHeadlights(car, { sx = 0.52, y = 0.62, z = 2.2, color = 0xd9e8ff, intensity = 130 } = {}) {
  const headlights = [];
  for (const s of [sx, -sx]) {
    // decay 1.45 + 較窄錐角:光真正打在前方路面 (低 decay 讓 20m 外仍有照度)
    const spot = new THREE.SpotLight(color, intensity, 70, 0.40, 0.85, 1.45);
    spot.position.set(s, y, z);
    const tgt = new THREE.Object3D();
    tgt.position.set(s * 0.4, 0.0, 24);
    car.add(tgt);
    spot.target = tgt;
    car.add(spot);
    headlights.push(spot);
  }
  const beamGeo = new THREE.BufferGeometry();
  const verts = [], uvs = [], idx = [];
  let vi = 0;
  for (const s of [sx, -sx]) {
    verts.push(s - 0.12, y + 0.04, z + 0.1, s + 0.12, y + 0.04, z + 0.1, s - 0.8, 0.1, 10.5, s + 0.8, 0.1, 10.5);
    uvs.push(0.45, 0.5, 0.55, 0.5, 0.08, 0.95, 0.92, 0.95);
    idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
    vi += 4;
  }
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  beamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  beamGeo.setIndex(idx);
  const beamMat = new THREE.MeshBasicMaterial({
    map: getGroundGlowTexture(), color: 0xcfe4ff, transparent: true, opacity: 0.04,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide,
  });
  car.add(new THREE.Mesh(beamGeo, beamMat));
  return headlights;
}

// 標準頭燈光池 (掛在 rig,不跟 roll/pitch)
// userData.pool / baseOpacity 暴露給 effects.js:高速時光池前伸增亮
export function makeHeadlightPool({ color = 0xa9c8ea, opacity = 0.14 } = {}) {
  const poolGroup = new THREE.Group();
  const poolMat = new THREE.MeshBasicMaterial({
    map: getGroundGlowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 13), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.05, 9.8);
  poolGroup.add(pool);
  // 近場熱點:車頭正前方 2~6m 較亮的小光池 (頭燈真的「打亮腳下路面」的觀感)
  const hotMat = new THREE.MeshBasicMaterial({
    map: getGroundGlowTexture(), color, transparent: true, opacity: opacity * 1.6,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const hot = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.5), hotMat);
  hot.rotation.x = -Math.PI / 2;
  hot.position.set(0, 0.045, 4.4);
  poolGroup.add(hot);
  poolGroup.userData.pool = pool;
  poolGroup.userData.baseOpacity = opacity;
  return poolGroup;
}

// 標準 underglow 氛圍燈
export function makeUnderglow(car, { color = 0x1ad2ff, opacity = 0.13, w = 2.3, l = 4.6 } = {}) {
  const glowMat = new THREE.MeshBasicMaterial({
    map: getGroundGlowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w, l), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  car.add(glow);
  return glow;
}

// 標準尾燈組:全寬紅色光條;回傳 {tailMat, tailMidMat, brakeLight}
export function makeTailBar(car, { width = 1.64, y = 0.86, z = -2.41 } = {}) {
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 1.6 });
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.05), tailMat);
  tailBar.position.set(0, y, z);
  car.add(tailBar);
  const tailMidMat = new THREE.MeshStandardMaterial({ color: 0x2a0006, emissive: 0xff1a2e, emissiveIntensity: 0.8 });
  const tailMid = new THREE.Mesh(new THREE.BoxGeometry(width * 0.67, 0.03, 0.05), tailMidMat);
  tailMid.position.set(0, y - 0.16, z);
  car.add(tailMid);
  return { tailMat, tailMidMat, brakeLight: tailBar };
}

// 車漆材質工廠:同色相 emissive 鎖色 + 高反射清漆層
// clearcoat 拉滿 + 低 clearcoatRoughness → 近攝腰線有銳利的環境反射讀點;
// 白天 (weatherPaintMul<1) emissive 幾乎歸零、envMap 減半,漆面靠真實光照
export function makePaint(colorHex, { metalness = 0.18, roughness = 0.42, emissiveScale = 0.5 } = {}) {
  const c = new THREE.Color(colorHex);
  const emissive = c.clone().multiplyScalar(0.9);
  const wMul = weatherPaintMul();
  const mat = new THREE.MeshPhysicalMaterial({
    color: colorHex, metalness,
    roughness: Math.max(0.16, roughness - 0.08),  // 基底更緊緻,高光成形
    clearcoat: 1.0, clearcoatRoughness: 0.07,     // 清漆鏡面:稜線/腰線環境反射
    emissive, emissiveIntensity: emissiveScale * wMul,
    envMap: getCarEnvTexture(),
    envMapIntensity: 1.35 * (wMul < 0.5 ? 0.45 : 1), // 白天霓虹 env 不合理 → 減弱
  });
  return registerEmissive(mat, emissiveScale, { dayEnvMul: 0.45 });
}
