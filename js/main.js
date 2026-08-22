// main.js — 場景組裝、選單流程、遊戲狀態機、三種模式、賽事邏輯、主迴圈
import * as THREE from 'three';
import { Track, N_CHECKPOINTS } from './track.js';
import { Car } from './vehicle.js';
import { createTaipei101 } from './taipei101.js';
import { createCity } from './city.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD, formatTime } from './hud.js';
import { ChaseCamera } from './camera.js';
import { TRACKS, CARS, MODES, DIFFICULTIES, WEATHERS, trackById, carById, modeById, weatherById } from './config.js';
import {
  loadProfile, saveProfile, saveLocalScore, topLocal,
  uploadScore, topRemote, remoteEnabled,
} from './leaderboard.js';
import { Opponents } from './opponents.js';
import { Police } from './police.js';
import { Chase, addPoliceLights, randomStolenCarId } from './chase.js';
import { chaseTune } from './config.js';
import { runArrestCutscene } from './arrest.js';
import { initTouch, isTouchDevice } from './touch.js';
import { disposeObject } from './cars/common.js';
import { Reflections, reflectionUniforms } from './reflections.js';
import { t, pick, setLang, getLang, applyStatic } from './i18n.js';
import { attachSpin, clearSpins } from './carpreview.js';
import { createSponsorBillboards, loadSponsors, ImpressionTracker } from './sponsors.js';

const $ = (id) => document.getElementById(id);

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
scene.fog = new THREE.FogExp2(0x0a0f1e, 0.0028);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2600);

// 環境反射 (讓濕路面 / 車漆反射霓虹)
const pmrem = new THREE.PMREMGenerator(renderer);
{
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 12),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x0a1420 })));
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
const hemi = new THREE.HemisphereLight(0x35496e, 0x1a1622, 0.85);
scene.add(hemi);
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

// ---------- 玩家設定 (localStorage) ----------
const profile = loadProfile();
const setup = {
  name: profile.name || '',
  mode: profile.mode || 'solo',
  trackId: profile.trackId || 'xinyi',
  carId: profile.carId || 'gt',
  transmission: profile.transmission || 'auto',
  difficulty: profile.difficulty || 'normal',
  weather: profile.weather || 'night',
  role: profile.role || 'cop',    // 緝凶追捕:cop=玩家當警察 / thief=玩家當小偷
};
function persistSetup() {
  saveProfile({ ...profile, ...setup });
}

// ---------- 天氣 / 時段光照 ----------
function applyWeatherLighting(w) {
  const L = w.lighting;
  hemi.color.setHex(L.hemiColor);
  hemi.groundColor.setHex(L.hemiGround);
  hemi.intensity = L.hemi;
  moonLight.color.setHex(L.sunColor);
  moonLight.intensity = L.sun;
  moonLight.userData.basePos = L.sunPos;
  renderer.toneMappingExposure = L.exposure;
  scene.fog.color.setHex(L.fogColor);
  scene.fog.density = L.fogDensity;
}

// ---------- 世界生命週期 ----------
let track = null;
let worldGroup = null;
let tower = null;
let car = null;
let hud = null;
let opponents = null;
let police = null;
let chase = null;
let playerCopLights = null;   // 玩家警車車頂燈 (緝凶追捕 cop 角色)
let chaseTimeLeft = 0;        // 緝凶追捕倒數剩餘秒數
let chaseResult = null;       // 'win' | 'lose' — 供結算判定

function buildWorld(trackDef, weather = weatherById('night')) {
  if (worldGroup) { scene.remove(worldGroup); disposeObject(worldGroup); }
  if (tower) { scene.remove(tower); disposeObject(tower); tower = null; }
  track = new Track(trackDef);
  // 主題 + 時段合成:時段的天色/發光倍率覆蓋主題預設
  const theme = {
    ...(trackDef.theme || {}),
    ...(weather.sky || {}),
    emissiveMul: weather.emissiveMul,
    weatherId: weather.id,
  };
  track.theme = theme;   // 路面標線/檢查點柱/濕反射條依時段調整
  worldGroup = new THREE.Group();
  worldGroup.add(track.buildMeshes());
  worldGroup.add(createCity(track, theme));
  // 廣告看板:每條賽道固定 2 個位 (無廣告主時顯示「歡迎刊登廣告」)
  worldGroup.add(createSponsorBillboards(track, trackDef.id || 'xinyi', weather.id));
  applyWeatherLighting(weather);
  // 無雨設定:路面為乾燥柏油,即時反射整組停用 (連同每幀反射 pass,省一次場景渲染)
  reflectionUniforms.uReflectStrength.value = 0;
  scene.add(worldGroup);
  if ((trackDef.theme?.landmark ?? 'tower101') === 'tower101') {
    tower = createTaipei101();
    scene.add(tower);
  }
}

function buildCar(carDef, transmission) {
  if (car) { scene.remove(car.mesh); disposeObject(car.mesh); }
  car = new Car(track, carDef, { transmission });
  scene.add(car.mesh);
}

function clearModeActors() {
  if (opponents) { opponents.dispose(); opponents = null; }
  if (police) { police.dispose(); police = null; }
  if (chase) { chase.dispose(); chase = null; }
}

loadSponsors(); // 預載廣告主檔期 (Supabase;無資料時全部顯示佔位看板)

