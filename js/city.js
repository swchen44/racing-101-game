// city.js — 信義區街景:地面、建築群、霓虹招牌、路燈、天空 (夜/黃昏/白天三時段)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { radialGlowTexture, setTowerTime } from './taipei101.js';
import { TOWER_POS } from './taipei101.js';

const NEON_TEXTS = [
  ['信義商圈', '#ff4d6d'], ['誠品書店', '#ffb54d'], ['燒肉丼飯', '#ff7733'],
  ['卡拉OK', '#4dd8ff'], ['珍珠奶茶', '#3ee6a8'], ['深夜食堂', '#ffd24d'],
  ['火鍋 24H', '#ff5577'], ['咖啡 COFFEE', '#66ffcc'], ['市政府站', '#55aaff'],
  ['夜市小吃', '#ffaa33'], ['威秀影城', '#cc66ff'], ['新光三越', '#ff8899'],
  ['台北之夜', '#44eeff'], ['機車行', '#88ff66'], ['藥局', '#33ff99'],
];

// 灣岸港區:物流/港運/加油站的稀疏冷色招牌
const HARBOR_TEXTS = [
  ['台北港運', '#37a8ff'], ['東岸物流', '#7a5cff'], ['貨櫃集散', '#2ee6d0'],
  ['灣岸加油', '#ff9d4d'], ['報關行', '#37a8ff'], ['漁市 24H', '#2ee6d0'],
  ['倉儲中心', '#7a5cff'], ['燈塔咖啡', '#ffffff'],
];

// GP 賽場:賽事贊助商風格招牌
const GP_TEXTS = [
  ['MIDNIGHT GP', '#ff2e4d'], ['101 RACING', '#37e0ff'], ['PIT HOTEL', '#ffffff'],
  ['賽車用品', '#ffd23e'], ['冠軍輪胎', '#ff2e4d'], ['燃料補給', '#37e0ff'],
];

export function createCity(track, theme = {}) {
  const landmark = theme.landmark ?? 'tower101';
  // 時段 ('night'|'dusk'|'day'):main.js 經 theme.weatherId 傳入;
  // 先通知 taipei101.js (main.js 保證 createCity 先於 createTaipei101 執行)
  const wid = theme.weatherId ?? 'night';
  setTowerTime(wid);
  const group = new THREE.Group();
  // 濕路反射 streak 收集器:建築霓虹/燈箱柱/路燈都往這裡丟 {x,z,angle,color,w,len}
  const streaks = [];
  group.add(createGround(theme, landmark));
  group.add(createSky(theme, landmark));
  if (landmark === 'mountain') {
    // 山道:無城市建築/霓虹,改環形山巒 + 滿山樹木 + 護欄反光柱 + 民宅廟宇
    group.add(createMountainRidges(wid));
    group.add(createMountainEnv(track, streaks, wid));
    group.add(createStreetlights(track, streaks, { spacing: 70 }, wid));
  } else {
    group.add(createBuildings(track, streaks, theme));
    group.add(createStreetlights(track, streaks,
      landmark === 'harbor' ? { lampColor: '#dfe9ff', spacing: 42 }
        : landmark === 'grandstand' ? { lampColor: '#eef2ff' } : {}, wid));
    group.add(createSkylineSilhouette(wid));
    if (landmark === 'tower101') group.add(createStreetClutter(track, wid));
    if (landmark === 'harbor') group.add(createHarborEnv(track, streaks, wid));
    if (landmark === 'grandstand') group.add(createGrandPrixEnv(track, streaks, wid));
  }
  // 場景道具:天橋/門架隧道/紅綠燈/斑馬線/加油群眾 (三時段皆有)
  group.add(createTrackFurniture(track, streaks, landmark, wid));
  // 天空飛行器:定期航班 + 巡邏直升機
  group.add(createSkyTraffic(landmark, wid));
  // 無雨設定:路面乾燥,濕路反射條全時段停用 (程式保留供未來雨天模式)
  // 匯總子群 update (霓虹閃爍等):main.js 只巡訪 worldGroup 直接子層
  const updatables = group.children.filter((c) => c.userData.update);
  group.userData.update = (t) => { for (const u of updatables) u.userData.update(t); };
  return group;
}

// ---------- 路外街道雜物:行道樹/停放機車/路邊停車/路障花台/路外光池 ----------
// 填滿護欄 (9.95m) 到建築退縮線 (24m+) 之間的空白帶,全 InstancedMesh (~7 draw calls)
function treeCanopyTexture(bright = 1) {
  // bright:1=夜 (深綠剪影) / ~2=黃昏 / ~4=白天亮綠
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  // 多個重疊圓斑堆出樹冠
  for (let i = 0; i < 42; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 40;
    const px = 64 + Math.cos(a) * r, py = 56 + Math.sin(a) * r * 0.8;
    const rad = 10 + Math.random() * 16;
    const v = (14 + Math.random() * 14) * bright;
    g.fillStyle = `rgb(${v * 0.55 | 0},${Math.min(255, v) | 0},${v * 0.62 | 0})`;
    g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStreetClutter(track, wid = 'night') {
  const group = new THREE.Group();
  const isDay = wid === 'day', isDusk = wid === 'dusk';
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
    map: treeCanopyTexture(isDay ? 4.2 : isDusk ? 2.0 : 1), alphaTest: 0.5, side: THREE.DoubleSide,
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

  // --- 路外零星光池:騎樓/店面漏光,複用 poolLightTexture (白天無漏光) ---
  const pools = [];
  if (!isDay) {
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
    map: poolLightTexture(), transparent: true, opacity: isDusk ? 0.15 : 0.26,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), pools);
  } // end !isDay

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

function createReflectionStreaks(streaks, wid = 'night') {
  const group = new THREE.Group();
  if (!streaks.length) return group;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: streakTexture(), transparent: true, opacity: wid === 'dusk' ? 0.11 : 0.16,
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
function createGround(theme = {}, landmark = 'tower101') {
  const tint = theme.groundTint ?? 0x101318;
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${tr},${tg},${tb})`;
  g.fillRect(0, 0, 512, 512);
  // 大尺度明暗斑塊:打破「一望無際的均勻死平面」,遠看有地表的不均勻感
  const blobCount = landmark === 'mountain' ? 22 : 14;
  for (let i = 0; i < blobCount; i++) {
    const px = Math.random() * 512, py = Math.random() * 512;
    const r = 60 + Math.random() * 140;
    const lighter = Math.random() < (landmark === 'mountain' ? 0.35 : 0.5);
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, lighter
      ? `rgba(${tr + 32},${tg + 38},${tb + 40},0.16)`
      : 'rgba(2,3,6,0.24)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const v = Math.random() * 22;
    g.fillStyle = `rgba(${tr * 0.8 + v | 0},${tg * 0.8 + v | 0},${tb * 0.8 + v | 0},0.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  if (landmark === 'tower101' || landmark === 'grandstand') {
    // 街廓格線 (遠景暗示街道)
    g.strokeStyle = 'rgba(60,70,85,0.5)';
    g.lineWidth = 4;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke();
    }
  } else if (landmark === 'harbor') {
    // 港區大混凝土板塊縫:稀疏寬格線
    g.strokeStyle = 'rgba(55,64,80,0.35)';
    g.lineWidth = 5;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke();
    }
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

// ---------- 天空 (夜/黃昏/白天) ----------
function cloudQuadTexture(warm) {
  // 程序化積雲:多層柔邊圓斑堆出蓬鬆團塊;warm=黃昏晚霞色,否則日間白雲
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  const blobs = 26;
  for (let i = 0; i < blobs; i++) {
    const px = 40 + Math.random() * 176;
    const py = 55 + (Math.random() - 0.5) * 44;
    const r = 14 + Math.random() * 30;
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    if (warm) {
      // 晚霞:底暖橘、頂玫瑰紫
      const top = py < 55;
      grad.addColorStop(0, top ? 'rgba(255,170,140,0.32)' : 'rgba(255,140,80,0.4)');
      grad.addColorStop(0.6, top ? 'rgba(220,120,130,0.14)' : 'rgba(255,120,70,0.18)');
      grad.addColorStop(1, 'rgba(180,90,110,0)');
    } else {
      grad.addColorStop(0, 'rgba(255,255,255,0.5)');
      grad.addColorStop(0.55, 'rgba(240,245,252,0.2)');
      grad.addColorStop(1, 'rgba(225,235,248,0)');
    }
    g.fillStyle = grad;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // 底緣壓一層陰影 (雲底較暗) 增加體積感
  const sh = g.createLinearGradient(0, 60, 0, 110);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, warm ? 'rgba(90,40,60,0.28)' : 'rgba(120,140,165,0.25)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh;
  g.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 程序化 quad 雲:數片朝內的平面 merge 成 1 mesh (1 draw call)
function cloudQuads(wid) {
  const geos = [];
  const n = wid === 'day' ? 10 : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    // 黃昏雲集中低空成晚霞雲帶;白天雲散佈中高空
    const hAng = wid === 'day' ? 0.28 + Math.random() * 0.35 : 0.1 + Math.random() * 0.14;
    const R = 1080;
    const y = Math.sin(hAng) * R;
    const rxz = Math.cos(hAng) * R;
    const w = 320 + Math.random() * 300;
    const geo = new THREE.PlaneGeometry(w, w * 0.34);
    // 面向場景中心
    const px = Math.cos(a) * rxz, pz = Math.sin(a) * rxz;
    const m = new THREE.Matrix4().lookAt(
      new THREE.Vector3(px, y, pz), new THREE.Vector3(0, y * 0.55, 0), new THREE.Vector3(0, 1, 0));
    m.setPosition(px, y, pz);
    geo.applyMatrix4(m);
    geos.push(geo);
  }
  return new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({
    map: cloudQuadTexture(wid === 'dusk'), transparent: true, depthWrite: false,
    opacity: wid === 'day' ? 0.9 : 0.85, fog: false, side: THREE.DoubleSide,
  }));
}

function createSky(theme = {}, landmark = 'tower101') {
  const group = new THREE.Group();
  const wid = theme.weatherId ?? 'night';
  const isDay = wid === 'day', isDusk = wid === 'dusk';
  // 主題化天空:horizonColor 控制地平線光害暈 (×0.25 壓到閾下),
  // skyMid/skyZenith 可覆蓋中天/天頂基色 (灣岸偏藍紫、山道更暗更透);
  // 白天/黃昏由 WEATHERS.sky 直接覆蓋成日光/晚霞色階
  const hor = theme.horizonColor ?? [0.28, 0.16, 0.10];
  const mid = theme.skyMid ?? [0.04, 0.06, 0.13];
  const zen = theme.skyZenith ?? [0.012, 0.02, 0.05];
  // 低空 haze 收斂色:與 WEATHERS.lighting.fogColor 同步 (night 0x0a0f1e / dusk 0x3a2434 / day 0xa8bfd4)
  const fogCol = isDay ? [0.62, 0.72, 0.81] : isDusk ? [0.26, 0.16, 0.23] : [0.048, 0.062, 0.10];
  // 地平線暈強度:黃昏晚霞最強、白天中等 (地平線霧白)、夜晚光害微暈
  const horGain = isDay ? 0.5 : isDusk ? 0.85 : 0.25;
  // 薄雲帶色:白天白、黃昏橘粉、夜晚原微藍
  const cloudCol = isDay ? [0.22, 0.23, 0.25] : isDusk ? [0.30, 0.13, 0.10] : [0.010, 0.013, 0.020];
  // 漸層天空穹頂:地平線帶混入與 FogExp2 同色溫的 haze,
  // 讓「被霧染色的中景 → 遠景剪影 → 天空」三層在同一色階上銜接
  const skyGeo = new THREE.SphereGeometry(1250, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uHorizon: { value: new THREE.Vector3(...hor) },
      uMid: { value: new THREE.Vector3(...mid) },
      uZenith: { value: new THREE.Vector3(...zen) },
      uFog: { value: new THREE.Vector3(...fogCol) },
      uHorGain: { value: horGain },
      uCloudCol: { value: new THREE.Vector3(...cloudCol) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 uHorizon;
      uniform vec3 uMid;
      uniform vec3 uZenith;
      uniform vec3 uFog;
      uniform float uHorGain;
      uniform vec3 uCloudCol;
      void main() {
        float h = normalize(vPos).y;
        vec3 zenith = uZenith;
        vec3 mid    = uMid;
        vec3 col = mix(mid, zenith, smoothstep(0.25, 0.9, h));
        // 低空 haze:貼近地平線時收斂到霧色,消除遠景/天空色相斷裂
        col = mix(uFog, col, smoothstep(-0.02, 0.22, h));
        // 地平線暈:夜=光害微暈 / 黃昏=晚霞 / 白天=地平線霧白
        float band = exp(-pow(max(h, 0.0) * 5.5, 1.5));
        col += uHorizon * uHorGain * band;
        // 低對比模糊雲帶 ×2:上半幀的程序化薄雲 (時段換色)
        vec3 dir = normalize(vPos);
        float az = atan(dir.z, dir.x);
        float cloudBand = smoothstep(0.12, 0.35, h) * smoothstep(0.85, 0.45, h);
        float n1 = sin(az * 3.0 + dir.y * 9.0) * sin(az * 7.0 - dir.y * 4.0 + 1.7);
        float n2 = sin(az * 5.0 - dir.y * 13.0 + 4.2) * sin(az * 2.0 + dir.y * 6.0);
        float clouds = max(n1, 0.0) * 0.6 + max(n2, 0.0) * 0.4;
        col += uCloudCol * clouds * cloudBand;
        // 螢幕座標 dither 消除漸層 banding
        col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.008;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // 白天/黃昏:程序化 quad 雲 (merge → 1 draw call)
  if (isDay || isDusk) group.add(cloudQuads(wid));

  // 太陽:白天高懸小光暈;黃昏低垂地平線大光球 (與 WEATHERS.sunPos 同方位)
  if (isDay) {
    const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlowTexture('#fffbe8'), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }));
    sunCore.scale.setScalar(150);
    sunCore.position.set(-440, 860, 175); // sunPos [-150,320,60] 方位
    group.add(sunCore);
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlowTexture('#fff2cc'), transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }));
    sunHalo.scale.setScalar(430);
    sunHalo.position.copy(sunCore.position);
    group.add(sunHalo);
  } else if (isDusk) {
    const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlowTexture('#ffcf8a'), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }));
    sunCore.scale.setScalar(230);
    sunCore.position.set(-1010, 250, -252); // sunPos [-320,90,-80] 方位,貼地平線
    group.add(sunCore);
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlowTexture('#ff9a55'), transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }));
    sunHalo.scale.set(980, 620, 1);
    sunHalo.position.copy(sunCore.position);
    group.add(sunHalo);
  }

  if (isDay) return group; // 白天:無星無月

  // 星星:山道光害少 → 星更多更亮 (theme.stars 覆蓋)
  const starCfg = theme.stars ?? {};
  const starCount = starCfg.count ?? 900;
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
    color: 0xbfd4ff, size: starCfg.size ?? 2.0, sizeAttenuation: false,
    // 黃昏:天光未暗,只留高空零星微星
    transparent: true, opacity: (starCfg.opacity ?? 0.55) * (isDusk ? 0.2 : 1), depthWrite: false,
  }));
  group.add(stars);

  // 月亮 (黃昏不掛月,主角是低垂的太陽)
  if (!isDusk) {
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
  }
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

