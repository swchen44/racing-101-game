# Taipei Source City Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留舊四賽道的遊戲中，完成全來源可見素材的台北四段封閉賽道、來源車庫與四模式，提供可驗證的美術與效能證據。

**Architecture:** 開發工具從固定來源模組恢復幾何、材質與構件，輸出帶來源紀錄的資產。城市資產管理器先載入，車與角色轉接器提供既有物理合約；場景配置負責擺放，舊賽道維持原路徑。所有權、非同步切換與城市快取皆有獨立驗證。

**Tech Stack:** Browser ES modules、Three.js r160、來源 r186 隔離抽取、Node.js built-in test runner、source BufferGeometry JSON/PNG/RGBA array、agent-browser。保持純靜態部署。

**Spec:** `docs/superpowers/specs/2026-10-20-taipei-source-city-design.md`

**Current acceptance:** See `docs/TAIPEI-ACCEPTANCE.md`. Engineering and local browser verification are progressing; art/desktop performance/real-phone acceptance remain open.

**Integration update (2026-10-21):** 使用者明確要求將目前候選版本合併至 `main` 並推送 GitHub；此指示取代下列原本的本機分支／不推送限制。未通過的美術、動態與手機驗收仍保留，不宣告完整完成。

## Global Constraints

- 本階段只做台北；保留原四條賽道與車庫；後續香港、高雄、東京、倫敦、臺中等待使用者素材。
- 新場景可見模型全部來自 `/Users/swchen.tw/git/rea_study_gta_taipei`；來源檔案唯讀，必要缺件不能用舊模型補。
- 玩家來源車為 sedan、taxi、sports、suv；police 供追捕。人物與一般車留在車道外。
- 保留原物理、操作、HUD、四模式及追捕雙角色；平面閉環，街屋 → 夜市外緣 → 廟埕 → 商業回程。
- 白天先驗，再黃昏／夜晚。雙美術評審各 ≥8.5，城市辨識／可讀性各 ≥8，重大缺陷清零。
- 桌機目標 60 FPS、手機至少 30 FPS；實際裝置與測量條件必須記錄。無手機實機證據不得宣稱手機效能通過。
- 不發布、推送或改來源工作區；使用者已授權自主選擇實作方法、委派專家及處理可逆工程取捨，不再等待例行確認。

## Review Focus

1. 新場景中的警燈、路障、過場、預覽、VFX 不可漏用舊可見模型；Task 4 的場景 traversal audit 覆蓋。
2. 玩家快速換城市／返回／重複開始時只有最新請求提交且原場景可用；Task 2 的倒序完成測試覆蓋。
3. 幽靈透明與警燈／NPC 動畫不能污染玩家或預覽；Task 3 同時建立實例測試覆蓋。
4. service worker 更新／部分下載／cache 遭淘汰不能誤報離線可用；Task 5 的 cache fixtures 與 browser offline 檢查覆蓋。
5. 原四賽道不得依賴台北完整下載才能遊玩；Task 4 的舊場景瀏覽器回歸覆蓋。

## Execution Rulings

- User delegation authorizes the controller to approve this plan and select an expert-assisted execution method. The spec is approved by the user's OK; implementation proceeds without a further handoff question.
- Worktree: `/Users/swchen.tw/git/racing-game/.worktrees/taipei-source`, branch `feat/taipei-source`. Main base `5a1c078`.
- Detailed source symbol discoveries are recorded in extraction receipts, rather than guessed in advance. An interchange-format change is allowed only if it preserves source fidelity and is ledgered with its cost.

## Task 1: Recover a traceable Taipei asset library

**Files:** Create `scripts/source-assets/*`, `assets/cities/taipei/*`, `tests/source-assets.test.mjs`, `docs/research/evidence/taipei-source/*`.

**Interfaces:** Produces `assets/cities/taipei/manifest.json` schema 1, `{id:'taipei',version,assets:[{id,url,sha256,source:{file,symbol,sha256},bounds,triangles,kind,parts?,textures?,limitations:[]}],required:[assetId]}`. Static models are GLB+PNG where fidelity permits; semantic source buffer data may be retained when required, documented before runtime consumption. Required vehicle ids are `sedan,taxi,sports,suv,police`; building candidates are in the spec.

