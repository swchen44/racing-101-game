// vehicle.js — 跑車模型 (styled primitives) + 街機駕駛物理 (自訂,無外部物理引擎)
import * as THREE from 'three';
import { ROAD_HALF_WIDTH, WALL_HALF_WIDTH } from './track.js';

const TUNE = {
  maxSpeed: 62,          // m/s ≈ 223 km/h
  maxReverse: 12,
  engineForce: 19,       // m/s^2 等效加速度(低速) — 0-100 約 3.5s
  brakeForce: 46,
  drag: 0.0075,
  rollingResist: 1.1,
  gripNormal: 9.5,       // 側向抓地衰減係數
  gripDrift: 2.4,
  steerMax: 0.62,        // rad
  steerSpeedFalloff: 0.028,
  yawGain: 2.6,
  driftYawBoost: 1.55,
  wallRestitution: 0.2,
  carHalfWidth: 1.02,
};

// ---------- 程序化貼圖 (模組層共用,只生成一次) ----------
let _carEnvTex = null;
// 車漆專用環境貼圖:亮色天空漸層 + 霓虹色塊,讓夜景中車漆有明確反射讀點。
// material.envMap 會覆蓋 scene.environment,只影響車輛材質,零額外光源/draw call。
function getCarEnvTexture() {
  if (_carEnvTex) return _carEnvTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0.0, '#1e3a6e');   // 天頂深藍 (夠亮,車頂有天光高光)
  grad.addColorStop(0.42, '#27436f');
  grad.addColorStop(0.55, '#b46a30');  // 地平線暖橘
  grad.addColorStop(0.62, '#241a14');
  grad.addColorStop(1.0, '#07080c');   // 地面暗
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 64);
  // 霓虹大面板 (青 / 洋紅 / 暖黃),給側面腰線抓反射
  const panels = [
    ['#2ae0ff', 8, 26, 16, 20], ['#ffd24a', 52, 24, 13, 22],
    ['#ffd24a', 90, 28, 11, 18], ['#2ae0ff', 112, 26, 10, 20],
    ['#9fffe0', 34, 30, 6, 14],
  ];
  for (const [col, x, y, w, h] of panels) { g.fillStyle = col; g.fillRect(x, y, w, h); }
  // 天頂補一條冷白高光帶 (月光)
  g.fillStyle = 'rgba(220,235,255,0.85)';
  g.fillRect(0, 4, 128, 5);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _carEnvTex = tex;
  return tex;
}

let _groundGlowTex = null;
// 橢圓漸層貼圖 (中心亮、邊緣零):頭燈光池 + underglow 共用。
// 漸層階多、尾段收很慢 → additive 疊在路面上完全無硬邊
function getGroundGlowTexture() {
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
  _groundGlowTex = tex;
  return tex;
}