// 初始世界:信義 (標題畫面背景)
buildWorld(trackById('xinyi'));
buildCar(carById(setup.carId), setup.transmission);

const effects = new Effects(renderer, scene, camera);
const audio = new GameAudio();
const chaseCam = new ChaseCamera(camera);
chaseCam.snapTo(car);

// 濕路面即時反射:標記場景中發光體 → 每幀鏡像渲染到 RT (路面材質在 track.js 內混入)
const reflections = new Reflections(renderer, scene, camera);
reflections.markScene(scene);

// ---------- 輸入 ----------
const input = { forward: false, backward: false, left: false, right: false, handbrake: false, shiftUp: false, shiftDown: false, boost: false };
const keyMap = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
};
window.addEventListener('keydown', (e) => {
  const typing = document.activeElement === $('player-name');
  if (typing && e.code !== 'Enter') return;
  if (keyMap[e.code] !== undefined && !typing) { input[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyE' && race.state === 'racing') input.shiftUp = true;
  if (e.code === 'KeyQ' && race.state === 'racing') input.shiftDown = true;
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && race.state === 'racing' && !race.paused) input.boost = true;
  if (e.code === 'KeyM' && ui.screen === null) toggleMirror();
  if (e.code === 'Enter') {
    if (ui.screen === 'title') showSetup();
    else if (ui.screen === 'setup') startRace();
  }
  if (e.code === 'Escape') {
    if (ui.screen === 'setup' || ui.screen === 'board') showTitle();
    else if (ui.screen === null && race.state === 'racing') toggleAbandonModal();
  }
  if (e.code === 'KeyR' && ui.screen === null && (race.state === 'racing' || race.state === 'finished')) restartRace();
  if (e.code === 'KeyC') chaseCam.cycleMode();
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code] !== undefined) { input[keyMap[e.code]] = false; e.preventDefault(); }
});

// 觸控
const touch = initTouch(input, { onCycleCam: () => chaseCam.cycleMode(), onMirror: () => toggleMirror() });
if (isTouchDevice()) document.body.classList.add('touch');

// ---------- UI 導航 ----------
const ui = { screen: 'title' };  // 'title' | 'setup' | 'board' | null(比賽中)
function switchScreen(name) {
  for (const id of ['title-screen', 'setup-screen', 'board-screen']) {
    $(id).classList.toggle('on', id === `${name}-screen`);
  }
  if (name !== 'setup') clearSpins();
  ui.screen = name;
}
function showTitle() { switchScreen('title'); }

// 帳號 = Email 格式 (不分大小寫,一律正規化為小寫)
function readEmail() {
  const el = $('player-name');
  const v = (el.value || '').trim().toLowerCase();
  el.value = v;   // 立即反映小寫
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  el.classList.toggle('invalid', !ok);
  $('name-err').classList.toggle('on', !ok);
  if (!ok) el.focus();
  return ok ? v : null;
}
$('player-name').addEventListener('input', () => {
  $('player-name').classList.remove('invalid');
  $('name-err').classList.remove('on');
});

function showSetup() {
  const email = readEmail();
  if (!email) return;            // Email 無效:停在標題頁顯示錯誤
  setup.name = email;
  persistSetup();
  renderSetupCards();
  switchScreen('setup');
}
function showBoard() {
  renderBoard();                  // 看排行榜不強制帳號
  switchScreen('board');
}

$('player-name').value = setup.name;
// 語言切換
function refreshLangButtons() {
  $('lang-zh').classList.toggle('sel', getLang() === 'zh');
  $('lang-en').classList.toggle('sel', getLang() === 'en');
}
function onLangChange(l) {
  setLang(l);
  refreshLangButtons();
  if (ui.screen === 'setup') renderSetupCards();
  if (ui.screen === 'board') renderBoard();
}
$('lang-zh').addEventListener('click', () => onLangChange('zh'));
$('lang-en').addEventListener('click', () => onLangChange('en'));
applyStatic();
refreshLangButtons();
$('btn-start').addEventListener('click', showSetup);
$('btn-board').addEventListener('click', showBoard);
$('btn-setup-back').addEventListener('click', showTitle);
$('btn-board-back').addEventListener('click', showTitle);
$('btn-go').addEventListener('click', startRace);
$('res-again').addEventListener('click', restartRace);
$('res-menu').addEventListener('click', () => {
  $('results').classList.remove('on');
  race.state = 'title';
  showTitle();
});

// ---------- 選單卡片 ----------
function card(html, sel, onClick) {
  const div = document.createElement('div');
  div.className = 'sel-card' + (sel ? ' sel' : '');
  div.innerHTML = html;
  div.addEventListener('click', onClick);
  return div;
}

function trackMiniSvg(def) {
  // 迷你賽道形狀 (polyline 正規化到 120x74)
  const pts = def.controlPoints;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const s = Math.min(110 / (maxX - minX), 64 / (maxZ - minZ));
  const ox = (120 - (maxX - minX) * s) / 2, oy = (74 - (maxZ - minZ) * s) / 2;
  const path = pts.map(([x, z]) =>
    `${(ox + (x - minX) * s).toFixed(1)},${(74 - oy - (z - minZ) * s).toFixed(1)}`).join(' ');
  return `<svg class="track-mini" viewBox="0 0 120 74"><polygon points="${path}" fill="none" stroke="#3ee6a8" stroke-width="3" stroke-linejoin="round" opacity="0.9"/></svg>`;
}

