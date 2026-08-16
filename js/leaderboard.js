// leaderboard.js — 成績系統:本機 localStorage 永遠可用;
// config.js 填入 LEADERBOARD_REMOTE (Supabase) 後自動啟用全球排行榜。
// 隱私:上傳與顯示一律使用「遮罩 IP」(末段以 x 取代),絕不儲存完整 IP。
import { LEADERBOARD_REMOTE } from './config.js';

const LS_PROFILE = 'mc101_profile';
const LS_SCORES = 'mc101_scores_v2';

// ---------- 玩家資料 ----------
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILE)) || {}; }
  catch { return {}; }
}
export function saveProfile(p) {
  localStorage.setItem(LS_PROFILE, JSON.stringify(p));
}

// ---------- 本機成績 ----------
// entry: { mode, trackId, carId, name, timeMs, bestLapMs, date }
// 排序鍵:solo/gp 用 timeMs 越小越好;police 逃脫成功以 timeMs 排,失敗不記錄
function loadScores() {
  try { return JSON.parse(localStorage.getItem(LS_SCORES)) || []; }
  catch { return []; }
}

export function saveLocalScore(entry) {
  const all = loadScores();
  all.push({ ...entry, date: new Date().toISOString() });
  // 每組 (mode, trackId) 只留前 50
  const byKey = {};
  for (const e of all) {
    const k = `${e.mode}_${e.trackId}`;
    (byKey[k] = byKey[k] || []).push(e);
  }
  const trimmed = [];
  for (const k in byKey) {
    byKey[k].sort((a, b) => a.timeMs - b.timeMs);
    trimmed.push(...byKey[k].slice(0, 50));
  }
  localStorage.setItem(LS_SCORES, JSON.stringify(trimmed));
}

export function topLocal(mode, trackId, n = 10, difficulty = null) {
  return loadScores()
    .filter((e) => e.mode === mode && (!trackId || e.trackId === trackId)
      && (!difficulty || (e.difficulty || 'normal') === difficulty))
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, n);
}

// ---------- 遮罩 IP ----------
let _maskedIp = null;
export async function getMaskedIp() {
  if (_maskedIp) return _maskedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) });
    const { ip } = await res.json();
    if (ip.includes(':')) {
      // IPv6:只留前兩組
      const parts = ip.split(':');
      _maskedIp = `${parts[0]}:${parts[1]}:x:x`;
    } else {
      const parts = ip.split('.');
      _maskedIp = `${parts[0]}.${parts[1]}.x.x`;
    }
  } catch {
    _maskedIp = 'unknown';
  }
  return _maskedIp;
}

// ---------- 全球排行榜 (Supabase REST) ----------
export const remoteEnabled = () => !!LEADERBOARD_REMOTE;

async function sb(path, opts = {}) {
  const { url, anonKey } = LEADERBOARD_REMOTE;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// 上傳成績 (fire-and-forget 建議搭配 catch)
export async function uploadScore(entry) {
  if (!remoteEnabled()) return false;
  const maskedIp = await getMaskedIp();
  await sb('scores', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      mode: entry.mode,
      track_id: entry.trackId,
      car_id: entry.carId,
      difficulty: entry.difficulty || 'normal',
      name: String(entry.name || '匿名').slice(0, 60),
      time_ms: Math.round(entry.timeMs),
      best_lap_ms: Math.round(entry.bestLapMs || 0),
      masked_ip: maskedIp,
    }),
  });
  return true;
}

export async function topRemote(mode, trackId, n = 20, difficulty = null) {
  if (!remoteEnabled()) return null;
  const filter = (trackId ? `&track_id=eq.${trackId}` : '')
    + (difficulty ? `&difficulty=eq.${difficulty}` : '');
  const rows = await sb(
    `scores?mode=eq.${mode}${filter}&order=time_ms.asc&limit=${n}` +
    `&select=name,masked_ip,time_ms,best_lap_ms,car_id,track_id,difficulty,created_at`);
  return rows.map((r) => ({
    name: r.name, maskedIp: r.masked_ip, timeMs: r.time_ms,
    bestLapMs: r.best_lap_ms, carId: r.car_id, trackId: r.track_id, date: r.created_at,
  }));
}
