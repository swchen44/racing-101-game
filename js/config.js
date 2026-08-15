// config.js — 中央定義:賽道、車型、遊戲模式、排行榜後端設定
//
// ⚙️ 全球排行榜設定 (可選):
//   到 https://supabase.com 建立免費專案 → SQL Editor 執行 SETUP-LEADERBOARD.md 中的建表語句
//   → 把專案的 URL 與 anon key 填進 LEADERBOARD_REMOTE。留 null 時只使用本機排行榜。
export const LEADERBOARD_REMOTE = null;
// export const LEADERBOARD_REMOTE = {
//   url: 'https://xxxx.supabase.co',
//   anonKey: 'eyJ...',
// };

// ---------- 遊戲模式 ----------
export const MODES = [
  {
    id: 'solo', name: '單人計時賽', nameEn: 'TIME ATTACK', icon: '⏱',
    desc: '獨自對抗碼表,跑出最速三圈', laps: 3,
  },
  {
    id: 'police', name: '警車追逐', nameEn: 'POLICE CHASE', icon: '🚨',
    desc: '甩開警車完成三圈,被包夾攔停就出局', laps: 3,
  },
  {
    id: 'gp', name: '大獎賽', nameEn: 'GRAND PRIX', icon: '🏆',
    desc: '與 5 台 AI 車手同場競速,搶下 P1', laps: 3,
  },
];

// ---------- 賽道 ----------
export const TRACKS = [
  {
    id: 'xinyi', name: '信義午夜街道', nameEn: 'XINYI MIDNIGHT',
    desc: '環繞台北101的市街夜戰,雨後霓虹', difficulty: 2, lengthKm: 1.6,
    controlPoints: [
      [-40, -235], [70, -240], [165, -218], [224, -158], [242, -76],
      [232, 16], [252, 108], [214, 182], [124, 218], [28, 240],
      [-84, 232], [-172, 200], [-228, 128], [-244, 36], [-230, -58],
      [-238, -148], [-178, -216],
    ],
    theme: {
      landmark: 'tower101',
      buildingSkip: 0.25,          // 越低建築越密
      neonColors: null,            // null = 預設信義霓虹盤
      horizonColor: [0.28, 0.16, 0.10],
      groundTint: 0x101318,
    },
  },
  {
    id: 'wangan', name: '灣岸高速環道', nameEn: 'WANGAN SPEEDWAY',
    desc: '港灣旁的高速公路環道,長直線全開衝極速', difficulty: 1, lengthKm: 2.9,
    controlPoints: [
      [-500, -140], [-260, -195], [0, -205], [260, -195], [470, -150],
      [560, -60], [545, 45], [430, 115], [210, 150], [10, 142],
      [-175, 168], [-355, 192], [-495, 125], [-560, 0],
    ],
    theme: {
      landmark: 'harbor',
      buildingSkip: 0.55,
      neonColors: ['#37a8ff', '#7a5cff', '#2ee6d0', '#ffffff', '#ff9d4d'],
      horizonColor: [0.10, 0.14, 0.26],
      groundTint: 0x0d1016,
      skyMid: [0.045, 0.06, 0.16],       // 藍紫港灣夜色
      skyZenith: [0.014, 0.018, 0.06],
    },
  },
  {
    id: 'mountain', name: '陽明山夜峠', nameEn: 'MOUNTAIN PASS',
    desc: '髮夾彎連發的山道,甩尾者的聖地', difficulty: 3, lengthKm: 1.3,
    controlPoints: [
      [0, -160], [90, -152], [142, -92], [112, -30], [162, 32],
      [122, 92], [42, 112], [-28, 82], [-58, 142], [-140, 162],
      [-202, 102], [-172, 40], [-222, -22], [-182, -84], [-102, -72], [-60, -132],
    ],
    theme: {
      landmark: 'mountain',
      buildingSkip: 0.88,
      neonColors: ['#ffb54d', '#ff7733', '#e8ffe0', '#ffd23e'],
      horizonColor: [0.08, 0.10, 0.16],
      groundTint: 0x0c1410,
      skyMid: [0.028, 0.042, 0.10],      // 光害少 → 更暗更透的山夜
      skyZenith: [0.008, 0.014, 0.04],
      stars: { count: 1800, size: 2.4, opacity: 0.8 },
    },
  },
  {
    id: 'gp', name: '台北大獎賽環道', nameEn: 'TAIPEI GP CIRCUIT',
    desc: 'F1 級賽道:DRS 大直線 + 高速彎 + 技術彎組合', difficulty: 3, lengthKm: 2.4,
    controlPoints: [
      [-350, -120], [-100, -142], [150, -142], [350, -132], [432, -60],
      [402, 22], [302, 42], [242, 102], [302, 162], [242, 222],
      [102, 202], [2, 242], [-118, 202], [-78, 122], [-178, 82],
      [-298, 122], [-378, 42], [-362, -42],
    ],
    theme: {
      landmark: 'grandstand',
      buildingSkip: 0.7,
      neonColors: ['#ff2e4d', '#ffffff', '#37e0ff', '#ffd23e'],
      horizonColor: [0.16, 0.10, 0.18],
      groundTint: 0x121316,
      skyMid: [0.05, 0.05, 0.13],        // 賽場探照燈的微紫光害
      skyZenith: [0.014, 0.016, 0.05],
    },
  },
];

