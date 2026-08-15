// main.js — 場景組裝、遊戲狀態機、賽事邏輯、主迴圈
import * as THREE from 'three';
import { Track, N_CHECKPOINTS } from './track.js';
import { Car } from './vehicle.js';
import { createTaipei101 } from './taipei101.js';
import { createCity } from './city.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { ChaseCamera } from './camera.js';

// ---------- 渲染器 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------- 場景 ----------
const scene = new THREE.Scene();
// 光害藍紫大氣霧:遠中近景分層、柔化遠處貼圖噪點 (與天空 mid 色一致)
scene.fog = new THREE.FogExp2(0x0a0f1e, 0.0028); // 統一霧色常數 0x0a0f1e (與 city.js 天空 shader 同源)

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2600);

// 環境反射 (讓濕路面 / 車漆反射霓虹)
const pmrem = new THREE.PMREMGenerator(renderer);
{
  const envScene = new THREE.Scene();
  const envGrad = new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 12),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x0a1420 }));
  envScene.add(envGrad);
  // 幾個亮色塊模擬霓虹反射源
  const colors = [0x3ee6a8, 0xff4d6d, 0x4dd8ff, 0xffb54d, 0xffffff];
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(6 + Math.random() * 10, 3 + Math.random() * 8),
      new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 12;
    p.position.set(Math.cos(a) * r, 4 + Math.random() * 26, Math.sin(a) * r);
    p.lookAt(0, p.position.y, 0);
    envScene.add(p);
  }
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
}

// ---------- 光照 ----------
// 夜要夠黑:環境光壓低,可讀性交給路燈假光池與標線 emissive,光池才有「亮起來」的戲劇性
scene.add(new THREE.HemisphereLight(0x35496e, 0x1a1622, 0.85));
// 跟隨車輛的冷色補光:只微微托出暗部,明暗塑形交給月光方向光與 envMap 方向性高光
// (強度過高會抹平車身形體光影,車漆讀成自發光塑膠)
const carFill = new THREE.PointLight(0x9fb8e8, 3.5, 15, 1.7);
carFill.position.set(0, 7, 0);
scene.add(carFill);
const moonLight = new THREE.DirectionalLight(0x9fb8e8, 1.0);
moonLight.position.set(-120, 260, -160);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.near = 50;
moonLight.shadow.camera.far = 700;
moonLight.shadow.camera.left = -120;
moonLight.shadow.camera.right = 120;
moonLight.shadow.camera.top = 120;
moonLight.shadow.camera.bottom = -120;
moonLight.shadow.bias = -0.0006;
scene.add(moonLight);
scene.add(moonLight.target);

// ---------- 世界 ----------
const track = new Track();
scene.add(track.buildMeshes());
const tower = createTaipei101();
scene.add(tower);
const city = createCity(track);
scene.add(city);
const car = new Car(track);
scene.add(car.mesh);

const effects = new Effects(renderer, scene, camera);
const audio = new GameAudio();
const hud = new HUD(track);
const chaseCam = new ChaseCamera(camera);
chaseCam.snapTo(car);

// ---------- 輸入 ----------
const input = { forward: false, backward: false, left: false, right: false, handbrake: false };
const keyMap = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
};
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code] !== undefined) { input[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Enter' && race.state === 'title') startRace();
  if (e.code === 'KeyR' && (race.state === 'racing' || race.state === 'finished')) restartRace();
  if (e.code === 'KeyC') chaseCam.cycleMode();
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code] !== undefined) { input[keyMap[e.code]] = false; e.preventDefault(); }
});
document.getElementById('press-start').addEventListener('click', () => {
  if (race.state === 'title') startRace();
});
document.getElementById('res-restart').addEventListener('click', restartRace);

// ---------- 賽事狀態 ----------
const race = {
  state: 'title',       // title | countdown | racing | finished
  totalLaps: 3,
  lap: 1,
  lapTimes: [],
  currentLapTime: 0,
  totalTime: 0,
  nextCheckpoint: 1,    // 0 = 起跑線
  countdownT: 0,
  countdownStep: 4,
};

