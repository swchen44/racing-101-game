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

// ---- 數位儀表叢集貼圖 (雙弧速度/轉速 + 中央數位讀點),駕駛艙內裝專用 ----
let _clusterTex = null;
export function getClusterTexture() {
  if (_clusterTex) return _clusterTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#04070b';
  g.fillRect(0, 0, 256, 128);
  // 左弧:速度 (青)
  const drawArc = (cx, cy, r, a0, a1, col, lw) => {
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  };
  // 底環 (暗)
  drawArc(72, 74, 44, Math.PI * 0.78, Math.PI * 2.22, '#0f2730', 7);
  drawArc(184, 74, 44, Math.PI * 0.78, Math.PI * 2.22, '#2a1c07', 7);
  // 活動段
  drawArc(72, 74, 44, Math.PI * 0.78, Math.PI * 1.7, '#2ae0ff', 7);
  drawArc(184, 74, 44, Math.PI * 0.78, Math.PI * 1.35, '#ffb028', 7);
  // 刻度
  g.strokeStyle = '#4a6570'; g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.78 + (Math.PI * 1.44) * (i / 8);
    const c1 = Math.cos(a), s1 = Math.sin(a);
    g.beginPath(); g.moveTo(72 + c1 * 48, 74 + s1 * 48); g.lineTo(72 + c1 * 54, 74 + s1 * 54); g.stroke();
  }
  // 中央數位讀點
  g.fillStyle = '#eafcff';
  g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('128', 128, 60);
  g.font = '13px monospace'; g.fillStyle = '#4f93a3';
  g.fillText('KM/H', 128, 88);
  // 左右小標
  g.fillStyle = '#2ae0ff'; g.font = '11px monospace';
  g.fillText('SPD', 72, 74);
  g.fillStyle = '#ffb028'; g.fillText('RPM', 184, 74);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _clusterTex = markShared(tex);
  return tex;
}

