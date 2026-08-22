// config.js — 中央定義:賽道、車型、遊戲模式、排行榜後端設定
//
// ⚙️ 全球排行榜設定 (可選):
//   到 https://supabase.com 建立免費專案 → SQL Editor 執行 SETUP-LEADERBOARD.md 中的建表語句
//   → 把專案的 URL 與 anon key 填進 LEADERBOARD_REMOTE。留 null 時只使用本機排行榜。
// anon key 為設計上公開的前端金鑰,權限由資料庫 RLS 規則限制 (只能讀+新增)
export const LEADERBOARD_REMOTE = {
  url: 'https://utwviwegmddqiopcdmqi.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d3Zpd2VnbWRkcWlvcGNkbXFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTkyNjMsImV4cCI6MjEwMjMzNTI2M30.Qqa6Kxm2ciOiquCWjRyAF4pwLYm-SnenQ8XGwVXyfgQ',
};

// ---------- 遊戲模式 ----------
export const MODES = [
  {
    id: 'solo', name: '單人計時賽', nameEn: 'TIME ATTACK', icon: '⏱',
    desc: '獨自對抗碼表,跑出最速兩圈', descEn: 'Race the clock over two laps', laps: 2,
  },
  {
    id: 'police', name: '警車追逐', nameEn: 'POLICE CHASE', icon: '🚨',
    desc: '甩開警車完成兩圈,被包夾攔停就出局', descEn: 'Survive two laps: block ahead, ram behind', laps: 2,
  },
  {
    id: 'gp', name: '大獎賽', nameEn: 'GRAND PRIX', icon: '🏆',
    desc: '與 5 台 AI 車手同場競速,搶下 P1', descEn: 'Beat 5 AI drivers to P1', laps: 2,
  },
  {
    id: 'chase', name: '緝凶追捕', nameEn: 'THE CHASE', icon: '🚔',
    desc: '扮警察撞翻小偷,或當小偷開贓車逃 — 90 秒限時',
    descEn: 'Cop rams the thief, or thief flees the cops — 90s',
    laps: 0, timeLimit: 90, thiefHealth: 3, roles: true,
  },
];

// ---------- 緝凶追捕:難度參數 ----------
// impactMode:'any' 任何接觸扣血 / 'force' 需相對速度門檻 + 扣血後無敵
// aggressive:AI 是否積極逃竄(小偷)或積極追撞(警察)
// copTop:警車「絕對極速」上限 (m/s) — 不再綁定玩家速度,快車/好走線可甩開
// escapeDist:小偷拉開這麼多公尺並維持 → 警車跟丟放棄緊咬 (脫身喘息);越難越需拉更大
export const CHASE_TUNE = {
  easy:   { impactMode: 'any',   minImpactKmh: 0,  invuln: 0,   aggressive: false, aiSkill: 0.78, timeLimit: 100, copTop: 44, escapeDist: 90 },
  normal: { impactMode: 'any',   minImpactKmh: 0,  invuln: 0,   aggressive: false, aiSkill: 0.9,  timeLimit: 90,  copTop: 50, escapeDist: 115 },
  hard:   { impactMode: 'force', minImpactKmh: 42, invuln: 1.5, aggressive: true,  aiSkill: 1.02, timeLimit: 80,  copTop: 56, escapeDist: 145 },
};
export function chaseTune(diffId) { return CHASE_TUNE[diffId] || CHASE_TUNE.normal; }


// ---------- AI 難度 ----------
export const DIFFICULTIES = [
  { id: 'easy', name: '低', nameEn: 'EASY', desc: '悠閒巡航的對手', descEn: 'Relaxed rivals' },
  { id: 'normal', name: '中', nameEn: 'NORMAL', desc: '會咬住你的對手', descEn: 'Rivals that bite' },
  { id: 'hard', name: '高', nameEn: 'HARD', desc: '毫不留情的職業級', descEn: 'Merciless pros' },
];

