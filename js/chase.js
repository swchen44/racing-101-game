// chase.js — 緝凶追捕 THE CHASE
// 雙角色:role='cop'(玩家=警察,AI=小偷,玩家撞翻小偷) / role='thief'(玩家=小偷,AI=警車追撞玩家)
// 是 police.js 的鏡像,重用追蹤/PIT/碰撞;新增血量、翻車、受傷慌亂、難度分級。
import * as THREE from 'three';
import { CAR_BUILDERS } from './cars/index.js';
import { disposeObject } from './cars/common.js';
import { radialGlowTexture } from './taipei101.js';
import { chaseTune, CARS } from './config.js';
import { activeAudio } from './audio.js';

// AI 小偷可能開的贓車 (排除玩家警車;隨機一台)
const STOLEN_CARS = ['evsport', 'rally', 'evcity', 'suv', 'gt', 'pickup'];
export function randomStolenCarId() { return STOLEN_CARS[Math.floor(Math.random() * STOLEN_CARS.length)]; }

// 車頂警燈 (紅藍交替閃 + 光暈);回傳 { update(flash) } 供每幀閃爍。玩家警車與 AI 警車共用。
export function addPoliceLights(mesh) {
  const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2233, emissiveIntensity: 3 }));
  const barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x2266ff, emissiveIntensity: 3 }));
  barRed.position.set(-0.24, 1.42, -0.1);
  barBlue.position.set(0.24, 1.42, -0.1);
  mesh.add(barRed, barBlue);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialGlowTexture('#ff3355'), color: 0xff3355, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  glow.scale.setScalar(3.2); glow.position.set(0, 1.6, 0);
  mesh.add(glow);
  return {
    update(flash) {
      barRed.material.emissiveIntensity = flash ? 5 : 0.4;
      barBlue.material.emissiveIntensity = flash ? 0.4 : 5;
      glow.material.color.setHex(flash ? 0xff3355 : 0x3366ff);
    },
  };
}

export class Chase {
  // opts: { role:'cop'|'thief', difficulty:'easy'|'normal'|'hard' }
  constructor(scene, track, opts = {}) {
    this.scene = scene;
    this.track = track;
    this.role = opts.role === 'thief' ? 'thief' : 'cop';
    this.tune = chaseTune(opts.difficulty);
    this.maxHealth = 3;
    this.health = 3;              // 獵物血量 (cop:AI小偷 / thief:玩家)
    this.invulnT = 0;             // 扣血後無敵剩餘 (hard)
    this.caught = false;          // 獵物翻車被捕
    this.rolloverT = 0;           // 翻車動畫進度 (0 未觸發)
    this.flashT = 0;
    this.actors = [];             // AI 車輛
    this._v = new THREE.Vector3();

    if (this.role === 'cop') {
      // 玩家=警察;生成 1 台 AI 小偷 (隨機贓車) 在玩家前方逃
      const builderId = STOLEN_CARS[Math.floor(Math.random() * STOLEN_CARS.length)];
      const thief = this._spawnActor(builderId, this._randomPaint(), 0.06, 0, 'thief');
      this.prey = thief;          // 獵物 = AI 小偷
    } else {
      // 玩家=小偷;生成 2 台 AI 警車追撞玩家
      const c1 = this._spawnActor('taxi', 0x14181f, 1 - 0.03, -2.5, 'cop'); c1.copRole = 'rammer';
      const c2 = this._spawnActor('taxi', 0x14181f, 1 - 0.05, 2.5, 'cop'); c2.copRole = 'rammer2';
      this.prey = null;           // 獵物 = 玩家 (血量在 this.health,由 main 傳 playerCar)
    }
    window.__chase = this;        // QA 掛鉤
  }

  _randomPaint() {
    const pal = [0xff5a3c, 0x8a5cff, 0x2ee6a0, 0xffc21e, 0x3ee6ff, 0xff4d8d];
    return pal[Math.floor(Math.random() * pal.length)];
  }

