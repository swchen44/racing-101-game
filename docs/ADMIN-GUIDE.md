# 管理者手冊 — Taipei 101 Midnight Circuit

> 對象:遊戲營運者(你)。涵蓋部署、資料庫、排行榜管理、廣告上下架、金鑰安全與疑難排解。
> 對應版本:v4(2026-08)

---

## 1. 系統架構總覽

```
玩家瀏覽器 (PWA 可離線)
   │  靜態檔案                     │  REST API (anon key)
   ▼                              ▼
GitHub Pages                   Supabase (racing-101 專案)
https://swchen44.github.io/    ├─ scores          玩家成績
racing-101-game/               ├─ sponsors        廣告主檔期
                               └─ ad_impressions  看板曝光記錄
```

- **前端**:純靜態(HTML + ES Modules),無建置步驟,push 到 `main` 分支即自動部署
- **後端**:只有 Supabase 資料庫,前端用公開 anon key 直連,權限由 RLS 規則限制
- **原始碼**:<https://github.com/swchen44/racing-101-game>

## 2. 部署與更新

### 更新遊戲
```bash
cd racing-game
# …修改程式…
git add -A && git commit -m "說明" && git push
```
push 後 GitHub Pages 約 1-2 分鐘自動重建。**不需要任何建置指令**。

### PWA 快取與版本
- Service Worker(`sw.js`)策略:同源檔案「網路優先」→ 玩家有網路時自動拿到新版,離線時退快取
- 若要強制所有玩家清快取:改 `sw.js` 開頭的 `VERSION = 'mc101-v1'` 為 `v2`,舊快取會在下次上線時被清除

### 本地開發
```bash
python3 -m http.server 8931     # ES modules 需要 HTTP,不能用 file://
# 開 http://localhost:8931
```
除錯掛鉤:瀏覽器 console 的 `window.__game`,可 `teleport(圈進度0~1, 時速)`、讀 `car/race/track`、直接 `startRace()`。

## 3. 資料庫管理(Supabase)

後台:<https://supabase.com/dashboard> → 專案 `racing-101`。
管理操作一律在後台 **SQL Editor** 執行(它用服務金鑰,不受 RLS 限制)。

### 3.1 資料表

| 表 | 用途 | RLS 權限(anon) |
|---|---|---|
| `scores` | 玩家成績 | 讀 ✅ 增 ✅ 改/刪 ❌ |
| `sponsors` | 廣告主檔期 | 讀 ✅ 增/改/刪 ❌(只能在後台管理) |
| `ad_impressions` | 看板曝光 | 讀 ✅ 增 ✅ 改/刪 ❌ |

`scores` 欄位:`mode`(solo/police/gp)、`track_id`(xinyi/wangan/mountain/gp)、`car_id`、`difficulty`(easy/normal/hard)、`name`(玩家 Email,小寫,≤60字)、`time_ms`(總時間,>20000 才收)、`best_lap_ms`、`masked_ip`(遮罩 IP 如 140.112.x.x)、`created_at`(UTC)。

### 3.2 常用管理 SQL

```sql
-- 看某賽道某難度的排行榜
select name, time_ms/1000.0 as sec, masked_ip, created_at
from scores
where mode='solo' and track_id='xinyi' and difficulty='normal'
order by time_ms limit 20;

-- 刪除作弊/灌水成績 (依 id 或條件)
delete from scores where id = 123;
delete from scores where time_ms < 30000;          -- 清掉不合理成績
delete from scores where name = 'spam@example.com'; -- 封鎖特定帳號的成績

-- 各模式成績量統計
select mode, track_id, difficulty, count(*) from scores group by 1,2,3 order by 4 desc;
```

### 3.3 防作弊現況與限制
公開網頁遊戲無法完全防偽造(anon key 任何人可拿到、可直接 POST 假成績)。目前防線:
- 資料庫檢查:`time_ms > 20000` 才收
- 你可用上面 SQL 手動清理異常紀錄
- 要更強的防線(重播驗證、簽章)屬於後端工程,需要時再議

