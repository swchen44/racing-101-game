# 原來源模組接入研究

> 本文保留研究時的觀察與候選方案；最新已確認範圍與統一規格見[台北設計草案](../superpowers/specs/2026-10-20-taipei-source-city-design.md)。目前只做台北，其他城市等待使用者素材。

日期：2026-10-20。範圍：唯讀盤點來源封存、Blender 中間資料、接收端合約及官方格式文件；未改遊戲、未匯出 GLB、未執行來源遊戲。本文件的架構都是待訪談確認的候選。

## 已確認的範圍

保留既有四條賽道，新增台北、香港、東京三條封閉賽道，台北先行。新場景所有可見模型包含道路外觀、車與 NPC 均來自來源素材；保留原遊戲物理、HUD、規則。允許拆組、調尺寸與材質，但需保留來源追蹤。這不表示將來源整套遊戲 runtime 嵌入。

來源工作區為 `/Users/swchen.tw/git/rea_study_gta_taipei`，下文 `S/` 代表該目錄。`A/` 代表其 `archive/taipei-rush-2026-10-18/files/assets/`。

## 本地素材到底有哪些

`S/exports/taipei-rush-blender/README.md`、`conversion-receipt.json` 與 `verification-receipt.json` 記錄 170 個 `.blend`，由 Blender **5.2.1 LTS** 產生並重新開啟，errors 為空。這是既存 receipt，本輪沒有重跑 Blender。中間 JSON 本輪重新計數如下，三角形為 `indices.length / 3`，不是渲染器的實測 draw calls。

| 類別 | 模型數 | meshes 合計 | 三角形合計 | 單件範圍 |
|---|---:|---:|---:|---:|
| 建築外觀與室內 | 127 | 217 | 1,424,917 | 380–39,025 |
| 車輛 | 13 | 13 | 30,344 | 814–3,310 |
| 人物 | 27 | 27 | 127,922 | 4,460–4,980 |
| 號誌燈頭 | 2 | 2 | 60 | 20–40 |

另有 1 個共用動畫 `.blend`，內含阿傑與 48 Actions，不應當成第 28 種人物。127 建物包含 **67 外觀與 60 室內**，不能宣稱 127 棟不同建築。`S/exports/` 沒有現成 `.glb`。

代表件取自 `S/exports/blender-source/{buildings,vehicles,characters,street}/*.json`；尺寸由 receipt 的 Blender Z-up bounds 相減，表內順序為寬 × 深 × 高，數值保留來源單位。

| 素材 id | meshes | triangles | 尺寸約值 | 結構 |
|---|---:|---:|---|---|
| `donqi-ximen` | 2 | 13,182 | 25.34 × 23.60 × 21.90 | `lm`, `art` |
| `cisheng-temple` | 3 | 36,082 | 29.39 × 46.98 × 14.83 | `lm`, `leaves`, `art` |
| `breezy-center` | 2 | 11,292 | 38.77 × 55.91 × 53.90 | `lm`, `art` |
| `jianguo-holiday-market-2-2` | 2 | 39,025 | 40.22 × 10.20 × 3.36 | `lm`, `art` |
| `taxi` | 1 | 2,658 | 2.06 × 4.73 × 1.74 | 車體與車輪已合併 |
| `sports` | 1 | 2,442 | 2.14 × 4.60 × 1.26 | 車體與車輪已合併 |
| `jie` | 1 | 4,734 | 0.56 × 0.32 × 1.78 | 27 bones |

建築已依材質用途粗分 mesh，**沒有每張椅子、路燈或家具的獨立檔案**。燈頭不含支柱。道路、地形、完整城市位置、全部地標沒有被這批匯出涵蓋。`A/worldData-CmxYohek.js` 保存大台北路網資料，`A/regions-D4QguCsc.js` 保存大台北區域；`A/world-BwYfSiTY.js` 含街景生成、程序地表與材質邏輯，`build-*.js` 另有區域內容。這些仍需逐項拆取，不可把 170 檔當完整城市。

## 香港與東京：本地缺口及線上定位

本地 `A/cities-DL3AMIqw.js` 有香港、東京的頁面、貨幣與航班 metadata。`A/art-tokyo-DHp5jBJS.js` 為 **23,816 bytes 的 64 × 64 SVG 物品圖示字串**，export `TOKYO_ART`，由背包 UI 使用，不是東京 3D 場景。264 檔的封存 manifest 沒有 `/hong-kong/` 或 `/tokyo/` URL。以已盤點檔案及引用為界，尚未在本地快照定位兩城獨有 3D world/site 生成器。