- [x] Write and run a missing-library test first:
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import {readFile} from 'node:fs/promises';
  test('Taipei has traceable dynamic cars and textured buildings', async () => {
    const m = JSON.parse(await readFile('assets/cities/taipei/manifest.json'));
    for (const id of ['sedan','taxi','sports','suv','police']) {
      const a=m.assets.find(a=>a.id===id);
      assert.ok(a?.parts?.wheels?.length===4, id);
      assert.match(a.source.sha256,/^[a-f0-9]{64}$/);
    }
    assert.ok(m.assets.some(a=>a.kind==='building' && a.textures?.length));
  });
  ```
- [x] Use source lazy extraction for near building generators and their paint callbacks; restore atlas UV rectangles instead of the old whole-atlas placeholder. Obtain representative sign lettering, glass, foliage and emissive separation. Extract source road/curb/barrier/pole/vegetation and necessary effect primitives with source symbols. Keep raw source file hashes and fail on nonfinite geometry.
- [x] Reconstruct wheel semantics from original `xs` vehicle attributes/generation order, preserve steering/spinner pivots and original palette. Export source characters and original animation data with consistent units. Keep metadata for the current source pose, not invented rig fidelity claims.
- [x] Generate only needed assets, test file hashes, bounds, finite positions, UV/image presence, wheel pivot placement and source coverage. Use isolated browser/Canvas or local dev dependencies for baking; never initialize original backend/session/game.
- [x] Produce a local sample gallery and representative screenshots. Document missing source components immediately, continue extraction until required assets are resolved. Run `node --test tests/source-assets.test.mjs`, then commit only owned paths.

## Task 2: City loading and resource ownership

**Files:** Create `js/cities/assets.js`, `js/cities/selection.js`, `tests/city-selection.test.mjs`, `tests/city-assets.test.mjs`.

**Interfaces:** `prepareCity(id,{signal}={}) -> Promise<CityLease>`, where lease exposes `instantiate(assetId)`, `manifest`, `release()`. Instantiation returns a source-tagged Object3D and per-instance mutable material/skeleton/controller state. `createSelectionGate()` returns `{begin(snapshot),isCurrent(token),cancel()}`. Immutable geometry/textures have shared ownership; no caller uses legacy disposal on shared assets.

- [x] Write RED tests for out-of-order requests and cancel:
  ```js
  const gate=createSelectionGate();
  const first=gate.begin({city:'taipei',car:'taxi'});
  const next=gate.begin({city:'taipei',car:'sports'});
  assert.equal(gate.isCurrent(first),false);
  assert.equal(gate.isCurrent(next),true);
  gate.cancel(); assert.equal(gate.isCurrent(next),false);
  ```
- [x] Implement only the selected format loader, required-file validation and explicit missing-asset errors. Reject unknown ids, preserve request snapshots and release late completions.
- [x] Verify two leases keep shared resources alive until the last release, while mutable materials/skeletons differ. A partial load releases all acquired resources and never registers a ready lease.
- [x] Commit covering test and implementation after GREEN; runtime browser verification follows Task 4.

## Task 3: Source car and actor adapters

**Files:** Create `js/cities/vehicles.js`, `js/cities/characters.js`; modify `js/cars/index.js`, `js/vehicle.js`, `js/ghost.js`, `js/opponents.js`, `js/police.js`, `js/chase.js`, `js/arrest.js`, `js/carpreview.js`; tests `tests/source-actors.test.mjs`.

**Interfaces:** `buildSourceVehicle(def,lease) -> {mesh,parts}` matches `Car` bodyGroup/wheels contract. `sourceCarDefinitions` exposes four player cars and a police spec. Mode constructors receive an optional city asset context; without it legacy behavior remains. `buildSourceCharacter(kind,lease)` returns independently animated source rig. Vehicle metadata supplies wheelRadius, forward axis, collision dimensions and camera anchors.

- [x] RED test creating player, ghost and police instances with independent material states, steering/spin groups and source IDs. Test current-car ghost semantics with route-version invalidation and preservation of legacy ghost records.
- [x] Implement source builders and register explicit ids; resolve source actor/model choice through context for GP, police, chase both roles, preview and arrest. Remove implicit GT/taxi fallback for a missing city asset.
- [x] Use original rigs/clips where available; map existing game event timing to source actions, verify foot placement and flip pivot. Source cockpit missingness remains explicit; do not transplant old 3D interiors.
- [x] Check all four wheels rotate and front wheels steer without moving chassis; ghost transparency and police flashes do not change player/preview. Run actor tests, then commit scoped files.

## Task 4: Complete Taipei scene and race lifecycle

**Files:** Create `js/cities/taipei.js`, `js/cities/scene.js`; modify `js/config.js`, `js/main.js`, `js/i18n.js`, `js/effects.js`, `js/sponsors.js`, `index.html`; create `tests/city-scene.test.mjs` and browser QA fixtures.

**Interfaces:** City definition supplies `trackDef`, `vehicleIds`, `routeRevision`, placement seed and four zone descriptors. `buildSourceCity(track,lease,weather)` returns `{group,update,dispose,audit}`. `audit()` reports all visible geometry with missing source IDs. Loading creates a complete staged race bundle; only a current token can replace the old world/car/actors.

- [x] Add a failing scene contract test requiring valid placement transforms, four zone ids, required source asset references and zero untagged rendered geometry.
- [x] Add Taipei closed control points and bilingual text; retain prior track IDs. Build source road surface and curb geometry along the same sampled path, preserving source cross-section/material and documenting derivation. Position streets/buildings with road setbacks from actual bounds.
- [ ] Start with the 30-second daylight segment; use actual camera/vehicle to tune placement and expose material defects. Then build the full four-zone loop with diverse source facades, a temple focal point and controlled distant massing.
- [x] Replace visual roadblock, marker, sponsor frame, preview-stage and geometry-bearing effects with traced source components; keep gameplay trigger logic. Distinguish lights/postprocessing from visible model assets.
- [x] Add user-facing progress/retry states and city-limited source vehicle selection; await assets before preview/race construction. Stage and atomically commit latest selection. Original four tracks must still load without Taipei assets.
- [ ] Run browser checks for four modes, both chase roles, ghost, menu, restart, finish, camera/mirror, three times of day and source audit; capture desktop/mobile-layout evidence. Commit after reproducible failures are fixed.

## Task 5: Versioned offline support

**Files:** Modify `sw.js`; create `js/cities/offline.js`, `tests/city-cache.test.mjs`; update UI text for offline availability.

**Interfaces:** City manifests bind immutable asset URLs/hashes to runtime compatibility. Offline readiness is computed from required files actually present; cache names use a game-owned namespace with core/city version scope.

- [x] RED test that core activation keeps compatible city caches and unrelated applications' caches; missing one required file means not-ready even if prior ready metadata exists.
- [x] Populate candidate city cache, verify required items including loaders/textures/fonts/decoders, then mark committed. Retry partial downloads; report capacity failure, retain playable prior content.
- [x] Replace broad cache deletion with namespace/version rules; prevent network-first mixing versions. Confirm online complete load → offline reload → race restart and version update using an isolated browser session.
- [x] Run cache tests and commit scoped changes.

## Task 6: Gameplay, visual and performance acceptance

**Files:** Create `scripts/qa-taipei.mjs`, `docs/research/evidence/taipei/*`, `docs/TAIPEI-ACCEPTANCE.md`; update README/PLAYER-GUIDE/GAME-DESIGN and the asset/scene files implicated by verified defects.

**Interfaces:** QA output records commit, manifest hash, seed, camera, weather, car, mode, viewport, device/browser, quality, frame-time distribution, draw calls and screenshots. No production leaderboard/ad writes during QA: block external endpoints in the dedicated session.

- [ ] Run meaningful Node tests and browser scenario matrix; validate all visible model IDs, no console/page errors, scene-switch resources and original-track regression.
- [ ] Capture six fixed views × three times of day, full-lap and Boost/chasemode evidence, mobile layout and four car views. Inspect actual screenshots rather than relying on successful save commands.
- [ ] Have the environment designer and independent reviewer score the same eight-item rubric. Fix concrete defects and repeat only affected evidence. Both must reach 8.5 overall and 8 city/readability, with no major defects, before declaring art acceptance.
- [ ] Profile desktop on reported hardware, fixed settings and a timed driving route. Attempt available real-device connection only through existing supported access; if absent, report phone FPS as unverified, not estimated from desktop emulation.
- [ ] Run final fresh-context whole-branch review, fix verified issues, save acceptance receipts and local commits. Leave feature branch reviewable; no public deployment or shared-branch push.

## Progress

Task execution and decisions are tracked in this plan's `.superpowers/sdd/` ledger. Completed tasks carry commit/test evidence; a partial segment or passing parser is never reported as full city acceptance.