// ---------- 車型 ----------
// tune 覆蓋 vehicle.js DEFAULT_TUNE;stats 為選單顯示用 (0-5)
export const CARS = [
  {
    id: 'f1', name: '方程式 TF-01', nameEn: 'FORMULA TF-01', class: '賽車',
    builder: 'f1', paint: 0xe10f2f,
    desc: '極速 250,下壓力級抓地,賽道王者',
    stats: { speed: 5, accel: 5, grip: 5, drift: 1 },
    tune: { maxSpeed: 69.5, engineForce: 26, brakeForce: 60, gripNormal: 13, gripDrift: 3.5, steerMax: 0.56, yawGain: 3.0, gears: 8, carHalfWidth: 0.95 },
  },
  {
    id: 'gt', name: 'GT 熾焰', nameEn: 'GT BLAZE', class: '賽車',
    builder: 'gt', paint: 0xff9d0c,
    desc: '平衡型寬體超跑,信義街頭傳說',
    stats: { speed: 4, accel: 4, grip: 4, drift: 3 },
    tune: { maxSpeed: 62, engineForce: 19, gears: 6 },
  },
  {
    id: 'evsport', name: '雷霆 EV-S', nameEn: 'THUNDER EV-S', class: '電動車',
    builder: 'evsport', paint: 0x3ee6ff,
    desc: '單速電驅瞬間扭力,0-100 最快',
    stats: { speed: 4, accel: 5, grip: 4, drift: 2 },
    tune: { maxSpeed: 65, engineForce: 24, gears: 1, evTorque: true, gripNormal: 11 },
  },
  {
    id: 'rally', name: '拉力 R4', nameEn: 'RALLY R4', class: '越野車',
    builder: 'rally', paint: 0x2f6fe1,
    desc: '鬆散尾流設定,甩尾過彎的教科書',
    stats: { speed: 3, accel: 4, grip: 3, drift: 5 },
    tune: { maxSpeed: 50, engineForce: 17, gripNormal: 7, gripDrift: 2.0, driftYawBoost: 1.85, gears: 5 },
  },
  {
    id: 'pickup', name: '悍將皮卡', nameEn: 'TRAIL TITAN', class: '越野車',
    builder: 'pickup', paint: 0x3a4048,
    desc: '大腳越野皮卡,撞牆無感的裝甲車',
    stats: { speed: 2, accel: 3, grip: 3, drift: 3 },
    tune: { maxSpeed: 44, engineForce: 14, gripNormal: 8, wallRestitution: 0.1, carHalfWidth: 1.12, gears: 5 },
  },
  {
    id: 'taxi', name: '小黃 55688', nameEn: 'TAIPEI TAXI', class: '轎車',
    builder: 'taxi', paint: 0xffc21e,
    desc: '台北小黃,老司機的城市浪漫',
    stats: { speed: 3, accel: 2, grip: 4, drift: 2 },
    tune: { maxSpeed: 47, engineForce: 12, gripNormal: 9.5, gears: 5 },
  },
  {
    id: 'evcity', name: '都會 e-GO', nameEn: 'CITY e-GO', class: '電動車',
    builder: 'evcity', paint: 0x7de07a,
    desc: '輕巧電動小車,窄彎裡的靈活精靈',
    stats: { speed: 2, accel: 3, grip: 5, drift: 1 },
    tune: { maxSpeed: 41, engineForce: 13, gears: 1, evTorque: true, gripNormal: 12, steerMax: 0.7, carHalfWidth: 0.85 },
  },
  {
    id: 'suv', name: '峰行 SUV', nameEn: 'SUMMIT SUV', class: '休旅車',
    builder: 'suv', paint: 0x8a2f3c,
    desc: '全家出遊也能上賽道的高底盤休旅',
    stats: { speed: 2, accel: 2, grip: 3, drift: 2 },
    tune: { maxSpeed: 48, engineForce: 13, gripNormal: 8.5, carHalfWidth: 1.08, gears: 6 },
  },
];

export function trackById(id) { return TRACKS.find((t) => t.id === id) || TRACKS[0]; }
export function carById(id) { return CARS.find((c) => c.id === id) || CARS[1]; }
export function modeById(id) { return MODES.find((m) => m.id === id) || MODES[0]; }
