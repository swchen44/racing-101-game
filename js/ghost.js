// ghost.js — 幽靈車對戰:錄製/重播玩家最佳單圈,半透明自車幽靈 + 即時秒差
// 資料存 localStorage:key = mc101_ghost_<track>_<mode>,內容 { lapTime, samples:[{t,x,z,h,s}] }
import * as THREE from 'three';
import { CAR_BUILDERS } from './cars/index.js';
import { disposeObject } from './cars/common.js';

const KEY = (trackId, mode) => `mc101_ghost_${trackId}_${mode}`;

export function hasGhost(trackId, mode) {
  try { return !!localStorage.getItem(KEY(trackId, mode)); } catch { return false; }
}

export function loadGhost(trackId, mode) {
  try {
    const raw = localStorage.getItem(KEY(trackId, mode));
    if (!raw) return null;
    const rec = JSON.parse(raw);
    return (rec && Array.isArray(rec.samples) && rec.samples.length > 4) ? rec : null;
  } catch { return null; }
}

export function saveGhost(trackId, mode, rec) {
  try {
    // 壓縮:座標 2 位、heading 3 位、進度 4 位 → 控制 localStorage 佔用
    const samples = rec.samples.map((p) => ({
      t: +p.t.toFixed(2), x: +p.x.toFixed(2), z: +p.z.toFixed(2),
      h: +p.h.toFixed(3), s: +p.s.toFixed(4),
    }));
    localStorage.setItem(KEY(trackId, mode), JSON.stringify({ lapTime: rec.lapTime, samples }));
  } catch (e) { /* 配額不足:靜默略過 */ }
}

// 半透明幽靈自車:重播 best-lap 軌跡。不含真實光源/駕駛艙。
export class GhostCar {
  constructor(scene, carDef) {
    this.scene = scene;
    const { mesh } = (CAR_BUILDERS[carDef.builder] || CAR_BUILDERS.gt)({ paint: carDef.paint });
    // 去光源 (幽靈不打光)
    const kill = [];
    mesh.traverse((o) => { if (o.isSpotLight || o.isPointLight) kill.push(o); });
    for (const l of kill) l.parent.remove(l);
    // 幽靈材質:低不透明 + 青色自發光,關 depthWrite 免透明排序閃爍
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      const wasArray = Array.isArray(o.material);
      const mats = wasArray ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        c.transparent = true; c.opacity = 0.30; c.depthWrite = false;
        if ('emissive' in c && c.emissive) { c.emissive = new THREE.Color(0x38d2ff); c.emissiveIntensity = 0.7; }
        return c;
      });
      o.material = wasArray ? cloned : cloned[0];
      o.renderOrder = 3;
      o.castShadow = false;
    });
    this.mesh = mesh;
    this.mesh.visible = false;
    scene.add(mesh);
    this.samples = [];
    this.lapTime = 0;
  }

  setRecording(rec) {
    this.samples = rec.samples || [];
    this.lapTime = rec.lapTime || 0;
    this.mesh.visible = this.samples.length > 1;
  }

  // 依「本圈時間 t (秒)」重播定位;t 超出範圍則停在端點
  update(t) {
    const s = this.samples;
    if (!s.length) return;
    if (t <= s[0].t) return this._apply(s[0], s[0], 0);
    const last = s[s.length - 1];
    if (t >= last.t) return this._apply(last, last, 0);
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid].t <= t) lo = mid; else hi = mid; }
    const a = s[lo], b = s[hi];
    this._apply(a, b, (t - a.t) / Math.max(1e-4, b.t - a.t));
  }

  _apply(a, b, f) {
    this.mesh.position.set(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f);
    let dh = b.h - a.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.mesh.rotation.y = a.h + dh * f;
  }

  // 給定進度 prog(0-1) → 幽靈跑到該進度所花時間 (HUD 秒差用);無資料回 null
  timeAtProgress(prog) {
    const s = this.samples;
    if (s.length < 2) return null;
    if (prog <= s[0].s) return s[0].t;
    if (prog >= s[s.length - 1].s) return s[s.length - 1].t;
    for (let i = 1; i < s.length; i++) {
      if (s[i].s >= prog) {
        const a = s[i - 1], b = s[i];
        return a.t + (b.t - a.t) * ((prog - a.s) / Math.max(1e-5, b.s - a.s));
      }
    }
    return s[s.length - 1].t;
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    disposeObject(this.mesh);
    this.mesh = null;
  }
}