// ---------- 天氣 / 時段 ----------
// lighting 由 main.js 套用;sky/emissiveMul 由 city.js 讀取
export const WEATHERS = [
  {
    id: 'night', name: '夜晚', nameEn: 'NIGHT', icon: '🌙',
    lighting: { hemiColor: 0x35496e, hemiGround: 0x1a1622, hemi: 0.85, sunColor: 0x9fb8e8, sun: 1.0, sunPos: [-120, 260, -160], exposure: 1.15, fogColor: 0x0a0f1e, fogDensity: 0.0028 },
    emissiveMul: 1.0, headlights: true,
  },
  {
    id: 'dusk', name: '黃昏', nameEn: 'DUSK', icon: '🌆',
    lighting: { hemiColor: 0x8a6a7e, hemiGround: 0x2a1c22, hemi: 1.7, sunColor: 0xff9a55, sun: 2.2, sunPos: [-320, 90, -80], exposure: 1.05, fogColor: 0x3a2434, fogDensity: 0.0022 },
    sky: { skyZenith: [0.10, 0.10, 0.24], skyMid: [0.55, 0.26, 0.22], horizonColor: [0.95, 0.48, 0.20] },
    emissiveMul: 0.6, headlights: true,
  },
  {
    id: 'day', name: '白天', nameEn: 'DAY', icon: '☀️',
    lighting: { hemiColor: 0xbdd3ea, hemiGround: 0x6a7078, hemi: 2.4, sunColor: 0xfff3de, sun: 3.2, sunPos: [-150, 320, 60], exposure: 1.0, fogColor: 0xa8bfd4, fogDensity: 0.0011 },
    sky: { skyZenith: [0.20, 0.42, 0.78], skyMid: [0.52, 0.68, 0.88], horizonColor: [0.78, 0.84, 0.92] },
    emissiveMul: 0.12, headlights: false,
  },
];
export function weatherById(id) { return WEATHERS.find((w) => w.id === id) || WEATHERS[0]; }
export function difficultyById(id) { return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1]; }

