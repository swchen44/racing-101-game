// police.js — 警車追逐模式:追撃 AI、PIT 撞尾、第 2 圈增援、甩開 300m 觸發路障攔截、
//              警笛 (音量隨距離)、通緝熱度與攔停判定
import * as THREE from 'three';
import { CAR_BUILDERS } from './cars/index.js';
import { disposeObject } from './cars/common.js';
import { radialGlowTexture } from './taipei101.js';
import { activeAudio } from './audio.js';

const ESCAPE_DIST = 300;   // 玩家甩開這麼多公尺 → 路障攔截
const ROADBLOCK_AHEAD = 265; // 路障設在玩家前方多少公尺

export class Police {
  constructor(scene, track, count = 2) {
    this.scene = scene;
    this.track = track;
    this.units = [];
    this.heat = 0;          // 攔停累積 0..1 (被貼身且低速時上升)
    this.busted = false;
    this.flashT = 0;
    this.playerLap = 1;     // 自行追蹤玩家圈數 (main 不傳入) → 第 2 圈增援
    this.prevProgress = 0;
    this.reinforced = false;
    this.roadblockCooldown = 8;  // 開場緩衝,之後每次部署間隔
    this.roadblocks = 0;         // 已部署次數 (QA 用)
    this.barrierGroup = null;
    this.barriers = [];
    this._sirenStopped = false;
    for (let i = 0; i < count; i++) {
      this._spawnUnit(1 - 0.03 - i * 0.012, i % 2 ? 2.5 : -2.5);
    }
    window.__police = this; // QA 掛鉤
  }

