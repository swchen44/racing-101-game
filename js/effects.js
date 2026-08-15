// effects.js — 後製 (bloom + 色彩分級) 、胎痕、輪胎煙、撞牆火花、雨絲、速度線
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { radialGlowTexture } from './taipei101.js';
import { WALL_HALF_WIDTH } from './track.js';

// 超輕量全螢幕色彩分級:暗部壓藍紫、高光偏暖、飽和 +13%、vignette、
// 高速時畫面外圈徑向模糊 (uSpeed 0..1,同一個 fullscreen pass,零額外成本)
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSpeed;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      // 廉價徑向模糊:只作用在畫面外圈,速度感隨 uSpeed 增強
      vec2 dir = vUv - 0.5;
      float d = length(dir);
      float blurW = smoothstep(0.30, 0.80, d) * uSpeed;
      if (blurW > 0.003) {
        vec2 stp = dir * (0.030 * uSpeed);
        vec3 acc = c;
        acc += texture2D(tDiffuse, vUv - stp).rgb;
        acc += texture2D(tDiffuse, vUv - stp * 2.0).rgb;
        acc += texture2D(tDiffuse, vUv - stp * 3.0).rgb;
        acc += texture2D(tDiffuse, vUv - stp * 4.0).rgb;
        c = mix(c, acc * 0.2, blurW);
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // 暗部收緊並往藍紫壓 (夜色底色 #0a0d1a),黑位仍保留一絲可讀 lift
      float sh = 1.0 - smoothstep(0.0, 0.35, l);
      c = mix(c, c * vec3(0.86, 0.90, 1.16) + vec3(0.008, 0.010, 0.026), sh);
      // 高光偏暖 (鈉燈/霓虹城市光害) — teal-orange 對抗
      c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.90), smoothstep(0.5, 2.0, l));
      // 飽和度 +13%
      l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.13);
      // 四角 vignette (角落乘至 ~0.72)
      float dv = length(vUv - 0.5);
      c *= 1.0 - 0.28 * smoothstep(0.40, 0.82, dv);
      gl_FragColor = vec4(c, tex.a);
    }`,
};

// 絮狀煙貼圖:數個偏移軟圓斑疊成的噪點 puff (一次生成,取代純圓形光暈)
let _smokeTex = null;
function smokePuffTexture() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const blobs = [
    [64, 62, 44, 0.50], [44, 50, 26, 0.40], [86, 54, 24, 0.42],
    [54, 86, 25, 0.38], [84, 84, 20, 0.36], [66, 40, 16, 0.30],
  ];
  for (const [x, y, r, a] of blobs) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.4})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  _smokeTex = new THREE.CanvasTexture(c);
  return _smokeTex;
}

export class Effects {
  constructor(renderer, scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    // threshold 拉高避免起跑門/頭燈整片爆白,strength/radius 補回霓虹與光柱的柔光
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this._initSkidMarks();
    this._initSmoke();
    this._initSparks();
    this._initRain();
    this._initSpeedStreaks();
  }

  setSize(w, h) { this.composer.setSize(w, h); }
  render(dt) { this.composer.render(dt); }

  // ---------- 胎痕 ----------
  _initSkidMarks() {
    this.skidMax = 600;
    this.skidGeo = new THREE.PlaneGeometry(0.3, 1);   // 寬 0.3 貼合輪胎;長度用 scale.z 拉伸
    this.skidGeo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    this.skidInst = new THREE.InstancedMesh(this.skidGeo, mat, this.skidMax);
    this.skidInst.count = 0;
    this.skidInst.frustumCulled = false;
    this.skidCursor = 0;
    // instanceColor:新 stamp 近黑,隨時間 lerp 向柏油色 → 胎痕會逐漸褪色
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < this.skidMax; i++) this.skidInst.setColorAt(i, white);
    // 注意:instanceColor 是線性空間,要壓得夠黑才會比夜間柏油暗
    this._skidFresh = new THREE.Color(0.010, 0.011, 0.014);
    this._skidFadeTarget = [0.045, 0.05, 0.065]; // 淡向柏油色 → 視覺上褪色
    this.scene.add(this.skidInst);
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._v3a = new THREE.Vector3();
    this._v3s = new THREE.Vector3(1, 1, 1);
  }

  // 沿速度方向對齊 + 依每幀移動距離拉長,stamp 首尾相接無縫
  addSkid(x, z, dirAngle, len) {
    this._q.setFromAxisAngle(this._up, dirAngle);
    this._v3s.set(1, 1, len);
    this._m4.compose(this._v3a.set(x, 0.02, z), this._q, this._v3s);
    const idx = this.skidCursor % this.skidMax;
    this.skidInst.setMatrixAt(idx, this._m4);
    this.skidInst.setColorAt(idx, this._skidFresh);
    this.skidCursor++;
    this.skidInst.count = Math.min(this.skidCursor, this.skidMax);
    this.skidInst.instanceMatrix.needsUpdate = true;
    this.skidInst.instanceColor.needsUpdate = true;
  }

  // ---------- 輪胎煙 (深藍灰絮狀煙 + 尾燈紅 tint,夜景光照邏輯) ----------
  _initSmoke() {
    this.smokeMax = 90;
    this.smokes = [];
    this.smokeTimer = 0;                       // spawn 節流 (每 0.035s 一組,不再每幀必噴)
    this._smokeBase = new THREE.Color(0x232a38);   // 吃環境色的深藍灰
    this._smokeTail = new THREE.Color(0xff2038);   // 尾燈紅 (靠近車尾的煙被染紅)
    this._smokeRear = new THREE.Vector3();
    const tex = smokePuffTexture();
    for (let i = 0; i < this.smokeMax; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.NormalBlending, color: 0x232a38, rotation: 0,
      }));
      sprite.visible = false;
      this.scene.add(sprite);
      this.smokes.push({ sprite, life: 0, maxLife: 1, rotSpd: 0, vel: new THREE.Vector3() });
    }
    this.smokeCursor = 0;
  }

  addSmoke(x, z, vx, vz) {
    const s = this.smokes[this.smokeCursor % this.smokeMax];
    this.smokeCursor++;
    s.life = 0.5 + Math.random() * 0.35;
    s.maxLife = s.life;
    s.rotSpd = (Math.random() - 0.5) * 2.4;
    s.sprite.visible = true;
    s.sprite.material.rotation = Math.random() * Math.PI * 2;
    s.sprite.position.set(x + (Math.random() - 0.5) * 0.5, 0.28, z + (Math.random() - 0.5) * 0.5);
    s.sprite.scale.setScalar(0.9 + Math.random() * 0.5);
    s.vel.set(vx * 0.3 + (Math.random() - 0.5) * 1.4, 0.9 + Math.random() * 1.0, vz * 0.3 + (Math.random() - 0.5) * 1.4);
  }

  // ---------- 火花 ----------
  _initSparks() {
    this.sparkMax = 70;
    this.sparks = [];
    const tex = radialGlowTexture('#ffcf7a');
    for (let i = 0; i < this.sparkMax; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      sprite.visible = false;
      this.scene.add(sprite);
      this.sparks.push({ sprite, life: 0, vel: new THREE.Vector3() });
    }
    this.sparkCursor = 0;
  }

  burstSparks(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.sparkCursor % this.sparkMax];
      this.sparkCursor++;
      s.life = 0.25 + Math.random() * 0.35;
      s.maxLife = s.life;
      s.sprite.visible = true;
      s.sprite.position.set(x, y + Math.random() * 0.6, z);
      s.sprite.scale.setScalar(0.25 + Math.random() * 0.3);
      s.vel.set((Math.random() - 0.5) * 14, Math.random() * 6, (Math.random() - 0.5) * 14);
    }
  }

  // ---------- 雨 (LineSegments 雨絲,拉長 + 淡青色 + 高度漸淡,不像頭皮屑) ----------
  _initRain() {
    this.rainCount = 980;
    this.rainSpan = 90;
    this.rainHeight = 45;
    this.rainDrops = new Float32Array(this.rainCount * 4); // x, y, z, fallSpeed
    this.rainBright = new Float32Array(this.rainCount);    // 每滴隨機亮度 (0.35~1)
    for (let i = 0; i < this.rainCount; i++) {
      this.rainDrops[i * 4] = (Math.random() - 0.5) * this.rainSpan;
      this.rainDrops[i * 4 + 1] = Math.random() * this.rainHeight;
      this.rainDrops[i * 4 + 2] = (Math.random() - 0.5) * this.rainSpan;
      this.rainDrops[i * 4 + 3] = 26 + Math.random() * 9; // 25~35 m/s 下落
      this.rainBright[i] = 0.35 + Math.random() * 0.65;
    }
    const pos = new Float32Array(this.rainCount * 2 * 3);
    const col = new Float32Array(this.rainCount * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xa8c8e0, transparent: true, opacity: 0.38, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  // ---------- 速度線 (細長 additive quad,高 DPI 也看得見;單一 draw call) ----------
  _initSpeedStreaks() {
    this.streakCount = 48;
    this.streakPts = [];
    for (let i = 0; i < this.streakCount; i++) this.streakPts.push(this._streakSpawn());
    const pos = new Float32Array(this.streakCount * 4 * 3);
    const idx = new Uint16Array(this.streakCount * 6);
    for (let i = 0; i < this.streakCount; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v + 2; idx[o + 4] = v + 1; idx[o + 5] = v + 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.streaks = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x93aed0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    this.scene.add(this.streaks);
    this._sv1 = new THREE.Vector3();
    this._sv2 = new THREE.Vector3();
  }

  _streakSpawn(ahead) {
    // 相機周圍圓環分布,避開正中央
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + Math.random() * 6;
    return new THREE.Vector3(
      Math.cos(a) * r,
      -0.5 + Math.random() * 5,
      Math.sin(a) * r,
    ).add(ahead || new THREE.Vector3());
  }

  update(dt, car, camPos, t, input) {
    // 徑向模糊強度 (餵給 GradeShader,速度感)
    {
      const kmh = car ? car.speedKmh : 0;
      const target = THREE.MathUtils.clamp((kmh - 70) / 110, 0, 1) * 0.85;
      const u = this.grade.uniforms.uSpeed;
      u.value += (target - u.value) * Math.min(1, dt * 4);
    }
    // 煙:緩慢自轉、深藍灰基色、靠近車尾被尾燈染紅
    if (car) {
      const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading);
      this._smokeRear.set(car.pos.x - sinH * 2.2, 0.5, car.pos.z - cosH * 2.2);
    }
    for (const s of this.smokes) {
      if (!s.sprite.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sprite.visible = false; continue; }
      s.sprite.position.addScaledVector(s.vel, dt);
      s.sprite.scale.multiplyScalar(1 + dt * 1.4);
      s.sprite.material.rotation += s.rotSpd * dt;
      const lifeRatio = s.life / s.maxLife;
      s.sprite.material.opacity = lifeRatio * 0.3;
      // 尾燈染煙:距車尾 3.5m 內 lerp 向紅,離開後回深藍灰
      let tint = 0;
      if (car) {
        const d2 = s.sprite.position.distanceToSquared(this._smokeRear);
        tint = Math.max(0, 1 - d2 / 12.25) * 0.65 * lifeRatio;
      }
      s.sprite.material.color.copy(this._smokeBase).lerp(this._smokeTail, tint);
    }
    // 胎痕時間褪色:向濕柏油色 lerp,舊痕逐漸融回路面
    if (this.skidInst.count > 0) {
      const arr = this.skidInst.instanceColor.array;
      const k = Math.min(1, dt * 0.055);
      const [tr, tg, tb] = this._skidFadeTarget;
      for (let i = 0, n = this.skidInst.count * 3; i < n; i += 3) {
        arr[i] += (tr - arr[i]) * k;
        arr[i + 1] += (tg - arr[i + 1]) * k;
        arr[i + 2] += (tb - arr[i + 2]) * k;
      }
      this.skidInst.instanceColor.needsUpdate = true;
    }
    // 火花
    for (const s of this.sparks) {
      if (!s.sprite.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sprite.visible = false; continue; }
      s.vel.y -= 22 * dt;
      s.sprite.position.addScaledVector(s.vel, dt);
      s.sprite.material.opacity = (s.life / s.maxLife);
    }
    // 車輛驅動的粒子
    if (car) {
      const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
      const spd = Math.hypot(car.vel.x, car.vel.z);
      // 甩尾煙/胎痕:drifting 或手煞中速滑行觸發
      const driftFx = (car.drifting || (input && input.handbrake && Math.abs(car.speed) > 10))
        && Math.abs(car.speed) > 6;
      this.smokeTimer -= dt;
      if (driftFx) {
        // 胎痕沿速度向量對齊 + 依每幀位移拉長 → 連續無縫弧線
        const velAngle = spd > 1 ? Math.atan2(car.vel.x, car.vel.z) : car.heading;
        const stampLen = THREE.MathUtils.clamp(spd * dt * 2.2, 0.9, 2.2);
        for (const sx of [0.86, -0.86]) {
          // 後輪局部座標 (sx, 0, -1.42) 旋轉至世界座標
          const bx = car.pos.x + sx * cos + (-1.42) * sin;
          const bz = car.pos.z - sx * sin + (-1.42) * cos;
          this.addSkid(bx, bz, velAngle, stampLen);
          // 煙:節流 spawn;低速 (<15km/h) 不噴,避免原地堆成白棉花
          if (this.smokeTimer <= 0 && car.speedKmh > 15) {
            this.addSmoke(bx, bz, car.vel.x, car.vel.z);
          }
        }
        if (this.smokeTimer <= 0) this.smokeTimer = 0.035;
      }
      // 瞬間撞擊火花
      if (car.collisionImpulse > 0.35) {
        this.burstSparks(car.pos.x + sin * 1.5, 0.5, car.pos.z + cos * 1.5, 10);
        car.collisionImpulse *= 0.4;
      }
      // 持續刮牆火花:貼著護欄且有速度時,在車側接觸點連續冒火花
      const scrapeLimit = WALL_HALF_WIDTH - 1.02 - 0.15;
      if (car.lateral !== undefined && Math.abs(car.lateral) > scrapeLimit
        && car.speedKmh > 15 && Math.random() < 0.3) {
        const sgn = Math.sign(car.lateral);
        // 車輛局部 +x 為左側;lateral 左正 → 接觸側 = 局部 x 軸 * sgn
        const cx2 = car.pos.x + cos * sgn * 1.05;
        const cz2 = car.pos.z - sin * sgn * 1.05;
        this.burstSparks(cx2, 0.35, cz2, 2);
      }
    }
    // 雨:跟著攝影機平移,雨絲沿 (下落 + 車速反向) 拉長 2-3 倍,天空區域淡出
    if (this.rain && camPos) {
      this.rain.position.set(camPos.x, 0, camPos.z);
      const vx = car ? car.vel.x : 0;
      const vz = car ? car.vel.z : 0;
      const spd = Math.hypot(vx, vz);
      const len = Math.min(2.6, 1.5 + spd * 0.02); // 1.5~2.6m 長雨絲
      // 表觀運動方向 = 下落 − 相機速度
      let mx = -vx * 0.6, my = -30, mz = -vz * 0.6;
      const mInv = len / Math.hypot(mx, my, mz);
      mx *= mInv; my *= mInv; mz *= mInv;
      const arr = this.rain.geometry.attributes.position.array;
      const colArr = this.rain.geometry.attributes.color.array;
      const drops = this.rainDrops;
      const invH = 1 / this.rainHeight;
      for (let i = 0; i < this.rainCount; i++) {
        let y = drops[i * 4 + 1] - drops[i * 4 + 3] * dt;
        if (y < 0) {
          y += this.rainHeight;
          drops[i * 4] = (Math.random() - 0.5) * this.rainSpan;
          drops[i * 4 + 2] = (Math.random() - 0.5) * this.rainSpan;
        }
        drops[i * 4 + 1] = y;
        const x = drops[i * 4], z = drops[i * 4 + 2];
        const o = i * 6;
        arr[o] = x; arr[o + 1] = y; arr[o + 2] = z;
        arr[o + 3] = x - mx; arr[o + 4] = y - my; arr[o + 5] = z - mz;
        // 亮度 = 每滴隨機 × 高度漸淡 (路面附近密、天空稀)
        const b = this.rainBright[i] * (1 - y * invH * 0.72);
        colArr[o] = b; colArr[o + 1] = b; colArr[o + 2] = b;
        colArr[o + 3] = b; colArr[o + 4] = b; colArr[o + 5] = b;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.geometry.attributes.color.needsUpdate = true;
    }
    // 速度線 (90 km/h 起淡入,細長 additive 面片朝向鏡頭)
    if (this.streaks && camPos) {
      const kmh = car ? car.speedKmh : 0;
      const target = THREE.MathUtils.clamp((kmh - 95) / 80, 0, 1) * 0.55;
      const mat = this.streaks.material;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 6);
      this.streaks.visible = mat.opacity > 0.01;
      if (this.streaks.visible && car) {
        this.streaks.position.set(camPos.x, camPos.y, camPos.z);
        const spd = Math.max(0.001, Math.hypot(car.vel.x, car.vel.z));
        const dx = car.vel.x / spd, dz = car.vel.z / spd;
        const sLen = Math.min(5, 1.6 + spd * 0.055);
        const arr = this.streaks.geometry.attributes.position.array;
        for (let i = 0; i < this.streakCount; i++) {
          const p = this.streakPts[i];
          // 世界靜止的線在相機座標中往後掠過
          p.x -= car.vel.x * dt * 1.5;
          p.z -= car.vel.z * dt * 1.5;
          const along = p.x * dx + p.z * dz;
          if (along < -22) {
            this.streakPts[i] = this._streakSpawn(this._sv2.set(dx * 25, 0, dz * 25));
          }
          // 寬度方向 = streak 方向 (dx,0,dz) × 相機→點向量 p → 面片永遠側對鏡頭可見
          const w = this._sv1.set(-dz * p.y, dz * p.x - dx * p.z, dx * p.y);
          const wl = w.length();
          if (wl > 0.0001) w.multiplyScalar(0.035 / wl); else w.set(0, 0.035, 0);
          const o = i * 12;
          arr[o] = p.x + w.x; arr[o + 1] = p.y + w.y; arr[o + 2] = p.z + w.z;
          arr[o + 3] = p.x - w.x; arr[o + 4] = p.y - w.y; arr[o + 5] = p.z - w.z;
          arr[o + 6] = p.x - dx * sLen + w.x; arr[o + 7] = p.y + w.y; arr[o + 8] = p.z - dz * sLen + w.z;
          arr[o + 9] = p.x - dx * sLen - w.x; arr[o + 10] = p.y - w.y; arr[o + 11] = p.z - dz * sLen - w.z;
        }
        this.streaks.geometry.attributes.position.needsUpdate = true;
      }
    }
  }
}
