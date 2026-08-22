// vehicle.js — 車輛物理 (自訂街機物理 + 手自排變速箱);車模建構分派至 cars/
import * as THREE from 'three';
import { ROAD_HALF_WIDTH, WALL_HALF_WIDTH } from './track.js';
import { CAR_BUILDERS } from './cars/index.js';

export const DEFAULT_TUNE = {
  maxSpeed: 62,          // m/s
  maxReverse: 12,
  engineForce: 19,       // m/s^2 等效加速度(低速)
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
  gears: 6,              // 檔位數 (1 = 電動單速)
  evTorque: false,       // true = 電動平坦扭力曲線
};

export class Car {
  // carDef: config.js CARS 的一項;opts.transmission: 'auto' | 'manual'
  constructor(track, carDef = null, opts = {}) {
    this.track = track;
    this.def = carDef;
    this.tune = { ...DEFAULT_TUNE, ...(carDef?.tune || {}) };
    this.transmission = opts.transmission || 'auto';
    // 極速正規化:把空氣阻力係數解成「全油門恰好在 tune.maxSpeed 達到終端速度」,
    // 讓實際極速與選單標示一致 (原固定 drag 讓所有車都停在 ~140 km/h)
    {
      const tfTop = this.tune.evTorque ? 0.78 : 0.95;
      const thrustTop = this.tune.engineForce * 0.35 * tfTop;
      this.dragEff = Math.max(0.0004,
        (thrustTop - this.tune.rollingResist * 0.35) / (this.tune.maxSpeed * this.tune.maxSpeed));
    }
    const builder = CAR_BUILDERS[carDef?.builder] || CAR_BUILDERS.gt;
    // 玩家車生成駕駛艙內裝 (opts.cockpit === false 可關閉,如幽靈車)
    const { mesh, parts } = builder({ ...(carDef || {}), _cockpit: opts.cockpit !== false });
    this.mesh = mesh;
    Object.assign(this, parts);   // bodyGroup, wheels, tailMat?, underglow?, headlights, headlightPool?, rimMatRear?, wheelRadius
    this.wheelRadius = this.wheelRadius || 0.48;
    this._rimBaseEmissive = new THREE.Color(0x76828f);
    this._rimHotEmissive = new THREE.Color(0xff5522);
    this.reset();
  }

  reset() {
    const sm = this.track.samples[this.track.samples.length - 12];
    this.pos = new THREE.Vector3(sm.pos.x, 0, sm.pos.z);
    this.heading = Math.atan2(sm.tan.x, sm.tan.z);
    this.vel = new THREE.Vector3();
    this.steer = 0;
    this.speed = 0;
    this.drifting = false;
    this.driftAmount = 0;
    this.lateralVel = 0;
    this.visualYaw = 0;
    this.rimHeat = 0;
    this.trackHint = this.track.nearest(this.pos, -1);
    this.progress = this.track.query(this.pos, this.trackHint).s;
    this.lateral = 0;
    this.wrongWay = false;
    this.collisionImpulse = 0;
    this.throttleSmooth = 0;
    this.wheelSpin = 0;
    this.gear = 1;
    this.rpm = 0;
    this.revLimiter = false;
    this.boostsLeft = 3;   // 每場 3 次 Boost
    this.boostT = 0;       // 剩餘秒數
    this.boosting = false;
    this._syncMesh(0);
  }

  // Boost:瞬間加速 5 秒,極速上限翻倍。回傳是否成功啟動
  tryBoost() {
    if (this.boostsLeft <= 0 || this.boostT > 0) return false;
    this.boostsLeft--;
    this.boostT = 5;
    return true;
  }

  // ---------- 變速箱 ----------
  // 檔位 g 的極速 (m/s):線性分配,末檔 = maxSpeed
  gearTopSpeed(g) {
    const N = this.tune.gears;
    if (N <= 1) return this.tune.maxSpeed;
    // 一檔約 22% 極速,之後均分
    return this.tune.maxSpeed * (0.22 + 0.78 * ((g - 1) / (N - 1)));
  }

  // 扭力係數:引擎車峰值在 ~0.8 rpm;電動車低轉滿扭力
  _torqueFactor(rpm) {
    if (this.tune.evTorque) return 1.0 - 0.22 * rpm;
    return 0.45 + 1.35 * rpm - 0.85 * rpm * rpm; // 0→0.45, 0.8→1.0, 1.0→0.95
  }

