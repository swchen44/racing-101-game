// city.js — 信義區夜景:地面、建築群、霓虹招牌、路燈、天空
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { radialGlowTexture } from './taipei101.js';
import { TOWER_POS } from './taipei101.js';

const NEON_TEXTS = [
  ['信義商圈', '#ff4d6d'], ['誠品書店', '#ffb54d'], ['燒肉丼飯', '#ff7733'],
  ['卡拉OK', '#4dd8ff'], ['珍珠奶茶', '#3ee6a8'], ['深夜食堂', '#ffd24d'],
  ['火鍋 24H', '#ff5577'], ['咖啡 COFFEE', '#66ffcc'], ['市政府站', '#55aaff'],
  ['夜市小吃', '#ffaa33'], ['威秀影城', '#cc66ff'], ['新光三越', '#ff8899'],
  ['台北之夜', '#44eeff'], ['機車行', '#88ff66'], ['藥局', '#33ff99'],
];

export function createCity(track) {
  const group = new THREE.Group();
  // 濕路反射 streak 收集器:建築霓虹/燈箱柱/路燈都往這裡丟 {x,z,angle,color,w,len}
  const streaks = [];
  group.add(createGround());
  group.add(createSky());
  group.add(createBuildings(track, streaks));
  group.add(createStreetlights(track, streaks));
  group.add(createStreetClutter(track));
  group.add(createSkylineSilhouette());
  group.add(createReflectionStreaks(streaks));
  return group;
}

// ---------- 路外街道雜物:行道樹/停放機車/路邊停車/路障花台/路外光池 ----------
// 填滿護欄 (9.95m) 到建築退縮線 (24m+) 之間的空白帶,全 InstancedMesh (~7 draw calls)
function treeCanopyTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  // 低飽和深綠剪影:多個重疊圓斑
  for (let i = 0; i < 42; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 40;
    const px = 64 + Math.cos(a) * r, py = 56 + Math.sin(a) * r * 0.8;
    const rad = 10 + Math.random() * 16;
    const v = 14 + Math.random() * 14;
    g.fillStyle = `rgb(${v * 0.55 | 0},${v | 0},${v * 0.62 | 0})`;
    g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStreetClutter(track) {
  const group = new THREE.Group();
  const N = track.samples.length;
  const segLen = track.samples[0].pos.distanceTo(track.samples[1].pos) || 1;
  const minTrackDist = (x, z) => {
    let min = Infinity;
    for (let i = 0; i < N; i += 10) {
      const p = track.samples[i].pos;
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < min) min = d2;
    }
    return Math.sqrt(min);
  };
  const nearTower = (x, z, r) => {
    const dx = x - TOWER_POS.x, dz = z - TOWER_POS.z;
    return dx * dx + dz * dz < r * r;
  };
  const ok = (x, z) => minTrackDist(x, z) > 11.2 && !nearTower(x, z, 55);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const addInstances = (geo, mat, list) => {
    // list: [x, y, z, angleY, scale, colorHex?]
    if (!list.length) return null;
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const col = new THREE.Color();
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p[3]);
      m4.compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(p[4], p[4], p[4]));
      inst.setMatrixAt(i, m4);
      if (p[5] !== undefined) inst.setColorAt(i, col.set(p[5]));
    });
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
    return inst;
  };

  // --- 行道樹:curb 外 ~1.5m,每 ~24m 一棵 ---
  const trunks = [], canopies = [];
  const treeStep = Math.max(1, Math.round(24 / segLen));
  let ti = 0;
  for (let i = 0; i < N; i += treeStep) {
    const sm = track.samples[i];
    const side = ti++ % 2 === 0 ? 1 : -1;
    if (Math.random() < 0.25) continue;
    const x = sm.pos.x + sm.normal.x * 11.6 * side;
    const z = sm.pos.z + sm.normal.z * 11.6 * side;
    if (!ok(x, z)) continue;
    const s = 0.85 + Math.random() * 0.5;
    const a = Math.random() * Math.PI;
    trunks.push([x, 0, z, a, s]);
    canopies.push([x, 0, z, a, s]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 3.4, 5);
  trunkGeo.translate(0, 1.7, 0);
  addInstances(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 0.95 }), trunks);
  // 樹冠:兩張交叉 alpha plane 合併成單一 geometry
  const cp1 = new THREE.PlaneGeometry(4.6, 3.8).translate(0, 4.6, 0);
  const cp2 = cp1.clone().rotateY(Math.PI / 2);
  const canopyGeo = mergeGeometries([cp1, cp2]);
  addInstances(canopyGeo, new THREE.MeshBasicMaterial({
    map: treeCanopyTexture(), alphaTest: 0.5, side: THREE.DoubleSide,
  }), canopies);

  // --- 停放機車群:3~5 台一簇貼牆擺放 ---
  const scooters = [];
  const scStep = Math.max(1, Math.round(55 / segLen));
  for (let i = 0; i < N; i += scStep) {
    if (Math.random() < 0.45) continue;
    const sm = track.samples[i];
    const side = Math.random() < 0.5 ? 1 : -1;
    const count = 3 + Math.floor(Math.random() * 3);
    const baseA = Math.atan2(sm.normal.x * side, sm.normal.z * side); // 面向牆
    for (let k = 0; k < count; k++) {
      const alongOff = (k - count / 2) * 0.85;
      const x = sm.pos.x + sm.normal.x * 13.6 * side + sm.tan.x * alongOff;
      const z = sm.pos.z + sm.normal.z * 13.6 * side + sm.tan.z * alongOff;
      if (!ok(x, z)) continue;
      scooters.push([x, 0, z, baseA + (Math.random() - 0.5) * 0.25, 0.9 + Math.random() * 0.2]);
    }
  }
  const scBody = new THREE.BoxGeometry(0.6, 0.5, 1.8).translate(0, 0.5, 0);
  const scSeat = new THREE.BoxGeometry(0.5, 0.28, 0.9).translate(0, 0.92, -0.3);
  const scHead = new THREE.BoxGeometry(0.42, 0.5, 0.16).translate(0, 1.05, 0.72);
  const scooterGeo = mergeGeometries([scBody, scSeat, scHead]);
  addInstances(scooterGeo, new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.7, metalness: 0.3 }), scooters);

  // --- 路邊停放汽車 (帶尾燈紅點) ---
  const cars = [], tails = [];
  const carStep = Math.max(1, Math.round(46 / segLen));
  const CAR_COLORS = [0x30363f, 0x3a3340, 0x2c3a3a, 0x40372c, 0x333944];
  let ci = 0;
  for (let i = 0; i < N; i += carStep) {
    if (Math.random() < 0.4) continue;
    const sm = track.samples[i];
    const side = ci++ % 2 === 0 ? 1 : -1;
    const x = sm.pos.x + sm.normal.x * 12.6 * side;
    const z = sm.pos.z + sm.normal.z * 12.6 * side;
    if (!ok(x, z)) continue;
    const dirFlip = Math.random() < 0.5 ? 0 : Math.PI;
    const a = Math.atan2(sm.tan.x, sm.tan.z) + dirFlip + (Math.random() - 0.5) * 0.08;
    cars.push([x, 0, z, a, 1, CAR_COLORS[ci % CAR_COLORS.length]]);
    // 尾燈:車尾 (局部 -z) 一條微亮紅
    const rear = new THREE.Vector3(0, 0.62, -2.02).applyAxisAngle(up, a);
    tails.push([x + rear.x, rear.y, z + rear.z, a, 1]);
  }
  const carBody = new THREE.BoxGeometry(1.75, 0.62, 4.3).translate(0, 0.52, 0);
  const carCabin = new THREE.BoxGeometry(1.5, 0.5, 2.1).translate(0, 1.05, -0.25);
  const carGeo = mergeGeometries([carBody, carCabin]);
  addInstances(carGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.5 }), cars);
  const tailGeo = new THREE.BoxGeometry(1.3, 0.09, 0.06);
  addInstances(tailGeo, new THREE.MeshBasicMaterial({ color: 0x992233, toneMapped: false }), tails);

  // --- 路障/花台:護欄外零星,instanceColor 區分橘紅路障與暗灰花台 ---
  const props = [];
  const prStep = Math.max(1, Math.round(38 / segLen));
  for (let i = 0; i < N; i += prStep) {
    if (Math.random() < 0.5) continue;
    const sm = track.samples[i];
    const side = Math.random() < 0.5 ? 1 : -1;
    const off = 11.3 + Math.random() * 8;
    const x = sm.pos.x + sm.normal.x * off * side;
    const z = sm.pos.z + sm.normal.z * off * side;
    if (!ok(x, z)) continue;
    const isBarrier = Math.random() < 0.45;
    props.push([x, 0, z, Math.atan2(sm.tan.x, sm.tan.z) + (Math.random() - 0.5) * 0.6,
      isBarrier ? 0.75 : 1.15, isBarrier ? 0xbb4422 : 0x3a4048]);
  }
  const propGeo = new THREE.BoxGeometry(0.55, 0.85, 1.5).translate(0, 0.425, 0);
  addInstances(propGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), props);

  // --- 路外零星光池:騎樓/店面漏光,複用 poolLightTexture ---
  const pools = [];
  const plStep = Math.max(1, Math.round(70 / segLen));
  for (let i = 0; i < N; i += plStep) {
    if (Math.random() < 0.35) continue;
    const sm = track.samples[i];
    const side = Math.random() < 0.5 ? 1 : -1;
    const off = 14 + Math.random() * 7;
    const x = sm.pos.x + sm.normal.x * off * side;
    const z = sm.pos.z + sm.normal.z * off * side;
    if (!ok(x, z)) continue;
    pools.push([x, 0.05, z, Math.random() * Math.PI, 0.8 + Math.random() * 0.7]);
  }
  const opGeo = new THREE.PlaneGeometry(11, 8);
  opGeo.rotateX(-Math.PI / 2);
  addInstances(opGeo, new THREE.MeshBasicMaterial({
    map: poolLightTexture(), transparent: true, opacity: 0.26,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), pools);

  return group;
}