## 4. 廣告看板管理

### 4.1 廣告位一覽(每賽道固定 2 位)

| slot 代碼 | 位置 |
|---|---|
| `xinyi:0` / `xinyi:1` | 信義:起跑直線右側 / 對向直線左側 |
| `wangan:0` / `wangan:1` | 灣岸:南岸大直線右側 / 北岸直線左側 |
| `mountain:0` / `mountain:1` | 山道:起跑直線右側 / 中段直路左側 |
| `gp:0` / `gp:1` | GP:二號直線右側 / 回場直線左側 |

沒有檔期的位子自動顯示「歡迎刊登廣告 YOUR AD HERE」佔位。

### 4.2 上架廣告主(不用改程式、不用重新部署)

1. 準備廣告圖:**1024×512**(比例 2:1),傳到 Supabase Storage 的 **`ads` bucket**(已建立,public)取得公開網址;素材規格與報價架構見 [AD-SALES-KIT.md](AD-SALES-KIT.md)
2. 後台 Table Editor → `sponsors` → Insert row:

| 欄位 | 填法 |
|---|---|
| `slot` | 例如 `xinyi:0` |
| `name` | 廣告主名稱(內部辨識用) |
| `image_url` | 圖片公開網址(需允許 CORS;Supabase Storage 預設可用) |
| `active` | `true` |
| `starts_at` / `ends_at` | 檔期(可空 = 不限);到期自動換回佔位 |

3. 玩家下一次開啟遊戲即看到新廣告

下架:把該列 `active` 改 `false`(或等 `ends_at` 過期)。

### 4.3 曝光報表(給廣告主的數字)

玩家每圈經過看板記一次(兩圈賽事 = 每位玩家每看板最多 2 次):

```sql
-- 各看板總曝光
select slot, count(*) as impressions from ad_impressions group by slot order by 2 desc;

-- 某看板最近 30 天的每日曝光
select date_trunc('day', created_at) as day, count(*)
from ad_impressions
where slot = 'xinyi:0' and created_at > now() - interval '30 days'
group by 1 order by 1;
```

計價建議:對小型廣告主賣「包月固定價」,附上述真實曝光數字即可,不必談 CPM。

## 5. 金鑰安全(重要)

| 金鑰 | 位置 | 性質 |
|---|---|---|
| **anon key** | `js/config.js`(公開在程式碼中) | 設計上公開;權限被 RLS 鎖為「讀 + 新增」;外洩無妨 |
| **`sbp_` 管理權杖** | 只存在你的 Supabase 帳號設定 | 等同帳號密碼;**絕不可**寫進程式、貼進對話、commit |

- 若管理權杖曾外流:後台 → Account → Access Tokens → Revoke,再產新的
- 撤銷管理權杖**不影響**遊戲與排行榜運作(遊戲只用 anon key)

## 6. 疑難排解

| 症狀 | 處置 |
|---|---|
| 玩家反映排行榜「連線失敗」 | 檢查 Supabase 專案是否休眠(免費方案 7 天無活動會暫停,後台按 Restore);遊戲會自動退回本機榜,不會壞 |
| 改版後玩家看到舊畫面 | PWA 快取:請玩家在有網路時完全關閉 App 再開兩次;或你改 `sw.js` 的 VERSION 強制換版 |
| 廣告圖不顯示 | 檢查 image_url 是否公開可讀 + 支援 CORS;失敗時遊戲自動顯示佔位看板,不會壞畫面 |
| 想暫停全球排行榜 | `js/config.js` 把 `LEADERBOARD_REMOTE` 設為 `null`,遊戲自動退回純本機模式 |
| GitHub Pages 沒更新 | repo → Settings → Pages 看建置狀態;或 `git commit --allow-empty -m rebuild && git push` |
