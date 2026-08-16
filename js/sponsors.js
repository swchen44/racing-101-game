// sponsors.js — 賽道廣告看板系統
// 原則:每條賽道「固定 2 個」廣告位 (直線段、面向來車),不多放避免反感。
// 無廣告主時顯示雙語佔位「歡迎刊登廣告 YOUR AD HERE」。
// 後台化:Supabase sponsors 表有符合檔期的列 → 自動換上廣告主圖 (上下架不用改版)。
// 成效:玩家每圈經過看板記一次曝光 (本機累計 + 盡力上報 ad_impressions 表)。
import * as THREE from 'three';
import { LEADERBOARD_REMOTE } from './config.js';

// 每條賽道 2 個廣告位:s = 圈進度 (選在直線出入口,視線停留長)、side = 路側 (1=左)
export const SPONSOR_SLOTS = {
  xinyi: [
    { s: 0.085, side: -1 },   // 起跑後第一條直線右側
    { s: 0.52, side: 1 },     // 對向直線左側
  ],
  wangan: [
    { s: 0.10, side: -1 },    // 南岸大直線右側
    { s: 0.56, side: 1 },     // 北岸直線左側
  ],
  mountain: [
    { s: 0.05, side: -1 },    // 起跑直線右側
    { s: 0.485, side: 1 },    // 中段較直路段左側
  ],
  gp: [
    { s: 0.345, side: -1 },   // 二號直線右側 (避開已有看台廣告的主直線)
    { s: 0.80, side: 1 },     // 回場直線左側
  ],
};

const LS_IMP = 'mc101_ad_impressions';

// ---------- 佔位貼圖:歡迎刊登廣告 (雙語,霓虹邊框,融入美術) ----------
function placeholderTexture(weatherId) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const night = weatherId !== 'day';
  // 底:深藍夜 / 亮灰日
  g.fillStyle = night ? '#0a1220' : '#e8ecf0';
  g.fillRect(0, 0, W, H);
  // 虛線邊框 (「空位」語言)
  g.strokeStyle = night ? '#3ee6a8' : '#2a8a64';
  g.lineWidth = 10;
  g.setLineDash([36, 22]);
  g.strokeRect(26, 26, W - 52, H - 52);
  g.setLineDash([]);
  // 主文案
  g.textAlign = 'center';
  g.fillStyle = night ? '#eafff5' : '#12241c';
  g.font = '900 118px "Noto Sans TC", sans-serif';
  if (night) { g.shadowColor = '#3ee6a8'; g.shadowBlur = 30; }
  g.fillText('歡迎刊登廣告', W / 2, 218);
  g.shadowBlur = 0;
  g.font = '700 88px "Chakra Petch", sans-serif';
  g.fillStyle = night ? '#ffb54d' : '#8a5a20';
  if (night) { g.shadowColor = '#ffb54d'; g.shadowBlur = 22; }
  g.fillText('YOUR AD HERE', W / 2, 340);
  g.shadowBlur = 0;
  // 小字
  g.font = '500 40px "Noto Sans TC", sans-serif';
  g.fillStyle = night ? '#7fa8c9' : '#4a5a66';
  g.fillText('廣告洽詢 AD SPACE AVAILABLE', W / 2, 434);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------- 廣告主資料 (Supabase,盡力而為;失敗回空) ----------
let _sponsorRows = null;
export async function loadSponsors() {
  if (_sponsorRows) return _sponsorRows;
  if (!LEADERBOARD_REMOTE) { _sponsorRows = []; return _sponsorRows; }
  try {
    const { url, anonKey } = LEADERBOARD_REMOTE;
    const now = new Date().toISOString();
    const res = await fetch(
      `${url}/rest/v1/sponsors?active=eq.true&select=slot,name,image_url,link_url,starts_at,ends_at`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, signal: AbortSignal.timeout(6000) });
    const rows = res.ok ? await res.json() : [];
    _sponsorRows = rows.filter((r) =>
      (!r.starts_at || r.starts_at <= now) && (!r.ends_at || r.ends_at >= now));
  } catch { _sponsorRows = []; }
  return _sponsorRows;
}

function sponsorFor(trackId, slotIdx) {
  const key = `${trackId}:${slotIdx}`;
  return (_sponsorRows || []).find((r) => r.slot === key) || null;
}

