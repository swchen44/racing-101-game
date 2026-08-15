# TAIPEI 101 — 午夜疾走 Midnight Circuit

> 🌏 [English version: README.md](./README.md)

以午夜雨後的台北信義區為舞台、環繞台北 101 的第三人稱 3D 街機賽車遊戲。使用 **純 Three.js** 打造 — 所有資產(101 大樓、城市、跑車、每一張貼圖與每一個音效)皆為 **100% 程式即時程序化生成**,零模型檔、零圖片檔、零音訊檔。

![標題畫面](docs/screenshots/title.png)

| | | |
|---|---|---|
| ![直線](docs/screenshots/straight.png) | ![甩尾](docs/screenshots/drift.png) | ![台北101](docs/screenshots/tower.png) |

---

## 🎮 使用者指南

### 開始遊玩

ES modules 需要 HTTP 環境(不能直接開 `file://`),任何靜態伺服器皆可:

```bash
git clone https://github.com/swchen44/racing-101-game.git
cd racing-101-game
python3 -m http.server 8080     # 或 npx serve
# 開啟 http://localhost:8080
```

需支援 WebGL2 的瀏覽器(Chrome / Edge / Firefox / Safari)。Three.js 由 CDN 載入,首次開啟需要網路連線。

### 操作

| 按鍵 | 動作 |
|---|---|
| `W` / `↑` | 加速 |
| `S` / `↓` | 煞車 / 倒車 |
| `A` `D` / `←` `→` | 轉向 |
| `Space` | 手煞車 — 過彎時按住即可**甩尾** |
| `C` | 切換視角(追逐 / 遠景 / 車頭) |
| `R` | 重新開始 |
| `Enter` | 標題畫面開始遊戲 |

### 規則

- 環繞台北 101 的封閉賽道,共 **3 圈**。
- **8 個依序檢查點**驗證圈數 — 抄捷徑不算。
- **最速單圈**存於本機(`localStorage`)並顯示在 HUD;刷新紀錄會觸發「最速紀錄」特效。
- 全程混凝土護欄:刮牆會噴火花並損失速度;逆向行駛會出現「逆走」警告。

---

## 🎨 設計文件

### 美術方向 —「雨夜信義區」

一個貫徹到底的視覺主張:午夜雨後的信義區。101 的翡翠綠玻璃、鈉黃路燈、中文霓虹招牌(誠品書店、深夜食堂、珍珠奶茶…)、映著萬千燈火的濕潤柏油,以及 ACES tone mapping 下 teal-and-amber 的電影級調色與 bloom 光暈。HUD 字型以 Zen Dots(展示體)搭配 Chakra Petch 與 Noto Sans TC,構成雙語賽車視覺識別。

### 世界構築

- **賽道**:環繞 101 的封閉 CatmullRom 曲線(約 1.6 km)。路面、路緣石、人行道、護欄皆為沿曲線擠出的帶狀幾何。車道標線與瀝青顆粒是 canvas 繪製貼圖,並帶 emissive 通道讓標線在夜間保持可讀。
- **台北 101**:以其標誌性建築語彙程序化組裝 — 裙樓、收分基座、**8 節上寬下窄的「斗」形節身**(竹節/如意母題)、如意飾、節冠與塔尖、閃爍航空警示燈,並以當夜翡翠綠泛光上照。
- **城市**:建築為 instanced box 搭配雙 canvas 貼圖(深色 albedo + 亮窗 emissive,亮窗遵循真實夜景邏輯:連續橫排點亮、高樓層較暗、部分全暗樓)。霓虹招牌為 canvas 繪製中文字加光暈。遠景天際線剪影環與帶星空、光害地平線的漸層 shader 天空收束整個場景。
- **假光預算**:路燈光池、招牌光暈、燈頭光斑全部使用加法混合的 sprite/貼花 — 幾乎不用真實光源。真實動態光只有月光(含陰影)、車頭燈與少量補光,以守住 60 fps。

