// hud.js — 速度表、圈速計時、小地圖、中央訊息、結算畫面
import { N_CHECKPOINTS } from './track.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  // opts: { maxKmh 速度表滿刻度, storageKey 最速單圈的 localStorage 鍵 (依賽道+模式) }
  constructor(track, opts = {}) {
    this.track = track;
    this.maxKmh = Math.ceil((opts.maxKmh || 230) / 20) * 20;
    this.storageKey = opts.storageKey || 'mc101_best';
    this.gauge = $('speed-gauge').getContext('2d');
    this.minimap = $('minimap').getContext('2d');
    this.speedNum = $('speed-num');
    this.gearNum = $('gear-num');
    this.posPod = $('pos-pod');
    this.posNum = $('pos-num');
    this.posTotal = $('pos-total');
    this.wantedPod = $('wanted-pod');
    this.wantedFill = $('wanted-fill');
    this.dangerVignette = $('danger-vignette');
    this._lastPos = null; // 大獎賽名次 (偵測變化以觸發跳動動畫)
    this.lapNum = $('lap-num');
    this.tCurrent = $('t-current').querySelector('.v');
    this.tLast = $('t-last').querySelector('.v');
    this.tBest = $('t-best').querySelector('.v');
    this.driftTag = $('drift-tag');
    this.wrongway = $('wrongway');
    this.centerMsg = $('center-msg');
    this.subMsg = $('sub-msg');
    this.recordFlash = $('record-flash');
    this._mapBounds = this._computeMapBounds();
    this._lastSpeedShown = -1;
    this._trail = []; // 小地圖車輛拖尾 (世界座標歷史)
    // 檢查點世界座標 (供小地圖標記)
    this._cpPoints = [];
    const N = this.track.samples.length;
    for (let k = 1; k < N_CHECKPOINTS; k++) {
      const s = this.track.samples[Math.floor(k / N_CHECKPOINTS * N)];
      this._cpPoints.push({ x: s.pos.x, z: s.pos.z });
    }
    // LAST/BEST 空狀態:優雅的長破折號而非佔位錯誤感
    this.tLast.textContent = '—';
    this.tLast.classList.add('empty');
    this.bestLap = parseFloat(localStorage.getItem(this.storageKey) || 'NaN');
    if (!isNaN(this.bestLap)) {
      this.tBest.textContent = formatTime(this.bestLap);
      this.tBest.classList.remove('empty');
    } else {
      this.tBest.textContent = '—';
      this.tBest.classList.add('empty');
    }
  }

  show() {
    $('race-pod').style.opacity = '1';
    $('speed-pod').style.opacity = '1';
    $('minimap-wrap').style.opacity = '1';
  }

  _computeMapBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.track.samples) {
      minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z); maxZ = Math.max(maxZ, s.pos.z);
    }
    return { minX, maxX, minZ, maxZ };
  }

  centerMessage(text, small) {
    const el = this.centerMsg;
    el.textContent = text;
    el.style.fontSize = small ? '64px' : '120px';
    el.classList.remove('pop');
    void el.offsetWidth; // 重觸發動畫
    el.classList.add('pop');
  }

  subMessage(text) {
    const el = this.subMsg;
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  flashRecord() {
    const el = this.recordFlash;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  update(car, race) {
    // 速度數字
    const kmh = Math.round(car.speedKmh);
    if (kmh !== this._lastSpeedShown) {
      this.speedNum.textContent = kmh;
      this._lastSpeedShown = kmh;
    }
    this._drawGauge(car.speedKmh / this.maxKmh, car.driftAmount);
    // 檔位顯示:EV 單速顯示「EV」;自排 D、手排 M + 檔位
    if (this.gearNum) {
      const label = car.tune.gears <= 1 ? 'EV'
        : (car.transmission === 'manual' ? `M${car.gear}` : `D${car.gear}`);
      if (this.gearNum.textContent !== label) this.gearNum.textContent = label;
      this.gearNum.classList.toggle('limiter', !!car.revLimiter);
    }
    this.driftTag.classList.toggle('on', car.drifting);
    this.wrongway.classList.toggle('on', car.wrongWay && race.state === 'racing');

    // 時間
    if (race.state === 'racing') {
      this.tCurrent.textContent = formatTime(race.currentLapTime);
    }
    this.lapNum.textContent = Math.min(race.lap, race.totalLaps);
    const totalTxt = `/ ${race.totalLaps}`;
    const lapTotalEl = $('lap-total');
    if (lapTotalEl.textContent !== totalTxt) lapTotalEl.textContent = totalTxt;

    this._drawMinimap(car, race);
  }

  setLastLap(t) { this.tLast.textContent = formatTime(t); this.tLast.classList.remove('empty'); }
  setBest(t) { this.tBest.textContent = formatTime(t); this.tBest.classList.remove('empty'); }

  // 大獎賽名次顯示;名次變化時跳動 (超車=翡翠、被超=紅)
  setPosition(p, total) {
    this.posPod.classList.add('on');
    if (p !== this._lastPos) {
      this.posNum.textContent = `P${p}`;
      if (this._lastPos !== null) {
        this.posNum.classList.remove('bump', 'up', 'down');
        void this.posNum.offsetWidth; // 重觸發動畫
        this.posNum.classList.add('bump', p < this._lastPos ? 'up' : 'down');
      }
      this._lastPos = p;
    }
    this.posTotal.textContent = `/ ${total}`;
  }
  hidePosition() {
    this.posPod.classList.remove('on');
    this.posNum.classList.remove('bump', 'up', 'down');
    this._lastPos = null;
  }

  // Boost 剩餘顯示 (3 顆點;燃燒中的下一顆閃橘光)
  updateBoost(car) {
    const pod = $('boost-pips');
    if (!pod) return;
    pod.classList.add('on');
    const pips = pod.querySelectorAll('.pip');
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle('full', i < car.boostsLeft);
      pips[i].classList.toggle('burning', car.boosting && i === car.boostsLeft);
    }
  }

  // 警車追逐通緝條 (heat 0..1);危險時畫面邊緣紅色 vignette 脈動
  setWanted(heat) {
    this.wantedPod.classList.add('on');
    this.wantedFill.style.width = `${Math.round(heat * 100)}%`;
    const danger = heat > 0.55;
    this.wantedPod.classList.toggle('danger', danger);
    if (this.dangerVignette) this.dangerVignette.classList.toggle('on', danger);
  }
  hideWanted() {
    this.wantedPod.classList.remove('on');
    if (this.dangerVignette) this.dangerVignette.classList.remove('on');
  }

  _drawGauge(ratio, drift) {
    // 一體式速度模組:數字讀數 (DOM) 疊在圓心,canvas 只畫弧/刻度/浮動指針
    // canvas 380px 顯示 190px → 2x 密度,刻度字 26px 於螢幕上約 13px 可讀
    const g = this.gauge;
    const W = 380, cx = W / 2, cy = W / 2, r = 152;
    g.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    // 半透明圓底:把 DOM 數字與場景隔離,弱化背後亮窗干擾
    g.fillStyle = 'rgba(6,10,20,0.55)';
    g.beginPath(); g.arc(cx, cy, r + 14, 0, Math.PI * 2); g.fill();
    // 背景弧 (提亮:低速時 gauge 仍清晰可讀)
    g.lineWidth = 18;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(60,90,120,0.8)';
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    // 常駐 redline 段 (82%~100%)
    g.strokeStyle = 'rgba(150,28,52,0.9)';
    g.beginPath(); g.arc(cx, cy, r, a0 + (a1 - a0) * 0.82, a1); g.stroke();
    // 速度弧 (翡翠→琥珀→紅)
    const clamped = Math.min(1, ratio);
    const col = clamped < 0.55 ? '#3ee6a8' : clamped < 0.82 ? '#ffb54d' : '#ff4d6d';
    if (clamped > 0.002) {
      g.strokeStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 20;
      g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * clamped); g.stroke();
      g.shadowBlur = 0;
    }
    // 刻度:12 格。端點數字 0/230 不畫 —— 它們會落在 DOM 的 KM/H 兩側打架;
    // 只留頂部 '120' 一個錨點,圓心維持「大數字 + KM/H」兩層乾淨層級
    g.lineWidth = 3;
    g.font = '600 26px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 12; i++) {
      const a = a0 + (a1 - a0) * (i / 12);
      const r1 = r - 24, r2 = i % 6 === 0 ? r - 40 : r - 32;
      g.strokeStyle = i / 12 <= clamped ? 'rgba(230,255,245,0.9)' : 'rgba(120,155,185,0.6)';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.stroke();
      if (i === 6) {
        g.fillStyle = i / 12 <= clamped ? 'rgba(220,245,255,0.95)' : 'rgba(150,185,215,0.8)';
        const rl = r - 66;
        g.fillText(String(Math.round(this.maxKmh / 2)), cx + Math.cos(a) * rl, cy + Math.sin(a) * rl + 1);
      }
    }
    // 浮動指針段 (只佔外圈環帶,圓心讓給數字讀數;無尾端配重)
    const na = a0 + (a1 - a0) * clamped;
    const nca = Math.cos(na), nsa = Math.sin(na);
    g.shadowColor = col;
    g.shadowBlur = 14;
    g.lineCap = 'round';
    g.strokeStyle = col;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(cx + nca * (r - 74), cy + nsa * (r - 74));
    g.lineTo(cx + nca * (r - 30), cy + nsa * (r - 30));
    g.stroke();
    g.strokeStyle = '#eafff5';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx + nca * (r - 60), cy + nsa * (r - 60));
    g.lineTo(cx + nca * (r - 30), cy + nsa * (r - 30));
    g.stroke();
    g.shadowBlur = 0;
    // 甩尾內圈 (貼著刻度內側,不侵入數字區)
    if (drift > 0.02) {
      g.lineWidth = 6;
      g.strokeStyle = `rgba(255,181,77,${drift})`;
      g.shadowColor = '#ffb54d';
      g.shadowBlur = 14;
      g.beginPath(); g.arc(cx, cy, r - 46, a0, a0 + (a1 - a0) * drift); g.stroke();
      g.shadowBlur = 0;
    }
  }

  _drawMinimap(car, race) {
    const g = this.minimap;
    const W = 344;
    const t = performance.now() * 0.001;
    const pulse = 0.5 + Math.sin(t * 5) * 0.5; // 0..1 目標檢查點脈動
    g.clearRect(0, 0, W, W);
    // 不透明圓形底:與背後亮窗大樓隔離,確保賽道線可讀
    g.fillStyle = 'rgba(6,10,20,0.88)';
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2); g.fill();
    const b = this._mapBounds;
    const pad = 40;
    const scale = Math.min((W - pad * 2) / (b.maxX - b.minX), (W - pad * 2) / (b.maxZ - b.minZ));
    const toMap = (x, z) => [
      pad + (x - b.minX) * scale + (W - pad * 2 - (b.maxX - b.minX) * scale) / 2,
      W - (pad + (z - b.minZ) * scale + (W - pad * 2 - (b.maxZ - b.minZ) * scale) / 2),
    ];
    // 賽道外框光暈 (9px 外光暈 + 6px 暗色芯:172px 顯示下仍讀得出賽道形狀)
    g.strokeStyle = 'rgba(62,230,168,0.9)';
    g.lineWidth = 9;
    g.lineJoin = 'round';
    g.shadowColor = 'rgba(62,230,168,0.8)';
    g.shadowBlur = 10;
    g.beginPath();
    for (let i = 0; i <= this.track.samples.length; i += 12) {
      const s = this.track.samples[i % this.track.samples.length];
      const [mx, my] = toMap(s.pos.x, s.pos.z);
      i === 0 ? g.moveTo(mx, my) : g.lineTo(mx, my);
    }
    g.closePath();
    g.stroke();
    g.shadowBlur = 0;
    // 賽道內色
    g.strokeStyle = 'rgba(8,14,22,0.95)';
    g.lineWidth = 6;
    g.stroke();
    // 檢查點菱形:下一個目標 = 琥珀色大菱形 + 脈動光暈,其餘維持青色
    // (_cpPoints[k-1] 對應 race.nextCheckpoint === k;nextCheckpoint 0 = 起終點線)
    const nextIdx = race && race.state === 'racing' ? race.nextCheckpoint - 1 : -99;
    for (let i = 0; i < this._cpPoints.length; i++) {
      const cp = this._cpPoints[i];
      const [px, py] = toMap(cp.x, cp.z);
      const isNext = i === nextIdx;
      const sz = isNext ? 9 + pulse * 2 : 7;
      if (isNext) {
        // 脈動光暈
        g.fillStyle = `rgba(255,181,77,${0.12 + pulse * 0.2})`;
        g.beginPath(); g.arc(px, py, 14 + pulse * 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffb54d';
        g.shadowColor = '#ffb54d';
        g.shadowBlur = 10 + pulse * 8;
      } else {
        g.fillStyle = 'rgba(77,216,255,0.9)';
      }
      g.beginPath();
      g.moveTo(px, py - sz); g.lineTo(px + sz, py); g.lineTo(px, py + sz); g.lineTo(px - sz, py);
      g.closePath(); g.fill();
      if (isNext) {
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    // 起終點:橫跨賽道的雙色短線 (白+翡翠)
    const s0 = this.track.samples[0];
    const [sx, sy] = toMap(s0.pos.x, s0.pos.z);
    const nx = s0.normal.x, nz = s0.normal.z;
    const nl = Math.hypot(nx * scale, -nz * scale) || 1;
    const ux = (nx * scale) / nl, uy = (-nz * scale) / nl; // 地圖空間的賽道法線單位向量
    g.lineCap = 'butt';
    // 下一目標是起終點線時,同樣給脈動光暈強調
    const finishIsNext = race && race.state === 'racing' && race.nextCheckpoint === 0;
    if (finishIsNext) {
      g.shadowColor = '#ffb54d';
      g.shadowBlur = 10 + pulse * 10;
    }
    g.lineWidth = finishIsNext ? 4.5 : 3;
    g.strokeStyle = finishIsNext ? '#ffd9a0' : '#ffffff';
    g.beginPath(); g.moveTo(sx - ux * 11, sy - uy * 11); g.lineTo(sx + ux * 11, sy + uy * 11); g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 3;
    g.strokeStyle = '#3ee6a8';
    g.beginPath(); g.moveTo(sx - ux * 11 - uy * 3.5, sy - uy * 11 + ux * 3.5); g.lineTo(sx + ux * 11 - uy * 3.5, sy + uy * 11 + ux * 3.5); g.stroke();
    // 101 位置 (僅信義賽道)
    if ((this.track.theme?.landmark ?? 'tower101') === 'tower101') {
      const [tx, ty] = toMap(0, -40);
      g.fillStyle = '#3ee6a8';
      g.shadowColor = '#3ee6a8'; g.shadowBlur = 8;
      g.beginPath();
      g.moveTo(tx, ty - 9); g.lineTo(tx + 5, ty + 6); g.lineTo(tx - 5, ty + 6);
      g.closePath(); g.fill();
      g.shadowBlur = 0;
    }
    // 車輛拖尾 (每隔一小段距離記錄一點,畫 3 段漸淡)
    let last = this._trail[this._trail.length - 1];
    if (last && (last.x - car.pos.x) ** 2 + (last.z - car.pos.z) ** 2 > 3600) {
      this._trail.length = 0; last = null; // 重新開始/傳送時清除舊拖尾
    }
    if (!last || (last.x - car.pos.x) ** 2 + (last.z - car.pos.z) ** 2 > 36) {
      this._trail.push({ x: car.pos.x, z: car.pos.z });
      if (this._trail.length > 3) this._trail.shift();
    }
    for (let i = 0; i < this._trail.length; i++) {
      const p = this._trail[i];
      const [px, py] = toMap(p.x, p.z);
      const fade = (i + 1) / (this._trail.length + 1);
      g.fillStyle = `rgba(255,181,77,${0.15 + fade * 0.35})`;
      g.beginPath(); g.arc(px, py, 2 + fade * 1.5, 0, Math.PI * 2); g.fill();
    }
    // 車 (放大箭頭 + 白色描邊,深色賽道上一眼可辨)
    const [cx2, cy2] = toMap(car.pos.x, car.pos.z);
    g.save();
    g.translate(cx2, cy2);
    g.rotate(-car.heading + Math.PI);
    g.fillStyle = '#ffb54d';
    g.shadowColor = '#ffb54d'; g.shadowBlur = 12;
    g.beginPath();
    g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 5); g.lineTo(-8, 9);
    g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
  }

  showResults(race) {
    const table = $('res-table');
    let html = '';
    race.lapTimes.forEach((t, i) => {
      const isBest = t === Math.min(...race.lapTimes);
      html += `<div class="res-row${isBest ? ' hl' : ''}"><span class="k">第 ${i + 1} 圈</span><span class="v">${formatTime(t)}</span></div>`;
    });
    html += `<div class="res-row"><span class="k">總時間</span><span class="v">${formatTime(race.totalTime)}</span></div>`;
    html += `<div class="res-row hl"><span class="k">最速單圈</span><span class="v">${formatTime(Math.min(...race.lapTimes))}</span></div>`;
    table.innerHTML = html;
    $('results').classList.add('on');
  }

  hideResults() { $('results').classList.remove('on'); }
}

export function formatTime(t) {
  if (t == null || isNaN(t)) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