// ---------- 看板建構:2 座大型路側看板/賽道 ----------
export function createSponsorBillboards(track, trackId, weatherId) {
  const group = new THREE.Group();
  const slots = SPONSOR_SLOTS[trackId] || SPONSOR_SLOTS.xinyi;
  const night = weatherId !== 'day';
  const N = track.samples.length;

  slots.forEach((slot, idx) => {
    const sm = track.samples[Math.floor(slot.s * N) % N];
    const off = 13.5;
    const bx = sm.pos.x + sm.normal.x * off * slot.side;
    const bz = sm.pos.z + sm.normal.z * off * slot.side;
    // 面向來車 (逆切線方向),再往路面偏 18° 增加正面停留
    const yaw = Math.atan2(-sm.tan.x, -sm.tan.z) - slot.side * 0.32;

    const board = new THREE.Group();
    board.position.set(bx, 0, bz);
    board.rotation.y = yaw;

    // 支柱 ×2 + 橫樑
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.7, roughness: 0.5 });
    for (const px of [-4.2, 4.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 6.2, 10), steel);
      post.position.set(px, 3.1, -0.25);
      board.add(post);
    }
    // 面板 10 × 5m
    const sponsor = sponsorFor(trackId, idx);
    const panelMat = new THREE.MeshStandardMaterial({
      map: placeholderTexture(weatherId),
      emissive: 0xffffff,
      emissiveMap: null,
      emissiveIntensity: 0,
      roughness: 0.55, metalness: 0.1,
    });
    if (night) {
      panelMat.emissiveMap = panelMat.map;
      panelMat.emissiveIntensity = 0.9;   // 夜間背光燈箱
    }
    if (sponsor?.image_url) {
      new THREE.TextureLoader().load(sponsor.image_url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        panelMat.map = tex;
        if (night) panelMat.emissiveMap = tex;
        panelMat.needsUpdate = true;
      });
    }
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), panelMat);
    panel.position.set(0, 5.2, 0);
    board.add(panel);
    // 背板 (從後面看不穿幫)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(10.3, 5.3),
      new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.9 }));
    back.position.set(0, 5.2, -0.06);
    back.rotation.y = Math.PI;
    board.add(back);
    // 夜間頂部投射燈條 (裝飾,自發光)
    if (night) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.14, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x777d88, emissive: 0xfff2d8, emissiveIntensity: 1.6 }));
      lamp.position.set(0, 8.05, 0.35);
      board.add(lamp);
    }
    board.userData.slotIdx = idx;
    group.add(board);
  });
  return group;
}

// ---------- 曝光統計 ----------
// 每圈經過一個看板記一次;本機累計必記,遠端 (ad_impressions) 盡力上報
export class ImpressionTracker {
  constructor(trackId) {
    this.trackId = trackId;
    this.slots = SPONSOR_SLOTS[trackId] || [];
    this._seen = this.slots.map(() => false);
  }

  // 每幀以玩家圈進度呼叫;跨過看板位置 → 記曝光。lapChanged 時重置本圈已看記錄
  update(progress, lapChanged) {
    if (lapChanged) this._seen = this.slots.map(() => false);
    this.slots.forEach((slot, i) => {
      if (this._seen[i]) return;
      const d = (progress - slot.s + 1) % 1;
      if (d > 0 && d < 0.02) {   // 剛通過看板
        this._seen[i] = true;
        this._record(i);
      }
    });
  }

  _record(slotIdx) {
    const key = `${this.trackId}:${slotIdx}`;
    // 本機累計
    try {
      const all = JSON.parse(localStorage.getItem(LS_IMP) || '{}');
      all[key] = (all[key] || 0) + 1;
      localStorage.setItem(LS_IMP, JSON.stringify(all));
    } catch { /* localStorage 滿/停用時靜默 */ }
    // 遠端上報 (fire-and-forget)
    if (LEADERBOARD_REMOTE) {
      const { url, anonKey } = LEADERBOARD_REMOTE;
      fetch(`${url}/rest/v1/ad_impressions`, {
        method: 'POST',
        headers: {
          apikey: anonKey, Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ slot: key, track_id: this.trackId }),
      }).catch(() => {});
    }
  }
}
