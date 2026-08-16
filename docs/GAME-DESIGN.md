# 遊戲設計手冊 — Taipei 101 Midnight Circuit

> 對象:開發者與設計者。涵蓋美術方向、場景設計、遊戲規則、物理與 AI 模型、資料流與效能預算。
> 程式對應:見各節標注的原始檔。整體檔案結構見 README。

---

## 1. 核心概念

**一句話**:午夜(或黃昏、白天)的台北,環繞台北101 的第三人稱街機賽車。

三大設計支柱:
1. **100% 程序化資產** — 零模型檔/圖片素材/音訊檔,所有幾何、貼圖(canvas)、音效(Web Audio)都在執行期生成 → 整包遊戲極小、可完全離線
2. **街機優先** — 上手 10 秒,物理誇張但可控;深度來自甩尾、手排、Boost 時機與走線
3. **在地感** — 台北101、中文霓虹(珍珠奶茶/夜市小吃/市政府站)、小黃計程車、陽明山夜峠

美術方向:「雨後夜台北」霓虹 × ACES 電影調色 × bloom;乾燥柏油(產品決策:無雨)以程序化法線/粗糙度貼圖呈現顆粒質感。

## 2. 場景設計

### 2.1 賽道系統(`js/track.js`, `js/config.js`)
- 賽道 = **封閉 CatmullRom 曲線**(控制點定義在 `config.js TRACKS[].controlPoints`),等距取樣 1400 點
- 路面/路緣/人行道/護欄皆為「沿曲線擠出的帶狀幾何」;路寬半徑 7.5m、護欄碰撞半徑 8.6m
- `Track.query(pos, hint)` 是唯一的空間真相:回傳圈進度 `s∈[0,1)`、側向偏移 `lateral`、切線 — 物理、AI、檢查點、小地圖全靠它;hint 快取讓查詢 O(1)

### 2.2 四條賽道主題(`js/city.js`)

| id | 主題 landmark | 場景元素 |
|---|---|---|
| xinyi | tower101 | 台北101(8 節斗身+泛光殼)、中文霓虹、騎樓街景;101 視廊限高保證繞場可見塔 |
| wangan | harbor | 海面、貨櫃起重機、彩色貨櫃堆、跨海大橋燈串、倉庫 |
| mountain | mountain | 三層漸遠山稜、~2600 棵 instanced 樹、反光導標柱、民宅燈籠 |
| gp | grandstand | 人群看台、維修站、計時塔、賽事廣告板、輪胎牆、探照燈塔 |

共通道具(`createTrackFurniture`):行人天橋×2(含廣告橫幅)、門架隧道、紅綠燈(真實紅黃綠循環)、斑馬線、路邊加油群眾(billboard 彈跳揮手)。天空(`createSkyTraffic`):定期航班+巡邏直升機(探照燈)。

### 2.3 時段系統(`config.js WEATHERS` + `main.applyWeatherLighting`)
夜晚/黃昏/白天三組 lighting 預設(半球光、日/月光色溫與角度、曝光、霧色密度)+ 天空色覆蓋 + `emissiveMul`(窗燈/霓虹倍率:夜 1.0、昏 0.6、日 0.12)。白天:車燈關閉、路面標線自發光近零、濕反射條停用。

### 2.4 廣告位(`js/sponsors.js`)
每賽道**固定 2 個**路側燈箱看板(直線段、面向來車),節制置入避免反感。無檔期顯示佔位;檔期資料在 Supabase `sponsors` 表(見管理者手冊)。

## 3. 遊戲規則

### 3.1 賽事流程(狀態機,`js/main.js race.state`)
```
title ─(開始)→ countdown(3-2-1-GO) → racing ─┬→ finished(完賽結算)
  ▲                                          ├→ busted(警匪被攔停)
  └────────(放棄:二次確認)──────────────────────┘
racing 中可 paused(放棄確認框開啟時,物理與計時凍結)
```

