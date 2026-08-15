// opponents.js — 大獎賽模式:5 台 AI 對手 + 名次計算
// 運動學跟線 + 彎心走線 (apex)、AI 互相避讓、被擠壓短暫失控、起跑反應延遲、
// 終點後減速滑行、超車呼嘯音效、橡皮筋
import * as THREE from 'three';
import { CAR_BUILDERS } from './cars/index.js';
import { disposeObject } from './cars/common.js';
import { modeById } from './config.js';
import { activeAudio } from './audio.js';

const AI_ROSTER = [
  { builder: 'evsport', paint: 0x9b5cff, name: '紫電' },
  { builder: 'rally', paint: 0x2f6fe1, name: '藍嵐' },
  { builder: 'gt', paint: 0x2ee6a0, name: '翡翠' },
  { builder: 'taxi', paint: 0xffc21e, name: '小黃' },
  { builder: 'suv', paint: 0xd8dde4, name: '白峰' },
];

export class Opponents {
  constructor(scene, track, count = 5) {
    this.scene = scene;
    this.track = track;
    this.cars = [];
    this.totalLaps = modeById('gp').laps;
    this.raceT = 0;               // 綠燈後經過秒數 (main 在倒數期間不呼叫 update → AI 靜止)
    this._lastUpdateAt = 0;
    this._coastPrev = 0;
    for (let i = 0; i < count; i++) {
      const spec = AI_ROSTER[i % AI_ROSTER.length];
      const builder = CAR_BUILDERS[spec.builder] || CAR_BUILDERS.gt;
      const { mesh, parts } = builder({ paint: spec.paint });
      // 移除 AI 車的真實光源 (5 台 × 2 盞會炸光源預算),保留 emissive 燈條
      const toRemove = [];
      mesh.traverse((o) => { if (o.isSpotLight || o.isPointLight) toRemove.push(o); });
      for (const l of toRemove) l.parent.remove(l);
      // 起跑排位:玩家在最後,AI 排在前面兩列
      const startS = 1 - (0.006 + i * 0.004);
      const lane = (i % 2 === 0 ? 1 : -1) * 3.2;
      const skill = 0.82 + (i / count) * 0.14 + Math.random() * 0.04; // 0.82~0.99
      this.cars.push({
        mesh, parts, spec,
        s: startS, lane, laneTarget: lane,
        speed: 0, skill, laps: 0, wheelSpin: 0,
        finished: false,
        reaction: 0.12 + i * 0.09 + Math.random() * 0.22, // 綠燈後起步反應時間
        laneBias: (Math.random() - 0.5) * 1.6,            // 個人走線偏好
        upset: 0,                                          // 被擠壓後的失控殘餘時間
        wobbleYaw: 0,
        prevAhead: null,                                   // 上一幀是否領先玩家 (超車偵測)
      });
      this._place(this.cars[i]);
      scene.add(mesh);
    }
    // 玩家完賽後 main 不再呼叫 update → 掛渲染回呼讓 AI 減速滑行而非瞬間凍結
    let probe = null;
    this.cars[0]?.mesh.traverse((o) => { if (!probe && o.isMesh) probe = o; });
    if (probe) probe.onBeforeRender = () => this._coastTick();
    this._probe = probe;
    window.__opponents = this; // QA 掛鉤
  }

  _place(ai) {
    const p = this.track.pointAt(ai.s);
    const tan = this.track.tangentAt(ai.s);
    const nx = -tan.z, nz = tan.x;
    ai.mesh.position.set(p.x + nx * ai.lane, 0, p.z + nz * ai.lane);
    ai.mesh.rotation.y = Math.atan2(tan.x, tan.z) + ai.wobbleYaw;
  }

  _advance(ai, dt) {
    const prevS = ai.s;
    ai.s = (ai.s + (ai.speed * dt) / this.track.length) % 1;
    if (ai.s < prevS - 0.5) ai.laps++;
    ai.wheelSpin += (ai.speed / 0.48) * dt;
    if (ai.parts.wheels) {
      for (const w of ai.parts.wheels) w.spinner.rotation.x = ai.wheelSpin % (Math.PI * 2);
    }
  }

