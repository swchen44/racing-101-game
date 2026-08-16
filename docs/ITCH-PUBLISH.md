# itch.io 上架指南 — Taipei 101 Midnight Circuit

> 一次性上架約 10 分鐘;之後每次改版重新上傳一個 ZIP 即可。
> 上架不影響 GitHub Pages 版;兩邊連同一個 Supabase,**全球排行榜共通**。

---

## 0. 準備好的檔案(每次改版可重新產生)

```bash
# 在專案根目錄執行:打包遊戲本體 (排除 docs/git,僅 ~1MB)
zip -r midnight-circuit-itch.zip index.html manifest.webmanifest sw.js js assets -x "*.DS_Store"
# 封面圖 630×500 (itch 建議尺寸)
sips -c 500 630 docs/screenshots/title.png --out itch-cover-630x500.png
```

- 遊戲包:`midnight-circuit-itch.zip`(index.html 必須在 ZIP 根層 — 上面指令已保證)
- 封面圖:`itch-cover-630x500.png`
- 頁面截圖:`docs/screenshots/` 底下任選 3-5 張(建議 gp.png、mountain.png、drift.png、mobile.png)

## 1. 註冊與建立專案

1. 到 <https://itch.io> 註冊帳號(免費)→ 驗證 Email
2. 右上角頭像 → **Upload new project**

## 2. 專案設定(逐欄位)

| 欄位 | 填法 |
|---|---|
| Title | `Taipei 101 Midnight Circuit 午夜疾走` |
| Project URL | 自動產生(可改成 `midnight-circuit`) |
| Classification | **Games** |
| Kind of project | **HTML** ← 關鍵,選錯遊戲跑不起來 |
| Release status | Released |
| Pricing | **No payments**(或 $0 or donate 開放抖內) |
| Uploads | 上傳 `midnight-circuit-itch.zip`,勾選 **「This file will be played in the browser」** |
| Embed options | **Viewport dimensions: 1280 × 720**;勾 **Fullscreen button**;勾 **Mobile friendly**、Orientation 選 **Landscape** |
| Frame options | 勾 **SharedArrayBuffer support 不需要**;其餘預設 |
| Genre | Racing |
| Tags | `racing`, `arcade`, `3d`, `threejs`, `driving`, `drift`, `taipei`, `night`, `webgl` |
| AI generation disclosure | 依實況勾選(本作程式與美術為 AI 協作生成) |
| Community | Comments 開啟(收玩家回饋) |

## 3. 頁面文案(可直接複製)

**Short description / tagline:**
> Arcade street racing around Taipei 101 — 4 tracks, 8 cars, police chases, global leaderboard. 100% procedurally generated, plays offline. 環繞台北101的街機賽車。

**Description(內文,支援 Markdown):**

```
🏁 午夜的台北,引擎聲劃破信義區。

Race around Taipei 101 in this arcade street racer — every asset (the tower,
4 tracks, 8 cars, every texture and sound) is 100% procedurally generated in code.

★ 4 tracks — Xinyi neon streets / Wangan harbor speedway / Mountain touge / Taipei GP circuit
★ 8 cars — Formula, GT, EVs, rally, pickup, even a Taipei taxi 🚕
★ 3 modes — Time Attack / Police Chase (PIT & roadblocks!) / Grand Prix vs 5 AI drivers
★ Day / dusk / night ・ manual or automatic gearbox ・ 3 boosts per race
★ Global leaderboard (per mode × track × difficulty)
★ Keyboard + full touch controls — plays great on phones (landscape)

操作 Controls:
WASD/方向鍵 駕駛 ・ Space 甩尾 ・ Shift BOOST ・ Q/E 手排換檔 ・ C 視角 ・ M 後視鏡

Made with vanilla Three.js. No downloads, no assets, no engine — just code.
```

**Cover image**:上傳 `itch-cover-630x500.png`;**Screenshots**:上傳 3-5 張遊戲截圖。

## 4. 發佈與驗收

1. 按 **Save & view page** → 先以 Draft 預覽,實際玩一場確認:
   - 遊戲在 iframe 內正常啟動、全螢幕按鈕可用
   - 完賽成績有上傳(排行榜與 GitHub Pages 版共通)
   - 手機開啟 itch 頁面 → 橫屏 → 觸控正常
2. 沒問題後把頁面狀態改為 **Public** → 完成 🎉

## 5. 改版更新流程

```bash
zip -r midnight-circuit-itch.zip index.html manifest.webmanifest sw.js js assets -x "*.DS_Store"
```
→ itch 專案 Edit → Uploads → 刪舊 ZIP 上傳新 ZIP(勾 browser 播放)→ Save。

進階:安裝 itch 官方 CLI「butler」可一行指令推版(適合頻繁更新):
```bash
butler push midnight-circuit-itch.zip 你的帳號/midnight-circuit:html5
```

## 6. 已知相容性說明(本作已處理,僅供了解)

- **Service Worker**:itch 的沙盒網域上可能註冊失敗 — 程式已 fail-soft,不影響遊玩(離線功能僅 GitHub Pages/PWA 版提供)
- **CDN 與 Supabase**:itch iframe 允許對外連線,three.js/字型/排行榜皆正常
- **localStorage**:在 itch 網域下獨立保存(與 Pages 版的本機紀錄不互通;全球榜共通)
- **音訊**:需要使用者互動後才出聲 — 按「開始遊戲」即符合

## 7. 上架後的變現路線(備忘)

流量與評分累積後 → 投稿 **CrazyGames / Poki / GameDistribution**(審核制,平台代管廣告與分潤,
可接「看廣告換 Boost」的獎勵式廣告 SDK)。屆時遊戲內的 8 面自營看板可與平台廣告並存。