// 副標顯示「另一種語言」的名稱:zh 介面附英文名、EN 介面附中文名 (避免 EN 下主副標重複)
const altName = (obj) => (getLang() === 'en' ? obj.name : obj.nameEn);

function renderSetupCards() {
  const mc = $('mode-cards');
  mc.innerHTML = '';
  for (const m of MODES) {
    mc.appendChild(card(
      `<div class="c-name">${m.icon} ${pick(m)}</div><div class="c-en">${altName(m)}</div><div class="c-desc">${pick(m, 'desc')}</div>`,
      setup.mode === m.id,
      () => { setup.mode = m.id; persistSetup(); renderSetupCards(); }));
  }
  // 角色選擇 (僅緝凶追捕顯示)
  const isChase = setup.mode === 'chase';
  $('role-sec').style.display = isChase ? '' : 'none';
  $('role-cards').style.display = isChase ? '' : 'none';
  if (isChase) {
    const rc = $('role-cards');
    rc.innerHTML = '';
    for (const [id, nameK, enK, descK, icon] of [
      ['cop', 'roleCop', 'roleCopEn', 'roleCopDesc', '🚔'],
      ['thief', 'roleThief', 'roleThiefEn', 'roleThiefDesc', '🏎'],
    ]) {
      rc.appendChild(card(
        `<div class="c-name">${icon} ${t(nameK)}</div><div class="c-en">${t(enK)}</div><div class="c-desc">${t(descK)}</div>`,
        setup.role === id,
        () => { setup.role = id; persistSetup(); renderSetupCards(); }));
    }
  }

  const dc = $('diff-cards');
  dc.innerHTML = '';
  for (const d of DIFFICULTIES) {
    dc.appendChild(card(
      `<div class="c-name">${pick(d)}</div><div class="c-en">${altName(d)}</div><div class="c-desc">${pick(d, 'desc')}</div>`,
      setup.difficulty === d.id,
      () => { setup.difficulty = d.id; persistSetup(); renderSetupCards(); }));
  }
  const wc = $('weather-cards');
  wc.innerHTML = '';
  for (const w of WEATHERS) {
    wc.appendChild(card(
      `<div class="c-name">${w.icon} ${pick(w)}</div><div class="c-en">${altName(w)}</div>`,
      setup.weather === w.id,
      () => { setup.weather = w.id; persistSetup(); renderSetupCards(); }));
  }
  const tc = $('track-cards');
  tc.innerHTML = '';
  for (const t of TRACKS) {
    const chips = (pick(t, 'tags') || []).map((tag) => `<span class="tag-chip">${tag}</span>`).join('');
    tc.appendChild(card(
      `<div class="track-photo" style="background-image:url('assets/tracks/${t.id}.jpg')">${trackMiniSvg(t)}</div>` +
      `<div class="c-name">${pick(t)}</div><div class="c-en">${altName(t)}</div>` +
      `<div class="tag-row">${chips}</div>` +
      `<div class="c-intro">${pick(t, 'intro') || pick(t, 'desc')}</div>` +
      `<div class="c-meta">${window.__i18nLenDiff(t)}</div>`,
      setup.trackId === t.id,
      () => { setup.trackId = t.id; persistSetup(); renderSetupCards(); }));
  }
  const cc = $('car-cards');
  cc.innerHTML = '';
  for (const c of CARS) {
    const statKeys = { speed: 'statSpeed', accel: 'statAccel', grip: 'statGrip', drift: 'statDrift' };
    const bars = ['speed', 'accel', 'grip', 'drift'].map((k) =>
      `<span class="sk">${t(statKeys[k])}</span><span class="sb"><i style="width:${c.stats[k] * 20}%"></i></span>`
    ).join('');
    const carCard = card(
      `<canvas class="car-spin" width="220" height="132"></canvas>` +
      `<div class="c-name">${pick(c)}</div><div class="c-en">${altName(c)} ・ ${t('carClass', c.class)}</div>` +
      `<div class="stat-bars">${bars}</div>` +
      `<div class="c-meta">${t('topSpeed', Math.round(c.tune.maxSpeed * 3.6))}</div>` +
      `<div class="c-desc">${pick(c, 'desc')}</div>`,
      setup.carId === c.id,
      () => { setup.carId = c.id; persistSetup(); renderSetupCards(); });
    cc.appendChild(carCard);
    attachSpin(carCard.querySelector('.car-spin'), c);
  }
  const trc = $('trans-cards');
  trc.innerHTML = '';
  for (const [id, nameK, enK, descK] of [
    ['auto', 'auto', 'transAutoSub', 'autoDesc'],
    ['manual', 'manual', 'transManualSub', 'manualDesc'],
  ]) {
    trc.appendChild(card(
      `<div class="c-name">${t(nameK)}</div><div class="c-en">${t(enK)}</div><div class="c-desc">${t(descK)}</div>`,
      setup.transmission === id,
      () => { setup.transmission = id; persistSetup(); renderSetupCards(); }));
  }
}

window.__i18nLenDiff = (tr) => t('lengthDiff', tr.lengthKm, '★'.repeat(tr.difficulty) + '☆'.repeat(3 - tr.difficulty));