2026-10-19 **22:50:42–22:50:53 UTC**，亦即台北 2026-10-20 **06:50**，補讀兩個公開 HTML 及各一個直接引用的入口 JS，僅分析字串引用。Python urllib 最初因本機 issuer certificate 驗證失敗；改用系統 curl，沒有停用 TLS 驗證，四份內容讀取成功。

| 公開頁面 | HTML bytes | 入口 JS | JS bytes |
|---|---:|---|---:|
| [香港](https://www.taipei-rush.app/hong-kong/) | 50,320 | [`game-k-jqQHIo.js`](https://www.taipei-rush.app/hong-kong/assets/game-k-jqQHIo.js) | 643,367 |
| [東京](https://www.taipei-rush.app/tokyo/) | 58,329 | [`game-B7WGhb01.js`](https://www.taipei-rush.app/tokyo/assets/game-B7WGhb01.js) | 69,853 |

入口 bytes 的 SHA-256：

- 香港：`ac2c9ad7b2cb0fee6d74576213d8588bfe96b4205c113ae0464967d6f526a84a`
- 東京：`388c5709464d78f0d941d2e6d5f9d7c524e8c8a64cdb60a80d0ab568177f357a`

香港 HTML／入口引用 `/hong-kong/assets/world-d_yFFG5D.js`、`scene-lRtF8iuT.js`、`hkIds-CJ_OxYG2.js`、`actors-C6gBNZA2.js`。東京入口引用 `/tokyo/assets/tokyo-BZg_1Aud.js`、`world-B0bcW4dp.js`、`material-BpKjKDNr.js`、`signs-BIewpQWa.js`；dependency map 另列 `region-tokyo-d-akihabara`、`ameyoko`、`hongo`、`kanda`、`roppongi`、`suidobashi`、`ueno` chunks。

因此已能定位兩城專屬部署模組的**入口與候選 chunk**。本輪沒有下載其完整依賴、執行生成器、量測模型或驗證可匯出性。上述是定位證據，不能推論全部素材可用，也不能將最新站點與 10 月 18 日封存視為同一版本。

## 外觀保留的核心缺口

`S/scripts/export-buildings.mjs` 對 atlas 傳入整張 `[0,0,1,1]` 占位區域，只輸出 position、normal、color、UV、indices；缺少真正招牌圖集與 shader metadata。`S/scripts/export-vehicles.mjs` 固定 seed `0.5` 與第一種車色，篩掉變體三角形，忽略 Canvas 車牌／路線／商標與動態效果。

`S/scripts/convert-assets-blender.py:build()` 對每個素材建立 **1 個共享 Principled 材質**，`OriginalColor` 接 Base Color、roughness 固定 `0.75`，沒有 Image Texture 節點；這是轉換腳本的可確認行為，並非本輪逐一重新檢查 170 檔材質。玻璃、發光、金屬、濕地表及招牌資訊已降為基本頂點色。原站截圖品質不能靠把現有 `.blend` 再存成 `.glb` 自動恢復。

## 兩條接入路線的候選比較

| 路線 | 能保留什麼 | 成本與邊界 |
|---|---|---|
| 原 JS 生成器及必要材質模組 → 本遊戲 adapter | 有機會保留原參數、Canvas atlas、道路紋理、動畫標記 | 封存 Three.js **r186**；本 repo `index.html:933` 固定 **r160**。直接 import `world/actors` 會牽入 `engine/game/content` 的依賴與副作用；需抽出幾何／貼圖／材質入口並驗證版本 |
| 現有 `.blend` → GLB → `GLTFLoader` | 現有幾何、法線、UV、基本色、可用骨架 | 最容易交接 Blender、美術可編輯；保留的是目前已降級資料，車輪和道具結構還需重建，缺失 atlas 無法憑 GLB 補回 |
| 來源生成器補齊語義／貼圖 → 中間資料 → Blender/GLB，加少量材質 adapter | 可追蹤原來源，靜態資產標準化，對特殊 shader 保留獨立處理 | 技術上值得優先試驗的候選，需逐件與來源離線參考畫面比對；尚未定案，也不保證任意 shader 全保真 |

不應把兩版 Three.js 物件圖直接混用。可在隔離抽取工具維持來源版本，再輸出數值／標準資產交給 r160；是否升級接收端須獨立驗證，不能為讀模型順便升級整個 renderer。現有 extractor 透過 lazy declarations 避免整套 application 初始化，但依賴硬編碼 `/opt/homebrew/lib/node_modules/rea-agents/node_modules/@babel/parser`，不能原樣當可攜 runtime。

官方 [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html) 支援 meshes、materials、textures、skins、animations 等；[r160 原始碼](https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/exporters/GLTFExporter.js) 明確拒絕 `ShaderMaterial`。`onBeforeCompile` 的任意 GLSL 改寫也不是標準 glTF PBR 材質內容，需另外保留或烘焙。這是目前混合路線的動機，不是保真完成證明。

## 軸向、尺寸與動態合約

- 來源 Three.js 為 Y-up；轉 Blender 使用 `(x,y,z) → (x,-z,y)`，尺寸未縮放。glTF 回 Three.js 須只做一次相反的座標轉換，保存前後 bounds 與正面方向參考圖，避免重複旋轉。來源車正面為 `-Z` 的判定來自轉換腳本註記，仍須實際車頭圖驗證。
- 本遊戲 `js/cars/index.js` 要求 `build(def) → {mesh, parts}`，`js/vehicle.js:261` 會操作 `parts.bodyGroup` 與每個 `wheels[].spinner`、`wheels[].group`、`steerable`。目前 vehicle JSON 僅一個合併 mesh，不能直接當可駕駛車。來源 `actors-Bh3k99X7.js:xs()` 依序產生車體、轉向件與輪組，適合於抽取階段保留分段及 pivot；目前 exporter 丟失了這層語義。不能以替換成舊輪胎補洞。
- 27 人物 bones、48 Actions 已有 receipt；原動畫只涵蓋 19 bones，另 8 bones 無軌道，獨立 root motion、IK、表情未移植。NPC 若採動畫 GLB，需重驗 bind pose、腳底高度、轉向及循環縫。
- `js/track.js:24` 將控制點建在 `y=0`。可保留不可見賽道與碰撞計算，新增來源道路外觀模組沿賽道配置；坡道／高架若成為可行駛部分就超出目前平面合約。可見道路、護欄、標線、地面道具的來源都必須列入 manifest，避免新場景不知不覺沿用舊外觀。

## 下一階段可檢驗的產物

1. **三城來源清冊**：台北原封存維持不動；香港／東京各自固定時間與 hash。每項標記 source module/symbol、city、mesh/material/texture 數量、bounds、triangles、缺口及授權狀態。
2. **小型外觀對照**：一家帶字招牌店、一棟玻璃建築、一個來源道路／號誌組、一台有輪組的車、一個人物。保留來源離線參考 render、Blender render、r160 render，同 camera／光照／曝光比對，明列缺失，不以自評取代截圖證據。
3. **模組拆分試驗**：商店外殼／招牌、道路／路緣、燈頭／支柱、車體／輪胎及 pivot 分開；來源 id 不因重命名而消失。GLB 先用未壓縮版本，材質外觀通過後再評估壓縮與 LOD。
4. **台北一段可駕駛街區**：檢查車寬、路寬、路邊距離、駕駛視線及碰撞；量測載入 bytes/time、render calls、triangles、texture memory 與實際裝置 frame time，再定三城密度預算。
5. **完整賽道才做驗收**：開始／重啟／完賽／場景切換、資源釋放、desktop/mobile landscape、PWA 離線；香港東京依同一標準。不要先把所有室內與 1.42M 建築三角形一次載入賽道。

官方 [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) 提醒 ImageBitmap 需特別處理釋放；壓縮格式還有額外 decoder。官方 [Color Management](https://threejs.org/manual/pages/color-management.html) 區分線性頂點色與 sRGB 顏色貼圖；此批 `OriginalColor` 已是 linear，不能再當 sRGB 轉一次。Blender [5.0 glTF manual](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html) 的搜尋可見摘要提醒 UV／flat edges 可能使匯出頂點增加；該文件全文本輪抓取回 402，因此不以全文未讀內容作驗收依據。

## 尚未驗證

未產出 GLB、未跑來源／接收端 browser、未測材質保真、車輪 pivot、骨架回匯、手機效能、WebGL 記憶體與離線快取。170 檔 Blender 開啟成功只證明該批 Blender 檔案的既有驗證，不能外推為完整三城或 Web acceptance。來源 README 記載素材再利用授權尚未確認；本輪只記錄這項既有狀態，沒有發佈或重新散布素材。