### 3.2 圈數與檢查點
- 每場 **2 圈**;8 個檢查點位於 `s = k/8`,必須依序通過(視窗 ±0.06 ≈ 96m)→ 防抄捷徑
- 玩家圈數:通過全部檢查點後跨起跑線 lap+1;AI 圈數用帶符號位移追蹤(`_shiftS`:前跨 +1、被撞回退 -1,防灌圈)

### 3.3 計分
- solo/gp/police 皆以**總時間**排名(police 被攔停不記成績)
- 最速單圈另存本機(鍵:`mc101_best_{track}_{mode}`)
- 全球榜按 模式×賽道×難度 分榜

### 3.4 Boost
每場 3 次、每次 5 秒;期間極速上限 ×2、額外推力 +26 m/s²、紅線斷油失效、FOV 外推+車尾噴焰。設計意圖:直線資源管理 — 兩圈 × 每圈最多看 2 次廣告牌的節奏下,Boost 是玩家自主的高光時刻。

### 3.5 極速正規化(`js/vehicle.js`)
空氣阻力係數在建車時反解:`dragEff = (全油門末端推力 − 滾阻) / maxSpeed²` → **實際極速 = 選單標示極速**,不同車的性能差距真實可感。

## 4. 物理模型(`js/vehicle.js`,120Hz 固定步長)

街機自製物理,無外部引擎:
1. 速度分解為前向 vF / 側向 vL(依車頭朝向)
2. 縱向:引擎推力 × 扭力曲線(峰值 0.8 轉速;EV 平坦)× 檔位;阻力 = dragEff·v² + 滾阻
3. 側向:vL 指數衰減(gripNormal ~9.5);手煞或大側滑時改用 gripDrift(~2.4)→ **可控甩尾**
4. 偏航:轉向角 × 增益 × 速度因子;甩尾時 ×driftYawBoost
5. **護欄碰撞**:對曲線解析 — |lateral| 超限 → 位置鉗回 + 法向反彈(restitution 0.2)+ 車頭順牆力矩(防卡牆)
6. **車車碰撞**(玩家×AI/警車):圓形(半徑 2.5m)位置分離各半 + 法向相對速度反彈(0.35),AI 分離量投影回 lane/s — 不互穿
7. 變速箱:各檔速度帶線性分配(1 檔 = 22% 極速);自排 94% 升/42% 降;手排紅線斷油

## 5. AI 設計

### 5.1 大獎賽對手(`js/opponents.js`,5 台)
- 運動學跟線:目標速度 = 前方曲率 × 個人技術值;走線 = 彎心 apex 偏移 + 個人偏好
- 難度(`DIFFICULTY_TUNE`):技術帶 低 0.68-0.84 / 中 0.84-0.99 / 高 0.96-1.10;**橡皮筋只追不等**(落後玩家才加速,領先照樣全速)
- 行為:互相避讓、被玩家擠壓短暫失控擺尾、起跑反應延遲、超車呼嘯音效
- 完賽:靠路肩滑行停車、退出碰撞(防終點堆車堵路)

### 5.2 警車(`js/police.js`,固定 2 台)
- **blocker(前堵)**:貼在玩家前方 ~18m「等玩家」,車道鏡像慢半拍(假動作可騙過)、極速上限 = 玩家車 96% → 技術好可超越;被超後小幅超速回位
- **rammer(後撞)**:追進度 + 貼近時 PIT 撞車尾側(給側向衝量)
- 玩家甩開兩台 >300m → 前方部署**路障攔截**(2 車橫停+可撞飛水馬)
- **攔停判定**:警車貼身 <7m 且玩家 <8m/s → 熱度條累積(~2.6s 滿)→ BUSTED
- 音效:雙音警笛(音量隨距離)、視覺:紅藍燈條交閃+貼地掃射光斑

## 6. 資料流

