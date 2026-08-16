// carpreview.js — 選單車型 360° 旋轉預覽
// 做法:單一離屏 WebGL 攝影棚,每台車一次性渲染 36 幀轉盤到 spritesheet (canvas 2D),
// 之後選單動畫只是 drawImage 換幀 — 8 台車同時旋轉也零 3D 開銷。
import * as THREE from 'three';
import { CAR_BUILDERS } from './cars/index.js';
import { disposeObject } from './cars/common.js';

const FRAMES = 36;          // 10° 一幀
const FW = 220, FH = 132;   // 單幀尺寸
const COLS = 6;

const sheets = new Map();   // carId → { sheet(canvas), cols }
let renderer = null, scene = null, cam = null, stage = null;

function ensureStudio() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(FW, FH);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  // 攝影棚三點光:主光暖白、輪廓冷藍、底部微補
  const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
  key.position.set(3, 4, 2.5);
  const rim = new THREE.DirectionalLight(0x6fb0ff, 1.5);
  rim.position.set(-3.2, 2.2, -3);
  const hemi = new THREE.HemisphereLight(0x8899bb, 0x222833, 1.1);
  scene.add(key, rim, hemi);
  // 地台圓盤 (微反光深色)
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 40),
    new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.4, metalness: 0.5 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  scene.add(disc);

  cam = new THREE.PerspectiveCamera(28, FW / FH, 0.1, 60);
  cam.position.set(0, 2.0, 7.6);
  cam.lookAt(0, 0.62, 0);

  stage = new THREE.Group();
  scene.add(stage);
}

// 生成 (或取快取) 某車的轉盤 spritesheet
export function getTurntable(carDef) {
  if (sheets.has(carDef.id)) return sheets.get(carDef.id);
  ensureStudio();
  const { mesh, parts } = (CAR_BUILDERS[carDef.builder] || CAR_BUILDERS.gt)(carDef);
  // 攝影棚內不需要車燈光源/光池/體積光
  const kill = [];
  mesh.traverse((o) => { if (o.isSpotLight || o.isPointLight) kill.push(o); });
  for (const l of kill) l.parent.remove(l);
  if (parts.headlightPool) parts.headlightPool.visible = false;
  if (parts.underglow) parts.underglow.visible = false;
  stage.add(mesh);

  const rows = Math.ceil(FRAMES / COLS);
  const sheet = document.createElement('canvas');
  sheet.width = FW * COLS;
  sheet.height = FH * rows;
  const ctx = sheet.getContext('2d');
  for (let f = 0; f < FRAMES; f++) {
    mesh.rotation.y = (f / FRAMES) * Math.PI * 2 + Math.PI * 0.78; // 由 3/4 前視角開始
    renderer.render(scene, cam);
    ctx.drawImage(renderer.domElement, (f % COLS) * FW, Math.floor(f / COLS) * FH);
  }
  stage.remove(mesh);
  disposeObject(mesh);
  const rec = { sheet, cols: COLS };
  sheets.set(carDef.id, rec);
  return rec;
}

// ---- 動畫:多個選單 canvas 共用一個 rAF 迴圈 ----
const live = new Set();
let rafOn = false, frame = 0, lastStep = 0;

export function attachSpin(canvas, carDef) {
  const rec = getTurntable(carDef);
  const item = { canvas, rec };
  live.add(item);
  // 先畫第一幀,避免出現前空白
  drawFrame(item, frame);
  if (!rafOn) {
    rafOn = true;
    requestAnimationFrame(loop);
  }
}

export function clearSpins() { live.clear(); }

function drawFrame(item, f) {
  const c = item.canvas.getContext('2d');
  c.clearRect(0, 0, item.canvas.width, item.canvas.height);
  c.drawImage(item.rec.sheet,
    (f % item.rec.cols) * FW, Math.floor(f / item.rec.cols) * FH, FW, FH,
    0, 0, item.canvas.width, item.canvas.height);
}

function loop(t) {
  if (!live.size) { rafOn = false; return; }
  requestAnimationFrame(loop);
  if (t - lastStep < 75) return; // ~13fps 轉盤,復古展示廳質感
  lastStep = t;
  frame = (frame + 1) % FRAMES;
  for (const item of live) {
    if (!item.canvas.isConnected) { live.delete(item); continue; }
    drawFrame(item, frame);
  }
}
