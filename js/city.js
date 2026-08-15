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
  group.add(createSkylineSilhouette());
  group.add(createReflectionStreaks(streaks));
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
    map: streakTexture(), transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const inst = new THREE.InstancedMesh(geo, mat, streaks.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  streaks.forEach((s, i) => {
    q.setFromAxisAngle(up, s.angle);
    m4.compose(
      new THREE.Vector3(s.x, 0.03, s.z), q,
      new THREE.Vector3(s.w, 1, s.len));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, col.set(s.color));
  });
  inst.instanceColor.needsUpdate = true;
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
        // 城市光害暖暈:比日落淡、比日落寬,讀成「光害」而非「夕陽」
        float band = exp(-pow(max(h, 0.0) * 5.5, 1.5));
        col += vec3(0.10, 0.055, 0.035) * band;
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
  grad.addColorStop(0, 'rgba(255,150,90,0.28)');
  grad.addColorStop(0.45, 'rgba(255,140,90,0.1)');
  grad.addColorStop(1, 'rgba(255,130,90,0)');
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
      for (const [off, pw, ph, lit] of parts) {
        const geo = new THREE.BoxGeometry(pw, ph, layer.zLen);
        q.setFromAxisAngle(up, facing);
        m4.compose(
          new THREE.Vector3(cx + axX * off, ph / 2 - 5, cz + axZ * off),
          q, new THREE.Vector3(1, 1, 1));
        geo.applyMatrix4(m4);
        (lit ? litGeos : darkGeos).push(geo);
      }
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
  // 地平線光害輝光帶:淡暖白,把剪影腳部融進天空暈
  const ringGeo = new THREE.CylinderGeometry(1000, 1000, 90, 48, 1, true);
  const ringMat = new THREE.MeshBasicMaterial({
    map: horizonGlowTexture(), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.BackSide, fog: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 38;
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

  // 牆面基底
  ga.fillStyle = '#161a22';
  ga.fillRect(0, 0, W, H);
  ge.fillStyle = '#000000';
  ge.fillRect(0, 0, W, H);

  const cols = 12 + Math.floor(Math.random() * 7);   // 12~18
  const rows = 48 + Math.floor(Math.random() * 17);  // 48~64
  const cw = W / cols, ch = H / rows;
  // 整棟亮窗比例:一般樓 10%~40%,暗樓 ~2%
  const baseLit = dark ? 0.02 : 0.1 + Math.random() * 0.3;
  const slabEvery = 3 + Math.floor(Math.random() * 2); // 每 3~4 層一條樓板帶

  for (let y = 0; y < rows; y++) {
    if (y % slabEvery === slabEvery - 1) {
      // 全暗樓板帶 (albedo 畫深帶、emissive 保持全黑)
      ga.fillStyle = '#10141b';
      ga.fillRect(0, y * ch, W, ch);
      ge.fillStyle = '#000000';
      ge.fillRect(0, y * ch, W, ch);
      continue;
    }
    // 垂直分區:canvas y=0 是樓頂 (flipY),低樓層 (商業) 亮、高樓層 (住宅) 暗
    const floorK = 0.3 + 0.85 * (y / rows);
    const ratio = Math.min(0.45, baseLit * floorK * 1.2);
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
  const c = document.createElement('canvas');
  if (vertical) { c.width = 96; c.height = 96 * text.length; }
  else { c.width = 64 * text.length + 40; c.height = 110; }
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(6,8,14,0.92)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.font = `900 ${vertical ? 62 : 60}px "Noto Sans TC", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 26;
  g.fillStyle = color;
  if (vertical) {
    for (let i = 0; i < text.length; i++) g.fillText(text[i], 48, 48 + i * 96);
  } else {
    g.fillText(text, c.width / 2, 58);
  }
  // 二次描邊增亮
  g.shadowBlur = 8;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.55;
  if (vertical) { for (let i = 0; i < text.length; i++) g.fillText(text[i], 48, 48 + i * 96); }
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

  // 地標視廊:從賽道錨點朝 TOWER_POS 的 ±25m 走廊內限高,
  // 保證行進間多數路段能看到 101 的完整豎向剪影
  const anchors = [];
  for (let i = 0; i < track.samples.length; i += 90) anchors.push(track.samples[i].pos);
  const inTowerCorridor = (x, z) => {
    for (const a of anchors) {
      const tx = TOWER_POS.x - a.x, tz = TOWER_POS.z - a.z;
      const len = Math.hypot(tx, tz);
      if (len < 1) continue;
      const ux = tx / len, uz = tz / len;
      const px = x - a.x, pz = z - a.z;
      const along = px * ux + pz * uz;
      if (along < 6 || along > len) continue;
      if (Math.abs(px * uz - pz * ux) < 25) return true;
    }
    return false;
  };

  // 7 組一般貼圖 + 2 組近全暗貼圖 (albedo + emissive),依建築尺寸用 clone + repeat
  // 共享 image,讓窗格實際尺寸固定在 ~1m;每棟再乘一個整棟亮度係數 (量化 3 級進快取)
  const texPairs = [];
  for (let i = 0; i < 7; i++) texPairs.push(buildingTexturePair(false));
  const darkStart = texPairs.length;
  texPairs.push(buildingTexturePair(true), buildingTexturePair(true));
  const INTENSITY_LEVELS = [0.35, 0.6, 0.95]; // 舊版 0.7~1.25 → 整體降 ~40%
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

  let signCount = 0;
  for (let i = 0; i < track.samples.length; i += 14) {
    const sm = track.samples[i];
    for (const side of [1, -1]) {
      if (Math.random() < 0.25) continue;
      const setback = 24 + Math.random() * 26;
      const x = sm.pos.x + sm.normal.x * setback * side + (Math.random() - 0.5) * 8;
      const z = sm.pos.z + sm.normal.z * setback * side + (Math.random() - 0.5) * 8;
      if (isNearTrack(x, z, 21) || isNearTower(x, z, 90)) continue;
      const w = 14 + Math.random() * 18;
      const d = 14 + Math.random() * 18;
      if (!tryPlace(x, z, w, d)) continue;
      let h = 18 + Math.random() * Math.random() * 120;
      // 視廊限高:保留低層裙樓不留空洞,但別擋住 101
      if (inTowerCorridor(x, z)) h = Math.min(h, 22);

      // repeat 上限 2,消除同一面牆可見的貼圖週期重複;寬樓改拉伸
      const rx = w > 26 ? 2 : 1;
      const ry = Math.max(1, Math.min(6, Math.round(h / 22)));
      // ~17% 全暗建築 (只剩零星窗與屋頂航空燈);其餘隨機亮度等級
      const isDark = Math.random() < 0.17;
      const variant = isDark
        ? darkStart + Math.floor(Math.random() * (texPairs.length - darkStart))
        : Math.floor(Math.random() * darkStart);
      const level = isDark ? 1 : Math.floor(Math.random() * INTENSITY_LEVELS.length);
      const b = new THREE.Mesh(boxGeo, getMaterial(variant, rx, ry, level));
      b.position.set(x, 0, z);
      b.scale.set(w, h, d);
      // 面向道路
      const angle = Math.atan2(sm.normal.x * side, sm.normal.z * side) + Math.PI;
      b.rotation.y = angle;
      b.castShadow = h > 60;
      group.add(b);

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
        // 濕路反射:招牌顏色在路面拖一條長痕
        streaks.push({
          x: sm.pos.x + sm.normal.x * side * 4.5,
          z: sm.pos.z + sm.normal.z * side * 4.5,
          angle: tanAngle, color,
          w: Math.min(sw, 4.5), len: 9 + Math.random() * 6,
        });

        // 垂直外挑雙面燈箱 (不同色系),掛在牆角、垂直於牆面
        if (Math.random() < 0.7) {
          const [pText, pColor] = NEON_TEXTS[(signCount * 4 + 5 + (side > 0 ? 0 : 7)) % NEON_TEXTS.length];
          const vt = pText.replace(/\s/g, '').slice(0, 3);
          const ptex = neonSignTexture(vt, pColor, true);
          const pw = 1.7, ph = 1.7 * vt.length;
          const proj = new THREE.Mesh(
            new THREE.PlaneGeometry(pw, ph),
            new THREE.MeshBasicMaterial({ map: ptex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
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
          streaks.push({
            x: sm.pos.x + sm.normal.x * side * 5.6,
            z: sm.pos.z + sm.normal.z * side * 5.6,
            angle: tanAngle, color: pColor,
            w: 2.2, len: 8 + Math.random() * 5,
          });
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
    const sw = 2.0, sh = 2.0 * vText.length;
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
      w: 2.4, len: 10 + Math.random() * 5,
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
  grad.addColorStop(0, 'rgba(255,217,160,0.9)');
  grad.addColorStop(0.28, 'rgba(255,205,145,0.42)');
  grad.addColorStop(0.6, 'rgba(255,195,130,0.045)');
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
  const poolGeo = new THREE.PlaneGeometry(18, 13);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const poolInst = new THREE.InstancedMesh(poolGeo, poolMat, positions.length);
  positions.forEach((p, i) => {
    q.setFromAxisAngle(up, p.angle);
    const off = new THREE.Vector3(0, 0, 2.9).applyQuaternion(q);
    m4.compose(new THREE.Vector3(p.x + off.x, 0.07, p.z + off.z), q, new THREE.Vector3(1, 1, 1));
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
      w: 2.6, len: 11 + Math.random() * 4,
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
