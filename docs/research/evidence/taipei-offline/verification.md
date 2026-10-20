# 台北離線瀏覽器驗證

日期：2026-10-20，19:48–19:59 Asia/Taipei。獨立審查代理唯讀檢查應用程式，只修改本資料夾的驗證產物及自己的瀏覽器快取。首次發現的 P2 已由主代理修復，獨立瀏覽器複驗通過；本驗證範圍沒有剩餘已知缺陷。

## 結果

| 檢查 | 結果 | 證據 |
|---|---|---|
| 初次線上載入城市及 runtime | PASS；SW controller 存在，ready/cityReady=true，missing=[]，城市 cache 有 99 entries | `online-readiness.json` |
| 停止自己的 HTTP server 且瀏覽器 offline 後重新載入 index | PASS；navigator.onLine=false，遊戲正常初始化 | `offline-race.json` |
| 離線台北單人模式開賽 | PASS；進入 racing，sourceAudit active=true、missing=[] | `offline-race.json`、`offline-race.png` |
| 離線重啟 | PASS；重新 countdown 後進入 racing，sourceAudit missing=[] | `offline-restart.json` |
| 正常離線過程的 console／未捕捉錯誤 | PASS；兩份紀錄皆空 | `offline-console.txt`、`offline-errors.txt` |
| 刪除必要 atlas 後，底層快取完整性檢查 | PASS；ready/cityReady=false，reason=city-incomplete，列出刪除 URL | `eviction-readiness.json` |
| 同一頁保有 active race lease 時，返回選單的離線狀態 | 初測 FAIL / P2；修正後 PASS，UI 不再宣稱「可離線遊玩」 | `eviction-menu.json`、`fixed-pooled-preview.json` |
| 同一 preview lease 重繪選單的離線狀態 | 修正後 PASS，底層 readiness=false，UI 不再宣稱「可離線遊玩」 | `fixed-same-preview.json` |
| 缺 atlas、完全離線時重新載入並開賽 | PASS；顯示載入失敗，startRace 回傳 false，race.state=title，未提交來源世界 | `eviction-reload.json` |
| 恢復連線後重試 | PASS；新完整 city cache、ready=true，再次進入 racing、sourceAudit missing=[] | `online-recovery.json` |

本次版本全部為 `source-v1-f633ae38aa1e`。正常開賽與重啟的 renderer 統計均為 544 calls、460993 triangles、234 geometries、51 textures；這是資源快照，不是 FPS 或長時間效能驗收。

## 已修復缺陷紀錄：離線可用狀態沿用記憶體中的舊快照

重現：

1. 線上載入台北，之後完全離線開賽及重啟。
2. 從自己的城市 CacheStorage 刪除 `guling-book-street-atlas.png?sha=7622c38d50b8b66d68e6d93b96f2b0c5d98682c71526cc93680e05f4f47b37af`。
3. `readCityReadiness('taipei')` 已回報不完整。
4. 呼叫既有 QA API `showTitle()`、`showSetup()`，UI 卻仍顯示「台北街區已準備就緒，可離線遊玩。」。

定位：受測 `js/cities/assets.js:103–107` 只在首次建立 library 時設定 `library.offline`；`124–134` 的 pooled acquire 把舊快照交給新 lease。`js/main.js:152` 直接使用 `lease.offline.ready`。既有賽事持有 library 時，重新進入選單不會重新驗證 CacheStorage。

目前記憶體內賽事仍可使用已載入資產，但 reload 後無法離線取得完整城市。這使介面的「可離線遊玩」承諾失真。應在提供離線可用狀態前重新檢查實際快取。

缺件 reload 的 console 有兩則預期警告：`City preview` 與 `Race preparation` 的 `City manifest load failed: 503`；未捕捉錯誤紀錄為空。`eviction-reload.json` 的 sourceAudit active=false，其 missing 清單屬於保留下來的原版標題背景，不代表來源台北成功載入。

### 修正後獨立複驗

主代理新增每個 lease 的 `refreshOffline()`，新 lease 及既有 preview 重繪都讀取真實 CacheStorage。

19:57–19:59 另開全新 `taipei-offline-review-fixed` session，重新載入完整新版 runtime 與城市，避免沿用舊 main/assets。先在線上確認 ready，再切瀏覽器 offline，分別驗證：

1. 選單已持有 preview lease 時刪除必要 atlas，重新 `showSetup()`；ready/cityReady=false，UI 為「台北街區已準備就緒。」。
2. 還原 atlas 並開始賽事，刪除同一 atlas，再 `showTitle()` / `showSetup()`，讓 active race 保有 library、新 preview 重用 pool；ready/cityReady=false，UI 同樣為「台北街區已準備就緒。」。來源場景仍 active=true、missing=[]，確認記憶體中的既有賽事不受影響。

兩條路徑均撤銷「可離線遊玩」宣告。`fixed-console.txt` 與 `fixed-errors.txt` 均空。測試後還原被刪快取，關閉獨立 session 與自己的 server。修正版此輪聚焦淘汰狀態複驗，未重跑首次完整的停止 server / reload 流程。

修正版指紋：

- `js/main.js`：`684c36e48f581caf74233ea9faa358f5f71a253756dc2b3f329944b121d9ef92`
- `js/cities/assets.js`：`bb990e64206e13111428efa7a0487a23ef923452f15ddd2964aa9e75bafe0eac`

## 環境與隔離

- Worktree：`/Users/swchen.tw/git/racing-game/.worktrees/taipei-source`。
- HEAD：`b5abc4a270ad3117a46282a29d091dbbe8de9c60`，含未提交修改，以下檔案摘要才是受測指紋。
- agent-browser 0.26.0，獨立 session `taipei-offline-review`，HeadlessChrome 153.0.0.0，macOS。
- 專用網址：`http://127.0.0.1:8937/index.html`；未停止或修改 root 的 8932 server。
- 畫面 viewport：1280×577。
- 導航前已用 network routes 封鎖 `**supabase.co/**` 與 `**api.ipify.org/**`。
- 測試帳號：`offline-review@example.com`，只留在獨立瀏覽器的本機 profile。
- 完全離線階段同時使用 `agent-browser set offline on` 與終止自己的 8937 server；curl 確認回應碼 000。
- 使用既有 `window.__game` QA API 開賽與重啟，沒有模擬完整跑圈或送出成績。
- 測試後恢復獨立快取可用性，關閉自己的瀏覽器 session，停止自己的 server。
- 初期等待 UI 的 CLI 指令延遲較長；後續改為每次只啟動一次 Promise，再分開讀取結果，避免長命令重試。

| 檔案 | SHA-256 |
|---|---|
| index.html | `7aaf60f59aa77e275595e14cb31ea1b3450bb45056c6876a3cedfca9aa5d5778` |
| sw.js | `1806a1ad73c16021a331fcfc03f763cbaea35b5aba3a2809d16656fb4283b60d` |
| js/main.js | `23aa249fc886a59ba411ee6e8820444ea8cf6a83a7469722358f88a8fe771997` |
| js/cities/offline.js | `30fd55085a3b7cc64a9c88675c287591872ba6470cca5a38a33e80a69657b1ef` |
| assets/cities/taipei/manifest.json | `032e58ddff7741ed4998405e42e17e04395b10fefc53c17930347f2363c355aa` |

## 邊界

驗證涵蓋本機桌機 Chrome 的完整快取後離線重載、單人模式開賽／重啟、單一必要檔案淘汰與恢復。未驗證真實手機、瀏覽器配額不足、OS 自動清理、跨版本 Service Worker 更新或其他模式的完整離線比賽流程。沒有把成功重新載入外推為上述項目已通過。