// ---------- 濕路光源反射 streak (單一 InstancedMesh, +1 draw call) ----------
function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 128);
  // 橫向也做柔邊,避免長條硬邊
  const gradX = g.createLinearGradient(0, 0, 32, 0);
  gradX.addColorStop(0, 'rgba(0,0,0,1)');
  gradX.addColorStop(0.3, 'rgba(0,0,0,0)');
  gradX.addColorStop(0.7, 'rgba(0,0,0,0)');
  gradX.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = gradX;
  g.fillRect(0, 0, 32, 128);
  // 縱向斷裂噪點:濕面反射被雨滴/路面顆粒打碎的閃爍感,消除「色紙」的均勻邊界
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.6})`;
    g.fillRect(0, Math.random() * 128, 32, 0.8 + Math.random() * 2.6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createReflectionStreaks(streaks) {
  const group = new THREE.Group();
  if (!streaks.length) return group;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: streakTexture(), transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const inst = new THREE.InstancedMesh(geo, mat, streaks.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const white = new THREE.Color(1, 1, 1);
  const col = new THREE.Color();
  // 基底色向白 mix 30% 壓飽和,存起來給逐幀視角衰減用
  const baseCols = streaks.map((s) => new THREE.Color(s.color).lerp(white, 0.3));
  streaks.forEach((s, i) => {
    q.setFromAxisAngle(up, s.angle);
    // y=0.055:抬離路面 (0.02) 與標線 (0.045),配合 polygonOffset 避免遠距 z-fighting
    m4.compose(
      new THREE.Vector3(s.x, 0.055, s.z), q,
      new THREE.Vector3(s.w, 1, s.len));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, col.copy(baseCols[i]));
  });
  inst.instanceColor.needsUpdate = true;
  // 視角相依:沿 streak 軸向看最亮、側視近乎消失 (真實濕面反射朝觀者拉伸的近似)
  const camDir = new THREE.Vector2();
  inst.onBeforeRender = (renderer, scene, camera) => {
    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i];
      camDir.set(s.x - camera.position.x, s.z - camera.position.z);
      const len = camDir.length();
      let k = 0.08;
      if (len > 0.5) {
        const a = Math.abs((camDir.x * Math.sin(s.angle) + camDir.y * Math.cos(s.angle)) / len);
        k = 0.08 + 0.92 * a * a * a;
      }
      inst.setColorAt(i, col.copy(baseCols[i]).multiplyScalar(k));
    }
    inst.instanceColor.needsUpdate = true;
  };
  group.add(inst);
  return group;
}

// 光暈 sprite 近距衰減:相機 <17m 時線性壓暗,
// 避免 additive billboard 正對鏡頭時整團白霧洗掉畫面 (speed.png 病灶)
const _glowV = new THREE.Vector3();
function attachGlowDistanceFade(sprite, baseOpacity) {
  sprite.onBeforeRender = (renderer, scene, camera) => {
    _glowV.setFromMatrixPosition(sprite.matrixWorld);
    const d = _glowV.distanceTo(camera.position);
    sprite.material.opacity = baseOpacity * THREE.MathUtils.clamp((d - 5) / 12, 0.12, 1);
  };
}

// ---------- 地面 ----------
function createGround() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#101318';
  g.fillRect(0, 0, 512, 512);
  // 大尺度明暗斑塊:打破「一望無際的均勻死平面」,遠看有城市地表的不均勻感
  for (let i = 0; i < 14; i++) {
    const px = Math.random() * 512, py = Math.random() * 512;
    const r = 60 + Math.random() * 140;
    const lighter = Math.random() < 0.5;
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, lighter ? 'rgba(48,56,72,0.16)' : 'rgba(2,3,6,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const v = 10 + Math.random() * 22;
    g.fillStyle = `rgba(${v},${v + 3},${v + 8},0.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  // 街廓格線 (遠景暗示街道)
  g.strokeStyle = 'rgba(60,70,85,0.5)';
  g.lineWidth = 4;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  return ground;
}