  shiftUp() {
    if (this.gear < this.tune.gears) { this.gear++; return true; }
    return false;
  }
  shiftDown() {
    if (this.gear > 1) { this.gear--; return true; }
    return false;
  }

  update(dt, input) {
    const t = this.tune;
    // ---- 輸入 ----
    const throttle = input.forward ? 1 : 0;
    const brake = input.backward ? 1 : 0;
    const handbrake = input.handbrake;
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);

    // 手排換檔 / Boost (邊緣觸發旗標由 main 設置後清除)
    if (this.transmission === 'manual') {
      if (input.shiftUp) { this.shiftUp(); input.shiftUp = false; }
      if (input.shiftDown) { this.shiftDown(); input.shiftDown = false; }
    }
    if (input.boost) { input.boost = false; this.tryBoost(); }

    this.throttleSmooth += (throttle - this.throttleSmooth) * Math.min(1, dt * 6);

    // 轉向平滑 + 高速轉向衰減
    const steerLimit = t.steerMax / (1 + Math.abs(this.speed) * t.steerSpeedFalloff);
    const steerGoal = steerTarget * steerLimit;
    const steerRate = 4.2;
    this.steer += THREE.MathUtils.clamp(steerGoal - this.steer, -steerRate * dt, steerRate * dt);

    // ---- 前向/側向分解 ----
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let vF = this.vel.dot(fwd);
    let vL = this.vel.dot(right);

    // ---- Boost 狀態 ----
    this.boosting = this.boostT > 0;
    if (this.boosting) this.boostT = Math.max(0, this.boostT - dt);
    const boostMul = this.boosting ? 2 : 1;      // 極速上限 ×2
    const effMax = t.maxSpeed * boostMul;

    // ---- 變速箱狀態 ----
    const gearTop = this.gearTopSpeed(this.gear) * boostMul;
    this.rpm = THREE.MathUtils.clamp(Math.abs(vF) / gearTop, 0, 1.08);
    if (this.transmission === 'auto' && t.gears > 1) {
      if (this.rpm > 0.94 && this.gear < t.gears) this.gear++;
      else if (this.rpm < 0.42 && this.gear > 1) this.gear--;
    }
    // 斷油限速器:紅線後推力歸零 (手排不升檔就是撞牆聲);Boost 中不斷油
    this.revLimiter = this.rpm >= 1.0 && !this.boosting;

    // ---- 縱向力 ----
    const speedRatio = Math.max(0, 1 - Math.abs(vF) / effMax);
    let accel = 0;
    if (throttle && !this.revLimiter) {
      accel += t.engineForce * this._torqueFactor(Math.min(1, this.rpm)) * (0.35 + 0.65 * speedRatio);
    }
    // Boost 推進:額外直推 (受極速上限保護)
    if (this.boosting && vF < effMax) accel += 26;
    if (brake) {
      if (vF > 0.5) accel -= t.brakeForce;
      else accel -= t.engineForce * 0.5 * Math.max(0, 1 - Math.abs(vF) / t.maxReverse);
    }
    // 阻力 (正規化係數;貼牆/路緣時 rollingResist 打折,避免刮牆掉速後起步不了)
    accel -= vF * Math.abs(vF) * this.dragEff;
    const nearEdge = Math.abs(this.lateral ?? 0) > ROAD_HALF_WIDTH - 0.6;
    accel -= Math.sign(vF) * t.rollingResist * (nearEdge ? 0.35 : 1) * Math.min(1, Math.abs(vF));
    if (handbrake && vF > 2) accel -= 14;
    vF += accel * dt;
    if (!throttle && !brake && Math.abs(vF) < 0.4) vF = 0;

    // ---- 側向抓地 (drift 核心) ----
    const slip = Math.abs(vL);
    const wantDrift = handbrake || (slip > 6.5 && Math.abs(vF) > 18);
    const grip = wantDrift ? t.gripDrift : t.gripNormal;
    vL *= Math.max(0, 1 - grip * dt);
    this.drifting = slip > 3.2 && Math.abs(vF) > 8;
    this.driftAmount += ((this.drifting ? Math.min(1, slip / 12) : 0) - this.driftAmount) * Math.min(1, dt * 5);
    this.lateralVel = vL;