### 車輛與物理

自製街機物理(不用物理引擎):每個固定步長(120 Hz)將速度分解為前向/側向分量。側向抓地以指數衰減 — 手煞車時衰減變弱即產生可控**甩尾**;偏航增益隨速度縮放並在甩尾時加成。護欄碰撞*直接對曲線解析求解*:將車輛相對賽道中心線的側向偏移鉗制在護欄寬度內,附帶反彈係數、火花爆發與車頭順牆。透過 hint 追蹤的最近取樣搜尋,每幀 O(1)。

### 攝影機與遊戲手感

彈簧阻尼追逐攝影機:速度連動 FOV(62°→84°)、高速壓低鏡位、甩尾橫向偏移、碰撞震動、彎心預讀(讀取前方 35 m 賽道曲率提前看向彎心),以及**地標取景系統**:當車頭朝向台北 101 時,鏡頭自動抬升並橫移讓位,把塔構圖進畫面上 1/3。

### 音效

全部 Web Audio API 合成:引擎 = 鋸齒波 + 次階方波過低通濾波器加模擬檔位;甩尾胎鳴 = 帶通噪音;風切、排氣、碰撞悶響、倒數嗶聲與完賽號角皆為執行期合成。

---

## 🛠 開發者指南

### 檔案結構

```
index.html          HUD DOM/CSS、標題/結算畫面、import map (three@0.160 CDN)
js/main.js          渲染器、場景、光照、狀態機、固定步長主迴圈
js/track.js         Track 類:曲線、取樣、query()、全部賽道網格
js/vehicle.js       Car 類:程序化車模 + 街機物理
js/taipei101.js     createTaipei101():地標
js/city.js          createCity(track):地面、天空、建築、霓虹、路燈
js/effects.js       Effects:bloom 後製、胎痕、煙、火花、雨
js/audio.js         GameAudio:全部 Web Audio 合成
js/hud.js           HUD:速度表 canvas、小地圖 canvas、計時、訊息
js/camera.js        ChaseCamera:彈簧追蹤、FOV、取景、震動
```

### 關鍵約定

- `Track.query(pos, hint)` → `{ index, s, lateral, tangent, normal, roadPos }` —「我相對道路在哪」的唯一真相來源。`s ∈ [0,1)` 為圈進度;`lateral` 驅動護欄碰撞;檢查點位於 `s = k/8`。
- `ROAD_HALF_WIDTH = 7.5`、`WALL_HALF_WIDTH = 8.6`(track.js)— 路寬與碰撞寬。
- 物理調校集中在 `vehicle.js` 頂部的 `TUNE` 物件(極速、引擎出力、抓地、甩尾參數、撞牆反彈)。
- 遊戲狀態:`title → countdown → racing → finished`(見 main.js 的 `race`)。

### QA / 自動化掛鉤

`window.__game` 暴露 `{ car, race, track, camera, chaseCam, startRace, restartRace, teleport(s, kmh) }`。`teleport(0.3, 110)` 會把車放到圈進度 30% 處並以 110 km/h 行進 — 供打磨本作的自動截圖/評審流水線使用。

### 效能守則

- 重複物件一律 `InstancedMesh`(護欄、路燈、胎痕、窗格)。
- Canvas 貼圖 ≤ 1024 px;僅限程序化生成。
- 視野內真實動態光 ≤ 2–3 盞;其餘用 emissive + 加法 sprite。
- 自動畫質調節:FPS 低於約 42 時降 `pixelRatio`(高於 58 回升)。

### 開發方法

本作由多代理循環打磨:「攝影師」代理在瀏覽器中實際駕駛並截取標準鏡頭組;四位「嚴苛美術總監評審」(光影、車輛、環境地標、HUD 構圖)以 AAA 夜間賽車為基準逐輪評分;「修正」代理以檔案獨佔所有權平行套用評審意見 — 反覆迭代直到分數收斂。

## 授權

[MIT](./LICENSE)