function createSkylineSilhouette(wid = 'night') {
  const group = new THREE.Group();
  const isDay = wid === 'day', isDusk = wid === 'dusk';
  // 兩層剪影:近層帶窗點、遠層更亮更接近天空 haze,做出大氣透視;
  // 每「棟」是 1~3 個 box 的複合剪影 (主體 + 頂部退縮小塔 + 細天線),
  // 依材質 merge 成少數 geometry → 全部剪影僅 ~4 draw calls
  // 時段配色:白天=大氣透視的粉藍灰、無亮窗;黃昏=暖紫黑、零星早亮窗;夜=原深藍
  const layers = isDay ? [
    { R: 1030, color: 0x8ba0b6, count: 58, litProb: 0, zLen: 26 },
    { R: 1150, color: 0xa2b4c8, count: 44, litProb: 0, zLen: 30 },
  ] : isDusk ? [
    { R: 1030, color: 0x2c2136, count: 58, litProb: 0.35, zLen: 26 },
    { R: 1150, color: 0x453352, count: 44, litProb: 0.12, zLen: 30 },
  ] : [
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
  // 剪影高樓紅色警示燈:全部合進單一 Points (1 draw call);白天遠景不可見 → 省掉
  if (beaconPts.length && !isDay) {
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
  // 地平線光害輝光帶:淡暖白,把剪影腳部融進天空暈 (黃昏加倍成晚霞腳光;白天不需要)
  if (!isDay) {
    const ringGeo = new THREE.CylinderGeometry(1000, 1000, 60, 48, 1, true);
    const ringMat = new THREE.MeshBasicMaterial({
      map: horizonGlowTexture(), transparent: true, opacity: isDusk ? 0.6 : 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.BackSide, fog: false, toneMapped: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 26;
    group.add(ring);
  }
  return group;
}

// ---------- 建築群 ----------
// 產生一組 (albedo, emissive) 貼圖:
//  albedo   — 深灰藍牆面 + 近黑玻璃窗 (提供白天/受光時的結構感)
//  emissive — 真實夜景邏輯:整棟 litRatio 僅 0.1~0.45、亮窗以「連續橫排」
//             為單位點亮 (同一戶/同一間辦公室整排亮)、低樓層亮高樓層暗、
//             每 3~4 層一條全暗樓板帶;dark=true 時幾乎全暗 (只剩零星窗)
function buildingTexturePair(dark = false, dayMode = false) {
  // dayMode:白天用亮色牆面 + 映天玻璃的 albedo (夜間 albedo 近黑,日照下會變黑碑)
  const W = 256, H = 512;
  const ca = document.createElement('canvas'); ca.width = W; ca.height = H;
  const ce = document.createElement('canvas'); ce.width = W; ce.height = H;
  const ga = ca.getContext('2d');
  const ge = ce.getContext('2d');

  // 牆面基底;emissive 給一層極微弱冷色基底 (#0b0e14 級),讓黑箱與夜空分離
  ga.fillStyle = dayMode ? '#87909c' : '#161a22';
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
      ga.fillStyle = dayMode ? '#6b7480' : '#10141b';
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
        // albedo:夜=深色玻璃;白天=映天空的淺藍玻璃,留 1px 分隔
        const gv = dayMode ? 108 + Math.random() * 42 : 6 + Math.random() * 6;
        ga.fillStyle = dayMode
          ? `rgb(${gv | 0},${(gv + 10) | 0},${(gv + 24) | 0})`
          : `rgb(${gv | 0},${(gv + 2) | 0},${(gv + 6) | 0})`;
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

function neonSignTexture(text, color, vertical, daytime = false) {
  // 直式格子 96→160px、shadowBlur 26→14:30m 外仍保字形可讀,不被自體光暈糊掉
  // daytime=true:熄燈的素面招牌 (亮底色板 + 實色字,無霓虹光暈)
  const c = document.createElement('canvas');
  if (vertical) { c.width = 160; c.height = 160 * text.length; }
  else { c.width = 64 * text.length + 40; c.height = 110; }
  const g = c.getContext('2d');
  g.fillStyle = daytime ? '#d8d5cc' : 'rgba(6,8,14,0.92)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = daytime ? '#4a4d55' : color;
  g.lineWidth = vertical ? 6 : 4;
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.font = `900 ${vertical ? 108 : 60}px "Noto Sans TC", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (!daytime) { g.shadowColor = color; g.shadowBlur = 14; }
  g.fillStyle = color;
  if (vertical) {
    for (let i = 0; i < text.length; i++) g.fillText(text[i], 80, 80 + i * 160);
  } else {
    g.fillText(text, c.width / 2, 58);
  }
  if (!daytime) {
    // 二次描邊增亮 (夜間霓虹核心)
    g.shadowBlur = 6;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.55;
    if (vertical) { for (let i = 0; i < text.length; i++) g.fillText(text[i], 80, 80 + i * 160); }
    else g.fillText(text, c.width / 2, 58);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 找最長連續直線段 (GP 大直線佈置看台/維修站、建築禁建走廊用)
function findMainStraight(track) {
  const N = track.samples.length;
  const straightAt = (i) => track.samples[i].tan.dot(track.samples[(i + 20) % N].tan) > 0.9995;
  // 從一個彎中開始掃,避免直線跨越環狀接縫被切兩半
  let start = 0;
  while (start < N && straightAt(start)) start++;
  if (start >= N) start = 0;
  let best = { i0: 0, len: 1 };
  let runStart = -1;
  for (let k = 0; k <= N; k++) {
    const i = (start + k) % N;
    if (k < N && straightAt(i)) { if (runStart < 0) runStart = k; }
    else if (runStart >= 0) {
      const len = k - runStart;
      if (len > best.len) best = { i0: (start + runStart) % N, len };
      runStart = -1;
    }
  }
  const indices = [];
  for (let k = 0; k < best.len; k++) indices.push((best.i0 + k) % N);
  const near = (x, z, margin) => {
    for (let k = 0; k < indices.length; k += 8) {
      const p = track.samples[indices[k]].pos;
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < margin * margin) return true;
    }
    return false;
  };
  return { indices, near };
}

function createBuildings(track, streaks, theme = {}) {
  const group = new THREE.Group();
  const neonSigns = [];
  const landmark = theme.landmark ?? 'tower101';
  const hasTower = landmark === 'tower101';
  const wid = theme.weatherId ?? 'night';
  const isDay = wid === 'day', isDusk = wid === 'dusk';
  // 招牌材質係數:白天素面板 (toneMapped, 不發光);黃昏霓虹半亮 (色乘 0.72)
  const signToneMapped = isDay;
  const signTint = isDay ? 0xffffff : isDusk ? 0xb8b8b8 : 0xffffff;
  // 主題化招牌:文案組 + 色盤覆蓋 (theme.neonColors)
  const texts = landmark === 'harbor' ? HARBOR_TEXTS
    : landmark === 'grandstand' ? GP_TEXTS : NEON_TEXTS;
  const palette = theme.neonColors || null;
  const pickSign = (idx) => {
    const [text, baseColor] = texts[idx % texts.length];
    return [text, palette ? palette[idx % palette.length] : baseColor];
  };
  const warehouse = landmark === 'harbor'; // 低矮寬扁倉庫,少招牌
  // 主題禁建區:港區南側讓給海面;GP 大直線讓給看台/維修站
  let themeOk = () => true;
  if (landmark === 'harbor') themeOk = (x, z) => z > -228;
  if (landmark === 'grandstand') {
    const straight = findMainStraight(track);
    themeOk = (x, z) => !straight.near(x, z, 48);
  }

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
    if (!hasTower) return false;
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
    if (!hasTower) return false;
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
  for (let i = 0; i < 7; i++) texPairs.push(buildingTexturePair(false, isDay));
  const darkStart = texPairs.length;
  texPairs.push(buildingTexturePair(true, isDay), buildingTexturePair(true, isDay));
  const eMul = theme.emissiveMul ?? 1; // 時段:白天窗燈近乎熄滅、黃昏減半
  const INTENSITY_LEVELS = [0.55 * eMul, 0.85 * eMul, 1.2 * eMul]; // 近賽道高樓要「自己會發光」,強於遠景剪影
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
  const skip = theme.buildingSkip ?? 0.25; // 越高建築越稀疏 (山道/高速公路用)
  for (let i = 0; i < track.samples.length; i += 14) {
    const sm = track.samples[i];
    for (const side of [1, -1]) {
      if (Math.random() < skip) continue;
      const setback = 24 + Math.random() * 26;
      const x = sm.pos.x + sm.normal.x * setback * side + (Math.random() - 0.5) * 8;
      const z = sm.pos.z + sm.normal.z * setback * side + (Math.random() - 0.5) * 8;
      if (isNearTrack(x, z, 21) || isNearTower(x, z, 130) || !themeOk(x, z)) continue;
      const w = warehouse ? 26 + Math.random() * 24 : 14 + Math.random() * 18;
      const d = warehouse ? 18 + Math.random() * 14 : 14 + Math.random() * 18;
      if (!tryPlace(x, z, w, d)) continue;
      let h = warehouse
        ? (Math.random() < 0.12 ? 30 + Math.random() * 30 : 9 + Math.random() * 10)
        : 18 + Math.random() * Math.random() * 120;
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
      const signCap = warehouse ? 14 : 40;
      const signProb = warehouse ? 0.35 : 0.7;
      if (setback < 40 && signCount < signCap && Math.random() < signProb) {
        signCount++;
        // signCount*4+side 保證相鄰招牌落在不同色系
        const [rawText, color] = pickSign(signCount * 4 + (side > 0 ? 0 : 7));
        const vertical = Math.random() < 0.5;
        const text = vertical ? rawText.replace(/\s/g, '').slice(0, 4) : rawText;
        const tex2 = neonSignTexture(text, color, vertical, isDay);
        const sw = vertical ? 5.1 : Math.min(w * 0.9, text.length * 3.5);
        const sh = vertical ? 5.1 * text.length : 5.8;
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(sw, sh),
          new THREE.MeshBasicMaterial({
            map: tex2, transparent: true, toneMapped: signToneMapped, color: signTint,
          }));
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
        if (Math.random() < (warehouse ? 0.3 : 0.7)) {
          const [pText, pColor] = pickSign(signCount * 4 + 5 + (side > 0 ? 0 : 7));
          const vt = pText.replace(/\s/g, '').slice(0, 3);
          const ptex = neonSignTexture(vt, pColor, true, isDay);
          const pw = 1.7, ph = 1.7 * vt.length;
          // 背對背兩張 FrontSide plane 合併成單一 geometry (1 draw call):
          // 兩面文字皆正向,修掉 DoubleSide 背面鏡像字
          const pgF = new THREE.PlaneGeometry(pw, ph).translate(0, 0, 0.03);
          const pgB = new THREE.PlaneGeometry(pw, ph);
          pgB.rotateY(Math.PI);
          pgB.translate(0, 0, -0.03);
          const proj = new THREE.Mesh(
            mergeGeometries([pgF, pgB]),
            new THREE.MeshBasicMaterial({
              map: ptex, transparent: true, toneMapped: signToneMapped, color: signTint,
            }));
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
    // 白天:騎樓/櫥窗燈熄 → 大幅壓暗成陰影帶;黃昏:剛開燈,微降
    const sfTint = isDay ? 0x555a60 : isDusk ? 0xd8d8d8 : 0xffffff;
    const sfMats = [
      new THREE.MeshBasicMaterial({ map: storefrontTexture(0), color: sfTint }),
      new THREE.MeshBasicMaterial({ map: storefrontTexture(1), color: sfTint }),
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

  // 跨街燈箱柱:沿賽道 wall 外側的直式燈箱,保證行車視野內常有可讀招牌
  const pillarCount = warehouse ? 6 : landmark === 'grandstand' ? 8 : 12;
  const pStep = Math.floor(track.samples.length / pillarCount);
  const glowTexCache = new Map();
  for (let k = 0; k < pillarCount; k++) {
    const sm = track.samples[(k * pStep + 37) % track.samples.length];
    const side = k % 2 === 0 ? 1 : -1;
    const px = sm.pos.x + sm.normal.x * 10.4 * side;
    const pz = sm.pos.z + sm.normal.z * 10.4 * side;
    if (isNearTower(px, pz, 60)) continue;
    // GP 燈箱柱固定取中文文案 (英文直排截字會讀成亂碼)
    const [text, color] = landmark === 'grandstand' ? pickSign(3 + (k % 3)) : pickSign(k * 5 + 3);
    const vText = text.replace(/\s/g, '').slice(0, 4);
    const tex = neonSignTexture(vText, color, true, isDay);
    const sw = 2.6, sh = 2.6 * vText.length;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(sw, sh, 0.3),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: signToneMapped, color: signTint }));
    box.position.set(px, 3.6 + sh / 2, pz);
    // 寬面垂直於行車方向 → 沿路兩個方向都可讀
    box.rotation.y = Math.atan2(sm.tan.x, sm.tan.z) + Math.PI / 2;
    box.userData.flicker = Math.random() < 0.25;
    box.userData.phase = Math.random() * 10;
    neonSigns.push(box);
    group.add(box);
    // 光暈:尺寸鎖在燈箱寬的 ~3 倍內,近距離時淡出避免糊住畫面 (白天熄燈無暈)
    if (!isDay) {
      if (!glowTexCache.has(color)) glowTexCache.set(color, radialGlowTexture(color));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexCache.get(color), transparent: true, opacity: 0.3 * (isDusk ? 0.55 : 1),
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      glow.scale.setScalar(Math.min(sh * 0.55, 4.5));
      glow.position.copy(box.position);
      attachGlowDistanceFade(glow, 0.3 * (isDusk ? 0.55 : 1));
      group.add(glow);
    }
    // 濕路反射
    streaks.push({
      x: sm.pos.x + sm.normal.x * side * 5.8,
      z: sm.pos.z + sm.normal.z * side * 5.8,
      angle: Math.atan2(sm.tan.x, sm.tan.z), color,
      w: 2.0, len: 7 + Math.random() * 4,
    });
  }

  group.userData.neonSigns = neonSigns;
  // 霓虹閃爍:白天招牌熄燈 → 不閃
  if (!isDay) {
    group.userData.update = (t) => {
      for (const s of neonSigns) {
        if (!s.userData.flicker) continue;
        const f = Math.sin(t * 17 + s.userData.phase) + Math.sin(t * 5.3 + s.userData.phase * 2);
        s.material.opacity = f > -1.2 ? 1 : 0.25;
        s.material.transparent = true;
      }
    };
  }
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

function createStreetlights(track, streaks, opts = {}, wid = 'night') {
  const group = new THREE.Group();
  const isDay = wid === 'day'; // 白天:路燈熄滅 (燈頭暗面、光池/光暈/濕反射全省)
  // 主題參數:spacing 燈距 (山道拉大)、lampColor 色溫 (灣岸/GP 偏冷白)
  const spacing = opts.spacing ?? 35;
  const lampColor = opts.lampColor ?? '#ffd9a0';
  // 依實際弧長取樣:每 ~spacing m 一盞、左右交錯,夜路有節奏性的光池
  const segLen = track.samples[0].pos.distanceTo(track.samples[1].pos) || 1;
  const step = Math.max(1, Math.round(spacing / segLen));
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

  // 燈頭發光體 (白天:熄燈的灰白燈罩)
  const lampGeo = new THREE.BoxGeometry(0.34, 0.06, 0.8);
  lampGeo.translate(0, 7.28, 2.35);
  const lampMat = isDay
    ? new THREE.MeshBasicMaterial({ color: 0x7a8088 })
    : new THREE.MeshBasicMaterial({ color: lampColor, toneMapped: false });
  const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, positions.length);
  positions.forEach((p, i) => {
    q.setFromAxisAngle(up, p.angle);
    m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
    lampInst.setMatrixAt(i, m4);
  });
  group.add(lampInst);

  if (!isDay) {
  // 路面光池 (假光:加法混合、陡衰減、暖白 #ffd9a0,與燈頭同色溫)
  // 半徑 +30%、亮度加倍,中心對準燈頭正下方偏路面側 → 路燈與路面產生光學連結
  const poolTex = poolLightTexture();
  const poolGeo = new THREE.PlaneGeometry(13, 9);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, color: lampColor === '#ffd9a0' ? 0xffffff : lampColor,
    transparent: true, opacity: 0.6,
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
  const glowTex = radialGlowTexture(lampColor);
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
      angle: p.tanAngle, color: lampColor,
      w: 2.2, len: 8 + Math.random() * 3,
    });
  });
  } // end !isDay:光池/光暈/濕反射

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

// ============================================================
// 主題環境 —— 灣岸港區 / 山道 / GP 賽場
// 共用小工具:instanced 佈置 + 發光點雲 (全數合併,嚴控 draw call)
// ============================================================

const _envM4 = new THREE.Matrix4();
const _envQ = new THREE.Quaternion();
const _envUp = new THREE.Vector3(0, 1, 0);
const _envV3 = new THREE.Vector3();

// list: [x, y, z, angleY, scale|[sx,sy,sz], colorHex?] → 單一 InstancedMesh (1 draw call)
function instancedFrom(geo, mat, list) {
  if (!list.length) return null;
  const inst = new THREE.InstancedMesh(geo, mat, list.length);
  const col = new THREE.Color();
  list.forEach((p, i) => {
    _envQ.setFromAxisAngle(_envUp, p[3] || 0);
    const s = p[4] ?? 1;
    if (Array.isArray(s)) _envV3.set(s[0], s[1], s[2]); else _envV3.set(s, s, s);
    _envM4.compose(new THREE.Vector3(p[0], p[1], p[2]), _envQ, _envV3);
    inst.setMatrixAt(i, _envM4);
    if (p[5] !== undefined) inst.setColorAt(i, col.set(p[5]));
  });
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  return inst;
}

// 發光點雲:全部同色點合成單一 Points (1 draw call)
function glowPoints(pts, colorHex, size, opacity = 0.85, useFog = true) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    map: radialGlowTexture(colorHex), color: colorHex,
    size, sizeAttenuation: true, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: useFog,
  }));
}

function makeTrackDistFn(track, step = 10) {
  const N = track.samples.length;
  return (x, z) => {
    let min = Infinity;
    for (let i = 0; i < N; i += step) {
      const p = track.samples[i].pos;
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < min) min = d2;
    }
    return Math.sqrt(min);
  };
}

// 斜面四邊形 (看台人群/斜頂用):x 對稱、(y0,z0) 前下緣 → (y1,z1) 後上緣
function quadGeo(w, y0, z0, y1, z1, uRepeat = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -w / 2, y0, z0, w / 2, y0, z0, w / 2, y1, z1, -w / 2, y1, z1,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, uRepeat, 0, uRepeat, 1, 0, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

// ---------- 山道:環形山巒剪影 ----------
function ridgeGeometry(R, baseH, amp, seed, segs = 180) {
  // 圓環帶狀山稜:上緣用 3 組正弦疊出偽噪聲起伏,遠看即層疊山剪影
  const pos = [];
  const idx = [];
  const hAt = (a) => Math.max(baseH * 0.4,
    baseH
    + amp * (0.55 * Math.sin(a * 3 + seed) + 0.3 * Math.sin(a * 7 + seed * 2.7)
      + 0.15 * Math.sin(a * 13 + seed * 5.1))
    + amp * 0.35 * Math.sin(a * 23 + seed * 9.3) * Math.sin(a * 5 + seed * 1.3));
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    pos.push(x, -6, z, x, hAt(a), z);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function mistRingTexture() {
  // 山腰薄霧:縱向漸層,下緣藍白微光、上緣透明
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(150,180,220,0.22)');
  grad.addColorStop(0.5, 'rgba(150,180,220,0.07)');
  grad.addColorStop(1, 'rgba(150,180,220,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMountainRidges(wid = 'night') {
  const group = new THREE.Group();
  // 三層漸遠山巒:近層 → 遠層溶入天色 (fog:false,顏色手工調成大氣透視)
  // 白天:近層亮綠山、遠層粉藍霾;黃昏:暖紫黑漸層;夜:深墨綠原樣
  const layers = wid === 'day' ? [
    { R: 540, base: 55, amp: 40, seed: 1.7, color: 0x3e5f46 },
    { R: 800, base: 105, amp: 62, seed: 4.2, color: 0x6d8492 },
    { R: 1060, base: 155, amp: 82, seed: 7.9, color: 0x93a9bc },
  ] : wid === 'dusk' ? [
    { R: 540, base: 55, amp: 40, seed: 1.7, color: 0x1c1620 },
    { R: 800, base: 105, amp: 62, seed: 4.2, color: 0x372a3e },
    { R: 1060, base: 155, amp: 82, seed: 7.9, color: 0x5c4256 },
  ] : [
    { R: 540, base: 55, amp: 40, seed: 1.7, color: 0x0a120e },
    { R: 800, base: 105, amp: 62, seed: 4.2, color: 0x121b24 },
    { R: 1060, base: 155, amp: 82, seed: 7.9, color: 0x1c2736 },
  ];
  for (const L of layers) {
    group.add(new THREE.Mesh(
      ridgeGeometry(L.R, L.base, L.amp, L.seed),
      new THREE.MeshBasicMaterial({ color: L.color, fog: false, side: THREE.DoubleSide })));
  }
  // 山腰薄霧環:近層山腳一圈藍白霧帶,把山剪影與地面融在一起
  const mist = new THREE.Mesh(
    new THREE.CylinderGeometry(500, 500, 90, 48, 1, true),
    new THREE.MeshBasicMaterial({
      map: mistRingTexture(), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.BackSide, fog: false, toneMapped: false,
    }));
  mist.position.y = 32;
  group.add(mist);
  return group;
}

// ---------- 山道:滿山樹木 / 反光導標柱 / 民宅廟宇 ----------
function createMountainEnv(track, streaks, wid = 'night') {
  const group = new THREE.Group();
  const isDay = wid === 'day', isDusk = wid === 'dusk';
  const trackDist = makeTrackDistFn(track);
  const N = track.samples.length;
  const segLen = track.length / N;

  // --- 低多邊形樹 ×2 變體 (2 draw calls):針葉 (雙錐) + 闊葉 (球冠) ---
  const trunkG = new THREE.CylinderGeometry(0.14, 0.22, 1.6, 5).translate(0, 0.8, 0);
  const cone1 = new THREE.ConeGeometry(1.5, 3.4, 6).translate(0, 3.0, 0);
  const cone2 = new THREE.ConeGeometry(1.05, 2.4, 6).translate(0, 4.9, 0);
  const coniferGeo = mergeGeometries([trunkG, cone1, cone2]);
  const ballG = new THREE.SphereGeometry(1.5, 6, 5).scale(1, 1.15, 1).translate(0, 3.0, 0);
  const broadGeo = mergeGeometries([trunkG.clone(), ballG]);
  // 樹色:白天亮綠 (山道樹木回到日照下的飽和綠)、黃昏暖染、夜深墨綠
  const GREENS = isDay
    ? [0x3f7b48, 0x4f9158, 0x35683c, 0x5ba061, 0x477f4a]
    : isDusk
      ? [0x27402a, 0x315035, 0x203722, 0x3a5c3c, 0x2b462d]
      : [0x0d1f14, 0x11291a, 0x0a1a10, 0x15301e, 0x0f2417];
  const conifers = [], broads = [];
  // 佈滿全圖 (山坡感):賽道 12.5m 外、半徑 340m 內隨機撒點
  for (let i = 0; i < 1500; i++) {
    const x = (Math.random() - 0.5) * 660 - 30;
    const z = (Math.random() - 0.5) * 640;
    if (trackDist(x, z) < 12.5) continue;
    const s = 0.75 + Math.random() * 1.0;
    const item = [x, 0, z, Math.random() * Math.PI * 2, s, GREENS[Math.random() * GREENS.length | 0]];
    (Math.random() < 0.68 ? conifers : broads).push(item);
  }
  // 路緣加密一圈:貼著路 13~28m 帶狀,行車時樹牆撲面
  const tStep = Math.max(1, Math.round(9 / segLen));
  for (let i = 0; i < N; i += tStep) {
    const sm = track.samples[i];
    for (const side of [1, -1]) {
      if (Math.random() < 0.3) continue;
      const off = 13 + Math.random() * 15;
      const x = sm.pos.x + sm.normal.x * off * side + (Math.random() - 0.5) * 4;
      const z = sm.pos.z + sm.normal.z * off * side + (Math.random() - 0.5) * 4;
      if (trackDist(x, z) < 12.5) continue;
      const s = 0.9 + Math.random() * 1.1;
      const item = [x, 0, z, Math.random() * Math.PI * 2, s, GREENS[Math.random() * GREENS.length | 0]];
      (Math.random() < 0.75 ? conifers : broads).push(item);
    }
  }
  const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  group.add(instancedFrom(coniferGeo, treeMat, conifers));
  group.add(instancedFrom(broadGeo, treeMat, broads));

  // --- 反光導標柱:白桿 (1 dc) + 桿頂黃色反光點 (1 dc),雙側每 ~18m ---
  const posts = [];
  const reflPts = [];
  const dStep = Math.max(1, Math.round(18 / segLen));
  for (let i = 0; i < N; i += dStep) {
    const sm = track.samples[i];
    for (const side of [1, -1]) {
      const x = sm.pos.x + sm.normal.x * 9.35 * side;
      const z = sm.pos.z + sm.normal.z * 9.35 * side;
      posts.push([x, 0, z, 0, 1]);
      reflPts.push(x, 0.86, z);
    }
  }
  const postGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.95, 5).translate(0, 0.475, 0);
  group.add(instancedFrom(postGeo,
    new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.6 }), posts));
  if (!isDay) group.add(glowPoints(reflPts, '#ffd24d', 1.5, isDusk ? 0.5 : 0.9));

  // --- 民宅/廟宇:零星暗盒 + 屋簷 (1 dc),配橘色燈籠光點 (1 dc) ---
  const houses = [];
  const lanternPts = [];
  const hStep = Math.max(1, Math.round(150 / segLen));
  for (let i = 0; i < N; i += hStep) {
    const sm = track.samples[i];
    const side = Math.random() < 0.5 ? 1 : -1;
    const off = 26 + Math.random() * 40;
    const x = sm.pos.x + sm.normal.x * off * side;
    const z = sm.pos.z + sm.normal.z * off * side;
    if (trackDist(x, z) < 20) continue;
    const a = Math.atan2(sm.normal.x * side, sm.normal.z * side) + Math.PI + (Math.random() - 0.5) * 0.4;
    const temple = Math.random() < 0.3;
    houses.push([x, 0, z, a, temple ? 1.4 : 0.9 + Math.random() * 0.35, temple ? 0x2a1c14 : 0x1c1a17]);
    // 燈籠/窗燈:貼房子正面 2~5 點橘光
    const fx = Math.sin(a), fz = Math.cos(a);
    const wallDir = { x: fz, z: -fx };
    const nPts = temple ? 5 : 2 + (Math.random() * 2 | 0);
    for (let k = 0; k < nPts; k++) {
      const along = (k - (nPts - 1) / 2) * 1.6;
      lanternPts.push(
        x + fx * 3.4 + wallDir.x * along,
        temple ? 3.3 : 2.2 + Math.random() * 0.8,
        z + fz * 3.4 + wallDir.z * along);
    }
    // 濕路反射:民宅暖光遠遠拖一條 (稀疏)
    if (off < 34) {
      streaks.push({
        x: sm.pos.x + sm.normal.x * side * 5.5, z: sm.pos.z + sm.normal.z * side * 5.5,
        angle: Math.atan2(sm.tan.x, sm.tan.z), color: '#ff9d4d',
        w: 1.6, len: 5 + Math.random() * 3,
      });
    }
  }
  const houseBody = new THREE.BoxGeometry(6, 3, 5).translate(0, 1.5, 0);
  const houseRoof = new THREE.ConeGeometry(4.6, 1.7, 4).rotateY(Math.PI / 4).scale(1, 1, 0.8).translate(0, 3.85, 0);
  const houseGeo = mergeGeometries([houseBody, houseRoof]);
  group.add(instancedFrom(houseGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), houses));
  if (!isDay) group.add(glowPoints(lanternPts, '#ff8a3d', 2.6, isDusk ? 0.55 : 0.85));

  return group;
}

// ---------- 灣岸:海面 / 起重機 / 跨海大橋 / 貨櫃堆 ----------
function createHarborEnv(track, streaks, wid = 'night') {
  const group = new THREE.Group();
  const isDay = wid === 'day', isDusk = wid === 'dusk';
  const SEA_Z = -238; // 岸線 (南側全是海;createBuildings 已禁建 z<-228)

  // --- 海面:大平面 (1 dc);白天日照藍、黃昏映霞、夜深藍黑 ---
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(3200, 1150),
    new THREE.MeshBasicMaterial({ color: isDay ? 0x39648f : isDusk ? 0x3a2c40 : 0x0a1830 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.04, SEA_Z - 575);
  group.add(sea);

  // --- 海面微光反射條:instanced 加法長條 (1 dc),月光/城市光的碎浪反光 ---
  const glintGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const glints = [];
  // 碎浪反光:白天陽光白金、黃昏橘金、夜月光藍
  const GLINT_COLS = isDay ? [0xffffff, 0xe8f2ff, 0xcfe4ff, 0xf5fbff]
    : isDusk ? [0xffb066, 0xff8a55, 0xffd9a0, 0xd88a77]
      : [0x9fc4ff, 0xbcd8ff, 0x7a9cd8, 0x37a8ff];
  for (let i = 0; i < 150; i++) {
    const x = (Math.random() - 0.5) * 1900;
    const z = SEA_Z - 15 - Math.random() * 620;
    glints.push([x, 0.1, z, (Math.random() - 0.5) * 0.35,
      [0.6 + Math.random() * 1.6, 1, 6 + Math.random() * 18],
      GLINT_COLS[Math.random() * GLINT_COLS.length | 0]]);
  }
  // 白天陽光已亮:粼光壓低,避免海面被加法混合疊成白色一片
  const glintBase = isDay ? 0.09 : 0.15;
  const glintMat = new THREE.MeshBasicMaterial({
    map: streakTexture(), transparent: true, opacity: glintBase + 0.03,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  group.add(instancedFrom(glintGeo, glintMat, glints));
  // 海面微微呼吸的粼光
  group.userData.update = (t) => { glintMat.opacity = glintBase + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.7)); };

  // --- 岸壁:沿岸線一長條混凝土 (1 dc) ---
  const quay = new THREE.Mesh(
    new THREE.BoxGeometry(2200, 1.6, 5),
    new THREE.MeshStandardMaterial({ color: 0x232a34, roughness: 0.9 }));
  quay.position.set(0, 0.8, SEA_Z + 1);
  group.add(quay);

  // --- 港口起重機剪影:merged 一體 → instanced ×7 (1 dc) + 紅色警示點 (1 dc) ---
  const legG = [];
  for (const [lx, lz] of [[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]]) {
    legG.push(new THREE.BoxGeometry(1.2, 30, 1.2).translate(lx, 15, lz));
  }
  const craneGeo = mergeGeometries([
    ...legG,
    new THREE.BoxGeometry(12.5, 2.4, 2.4).translate(0, 28, 0),         // 主橫樑
    new THREE.BoxGeometry(3.2, 2.8, 46).translate(0, 31.5, -10),       // 外伸吊臂 (伸向海)
    new THREE.BoxGeometry(5, 3.6, 6).translate(0, 26, 2),              // 機房
    new THREE.BoxGeometry(0.7, 12, 0.7).translate(0, 38, 4),           // 後拉塔
  ]);
  const craneMat = new THREE.MeshBasicMaterial({
    color: isDay ? 0x5a6878 : isDusk ? 0x241d2e : 0x0c1422, fog: false });
  const cranes = [];
  const craneTips = [];
  for (let i = 0; i < 7; i++) {
    const x = -680 + i * 220 + (Math.random() - 0.5) * 40;
    const z = SEA_Z - 26;
    const s = 0.85 + Math.random() * 0.35;
    cranes.push([x, 0, z, (Math.random() - 0.5) * 0.2, s]);
    craneTips.push(x, 31.5 * s + 2, z - 30 * s, x, 40 * s + 3, z + 4 * s);
  }
  group.add(instancedFrom(craneGeo, craneMat, cranes));
  if (!isDay) group.add(glowPoints(craneTips, '#ff4433', 5, 0.85, false));

  // --- 跨海大橋:剪影 (1 dc) + 燈串弧線 Points (1 dc) ---
  const BR_Z = -560, DECK_Y = 30, TOWER_H = 150, HALF = 300;
  const bridgeGeo = mergeGeometries([
    new THREE.BoxGeometry(1900, 5, 13).translate(0, DECK_Y, BR_Z),
    new THREE.BoxGeometry(10, TOWER_H, 6).translate(-HALF, TOWER_H / 2, BR_Z),
    new THREE.BoxGeometry(10, TOWER_H, 6).translate(HALF, TOWER_H / 2, BR_Z),
    new THREE.BoxGeometry(14, 4, 8).translate(-HALF, TOWER_H, BR_Z),
    new THREE.BoxGeometry(14, 4, 8).translate(HALF, TOWER_H, BR_Z),
  ]);
  group.add(new THREE.Mesh(bridgeGeo, new THREE.MeshBasicMaterial({
    color: isDay ? 0x6b7c92 : isDusk ? 0x241f33 : 0x0d1526, fog: false })));
  const lightPts = [];
  // 主跨懸索:塔頂高、中央垂到橋面上方 → 拋物線燈串
  for (let k = 0; k <= 60; k++) {
    const x = -HALF + (k / 60) * HALF * 2;
    const y = DECK_Y + 10 + (TOWER_H - DECK_Y - 12) * Math.pow(Math.abs(x) / HALF, 2);
    lightPts.push(x, y, BR_Z);
  }
  // 邊跨斜索燈串:兩端往錨碇下滑
  for (let k = 1; k <= 22; k++) {
    const f = k / 22;
    for (const sgn of [1, -1]) {
      const x = sgn * (HALF + f * 420);
      lightPts.push(x, TOWER_H - (TOWER_H - DECK_Y - 2) * f, BR_Z);
    }
  }
  // 橋面路燈串 (白天不亮)
  for (let x = -930; x <= 930; x += 26) lightPts.push(x, DECK_Y + 5, BR_Z);
  if (!isDay) {
    group.add(glowPoints(lightPts, '#bfe0ff', 5.5, isDusk ? 0.6 : 0.9, false));
    // 塔頂紅色航空燈
    group.add(glowPoints([-HALF, TOWER_H + 3, BR_Z, HALF, TOWER_H + 3, BR_Z], '#ff3344', 8, 0.9, false));
  }

  // --- 貨櫃堆:instanced 彩色盒 (1 dc),沿岸線成排成疊 (離track ≥16m,亮色好辨識) ---
  const trackDist = makeTrackDistFn(track);
  const contGeo = new THREE.BoxGeometry(6.1, 2.6, 2.44).translate(0, 1.3, 0);
  const CONT_COLS = [0xb84545, 0x4585b8, 0xc79b3e, 0x55a869, 0x8a94a4, 0x9a5aaa, 0xd0713a];
  const conts = [];
  for (let c = 0; c < 12; c++) {
    const bx = -760 + c * 135 + (Math.random() - 0.5) * 30;
    const bz = SEA_Z + 6 + Math.random() * 8;
    const a = (Math.random() - 0.5) * 0.15;
    const rows = 2 + (Math.random() * 2 | 0);
    const cols = 2 + (Math.random() * 3 | 0);
    const high = 1 + (Math.random() * 3 | 0);
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const hMax = Math.random() < 0.5 ? high : Math.max(1, high - 1);
        for (let h = 0; h < hMax; h++) {
          const px = bx + Math.cos(a) * q * 6.4 - Math.sin(a) * r * 2.9;
          const pz = bz + Math.sin(a) * q * 6.4 + Math.cos(a) * r * 2.9;
          if (trackDist(px, pz) < 16) continue; // 別堆到路肩變黑牆
          conts.push([px, h * 2.6, pz, a, 1, CONT_COLS[Math.random() * CONT_COLS.length | 0]]);
        }
      }
    }
  }
  group.add(instancedFrom(contGeo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.75, metalness: 0.15,
      emissive: 0x10141c, emissiveIntensity: 1, // 夜空反照,免得整堆黑成剪影
    }), conts));

  // --- 碼頭高桅照明燈:貨櫃場的橘黃強光點 (1 dc;白天熄) ---
  if (!isDay) {
    const mastPts = [];
    for (let x = -700; x <= 700; x += 175) mastPts.push(x + (Math.random() - 0.5) * 30, 22, SEA_Z + 6);
    group.add(glowPoints(mastPts, '#ffc76b', 9, isDusk ? 0.5 : 0.8, false));
  }

  return group;
}

// ---------- GP 賽場:看台 / 計時塔 / 廣告板 / 維修站 / 輪胎牆 / 探照燈 ----------
function crowdTexture(seed, wid = 'night') {
  // 看台人群 v2:整齊列座的「人形」(頭+軀幹) 取代彩色雜訊點——
  // 每排先畫座椅階梯帶,觀眾以固定間距落座、走道留空;
  // 膚色頭部 + 低飽和衣色軀幹,先畫 2x 再縮小 → 自然微模糊,遠看是人群不是雜訊
  const W = 512, H = 256, S = 2; // 2x 超採樣
  const hi = document.createElement('canvas');
  hi.width = W * S; hi.height = H * S;
  const g = hi.getContext('2d');
  const isDay = wid === 'day', isDusk = wid === 'dusk';
  // 底色 = 看台陰影;白天亮灰、夜暗藍
  g.fillStyle = isDay ? '#6a7078' : isDusk ? '#2c2a34' : '#12151d';
  g.fillRect(0, 0, W * S, H * S);
  let rnd = seed * 9301 + 49297;
  const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  const SKIN = isDay ? ['#e8c5a2', '#d9ac82', '#c08a5e', '#f0d4b4']
    : ['#9a8471', '#8a7360', '#7a654f', '#a68d76']; // 夜間膚色壓暗
  // 衣色:低飽和日常色盤 + 少量亮色,整排統一亮度域
  const SHIRT_H = [210, 355, 28, 200, 90, 240, 12, 160];
  // 尺度對齊世界:每 u-repeat ≈ 10m → 每排 ~19 個座位 (座寬 ~0.55m)、
  // 斜面 ~14.6m → 14 排 (排距 ~1m),人形夠大才讀得出「人」
  const rowH = 18 * S;
  const seatW = 27 * S;
  for (let row = 0; row * rowH + 14 * S < H * S; row++) {
    const y = 5 * S + row * rowH;
    // 座椅階梯帶 (排與排之間的暗色階梯立面)
    g.fillStyle = isDay ? 'rgba(70,78,92,0.85)' : 'rgba(34,40,52,0.85)';
    g.fillRect(0, y + 13 * S, W * S, 3.6 * S);
    let blockHue = SHIRT_H[(rand() * SHIRT_H.length) | 0]; // 衣色成塊:同區球迷同色系
    for (let sIdx = 0; sIdx * seatW + 14 * S < W * S; sIdx++) {
      const x = 4 * S + sIdx * seatW;
      if (rand() < 0.25) blockHue = SHIRT_H[(rand() * SHIRT_H.length) | 0];
      if (sIdx % 9 === 4) continue;               // 走道留空
      if (rand() < 0.14) {                          // 空位:畫暗座椅
        g.fillStyle = isDay ? 'rgba(56,64,78,0.9)' : 'rgba(26,30,40,0.9)';
        g.fillRect(x + 3 * S, y + 4 * S, 12 * S, 9 * S);
        continue;
      }
      const jx = (rand() - 0.5) * 3 * S;            // 極小落座抖動
      const hue = blockHue + (rand() - 0.5) * 24;
      const sat = 18 + rand() * 22 | 0;             // 低飽和:遠看不成彩色雜訊
      const lit = (isDay ? 36 : 20) + rand() * 11 | 0;
      // 軀幹 (坐姿上身)
      g.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
      g.fillRect(x + jx + 2.5 * S, y + 6 * S, 12 * S, 7.5 * S);
      // 頭部 (膚色圓)
      g.fillStyle = SKIN[(rand() * SKIN.length) | 0];
      g.beginPath();
      g.arc(x + jx + 8.5 * S, y + 3.6 * S, 3 * S, 0, Math.PI * 2);
      g.fill();
      // 夜間零星手機燈 (白天無)
      if (!isDay && rand() < 0.03) {
        g.fillStyle = 'rgba(235,240,255,0.95)';
        g.fillRect(x + jx + 6 * S, y + 0.6 * S, 2.4 * S, 2.4 * S);
      }
    }
  }
  // 縮小回 512×256 + 輕微模糊:消除像素雜訊感,遠看是「人群」不是壞掉的電視
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const gc = c.getContext('2d');
  gc.imageSmoothingQuality = 'high';
  try { gc.filter = 'blur(0.6px)'; } catch (e) { /* filter 不支援時直接縮圖 */ }
  gc.drawImage(hi, 0, 0, W, H);
  gc.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function adBoardTexture(text, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = fg;
  g.fillRect(0, 0, 1024, 8);
  g.fillRect(0, 120, 1024, 8);
  g.font = '900 italic 72px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 16;
  for (let k = 0; k < 2; k++) {
    g.fillStyle = fg;
    g.fillText(text, 256 + k * 512, 66);
  }
  g.shadowBlur = 0;
  g.fillStyle = fg;
  for (const x of [24, 512, 1000]) {
    g.beginPath(); g.moveTo(x, 44); g.lineTo(x + 14, 64); g.lineTo(x, 84); g.lineTo(x - 14, 64);
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function timingScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#2a3244'; g.lineWidth = 6;
  g.strokeRect(4, 4, 504, 248);
  g.textAlign = 'center';
  g.font = '900 54px sans-serif';
  g.fillStyle = '#ff2e4d';
  g.shadowColor = '#ff2e4d'; g.shadowBlur = 14;
  g.fillText('MIDNIGHT GP', 256, 62);
  g.font = '700 44px monospace';
  g.fillStyle = '#37e0ff';
  g.shadowColor = '#37e0ff';
  g.fillText("1:23.456", 256, 128);
  g.font = '700 36px monospace';
  g.fillStyle = '#ffd23e';
  g.shadowColor = '#ffd23e'; g.shadowBlur = 10;
  g.fillText('LAP 2/3  P1', 256, 190);
  g.fillStyle = '#ffffff'; g.shadowBlur = 4;
  g.font = '700 24px sans-serif';
  g.fillText('101 RACING', 256, 232);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pitFrontTexture() {
  // 維修站正面:一格格亮著暖白工作燈的車庫開口 + 車庫編號
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#12151c';
  g.fillRect(0, 0, 1024, 96);
  for (let b = 0; b < 8; b++) {
    const x = b * 128;
    const grad = g.createLinearGradient(0, 10, 0, 92);
    grad.addColorStop(0, 'rgba(255,235,200,0.95)');
    grad.addColorStop(1, 'rgba(150,120,80,0.35)');
    g.fillStyle = grad;
    g.fillRect(x + 14, 14, 100, 82);
    // 車庫內車影
    g.fillStyle = 'rgba(20,16,12,0.8)';
    g.fillRect(x + 30, 62, 68, 26);
    g.fillRect(x + 42, 48, 44, 18);
    g.fillStyle = '#ff2e4d';
    g.font = '900 26px sans-serif';
    g.textAlign = 'center';
    g.fillText(String(b + 1), x + 64, 34);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function beamTexture() {
  // 探照燈光柱:縱向漸層 (底亮頂透) + 橫向柔邊
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, 'rgba(200,220,255,0.55)');
  grad.addColorStop(0.6, 'rgba(200,220,255,0.14)');
  grad.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const gx = g.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(0,0,0,1)');
  gx.addColorStop(0.35, 'rgba(0,0,0,0)');
  gx.addColorStop(0.65, 'rgba(0,0,0,0)');
  gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = gx;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGrandPrixEnv(track, streaks, wid = 'night') {
  const group = new THREE.Group();
  const isDay = wid === 'day', isDusk = wid === 'dusk';
  const straight = findMainStraight(track);
  const idx = straight.indices;
  const NS = idx.length;
  const N = track.samples.length;
  const segLen = track.length / N;
  const smAt = (k) => track.samples[idx[Math.max(0, Math.min(NS - 1, k))]];

  const structGeos = [];   // 深灰結構 (看台階梯/柱/頂棚/計時塔/維修站) → merge 1 dc
  const crowdGeosA = [], crowdGeosB = []; // 人群斜面 ×2 貼圖 → 2 dc
  const towerGlowPts = [];

  // 模組化看台:沿主直線兩側,每模組 30m
  const modLen = 30;
  const modStep = Math.round(modLen / segLen) + 4;
  const firstK = Math.round(20 / segLen);
  const lastK = NS - firstK;
  const pitK0 = NS * 0.42, pitK1 = NS * 0.42 + Math.round(70 / segLen); // 側 -1 中段留給維修站
  const placeBox = (w, h, d, lx, ly, lz, yaw, ox, oz) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    _envQ.setFromAxisAngle(_envUp, yaw);
    _envM4.compose(new THREE.Vector3(ox, 0, oz), _envQ, new THREE.Vector3(1, 1, 1));
    geo.translate(lx, ly + h / 2, lz);
    geo.applyMatrix4(_envM4);
    structGeos.push(geo);
  };

  let modIdx = 0;
  for (let k = firstK; k + modStep < lastK; k += modStep) {
    const sm = smAt(k);
    for (const side of [1, -1]) {
      if (side === -1 && k > pitK0 - modStep && k < pitK1) continue; // 維修站區
      const yaw = Math.atan2(sm.normal.x * side, sm.normal.z * side);
      const ox = sm.pos.x, oz = sm.pos.z;
      // 階梯 6 級
      for (let s = 0; s < 6; s++) {
        placeBox(modLen, 1.6 + s * 1.35, 2.3, 0, 0, 24.5 + s * 2.3 + 1.15, yaw, ox, oz);
      }
      // 前欄 + 頂棚 + 背柱
      placeBox(modLen, 1.3, 0.4, 0, 0, 23.8, yaw, ox, oz);
      placeBox(modLen + 2, 0.5, 15.5, 0, 12.4, 31.2, yaw, ox, oz);
      for (const cx of [-modLen / 2 + 1.5, -modLen / 6, modLen / 6, modLen / 2 - 1.5]) {
        placeBox(0.55, 12.4, 0.55, cx, 0, 38.2, yaw, ox, oz);
      }
      // 人群斜面 (uv ×3 重複)
      const crowd = quadGeo(modLen, 2.3, 24.7, 9.6, 37.4, 3);
      _envQ.setFromAxisAngle(_envUp, yaw);
      _envM4.compose(new THREE.Vector3(ox, 0, oz), _envQ, new THREE.Vector3(1, 1, 1));
      crowd.applyMatrix4(_envM4);
      (modIdx % 2 === 0 ? crowdGeosA : crowdGeosB).push(crowd);
      // 頂棚沿下緣燈點
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      const px = -dz, pz = dx; // 沿看台長邊方向
      for (let li = -2; li <= 2; li++) {
        towerGlowPts.push(ox + dx * 24.3 + px * li * 6.5, 11.9, oz + dz * 24.3 + pz * li * 6.5);
      }
      modIdx++;
    }
  }

  // --- 維修站 (side -1 中段):長樓 + 亮車庫正面 + 屋頂 PIT 燈點 ---
  const pitSm = smAt(Math.round((pitK0 + pitK1) / 2));
  const pitYaw = Math.atan2(-pitSm.normal.x, -pitSm.normal.z);
  placeBox(64, 6.2, 10, 0, 0, 29, pitYaw, pitSm.pos.x, pitSm.pos.z);
  placeBox(66, 0.6, 12, 0, 6.2, 29, pitYaw, pitSm.pos.x, pitSm.pos.z);
  {
    const front = quadGeo(60, 0.2, 23.9, 4.8, 23.9, 1);
    _envQ.setFromAxisAngle(_envUp, pitYaw);
    _envM4.compose(new THREE.Vector3(pitSm.pos.x, 0, pitSm.pos.z), _envQ, new THREE.Vector3(1, 1, 1));
    front.applyMatrix4(_envM4);
    group.add(new THREE.Mesh(front, new THREE.MeshBasicMaterial({
      map: pitFrontTexture(), side: THREE.DoubleSide, toneMapped: false,
    })));
    const fdx = Math.sin(pitYaw), fdz = Math.cos(pitYaw);
    for (let li = -4; li <= 4; li++) {
      const px = -fdz, pz = fdx;
      towerGlowPts.push(pitSm.pos.x + fdx * 23.7 + px * li * 7, 5.4, pitSm.pos.z + fdz * 23.7 + pz * li * 7);
    }
    // 維修站暖光反射到路面
    streaks.push({
      x: pitSm.pos.x - pitSm.normal.x * 5.5, z: pitSm.pos.z - pitSm.normal.z * 5.5,
      angle: Math.atan2(pitSm.tan.x, pitSm.tan.z), color: '#ffe6bb', w: 3.0, len: 12,
    });
  }

  // --- 計時塔:直線起點,雙柱 + 頂部雙面計時螢幕 + 紅色頂燈 ---
  const twSm = smAt(Math.round(12 / segLen));
  const twYaw = Math.atan2(twSm.tan.x, twSm.tan.z);
  const twX = twSm.pos.x + twSm.normal.x * 15.5, twZ = twSm.pos.z + twSm.normal.z * 15.5;
  {
    const mk = (w, h, d, lx, ly, lz) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      _envQ.setFromAxisAngle(_envUp, twYaw);
      _envM4.compose(new THREE.Vector3(twX, 0, twZ), _envQ, new THREE.Vector3(1, 1, 1));
      geo.translate(lx, ly + h / 2, lz);
      geo.applyMatrix4(_envM4);
      structGeos.push(geo);
    };
    mk(1.6, 17, 1.6, -3.4, 0, 0);
    mk(1.6, 17, 1.6, 3.4, 0, 0);
    mk(10, 6.5, 2.6, 0, 16.4, 0);
    const scrGeoF = new THREE.PlaneGeometry(9.2, 5.7).translate(0, 19.6, 1.36);
    const scrGeoB = new THREE.PlaneGeometry(9.2, 5.7).rotateY(Math.PI).translate(0, 19.6, -1.36);
    const scr = mergeGeometries([scrGeoF, scrGeoB]);
    _envQ.setFromAxisAngle(_envUp, twYaw);
    _envM4.compose(new THREE.Vector3(twX, 0, twZ), _envQ, new THREE.Vector3(1, 1, 1));
    scr.applyMatrix4(_envM4);
    group.add(new THREE.Mesh(scr, new THREE.MeshBasicMaterial({ map: timingScreenTexture(), toneMapped: false })));
  }
  if (!isDay) group.add(glowPoints([twX, 23.6, twZ], '#ff3344', 6, 0.9));

  // --- 賽事廣告板:主直線兩側 + 全場彎道外側,兩款貼圖 instanced (2 dc) ---
  const boardGeo = new THREE.BoxGeometry(12, 1.7, 0.25).translate(0, 1.55, 0);
  const boardsA = [], boardsB = [];
  const straightSet = new Set(idx);
  const bStep = Math.max(1, Math.round(26 / segLen));
  let bi = 0;
  for (let i = 0; i < N; i += bStep) {
    const onStraight = straightSet.has(i);
    if (!onStraight && Math.random() < 0.55) continue;
    const sm = track.samples[i];
    for (const side of onStraight ? [1, -1] : [Math.random() < 0.5 ? 1 : -1]) {
      const x = sm.pos.x + sm.normal.x * 10.6 * side;
      const z = sm.pos.z + sm.normal.z * 10.6 * side;
      const a = Math.atan2(sm.tan.x, sm.tan.z);
      (bi++ % 2 === 0 ? boardsA : boardsB).push([x, 0, z, a, 1]);
      if (Math.random() < 0.5) {
        streaks.push({
          x: sm.pos.x + sm.normal.x * side * 6.4, z: sm.pos.z + sm.normal.z * side * 6.4,
          angle: a, color: bi % 2 === 0 ? '#ff2e4d' : '#37e0ff', w: 2.4, len: 7 + Math.random() * 4,
        });
      }
    }
  }
  group.add(instancedFrom(boardGeo, new THREE.MeshBasicMaterial({
    map: adBoardTexture('MIDNIGHT GP', '#ff2e4d', '#160409'), toneMapped: false,
  }), boardsA));
  group.add(instancedFrom(boardGeo.clone(), new THREE.MeshBasicMaterial({
    map: adBoardTexture('101 RACING', '#37e0ff', '#03101a'), toneMapped: false,
  }), boardsB));

  // --- 輪胎牆:彎道外側 instanced 疊胎 (1 dc, instanceColor 混紅白) ---
  const tyreStack = mergeGeometries([
    new THREE.CylinderGeometry(0.55, 0.55, 0.34, 9).translate(0, 0.17, 0),
    new THREE.CylinderGeometry(0.57, 0.57, 0.34, 9).translate(0, 0.53, 0),
    new THREE.CylinderGeometry(0.55, 0.55, 0.34, 9).translate(0, 0.89, 0),
  ]);
  const tyres = [];
  const tyStep = Math.max(1, Math.round(3.4 / segLen));
  for (let i = 0; i < N; i += tyStep) {
    const sm = track.samples[i];
    const nx = track.samples[(i + 26) % N];
    const turn = sm.tan.x * nx.tan.z - sm.tan.z * nx.tan.x; // 轉向符號
    const bend = 1 - sm.tan.dot(nx.tan);
    if (bend < 0.06) continue; // 只在明顯彎道
    const side = turn > 0 ? 1 : -1; // 彎道外側
    const x = sm.pos.x + sm.normal.x * 9.7 * side;
    const z = sm.pos.z + sm.normal.z * 9.7 * side;
    const ci = tyres.length;
    tyres.push([x, 0, z, Math.random() * Math.PI, 1,
      ci % 5 === 0 ? 0xc23545 : ci % 5 === 2 ? 0xd0d4d8 : 0x181b20]);
  }
  group.add(instancedFrom(tyreStack,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), tyres));

  // --- 探照燈塔 ×4:桿 (1 dc) + 交叉光柱 merged (1 dc) + 頂端亮點 ---
  const poleList = [];
  const beamGeos = [];
  const headPts = [];
  for (let m = 0; m < 4; m++) {
    const i = Math.round((0.1 + 0.25 * m) * N);
    const sm = track.samples[i];
    if (straight.near(sm.pos.x, sm.pos.z, 40)) continue;
    const side = m % 2 === 0 ? 1 : -1;
    const x = sm.pos.x + sm.normal.x * 34 * side;
    const z = sm.pos.z + sm.normal.z * 34 * side;
    poleList.push([x, 0, z, 0, [1, 1, 1]]);
    headPts.push(x, 19, z);
    for (const rot of [0.22, -0.16]) {
      const bg = new THREE.PlaneGeometry(9, 130).translate(0, 65, 0);
      bg.rotateZ(rot);
      bg.rotateY(Math.random() * Math.PI);
      bg.translate(x, 17, z);
      beamGeos.push(bg);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.35, 0.6, 19, 6).translate(0, 9.5, 0);
  group.add(instancedFrom(poleGeo,
    new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.6, metalness: 0.5 }), poleList));
  // 探照燈光柱:白天不開燈;黃昏微亮暖色
  if (beamGeos.length && !isDay) {
    group.add(new THREE.Mesh(mergeGeometries(beamGeos), new THREE.MeshBasicMaterial({
      map: beamTexture(), transparent: true, opacity: isDusk ? 0.14 : 0.34, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    })));
  }
  if (!isDay) group.add(glowPoints(headPts, '#dfe9ff', 10, isDusk ? 0.5 : 0.9));

  // 看台/維修站/計時塔結構 merge → 1 dc
  if (structGeos.length) {
    group.add(new THREE.Mesh(mergeGeometries(structGeos),
      new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.85, metalness: 0.15 })));
  }
  const crowdMk = (geos, seed) => {
    if (!geos.length) return;
    group.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({
      map: crowdTexture(seed, wid), side: THREE.DoubleSide,
    })));
  };
  crowdMk(crowdGeosA, 3);
  crowdMk(crowdGeosB, 8);
  // 頂棚燈 + 維修站工作燈:合為單一 Points (白天熄)
  if (!isDay) group.add(glowPoints(towerGlowPts, '#eef2ff', 3.2, isDusk ? 0.55 : 0.85));

  return group;
}

// ============================================================
// 場景道具 —— 行人天橋 / 門架隧道 / 紅綠燈 / 斑馬線 / 加油群眾
// 三時段皆存在;全 merged/instanced,整組 ≤7 draw calls
// ============================================================

function crowdBillboardTexture(variant, wid) {
  // 路邊加油群眾:一排彩色人形 (頭+身+舉起的手臂),上緣留空給彈跳位移
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  const isDay = wid === 'day';
  const SKIN = isDay ? ['#e8c5a2', '#d9ac82', '#c08a5e'] : ['#b09480', '#a08468', '#8f755a'];
  let rnd = variant * 7919 + 1231;
  const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 17; i++) {
    const x = 14 + i * 29 + (rand() - 0.5) * 8;
    const baseY = 122;
    const h = 62 + rand() * 18;              // 身高
    const hue = [0, 28, 200, 350, 140, 45, 260, 190][(rand() * 8) | 0];
    const bodyCol = `hsl(${hue},${40 + rand() * 35 | 0}%,${(isDay ? 44 : 30) + rand() * 12 | 0}%)`;
    const skin = SKIN[(rand() * SKIN.length) | 0];
    // 腿 (深色)
    g.fillStyle = `hsl(${hue},18%,${isDay ? 22 : 14}%)`;
    g.fillRect(x - 5, baseY - h * 0.42, 4.4, h * 0.42);
    g.fillRect(x + 0.6, baseY - h * 0.42, 4.4, h * 0.42);
    // 軀幹
    g.fillStyle = bodyCol;
    g.fillRect(x - 7, baseY - h * 0.78, 14, h * 0.38);
    // 舉起的雙臂 (斜上,揮舞感;部分人單手)
    g.strokeStyle = bodyCol;
    g.lineWidth = 4.4;
    g.beginPath();
    g.moveTo(x - 6, baseY - h * 0.74);
    g.lineTo(x - 13, baseY - h * 0.98);
    g.stroke();
    if (rand() < 0.75) {
      g.beginPath();
      g.moveTo(x + 6, baseY - h * 0.74);
      g.lineTo(x + 13, baseY - h * 1.0);
      g.stroke();
    }
    // 頭
    g.fillStyle = skin;
    g.beginPath();
    g.arc(x, baseY - h * 0.86, 5.6, 0, Math.PI * 2);
    g.fill();
    // 手 (膚色小點)
    g.beginPath(); g.arc(x - 13.5, baseY - h * 0.99, 2.6, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createTrackFurniture(track, streaks, landmark, wid) {
  const group = new THREE.Group();
  const isDay = wid === 'day', isDusk = wid === 'dusk';
  const isMountain = landmark === 'mountain';
  const N = track.samples.length;
  const segLen = track.length / N;
  const smAt = (f) => track.samples[Math.floor(f * N) % N];
  const yawOf = (sm) => Math.atan2(sm.tan.x, sm.tan.z);

  const grayGeos = [];   // 天橋/隧道/紅綒燈桿結構 → merge 1 dc
  const lightGeos = [];  // 隧道內壁燈帶 → merge 1 dc
  const adGeos = [];     // 天橋廣告板 → merge 1 dc
  // 局部幾何 → 以 (yaw, 世界座標) 放置
  const place = (geo, yaw, x, y, z, bucket) => {
    _envQ.setFromAxisAngle(_envUp, yaw);
    _envM4.compose(new THREE.Vector3(x, y, z), _envQ, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(_envM4);
    bucket.push(geo);
  };

  // ---- 行人天橋 ×2 (山道不設):桁架箱樑 + 雙側樓梯 + 橋身廣告板 ----
  if (!isMountain) {
    for (const f of [0.3, 0.66]) {
      const sm = smAt(f);
      const yaw = yawOf(sm); // 局部 +x = 路的法線方向 → 橋沿 x 橫跨
      const ox = sm.pos.x, oz = sm.pos.z;
      const DECK_Y = 5.9, SPAN = 30;
      // 箱樑橋面 + 上下弦桿
      place(new THREE.BoxGeometry(SPAN, 0.55, 3.2), yaw, ox, DECK_Y, oz, grayGeos);
      for (const zz of [-1.6, 1.6]) {
        place(new THREE.BoxGeometry(SPAN, 0.22, 0.22).translate(0, DECK_Y + 1.35, zz), yaw, ox, 0, oz, grayGeos);
        // 桁架立柱 (欄杆)
        for (let px = -SPAN / 2 + 1.5; px <= SPAN / 2 - 1.5; px += 3) {
          place(new THREE.BoxGeometry(0.13, 1.35, 0.13).translate(px, DECK_Y + 0.68, zz), yaw, ox, 0, oz, grayGeos);
          // 桁架斜撐
          const diag = new THREE.BoxGeometry(0.1, 1.9, 0.1);
          diag.rotateZ(0.9);
          diag.translate(px + 1.5, DECK_Y + 0.68, zz);
          place(diag, yaw, ox, 0, oz, grayGeos);
        }
      }
      // 橋墩 (護欄外 ±10.6)
      for (const px of [-10.6, 10.6]) {
        place(new THREE.BoxGeometry(0.9, DECK_Y, 0.9).translate(px, DECK_Y / 2, 0), yaw, ox, 0, oz, grayGeos);
      }
      // 樓梯:兩端斜下 (近橋端高、離橋端落地)
      for (const sgn of [1, -1]) {
        const stair = new THREE.BoxGeometry(9.5, 0.4, 2.4);
        stair.rotateZ(-sgn * 0.56);
        stair.translate(sgn * (SPAN / 2 + 3.6), DECK_Y * 0.52, 0);
        place(stair, yaw, ox, 0, oz, grayGeos);
        place(new THREE.BoxGeometry(0.5, 2.6, 0.5).translate(sgn * (SPAN / 2 + 7.2), 1.3, 0), yaw, ox, 0, oz, grayGeos);
      }
      // 橋身廣告板:面向兩個行車方向 (局部 ±z),白天=一般看板、夜=燈箱
      for (const zz of [-1.72, 1.72]) {
        const ad = new THREE.PlaneGeometry(12, 1.5);
        if (zz < 0) ad.rotateY(Math.PI);
        ad.translate(0, DECK_Y + 0.9, zz);
        place(ad, yaw, ox, 0, oz, adGeos);
      }
      // 濕路反射:橋下廣告燈箱微光
      streaks.push({
        x: ox, z: oz, angle: yaw, color: '#ffd23e', w: 3.4, len: 8,
      });
    }
  }

  // ---- 門架式路橋/短隧道 ×1:賽道上方蓋頂 + 內壁燈帶 ----
  {
    const f0 = 0.795, LEN = 42;
    const kSpan = Math.max(2, Math.round(LEN / segLen));
    const k0 = Math.floor(f0 * N);
    for (let k = 0; k <= kSpan; k++) {
      const sm = track.samples[(k0 + k) % N];
      const yaw = yawOf(sm);
      const L = segLen + 0.4;
      // 側牆 (護欄外 ±10.4) + 頂板 (淨高 7.9,高於路燈 7.5 → 桿件不穿頂)
      for (const px of [-10.4, 10.4]) {
        place(new THREE.BoxGeometry(0.8, 7.9, L).translate(px, 3.95, 0), yaw, sm.pos.x, 0, sm.pos.z, grayGeos);
      }
      place(new THREE.BoxGeometry(22.4, 0.7, L).translate(0, 8.25, 0), yaw, sm.pos.x, 0, sm.pos.z, grayGeos);
      // 內壁燈帶:兩側簷下連續光條 (隧道晝夜常亮)
      for (const px of [-9.8, 9.8]) {
        place(new THREE.BoxGeometry(0.22, 0.14, L).translate(px, 7.6, 0), yaw, sm.pos.x, 0, sm.pos.z, lightGeos);
      }
    }
    // 兩端門架洞口加厚框
    for (const kk of [0, kSpan]) {
      const sm = track.samples[(k0 + kk) % N];
      const yaw = yawOf(sm);
      place(new THREE.BoxGeometry(23.2, 1.3, 1.1).translate(0, 8.6, 0), yaw, sm.pos.x, 0, sm.pos.z, grayGeos);
    }
  }

  // ---- 紅綠燈 ×2 (山道不設):路口造型桿 + 三燈頭循環 ----
  const lampInfos = []; // {x,y,z, role 0紅/1黃/2綠}
  const tlFracs = isMountain ? [] : [0.15, 0.52];
  for (const f of tlFracs) {
    const sm = smAt(f);
    const side = 1;
    // 與路燈同慣例:yawR 讓局部 +z 指向路中央 → 橫臂確定伸進路面上方
    const yawR = Math.atan2(-sm.normal.x * side, -sm.normal.z * side);
    const px = sm.pos.x + sm.normal.x * 9.7 * side;
    const pz = sm.pos.z + sm.normal.z * 9.7 * side;
    // 直桿 + 橫臂伸向路面 (台式路口懸臂桿)
    place(new THREE.CylinderGeometry(0.12, 0.16, 6.2, 6).translate(0, 3.1, 0), yawR, px, 0, pz, grayGeos);
    place(new THREE.BoxGeometry(0.16, 0.16, 6.4).translate(0, 6.0, 3.2), yawR, px, 0, pz, grayGeos);
    // 燈頭盒 (橫式三燈,沿橫臂懸掛;燈面朝行車方向 ±x)
    place(new THREE.BoxGeometry(0.34, 0.62, 1.7).translate(0, 5.55, 5.4), yawR, px, 0, pz, grayGeos);
    // 三顆燈:紅/黃/綠沿橫臂排列,兩面各一組 → 兩個行車方向都可讀
    _envQ.setFromAxisAngle(_envUp, yawR);
    for (const fx of [-0.21, 0.21]) {
      for (let li = 0; li < 3; li++) {
        const local = new THREE.Vector3(fx, 5.55, 5.4 - 0.5 + li * 0.5);
        local.applyQuaternion(_envQ);
        lampInfos.push({ x: px + local.x, y: local.y, z: pz + local.z, role: li });
      }
    }
  }

  // ---- 斑馬線:起跑線附近 + 各紅綠燈處 (instanced 白條 decal, 1 dc) ----
  const zebraBars = [];
  const zebraAt = (sm) => {
    const yaw = yawOf(sm);
    for (let lat = -6.05; lat <= 6.06; lat += 1.1) {
      zebraBars.push([
        sm.pos.x + sm.normal.x * lat, 0.052, sm.pos.z + sm.normal.z * lat, yaw, 1]);
    }
  };
  if (!isMountain) {
    zebraAt(track.samples[Math.floor(0.985 * N)]); // 起跑線前
    for (const f of tlFracs) zebraAt(smAt(f + 3 / N));
  }

  // ---- 加油群眾:護欄外 billboard 人群 ×4 組 (2 貼圖 → 2 dc) ----
  const crowdFracs = isMountain ? [0.24, 0.58, 0.86] : [0.09, 0.4, 0.6, 0.9];
  const crowdGeosA = [], crowdGeosB = [];
  crowdFracs.forEach((f, i) => {
    const sm = smAt(f);
    const side = i % 2 === 0 ? 1 : -1;
    const cx = sm.pos.x + sm.normal.x * 10.9 * side;
    const cz = sm.pos.z + sm.normal.z * 10.9 * side;
    const yaw = Math.atan2(-sm.normal.x * side, -sm.normal.z * side); // 面向路
    const g = new THREE.PlaneGeometry(10, 2.5).translate(0, 1.25, 0);
    _envQ.setFromAxisAngle(_envUp, yaw);
    _envM4.compose(new THREE.Vector3(cx, 0, cz), _envQ, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_envM4);
    (i % 2 === 0 ? crowdGeosA : crowdGeosB).push(g);
  });
  const crowdMats = [];
  [[crowdGeosA, 1], [crowdGeosB, 2]].forEach(([geos, variant]) => {
    if (!geos.length) return;
    const tex = crowdBillboardTexture(variant, wid);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
      color: isDay ? 0xffffff : isDusk ? 0xd8ccc4 : 0x9aa0b0, // 夜間人群被環境光壓暗
    });
    crowdMats.push({ mat, phase: variant * 1.7 });
    group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  });

  // ---- 合併輸出 ----
  if (grayGeos.length) {
    group.add(new THREE.Mesh(mergeGeometries(grayGeos),
      new THREE.MeshStandardMaterial({ color: 0x39404c, roughness: 0.8, metalness: 0.25 })));
  }
  if (lightGeos.length) {
    group.add(new THREE.Mesh(mergeGeometries(lightGeos),
      new THREE.MeshBasicMaterial({ color: 0xcfe8ff, toneMapped: false })));
  }
  if (adGeos.length) {
    group.add(new THREE.Mesh(mergeGeometries(adGeos), new THREE.MeshBasicMaterial({
      map: adBoardTexture(isMountain ? 'MOUNTAIN PASS' : 'TAIPEI 101 GP', '#ffd23e', '#131018'),
      toneMapped: isDay, color: isDusk ? 0xc0c0c0 : 0xffffff,
    })));
  }
  if (zebraBars.length) {
    const barGeo = new THREE.PlaneGeometry(0.62, 2.9);
    barGeo.rotateX(-Math.PI / 2);
    const barMat = new THREE.MeshBasicMaterial({
      color: 0xd9dde2, transparent: true, opacity: 0.82, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    group.add(instancedFrom(barGeo, barMat, zebraBars));
  }
  // 紅綠燈燈頭:單一 InstancedMesh + instanceColor 循環切換 (1 dc)
  let lampInst = null;
  if (lampInfos.length) {
    const lg = new THREE.SphereGeometry(0.17, 8, 6);
    lampInst = new THREE.InstancedMesh(lg,
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), lampInfos.length);
    const col = new THREE.Color(0x111111);
    lampInfos.forEach((p, i) => {
      _envM4.makeTranslation(p.x, p.y, p.z);
      lampInst.setMatrixAt(i, _envM4);
      lampInst.setColorAt(i, col);
    });
    group.add(lampInst);
  }

  // 每幀:紅綠燈循環 + 群眾上下彈跳揮手
  const LAMP_ON = [new THREE.Color(0xff3626), new THREE.Color(0xffc21e), new THREE.Color(0x2ee65f)];
  const LAMP_OFF = [new THREE.Color(0x2c0f0c), new THREE.Color(0x2c260c), new THREE.Color(0x0c2c14)];
  const _lc = new THREE.Color();
  group.userData.update = (t) => {
    if (lampInst) {
      const ph = t % 12;
      const active = ph < 6 ? 2 : ph < 7.6 ? 1 : 0; // 綠6s → 黃1.6s → 紅4.4s
      for (let i = 0; i < lampInfos.length; i++) {
        const role = lampInfos[i].role;
        lampInst.setColorAt(i, _lc.copy(role === active ? LAMP_ON[role] : LAMP_OFF[role]));
      }
      lampInst.instanceColor.needsUpdate = true;
    }
    // 群眾彈跳:貼圖 offset.y 微幅振盪 → 整排人上下跳動揮手
    for (const cm of crowdMats) {
      cm.mat.map.offset.y = -0.06 + 0.06 * Math.abs(Math.sin(t * 3.1 + cm.phase));
    }
  };
  return group;
}

// ============================================================
// 天空飛行器 —— 定期航班 (高空直線) + 巡邏直升機 (中低空繞圈)
// ============================================================

function heliBeamTexture() {
  // 探照燈錐:頂亮 (機腹) → 底透 (地面前散逸)
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,244,214,0.75)');
  grad.addColorStop(0.55, 'rgba(255,240,200,0.2)');
  grad.addColorStop(1, 'rgba(255,236,190,0.02)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSkyTraffic(landmark, wid) {
  const group = new THREE.Group();
  const isDay = wid === 'day', isDusk = wid === 'dusk';

  // ---- 民航機:每 90 秒一班,高空直線橫越 (merge 1 dc + 航行燈 Points 1 dc) ----
  const plane = new THREE.Group();
  const fus = new THREE.CylinderGeometry(1.3, 1.3, 19, 10).rotateX(Math.PI / 2);
  const nose = new THREE.SphereGeometry(1.3, 10, 8).translate(0, 0, 9.5);
  const wing = new THREE.BoxGeometry(26, 0.35, 4.2).translate(0, -0.4, 1.2);
  const tailW = new THREE.BoxGeometry(9.5, 0.3, 2.6).translate(0, 0.2, -8.6);
  const fin = new THREE.BoxGeometry(0.3, 4.2, 3.2).translate(0, 2.4, -8.8);
  const eng1 = new THREE.CylinderGeometry(0.75, 0.75, 3, 8).rotateX(Math.PI / 2).translate(-5.5, -1.2, 2);
  const eng2 = eng1.clone().translate(11, 0, 0);
  const planeGeo = mergeGeometries([fus, nose, wing, tailW, fin, eng1, eng2]);
  const planeMat = new THREE.MeshBasicMaterial({
    color: isDay ? 0xdde4ec : isDusk ? 0x8a7080 : 0x39404e, fog: false });
  plane.add(new THREE.Mesh(planeGeo, planeMat));
  // 航行燈:左紅 / 右綠 / 尾白 (vertexColors Points, 閃爍)
  const navGeo = new THREE.BufferGeometry();
  navGeo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-13, -0.4, 1.2, 13, -0.4, 1.2, 0, 2.4, -10.2], 3));
  navGeo.setAttribute('color', new THREE.Float32BufferAttribute(
    [1, 0.15, 0.15, 0.15, 1, 0.3, 1, 1, 1], 3));
  const navMat = new THREE.PointsMaterial({
    map: radialGlowTexture('#ffffff'), vertexColors: true,
    size: 5, sizeAttenuation: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  });
  plane.add(new THREE.Points(navGeo, navMat));
  const P0 = new THREE.Vector3(-1150, 340, -680);
  const P1 = new THREE.Vector3(1050, 360, 620);
  plane.position.copy(P0);
  plane.lookAt(P1); // 非相機物件:+z (機鼻) 朝向目標
  plane.visible = false;
  group.add(plane);

  // ---- 直升機:中低空繞圈 + 旋翼 + 向下探照燈錐 ----
  const heli = new THREE.Group();
  const cabin = new THREE.SphereGeometry(1.5, 10, 8).scale(1, 0.8, 1.5);
  const boom = new THREE.CylinderGeometry(0.22, 0.34, 5.2, 6).rotateX(Math.PI / 2).translate(0, 0.25, -3.6);
  const finT = new THREE.BoxGeometry(0.16, 1.5, 0.9).translate(0, 0.9, -6.1);
  const skid1 = new THREE.BoxGeometry(0.14, 0.14, 3.2).translate(-0.9, -1.45, 0);
  const skid2 = skid1.clone().translate(1.8, 0, 0);
  const leg1 = new THREE.BoxGeometry(0.1, 0.5, 0.1).translate(-0.9, -1.2, 0.9);
  const leg2 = leg1.clone().translate(1.8, 0, 0);
  const heliGeo = mergeGeometries([cabin, boom, finT, skid1, skid2, leg1, leg2]);
  const heliMat = new THREE.MeshBasicMaterial({
    color: isDay ? 0x4a5462 : isDusk ? 0x3a3040 : 0x272c38, fog: false });
  heli.add(new THREE.Mesh(heliGeo, heliMat));
  // 主旋翼 (十字) — 每幀旋轉
  const rotorGeo = mergeGeometries([
    new THREE.BoxGeometry(9.6, 0.07, 0.42),
    new THREE.BoxGeometry(0.42, 0.07, 9.6),
  ]);
  const rotor = new THREE.Mesh(rotorGeo, new THREE.MeshBasicMaterial({
    color: 0x14161c, transparent: true, opacity: 0.75, fog: false }));
  rotor.position.y = 1.5;
  heli.add(rotor);
  // 機腹紅色防撞燈
  const heliNavGeo = new THREE.BufferGeometry();
  heliNavGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1.1, 0], 3));
  const heliNavMat = new THREE.PointsMaterial({
    map: radialGlowTexture('#ff4433'), color: 0xff4433,
    size: 3.4, sizeAttenuation: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  });
  heli.add(new THREE.Points(heliNavGeo, heliNavMat));
  // 探照燈光錐:向下 (白天不開)
  let beamMat = null;
  if (!isDay) {
    const beamGeo = new THREE.CylinderGeometry(0.6, 8.5, 88, 12, 1, true).translate(0, -45, 0);
    beamMat = new THREE.MeshBasicMaterial({
      map: heliBeamTexture(), transparent: true, opacity: isDusk ? 0.16 : 0.26,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = -0.8;
    heli.add(beam);
  }
  group.add(heli);

  const HELI_R = 250, HELI_Y = 86, HELI_W = 0.085; // 繞圈半徑/高度/角速度
  group.userData.update = (t) => {
    // 航班:90 秒一班,前 42 秒橫越天際
    const ph = t % 90;
    const prog = ph / 42;
    if (prog <= 1) {
      plane.visible = true;
      plane.position.lerpVectors(P0, P1, prog);
    } else plane.visible = false;
    navMat.opacity = Math.sin(t * 7) > -0.2 ? 0.95 : 0.15; // 航行燈頻閃
    // 直升機繞圈 (橢圓航線;機頭朝速度方向)
    const a = t * HELI_W;
    heli.position.set(Math.cos(a) * HELI_R, HELI_Y + Math.sin(t * 0.5) * 4, Math.sin(a) * HELI_R * 0.8);
    heli.rotation.y = Math.atan2(-Math.sin(a), 0.8 * Math.cos(a));
    rotor.rotation.y = t * 26;
    heliNavMat.opacity = Math.sin(t * 5.2) > 0 ? 0.95 : 0.15;
    if (beamMat) beamMat.opacity = (isDusk ? 0.16 : 0.26) * (0.85 + 0.15 * Math.sin(t * 1.7));
  };
  return group;
}