    // ---- 偏航 ----
    const speedFactor = THREE.MathUtils.clamp(0.3 + Math.abs(vF) / 14, 0, 1);
    let yawRate = this.steer * t.yawGain * speedFactor * Math.sign(vF || 1);
    if (wantDrift) yawRate *= t.driftYawBoost;
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
    const edgeLimit = ROAD_HALF_WIDTH - 0.6;
    if (Math.abs(q.lateral) > edgeLimit) {
      const over = Math.abs(q.lateral) - edgeLimit;
      const push = Math.min(4 * over, 9);
      const dirE = Math.sign(q.lateral);
      this.vel.x -= q.normal.x * dirE * push * dt;
      this.vel.z -= q.normal.z * dirE * push * dt;
    }
    const limit = WALL_HALF_WIDTH - t.carHalfWidth;
    if (Math.abs(q.lateral) > limit) {
      const overshoot = Math.abs(q.lateral) - limit;
      const dir = Math.sign(q.lateral);
      this.pos.x -= q.normal.x * dir * overshoot;
      this.pos.z -= q.normal.z * dir * overshoot;
      const n = new THREE.Vector3(q.normal.x * dir, 0, q.normal.z * dir);
      const vn = this.vel.dot(n);
      if (vn > 0) {
        this.vel.addScaledVector(n, -vn * (1 + t.wallRestitution));
        this.vel.multiplyScalar(0.9);
        this.collisionImpulse = Math.min(1, vn / 15);
      }
      // 車頭順牆:貼牆時無條件小幅修正,刮牆滑出而非釘死
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
    this.wheelSpin += (vF / this.wheelRadius) * dt;
    this._syncMesh(dt);

    // 煞車燈 / 熱碟 / underglow (車型可能缺件,全部 optional)
    const braking = brake || handbrake;
    if (this.tailMat) this.tailMat.emissiveIntensity = braking ? 4.5 : 1.6;
    if (this.tailMidMat) this.tailMidMat.emissiveIntensity = braking ? 2.2 : 0.8;
    if (this.rimMatRear) {
      const heatTarget = (braking && Math.abs(vF) > 6) ? 1 : 0;
      this.rimHeat += (heatTarget - this.rimHeat) * Math.min(1, dt * 3.5);
      this.rimMatRear.emissive.lerpColors(this._rimBaseEmissive, this._rimHotEmissive, this.rimHeat);
      this.rimMatRear.emissiveIntensity = 1.4 + this.rimHeat * 1.1;
    }
    if (this.underglow) {
      this.underglow.material.opacity = 0.09 + this.driftAmount * 0.22 + this.throttleSmooth * 0.05;
    }
  }

  _syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const slipYaw = -Math.atan2(this.lateralVel, Math.max(4, Math.abs(this.speed))) * 0.7;
    this.visualYaw += (slipYaw - this.visualYaw) * Math.min(1, dt * 8 + 0.001);
    this.bodyGroup.rotation.y = this.visualYaw;
    if (this.headlightPool) this.headlightPool.rotation.y = this.visualYaw;
    const rollTarget = -this.steer * Math.min(1, Math.abs(this.speed) / 22) * 0.09 - this.driftAmount * Math.sign(this.steer || 1) * -0.03;
    const pitchTarget = -this.throttleSmooth * 0.022 + (this.collisionImpulse || 0) * 0.03;
    this.bodyGroup.rotation.z += (rollTarget - this.bodyGroup.rotation.z) * Math.min(1, dt * 7 + 0.001);
    this.bodyGroup.rotation.x += (pitchTarget - this.bodyGroup.rotation.x) * Math.min(1, dt * 6 + 0.001);
    for (const w of this.wheels) {
      w.spinner.rotation.x = this.wheelSpin % (Math.PI * 2);
      if (w.steerable) w.group.rotation.y = this.steer * 0.85;
    }
    // 駕駛艙方向盤:放大轉角讓內視角看得出打方向 (約 ±100°)
    if (this.steeringWheel) this.steeringWheel.rotation.z = -this.steer * 2.8;
  }

  get speedKmh() { return Math.abs(this.speed) * 3.6; }
  get maxKmh() { return this.tune.maxSpeed * 3.6; }
}