function startRace() {
  audio.start();
  document.getElementById('title-screen').classList.add('hidden');
  hud.show();
  race.state = 'countdown';
  race.countdownT = 0;
  race.countdownStep = 4;
  car.reset();
  chaseCam.snapTo(car);
}

function restartRace() {
  hud.hideResults();
  race.state = 'countdown';
  race.countdownT = 0;
  race.countdownStep = 4;
  race.lap = 1;
  race.lapTimes = [];
  race.currentLapTime = 0;
  race.totalTime = 0;
  race.nextCheckpoint = 1;
  car.reset();
  chaseCam.snapTo(car);
}

function updateRace(dt) {
  if (race.state === 'countdown') {
    race.countdownT += dt;
    const step = 4 - Math.floor(race.countdownT);
    if (step !== race.countdownStep) {
      race.countdownStep = step;
      if (step >= 1 && step <= 3) { hud.centerMessage(String(step)); audio.countdownBeep(); }
      else if (step === 0) {
        hud.centerMessage('GO'); hud.subMessage('出 走 信 義 區');
        audio.goBeep();
        race.state = 'racing';
      }
    }
    return;
  }
  if (race.state !== 'racing') return;

  race.currentLapTime += dt;
  race.totalTime += dt;

  // 檢查點:進度 s ∈ [0,1),檢查點位於 k/N
  const s = car.progress;
  const target = race.nextCheckpoint / N_CHECKPOINTS;
  // 判定通過:s 越過 target (在 ±0.04 窗格內,避免抄捷徑)
  const diff = (s - target + 1) % 1;
  if (diff < 0.045) {
    if (race.nextCheckpoint === 0) {
      // 通過起跑線 → 完成一圈
      race.lapTimes.push(race.currentLapTime);
      const lapT = race.currentLapTime;
      race.currentLapTime = 0;
      const isRecord = isNaN(hud.bestLap) || lapT < hud.bestLap;
      if (isRecord) {
        hud.bestLap = lapT;
        localStorage.setItem('mc101_best', String(lapT));
        hud.setBest(lapT);
        hud.flashRecord();
        audio.recordBeep();
      }
      hud.setLastLap(lapT);
      if (race.lap >= race.totalLaps) {
        finishRace();
        return;
      }
      race.lap++;
      hud.centerMessage(`LAP ${race.lap}`, true);
      if (race.lap === race.totalLaps) hud.subMessage('最 終 圈 FINAL LAP');
      audio.lapBeep();
      race.nextCheckpoint = 1;
    } else {
      race.nextCheckpoint = (race.nextCheckpoint + 1) % N_CHECKPOINTS;
    }
  }
}

function finishRace() {
  race.state = 'finished';
  audio.finishFanfare();
  hud.showResults(race);
}

// ---------- 碰撞音效/震動橋接 ----------
let lastCollision = 0;