  _spawnUnit(startS, lane) {
    const { mesh, parts } = (CAR_BUILDERS.taxi || CAR_BUILDERS.gt)({ paint: 0x14181f });
    const toRemove = [];
    mesh.traverse((o) => { if (o.isSpotLight || o.isPointLight) toRemove.push(o); });
    for (const l of toRemove) l.parent.remove(l); // AI 車不可用真實光源
    // 車頂警示燈條 (紅藍交替閃)
    const barRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.12, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2233, emissiveIntensity: 3 }));
    const barBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.12, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x2266ff, emissiveIntensity: 3 }));
    barRed.position.set(-0.24, 1.42, -0.1);
    barBlue.position.set(0.24, 1.42, -0.1);
    mesh.add(barRed, barBlue);
    // 警示光暈 sprite (放射狀漸層貼圖,無硬邊)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlowTexture('#ff3355'),
      color: 0xff3355, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.setScalar(3.2);
    glow.position.set(0, 1.6, 0);
    mesh.add(glow);
    const u = {
      mesh, parts, barRed, barBlue, glow,
      s: (startS + 1) % 1, lane, speed: 0, wheelSpin: 0,
      state: 'chase',            // chase | roadblock
      pitT: 0,                   // PIT 動作剩餘時間
      pitSide: Math.random() < 0.5 ? -1 : 1,
      pitCooldown: 5 + Math.random() * 4,
      blockYaw: 0,
    };
    this._place(u);
    this.units.push(u);
    this.scene.add(mesh);
    return u;
  }

  _place(u) {
    const p = this.track.pointAt(u.s);
    const tan = this.track.tangentAt(u.s);
    const nx = -tan.z, nz = tan.x;
    u.mesh.position.set(p.x + nx * u.lane, 0, p.z + nz * u.lane);
    u.mesh.rotation.y = Math.atan2(tan.x, tan.z) + u.blockYaw;
  }

  // ---- 路障攔截:2 台橫停在玩家前方 + 隨機變化的路障水馬 ----
  _deployRoadblock(playerCar) {
    const chasers = this.units.filter((v) => v.state === 'chase');
    const two = chasers.slice(0, 2);
    if (two.length < 2) return;
    const aheadS = (playerCar.progress + ROADBLOCK_AHEAD / this.track.length) % 1;
    two.forEach((u, k) => {
      u.state = 'roadblock';
      u.speed = 0;
      u.pitT = 0;
      u.s = (aheadS + (Math.random() - 0.5) * 3 / this.track.length + 1) % 1;
      u.lane = (k === 0 ? -1 : 1) * (1.7 + Math.random() * 0.9);
      // 橫停角度每次不同 (路障變化)
      u.blockYaw = (k === 0 ? 1 : -1) * (Math.PI / 2) * (0.72 + Math.random() * 0.4);
      this._place(u);
    });
    this._buildBarriers(aheadS);
    this.roadblockCooldown = 18;
    this.roadblocks++;
  }

  _buildBarriers(aheadS) {
    if (this.barrierGroup) this.scene.remove(this.barrierGroup);
    const g = new THREE.Group();
    this.barriers = [];
    const s = (aheadS - 7 / this.track.length + 1) % 1;
    const p = this.track.pointAt(s);
    const tan = this.track.tangentAt(s);
    const nx = -tan.z, nz = tan.x;
    const yaw = Math.atan2(tan.x, tan.z);
    const n = 3 + Math.floor(Math.random() * 2); // 3~4 個,排列每次隨機
    for (let i = 0; i < n; i++) {
      const lane = -5 + (i + 0.5) * (10 / n) + (Math.random() - 0.5) * 1.4;
      const b = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.62, 0.24),
        new THREE.MeshStandardMaterial({ color: 0xd94f00, emissive: 0xff5500, emissiveIntensity: 0.7 }));
      body.position.y = 0.5;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.14, 0.26),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xffffff, emissiveIntensity: 0.9 }));
      stripe.position.y = 0.72;
      b.add(body, stripe);
      b.position.set(p.x + nx * lane, 0, p.z + nz * lane);
      b.rotation.y = yaw + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      g.add(b);
      this.barriers.push({ mesh: b, vel: null, spin: 0 });
    }
    this.scene.add(g);
    this.barrierGroup = g;
  }

  // 撞飛路障 (視覺爽感) + 玩家小幅損失
  _updateBarriers(dt, playerCar) {
    for (const b of this.barriers) {
      if (b.vel) { // 已被撞飛:拋物線 + 翻滾
        b.mesh.position.addScaledVector(b.vel, dt);
        b.vel.y -= 22 * dt;
        b.mesh.rotation.x += b.spin * dt;
        b.mesh.rotation.z += b.spin * 0.7 * dt;
        if (b.mesh.position.y < -4) b.mesh.visible = false;
        continue;
      }
      const dx = playerCar.pos.x - b.mesh.position.x;
      const dz = playerCar.pos.z - b.mesh.position.z;
      if (dx * dx + dz * dz < 1.7 * 1.7 && Math.abs(playerCar.speed) > 4) {
        b.vel = playerCar.vel.clone().multiplyScalar(0.55);
        b.vel.y = 4 + Math.random() * 3;
        b.spin = (Math.random() - 0.5) * 14;
        playerCar.vel.multiplyScalar(0.965);
        playerCar.collisionImpulse = Math.max(playerCar.collisionImpulse, 0.3);
        activeAudio()?.collision(0.45);
      }
    }
  }

  // PIT 撞尾:貼近時瞄準玩家車尾側面,接觸瞬間給側向衝量 (車尾被甩)
  _pitHit(u, playerCar) {
    const tan = this.track.tangentAt(playerCar.progress);
    const nx = -tan.z, nz = tan.x;
    const dir = -u.pitSide; // 從 pitSide 那側撞 → 把玩家推往另一側
    playerCar.vel.x += nx * dir * 11;
    playerCar.vel.z += nz * dir * 11;
    playerCar.vel.multiplyScalar(0.9);
    playerCar.collisionImpulse = Math.max(playerCar.collisionImpulse, 0.85);
    activeAudio()?.collision(0.9);
    u.pitT = 0;
    u.pitCooldown = 7 + Math.random() * 5;
  }

  update(dt, playerCar, t) {
    const au = activeAudio();
    if (this.busted) {
      if (!this._sirenStopped) { au?.sirenStop(); this._sirenStopped = true; }
      return { busted: true, heat: 1 };
    }
    au?.sirenStart();
    this.flashT += dt;
    const flash = Math.floor(this.flashT * 6) % 2 === 0;
    let closestD = Infinity;

    // 自行追蹤玩家圈數 → 第 2 圈起增援 +1 台 (從玩家後方出現)
    if (playerCar.progress < 0.1 && this.prevProgress > 0.9) this.playerLap++;
    this.prevProgress = playerCar.progress;
    if (!this.reinforced && this.playerLap >= 2) {
      this.reinforced = true;
      this._spawnUnit(playerCar.progress - 0.025, 0);
    }

    this.roadblockCooldown -= dt;
    const playerSpeed = Math.abs(playerCar.speed);

    // 甩開判定:所有追撃中的警車都落後 300m 以上 → 部署路障
    const chasers = this.units.filter((v) => v.state === 'chase');
    if (chasers.length >= 2 && this.roadblockCooldown <= 0 && playerSpeed > 15) {
      const allEscaped = chasers.every((v) => {
        let gap = playerCar.progress - v.s;
        if (gap > 0.5) gap -= 1;
        if (gap < -0.5) gap += 1;
        return gap * this.track.length > ESCAPE_DIST;
      });
      if (allEscaped) this._deployRoadblock(playerCar);
    }

    for (const u of this.units) {
      const dx = playerCar.pos.x - u.mesh.position.x;
      const dz = playerCar.pos.z - u.mesh.position.z;
      const d = Math.hypot(dx, dz);
      closestD = Math.min(closestD, d);

      if (u.state === 'roadblock') {
        // 橫停等待;玩家通過路障 20m 後解除橫停恢復追撃
        let past = playerCar.progress - u.s;
        if (past > 0.5) past -= 1;
        if (past < -0.5) past += 1;
        if (past * this.track.length > 20) {
          u.state = 'chase';
          u.blockYaw = 0;
          u.pitCooldown = 3;
          this._place(u);
        }
      } else {
        // 沿賽道追玩家的進度 (走短的一邊)
        let gap = playerCar.progress - u.s;
        if (gap > 0.5) gap -= 1;
        if (gap < -0.5) gap += 1;
        // 目標速度:落後時比玩家上限快 8%,已在前方則減速等攔截;PIT 中貼緊
        const target = u.pitT > 0
          ? Math.min(58, playerSpeed + 4)
          : gap > 0.004
            ? Math.min(58, playerSpeed + 9)
            : Math.max(10, playerSpeed - 4);
        u.speed += THREE.MathUtils.clamp(target - u.speed, -26 * dt, 15 * dt);
        u.s = (u.s + (u.speed * dt) / this.track.length + 1) % 1;

        u.pitCooldown -= dt;
        if (u.pitT > 0) {
          // PIT 進行中:壓向玩家車尾側 1/4 處
          u.pitT -= dt;
          u.lane += ((playerCar.lateral + u.pitSide * 1.1) - u.lane) * Math.min(1, dt * 3.4);
          if (d < 3.0 && playerSpeed > 8) this._pitHit(u, playerCar);
          if (u.pitT <= 0) u.pitCooldown = 6 + Math.random() * 5;
        } else if (d < 22) {
          // 貼近時朝玩家的側向位置壓過去 (逼車)
          u.lane += ((playerCar.lateral) - u.lane) * Math.min(1, dt * 1.6);
          // 冷卻結束且玩家高速 → 發動 PIT
          if (u.pitCooldown <= 0 && d < 14 && playerSpeed > 14) {
            u.pitT = 1.6;
            u.pitSide = Math.sign(u.lane - playerCar.lateral) || (Math.random() < 0.5 ? -1 : 1);
          }
        } else if (Math.random() < dt * 0.3) {
          u.lane = THREE.MathUtils.clamp(u.lane + (Math.random() - 0.5) * 3, -5, 5);
        }
        this._place(u);
        u.wheelSpin += (u.speed / 0.48) * dt;
        if (u.parts.wheels) {
          for (const w of u.parts.wheels) w.spinner.rotation.x = u.wheelSpin % (Math.PI * 2);
        }
      }

      // 碰撞推擠 (撞警車會損失速度;橫停路障車推得更重)
      const minD = 2.5;
      if (d < minD && d > 0.05) {
        const push = (minD - d) / minD;
        const k = u.state === 'roadblock' ? 44 : 30;
        playerCar.vel.x += (dx / d) * push * k * dt;
        playerCar.vel.z += (dz / d) * push * k * dt;
        playerCar.vel.multiplyScalar(1 - push * (u.state === 'roadblock' ? 0.8 : 0.5) * dt * 8);
        playerCar.collisionImpulse = Math.max(playerCar.collisionImpulse, push * (u.state === 'roadblock' ? 0.7 : 0.5));
      }

      // 警燈閃爍
      u.barRed.material.emissiveIntensity = flash ? 5 : 0.4;
      u.barBlue.material.emissiveIntensity = flash ? 0.4 : 5;
      u.glow.material.color.setHex(flash ? 0xff3355 : 0x3366ff);
      u.glow.material.opacity = 0.35 + 0.25 * Math.sin(this.flashT * 12);
    }

    this._updateBarriers(dt, playerCar);
    au?.sirenUpdate(closestD); // 警笛音量隨最近警車距離

    // 攔停判定:警車貼身 (<7m) 且玩家低速 (<8 m/s) → 熱度上升;否則衰減
    if (closestD < 7 && Math.abs(playerCar.speed) < 8) {
      this.heat = Math.min(1, this.heat + dt / 2.6);
    } else {
      this.heat = Math.max(0, this.heat - dt / 2);
    }
    if (this.heat >= 1) this.busted = true;
    return { busted: this.busted, heat: this.heat, closestD };
  }

  dispose() {
    activeAudio()?.sirenStop();
    for (const u of this.units) { this.scene.remove(u.mesh); disposeObject(u.mesh); }
    this.units = [];
    if (this.barrierGroup) { this.scene.remove(this.barrierGroup); disposeObject(this.barrierGroup); }
    this.barrierGroup = null;
    this.barriers = [];
    if (window.__police === this) delete window.__police;
  }
}