  // 前方曲率 → 目標速度
  _cornerSpeed(ai) {
    const N = this.track.samples.length;
    const i0 = Math.floor(ai.s * N) % N;
    const a = this.track.samples[i0].tan;
    const b = this.track.samples[(i0 + 40) % N].tan;
    const curv = 1 - (a.x * b.x + a.z * b.z); // 0=直線
    const top = 56 * ai.skill;
    return THREE.MathUtils.clamp(top * (1 - curv * 7), 13, top);
  }

  // 彎心走線:切線變化方向 (dT/ds 指向彎心) 投影到路面法線 → 偏向內側
  _apexLane(ai) {
    const N = this.track.samples.length;
    const i0 = Math.floor(ai.s * N) % N;
    const a = this.track.samples[i0].tan;
    const b = this.track.samples[(i0 + 32) % N].tan;
    const nx = -a.z, nz = a.x;
    const inward = (b.x - a.x) * nx + (b.z - a.z) * nz;
    return THREE.MathUtils.clamp(inward * 26, -5, 5);
  }

  // AI 互相避讓:縱向接近且橫向重疊 → 推開車道 + 後車收油 (消除重疊穿模)
  _separate(dt) {
    const len = this.track.length;
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        let ds = (a.laps + a.s) - (b.laps + b.s);
        ds *= len;
        if (Math.abs(ds) > 6) continue;
        const dl = a.lane - b.lane;
        if (Math.abs(dl) > 2.4) continue;
        const sign = dl >= 0 ? 1 : -1;
        const push = (2.4 - Math.abs(dl)) * dt * 2.6;
        a.lane = THREE.MathUtils.clamp(a.lane + sign * push, -5.5, 5.5);
        b.lane = THREE.MathUtils.clamp(b.lane - sign * push, -5.5, 5.5);
        a.laneTarget = THREE.MathUtils.clamp(a.laneTarget + sign * 1.5, -5, 5);
        b.laneTarget = THREE.MathUtils.clamp(b.laneTarget - sign * 1.5, -5, 5);
        const rear = ds < 0 ? a : b;   // 落後的一台
        const front = ds < 0 ? b : a;
        rear.speed *= 1 - dt * 1.6;    // 後車讓速
        if (Math.abs(ds) < 2.6) rear.speed = Math.min(rear.speed, Math.abs(front.speed) * 0.96 + 1);
      }
    }
  }

  update(dt, playerCar, playerTotalProgress) {
    this.raceT += dt;
    this._lastUpdateAt = performance.now();
    this._coastPrev = 0;

    for (const ai of this.cars) {
      // 完賽 → 減速滑行 (沿賽道慢慢停下)
      if (!ai.finished && ai.laps >= this.totalLaps) ai.finished = true;
      if (ai.finished) {
        ai.speed = Math.max(0, ai.speed - 8 * dt);
        ai.upset = 0;
        ai.wobbleYaw *= 1 - Math.min(1, dt * 4);
        ai.lane += (ai.laneBias - ai.lane) * Math.min(1, dt * 0.6);
        this._advance(ai, dt);
        this._place(ai);
        continue;
      }
      // 起跑:綠燈後有個人反應延遲 (倒數期間 main 不會呼叫 update,本來就靜止)
      if (this.raceT < ai.reaction) { ai.speed = 0; this._place(ai); continue; }

      // 橡皮筋:落後玩家太多加速,領先太多收油 (±6% 技術上限)
      const aiTotal = ai.laps + ai.s;
      const gap = playerTotalProgress - aiTotal;
      const rubber = THREE.MathUtils.clamp(gap * 0.35, -0.06, 0.08);
      let target = this._cornerSpeed(ai) * (1 + rubber);
      if (ai.upset > 0) target *= 0.72; // 失控中丟速度
      const accelRate = ai.speed < target ? 14 : 30;
      ai.speed += THREE.MathUtils.clamp(target - ai.speed, -accelRate * dt, accelRate * dt);
      this._advance(ai, dt);

      // 走線:彎心 apex + 個人偏好;前方有車/玩家擋線 → 換到旁邊超車
      let laneTarget = this._apexLane(ai) + ai.laneBias;
      const len = this.track.length;
      for (const other of this.cars) {
        if (other === ai) continue;
        let ds = ((other.laps + other.s) - aiTotal) * len;
        if (ds > 0.5 && ds < 14 && Math.abs(other.lane - ai.lane) < 2.0) {
          laneTarget = THREE.MathUtils.clamp(other.lane + (ai.lane >= other.lane ? 3 : -3), -5, 5);
        }
      }
      {
        let dsP = (playerTotalProgress - aiTotal) * len;
        if (dsP > 0.5 && dsP < 12 && Math.abs(playerCar.lateral - ai.lane) < 2.0) {
          laneTarget = THREE.MathUtils.clamp(playerCar.lateral + (ai.lane >= playerCar.lateral ? 3 : -3), -5, 5);
        }
      }
      ai.laneTarget = laneTarget;
      const steerRate = ai.upset > 0 ? 2.4 : 1.1; // 失控中閃避更急
      ai.lane += (ai.laneTarget - ai.lane) * Math.min(1, dt * steerRate);

      // 被擠壓後的短暫失控:車身左右擺動
      if (ai.upset > 0) {
        ai.upset -= dt;
        ai.wobbleYaw = Math.sin(this.raceT * 21 + ai.reaction * 57) * Math.min(0.6, ai.upset) * 0.5;
        ai.lane += Math.sin(this.raceT * 17 + ai.reaction * 31) * ai.upset * dt * 3;
      } else {
        ai.wobbleYaw *= 1 - Math.min(1, dt * 6);
      }
    }

    this._separate(dt);

    for (const ai of this.cars) {
      if (!ai.finished) this._place(ai);

      // 與玩家的簡易碰撞 (圓形推擠) → AI 被擠壓:閃避 + 短暫失控
      const dx = playerCar.pos.x - ai.mesh.position.x;
      const dz = playerCar.pos.z - ai.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      const minD = 2.4;
      if (d2 < minD * minD && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (minD - d) / minD;
        playerCar.vel.x += (dx / d) * push * 26 * dt;
        playerCar.vel.z += (dz / d) * push * 26 * dt;
        playerCar.collisionImpulse = Math.max(playerCar.collisionImpulse, push * 0.4);
        // AI 受擠壓:往另一側閃 + 進入失控狀態
        ai.laneTarget = THREE.MathUtils.clamp(ai.lane + (ai.lane >= playerCar.lateral ? 2.6 : -2.6), -5, 5);
        if (ai.upset <= 0.2) ai.speed *= 0.93;
        ai.upset = Math.max(ai.upset, 0.8);
      }

      // 超車瞬間呼嘯 (雙向:AI 超玩家 / 玩家超 AI),近距離才觸發
      const ahead = (ai.laps + ai.s) > playerTotalProgress;
      if (ai.prevAhead !== null && ahead !== ai.prevAhead && d2 < 13 * 13) {
        const relSpeed = Math.abs(Math.abs(playerCar.speed) - ai.speed);
        activeAudio()?.whoosh(Math.min(1, 0.4 + relSpeed / 18));
      }
      ai.prevAhead = ahead;
    }
  }

  // 玩家完賽後的滑行 tick (由渲染回呼驅動;update 仍在跑時跳過)
  _coastTick() {
    const now = performance.now();
    if (now - this._lastUpdateAt < 150) return;
    if (!this._coastPrev) { this._coastPrev = now; return; }
    const dt = Math.min(0.05, (now - this._coastPrev) / 1000);
    this._coastPrev = now;
    if (dt <= 0) return;
    for (const ai of this.cars) {
      ai.speed = Math.max(0, ai.speed - 9 * dt);
      ai.upset = 0;
      ai.wobbleYaw *= 1 - Math.min(1, dt * 4);
      this._advance(ai, dt);
      this._place(ai);
    }
  }

  // 名次:1 + 比玩家總進度前面的 AI 數
  playerPosition(playerTotalProgress) {
    let ahead = 0;
    for (const ai of this.cars) {
      if (ai.laps + ai.s > playerTotalProgress) ahead++;
    }
    return 1 + ahead;
  }

  dispose() {
    if (this._probe) this._probe.onBeforeRender = () => {};
    for (const ai of this.cars) { this.scene.remove(ai.mesh); disposeObject(ai.mesh); }
    this.cars = [];
    if (window.__opponents === this) delete window.__opponents;
  }
}