  _spawnActor(builderId, paint, startS, lane, kind) {
    const { mesh, parts } = (CAR_BUILDERS[builderId] || CAR_BUILDERS.gt)({ paint });
    // AI 車不可用真實光源
    const kill = [];
    mesh.traverse((o) => { if (o.isSpotLight || o.isPointLight) kill.push(o); });
    for (const l of kill) l.parent.remove(l);

    const actor = {
      mesh, parts, kind,
      s: (startS + 1) % 1, lane, laneTarget: lane, speed: 0, wheelSpin: 0,
      skill: this.tune.aiSkill, wobbleYaw: 0, panic: 0,
      pitT: 0, pitCooldown: 4 + Math.random() * 3, pitSide: Math.random() < 0.5 ? -1 : 1,
      rollAxis: Math.random() < 0.5 ? 1 : -1,
    };
    if (kind === 'cop') this._addPoliceLights(mesh, actor);
    this._place(actor);
    this.actors.push(actor);
    this.scene.add(mesh);
    return actor;
  }

  _addPoliceLights(mesh, actor) {
    actor.lights = addPoliceLights(mesh);
  }

  _place(a) {
    const p = this.track.pointAt(a.s);
    const tan = this.track.tangentAt(a.s);
    const nx = -tan.z, nz = tan.x;
    a.mesh.position.set(p.x + nx * a.lane, 0, p.z + nz * a.lane);
    if (a.rolloverT > 0) return; // 翻車中不覆蓋姿態
    a.mesh.rotation.set(0, Math.atan2(tan.x, tan.z) + a.wobbleYaw, 0);
  }

  _shiftS(a, ds) {
    let ns = a.s + ds;
    while (ns >= 1) ns -= 1;
    while (ns < 0) ns += 1;
    a.s = ns;
  }

  _cornerSpeed(a) {
    const N = this.track.samples.length;
    const i0 = Math.floor(a.s * N) % N;
    const t0 = this.track.samples[i0].tan;
    const t1 = this.track.samples[(i0 + 40) % N].tan;
    const curv = 1 - (t0.x * t1.x + t0.z * t1.z);
    const top = 56 * a.skill;
    return THREE.MathUtils.clamp(top * (1 - curv * 7), 13, top);
  }

  _apexLane(a) {
    const N = this.track.samples.length;
    const i0 = Math.floor(a.s * N) % N;
    const t0 = this.track.samples[i0].tan;
    const t1 = this.track.samples[(i0 + 32) % N].tan;
    const nx = -t0.z, nz = t0.x;
    const inward = (t1.x - t0.x) * nx + (t1.z - t0.z) * nz;
    return THREE.MathUtils.clamp(inward * 26, -5, 5);
  }

  // 玩家沿賽道進度 (0..1)
  _playerS(playerCar) { return playerCar.progress; }

  update(dt, playerCar) {
    this.flashT += dt;
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);

    // 翻車動畫進行中:只推進動畫,不再跑 AI
    if (this.rolloverT > 0) {
      this._updateRollover(dt, playerCar);
      return this._status(playerCar);
    }

    const flash = Math.floor(this.flashT * 6) % 2 === 0;
    const pS = this._playerS(playerCar);
    const playerKmh = Math.abs(playerCar.speed) * 3.6;
    const len = this.track.length;

    for (const a of this.actors) {
      // 沿賽道的帶符號間距 (公尺):正 = actor 在玩家前方
      let gap = a.s - pS;
      if (gap > 0.5) gap -= 1;
      if (gap < -0.5) gap += 1;
      const gapM = gap * len;

      if (a.kind === 'thief') {
        this._driveThief(a, dt, gapM, playerKmh);
      } else {
        this._driveCop(a, dt, gapM, playerCar, playerKmh);
      }

      // 警燈閃爍
      if (a.lights) a.lights.update(flash);

      // ---- 碰撞 + 撞擊判定 ----
      this._collide(a, playerCar, playerKmh);
    }

