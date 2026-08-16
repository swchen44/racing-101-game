# TAIPEI 101 — 午夜疾走 Midnight Circuit

> 🌏 [English version: README.md](./README.md)
>
> 🎮 **立即遊玩:<https://swchen44.github.io/racing-101-game/>**(桌機／平板／手機橫屏)

午夜雨後的霓虹台北,第三人稱 3D 街機賽車。以**純 Three.js** 打造 — 所有資產(101 大樓、四條賽道、八台車、每張貼圖與每個音效)皆為 **100% 程式即時程序化生成**,零模型檔、零圖片檔、零音訊檔。

![標題畫面](docs/screenshots/title.png)

| 台北大獎賽環道 | 陽明山夜峠 | 灣岸高速環道 |
|---|---|---|
| ![GP](docs/screenshots/gp.png) | ![山道](docs/screenshots/mountain.png) | ![灣岸](docs/screenshots/wangan.png) |

| 方程式賽車與濕路 | 小黃與霓虹倒影 | 觸控操作(手機) |
|---|---|---|
| ![F1](docs/screenshots/straight.png) | ![小黃](docs/screenshots/drift.png) | ![手機](docs/screenshots/mobile.png) |


## 📚 文件

- **[玩家手冊](docs/PLAYER-GUIDE.md)** — 安裝(PWA/離線)、操作、模式規則、賽道與車型圖鑑
- **[管理者手冊](docs/ADMIN-GUIDE.md)** — 部署、Supabase 資料庫、排行榜與廣告管理
- **[遊戲設計手冊](docs/GAME-DESIGN.md)** — 場景、規則、物理/AI 模型、資料流

---

## 🎮 使用者指南

### 開始遊玩

線上版:**<https://swchen44.github.io/racing-101-game/>** — 或本地啟動任一靜態伺服器(ES modules 需要 HTTP):

```bash
git clone https://github.com/swchen44/racing-101-game.git
cd racing-101-game
python3 -m http.server 8080     # 或 npx serve
# 開啟 http://localhost:8080
```

需支援 WebGL2 的瀏覽器。手機/平板請**橫屏**遊玩 — 霓虹觸控按鈕會自動出現。

### 遊戲流程

1. **輸入 Email 帳號**(不分大小寫,存在瀏覽器下次自動帶入)
2. 選擇**模式 → 對手強度 → 時段(夜/昏/日) → 賽道 → 車型 → 變速箱**,出發
3. 成績自動存入本機排行榜(設定後同步全球排行榜,見下方)

### 遊戲模式

| 模式 | 規則 |
|---|---|
| ⏱ **單人計時賽** | 2 圈對抗碼表,各賽道×模式最速單圈紀錄 |
| 🚨 **警車追逐** | 兩台警車一前堵一後撞(PIT),甩開後設路障攔截;被貼身逼停 → 出局 |
| 🏆 **大獎賽** | 與 5 台會走線、會閃避、有橡皮筋的 AI 車手搶 P1 |

### 賽道

| 賽道 | 特色 |
|---|---|
| 信義午夜街道 | 環繞台北101,中文霓虹街景,1.6 km |
| 灣岸高速環道 | 港灣快速道路:起重機、貨櫃場、跨海大橋,2.9 km 極速局 |
| 陽明山夜峠 | 層疊山巒與滿山樹海中的髮夾彎地獄,1.3 km 甩尾聖地 |
| 台北大獎賽環道 | F1 級:觀眾看台、維修站、DRS 大直線、輪胎牆,2.4 km |

### 車型(8 台)

方程式 TF-01(極速 250、8 速)・GT 熾焰・雷霆 EV-S(單速電驅)・拉力 R4(鬆尾甩尾王)・悍將皮卡・小黃 55688・都會 e-GO・峰行 SUV — 每台皆有專屬程序化車體與物理調校(極速/抓地/甩尾特性/檔位數)。

### 操作

| 按鍵 | 動作 |
|---|---|
| `W A S D` / 方向鍵 | 駕駛 |
| `Space` | 手煞車/甩尾 |
| `Q` / `E` | 降檔 / 升檔(手排) |
| `⇧Shift` | BOOST 加速(每場3次) |
| `C` | 視角(追逐/遠景/駕駛艙/車頭);`M` 後視鏡 |
| `R` | 重新開始;`Enter` 選單確認;`Esc` 返回 |

觸控:螢幕上有轉向、油門、煞車、甩尾與換檔按鈕(限橫屏)。

### 全球排行榜(可選,免費)

本機成績永遠可用。要開啟**全球排行榜**(顯示名字+遮罩 IP):註冊免費 Supabase 專案,把 URL 與 anon key 填入 `js/config.js` 即可 — 完整 5 分鐘教學見 [SETUP-LEADERBOARD.md](./SETUP-LEADERBOARD.md)。隱私:只上傳**遮罩後的 IP**(如 `140.112.x.x`),絕不上傳完整 IP。

