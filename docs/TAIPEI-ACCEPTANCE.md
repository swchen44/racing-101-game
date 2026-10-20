# 台北來源場景：實作與驗收

2026-10-20 起於分支 `feat/taipei-source` 實作；2026-10-21 使用者授權整合至 `main` 並同步 GitHub。**目前為候選版本，尚未達成完整交付門檻。** 本頁區分已驗證的工程行為與仍需實測的美術／效能要求。

## 已實作範圍

- 新 `taipei` 虛構平面閉環約 1.045 km：街屋起跑 → 市場外緣 → 廟埕 → 商業回程。保留原四賽道及八車。
- `assets/cities/taipei/manifest.json` 固定來源版本 `source-v1-f633ae38aa1e`，54 個來源資產；98 檔共 90,373,758 bytes（含 manifest），256,618 個唯一來源三角形，含建築、道路、標線、植栽、四款玩家車、警車、人物、動畫及特效。來源工作區維持唯讀。
- 所有新場景可見模型保留來源 ID；不以舊車、舊人物、舊特效或舊場景模型補件。HUD、物理、控制、音效及燈光控制沿用遊戲系統。
- 原始車輪 pivot、角色骨架及動畫保留；LM 建築使用原 35 層 surface／emission mask。地面還原來源濕度公式：乾瀝青 roughness `.88`，不再無條件將水窪 mask 當粗糙度。
- 來源車庫、GP、警車追逐、緝凶雙角色、幽靈車與逮捕過場已接入；來源駕駛艙未補造內裝，使用來源相機錨點與既有 2D HUD。
- 城市下載驗證 hash、共享不可變資源、隔離材質／骨架；新賽事完整建立後才提交。離線 cache 以完整版本提交，重新檢查快取淘汰，不將記憶體可玩誤報為離線可用。

## 驗證方式與證據

```sh
npm ci
npm test
python3 -m http.server 8932
# 另一終端；需已安裝 agent-browser
node scripts/qa-taipei.mjs http://127.0.0.1:8932/
git diff --check
```

目前 `npm test` **62/62 通過**（程式 checkpoint `3f9c458`）。自動測試涵蓋來源 hash／幾何、材質語意、輪組／骨架、來源覆蓋、取消與所有權、幽靈相容性、原子切換、路面與建築完整 bbox 淨空，以及快取缺檔／更新／容量不足。瀏覽器腳本封鎖遠端排行榜與廣告請求，只操作本機測試資料；檢查點 teleport 驗證不能代替完整駕駛或 FPS 驗收。

- [材質 GPU 驗證](research/evidence/taipei-materials/GROUND-MATERIAL-RECEIPT.md)：真實 WebGL2 讀回 dry／wet roughness；[建築 LM 驗證](research/evidence/taipei-materials/LM-MATERIAL-RECEIPT.md)。
- [完整離線驗證](research/evidence/taipei-offline/verification.md)：獨立伺服器停止且瀏覽器離線後重載、進入台北、重啟；缺件拒絕啟動。包含淘汰快取後提示狀態的複驗紀錄。
- `research/evidence/taipei-lifecycle/receipt.json`：五賽道結算／幽靈與台北模式、鏡頭、逮捕檢查；以每次 receipt 的 pass 狀態為準。
- [candidate-3 固定鏡位](research/evidence/taipei-candidate-3/receipt.json)：同一程式 checkpoint 的六鏡位 × 三時段，共 18 張，來源 audit 均無缺件且瀏覽器 errors 為空。
- [設計師自評](research/2026-10-20-taipei-designer-review.md)與[獨立美術複評](research/2026-10-20-taipei-candidate-art-review.md)：保留候選分項、確定缺口與未驗證邊界。

## 已完成的瀏覽器工程檢查

五條賽道均通過兩圈檢查點結算、幽靈儲存與重啟；台北四模式及追捕雙角色、四鏡頭、後視鏡與雙角色逮捕過場通過，console errors 為空。逮捕途中實際按 `R` 後 HUD 正常恢復，另存 `taipei-lifecycle/arrest-restart.json`。角色 bind pose／眼瞼與 marker／FX 隱藏幾何陰影已依審查修正並加入回歸測試。

**實際鍵盤跑圈**：`taipei-driving/day-keyboard-drive.json` 記錄連續兩圈、一次 Boost，除了起點定位外不傳送；總時間 73.86 秒。1280×577、devicePixelRatio 1、畫質 1，Apple M1 Metal、HeadlessChrome 153：暖機 2 秒後 4,260 幀，平均 16.87 ms（59.28 FPS），P50 16.7／P95 16.8／P99 16.8 ms，最長 350 ms；draw calls 457–798，triangles 312,790–851,627。自動駕駛最大 lateral 7.7 m，有靠牆情形，並非零碰撞駕駛驗收。這組早於最後人物／庭園／陰影與補光修正，是階段性量測，不能代表最終版本全部模式效能。

**橫向排版**：`taipei-candidate-2/mobile-layout-day.png` 使用 844×390 桌機 viewport，明確啟用模擬 touch presentation 後擷取；可見操作鍵與 HUD。它不是 iPhone/Safari 真機，也不能作觸控多指或手機 FPS 證明。

## 尚未完成的交付門檻

- 設計師與獨立美術審查皆須完整加權總分 ≥8.5，城市辨識及賽道可讀性 ≥8。candidate-3 兩位評審的城市辨識為 8.3／8.4、已見範圍可讀性皆為 8.5，但重複店面、人群與側牆構圖仍需改善；不得刪除 N/A 重算總分。
- 六鏡位 × 三時段與雙美術複評已完成；仍須補齊四車及 Boost／追捕演出的同版本視覺證據。階段性完整跑圈、Boost 數值與橫向 HUD 模擬證據已保存。
- 桌機 60 FPS 目標已有上述階段性 frame-time 分布，仍需最終版本及其他模式複測並追蹤最長幀停頓；測試主機為 Apple M1、8 GB MacBook Air。多瀏覽器並行測試時的速度不能當成效能結論。
- **手機實機 ≥30 FPS 未驗證**。桌機縮放或裝置模擬只可證明排版，不可代替手機效能。

本階段只有台北；香港、高雄、東京、倫敦、臺中等後續城市等待來源素材，不建立空白城市選項。來源再利用狀態沿用研究紀錄；2026-10-21 依使用者明確要求，將目前候選實作、素材及驗證產物整合至 `main` 並同步 GitHub。