// ---------- 賽道 ----------
export const TRACKS = [
  {
    id: 'xinyi', name: '信義午夜街道', nameEn: 'XINYI MIDNIGHT',
    desc: '環繞台北101的市街夜戰,雨後霓虹', descEn: 'Street war around Taipei 101', difficulty: 2, lengthKm: 1.6,
    intro: '信義計畫區的心臟地帶。賽道緊貼台北101腳下,霓虹招牌與玻璃帷幕在濕潤路面上流光,中速彎與短直線交錯,是最能代表這座城市的一圈。',
    introEn: 'The heart of Xinyi District. Racing under Taipei 101 with neon reflections on wet asphalt — mid-speed corners and short straights, the signature lap of the city.',
    tags: ['台北101', '霓虹街景', '技術均衡'], tagsEn: ['Taipei 101', 'Neon streets', 'Balanced'],
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
    desc: '港灣旁的高速公路環道,長直線全開衝極速', descEn: 'Harbor highway ring, full-throttle straights', difficulty: 1, lengthKm: 2.9,
    intro: '沿著港灣延伸的高速公路環道。起重機與貨櫃堆的剪影掠過車窗,跨海大橋的燈串在遠方畫出弧線——這裡只問一件事:你敢不敢把油門踩到底。',
    introEn: 'A highway ring along the harbor. Crane silhouettes and container stacks fly past, bridge lights arc across the bay — one question only: dare you keep it pinned?',
    tags: ['極速直線', '港灣夜色', '新手友善'], tagsEn: ['Top speed', 'Harbor views', 'Beginner friendly'],
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
    desc: '髮夾彎連發的山道,甩尾者的聖地', descEn: 'Hairpin touge, drift heaven', difficulty: 3, lengthKm: 1.3,
    intro: '層疊山稜間的窄路夜峠。滿山樹海、導標柱的反光點列與民宅燈籠是唯一的觀眾,髮夾彎一個接一個——抓地是普通人的跑法,甩尾才是這裡的語言。',
    introEn: 'A narrow night pass between mountain ridges. Forest walls, reflector posts and lantern lights are your only audience. Hairpin after hairpin — grip is ordinary, drift is the language here.',
    tags: ['髮夾彎', '甩尾聖地', '高難度'], tagsEn: ['Hairpins', 'Drift heaven', 'Expert'],
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
    desc: 'F1 級賽道:DRS 大直線 + 高速彎 + 技術彎組合', descEn: 'F1-grade: DRS straight + technical sectors', difficulty: 3, lengthKm: 2.4,
    intro: '為大獎賽而生的正規賽道。滿座看台夾著 DRS 大直線,維修站燈火通明,輪胎牆與探照燈塔就位——高速彎接技術彎的組合考驗每一腳煞車的膽識。',
    introEn: 'A purpose-built grand prix circuit. Packed grandstands flank the DRS straight, the pit building glows, tyre walls and floodlights stand ready — fast corners into technical sectors test every braking point.',
    tags: ['DRS 直線', '滿座看台', '正規賽道'], tagsEn: ['DRS straight', 'Grandstands', 'GP circuit'],
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
    desc: '極速 250,下壓力級抓地,賽道王者', descEn: '250 km/h, downforce grip, track king',
    stats: { speed: 5, accel: 5, grip: 5, drift: 1 },
    tune: { maxSpeed: 69.5, engineForce: 26, brakeForce: 60, gripNormal: 13, gripDrift: 3.5, steerMax: 0.56, yawGain: 3.0, gears: 8, carHalfWidth: 1.16 },
  },
  {
    id: 'gt', name: 'GT 熾焰', nameEn: 'GT BLAZE', class: '賽車',
    builder: 'gt', paint: 0xff9d0c,
    desc: '平衡型寬體超跑,信義街頭傳說', descEn: 'Balanced widebody legend',
    stats: { speed: 4, accel: 4, grip: 4, drift: 3 },
    tune: { maxSpeed: 62, engineForce: 19, gears: 6, carHalfWidth: 1.2 },
  },
  {
    id: 'evsport', name: '雷霆 EV-S', nameEn: 'THUNDER EV-S', class: '電動車',
    builder: 'evsport', paint: 0x3ee6ff,
    desc: '單速電驅瞬間扭力,0-100 最快', descEn: 'Instant EV torque, fastest 0-100',
    stats: { speed: 4, accel: 5, grip: 4, drift: 2 },
    tune: { maxSpeed: 65, engineForce: 24, gears: 1, evTorque: true, gripNormal: 11, carHalfWidth: 1.15 },
  },
  {
    id: 'rally', name: '拉力 R4', nameEn: 'RALLY R4', class: '越野車',
    builder: 'rally', paint: 0x2f6fe1,
    desc: '鬆散尾流設定,甩尾過彎的教科書', descEn: 'Loose tail, drift textbook',
    stats: { speed: 3, accel: 4, grip: 3, drift: 5 },
    tune: { maxSpeed: 50, engineForce: 17, gripNormal: 7, gripDrift: 2.0, driftYawBoost: 1.85, gears: 5, carHalfWidth: 1.12 },
  },
  {
    id: 'pickup', name: '悍將皮卡', nameEn: 'TRAIL TITAN', class: '越野車',
    builder: 'pickup', paint: 0x3a4048,
    desc: '大腳越野皮卡,撞牆無感的裝甲車', descEn: 'Armored off-road pickup',
    stats: { speed: 2, accel: 3, grip: 3, drift: 3 },
    tune: { maxSpeed: 44, engineForce: 14, gripNormal: 8, wallRestitution: 0.1, carHalfWidth: 1.25, gears: 5 },
  },
  {
    id: 'taxi', name: '小黃 55688', nameEn: 'TAIPEI TAXI', class: '轎車',
    builder: 'taxi', paint: 0xffc21e,
    desc: '台北小黃,老司機的城市浪漫', descEn: 'Taipei taxi, veteran romance',
    stats: { speed: 3, accel: 2, grip: 4, drift: 2 },
    tune: { maxSpeed: 47, engineForce: 12, gripNormal: 9.5, gears: 5, carHalfWidth: 1.1 },
  },
  {
    id: 'evcity', name: '都會 e-GO', nameEn: 'CITY e-GO', class: '電動車',
    builder: 'evcity', paint: 0x7de07a,
    desc: '輕巧電動小車,窄彎裡的靈活精靈', descEn: 'Nimble city EV sprite',
    stats: { speed: 2, accel: 3, grip: 5, drift: 1 },
    tune: { maxSpeed: 41, engineForce: 13, gears: 1, evTorque: true, gripNormal: 12, steerMax: 0.7, carHalfWidth: 0.95 },
  },
  {
    id: 'suv', name: '峰行 SUV', nameEn: 'SUMMIT SUV', class: '休旅車',
    builder: 'suv', paint: 0x8a2f3c,
    desc: '全家出遊也能上賽道的高底盤休旅', descEn: 'Family SUV that races',
    stats: { speed: 2, accel: 2, grip: 3, drift: 2 },
    tune: { maxSpeed: 48, engineForce: 13, gripNormal: 8.5, carHalfWidth: 1.18, gears: 6 },
  },
];

export function trackById(id) { return TRACKS.find((t) => t.id === id) || TRACKS[0]; }
export function carById(id) { return CARS.find((c) => c.id === id) || CARS[1]; }
export function modeById(id) { return MODES.find((m) => m.id === id) || MODES[0]; }