// ---------- 主迴圈 (固定時間步物理) ----------
const FIXED_DT = 1 / 120;
let accumulator = 0;
let lastT = performance.now() / 1000;
let fpsSamples = [];
let quality = 1;

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now() / 1000;
  let frameDt = Math.min(0.1, now - lastT);
  lastT = now;

  // 物理 (固定步) — 只有比賽/倒數時車輛可動
  accumulator += frameDt;
  const driving = race.state === 'racing';
  while (accumulator >= FIXED_DT) {
    if (driving) {
      car.update(FIXED_DT, input);
    } else if (race.state === 'countdown' || race.state === 'finished') {
      car.update(FIXED_DT, { forward: false, backward: race.state === 'finished', left: false, right: false, handbrake: true });
    }
    accumulator -= FIXED_DT;
  }

  // 撞牆回饋
  if (car.collisionImpulse > 0.3 && now - lastCollision > 0.25) {
    lastCollision = now;
    audio.collision(car.collisionImpulse);
    chaseCam.addShake(car.collisionImpulse * 0.8);
  }

  updateRace(frameDt);

  // 相機 + 特效 + HUD
  if (race.state !== 'title') {
    chaseCam.update(frameDt, car, now);
  } else {
    // 標題畫面:環繞 101 的電影運鏡 — 「左字右塔」海報構圖
    // 拉遠至 R=380 讓塔尖完整入鏡;lookAt 依當前 fov/aspect 動態左偏,
    // 塔穩定鎖在畫面 ~76% 寬處 (右 1/3),任何視窗比例都不貫穿 wordmark
    const a = now * 0.07;
    const R = 425;
    const cx = Math.cos(a) * R, cz = -40 + Math.sin(a) * R;
    camera.position.set(cx, 92 + Math.sin(now * 0.3) * 8, cz);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    const dx = -cx, dz = -40 - cz;             // 水平視線方向 (指向塔)
    const dist = Math.hypot(dx, dz);
    const inv = 1 / dist;
    const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * camera.aspect;
    const off = halfW * 0.52;                  // 塔落在 0.5 + 0.26 ≈ 右 3/4 處
    camera.lookAt(dz * inv * off, 131, -40 - dx * inv * off); // 塔位置 + 視線左向量*off (目標點下移留塔尖 headroom)
  }

  // 月光陰影跟隨車輛
  moonLight.position.set(car.pos.x - 120, 260, car.pos.z - 160);
  moonLight.target.position.set(car.pos.x, 0, car.pos.z);
  carFill.position.set(car.pos.x, 9, car.pos.z);

  tower.userData.update(now);
  city.children.forEach((c) => c.userData.update && c.userData.update(now));
  effects.update(frameDt, race.state === 'title' ? null : car, camera.position, now, input);
  audio.update(car, frameDt, race.state === 'racing');
  if (race.state !== 'title') hud.update(car, race);

  effects.render(frameDt);

  // 效能自動調節
  fpsSamples.push(frameDt);
  if (fpsSamples.length >= 90) {
    const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
    fpsSamples = [];
    if (avg > 1 / 42 && quality > 0.55) {
      quality -= 0.15;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * quality);
      effects.setSize(window.innerWidth, window.innerHeight);
    } else if (avg < 1 / 58 && quality < 1) {
      quality = Math.min(1, quality + 0.1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * quality);
      effects.setSize(window.innerWidth, window.innerHeight);
    }
  }
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  effects.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('loading-tag').textContent = 'READY — 信義區已就緒';

// QA/除錯掛鉤:允許自動化測試控制遊戲 (teleport、讀狀態)
window.__game = {
  car, race, track, camera, chaseCam, startRace, restartRace,
  teleport(s, speedKmh = 0) {
    s = ((Number(s) % 1) + 1) % 1;
    const v = Number(speedKmh) / 3.6;
    const p = track.pointAt(s);
    const tan = track.tangentAt(s);
    car.pos.set(p.x, 0, p.z);
    car.heading = Math.atan2(tan.x, tan.z);
    // 完整重設運動狀態:vel 與 speed 同步 (physics 以 vel 為準、HUD 讀 speed),
    // 並清掉殘留的轉向/側滑/碰撞衝量,避免瞬移後被舊狀態拖停或推向護欄
    car.vel.set(tan.x, 0, tan.z).multiplyScalar(v);
    car.speed = v;
    car.lateralVel = 0;
    car.steer = 0;
    car.visualYaw = 0;
    car.collisionImpulse = 0;
    car.trackHint = track.nearest(car.pos, -1);
    car.progress = s;
    // 檢查點對齊瞬移位置,賽事邏輯不會因跳過檢查點而卡住
    race.nextCheckpoint = (Math.floor(s * N_CHECKPOINTS) + 1) % N_CHECKPOINTS;
    accumulator = 0; // 丟棄瞬移前累積的物理步,避免用舊輸入偷跑
    chaseCam.snapTo(car);
  },
};

tick();
