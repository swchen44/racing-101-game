// i18n.js — 中/英雙語:靜態 DOM 用 data-i18n 屬性,動態字串用 t(key)
const STRINGS = {
  zh: {
    driverName: 'Email 帳號', namePlaceholder: 'name@example.com',
    emailInvalid: '請輸入有效的 Email 帳號 (不分大小寫)',
    start: '開始遊戲 START — ENTER', rankings: '排行榜 RANKINGS',
    hintDrive: '駕駛', hintDrift: '手煞車滑走', hintShift: '降檔 / 升檔 (手排)',
    hintCam: '視角', hintRestart: '重新開始', hintBoost: '加速 BOOST', hintMirror: '後視鏡',
    setupTitle: 'RACE SETUP', setupSub: '選 擇 你 的 戰 場 與 座 駕',
    secMode: '遊戲模式 MODE', secTrack: '賽道 TRACK', secCar: '車型 CAR',
    secTrans: '變速箱 TRANSMISSION', secDifficulty: '對手強度 AI LEVEL', secWeather: '時段 TIME OF DAY',
    go: '出發 RACE — ENTER', back: '返回 BACK',
    boardTitle: 'RANKINGS', boardSub: '排 行 榜',
    auto: '自排', autoEn: 'AUTOMATIC', autoDesc: '自動換檔,專心過彎',
    manual: '手排', manualEn: 'MANUAL', manualDesc: 'Q 降檔 / E 升檔,貼著紅線換檔更快',
    lap: 'LAP', time: 'TIME', last: 'LAST', best: 'BEST',
    posLabel: '名次 POSITION', wanted: '⚠ 攔截中 BUSTED', drift: '滑走 DRIFT',
    wrongway: '⚠ 逆走 WRONG WAY ⚠', record: '★ 最速紀錄 NEW RECORD ★',
    finish: 'FINISH', finishZh: '完 走 認 定', busted: 'BUSTED', bustedZh: '攔 停 出 局',
    retry: '再挑戰 RETRY — R', menu: '回主選單 MENU',
    driver: '車手', modeTrack: '模式 / 賽道', lapN: (i) => `第 ${i} 圈`, total: '總時間',
    finalPos: '最終名次', bestLap: '最速單圈',
    uploadUploading: '上傳全球排行榜中…', uploadDone: '🌏 已上傳全球排行榜',
    uploadFail: '全球排行榜上傳失敗 (成績已存本機)', uploadLocal: '成績已存本機排行榜',
    abandonTitle: '放棄本場比賽?', abandonDesc: '本場成績將不會被記錄',
    abandonYes: '放棄並返回選單', abandonNo: '繼續比賽',
    abandonBtn: '✕ 放棄',
    lapMsg: (n) => `LAP ${n}`, finalLap: '最 終 圈 FINAL LAP',
    goSub: '出 走 信 義 區', goSubPolice: '甩 開 條 子', bustedSub: '你 被 攔 停 了',
    boardHead: ['#', '車手', 'IP', '時間', '日期'], boardEmpty: '尚無紀錄 — 快去跑一場!',
    boardLoading: '讀取全球排行榜中…', boardGlobal: '🌏 全球排行榜',
    boardLocalOnly: '本機成績 (全球排行榜未設定)', boardFail: '全球排行榜連線失敗,顯示本機成績',
    rotate: '請 將 裝 置 轉 為 橫 向', rotateEn: 'ROTATE TO LANDSCAPE',
    statSpeed: '極速', statAccel: '加速', statGrip: '抓地', statDrift: '甩尾',
    topSpeed: (k) => `極速 ${k} KM/H`, lengthDiff: (km, st) => `${km} KM ・ 難度 ${st}`,
  },
  en: {
    driverName: 'EMAIL ACCOUNT', namePlaceholder: 'name@example.com',
    emailInvalid: 'Please enter a valid email (case-insensitive)',
    start: 'START — ENTER', rankings: 'RANKINGS',
    hintDrive: 'Drive', hintDrift: 'Handbrake / drift', hintShift: 'Shift down / up (manual)',
    hintCam: 'Camera', hintRestart: 'Restart', hintBoost: 'Boost', hintMirror: 'Mirror',
    setupTitle: 'RACE SETUP', setupSub: 'CHOOSE YOUR BATTLEFIELD',
    secMode: 'MODE', secTrack: 'TRACK', secCar: 'CAR',
    secTrans: 'TRANSMISSION', secDifficulty: 'AI LEVEL', secWeather: 'TIME OF DAY',
    go: 'RACE — ENTER', back: 'BACK',
    boardTitle: 'RANKINGS', boardSub: 'GLOBAL & LOCAL',
    auto: 'Automatic', autoEn: 'AUTO', autoDesc: 'Shifts for you — focus on corners',
    manual: 'Manual', manualEn: 'MANUAL', manualDesc: 'Q down / E up — shift at redline for speed',
    lap: 'LAP', time: 'TIME', last: 'LAST', best: 'BEST',
    posLabel: 'POSITION', wanted: '⚠ BUSTED METER', drift: 'DRIFT',
    wrongway: '⚠ WRONG WAY ⚠', record: '★ NEW RECORD ★',
    finish: 'FINISH', finishZh: 'RACE COMPLETE', busted: 'BUSTED', bustedZh: 'PULLED OVER',
    retry: 'RETRY — R', menu: 'MENU',
    driver: 'DRIVER', modeTrack: 'MODE / TRACK', lapN: (i) => `LAP ${i}`, total: 'TOTAL',
    finalPos: 'FINAL POSITION', bestLap: 'BEST LAP',
    uploadUploading: 'Uploading to global leaderboard…', uploadDone: '🌏 Uploaded to global leaderboard',
    uploadFail: 'Upload failed (saved locally)', uploadLocal: 'Saved to local leaderboard',
    abandonTitle: 'Abandon this race?', abandonDesc: 'This result will not be recorded',
    abandonYes: 'Abandon & return to menu', abandonNo: 'Keep racing',
    abandonBtn: '✕ QUIT',
    lapMsg: (n) => `LAP ${n}`, finalLap: 'FINAL LAP',
    goSub: 'RUN THE NIGHT', goSubPolice: 'LOSE THE COPS', bustedSub: 'YOU GOT PULLED OVER',
    boardHead: ['#', 'DRIVER', 'IP', 'TIME', 'DATE'], boardEmpty: 'No records yet — go race!',
    boardLoading: 'Loading global leaderboard…', boardGlobal: '🌏 GLOBAL LEADERBOARD',
    boardLocalOnly: 'Local scores (global not configured)', boardFail: 'Global unreachable, showing local',
    rotate: 'ROTATE TO LANDSCAPE', rotateEn: '請將裝置轉為橫向',
    statSpeed: 'SPD', statAccel: 'ACC', statGrip: 'GRP', statDrift: 'DRF',
    topSpeed: (k) => `TOP ${k} KM/H`, lengthDiff: (km, st) => `${km} KM ・ ${st}`,
  },
};

let lang = localStorage.getItem('mc101_lang') || 'zh';

export function getLang() { return lang; }
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'zh';
  localStorage.setItem('mc101_lang', lang);
  applyStatic();
}
export function t(key, ...args) {
  const v = STRINGS[lang][key] ?? STRINGS.zh[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
// 依語言取物件的顯示名:zh → name/desc,en → nameEn/descEn (缺英文時退回中文)
export function pick(obj, base = 'name') {
  if (lang === 'en') return obj[`${base}En`] ?? obj[base];
  return obj[base];
}

// 靜態 DOM:掃 data-i18n 屬性換字
export function applyStatic() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
}