    // 警笛 (小聲):有警車在場時播放;音量隨最近警車距離
    const au = activeAudio();
    if (au) {
      const hasCop = this.actors.some((a) => a.kind === 'cop');
      if (hasCop) {
        au.sirenStart?.();
        let nearest = Infinity;
        for (const a of this.actors) {
          if (a.kind !== 'cop') continue;
          nearest = Math.min(nearest, playerCar.pos.distanceTo(a.mesh.position));
        }
        au.sirenUpdate?.(nearest, 0.4); // 第二參數:音量上限係數 (小聲)
      }
    }
    return this._status(playerCar);
  }

  // AI 小偷:高速逃逸 + 玩家貼近時閃避 (aggressive 時更急);受傷慌亂
  _driveThief(a, dt, gapM, playerKmh) {
    const panicMul = 1 - a.panic * 0.28;            // 慌亂:降速、易失控
    let target = this._cornerSpeed(a) * panicMul;
    if (this.tune.aggressive) target *= 1.08;        // 積極逃竄:更快
    const accel = a.speed < target ? 16 : 30;
    a.speed += THREE.MathUtils.clamp(target - a.speed, -accel * dt, accel * dt);
    this._shiftS(a, (a.speed * dt) / this.track.length);

    // 走線:彎心 + 玩家在後方近距離時橫向閃避
    let laneT = this._apexLane(a);
    if (gapM > -2 && gapM < 16) {                    // 玩家在後方 16m 內
      const swerve = this.tune.aggressive ? 4.2 : 2.2;
      // 依時間週期左右鑽 (aggressive 更頻繁)
      laneT += Math.sin(this.flashT * (this.tune.aggressive ? 4.5 : 2.4) + a.pitSide) * swerve;
    }
    a.laneTarget = THREE.MathUtils.clamp(laneT, -5.4, 5.4);
    const steer = 1.2 + a.panic * 1.5;
    a.lane += (a.laneTarget - a.lane) * Math.min(1, dt * steer);

    // 慌亂擺尾
    a.wobbleYaw = a.panic > 0.02
      ? Math.sin(this.flashT * 16 + a.pitSide * 3) * a.panic * 0.4 : a.wobbleYaw * (1 - dt * 6);
    a.panic = Math.max(0, a.panic - dt * 0.35);      // 慌亂隨時間平復

    this._advanceVisual(a, dt);
    this._place(a);
  }

  // AI 警車:追玩家 + PIT 撞尾 (thief role);兩台輪流逼車
  _driveCop(a, dt, gapM, playerCar, playerKmh) {
    const target = a.pitT > 0 ? Math.min(60, playerKmh / 3.6 + 4)
      : gapM > 2 ? Math.max(10, Math.abs(playerCar.speed) - 3)   // 已在前方:減速回貼
        : Math.min(60, Math.abs(playerCar.speed) + (this.tune.aggressive ? 12 : 8));
    const accel = a.speed < target ? 16 : 28;
    a.speed += THREE.MathUtils.clamp(target - a.speed, -accel * dt, accel * dt);
    this._shiftS(a, (a.speed * dt) / this.track.length);

    const d = playerCar.pos.distanceTo(a.mesh.position);
    a.pitCooldown -= dt;
    if (a.pitT > 0) {
      a.pitT -= dt;
      a.lane += ((playerCar.lateral + a.pitSide * 1.1) - a.lane) * Math.min(1, dt * 3.2);
    } else if (d < 22) {
      a.lane += (playerCar.lateral - a.lane) * Math.min(1, dt * 1.6);
      if (a.pitCooldown <= 0 && d < 13 && playerKmh > 40 && this.tune.aggressive) {
        a.pitT = 1.4;
        a.pitSide = Math.sign(a.lane - playerCar.lateral) || (Math.random() < 0.5 ? -1 : 1);
      }
    } else {
      a.lane += (this._apexLane(a) - a.lane) * Math.min(1, dt * 1.2);
    }
    a.lane = THREE.MathUtils.clamp(a.lane, -5.4, 5.4);
    this._advanceVisual(a, dt);
    this._place(a);
  }

  _advanceVisual(a, dt) {
    a.wheelSpin += (a.speed / 0.48) * dt;
    if (a.parts.wheels) for (const w of a.parts.wheels) w.spinner.rotation.x = a.wheelSpin % (Math.PI * 2);
  }

  // 碰撞:位置分離 + 法向反彈 (不互穿) + 撞擊扣血判定
  _collide(a, playerCar, playerKmh) {
    const dx = playerCar.pos.x - a.mesh.position.x;
    const dz = playerCar.pos.z - a.mesh.position.z;
    const d2 = dx * dx + dz * dz;
    const minD = 2.5;
    if (d2 >= minD * minD || d2 < 1e-4) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, nz = dz / d;
    const overlap = minD - d;
    // 位置分離:玩家推開一半
    playerCar.pos.x += nx * overlap * 0.5;
    playerCar.pos.z += nz * overlap * 0.5;
    const tan = this.track.tangentAt(a.s);
    a.lane = THREE.MathUtils.clamp(a.lane - (nx * (-tan.z) + nz * tan.x) * overlap * 0.5, -5.8, 5.8);
    this._shiftS(a, -((nx * tan.x + nz * tan.z) * overlap * 0.5) / this.track.length);
    // 法向相對速度反彈
    const aVx = tan.x * a.speed, aVz = tan.z * a.speed;
    const relVn = (playerCar.vel.x - aVx) * nx + (playerCar.vel.z - aVz) * nz;
    const closingKmh = Math.abs(relVn) * 3.6;
    if (relVn < 0) {
      const j = -relVn * 1.35 * 0.5;
      playerCar.vel.x += nx * j; playerCar.vel.z += nz * j;
      a.speed = Math.max(2, a.speed - Math.abs(j) * 0.7);
    }
    playerCar.collisionImpulse = Math.max(playerCar.collisionImpulse, Math.min(1, overlap * 1.1));
    this._place(a);

    // ---- 有效撞擊 → 扣獵物血量 ----
    // cop role:攻擊者=玩家,獵物=AI小偷(a);thief role:攻擊者=AI警車(a),獵物=玩家
    const attackerIsPlayer = this.role === 'cop' && a.kind === 'thief';
    const attackerIsCop = this.role === 'thief' && a.kind === 'cop';
    if (!attackerIsPlayer && !attackerIsCop) return;
    if (this.invulnT > 0) return;
    // 判定:easy/normal 任何接觸;hard 需相對速度門檻
    const valid = this.tune.impactMode === 'any' || closingKmh >= this.tune.minImpactKmh;
    if (!valid) return;

    this.health -= 1;
    this.invulnT = this.tune.invuln;
    activeAudio()?.collision(0.9);
    // 受傷慌亂:獵物 panic 上升
    if (this.prey) this.prey.panic = Math.min(1, this.prey.panic + 0.5);
    if (this.health <= 0) this._startRollover(playerCar);
  }

  // ---- 翻車:啟動 ----
  _startRollover(playerCar) {
    this.rolloverT = 0.0001;
    this.rollTotal = 2.2;
    activeAudio()?.collision(1);
    if (this.role === 'cop') {
      this.rollTarget = this.prey;              // AI 小偷翻車
    } else {
      this.rollTarget = { playerCar };          // 玩家翻車 (視覺由 main 停止操控)
    }
  }

  _updateRollover(dt, playerCar) {
    this.rolloverT += dt;
    const k = Math.min(1, this.rolloverT / this.rollTotal);
    if (this.role === 'cop') {
      const a = this.prey;
      a.speed = Math.max(0, a.speed - 30 * dt);
      this._shiftS(a, (a.speed * dt) / this.track.length);
      this._place(a);
      // 翻滾:側傾到約 110° + 前俯 + 落定
      const roll = a.rollAxis * (Math.min(1, k * 1.6)) * 1.9;
      const pitch = Math.sin(k * Math.PI) * 0.4;
      const p = this.track.pointAt(a.s);
      const tan = this.track.tangentAt(a.s);
      a.mesh.position.set(p.x + (-tan.z) * a.lane, Math.sin(k * Math.PI) * 0.6, p.z + tan.x * a.lane);
      a.mesh.rotation.set(pitch, Math.atan2(tan.x, tan.z), roll);
    } else {
      // 玩家翻車:視覺傾倒 (main 已凍結操控)
      playerCar.vel.multiplyScalar(1 - dt * 4);
      const bg = playerCar.bodyGroup;
      if (bg) { bg.rotation.z += (1.9 - bg.rotation.z) * Math.min(1, dt * 2.2); bg.position.y = Math.sin(k * Math.PI) * 0.5; }
    }
    if (k >= 1 && !this.caught) this.caught = true;   // 翻車完成 → 被捕
  }

  _status(playerCar) {
    let dist = Infinity;
    for (const a of this.actors) dist = Math.min(dist, playerCar.pos.distanceTo(a.mesh.position));
    return {
      role: this.role,
      health: this.health,
      maxHealth: this.maxHealth,
      dist: isFinite(dist) ? dist : 0,
      rollover: this.rolloverT > 0,
      caught: this.caught,
      // 供 main 判斷勝負:cop 抓到=勝;thief 被抓=敗
    };
  }

  // 逮捕動畫用:回傳翻車車輛的世界位置與朝向 (給 arrest cutscene 對焦)
  getBustTarget() {
    if (this.role === 'cop' && this.prey) {
      return { pos: this.prey.mesh.position.clone(), yaw: this.prey.mesh.rotation.y };
    }
    return null;
  }

  dispose() {
    activeAudio()?.sirenStop?.();
    for (const a of this.actors) { this.scene.remove(a.mesh); disposeObject(a.mesh); }
    this.actors = [];
    if (window.__chase === this) delete window.__chase;
  }
}