---

## 🎨 設計文件

### 美術方向 —「台北雨夜」

101 的翡翠玻璃、鈉黃路燈、中文霓虹、ACES tone mapping 下的 teal-and-amber 調色與 bloom;三時段(夜/黃昏/白天)光照系統;路面為**乾燥柏油**(程序化法線+粗糙度貼圖的顆粒質感;濕路反射程式保留,供未來雨天模式)。

### 世界構築

- **賽道**為封閉 CatmullRom 曲線;路面/路緣/護欄沿曲線擠出,canvas 繪製 albedo + 自發光標線。每條賽道帶 *theme*(天色/建築密度/霓虹盤/地標)驅動程序化地景:101 的 8 節斗身;港灣的起重機、貨櫃堆與跨海大橋;約 2,600 棵 instanced 樹的層疊山稜;有人群看台、維修站與探照燈的 F1 賽場。
- **假光預算**:光池、招牌光暈全用加法 sprite;真實動態光 ≤ 3 盞(月光含陰影、車頭燈、補光),守住 60 fps。

### 車輛與物理

120 Hz 固定步自製街機物理:前向/側向分解、指數側向抓地(手煞時衰減 → 可控甩尾)、速度連動偏航。**變速箱模型**:各檔速度帶+扭力曲線+紅線斷油 — 自排貼紅線自動換檔,手排(Q/E)貼線換檔更快;電動車單速平坦扭力。護欄碰撞對曲線解析求解,每幀 O(1)。

### AI

- **大獎賽**:運動學跟線 + 彎心走線、彎道曲率減速、互相避讓、被擠壓短暫失控、起跑反應時間、完賽滑行、±6% 橡皮筋。
- **警車**:沿賽道進度追撃 + PIT 撞尾、第 2 圈增援、甩開 300m 觸發可撞飛的路障攔截、距離衰減的雙音警笛、低速貼身「攔停」計量條。

### 音效

全 Web Audio 合成:引擎(鋸齒+次階方波過濾波器,吃真實變速箱轉速)、胎鳴、風切、警笛、碰撞、UI 音、完賽號角。

---

## 🛠 開發者指南

### 檔案結構

```
index.html          選單(名字/模式/賽道/車型/變速箱)、HUD、觸控 UI、import map
js/config.js        中央定義:TRACKS(曲線+主題)、CARS(調校+數值)、MODES、排行榜設定
js/main.js          渲染器、光照、世界生命週期(建構/釋放)、選單流程、賽事狀態機、主迴圈
js/track.js         Track(def):曲線取樣、query()、路面/護欄網格、濕路反射 shader
js/vehicle.js       Car(track, def, {transmission}):物理+變速箱;視覺分派到 cars/
js/cars/            一車一檔(f1/gt/evsport/rally/pickup/taxi/evcity/suv)+ common.js 共用工具
js/city.js          createCity(track, theme):建築/霓虹/路燈 + 港灣/山景/賽場環境
js/taipei101.js     台北101 地標
js/reflections.js   平面反射 RT 與共用 uniforms(REFLECT_LAYER)
js/effects.js       bloom+調色+徑向模糊、胎痕、煙、火花、雨、速度光軌
js/opponents.js     大獎賽 AI          js/police.js   警車 AI
js/leaderboard.js   本機成績 + Supabase REST 轉接(遮罩 IP)
js/hud.js           儀表/小地圖/計時/名次/通緝    js/camera.js  追逐攝影機
js/audio.js         Web Audio 合成(引擎/警笛…)   js/touch.js   觸控操作
```

### 關鍵約定

- `Track.query(pos, hint)` → `{ index, s, lateral, tangent }` — 圈進度與護欄碰撞的唯一真相;檢查點位於 `s = k/8`。
- 車模建構器:`build(def) → { mesh, parts }`(範式見 `cars/gt.js`);物理調校在 config.js 各車的 `tune`。
- `window.__game` QA 掛鉤:`{ car, race, track, setup, startRace, teleport(s, kmh) }` — 可在 console 直接切任何賽道/車/模式。
- **資源釋放紀律**:每場比賽重建世界與車輛;移除一律走 `disposeObject()`(cars/common.js) — 共用快取貼圖以 `userData.shared` 標記跳過。

### 效能守則

重複物件一律 InstancedMesh;canvas 貼圖 ≤ 1024;真實光源 ≤ 3;反射 RT 512;FPS < 42 自動降 pixelRatio。

### 開發方法

多代理流水線打造:先由主線完成核心架構,再以**檔案獨佔所有權**平行派出專項代理(車模 ×3、賽道主題、濕路反射、觸控 UI、AI 行為),各自在獨立 headless 瀏覽器 session 自我實測迭代,最後整合驗證 + 嚴苛美術總監評審循環。

## 授權

[MIT](./LICENSE)