### 6.1 模組相依(單向)
```
config.js ──定義──▶ main.js ──組裝──▶ Track / Car / City / 101 / Sponsors
                     │                    Car ──分派──▶ cars/*(視覺) + cars/common.js
                     ├─▶ Opponents / Police(AI,讀 Track+Car)
                     ├─▶ Effects(bloom/調色/粒子) Camera HUD Audio i18n touch
                     └─▶ leaderboard.js / sponsors.js ──REST──▶ Supabase
```

### 6.2 每幀主迴圈(`main.tick`)
```
輸入(鍵盤/觸控,含全域安全網) → 固定步物理(車輛×N 步) → 賽事邏輯(檢查點/圈數/模式AI/廣告曝光)
→ 相機(彈簧追蹤/101取景/FOV) → 世界動畫(霓虹/紅綠燈/群眾/飛行器/警燈) → HUD(儀表/小地圖含他車點)
→ 渲染(EffectComposer:場景→bloom→調色) → 後視鏡 PIP(可選,第二次渲染) → 效能自動調節(FPS<42 降解析)
```

### 6.3 本機儲存(localStorage)

| 鍵 | 內容 |
|---|---|
| `mc101_profile` | Email(小寫)、上次選的模式/賽道/車/變速箱/難度/時段 |
| `mc101_scores_v2` | 本機成績(每組 mode×track 前 50) |
| `mc101_best_{track}_{mode}` | 最速單圈 |
| `mc101_lang` | zh / en |
| `mc101_ad_impressions` | 各看板曝光累計 |

### 6.4 遠端資料流(Supabase,anon key + RLS)
```
完賽 ──POST /scores──▶ scores(RLS:只可增)      排行榜畫面 ──GET──▶ scores(依模式/賽道/難度)
開賽載入 ──GET /sponsors──▶ 有檔期→換看板圖      經過看板 ──POST──▶ ad_impressions
IP:api.ipify.org 取得後「先遮罩再上傳」(140.112.x.x);時間存 UTC、顯示轉瀏覽器時區
離線:所有遠端呼叫 fail-soft → 自動退本機資料,遊戲不中斷
```

### 6.5 PWA(`sw.js`)
同源檔案網路優先(有網必最新、斷網退快取);CDN(three.js/字型)快取優先;Supabase/ipify 純網路。改 `VERSION` 常數可強制全體換版。

## 7. 效能預算(60fps 鐵律)

- 真實動態光 ≤ 3 盞(日/月光含陰影、車頭燈、補光);其餘全是 emissive + 加法 sprite 假光
- 重複物件一律 InstancedMesh(護欄、路燈、樹、胎痕、窗格、輪胎牆…);場景物件盡量 merge
- Canvas 貼圖 ≤ 1024px;AI/警車移除真實光源
- 世界/車輛重建必走 `disposeObject()`(cars/common.js)釋放 GPU 資源;共用快取貼圖標 `userData.shared` 跳過
- 自動降畫質:平均 FPS < 42 → pixelRatio 降階(< 58 回升)

## 8. 擴充指南(常見改動的入口)

| 想做的事 | 改哪裡 |
|---|---|
| 新賽道 | `config.js TRACKS` 加控制點+theme;需要新地景 → `city.js` 加 landmark 分支 |
| 新車 | `config.js CARS` 加定義;`cars/` 新建 build 檔並在 `cars/index.js` 註冊 |
| 調物理手感 | `vehicle.js DEFAULT_TUNE` + 各車 `tune` 覆蓋 |
| 調 AI 難度 | `opponents.js DIFFICULTY_TUNE` |
| 新遊戲模式 | `config.js MODES` + `main.js` 狀態機掛鉤(參考 police/gp 的接法) |
| 新語言 | `i18n.js STRINGS` 加語系 + config 各定義加對應欄位 |
| 廣告位增減 | `sponsors.js SPONSOR_SLOTS`(設計原則:每賽道 ≤2,勿多) |
| 雨天模式 | effects.js `_initRain()` 與 track/city 濕反射程式皆保留,接回即可 |