let _rimTex = null;
// 輪圈 7 輻貼圖 (128x128):亮銀輻條 + 深底 + 外圈亮環,貼在 rim 圓柱端面 (map+emissiveMap),
// 隨 spinner 旋轉 → 10 公尺外輪圈仍是「亮銀多輻」一眼可讀
function getRimTexture() {
  if (_rimTex) return _rimTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1015';
  g.fillRect(0, 0, 128, 128);
  // 外圈亮環 (rim barrel 邊緣)
  g.strokeStyle = '#e7edf5';
  g.lineWidth = 7;
  g.beginPath(); g.arc(64, 64, 57, 0, Math.PI * 2); g.stroke();
  // 7 支輻條
  for (let i = 0; i < 7; i++) {
    g.save();
    g.translate(64, 64);
    g.rotate((i / 7) * Math.PI * 2);
    g.fillStyle = '#dde4ee';
    g.beginPath();
    g.moveTo(-8, -12);
    g.lineTo(-4.5, -56);
    g.lineTo(4.5, -56);
    g.lineTo(8, -12);
    g.closePath();
    g.fill();
    // 輻條側緣暗線 (立體感)
    g.fillStyle = '#8d96a4';
    g.fillRect(-8, -50, 2.5, 38);
    g.restore();
  }
  // 中央轂 + 紅色中心蓋
  g.fillStyle = '#ccd3de';
  g.beginPath(); g.arc(64, 64, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c01f2c';
  g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _rimTex = tex;
  return tex;
}

let _tireTex = null;
// 輪胎側壁貼圖 (128x128):深灰胎體 + 一圈淺灰胎字環 (虛線模擬字樣),貼在 tire 圓柱端面
function getTireSideTexture() {
  if (_tireTex) return _tireTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0c0e';
  g.fillRect(0, 0, 128, 128);
  // 胎字環 (虛線)
  g.strokeStyle = '#7d838c';
  g.lineWidth = 4;
  g.setLineDash([9, 6]);
  g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  // 靠近輪圈的內圈細環
  g.strokeStyle = '#212429';
  g.lineWidth = 2;
  g.beginPath(); g.arc(64, 64, 47, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _tireTex = tex;
  return tex;
}

export class Car {
  constructor(track) {
    this.track = track;
    this.mesh = this._buildMesh();
    this.reset();
  }

  reset() {
    const sm = this.track.samples[this.track.samples.length - 12];
    this.pos = new THREE.Vector3(sm.pos.x, 0, sm.pos.z);
    this.heading = Math.atan2(sm.tan.x, sm.tan.z);
    this.vel = new THREE.Vector3();
    this.steer = 0;
    this.speed = 0;           // 前向速度 (signed)
    this.drifting = false;
    this.driftAmount = 0;     // 側滑程度 0..1
    this.lateralVel = 0;      // 側向速度 (視覺滑移角用)
    this.visualYaw = 0;       // 車身視覺 yaw 偏移 (甩尾姿態)
    this.rimHeat = 0;         // 煞車碟熱度 0..1
    this.trackHint = this.track.nearest(this.pos, -1);
    this.progress = this.track.query(this.pos, this.trackHint).s;
    this.lateral = 0;
    this.wrongWay = false;
    this.collisionImpulse = 0; // 給攝影機/音效用
    this.throttleSmooth = 0;
    this.wheelSpin = 0;
    this._syncMesh(0);
  }

  _buildMesh() {
    const car = new THREE.Group();
    const envMap = getCarEnvTexture();
    // 電光黃車漆:夜景高辨識度基色 + 微量自發光保底 (0.3 遠低於 bloom threshold 0.85,不炸光暈),
    // clearcoat 高光讓霓虹/月光在肩線上抓出反射讀點
    // 場景光全偏藍 (hemi/moon/carFill),純反射的黃漆會被推成檸檬綠;
    // 用同色相 emissive 打底「鎖住」熾焰橘黃色相 (亮度 ~0.35 仍低於 bloom threshold 0.85)
    const paint = new THREE.MeshPhysicalMaterial({
      color: 0xff9d0c, metalness: 0.18, roughness: 0.42,
      clearcoat: 0.85, clearcoatRoughness: 0.2,
      emissive: 0xff8800, emissiveIntensity: 0.5,
      envMap, envMapIntensity: 0.9,
    });
    const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.6, roughness: 0.5 });
    // 輪拱井全消光近黑:輪胎後方的黑色背景板,讓輪子剪影從車身裡跳出來
    const matteWell = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
    // 座艙玻璃:深色高反射,與亮黃車漆天然兩噸對比
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0e1c2c, metalness: 0.9, roughness: 0.08,
      envMap, envMapIntensity: 2.6,
    });

    // 沿車長方向車寬 taper:車頭收窄、車尾微收、中後段最寬 → 後 3/4 視角「寬肩」
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

    // ---- 主車身 (paint 上段):側面輪廓 extrude,底線 0.56 (含 bevel 後 ~0.48,高於輪心 0.44)
    // → 輪子整顆掛在車身下方 + 側面外露,不再被鈑件蓋死
    const shape = new THREE.Shape();
    shape.moveTo(-2.30, 0.58);
    shape.lineTo(-2.34, 0.86);                        // Kamm tail 高尾垂直面
    shape.quadraticCurveTo(-2.05, 0.92, -1.5, 0.92);  // 尾廂甲板
    shape.quadraticCurveTo(-0.6, 0.95, 0.2, 0.93);    // 肩線 (座艙基座)
    shape.quadraticCurveTo(1.25, 0.80, 1.9, 0.68);    // 引擎蓋俯衝斜面
    shape.quadraticCurveTo(2.3, 0.61, 2.36, 0.58);    // 車頭鼻端
    shape.lineTo(2.36, 0.54);
    shape.quadraticCurveTo(1.2, 0.52, 0, 0.52);
    shape.quadraticCurveTo(-1.2, 0.53, -2.30, 0.58);  // 底線
    const bodyGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.6, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 2,
    });
    bodyGeo.translate(0, 0, -0.8);
    bodyGeo.rotateY(-Math.PI / 2);           // shape +x(車頭) → 世界 +z
    applyTaper(bodyGeo);                     // 完成後最大半寬 ~0.92
    const body = new THREE.Mesh(bodyGeo, paint);
    body.castShadow = true;
    car.add(body);

    // ---- 深色下段 (兩噸對比):側裙 (輪拱之間) + 車底封板,腰線以下全深色
    const rocker = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.24, 1.62), darkTrim);
    rocker.position.set(0, 0.46, 0);
    car.add(rocker);
    const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 3.9), matteWell);
    floorPan.position.set(0, 0.42, 0);
    car.add(floorPan);

    // ---- 座艙:低矮斜面楔形 (A 柱斜面→平頂→fastback),絕對不是圓頂
    const cabShape = new THREE.Shape();
    cabShape.moveTo(0.62, 0.86);
    cabShape.lineTo(0.10, 1.20);    // A 柱斜面
    cabShape.lineTo(-0.52, 1.23);   // 低平車頂
    cabShape.lineTo(-1.35, 0.86);   // fastback 斜背
    cabShape.closePath();
    const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
      depth: 1.0, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2,
    });
    cabGeo.translate(0, 0, -0.5);
    cabGeo.rotateY(-Math.PI / 2);
    // 座艙塔式收窄:越高越窄 (tumblehome),後視讀出「寬肩窄艙」梯形斷面
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
    // 翼端板 (讀成「後翼」而非甲板延伸)
    for (const sx of [0.93, -0.93]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.34), darkTrim);
      plate.position.set(sx, 1.12, -2.14);
      car.add(plate);
    }

    // ---- 頭燈:細長 LED 眉形 (外高內低的斜細條),貼在引擎蓋前緣斜面上
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.0 });
    const headGeo = new THREE.BoxGeometry(0.46, 0.045, 0.1);
    for (const sx of [1, -1]) {
      const h = new THREE.Mesh(headGeo, headMat);
      h.position.set(sx * 0.52, 0.67, 2.2);
      h.rotation.z = sx * 0.14;      // 眉形上挑
      h.rotation.x = -0.35;          // 貼合引擎蓋斜面
      car.add(h);
    }

    // ---- 車尾燈組:全寬紅色光條 (現代電動車語彙) + 深色尾面板框
    const tailPanel = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.44, 0.08), darkTrim);
    tailPanel.position.set(0, 0.78, -2.38);
    car.add(tailPanel);
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 1.6 });
    this.tailMat = tailMat;
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.06, 0.05), tailMat);
    tailBar.position.set(0, 0.86, -2.41);
    car.add(tailBar);
    this.brakeLight = tailBar;
    const tailMidMat = new THREE.MeshStandardMaterial({ color: 0x2a0006, emissive: 0xff1a2e, emissiveIntensity: 0.8 });
    this.tailMidMat = tailMidMat;
    const tailMid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.05), tailMidMat);
    tailMid.position.set(0, 0.7, -2.41);
    car.add(tailMid);
    // 倒車燈小白點
    const reverseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 0.5 });
    for (const sx of [0.5, -0.5]) {
      const rv = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), reverseMat);
      rv.position.set(sx, 0.66, -2.4);
      car.add(rv);
    }
    // 尾部下方:diffuser 鰭片 + valance + 雙出排氣
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

    // ---- 底盤氛圍燈 (青色 underglow):橢圓漸層,任何視角無幾何邊
    const glowGeo = new THREE.PlaneGeometry(2.3, 4.6);
    const glowMat = new THREE.MeshBasicMaterial({
      map: getGroundGlowTexture(), color: 0x1ad2ff, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    car.add(glow);
    this.underglow = glow;

    // ---- 頭燈 SpotLight ×2:penumbra 1.0 全軟邊,強度收斂 → 地面光池不再是硬邊黃漬
    this.headlights = [];
    for (const sx of [0.52, -0.52]) {
      const spot = new THREE.SpotLight(0xd9e8ff, 75, 60, 0.44, 1.0, 1.7);
      spot.position.set(sx, 0.62, 2.2);
      const tgt = new THREE.Object3D();
      tgt.position.set(sx * 0.4, 0.0, 26);
      car.add(tgt);
      spot.target = tgt;
      car.add(spot);
      this.headlights.push(spot);
    }
    // 假體積光束:兩片 additive 錐形 quad (單一 mesh),夜雨裡的光錐方向性
    {
      const beamGeo = new THREE.BufferGeometry();
      const verts = [];
      const uvs = [];
      const idx = [];
      let vi = 0;
      for (const sx of [0.52, -0.52]) {
        verts.push(
          sx - 0.12, 0.66, 2.3,  sx + 0.12, 0.66, 2.3,
          sx - 0.8, 0.1, 10.5,   sx + 0.8, 0.1, 10.5,
        );
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
    }

    // ---- 車輪:加大輪徑 0.48、外推超出車身,整顆掛在底盤 (0.48) 下方 → 一眼可讀
    this.wheels = [];
    const tireSideTex = getTireSideTexture();
    const tireGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.4, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tireSideMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.75 });
    // 端面 (側壁) 貼胎字環貼圖;rotateZ 後 cap 朝 ±x
    const tireCapMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.9, map: tireSideTex,
      emissiveMap: tireSideTex, emissive: 0x42464e, emissiveIntensity: 1.4,
    });
    const tireMats = [tireSideMat, tireCapMat, tireCapMat];
    // 輪圈:比胎略寬 0.02,端面亮銀 7 輻貼圖 (map+emissiveMap),夜裡自帶可讀圖形
    const rimTex = getRimTexture();
    const rimGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.44, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const rimBarrelMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.9, roughness: 0.4 });
    const rimFaceFront = new THREE.MeshStandardMaterial({
      color: 0xf2f5fa, metalness: 0.9, roughness: 0.28,
      map: rimTex, emissiveMap: rimTex,
      emissive: 0x76828f, emissiveIntensity: 2.0, envMap, envMapIntensity: 1.2,
    });
    const rimFaceRear = rimFaceFront.clone();
    this.rimMatRear = rimFaceRear;
    this._rimBaseEmissive = new THREE.Color(0x76828f);
    this._rimHotEmissive = new THREE.Color(0xff5522);
    const rimMatsFront = [rimBarrelMat, rimFaceFront, rimFaceFront];
    const rimMatsRear = [rimBarrelMat, rimFaceRear, rimFaceRear];
    // 拋光輪唇亮環
    const lipGeo = new THREE.TorusGeometry(0.4, 0.045, 8, 24);
    lipGeo.rotateY(Math.PI / 2);
    const lipMat = new THREE.MeshStandardMaterial({
      color: 0xdde4ee, metalness: 1.0, roughness: 0.1, envMap, envMapIntensity: 1.6,
      emissive: 0x6a7480, emissiveIntensity: 1.1,
    });
    // 剎車卡鉗 (紅):不隨輪旋轉,透過輻條縫隙露出紅色讀點
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xcc1622, emissive: 0x991018, emissiveIntensity: 0.7 });
    const caliperGeo = new THREE.BoxGeometry(0.07, 0.17, 0.13);
    // 前輪 track ±0.92 (胎外面 1.12)、後輪 ±0.98 (胎外面 1.18):胎明確突出車身 (半寬 ~0.92)
    const positions = [
      [0.92, 0.48, 1.42, true], [-0.92, 0.48, 1.42, true],
      [0.98, 0.48, -1.42, false], [-0.98, 0.48, -1.42, false],
    ];
    // 輪拱陰影井 (消光近黑背板) + 寬體 fender blister (paint 方塊緊貼車身,罩住輪頂):
    // blister 與胎面之間由黑背板拉出「輪拱黑縫」,輪子剪影從車身跳出來
    const wellGeo = new THREE.BoxGeometry(0.2, 1.0, 1.24);
    const blisterGeo = new THREE.BoxGeometry(0.3, 0.24, 1.3);
    for (const [x, , z, steerable] of positions) {
      const sx = Math.sign(x);
      const well = new THREE.Mesh(wellGeo, matteWell);
      well.position.set(sx * (Math.abs(x) - 0.3), 0.52, z);
      car.add(well);
      // 前拱貼齊引擎蓋高度、後拱貼齊尾廂甲板 → fender hump 融進車身,不再是浮貼方塊
      const blister = new THREE.Mesh(blisterGeo, paint);
      blister.position.set(sx * (Math.abs(x) + 0.01), steerable ? 0.86 : 0.92, z);
      blister.castShadow = true;
      car.add(blister);
    }
    for (const [x, y, z, steerable] of positions) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(x, y, z);
      const tire = new THREE.Mesh(tireGeo, tireMats);
      const rim = new THREE.Mesh(rimGeo, steerable ? rimMatsFront : rimMatsRear);
      // 拋光輪唇貼在「兩側端面」上 (不是埋在胎中):任何視角輪緣都有一道亮弧,
      // 正後方也能靠邊緣亮弧讀出「這裡有輪子」
      const lipOut = new THREE.Mesh(lipGeo, lipMat);
      lipOut.position.x = 0.225;
      const lipIn = new THREE.Mesh(lipGeo, lipMat);
      lipIn.position.x = -0.225;
      tire.castShadow = true;
      const spinner = new THREE.Group();
      spinner.add(tire, rim, lipOut, lipIn);
      wheelGroup.add(spinner);
      // 卡鉗固定在輪架上 (不轉),位於輪面後方縫隙
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(Math.sign(x) * 0.19, 0.12, steerable ? 0.22 : -0.22);
      wheelGroup.add(caliper);
      car.add(wheelGroup);
      this.wheels.push({ group: wheelGroup, spinner, steerable });
    }

    // ---- 頭燈光池:車前貼地拉長橢圓 (柔邊漸層貼圖、低透明度、沿車頭方向拉長,零硬邊)
    const poolGroup = new THREE.Group();
    const poolMat = new THREE.MeshBasicMaterial({
      map: getGroundGlowTexture(), color: 0xa9c8ea, transparent: true, opacity: 0.11,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 12), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.05, 9.8);   // 覆蓋車前約 4–16m
    poolGroup.add(pool);
    this.headlightPool = poolGroup;

    // 車身組 (用於 roll/pitch/滑移角視覺,不影響碰撞)
    const rig = new THREE.Group();
    rig.add(car);
    rig.add(poolGroup);
    this.bodyGroup = car;
    return rig;
  }

  update(dt, input) {
    // ---- 輸入 ----
    const throttle = input.forward ? 1 : 0;
    const brake = input.backward ? 1 : 0;
    const handbrake = input.handbrake;
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);

    this.throttleSmooth += (throttle - this.throttleSmooth) * Math.min(1, dt * 6);

    // 轉向平滑 + 高速轉向衰減
    const steerLimit = TUNE.steerMax / (1 + Math.abs(this.speed) * TUNE.steerSpeedFalloff);
    const steerGoal = steerTarget * steerLimit;
    const steerRate = 4.2;
    this.steer += THREE.MathUtils.clamp(steerGoal - this.steer, -steerRate * dt, steerRate * dt);

    // ---- 前向/側向分解 ----
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let vF = this.vel.dot(fwd);
    let vL = this.vel.dot(right);

    // ---- 縱向力 ----
    const speedRatio = Math.max(0, 1 - Math.abs(vF) / TUNE.maxSpeed);
    let accel = 0;
    if (throttle) accel += TUNE.engineForce * (0.35 + 0.65 * speedRatio);
    if (brake) {
      if (vF > 0.5) accel -= TUNE.brakeForce;
      else accel -= TUNE.engineForce * 0.5 * Math.max(0, 1 - Math.abs(vF) / TUNE.maxReverse);
    }
    // 阻力 (貼牆/路緣時 rollingResist 打 65 折,避免刮牆掉速後起步不了)
    accel -= vF * Math.abs(vF) * TUNE.drag;
    const nearEdge = Math.abs(this.lateral ?? 0) > ROAD_HALF_WIDTH - 0.6;
    accel -= Math.sign(vF) * TUNE.rollingResist * (nearEdge ? 0.35 : 1) * Math.min(1, Math.abs(vF));
    if (handbrake && vF > 2) accel -= 14;
    vF += accel * dt;
    if (!throttle && !brake && Math.abs(vF) < 0.4) vF = 0;

    // ---- 側向抓地 (drift 核心) ----
    const slip = Math.abs(vL);
    const wantDrift = handbrake || (slip > 6.5 && Math.abs(vF) > 18);
    const grip = wantDrift ? TUNE.gripDrift : TUNE.gripNormal;
    vL *= Math.max(0, 1 - grip * dt);
    this.drifting = slip > 3.2 && Math.abs(vF) > 8;
    this.driftAmount += ((this.drifting ? Math.min(1, slip / 12) : 0) - this.driftAmount) * Math.min(1, dt * 5);
    this.lateralVel = vL;

    // ---- 偏航 ----
    // 基底 0.3:低速仍能把車頭轉離牆面,不再陷入「撞牆→掉速→轉不動→永久卡牆」死循環
    const speedFactor = THREE.MathUtils.clamp(0.3 + Math.abs(vF) / 14, 0, 1);
    let yawRate = this.steer * TUNE.yawGain * speedFactor * Math.sign(vF || 1);
    if (wantDrift) yawRate *= TUNE.driftYawBoost;
    this.heading += yawRate * dt;

    // ---- 合成速度 ----
    this.speed = vF;
    const newFwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const newRight = new THREE.Vector3(newFwd.z, 0, -newFwd.x);
    this.vel.copy(newFwd).multiplyScalar(vF).addScaledVector(newRight, vL);
    this.pos.addScaledVector(this.vel, dt);

    // ---- 賽道碰撞 (護欄) ----
    this.collisionImpulse *= Math.max(0, 1 - dt * 6);
    const q = this.track.query(this.pos, this.trackHint);
    this.trackHint = q.index;
    // 越過路緣的軟推力:朝賽道中心 ~4 m/s^2 * overshoot,車不會視覺上停在路緣/牆上
    const edgeLimit = ROAD_HALF_WIDTH - 0.6;
    if (Math.abs(q.lateral) > edgeLimit) {
      const over = Math.abs(q.lateral) - edgeLimit;
      const push = Math.min(4 * over, 9);
      const dirE = Math.sign(q.lateral);
      this.vel.x -= q.normal.x * dirE * push * dt;
      this.vel.z -= q.normal.z * dirE * push * dt;
    }
    const limit = WALL_HALF_WIDTH - TUNE.carHalfWidth;
    if (Math.abs(q.lateral) > limit) {
      const overshoot = Math.abs(q.lateral) - limit;
      const dir = Math.sign(q.lateral);
      // 推回牆內
      this.pos.x -= q.normal.x * dir * overshoot;
      this.pos.z -= q.normal.z * dir * overshoot;
      // 只消去法向分量 (小反彈 restitution 0.2),切向保留 90% → 刮牆滑行而非黏死
      const n = new THREE.Vector3(q.normal.x * dir, 0, q.normal.z * dir);
      const vn = this.vel.dot(n);
      if (vn > 0) {
        this.vel.addScaledVector(n, -vn * (1 + TUNE.wallRestitution));
        this.vel.multiplyScalar(0.9); // 撞牆切向損失 (保留 90%)
        this.collisionImpulse = Math.min(1, vn / 15);
      }
      // 車頭順牆:貼牆時「無條件」施加自動修正力矩 (不只在 vn>0 那一幀),
      // 基底 0.35 + 撞擊加成,係數 0.5 → 刮牆後自動滑出而非釘死
      const wallTan = new THREE.Vector3(q.tangent.x, 0, q.tangent.z);
      const headingVec = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      const align = headingVec.dot(wallTan);
      const targetHeading = Math.atan2(wallTan.x * Math.sign(align || 1), wallTan.z * Math.sign(align || 1));
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const alignStrength = Math.min(1, 0.35 + Math.max(0, vn) / 12) * 0.5;
      this.heading += dh * alignStrength * Math.min(1, dt * 12);
    }
    this.lateral = q.lateral;
    this.progress = q.s;

    // ---- 逆走偵測 ----
    const fwdDot = this.vel.length() > 4
      ? (this.vel.x * q.tangent.x + this.vel.z * q.tangent.z) / this.vel.length()
      : 1;
    this.wrongWay = fwdDot < -0.35 && this.vel.length() > 4;

    // ---- 視覺 ----
    this.wheelSpin += (vF / 0.48) * dt;
    this._syncMesh(dt);

    // 煞車燈 (emissive 收斂,ACES 管理高光,不再炸成一團)
    const braking = brake || handbrake;
    this.tailMat.emissiveIntensity = braking ? 4.5 : 1.6;
    this.tailMidMat.emissiveIntensity = braking ? 2.2 : 0.8;
    // 後輪熱碟:煞車時 rim emissive 漸轉紅橙
    const heatTarget = (braking && Math.abs(vF) > 6) ? 1 : 0;
    this.rimHeat += (heatTarget - this.rimHeat) * Math.min(1, dt * 3.5);
    this.rimMatRear.emissive.lerpColors(this._rimBaseEmissive, this._rimHotEmissive, this.rimHeat);
    this.rimMatRear.emissiveIntensity = 1.4 + this.rimHeat * 1.1;
    this.underglow.material.opacity = 0.09 + this.driftAmount * 0.22 + this.throttleSmooth * 0.05;
  }

  _syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // 甩尾視覺滑移角:車體朝滑移反方向擺出角度 (純視覺,不動物理)
    const slipYaw = -Math.atan2(this.lateralVel, Math.max(4, Math.abs(this.speed))) * 0.7;
    this.visualYaw += (slipYaw - this.visualYaw) * Math.min(1, dt * 8 + 0.001);
    this.bodyGroup.rotation.y = this.visualYaw;
    this.headlightPool.rotation.y = this.visualYaw; // 光池跟車頭指向,但不跟 roll/pitch
    // 車身側傾/俯仰
    const rollTarget = -this.steer * Math.min(1, Math.abs(this.speed) / 22) * 0.09 - this.driftAmount * Math.sign(this.steer || 1) * -0.03;
    const pitchTarget = -this.throttleSmooth * 0.022 + (this.collisionImpulse || 0) * 0.03;
    this.bodyGroup.rotation.z += (rollTarget - this.bodyGroup.rotation.z) * Math.min(1, dt * 7 + 0.001);
    this.bodyGroup.rotation.x += (pitchTarget - this.bodyGroup.rotation.x) * Math.min(1, dt * 6 + 0.001);
    // 輪
    for (const w of this.wheels) {
      w.spinner.rotation.x = this.wheelSpin % (Math.PI * 2);
      if (w.steerable) w.group.rotation.y = this.steer * 0.85;
    }
  }

  get speedKmh() { return Math.abs(this.speed) * 3.6; }
}