// ---------- 夜空 ----------
function createSky() {
  const group = new THREE.Group();
  // 漸層天空穹頂:地平線帶混入與 FogExp2(0x0a0e18) 同色溫的 haze,
  // 讓「被霧染色的中景建築 → 遠景剪影 → 天空」三層在同一色階上銜接
  const skyGeo = new THREE.SphereGeometry(1250, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 zenith = vec3(0.012, 0.02, 0.05);
        vec3 mid    = vec3(0.04, 0.06, 0.13);
        vec3 fogCol = vec3(0.048, 0.062, 0.10);   // 霧色 0x0a0e18 的微亮版
        vec3 col = mix(mid, zenith, smoothstep(0.25, 0.9, h));
        // 低空 haze:貼近地平線時收斂到霧色,消除遠景/天空色相斷裂
        col = mix(fogCol, col, smoothstep(-0.02, 0.22, h));
        // 城市光害暖暈:比日落淡、比日落寬,讀成「光害」而非「夕陽」(壓到閾下)
        float band = exp(-pow(max(h, 0.0) * 5.5, 1.5));
        col += vec3(0.07, 0.038, 0.024) * band;
        // 低對比模糊雲帶 ×2:給上半幀一點戲,午夜城市的薄雲反光
        vec3 dir = normalize(vPos);
        float az = atan(dir.z, dir.x);
        float cloudBand = smoothstep(0.12, 0.35, h) * smoothstep(0.85, 0.45, h);
        float n1 = sin(az * 3.0 + dir.y * 9.0) * sin(az * 7.0 - dir.y * 4.0 + 1.7);
        float n2 = sin(az * 5.0 - dir.y * 13.0 + 4.2) * sin(az * 2.0 + dir.y * 6.0);
        float clouds = max(n1, 0.0) * 0.6 + max(n2, 0.0) * 0.4;
        col += vec3(0.010, 0.013, 0.020) * clouds * cloudBand;
        // 螢幕座標 dither 消除漸層 banding
        col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.008;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // 星星
  const starCount = 900;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(0.15 + Math.random() * 0.8);
    const r = 1180;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xbfd4ff, size: 2.0, sizeAttenuation: false,
    transparent: true, opacity: 0.55, depthWrite: false,
  }));
  group.add(stars);

  // 月亮
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialGlowTexture('#fff4d8'), transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  moon.scale.setScalar(120);
  moon.position.set(-600, 620, -800);
  group.add(moon);
  // 月亮外圈大光暈:低透明度,豐富上半幀
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialGlowTexture('#d8e4ff'), transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  moonHalo.scale.setScalar(340);
  moonHalo.position.copy(moon.position);
  group.add(moonHalo);
  return group;
}