// ---------- 排行榜畫面 ----------
const board = { mode: 'solo', trackId: 'xinyi', difficulty: 'normal' };
// 分頁列前置群組標籤 (模式/賽道/難度),使用者一眼理解三排 tab 的意義
function tabLabel(row, key) {
  const lab = document.createElement('span');
  lab.className = 'tab-lab';
  lab.textContent = t(key);
  row.appendChild(lab);
}
async function renderBoard() {
  const mt = $('board-mode-tabs');
  mt.innerHTML = '';
  tabLabel(mt, 'labMode');
  for (const m of MODES) {
    const el = document.createElement('div');
    el.className = 'tab' + (board.mode === m.id ? ' sel' : '');
    el.textContent = pick(m);
    el.addEventListener('click', () => { board.mode = m.id; renderBoard(); });
    mt.appendChild(el);
  }
  const tt = $('board-track-tabs');
  tt.innerHTML = '';
  tabLabel(tt, 'labTrack');
  for (const t of TRACKS) {
    const el = document.createElement('div');
    el.className = 'tab' + (board.trackId === t.id ? ' sel' : '');
    el.textContent = pick(t);
    el.addEventListener('click', () => { board.trackId = t.id; renderBoard(); });
    tt.appendChild(el);
  }
  // 難度分榜 (低/中/高分開排名)
  const dt = $('board-diff-tabs');
  dt.innerHTML = '';
  tabLabel(dt, 'labDiff');
  for (const d of DIFFICULTIES) {
    const el = document.createElement('div');
    el.className = 'tab' + (board.difficulty === d.id ? ' sel' : '');
    el.textContent = pick(d);
    el.addEventListener('click', () => { board.difficulty = d.id; renderBoard(); });
    dt.appendChild(el);
  }
  const list = $('board-list');
  const src = $('board-src');
  const localRows = topLocal(board.mode, board.trackId, 20, board.difficulty);
  let rows = localRows.map((e) => ({ ...e, src: '本機' }));
  src.textContent = remoteEnabled() ? t('boardLoading') : t('boardLocalOnly');
  renderBoardRows(list, rows);
  if (remoteEnabled()) {
    try {
      const remote = await topRemote(board.mode, board.trackId, 20, board.difficulty);
      if (remote) {
        rows = remote.map((e) => ({ ...e, src: '全球' }));
        src.textContent = t('boardGlobal');
        renderBoardRows(list, rows);
      }
    } catch {
      src.textContent = t('boardFail');
    }
  }
}
function renderBoardRows(list, rows) {
  const hd = t('boardHead');
  let html = `<div class="board-row head"><span>${hd[0]}</span><span>${hd[1]}</span><span>${hd[2]}</span><span>${hd[4]}</span><span style="text-align:right">${hd[3]}</span></div>`;
  if (!rows.length) {
    html += `<div id="board-empty">${t('boardEmpty')}</div>`;
  } else {
    rows.forEach((e, i) => {
      // DB 存 UTC (created_at) / 本機存 ISO;Date 物件轉為瀏覽器時區顯示
      let when = '—';
      const iso = e.date;
      if (iso) {
        const d = new Date(iso);
        if (!isNaN(d)) {
          when = d.toLocaleString(getLang() === 'en' ? 'en-US' : 'zh-TW',
            { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
        }
      }
      html += `<div class="board-row"><span class="rk">${i + 1}</span>` +
        `<span class="nm">${escapeHtml(e.name || '匿名')}</span>` +
        `<span class="ip">${e.maskedIp || 'local'}</span>` +
        `<span class="dt">${when}</span>` +
        `<span class="tm">${formatTime(e.timeMs / 1000)}</span></div>`;
    });
  }
  list.innerHTML = html;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let adTracker = null;   // 廣告曝光統計 (每圈每看板一次)
let adPrevLap = 1;

// ---------- 賽事狀態 ----------
const race = {
  state: 'title',       // title | countdown | racing | finished | busted
  mode: 'solo',
  totalLaps: 3,
  lap: 1,
  lapTimes: [],
  currentLapTime: 0,
  totalTime: 0,
  nextCheckpoint: 1,
  countdownT: 0,
  countdownStep: 4,
  paused: false,
};

function startRace() {
  audio.start();
  setup.name = (setup.name || '').toLowerCase();
  persistSetup();
  const trackDef = trackById(setup.trackId);
  const mode = modeById(setup.mode);
  const weather = weatherById(setup.weather);

  // 緝凶追捕:玩家車依角色決定 — 警察=固定警車(小黃底盤深色塗裝)、小偷=隨機贓車
  let carDef = carById(setup.carId);
  if (setup.mode === 'chase') {
    if (setup.role === 'cop') carDef = { ...carById('taxi'), id: 'copcar', paint: 0x141a24 };
    else carDef = { ...carById(randomStolenCarId()), id: 'stolen' };
  }

  // 重建世界 (換賽道/時段) 與車輛
  buildWorld(trackDef, weather);
  buildCar(carDef, setup.transmission);
  clearModeActors();
  playerCopLights = null;
  if (setup.mode === 'gp') opponents = new Opponents(scene, track, 5, setup.difficulty);
  if (setup.mode === 'police') police = new Police(scene, track, 2);
  if (setup.mode === 'chase') {
    chase = new Chase(scene, track, { role: setup.role, difficulty: setup.difficulty });
    if (setup.role === 'cop') playerCopLights = addPoliceLights(car.mesh); // 玩家警車車頂燈
  }

  reflections.markScene(scene); // 世界/車輛/AI 重建後重新標記發光體

  hud = new HUD(track, {
    maxKmh: car.maxKmh + 10,
    storageKey: `mc101_best_${setup.trackId}_${setup.mode}`,
  });
  effects.resetTransient?.();

  switchScreen('none'); // 全部隱藏
  ui.screen = null;
  $('results').classList.remove('on');
  hud.show();
  if (setup.mode === 'gp') hud.setPosition(6, 6); else hud.hidePosition();
  if (setup.mode === 'police') hud.setWanted(0); else hud.hideWanted();
  if (setup.mode !== 'chase') hud.hideChase();
  // 緝凶追捕:左上圈速/計時板無意義 → 隱藏,改用頂部 chase-pod
  $('race-pod').style.display = setup.mode === 'chase' ? 'none' : '';
  touch.setVisible(isTouchDevice());
  touch.setManual(setup.transmission === 'manual');
  $('btn-abandon').classList.add('on');
  $('btn-mirror').classList.add('on');
  $('confirm-modal').classList.remove('on');
  // 白天關閉車燈/光池/underglow
  const lightsOn = weather.headlights;
  for (const h of car.headlights || []) h.intensity = lightsOn ? h.intensity : 0;
  if (car.headlightPool) car.headlightPool.visible = lightsOn;
  if (car.underglow) car.underglow.visible = lightsOn;

  race.mode = setup.mode;
  race.paused = false;
  chaseResult = null;
  chaseTimeLeft = setup.mode === 'chase' ? chaseTune(setup.difficulty).timeLimit : 0;
  adTracker = new ImpressionTracker(setup.trackId);
  adPrevLap = 1;
  race.state = 'countdown';
  race.totalLaps = mode.laps;
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

function restartRace() {
  startRace();
}

function updateRace(dt) {
  if (race.state === 'countdown') {
    race.countdownT += dt;
    const step = 4 - Math.floor(race.countdownT);
    if (step !== race.countdownStep) {
      race.countdownStep = step;
      if (step >= 1 && step <= 3) { hud.centerMessage(String(step)); audio.countdownBeep(); }
      else if (step === 0) {
        hud.centerMessage('GO');
        const goSub = race.mode === 'police' ? t('goSubPolice')
          : race.mode === 'chase' ? (setup.role === 'cop' ? t('goSubChaseCop') : t('goSubChaseThief'))
            : t('goSub');
        hud.subMessage(goSub);
        audio.goBeep();
        race.state = 'racing';
      }
    }
    return;
  }
  if (race.state !== 'racing') return;

  // ---- 緝凶追捕:獨立流程 (無圈數,限時 + 血量) ----
  if (race.mode === 'chase') { updateChase(dt); return; }

  race.currentLapTime += dt;
  race.totalTime += dt;

  const s = car.progress;
  const target = race.nextCheckpoint / N_CHECKPOINTS;
  const diff = (s - target + 1) % 1;
  if (diff < 0.06) {  // 判定窗 ~96m:高速+碰撞推擠也不會漏掉終點
    if (race.nextCheckpoint === 0) {
      race.lapTimes.push(race.currentLapTime);
      const lapT = race.currentLapTime;
      race.currentLapTime = 0;
      const isRecord = isNaN(hud.bestLap) || lapT < hud.bestLap;
      if (isRecord) {
        hud.bestLap = lapT;
        localStorage.setItem(hud.storageKey, String(lapT));
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
      hud.centerMessage(t('lapMsg', race.lap), true);
      if (race.lap === race.totalLaps) hud.subMessage(t('finalLap'));
      audio.lapBeep();
      race.nextCheckpoint = 1;
    } else {
      race.nextCheckpoint = (race.nextCheckpoint + 1) % N_CHECKPOINTS;
    }
  }

  // 廣告曝光:每圈經過 2 個看板各記一次
  if (adTracker) {
    adTracker.update(car.progress, race.lap !== adPrevLap);
    adPrevLap = race.lap;
  }

  // ---- 模式邏輯 ----
  const playerTotal = (race.lap - 1) + car.progress;
  if (opponents) {
    opponents.update(dt, car, playerTotal);
    hud.setPosition(opponents.playerPosition(playerTotal), opponents.cars.length + 1);
  }
  if (police) {
    const st = police.update(dt, car, performance.now() / 1000);
    hud.setWanted(st.heat);
    if (st.busted) bustedRace();
  }
}

// ---------- 緝凶追捕:每幀邏輯 ----------
function updateChase(dt) {
  race.totalTime += dt;
  chaseTimeLeft = Math.max(0, chaseTimeLeft - dt);
  // 玩家警車車頂燈閃爍
  if (playerCopLights) playerCopLights.update(Math.floor(performance.now() / 1000 * 6) % 2 === 0);

  const st = chase.update(dt, car);
  // HUD:倒數 + 血量 + 距離
  hud.setChase({
    timeLeft: chaseTimeLeft,
    health: st.health,
    maxHealth: st.maxHealth,
    dist: st.dist,
    role: setup.role,
    label: setup.role === 'cop' ? t('chaseCopLabel') : t('chaseThiefLabel'),
  });

  // 廣告曝光 (追捕也算場景曝光)
  if (adTracker) adTracker.update(car.progress, false);

  // 勝負判定
  if (st.caught) {
    // 獵物翻車被捕:cop 角色=玩家勝(制伏);thief 角色=玩家敗(被抓)
    finishChase(setup.role === 'cop' ? 'win' : 'lose');
    return;
  }
  if (chaseTimeLeft <= 0 && chase.rolloverT === 0) {
    // 時間到:cop 沒抓到=敗;thief 撐過倒數=勝
    finishChase(setup.role === 'cop' ? 'lose' : 'win');
  }
}

// 緝凶追捕結束:win/lose。cop 制伏時先播逮捕過場動畫再結算。
function finishChase(result) {
  if (race.state !== 'racing') return;
  chaseResult = result;
  race.state = 'finished';

  const preyBust = chase.caught; // 有翻車 → 進逮捕動畫
  if (preyBust) {
    const target = chase.getBustTarget(); // cop 角色:AI 小偷位置;thief:null
    audio.finishFanfare();
    document.body.classList.add('cutscene'); // 過場期間隱藏 HUD
    // 逮捕過場動畫 (驗收重點);完成後開結算
    runArrestCutscene({
      scene, camera, chaseCam, car, chase, role: setup.role, target,
      onDone: () => { document.body.classList.remove('cutscene'); showChaseResults(result); },
    });
  } else {
    // 純時間到 (無翻車):直接結算
    if (result === 'win') audio.finishFanfare(); else audio.collision(0.8);
    showChaseResults(result);
  }
}

function finishRace() {
  race.state = 'finished';
  audio.finishFanfare();
  showResultsScreen(false);
}

function bustedRace() {
  race.state = 'busted';
  hud.centerMessage('BUSTED', true);
  hud.subMessage(t('bustedSub'));
  audio.collision(1);
  setTimeout(() => showResultsScreen(true), 1600);
}

function showResultsScreen(busted) {
  // 收乾淨 HUD 疊層:後視鏡與比賽中的小按鈕不該出現在結算畫面上
  mirrorOn = false;
  $('mirror-frame').classList.remove('on');
  $('btn-abandon').classList.remove('on');
  $('btn-mirror').classList.remove('on');
  const table = $('res-table');
  const bestLapS = race.lapTimes.length ? Math.min(...race.lapTimes) : NaN;
  $('res-title').textContent = busted ? t('busted') : t('finish');
  $('res-zh').textContent = busted ? t('bustedZh') : t('finishZh');
  let html = '';
  html += `<div class="res-row"><span class="k">${t('driver')}</span><span class="v">${escapeHtml(setup.name)}</span></div>`;
  html += `<div class="res-row"><span class="k">${t('modeTrack')}</span><span class="v">${pick(modeById(race.mode))} ・ ${pick(trackById(setup.trackId))}</span></div>`;
  race.lapTimes.forEach((lt, i) => {
    const isBest = lt === bestLapS;
    html += `<div class="res-row${isBest ? ' hl' : ''}"><span class="k">${t('lapN', i + 1)}</span><span class="v">${formatTime(lt)}</span></div>`;
  });
  if (!busted) {
    html += `<div class="res-row"><span class="k">${t('total')}</span><span class="v">${formatTime(race.totalTime)}</span></div>`;
    if (race.mode === 'gp' && opponents) {
      const pos = opponents.playerPosition(race.totalLaps);
      html += `<div class="res-row hl"><span class="k">${t('finalPos')}</span><span class="v">P${pos} / ${opponents.cars.length + 1}</span></div>`;
    }
    if (!isNaN(bestLapS)) {
      html += `<div class="res-row hl"><span class="k">${t('bestLap')}</span><span class="v">${formatTime(bestLapS)}</span></div>`;
    }
  }
  table.innerHTML = html;
  $('results').classList.add('on');

  // 成績入榜 (busted 不記)
  const uploadEl = $('res-upload');
  if (!busted) {
    const entry = {
      mode: race.mode, trackId: setup.trackId, carId: setup.carId,
      difficulty: setup.difficulty,
      name: setup.name, timeMs: race.totalTime * 1000, bestLapMs: (bestLapS || 0) * 1000,
    };
    saveLocalScore(entry);
    if (remoteEnabled()) {
      uploadEl.textContent = t('uploadUploading');
      uploadScore(entry)
        .then(() => { uploadEl.textContent = t('uploadDone'); })
        .catch(() => { uploadEl.textContent = t('uploadFail'); });
    } else {
      uploadEl.textContent = t('uploadLocal');
    }
  } else {
    uploadEl.textContent = '';
  }
}

// ---------- 緝凶追捕:結算 ----------
function showChaseResults(result) {
  mirrorOn = false;
  $('mirror-frame').classList.remove('on');
  $('btn-abandon').classList.remove('on');
  $('btn-mirror').classList.remove('on');
  hud.hideChase();
  const win = result === 'win';
  const role = setup.role;
  // 標題:cop勝=制伏歸案 / thief勝=成功脫身 / cop敗=小偷脫逃(時間到) / thief敗=你被逮了
  let title, zh;
  if (win) { title = role === 'cop' ? t('chaseWin') : t('chaseEscape'); zh = role === 'cop' ? t('chaseWin') : t('chaseEscape'); }
  else { title = role === 'cop' ? t('chaseTimeUp') : t('chaseCaught'); zh = role === 'cop' ? t('chaseEscape') : t('chaseCaught'); }
  $('res-title').textContent = title;
  $('res-zh').textContent = zh;

  const healthLeft = chase ? chase.health : 0;
  let html = '';
  html += `<div class="res-row"><span class="k">${t('driver')}</span><span class="v">${escapeHtml(setup.name)}</span></div>`;
  html += `<div class="res-row"><span class="k">${t('modeTrack')}</span><span class="v">${pick(modeById('chase'))} ・ ${pick(trackById(setup.trackId))}</span></div>`;
  html += `<div class="res-row"><span class="k">${t('secRole')}</span><span class="v">${role === 'cop' ? t('roleCop') : t('roleThief')} / ${pick(DIFFICULTIES.find((d) => d.id === setup.difficulty))}</span></div>`;
  if (role === 'cop') {
    html += `<div class="res-row hl"><span class="k">${t('resTime')}</span><span class="v">${formatTime(race.totalTime)}</span></div>`;
  } else {
    html += `<div class="res-row"><span class="k">${t('resSurvive')}</span><span class="v">${formatTime(race.totalTime)}</span></div>`;
    html += `<div class="res-row hl"><span class="k">${t('resHealth')}</span><span class="v">${'❤'.repeat(Math.max(0, healthLeft))}${'·'.repeat(3 - Math.max(0, healthLeft))}</span></div>`;
  }
  $('res-table').innerHTML = html;
  $('results').classList.add('on');

  // 成績入榜 (只記勝場;敗場如同 busted 不記)
  const uploadEl = $('res-upload');
  if (win) {
    // cop:制伏耗時越短越強;thief:被撞次數越少越強 (皆 time_ms 升冪)
    const scoreMs = role === 'cop' ? race.totalTime * 1000 : (3 - healthLeft) * 1000;
    const entry = {
      mode: role === 'cop' ? 'chase_cop' : 'chase_thief',
      trackId: setup.trackId, carId: car?.def?.id || setup.carId,
      difficulty: setup.difficulty, name: setup.name, timeMs: scoreMs, bestLapMs: 0,
    };
    saveLocalScore(entry);
    if (remoteEnabled()) {
      uploadEl.textContent = t('uploadUploading');
      uploadScore(entry).then(() => { uploadEl.textContent = t('uploadDone'); })
        .catch(() => { uploadEl.textContent = t('uploadFail'); });
    } else uploadEl.textContent = t('uploadLocal');
  } else uploadEl.textContent = '';
}

// ---------- 放棄比賽 (二次確認) ----------
function toggleAbandonModal() {
  const on = $('confirm-modal').classList.toggle('on');
  race.paused = on;
}
function endRaceToMenu() {
  $('confirm-modal').classList.remove('on');
  race.paused = false;
  race.state = 'title';
  clearModeActors();
  $('btn-abandon').classList.remove('on');
  $('btn-mirror').classList.remove('on');
  $('mirror-frame').classList.remove('on');
  $('cockpit-overlay')?.classList.remove('on');
  mirrorOn = false;
  if (car?.bodyGroup) car.bodyGroup.visible = true;
  touch.setVisible(false);
  showTitle();
}
$('btn-abandon').addEventListener('click', () => { if (race.state === 'racing') toggleAbandonModal(); });
$('confirm-yes').addEventListener('click', endRaceToMenu);
$('confirm-no').addEventListener('click', () => { $('confirm-modal').classList.remove('on'); race.paused = false; });

// ---------- 後視鏡子母畫面 ----------
let mirrorOn = false;
const mirrorCam = new THREE.PerspectiveCamera(56, 3.2, 0.3, 1500);
function toggleMirror() {
  mirrorOn = !mirrorOn;
  $('mirror-frame').classList.toggle('on', mirrorOn);
}
$('btn-mirror').addEventListener('click', toggleMirror);
function renderMirror() {
  const W = window.innerWidth, H = window.innerHeight;
  const w = W > 900 ? Math.min(W * 0.38, 560) : Math.min(W * 0.3, 300);
  const h = w / 3.2;
  const x = (W - w) / 2, y = H - 24 - h - 2; // 對齊 CSS #mirror-frame (top:24)
  mirrorCam.aspect = w / h;
  mirrorCam.updateProjectionMatrix();
  const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
  mirrorCam.position.set(car.pos.x - sin * 0.4, 1.55, car.pos.z - cos * 0.4);
  mirrorCam.lookAt(car.pos.x - sin * 40, 1.2, car.pos.z - cos * 40);
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.clearDepth();
  renderer.render(scene, mirrorCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  renderer.autoClear = true;
}

// ---------- 主迴圈 ----------
const FIXED_DT = 1 / 120;
let accumulator = 0;
let lastT = performance.now() / 1000;
let fpsSamples = [];
let quality = 1;
let lastCollision = 0;

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now() / 1000;
  const frameDt = Math.min(0.1, now - lastT);
  lastT = now;

  accumulator += frameDt;
  const driving = race.state === 'racing' && !race.paused;
  while (accumulator >= FIXED_DT) {
    if (driving) {
      car.update(FIXED_DT, input);
    } else if (!race.paused && (race.state === 'countdown' || race.state === 'finished' || race.state === 'busted')) {
      car.update(FIXED_DT, { forward: false, backward: race.state !== 'countdown', left: false, right: false, handbrake: true });
    }
    accumulator -= FIXED_DT;
  }

  if (car.collisionImpulse > 0.3 && now - lastCollision > 0.25) {
    lastCollision = now;
    audio.collision(car.collisionImpulse);
    chaseCam.addShake(car.collisionImpulse * 0.8);
  }

  if (ui.screen === null && !race.paused) updateRace(frameDt);

  if (window.__arrest && window.__arrest.active) {
    // 逮捕過場動畫接管相機
    window.__arrest.update(frameDt);
  } else if (ui.screen === null) {
    chaseCam.update(frameDt, car, now);
  } else {
    // 選單背景:環繞地標的電影運鏡
    const a = now * 0.06;
    const R = 425;
    camera.position.set(Math.cos(a) * R, 110 + Math.sin(now * 0.25) * 24, -40 + Math.sin(a) * R);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    // 望向 101 (或賽道中心) — 動態左偏讓地標落在畫面右 1/3
    const lookX = 0, lookZ = -40;
    const camDir = new THREE.Vector3(lookX - camera.position.x, 0, lookZ - camera.position.z).normalize();
    const rightDir = new THREE.Vector3(-camDir.z, 0, camDir.x);
    const shift = Math.tan(THREE.MathUtils.degToRad(camera.fov * camera.aspect * 0.5) * 0.42) * R;
    camera.lookAt(lookX + rightDir.x * shift * 0.35, 165, lookZ + rightDir.z * shift * 0.35);
  }

  {
    const bp = moonLight.userData.basePos || [-120, 260, -160];
    moonLight.position.set(car.pos.x + bp[0], bp[1], car.pos.z + bp[2]);
    moonLight.target.position.set(car.pos.x, 0, car.pos.z);
  }
  carFill.position.set(car.pos.x, 7, car.pos.z);

  if (tower) tower.userData.update(now);
  if (worldGroup) {
    for (const c of worldGroup.children) {
      if (c.userData.update) c.userData.update(now);
      for (const cc of c.children) if (cc.userData?.update) cc.userData.update(now);
    }
  }
  effects.update(frameDt, ui.screen === null ? car : null, camera.position, now, input);
  audio.update(car, frameDt, race.state === 'racing');
  if (ui.screen === null && hud) {
    // 小地圖上的其他車輛 (GP 對手各自車色 / 警車紅藍閃)
    let mapOthers = null;
    if (opponents || police) {
      mapOthers = [];
      if (opponents) {
        for (const ai of opponents.cars) {
          mapOthers.push({
            x: ai.mesh.position.x, z: ai.mesh.position.z,
            color: '#' + (ai.spec?.paint ?? 0xc8d4e2).toString(16).padStart(6, '0'),
          });
        }
      }
      if (police) {
        for (const u of police.units) {
          mapOthers.push({ x: u.mesh.position.x, z: u.mesh.position.z, police: true });
        }
      }
    }
    hud.update(car, race, mapOthers);
    hud.updateBoost(car);
  }
  // 駕駛艙視角:顯示儀表框、隱藏自車車身 (免遮擋)
  {
    const cockpit = ui.screen === null && chaseCam.mode.name === 'cockpit';
    $('cockpit-overlay').classList.toggle('on', cockpit);
    const rigid = ui.screen === null && chaseCam.mode.rigid;
    if (car.bodyGroup) car.bodyGroup.visible = !rigid;
  }

  // 反射停用 (乾燥柏油):不再執行反射 pass — reflections.update()
  effects.render(frameDt);
  if (mirrorOn && ui.screen === null) renderMirror();

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  effects.setSize(window.innerWidth, window.innerHeight);
});

// ---------- QA 掛鉤 ----------
window.__game = {
  get car() { return car; },
  get race() { return race; },
  get track() { return track; },
  camera, chaseCam, startRace, restartRace, setup, showSetup, showTitle,
  teleport(sVal, speedKmh = 0) {
    const p = track.pointAt(sVal);
    const tan = track.tangentAt(sVal);
    car.pos.set(p.x, 0, p.z);
    car.heading = Math.atan2(tan.x, tan.z);
    car.vel.set(tan.x, 0, tan.z).multiplyScalar(speedKmh / 3.6);
    car.trackHint = track.nearest(car.pos, -1);
    chaseCam.snapTo(car);
  },
  // QA:直接觸發逮捕過場動畫 (需在緝凶追捕 racing 狀態)。role='cop' 演小偷被捕、'thief' 演玩家被捕
  debugArrest(forceRole) {
    if (race.mode !== 'chase' || !chase) return 'not in chase';
    if (forceRole) setup.role = forceRole;
    const prey = chase.prey || chase.actors[0];
    if (chase.role === 'cop' && prey) { prey.speed = 0; }
    chase.health = 1;
    chase._startRollover(car);          // 觸發翻車 → 下一幀 updateChase 判定 caught → 逮捕過場
    return 'arrest triggered';
  },
};

touch.setVisible(false);
tick();
