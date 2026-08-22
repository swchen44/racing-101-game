// camera.js — 第三人稱追逐攝影機:彈簧平滑、速度FOV、曲率預讀構圖、101地標讓位、碰撞震動、可切換視角
import * as THREE from 'three';

const MODES = [
  { name: 'chase',  dist: 8.2, height: 2.9, lookAhead: 9,  fovBase: 62 },
  { name: 'far',    dist: 13.5, height: 5.2, lookAhead: 12, fovBase: 58 },
  { name: 'cockpit', dist: 0.34, height: 1.17, lookAhead: 22, fovBase: 74, rigid: true, lookDrop: 0.16 },
  { name: 'bumper', dist: -1.85, height: 0.72, lookAhead: 26, fovBase: 72, rigid: true, lookDrop: 0.0 },
];

// 台北101塔基座位置 (taipei101.js TOWER_POS)
const TOWER_X = 0, TOWER_Z = -40;
// 護欄頂 (Jersey barrier 0.95m) + 0.4m 安全餘量:鏡頭硬下限,避免被牆整條橫切畫面
const CAM_MIN_Y = 1.35;

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;
    this.pos = new THREE.Vector3(0, 5, -12);
    this.lookTarget = new THREE.Vector3();
    this.shake = 0;
    this._tmp = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._towerLift = 0;   // 0..1 面向101時的抬升量 (彈簧過渡)
    this._towerSide = 0;   // -1..1 面向101時的橫向讓位方向 (平滑)
    this._curveShift = 0;  // 彎道預讀的注視點橫移 (平滑)
  }

  cycleMode() { this.modeIndex = (this.modeIndex + 1) % MODES.length; }
  get mode() { return MODES[this.modeIndex]; }

  snapTo(car) {
    const m = this.mode;
    const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
    this.pos.set(
      car.pos.x - sin * m.dist,
      m.height,
      car.pos.z - cos * m.dist);
    this.camera.position.copy(this.pos);
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  update(dt, car, t) {
    const m = this.mode;
    const isBumper = !!m.rigid; // 剛性視角 (車頭/駕駛艙):不做彈簧延遲與高度下限
    const speedRatio = Math.min(1, car.speedKmh / 230);
    const sin = Math.sin(car.heading), cos = Math.cos(car.heading);

    // ---- 101 地標讓位:僅信義賽道;車頭朝向塔 ±40° 且距離 <320m → 抬鏡頭讓塔進畫面上 1/3 ----
    const hasTower = (car.track?.theme?.landmark ?? 'tower101') === 'tower101';
    const tdx = TOWER_X - car.pos.x, tdz = TOWER_Z - car.pos.z;
    const towerDist = Math.hypot(tdx, tdz);
    let towerTarget = 0;
    let sideTarget = this._towerSide;
    if (hasTower && towerDist < 320 && towerDist > 1) {
      const angToTower = Math.atan2(tdx, tdz);
      let dAng = angToTower - car.heading;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      if (Math.abs(dAng) < THREE.MathUtils.degToRad(40)) {
        towerTarget = 1;
        // 橫向讓位:鏡頭往塔偏離車頭的反側平移,拉出「車在一側、塔在另一側」
        // 的乾淨對角構圖,同時把車正前方大樓從『車->塔』視線上錯開
        sideTarget = dAng >= 0 ? -1 : 1;
      }
    }
    this._towerLift += (towerTarget - this._towerLift) * Math.min(1, dt * 2.2);
    this._towerSide += (sideTarget - this._towerSide) * Math.min(1, dt * 2.2);
    const lift = this._towerLift;
    // 抬視線讓塔進畫面上 1/3,但幅度收斂 (近塔 +7m、遠端 +4.5m):
    // 搭配下方 dist 隨 lift 拉遠,塔與主角車必須同框 — 車被裁出畫面是取景失格
    const towerLookY = lift * (4.5 + 2.5 * (1 - Math.min(1, towerDist / 320)));
    // 垂直於『車->塔』連線的水平單位向量 (塔太近時退化為 0)
    const invTd = towerDist > 1 ? 1 / towerDist : 0;
    const perpX = -tdz * invTd, perpZ = tdx * invTd;
    const towerShiftX = perpX * this._towerSide * lift * 5.5;
    const towerShiftZ = perpZ * this._towerSide * lift * 5.5;

    // ---- 彎道曲率預讀:提前看向彎心,產生不對稱構圖 ----
    // 用賽道取樣的切線方向差 (前方約 35m) 推算即將到來的轉向量
    let curveTarget = 0;
    const track = car.track;
    if (track && track.samples && car.trackHint >= 0) {
      const N = track.samples.length;
      const ahead = 45; // 取樣間隔 ~0.78m → 約 35m 前
      const tanNow = track.samples[car.trackHint % N].tan;
      const tanAhead = track.samples[(car.trackHint + ahead) % N].tan;
      let dh = Math.atan2(tanAhead.x, tanAhead.z) - Math.atan2(tanNow.x, tanNow.z);
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      curveTarget = THREE.MathUtils.clamp(dh * 3.2, -2.5, 2.5);
    }
    this._curveShift += (curveTarget - this._curveShift) * Math.min(1, dt * 3.5);

    // ---- 期望位置 ----
    if (isBumper) {
      // 剛性視角 (駕駛艙/車頭):鎖死在車體固定點,不吃速度後退/甩尾/讓位偏移,
      // 否則相機會在高速時滑出車外。
      this._desired.set(
        car.pos.x - sin * m.dist,
        m.height,
        car.pos.z - cos * m.dist);
    } else {
      // 車後方 (甩尾時稍微甩向外側增加動感)
      const driftOffset = car.driftAmount * Math.sign(car.steer || 0.0001) * 2.2;
      // 面向101時同步拉遠鏡頭,塔與車同框
      const dist = m.dist + speedRatio * 2.2 + lift * 2.2;
      // 高速貼地:speedRatio>0.6 時鏡頭微降,強化速度感;面向101時反向抬升 1.2m
      const speedDip = Math.max(0, (speedRatio - 0.6) / 0.4) * 0.4;
      this._desired.set(
        car.pos.x - sin * dist + cos * driftOffset + towerShiftX,
        m.height + speedRatio * 0.5 - speedDip + lift * 1.2,
        car.pos.z - cos * dist - sin * driftOffset + towerShiftZ);
    }

    // 彈簧平滑 (指數趨近)
    const stiffness = isBumper ? 40 : 5.5 + speedRatio * 3;
    const alpha = 1 - Math.exp(-stiffness * dt);
    this.pos.lerp(this._desired, alpha);
    // 鏡頭硬下限:不得低於護欄頂 +0.4m (bumper 視角除外)
    if (!isBumper && this.pos.y < CAM_MIN_Y) this.pos.y = CAM_MIN_Y;

    // ---- 注視點:車前方 + 速度垂直構圖 + 彎心橫移 + 101 抬視線 ----
    // lookTarget.y 隨速度 1.1→2.2:高速時地平線下移、車落到畫面下 1/3、路面透視拉長
    // 面向 101 時依距離動態抬 8~12m (等效 pitch +10° 以上),塔身確實進畫面上 1/3
    const rightX = cos, rightZ = -sin; // 車右側方向
    // 剛性視角注視點壓低 (lookDrop):讓儀表台/引擎蓋落在畫面下 1/3
    const lookY = isBumper
      ? m.height - (m.lookDrop || 0)
      : 1.1 + speedRatio * 1.1 + towerLookY;
    this.lookTarget.set(
      car.pos.x + sin * m.lookAhead + rightX * this._curveShift,
      lookY,
      car.pos.z + cos * m.lookAhead + rightZ * this._curveShift);

    // 震動:高速 + 碰撞
    this.shake = Math.max(0, this.shake - dt * 3);
    const baseShake = speedRatio * speedRatio * 0.05 + this.shake * 0.55;
    const sx = (Math.sin(t * 47.3) + Math.sin(t * 31.7)) * baseShake * 0.12;
    const sy = (Math.sin(t * 39.1) + Math.sin(t * 51.9)) * baseShake * 0.1;

    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.camera.lookAt(this.lookTarget);
    // 微側傾
    this.camera.rotation.z += car.driftAmount * Math.sign(car.steer || 0.0001) * -0.03 + sx * 0.4;

    // FOV 隨速度擴張 (高速廣角張力);Boost 時額外外推 + 微震
    const boostKick = car.boosting ? 9 : 0;
    if (car.boosting) this.shake = Math.max(this.shake, 0.12);
    const targetFov = m.fovBase + speedRatio * 22 + car.driftAmount * 3 + boostKick;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }
}