// ---------- 遠景天際線剪影 ----------
function silhouetteWindowTexture(base) {
  // haze 色底 + 微弱「橫排樓層」窗點,讓剪影讀成更遠的城市而非黑紙板
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 5) {
    if (Math.random() < 0.45) continue; // 整層暗
    for (let x = 2; x < 62; x += 3) {
      if (Math.random() < 0.8) continue;
      const warm = Math.random() < 0.6;
      const a = 0.1 + Math.random() * 0.28;
      g.fillStyle = warm ? `rgba(255,205,150,${a})` : `rgba(150,190,255,${a})`;
      g.fillRect(x, y, 1.6, 1.1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function horizonGlowTexture() {
  // 縱向漸層:底部偏暖白的光害暈、頂部透明 (壓低飽和,避免讀成夕陽)
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,180,130,0.16)');
  grad.addColorStop(0.45, 'rgba(255,170,125,0.055)');
  grad.addColorStop(1, 'rgba(255,160,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSkylineSilhouette() {
  const group = new THREE.Group();
  // 兩層剪影:近層帶窗點、遠層更亮更接近天空 haze,做出大氣透視;
  // 每「棟」是 1~3 個 box 的複合剪影 (主體 + 頂部退縮小塔 + 細天線),
  // 依材質 merge 成少數 geometry → 全部剪影僅 ~4 draw calls
  const layers = [
    { R: 1030, color: 0x111828, count: 58, litProb: 0.6, zLen: 26 },
    { R: 1150, color: 0x1a2338, count: 44, litProb: 0.25, zLen: 30 },
  ];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const beaconPts = []; // 高樓屋頂紅色航空警示燈 (單一 Points → 1 draw call)
  for (const layer of layers) {
    const litGeos = [], darkGeos = [];
    const baseHex = `#${layer.color.toString(16).padStart(6, '0')}`;
    for (let i = 0; i < layer.count; i++) {
      const angle = (i / layer.count) * Math.PI * 2 + Math.random() * 0.06;
      const cx = Math.cos(angle) * layer.R, cz = Math.sin(angle) * layer.R;
      const facing = Math.atan2(-cx, -cz);
      const axX = Math.cos(facing), axZ = -Math.sin(facing); // 局部 x 軸的世界方向
      const w = 40 + Math.random() * 80;
      const h = 55 + Math.random() * 215;
      const parts = [[0, w, h, Math.random() < layer.litProb]];
      if (Math.random() < 0.55) {
        // 頂部退縮小塔
        parts.push([(Math.random() - 0.5) * w * 0.35, w * (0.32 + Math.random() * 0.25), h * (1.14 + Math.random() * 0.22), false]);
      }
      if (Math.random() < 0.45) {
        // 細天線
        parts.push([(Math.random() - 0.5) * w * 0.5, 2.5, h * (1.3 + Math.random() * 0.35), false]);
      }
      let topX = cx, topZ = cz, topY = h - 5;
      for (const [off, pw, ph, lit] of parts) {
        const geo = new THREE.BoxGeometry(pw, ph, layer.zLen);
        q.setFromAxisAngle(up, facing);
        m4.compose(
          new THREE.Vector3(cx + axX * off, ph / 2 - 5, cz + axZ * off),
          q, new THREE.Vector3(1, 1, 1));
        geo.applyMatrix4(m4);
        (lit ? litGeos : darkGeos).push(geo);
        if (ph - 5 > topY) { topY = ph - 5; topX = cx + axX * off; topZ = cz + axZ * off; }
      }
      // 較高的剪影樓在最高點 (主體/退縮塔/天線頂) 放一盞紅色警示燈,豐富天際線
      if (h > 150 && Math.random() < 0.6) beaconPts.push(topX, topY + 2, topZ);
    }
    if (darkGeos.length) {
      group.add(new THREE.Mesh(mergeGeometries(darkGeos),
        new THREE.MeshBasicMaterial({ color: layer.color, fog: false })));
    }
    if (litGeos.length) {
      group.add(new THREE.Mesh(mergeGeometries(litGeos),
        new THREE.MeshBasicMaterial({ map: silhouetteWindowTexture(baseHex), fog: false })));
    }
  }
  // 剪影高樓紅色警示燈:全部合進單一 Points (1 draw call)
  if (beaconPts.length) {
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(beaconPts, 3));
    group.add(new THREE.Points(bGeo, new THREE.PointsMaterial({
      map: radialGlowTexture('#ff3344'), color: 0xff4455,
      size: 7, sizeAttenuation: true,
      transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
      toneMapped: false, fog: false,
    })));
  }
  // 地平線光害輝光帶:淡暖白,把剪影腳部融進天空暈
  const ringGeo = new THREE.CylinderGeometry(1000, 1000, 60, 48, 1, true);
  const ringMat = new THREE.MeshBasicMaterial({
    map: horizonGlowTexture(), transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.BackSide, fog: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 26;
  group.add(ring);
  return group;
}

// ---------- 建築群 ----------
// 產生一組 (albedo, emissive) 貼圖:
//  albedo   — 深灰藍牆面 + 近黑玻璃窗 (提供白天/受光時的結構感)
//  emissive — 真實夜景邏輯:整棟 litRatio 僅 0.1~0.45、亮窗以「連續橫排」
//             為單位點亮 (同一戶/同一間辦公室整排亮)、低樓層亮高樓層暗、
//             每 3~4 層一條全暗樓板帶;dark=true 時幾乎全暗 (只剩零星窗)
function buildingTexturePair(dark = false) {
  const W = 256, H = 512;
  const ca = document.createElement('canvas'); ca.width = W; ca.height = H;
  const ce = document.createElement('canvas'); ce.width = W; ce.height = H;
  const ga = ca.getContext('2d');
  const ge = ce.getContext('2d');

  // 牆面基底;emissive 給一層極微弱冷色基底 (#0b0e14 級),讓黑箱與夜空分離
  ga.fillStyle = '#161a22';
  ga.fillRect(0, 0, W, H);
  ge.fillStyle = '#0b0e14';
  ge.fillRect(0, 0, W, H);

  const cols = 12 + Math.floor(Math.random() * 7);   // 12~18
  const rows = 48 + Math.floor(Math.random() * 17);  // 48~64
  const cw = W / cols, ch = H / rows;
  // 整棟亮窗比例:一般樓 18%~48%,暗樓 ~4% (夜景城市的靈魂是樓體本身會發光)
  const baseLit = dark ? 0.04 : 0.18 + Math.random() * 0.3;
  const slabEvery = 3 + Math.floor(Math.random() * 2); // 每 3~4 層一條樓板帶

  for (let y = 0; y < rows; y++) {
    if (y % slabEvery === slabEvery - 1) {
      // 全暗樓板帶 (albedo 畫深帶、emissive 保留冷色基底)
      ga.fillStyle = '#10141b';
      ga.fillRect(0, y * ch, W, ch);
      ge.fillStyle = '#0b0e14';
      ge.fillRect(0, y * ch, W, ch);
      continue;
    }
    // 垂直分區:canvas y=0 是樓頂 (flipY);曲線放平,中高樓層亮窗不再塌陷
    const floorK = 0.62 + 0.5 * (y / rows);
    const ratio = Math.min(0.55, baseLit * floorK * 1.2);
    const officeFloor = !dark && Math.random() < 0.035; // 偶發整層加班亮
    let x = 0;
    while (x < cols) {
      // 以 2~4 格「連續橫排」為單位決定亮/暗 (同一戶燈亮整排窗)
      const run = officeFloor ? cols : 2 + Math.floor(Math.random() * 3);
      const lit = officeFloor || Math.random() < ratio;
      // 同一排共用色溫與亮度;整體亮度較舊版降 ~40%,拉大暖/冷色差
      const b = Math.pow(Math.random(), 2);
      const k = 0.14 + b * 0.5;
      const warm = officeFloor ? false : Math.random() < 0.6;
      let fill;
      if (!dark && b > 0.93) fill = 'rgb(235,229,214)';                       // 極少數亮白
      else if (warm) fill = `rgb(${255 * k | 0},${200 * k | 0},${120 * k | 0})`;   // #ffc878 暖橙
      else fill = `rgb(${135 * k | 0},${175 * k | 0},${255 * k | 0})`;             // 冷藍偏飽和
      for (let i = 0; i < run && x < cols; i++, x++) {
        // albedo:深色玻璃,留 1px 分隔
        const gv = 6 + Math.random() * 6;
        ga.fillStyle = `rgb(${gv | 0},${(gv + 2) | 0},${(gv + 6) | 0})`;
        ga.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2);
        if (lit && Math.random() < 0.92) {
          ge.fillStyle = fill;
          ge.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2);
        }
      }
    }
  }

  // 暗樓保底:屋頂輪廓燈帶 + 頂部樓梯間燈柱,黑樓在夜空前仍有可讀邊緣
  if (dark) {
    ge.fillStyle = 'rgba(150,180,225,0.5)';
    ge.fillRect(0, 0, W, 2.5);                      // 屋頂輪廓燈 (canvas y=0 = 樓頂)
    const sx = (2 + Math.floor(Math.random() * (cols - 4))) * cw;
    ge.fillStyle = 'rgba(190,215,255,0.55)';
    for (let y = 0; y < Math.floor(rows * 0.3); y++) {
      if (y % slabEvery === slabEvery - 1) continue;
      ge.fillRect(sx + 1, y * ch + 1, cw - 2, ch - 2); // 樓梯間燈帶
    }
  }

  const ta = new THREE.CanvasTexture(ca);
  const te = new THREE.CanvasTexture(ce);
  for (const t of [ta, te]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { albedo: ta, emissive: te };
}

function storefrontTexture(seed) {
  // 沿街地面層:騎樓柱 + 暖色櫥窗光帶
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0e13';
  g.fillRect(0, 0, 512, 64);
  const bay = 56 + (seed % 3) * 10;
  for (let x = 0; x < 512; x += bay) {
    // 櫥窗
    if (Math.random() < 0.75) {
      const warm = Math.random() < 0.8;
      const bright = 0.35 + Math.random() * 0.65;
      const col = warm
        ? `rgba(255,${170 + Math.random() * 50 | 0},${90 + Math.random() * 40 | 0},${bright})`
        : `rgba(150,210,255,${bright * 0.8})`;
      const grad = g.createLinearGradient(0, 8, 0, 60);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(30,20,10,0.15)');
      g.fillStyle = grad;
      g.fillRect(x + 8, 8, bay - 16, 52);
    }
    // 騎樓柱
    g.fillStyle = '#05070b';
    g.fillRect(x, 0, 8, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function neonSignTexture(text, color, vertical) {
  // 直式格子 96→160px、shadowBlur 26→14:30m 外仍保字形可讀,不被自體光暈糊掉
  const c = document.createElement('canvas');
  if (vertical) { c.width = 160; c.height = 160 * text.length; }
  else { c.width = 64 * text.length + 40; c.height = 110; }
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(6,8,14,0.92)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = color;
  g.lineWidth = vertical ? 6 : 4;
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.font = `900 ${vertical ? 108 : 60}px "Noto Sans TC", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 14;
  g.fillStyle = color;
  if (vertical) {
    for (let i = 0; i < text.length; i++) g.fillText(text[i], 80, 80 + i * 160);
  } else {
    g.fillText(text, c.width / 2, 58);
  }
  // 二次描邊增亮
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.55;
  if (vertical) { for (let i = 0; i < text.length; i++) g.fillText(text[i], 80, 80 + i * 160); }
  else g.fillText(text, c.width / 2, 58);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBuildings(track, streaks) {
  const group = new THREE.Group();
  const neonSigns = [];

  // 以賽道取樣建立「不可蓋」快查
  const isNearTrack = (x, z, margin) => {
    for (let i = 0; i < track.samples.length; i += 10) {
      const p = track.samples[i].pos;
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < margin * margin) return true;
    }
    return false;
  };
  const isNearTower = (x, z, margin) => {
    const dx = x - TOWER_POS.x, dz = z - TOWER_POS.z;
    return dx * dx + dz * dz < margin * margin;
  };
  const minTrackDist = (x, z) => {
    let min = Infinity;
    for (let i = 0; i < track.samples.length; i += 10) {
      const p = track.samples[i].pos;
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < min) min = d2;
    }
    return Math.sqrt(min);
  };

  // 地標視廊:從賽道錨點朝 TOWER_POS 的 ±40m 走廊內限高。
  // 錨點密度 90→30 取樣 (~47 個錨點),走廊之間不再留出高樓擋視線的縫隙,
  // 保證繞場一圈絕大多數路段能看到 101 的完整豎向剪影
  const anchors = [];
  for (let i = 0; i < track.samples.length; i += 30) anchors.push(track.samples[i].pos);
  const inTowerCorridor = (x, z) => {
    for (const a of anchors) {
      const tx = TOWER_POS.x - a.x, tz = TOWER_POS.z - a.z;
      const len = Math.hypot(tx, tz);
      if (len < 1) continue;
      const ux = tx / len, uz = tz / len;
      const px = x - a.x, pz = z - a.z;
      const along = px * ux + pz * uz;
      if (along < 6 || along > len) continue;
      if (Math.abs(px * uz - pz * ux) < 40) return true;
    }
    return false;
  };

  // 7 組一般貼圖 + 2 組近全暗貼圖 (albedo + emissive),依建築尺寸用 clone + repeat
  // 共享 image,讓窗格實際尺寸固定在 ~1m;每棟再乘一個整棟亮度係數 (量化 3 級進快取)
  const texPairs = [];
  for (let i = 0; i < 7; i++) texPairs.push(buildingTexturePair(false));
  const darkStart = texPairs.length;
  texPairs.push(buildingTexturePair(true), buildingTexturePair(true));
  const INTENSITY_LEVELS = [0.55, 0.85, 1.2]; // 近賽道高樓要「自己會發光」,強於遠景剪影
  const matCache = new Map();
  const getMaterial = (variant, rx, ry, level) => {
    const key = `${variant}_${rx}_${ry}_${level}`;
    if (!matCache.has(key)) {
      const a = texPairs[variant].albedo.clone();
      const e = texPairs[variant].emissive.clone();
      for (const t of [a, e]) { t.repeat.set(rx, ry); t.needsUpdate = true; }
      matCache.set(key, new THREE.MeshStandardMaterial({
        map: a, emissiveMap: e, emissive: 0xffffff,
        emissiveIntensity: INTENSITY_LEVELS[level],
        color: 0xffffff, roughness: 0.75, metalness: 0.15,
      }));
    }
    return matCache.get(key);
  };

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  // 沿賽道外側 + 內側佈置建築,面向道路
  const placed = [];
  const tryPlace = (x, z, w, d) => {
    for (const p of placed) {
      if (Math.abs(x - p.x) < (w + p.w) / 2 + 4 && Math.abs(z - p.z) < (d + p.d) / 2 + 4) return false;
    }
    placed.push({ x, z, w, d });
    return true;
  };

  const podiums = [];    // 裙樓 {x,z,angle,w,d}
  const storefronts = [];
  const roofs = [];      // 屋頂 {x,z,w,d,h,angle} → 水塔/機房 instanced

  let signCount = 0;
  for (let i = 0; i < track.samples.length; i += 14) {
    const sm = track.samples[i];
    for (const side of [1, -1]) {
      if (Math.random() < 0.25) continue;
      const setback = 24 + Math.random() * 26;
      const x = sm.pos.x + sm.normal.x * setback * side + (Math.random() - 0.5) * 8;
      const z = sm.pos.z + sm.normal.z * setback * side + (Math.random() - 0.5) * 8;
      if (isNearTrack(x, z, 21) || isNearTower(x, z, 130)) continue;
      const w = 14 + Math.random() * 18;
      const d = 14 + Math.random() * 18;
      if (!tryPlace(x, z, w, d)) continue;
      let h = 18 + Math.random() * Math.random() * 120;
      // 視廊限高:保留低層裙樓不留空洞,但別擋住 101
      if (inTowerCorridor(x, z)) h = Math.min(h, 14);

      // repeat 上限 2,消除同一面牆可見的貼圖週期重複;寬樓改拉伸
      const rx = w > 26 ? 2 : 1;
      const ry = Math.max(1, Math.min(6, Math.round(h / 22)));
      // ~17% 全暗建築 (只剩零星窗與屋頂航空燈);其餘隨機亮度等級
      const isDark = Math.random() < 0.17;
      const variant = isDark
        ? darkStart + Math.floor(Math.random() * (texPairs.length - darkStart))
        : Math.floor(Math.random() * darkStart);
      // 亮度等級權重往亮檔偏移 (0.2 / 0.35 / 0.45)
      const lr = Math.random();
      const level = isDark ? 1 : (lr < 0.2 ? 0 : lr < 0.55 ? 1 : 2);
      const mat = getMaterial(variant, rx, ry, level);
      const tall = h > 70;
      // h>70 拆成主體 + 頂部退縮段,打破單一方盒輪廓
      const bodyH = tall ? h * 0.8 : h;
      const b = new THREE.Mesh(boxGeo, mat);
      b.position.set(x, 0, z);
      b.scale.set(w, bodyH, d);
      // 面向道路
      const angle = Math.atan2(sm.normal.x * side, sm.normal.z * side) + Math.PI;
      b.rotation.y = angle;
      b.castShadow = h > 60;
      group.add(b);
      if (tall) {
        const bTop = new THREE.Mesh(boxGeo, mat);
        bTop.scale.set(w * 0.64, h * 0.26, d * 0.64);
        bTop.position.set(x, h * 0.76, z);
        bTop.rotation.y = angle;
        group.add(bTop);
      }
      roofs.push({ x, z, w, d, h: tall ? h * 0.8 : h, angle });
      if (tall) roofs.push({ x, z, w: w * 0.64, d: d * 0.64, h: h * 1.02, angle });

      // 街道尺度:近賽道建築強制掛裙樓 + 沿街店面光帶 (裙樓不侵入路面)
      const md = minTrackDist(x, z);
      if (md < 52 && md - (Math.max(w, d) / 2 + 2) > 9) {
        podiums.push({ x, z, angle, w: w + 1.2, d: d + 1.2 });
        storefronts.push({ x, z, angle, w: w + 1, d: d + 1.2, side, nx: sm.normal.x, nz: sm.normal.z });
      }

      // 屋頂警示燈 (高樓)
      if (h > 90) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.8, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff3344, toneMapped: false }));
        beacon.position.set(x, h + 1, z);
        group.add(beacon);
      }

      // 面向道路的霓虹招牌組:貼牆大橫幅/直幅 + 垂直外挑雙面燈箱 (台北騎樓節奏)
      if (setback < 40 && signCount < 40 && Math.random() < 0.7) {
        signCount++;
        // signCount*4+side 保證相鄰招牌落在不同色系
        const [rawText, color] = NEON_TEXTS[(signCount * 4 + (side > 0 ? 0 : 7)) % NEON_TEXTS.length];
        const vertical = Math.random() < 0.5;
        const text = vertical ? rawText.replace(/\s/g, '').slice(0, 4) : rawText;
        const tex2 = neonSignTexture(text, color, vertical);
        const sw = vertical ? 5.1 : Math.min(w * 0.9, text.length * 3.5);
        const sh = vertical ? 5.1 * text.length : 5.8;
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(sw, sh),
          new THREE.MeshBasicMaterial({ map: tex2, transparent: true, toneMapped: false }));
        // 貼在面向道路的牆面,掛設高度集中在行車視錐 (下緣 5~9m)
        const facing = new THREE.Vector3(sm.normal.x * -side, 0, sm.normal.z * -side);
        const wallDist = d / 2 + 0.35; // 面向道路的牆面在局部 +z (深度軸)
        const bottomY = 5 + Math.random() * 4;
        sign.position.set(
          x + facing.x * wallDist,
          Math.min(bottomY + sh / 2, h - 2),
          z + facing.z * wallDist);
        sign.lookAt(sign.position.x + facing.x, sign.position.y, sign.position.z + facing.z);
        sign.userData.flicker = Math.random() < 0.25;
        sign.userData.phase = Math.random() * 10;
        neonSigns.push(sign);
        group.add(sign);

        const tanAngle = Math.atan2(sm.tan.x, sm.tan.z);
        // 濕路反射:從招牌實際位置向路面垂直投影 (夾到路寬內),
        // 且僅在招牌低掛 (<8m) 又貼近路面 (<12m) 時才生成 → 反射永遠有可見光源
        const sLat = (sign.position.x - sm.pos.x) * sm.normal.x * side
                   + (sign.position.z - sm.pos.z) * sm.normal.z * side;
        const rLat = Math.min(sLat, 6.5);
        const rX = sm.pos.x + sm.normal.x * side * rLat;
        const rZ = sm.pos.z + sm.normal.z * side * rLat;
        const dSign = Math.hypot(sign.position.x - rX, sign.position.z - rZ);
        if (bottomY < 8 && dSign < 12) {
          streaks.push({
            x: rX, z: rZ,
            angle: tanAngle, color,
            w: Math.min(sw, 3.2), len: 6 + Math.random() * 4,
          });
        }

        // 垂直外挑雙面燈箱 (不同色系),掛在牆角、垂直於牆面
        if (Math.random() < 0.7) {
          const [pText, pColor] = NEON_TEXTS[(signCount * 4 + 5 + (side > 0 ? 0 : 7)) % NEON_TEXTS.length];
          const vt = pText.replace(/\s/g, '').slice(0, 3);
          const ptex = neonSignTexture(vt, pColor, true);
          const pw = 1.7, ph = 1.7 * vt.length;
          // 背對背兩張 FrontSide plane 合併成單一 geometry (1 draw call):
          // 兩面文字皆正向,修掉 DoubleSide 背面鏡像字
          const pgF = new THREE.PlaneGeometry(pw, ph).translate(0, 0, 0.03);
          const pgB = new THREE.PlaneGeometry(pw, ph);
          pgB.rotateY(Math.PI);
          pgB.translate(0, 0, -0.03);
          const proj = new THREE.Mesh(
            mergeGeometries([pgF, pgB]),
            new THREE.MeshBasicMaterial({ map: ptex, transparent: true, toneMapped: false }));
          const wallDir = new THREE.Vector3(facing.z, 0, -facing.x); // 沿牆方向
          const along = (Math.random() < 0.5 ? 1 : -1) * w * 0.28;
          proj.position.set(
            x + facing.x * (wallDist + 1.1) + wallDir.x * along,
            3.2 + Math.random() * 3 + ph / 2,
            z + facing.z * (wallDist + 1.1) + wallDir.z * along);
          // 平面法線轉向沿牆方向 → 燈箱垂直外挑、行車方向可讀
          proj.lookAt(proj.position.x + wallDir.x, proj.position.y, proj.position.z + wallDir.z);
          proj.userData.flicker = Math.random() < 0.3;
          proj.userData.phase = Math.random() * 10;
          neonSigns.push(proj);
          group.add(proj);
          // 燈箱反射:同樣從燈箱實際位置投影 + 距離門檻
          const pLat = (proj.position.x - sm.pos.x) * sm.normal.x * side
                     + (proj.position.z - sm.pos.z) * sm.normal.z * side;
          const prLat = Math.min(pLat, 6.5);
          const prX = sm.pos.x + sm.normal.x * side * prLat;
          const prZ = sm.pos.z + sm.normal.z * side * prLat;
          if (Math.hypot(proj.position.x - prX, proj.position.z - prZ) < 12) {
            streaks.push({
              x: prX, z: prZ,
              angle: tanAngle, color: pColor,
              w: 1.8, len: 6 + Math.random() * 3.5,
            });
          }
        }
      }
    }
  }

  // 裙樓 InstancedMesh (1 draw call)
  if (podiums.length) {
    const podiumMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.9, metalness: 0.05 });
    const podInst = new THREE.InstancedMesh(boxGeo, podiumMat, podiums.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    podiums.forEach((p, i) => {
      q.setFromAxisAngle(up, p.angle);
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.w, 3.6, p.d));
      podInst.setMatrixAt(i, m4);
    });
    group.add(podInst);
  }

  // 沿街店面光帶 InstancedMesh × 2 貼圖變化 (2 draw calls)
  if (storefronts.length) {
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const sfMats = [
      new THREE.MeshBasicMaterial({ map: storefrontTexture(0) }),
      new THREE.MeshBasicMaterial({ map: storefrontTexture(1) }),
    ];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const buckets = [[], []];
    storefronts.forEach((s, i) => buckets[i % 2].push(s));
    buckets.forEach((bucket, bi) => {
      if (!bucket.length) return;
      const inst = new THREE.InstancedMesh(planeGeo, sfMats[bi], bucket.length);
      bucket.forEach((s, i) => {
        q.setFromAxisAngle(up, s.angle);
        // 面向道路那一側:裙樓牆面外 0.08m
        const fx = -s.nx * s.side, fz = -s.nz * s.side;
        m4.compose(
          new THREE.Vector3(s.x + fx * (s.d / 2 + 0.08), 1.9, s.z + fz * (s.d / 2 + 0.08)),
          q, new THREE.Vector3(s.w, 3.2, 1));
        inst.setMatrixAt(i, m4);
      });
      group.add(inst);
    });
  }

  // 屋頂小元素:水塔 (短圓柱) + 機房盒,InstancedMesh ×2 (2 draw calls),
  // 打破「屋頂一刀切平」的紙板盒感
  if (roofs.length) {
    const m4r = new THREE.Matrix4();
    const qr = new THREE.Quaternion();
    const upR = new THREE.Vector3(0, 1, 0);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.85, metalness: 0.2 });
    const tankGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.0, 8);
    tankGeo.translate(0, 1.0, 0);
    const hutGeo = new THREE.BoxGeometry(3.0, 2.2, 2.4);
    hutGeo.translate(0, 1.1, 0);
    const tanks = [], huts = [], parapets = [], masts = [], mastTips = [];
    for (const r of roofs) {
      const jx = () => (Math.random() - 0.5) * r.w * 0.45;
      const jz = () => (Math.random() - 0.5) * r.d * 0.45;
      if (Math.random() < 0.7) tanks.push([r.x + jx(), r.h, r.z + jz(), r.angle]);
      if (Math.random() < 0.6 && Math.min(r.w, r.d) > 10) huts.push([r.x + jx(), r.h, r.z + jz(), r.angle]);
      // 女兒牆:屋頂一圈略外擴的矮簷,打破「一刀切平」的盒頂輪廓
      if (Math.random() < 0.55 && Math.min(r.w, r.d) > 10) {
        parapets.push([r.x, r.h, r.z, r.angle, r.w + 0.6, r.d + 0.6]);
      }
      // 高樓天線桅杆 + 桅頂紅點:天際線多出細豎線與紅色小燈
      if (r.h > 70 && Math.random() < 0.55) {
        const mh = 5 + Math.random() * 5;
        const mx = r.x + jx() * 0.6, mz = r.z + jz() * 0.6;
        masts.push([mx, r.h, mz, r.angle, mh]);
        mastTips.push(mx, r.h + mh, mz);
      }
    }
    for (const [geo, list] of [[tankGeo, tanks], [hutGeo, huts]]) {
      if (!list.length) continue;
      const inst = new THREE.InstancedMesh(geo, roofMat, list.length);
      list.forEach((p, i) => {
        qr.setFromAxisAngle(upR, p[3]);
        m4r.compose(new THREE.Vector3(p[0], p[1], p[2]), qr, new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(i, m4r);
      });
      group.add(inst);
    }
    if (parapets.length) {
      const ppGeo = new THREE.BoxGeometry(1, 1, 1);
      ppGeo.translate(0, 0.5, 0);
      const ppInst = new THREE.InstancedMesh(ppGeo, roofMat, parapets.length);
      parapets.forEach((p, i) => {
        qr.setFromAxisAngle(upR, p[3]);
        m4r.compose(new THREE.Vector3(p[0], p[1], p[2]), qr, new THREE.Vector3(p[4], 0.55, p[5]));
        ppInst.setMatrixAt(i, m4r);
      });
      group.add(ppInst);
    }
    if (masts.length) {
      const mastGeo = new THREE.CylinderGeometry(0.05, 0.12, 1, 5);
      mastGeo.translate(0, 0.5, 0);
      const mastInst = new THREE.InstancedMesh(mastGeo, roofMat, masts.length);
      masts.forEach((p, i) => {
        qr.setFromAxisAngle(upR, p[3]);
        m4r.compose(new THREE.Vector3(p[0], p[1], p[2]), qr, new THREE.Vector3(1, p[4], 1));
        mastInst.setMatrixAt(i, m4r);
      });
      group.add(mastInst);
      const tipGeo = new THREE.BufferGeometry();
      tipGeo.setAttribute('position', new THREE.Float32BufferAttribute(mastTips, 3));
      group.add(new THREE.Points(tipGeo, new THREE.PointsMaterial({
        map: radialGlowTexture('#ff3344'), color: 0xff4455,
        size: 2.2, sizeAttenuation: true,
        transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      })));
    }
  }

  // 跨街燈箱柱:沿賽道 wall 外側的直式中文燈箱,保證行車視野內常有可讀招牌
  const pillarCount = 12;
  const pStep = Math.floor(track.samples.length / pillarCount);
  const glowTexCache = new Map();
  for (let k = 0; k < pillarCount; k++) {
    const sm = track.samples[(k * pStep + 37) % track.samples.length];
    const side = k % 2 === 0 ? 1 : -1;
    const px = sm.pos.x + sm.normal.x * 10.4 * side;
    const pz = sm.pos.z + sm.normal.z * 10.4 * side;
    if (isNearTower(px, pz, 60)) continue;
    const [text, color] = NEON_TEXTS[(k * 5 + 3) % NEON_TEXTS.length];
    const vText = text.replace(/\s/g, '').slice(0, 4);
    const tex = neonSignTexture(vText, color, true);
    const sw = 2.6, sh = 2.6 * vText.length;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(sw, sh, 0.3),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    box.position.set(px, 3.6 + sh / 2, pz);
    // 寬面垂直於行車方向 → 沿路兩個方向都可讀
    box.rotation.y = Math.atan2(sm.tan.x, sm.tan.z) + Math.PI / 2;
    box.userData.flicker = Math.random() < 0.25;
    box.userData.phase = Math.random() * 10;
    neonSigns.push(box);
    group.add(box);
    // 光暈:尺寸鎖在燈箱寬的 ~3 倍內,近距離時淡出避免糊住畫面
    if (!glowTexCache.has(color)) glowTexCache.set(color, radialGlowTexture(color));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexCache.get(color), transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.setScalar(Math.min(sh * 0.55, 4.5));
    glow.position.copy(box.position);
    attachGlowDistanceFade(glow, 0.3);
    group.add(glow);
    // 濕路反射
    streaks.push({
      x: sm.pos.x + sm.normal.x * side * 5.8,
      z: sm.pos.z + sm.normal.z * side * 5.8,
      angle: Math.atan2(sm.tan.x, sm.tan.z), color,
      w: 2.0, len: 7 + Math.random() * 4,
    });
  }

  group.userData.neonSigns = neonSigns;
  group.userData.update = (t) => {
    for (const s of neonSigns) {
      if (!s.userData.flicker) continue;
      const f = Math.sin(t * 17 + s.userData.phase) + Math.sin(t * 5.3 + s.userData.phase * 2);
      s.material.opacity = f > -1.2 ? 1 : 0.25;
      s.material.transparent = true;
    }
  };
  return group;
}

// ---------- 路燈 ----------
function poolLightTexture() {
  // 陡衰減光池:中心 ~0.9、60% 半徑處已 <0.05,加法混合下呈「被照亮」而非「蓋色塊」
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,217,160,0.85)');
  grad.addColorStop(0.28, 'rgba(255,205,145,0.36)');
  grad.addColorStop(0.5, 'rgba(255,195,130,0.05)');
  grad.addColorStop(0.72, 'rgba(255,192,125,0.012)'); // 尾緣再補一站:加法混合下不留可讀邊界
  grad.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStreetlights(track, streaks) {
  const group = new THREE.Group();
  // 依實際弧長取樣:每 ~35m 一盞、左右交錯,夜路有節奏性的橘色光池
  const segLen = track.samples[0].pos.distanceTo(track.samples[1].pos) || 1;
  const step = Math.max(1, Math.round(35 / segLen));
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1c2026, metalness: 0.7, roughness: 0.5 });

  // 合併燈桿幾何 → instanced
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 7.5, 6);
  poleGeo.translate(0, 3.75, 0);
  const armGeo = new THREE.BoxGeometry(0.12, 0.1, 2.6);
  armGeo.translate(0, 7.4, 1.3);
  const headGeo = new THREE.BoxGeometry(0.4, 0.14, 0.9);
  headGeo.translate(0, 7.36, 2.35);

  const positions = [];
  let idx = 0;
  for (let i = 0; i < track.samples.length; i += step) {
    const sm = track.samples[i];
    const side = idx++ % 2 === 0 ? 1 : -1; // 交錯兩側
    positions.push({
      x: sm.pos.x + sm.normal.x * 9.6 * side,
      z: sm.pos.z + sm.normal.z * 9.6 * side,
      angle: Math.atan2(-sm.normal.x * side, -sm.normal.z * side),
      tanAngle: Math.atan2(sm.tan.x, sm.tan.z),
    });
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const geo of [poleGeo, armGeo, headGeo]) {
    const inst = new THREE.InstancedMesh(geo, poleMat, positions.length);
    positions.forEach((p, i) => {
      q.setFromAxisAngle(up, p.angle);
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m4);
    });
    group.add(inst);
  }

  // 燈頭發光體
  const lampGeo = new THREE.BoxGeometry(0.34, 0.06, 0.8);
  lampGeo.translate(0, 7.28, 2.35);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, positions.length);
  positions.forEach((p, i) => {
    q.setFromAxisAngle(up, p.angle);
    m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
    lampInst.setMatrixAt(i, m4);
  });
  group.add(lampInst);

  // 路面光池 (假光:加法混合、陡衰減、暖白 #ffd9a0,與燈頭同色溫)
  // 半徑 +30%、亮度加倍,中心對準燈頭正下方偏路面側 → 路燈與路面產生光學連結
  const poolTex = poolLightTexture();
  const poolGeo = new THREE.PlaneGeometry(13, 9);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const poolInst = new THREE.InstancedMesh(poolGeo, poolMat, positions.length);
  positions.forEach((p, i) => {
    q.setFromAxisAngle(up, p.angle);
    // 中心沿法線往路面內再推 1.5m,光池完整落在柏油面內、不再硬切 curb 立面;
    // y=0.08:高於路面 (0.02) 與標線 (0.045),加上 polygonOffset 徹底遠離 z-fighting
    const off = new THREE.Vector3(0, 0, 4.4).applyQuaternion(q);
    m4.compose(new THREE.Vector3(p.x + off.x, 0.08, p.z + off.z), q, new THREE.Vector3(1, 1, 1));
    poolInst.setMatrixAt(i, m4);
  });
  group.add(poolInst);

  // 燈頭光暈 sprite:尺寸鎖在燈頭尺寸 ~3 倍,近距離淡出避免正對鏡頭時洗白畫面
  const glowTex = radialGlowTexture('#ffd9a0');
  for (const p of positions) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.setScalar(2.6);
    q.setFromAxisAngle(up, p.angle);
    const off = new THREE.Vector3(0, 7.3, 2.35).applyQuaternion(q);
    glow.position.set(p.x + off.x, off.y, p.z + off.z);
    attachGlowDistanceFade(glow, 0.45);
    group.add(glow);
  }

  // 濕路反射:每盞路燈在燈頭正下方路面拖一條暖白長痕 (沿行車方向)
  positions.forEach((p) => {
    q.setFromAxisAngle(up, p.angle);
    const off = new THREE.Vector3(0, 0, 3.4).applyQuaternion(q);
    streaks.push({
      x: p.x + off.x, z: p.z + off.z,
      angle: p.tanAngle, color: '#ffd9a0',
      w: 2.2, len: 8 + Math.random() * 3,
    });
  });

  // 人行道緣石:沿護欄外側 InstancedMesh (1 draw call),補足街道尺度
  const curbStep = Math.max(1, Math.round(6 / segLen));
  const curbs = [];
  for (let i = 0; i < track.samples.length; i += curbStep) {
    const sm = track.samples[i];
    for (const side of [1, -1]) {
      curbs.push({
        x: sm.pos.x + sm.normal.x * 9.95 * side,
        z: sm.pos.z + sm.normal.z * 9.95 * side,
        angle: Math.atan2(sm.tan.x, sm.tan.z),
      });
    }
  }
  const curbGeo = new THREE.BoxGeometry(2.5, 0.18, 6.4);
  curbGeo.translate(0, 0.09, 0);
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x272c35, roughness: 0.9, metalness: 0.05 });
  const curbInst = new THREE.InstancedMesh(curbGeo, curbMat, curbs.length);
  curbs.forEach((cb, i) => {
    q.setFromAxisAngle(up, cb.angle);
    m4.compose(new THREE.Vector3(cb.x, 0, cb.z), q, new THREE.Vector3(1, 1, 1));
    curbInst.setMatrixAt(i, m4);
  });
  group.add(curbInst);

  return group;
}