// ---- 駕駛艙內裝 (只在玩家車生成:builder 於 def._cockpit 為真時呼叫) ----
// 前向構圖為主 (座艙攝影機朝前):儀表台、防眩罩、數位儀表、中控螢幕、A柱、
// 車頂橫樑+氛圍燈、門飾氛圍燈條、內後視鏡、可轉方向盤。
// 回傳 { steeringWheel } 供 vehicle.js 依 steer 旋轉。
// glassMats:傳入座艙玻璃材質,內裝存在時改為半透明,座艙視角才看得到路面。
export function makeCockpit(car, opts = {}) {
  const {
    width = 1.42, dashZ = 1.0, dashY = 0.9,
    wheelZ = 0.66, wheelY = 0.86, wheelR = 0.17, driverX = 0,
    roofY = 1.2, pillarFrontZ = 1.15, accent = 0x2ae0ff,
    seatColor = 0x15181e, glassMats = null, glassOpacity = 0.4,
    open = false,   // 開放式座艙 (F1):略過車頂/A柱/後視鏡/座椅/中控
  } = opts;

  // 註:座艙玻璃維持不透明。座艙視角時 main.js 會把含玻璃的外殼整批隱藏
  // (只留 cockpitGroup),因此自然看得出去,毋須改玻璃透明度 (否則第三人稱
  //  會透視到內裝與座艙燈外溢,車頂像破洞)。glassMats 參數保留但不再使用。
  void glassMats; void glassOpacity;

  const grp = new THREE.Group();
  const matte = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.85, metalness: 0.1 });
  const leather = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.72, metalness: 0.05 });
  const accentMat = registerEmissive(new THREE.MeshStandardMaterial({
    color: 0x05080a, emissive: accent, emissiveIntensity: 0.9,
  }), 0.9);

  // 儀表台主體 + 防眩罩
  const dash = new THREE.Mesh(bevelBox(width, 0.2, 0.44, 0.05, 2), matte);
  dash.position.set(driverX, dashY, dashZ); dash.rotation.x = -0.16;
  grp.add(dash);
  const cowl = new THREE.Mesh(bevelBox(width * 0.52, 0.05, 0.22, 0.03, 2), matte);
  cowl.position.set(driverX, dashY + 0.15, dashZ - 0.14); cowl.rotation.x = -0.5;
  grp.add(cowl);

  // 數位儀表叢集 (自發光螢幕:參與 tonemapping 免被 bloom 吃成白霧,深底+青弧+數字讀得出來)
  const clusterMat = new THREE.MeshBasicMaterial({
    map: getClusterTexture(), side: THREE.DoubleSide,
  });
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), clusterMat);
  cluster.position.set(driverX, dashY + 0.15, dashZ - 0.04); cluster.rotation.x = -0.4;
  grp.add(cluster);

  if (!open) {
    // 中控直立資訊螢幕 (發光)
    const infoMat = registerEmissive(new THREE.MeshStandardMaterial({
      color: 0x02070a, emissive: accent, emissiveIntensity: 0.85,
    }), 0.85);
    const info = new THREE.Mesh(bevelBox(0.24, 0.3, 0.02, 0.02, 1), infoMat);
    info.position.set(0, dashY - 0.05, dashZ - 0.03); info.rotation.x = -0.1;
    grp.add(info);
    // 中控台 (排檔/扶手區)
    const centerConsole = new THREE.Mesh(bevelBox(0.3, 0.13, 0.86, 0.04, 2), matte);
    centerConsole.position.set(0, 0.66, dashZ - 0.66);
    grp.add(centerConsole);

    // A柱 ×2
    for (const s of [1, -1]) {
      const pillar = new THREE.Mesh(bevelBox(0.075, 0.92, 0.075, 0.03, 1), matte);
      pillar.position.set(s * width * 0.5, dashY + 0.4, pillarFrontZ - 0.06); pillar.rotation.x = 0.3;
      grp.add(pillar);
    }
    // 車頂前橫樑 + 氛圍燈
    const header = new THREE.Mesh(bevelBox(width * 0.96, 0.07, 0.12, 0.03, 1), matte);
    header.position.set(0, roofY, pillarFrontZ - 0.03);
    grp.add(header);
    const ambMat = registerEmissive(new THREE.MeshStandardMaterial({
      color: 0x05080a, emissive: accent, emissiveIntensity: 0.7,
    }), 0.7);
    const ambStrip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 0.014, 0.02), ambMat);
    ambStrip.position.set(0, roofY - 0.05, pillarFrontZ - 0.06);
    grp.add(ambStrip);
  }

  // 座艙補光:一盞低強度短射程點光,讓儀表台/方向盤在夜間有立體明暗
  // (只在玩家車生成一盞,成本可忽略)
  const cabinLight = new THREE.PointLight(0x9fd6ff, 4.2, 2.6, 2.2);
  cabinLight.position.set(driverX, dashY + 0.34, dashZ - 0.34);
  grp.add(cabinLight);
  if (!open) {
    // 內後視鏡
    const mirrorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10, metalness: 0.9, roughness: 0.14,
      envMap: getCarEnvTexture(), envMapIntensity: 1.5,
    });
    const mirror = new THREE.Mesh(bevelBox(0.26, 0.06, 0.03, 0.02, 1), mirrorMat);
    mirror.position.set(0, roofY - 0.07, pillarFrontZ - 0.14);
    grp.add(mirror);

    // 座椅背 ×2 (座艙視角看不到,但外部/近攝可見;桶型椅背 + 頭枕)
    for (const s of [1, -1]) {
      const seatBack = new THREE.Mesh(bevelBox(0.44, 0.62, 0.16, 0.08, 2), leather);
      seatBack.position.set(s * 0.34, 0.98, -0.35); seatBack.rotation.x = 0.12;
      grp.add(seatBack);
      const headRest = new THREE.Mesh(bevelBox(0.24, 0.18, 0.14, 0.06, 2), leather);
      headRest.position.set(s * 0.34, 1.34, -0.4);
      grp.add(headRest);
    }
  }

  // 方向盤 (column 後傾;spin 節點被 steer 旋轉)
  const column = new THREE.Group();
  column.position.set(driverX, wheelY, wheelZ); column.rotation.x = -0.42;
  const spin = new THREE.Group();
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.74, metalness: 0.1 });
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.023, 10, 32), wheelMat));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 14), wheelMat);
  hub.rotation.x = Math.PI / 2; spin.add(hub);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), accentMat);
  badge.position.z = 0.02; spin.add(badge);
  for (const deg of [270, 30, 150]) {
    const th = deg * Math.PI / 180;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.024, wheelR, 0.018), wheelMat);
    spoke.position.set(Math.cos(th) * wheelR * 0.5, Math.sin(th) * wheelR * 0.5, 0);
    spoke.rotation.z = th - Math.PI / 2;
    spin.add(spoke);
  }
  column.add(spin);
  grp.add(column);

  car.add(grp);
  // cockpitGroup 供 main.js 在剛性視角時「只藏外殼、留內裝」單獨控制可見性
  return { steeringWheel: spin, cockpitGroup: grp };
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
