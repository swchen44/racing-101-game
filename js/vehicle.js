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
  wallRestitution: 0.28,
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
    ['#2ae0ff', 8, 26, 16, 20], ['#ff35d0', 52, 24, 13, 22],
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

let _flareTex = null;
// 小尺寸放射狀光暈 (頭燈 flare sprite 用)
function getFlareTexture() {
  if (_flareTex) return _flareTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(214,236,255,0.6)');
  grad.addColorStop(0.55, 'rgba(140,190,255,0.14)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _flareTex = tex;
  return tex;
}

let _groundGlowTex = null;
// 橢圓漸層貼圖 (中心亮、邊緣零):頭燈光池 + underglow 共用,柔化幾何邊避免矩形穿幫
function getGroundGlowTexture() {
  if (_groundGlowTex) return _groundGlowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _groundGlowTex = tex;
  return tex;
}

const _flareCam = new THREE.Vector3();
const _flareFwd = new THREE.Vector3();

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
    this.wrongWay = false;
    this.collisionImpulse = 0; // 給攝影機/音效用
    this.throttleSmooth = 0;
    this.wheelSpin = 0;
    this._syncMesh(0);
  }

  _buildMesh() {
    const car = new THREE.Group();
    const envMap = getCarEnvTexture();
    // 深紅車漆:壓暗基色 + 降 metalness 保住紅相漫射,避免 carFill 冷光把紅推成螢光粉
    const paint = new THREE.MeshPhysicalMaterial({
      color: 0x8a0e22, metalness: 0.35, roughness: 0.3,
      clearcoat: 1.0, clearcoatRoughness: 0.12,
      envMap, envMapIntensity: 1.35,
    });
    const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.6, roughness: 0.45 });
    // 座艙玻璃提亮 + 強反射:與暗紅車漆拉出 greenhouse 兩噸色,車身三段式輪廓才讀得出來
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x18324a, metalness: 0.9, roughness: 0.06,
      envMap, envMapIntensity: 3.0,
    });

    // 車身:側面輪廓 extrude → 低趴超跑型 (車頂壓低至 ~1.05m,含 bevel)
    // 底線抬到 0.32 (含 bevel 後底盤離地 ~0.12),讓輪子下半露出來
    const shape = new THREE.Shape();
    shape.moveTo(-2.18, 0.4);
    shape.lineTo(-2.25, 0.52);
    shape.quadraticCurveTo(-2.22, 0.62, -1.85, 0.66);  // 車尾
    shape.quadraticCurveTo(-1.05, 0.7, -0.72, 0.82);   // C柱
    shape.quadraticCurveTo(-0.08, 0.92, 0.45, 0.8);    // 車頂→A柱
    shape.quadraticCurveTo(1.05, 0.62, 1.7, 0.52);     // 引擎蓋
    shape.quadraticCurveTo(2.2, 0.44, 2.25, 0.34);     // 車頭
    shape.lineTo(2.22, 0.38);
    shape.quadraticCurveTo(1.2, 0.32, 0, 0.32);
    shape.quadraticCurveTo(-1.2, 0.32, -2.18, 0.4);
    const bodyGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.9, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.2, bevelSegments: 4,
    });
    bodyGeo.translate(0, 0, -0.95);          // 車寬置中 (bevel 沿 depth 對稱)
    bodyGeo.rotateY(-Math.PI / 2);           // shape +x(車頭) → 世界 +z
    // 沿車長方向做車寬 taper:車頭收窄至 0.82、車尾 0.88、中段最寬 → 正後方能讀出弧線
    {
      const posAttr = bodyGeo.attributes.position;
      const halfLen = 2.45;
      for (let i = 0; i < posAttr.count; i++) {
        const z = posAttr.getZ(i);
        const zn = THREE.MathUtils.clamp(z / halfLen, -1, 1);
        const scale = zn >= 0
          ? 1 - 0.18 * Math.pow(zn, 1.6)
          : 1 - 0.12 * Math.pow(-zn, 1.6);
        posAttr.setX(i, posAttr.getX(i) * scale);
      }
      posAttr.needsUpdate = true;
    }
    const body = new THREE.Mesh(bodyGeo, paint);
    body.castShadow = true;
    car.add(body);

    // 後輪拱外擴 (超跑腰身):抬到輪頂當 fender flare,不再整片蓋住後輪側面
    const archGeo = new THREE.SphereGeometry(1, 14, 10);
    for (const sx of [1, -1]) {
      const arch = new THREE.Mesh(archGeo, paint);
      arch.scale.set(0.22, 0.26, 0.85);
      arch.position.set(sx * 0.95, 0.68, -1.45);
      arch.castShadow = true;
      car.add(arch);
    }

    // 座艙玻璃 (低趴長橢圓座艙罩)
    const cabinGeo = new THREE.SphereGeometry(0.78, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    cabinGeo.scale(0.95, 0.55, 1.5);
    const cabin = new THREE.Mesh(cabinGeo, glass);
    cabin.position.set(0, 0.66, -0.12);
    car.add(cabin);

    // 前下擾流 + 後擾流翼
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.09, 0.5), darkTrim);
    splitter.position.set(0, 0.16, 2.28);
    car.add(splitter);
    const wingPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.18), darkTrim);
    wingPost.position.set(0.55, 0.84, -2.08); car.add(wingPost);
    const wingPost2 = wingPost.clone(); wingPost2.position.x = -0.55; car.add(wingPost2);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.42), paint);
    wing.position.set(0, 1.0, -2.12); wing.rotation.x = -0.12;
    wing.castShadow = true;
    car.add(wing);

    // 頭燈 (縮小燈殼、交給 ACES 收斂高光,不再 toneMapped:false 炸 bloom)
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 1.4 });
    const headGeo = new THREE.BoxGeometry(0.3, 0.08, 0.05);
    for (const sx of [0.55, -0.55]) {
      const h = new THREE.Mesh(headGeo, headMat);
      h.position.set(sx, 0.44, 2.34);
      h.rotation.z = sx > 0 ? -0.18 : 0.18;
      car.add(h);
    }
    // 頭燈 flare sprite:正對鏡頭時才亮起的銳利光點 (取代大白斑)
    this.flareMat = new THREE.SpriteMaterial({
      map: getFlareTexture(), color: 0xd8ecff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (const sx of [0.55, -0.55]) {
      const flare = new THREE.Sprite(this.flareMat);
      flare.scale.set(0.3, 0.3, 1);
      flare.position.set(sx, 0.46, 2.42);
      // opacity 隨 dot(車頭方向, 車→鏡頭方向) 衰減:背對鏡頭時淡出;
      // 鏡頭貼近 (<8m) 再線性淡出,避免 bloom 疊成一團白牆吞掉車體
      flare.onBeforeRender = (renderer, scene, camera) => {
        _flareFwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        camera.getWorldPosition(_flareCam).sub(this.pos);
        const dist = _flareCam.length();
        _flareCam.normalize();
        const d = _flareFwd.dot(_flareCam);
        const distFade = THREE.MathUtils.clamp((dist - 3) / 5, 0, 1);
        this.flareMat.opacity = d > 0.05 ? Math.pow(d, 2.2) * 0.3 * distFade : 0;
      };
      car.add(flare);
    }

    // 尾燈組:左右主燈 + 中央細連接條 + 倒車燈 + 黑色 diffuser (超跑車尾圖形語彙)
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 1.6 });
    this.tailMat = tailMat;
    const tailMainGeo = new THREE.BoxGeometry(0.55, 0.1, 0.06);
    for (const sx of [0.62, -0.62]) {
      const lamp = new THREE.Mesh(tailMainGeo, tailMat);
      lamp.position.set(sx, 0.58, -2.42);
      car.add(lamp);
      this.brakeLight = lamp; // 保留欄位相容 (共用 tailMat)
    }
    const tailMidMat = new THREE.MeshStandardMaterial({ color: 0x2a0006, emissive: 0xff1a2e, emissiveIntensity: 0.8 });
    this.tailMidMat = tailMidMat;
    const tailMid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 0.05), tailMidMat);
    tailMid.position.set(0, 0.58, -2.42);
    car.add(tailMid);
    // 倒車燈 (小顆白點)
    const reverseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 0.5 });
    const reverseGeo = new THREE.BoxGeometry(0.1, 0.08, 0.05);
    for (const sx of [0.34, -0.34]) {
      const rv = new THREE.Mesh(reverseGeo, reverseMat);
      rv.position.set(sx, 0.46, -2.4);
      car.add(rv);
    }
    // 黑色 diffuser:5 片垂直鰭片
    const finGeo = new THREE.BoxGeometry(0.06, 0.16, 0.26);
    for (let i = -2; i <= 2; i++) {
      const fin = new THREE.Mesh(finGeo, darkTrim);
      fin.position.set(i * 0.32, 0.2, -2.28);
      car.add(fin);
    }

    // 底盤氛圍燈 (青色 underglow):橢圓漸層貼圖,中心亮邊緣零,任何視角不露幾何邊
    const glowGeo = new THREE.PlaneGeometry(1.9, 3.8);
    const glowMat = new THREE.MeshBasicMaterial({
      map: getGroundGlowTexture(), color: 0x1ad2ff, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    car.add(glow);
    this.underglow = glow;

    // 車頭燈光束 (真實 SpotLight ×2,angle 放寬讓路緣護欄也接到光)
    this.headlights = [];
    for (const sx of [0.55, -0.55]) {
      const spot = new THREE.SpotLight(0xdfeeff, 260, 70, 0.55, 0.55, 1.6);
      spot.position.set(sx, 0.6, 2.1);
      const tgt = new THREE.Object3D();
      tgt.position.set(sx * 0.5, 0.1, 30);
      car.add(tgt);
      spot.target = tgt;
      car.add(spot);
      this.headlights.push(spot);
    }

    // 車輪 (加大 + 外推,露出車側;搭配抬高的底盤,側視能讀出完整輪子)
    this.wheels = [];
    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 22);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.92 });
    const rimGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.32, 12);
    rimGeo.rotateZ(Math.PI / 2);
    // 前後輪分開材質:後輪煞車時 emissive 轉紅橙 (熱碟);emissive 提亮讓夜裡輪圈讀得出來
    const rimMatFront = new THREE.MeshStandardMaterial({
      color: 0xb8bec8, metalness: 0.95, roughness: 0.25,
      emissive: 0x2a3038, emissiveIntensity: 1.0, envMap, envMapIntensity: 1.2,
    });
    const rimMatRear = rimMatFront.clone();
    this.rimMatRear = rimMatRear;
    this._rimBaseEmissive = new THREE.Color(0x2a3038);
    this._rimHotEmissive = new THREE.Color(0xff5522);
    // 拋光輪唇 (torus 亮邊,鏡面反射讀點)
    const lipGeo = new THREE.TorusGeometry(0.34, 0.032, 8, 22);
    lipGeo.rotateY(Math.PI / 2);
    const lipMat = new THREE.MeshStandardMaterial({
      color: 0xdde4ee, metalness: 1.0, roughness: 0.08, envMap, envMapIntensity: 1.6,
    });
    const positions = [
      [0.98, 0.42, 1.5, true], [-0.98, 0.42, 1.5, true],     // 前輪(可轉向)
      [0.98, 0.42, -1.45, false], [-0.98, 0.42, -1.45, false],
    ];
    // 輪拱陰影井:每個輪位車身側面一塊深色內凹板,給輪子黑色背景襯托
    const wellGeo = new THREE.BoxGeometry(0.26, 0.55, 0.95);
    for (const [x, , z] of positions) {
      const well = new THREE.Mesh(wellGeo, darkTrim);
      well.position.set(Math.sign(x) * 0.97, 0.44, z); // 外面 1.10,略縮在胎面 1.13 之內
      car.add(well);
    }
    for (const [x, y, z, steerable] of positions) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(x, y, z);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      const rim = new THREE.Mesh(rimGeo, steerable ? rimMatFront : rimMatRear);
      const lip = new THREE.Mesh(lipGeo, lipMat);
      tire.castShadow = true;
      const spinner = new THREE.Group();
      spinner.add(tire, rim, lip);
      wheelGroup.add(spinner);
      car.add(wheelGroup);
      this.wheels.push({ group: wheelGroup, spinner, steerable });
    }

    // 頭燈光池:車前貼地拉長橢圓漸層 quad (additive),保證任何視角都讀得出頭燈打在路面上。
    // 掛在獨立 group (跟 heading + visualYaw,不跟車身 roll/pitch,避免貼地面被抬離地)
    const poolGroup = new THREE.Group();
    const poolMat = new THREE.MeshBasicMaterial({
      map: getGroundGlowTexture(), color: 0xbfd8f4, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 13), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.06, 13.5);   // 覆蓋車前約 7–20m
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
    // 阻力
    accel -= vF * Math.abs(vF) * TUNE.drag;
    accel -= Math.sign(vF) * TUNE.rollingResist * Math.min(1, Math.abs(vF));
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
    const speedFactor = THREE.MathUtils.clamp(Math.abs(vF) / 14, 0, 1);
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
    const limit = WALL_HALF_WIDTH - TUNE.carHalfWidth;
    if (Math.abs(q.lateral) > limit) {
      const overshoot = Math.abs(q.lateral) - limit;
      const dir = Math.sign(q.lateral);
      // 推回牆內
      this.pos.x -= q.normal.x * dir * overshoot;
      this.pos.z -= q.normal.z * dir * overshoot;
      // 法向速度反彈衰減,切向保留大部分 (刮牆滑行)
      const n = new THREE.Vector3(q.normal.x * dir, 0, q.normal.z * dir);
      const vn = this.vel.dot(n);
      if (vn > 0) {
        this.vel.addScaledVector(n, -vn * (1 + TUNE.wallRestitution));
        this.vel.multiplyScalar(0.92); // 撞牆整體損失
        this.collisionImpulse = Math.min(1, vn / 15);
        // 車頭順牆
        const wallTan = new THREE.Vector3(q.tangent.x, 0, q.tangent.z);
        const headingVec = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        const align = headingVec.dot(wallTan);
        const targetHeading = Math.atan2(wallTan.x * Math.sign(align || 1), wallTan.z * Math.sign(align || 1));
        let dh = targetHeading - this.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        this.heading += dh * Math.min(1, vn / 12) * 0.25; // 輕推順牆,避免卡牆震盪
      }
    }
    this.lateral = q.lateral;
    this.progress = q.s;

    // ---- 逆走偵測 ----
    const fwdDot = this.vel.length() > 4
      ? (this.vel.x * q.tangent.x + this.vel.z * q.tangent.z) / this.vel.length()
      : 1;
    this.wrongWay = fwdDot < -0.35 && this.vel.length() > 4;

    // ---- 視覺 ----
    this.wheelSpin += (vF / 0.42) * dt;
    this._syncMesh(dt);

    // 煞車燈 (emissive 收斂,ACES 管理高光,不再炸成一團)
    const braking = brake || handbrake;
    this.tailMat.emissiveIntensity = braking ? 4.5 : 1.6;
    this.tailMidMat.emissiveIntensity = braking ? 2.2 : 0.8;
    // 後輪熱碟:煞車時 rim emissive 漸轉紅橙
    const heatTarget = (braking && Math.abs(vF) > 6) ? 1 : 0;
    this.rimHeat += (heatTarget - this.rimHeat) * Math.min(1, dt * 3.5);
    this.rimMatRear.emissive.lerpColors(this._rimBaseEmissive, this._rimHotEmissive, this.rimHeat);
    this.rimMatRear.emissiveIntensity = 1.0 + this.rimHeat * 1.1;
    this.underglow.material.opacity = 0.15 + this.driftAmount * 0.3 + this.throttleSmooth * 0.08;
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
