# 新專案起手

## 0. 開工前必讀（每款新遊戲都要；範本只帶程式，設計知識在知識庫）

依階段讀完再動手，讀過哪些頁寫進 `<NewGame>/README.md`。**只看範本與單一規格書就開工，是 GateLane 漏掉難度曲線、手感與改造的原因**（2026-10-21 檢討）。

| 階段 | 必讀（repo `knowledge-base/`） | 產出 |
|---|---|---|
| 立項 | [README](../../../../knowledge-base/README.md)、[01 技巧完整性](../../../../knowledge-base/01_skill-integrity.md)、[02 市場與法規](../../../../knowledge-base/02_market-and-legal.md)（排除標準） | `gdd/03_skill_integrity.md` |
| 來源是廣告玩法或既有遊戲（「復刻」「改編」） | 對應的 `ad-funnel/af-*.md` **整份**，尤其「Skill Game 化改造（必做）」；[16 廣告導流玩法](../../../../knowledge-base/16_ad-funnel-games.md) §3 | `gdd/05_game_spec.md` §13 逐條回應 |
| 玩法規格 | [03 設計模式](../../../../knowledge-base/03_design-patterns.md)、[12 品類配方](../../../../knowledge-base/12_genre-recipes.md)、[13 輸入公平](../../../../knowledge-base/13_input-fairness.md)、[game-spec-template.md](game-spec-template.md) | `gdd/05_game_spec.md` §0–§12 |
| 難度曲線 | [16 難度曲線](../../../../knowledge-base/16_difficulty-curve.md)（D1–D8） | `gdd/07_difficulty_curve.md`、`docs/playtest_report.md` |
| 手感 / 音效 | [05 打擊感](../../../../knowledge-base/05_juice-and-feel.md)、[14 音效](../../../../knowledge-base/14_audio.md)、[15 參考遊戲](../../../../knowledge-base/15_reference-games.md) | 改寫 `fx/feel.js`、`audio/sfx.js`（不沿用示範遊戲數值） |
| 美術 | [06 美術管線](../../../../knowledge-base/06_art-pipeline.md)、[07 題材](../../../../knowledge-base/07_themes-and-liveops.md)、[10 資產庫](../../../../knowledge-base/10_asset-library.md)、[11 地表設定集](../../../../knowledge-base/11_terrain-style-kit.md) | `art/`、美術規格 |
| 技術 / 風險 | [04 技術框架](../../../../knowledge-base/04_tech-stack.md) | `gdd/10_tech_constraints.md`、`gdd/11_risks_open.md` |

- **「復刻」只復刻玩法結構與操作**：規格書的改造清單照做，或在 gdd/05 §13 逐條寫不採用的理由；名稱、美術、音效全部原創。
- **完成條件**：`npm test`、`npm run size`、`node tools/skill-dominance.mjs 30`、`npm run playtest`、`npm run audit` 全過。`audit`（`shared/tools/game-audit.mjs`）檢查上表的產出是否齊全，要求清單在 `knowledge-base/index/rules.json` 的 `RULE-GAME-DOCS`、`RULE-GAME-REPORTS`、`RULE-AF-ADAPTATION`、`RULE-TEMPLATE-LEFTOVER`。
- 完整流程與每步驗收：[08 生產流程](../../../../knowledge-base/08_production-workflow.md)。

## 1. 複製範本

```bash
cp -r .claude/skills/lite-skillgame-stack/templates <NewGame>/game
cd <NewGame>/game && npm install && npm run dev
```

範本已驗證（2026-10-19，pixi.js 8.22.0 / gsap 3.15.0 / vite 8.3.2）：`npm test` 42/42、`npm run build` 637 KB（brotli 190 KB，含 21 KB 生成的地表 tile）；瀏覽器實測基礎 DC 1、衝擊波期間 2～3、結束回 1，60 FPS，無 WebGL 錯誤。Spine 封裝（`spineActor.js`）只對過 4.3.13 的型別定義，未接實際骨骼檔跑過。

背景是種子產生的示範地形（3 種材質 + 一層高台，0 bytes 圖片、基礎 DC 仍為 1）；鏡頭對準一座高台，一個示範角色在它後方來回走，被擋住時顯示輪廓。開發模式下 `window.__demo` 可在 console 檢查。示範玩法 Beat Tap（30 秒）：拍點依種子出現，圓漸亮、變綠時點 = perfect（分數 + 連擊、閃白、衝擊波、粒子、震動、hit-stop）；其他時間點 = whiff（扣分、紅暗角、小震動）。結束時在裝置上用 `verify()` 重播驗分並顯示「Replay verified ✓」，點擊重來；網址 `?seed=N` 換種子。

換成正式玩法：

1. 讀完 §0，填 [game-spec-template.md](game-spec-template.md)（存成 `<NewGame>/gdd/05_game_spec.md`；改編題加 §13）。
2. 依規格改寫 `src/sim/sim.js`（匯出 `GAME`，難度用固定腳本）、`tools/bots.mjs`（技巧分級）、`tools/humanBots.mjs`（人性化失誤模型）、`tools/playtest.mjs`（本作的單位與難度指數 DI）、`test/determinism.test.mjs`、`main.js` 的 `playJuice`、`fx/feel.js`、`audio/sfx.js`。
3. **不要改** `src/sim/core/`、`test/core.test.mjs`、`tools/lib/`（遊戲無關，跨專案共用）。
4. `npm test` + `node tools/skill-dominance.mjs 30` + `npm run playtest` 過門檻後，更新 golden match 的值；最後 `npm run audit`。

## 2. 目錄結構

```
<NewGame>/
├─ README.md            定位、指令、套用的 skill
├─ gdd/                 gdd-framework 產出；必備 03 / 05 / 07 / 10 / 11（RULE-GAME-DOCS）；10_tech_constraints.md 寫本專案對本 skill 的覆寫
├─ docs/               size_budget.md、skill_dominance_report.md、playtest_report.md（工具產生）
├─ art/                 生圖 prompt、原始輸出、最終 atlas 來源
└─ game/
   ├─ index.html        #stage > #stage-shake > canvas；#fx、#hud 為兄弟節點
   ├─ vite.config.js
   ├─ scripts/size-check.mjs
   ├─ public/           transcoders/、音樂等不經打包的檔案
   ├─ test/             core.test.mjs（核心保證，不改）、determinism.test.mjs（本作規則、golden match）、terrain.test.mjs（地形保證）
   ├─ tools/            bots.mjs（技巧分級 bot）、skill-dominance.mjs、humanBots.mjs + playtest.mjs（難度曲線 D1–D8）、
   │                    lib/dominance.mjs + lib/curve.mjs（通用統計，不改）、tile_check.py / tile_prep.py（材質 tile 驗收與後處理，需 Pillow）
   ├─ examples/         rhythm/、billiards/：配方範例 GameDef + bots（不需要就刪，連同 test/recipes.test.mjs）
   └─ src/
      ├─ main.js        開機、GSAP 全域設定、固定步長迴圈
      ├─ sim/           純邏輯，禁 DOM / Pixi / GSAP / Math.random / Date
      │  ├─ core/       遊戲無關：rng（無狀態雜湊、具名 stream、shuffle）、fixed（定點、查表三角、angleOf）、
      │  │              hash（stateHash）、match（Recorder、replay、verify、encodeLog、playMatch）、
      │  │              grid（valueNoise、makeTerrain、smoothCellAt、cornerMask、terrainHash）、
      │  │              timing（節奏判定）、physics（確定性物理）、input（時間戳輸入、校正、防巨集）
      │  └─ sim.js      本作規則，匯出 GAME（GameDef 契約見 core/match.js 開頭）
      ├─ render/        Pixi 圖層、spineActor.js、terrain.js / terrainBake.js / terrainConfig.js（地形）、xray.js（遮擋輪廓）
      ├─ fx/            feel.js（所有手感數值）、shake / overlay / shockwave / particles
      ├─ ui/            DOM HUD、面板（GSAP 補間）
      ├─ audio/         sfx.js：Web Audio 合成配方
      └─ debug/         drawCalls.js（只在 DEV 動態載入）
```

## 3. 迴圈契約

```
input 佇列 ─▶ Recorder.step(byte)（固定 1/60 s，可一幀多步）─▶ sim.events
                │                                          │
           記錄 input log                 render / fx 讀事件播 juice（不回寫 sim）
                │
      結束 ─▶ upload {game, version, seed, ticks, score, hash, log, choices} ─▶ verify()（客戶端顯示 / 伺服器判分）
```

- sim 只吃每 tick 1 byte 的輸入（位元配置寫在規格 §2）；點擊座標等只給演出用的資料留在 render 層。
- 規則改變結果時 `GAME.version` +1，`verify()` 會拒絕舊版本的上傳。

- 輸入進佇列，每 tick 取一筆；慢幀時不可吞掉點擊。
- hit-stop 只停 render（粒子、插值、Spine），sim 照跑。
- 加 Spine：`npm i @esotericsoftware/spine-pixi-v8@<編輯器 major.minor>`，在 `render/` 用 `SpineActor`，在 `playJuice` 裡呼叫 `actor.overlay('hit')`。

## 4. 啟動提示詞（給其他 AI 工具用）

> 請依 `.claude/skills/lite-skillgame-stack/SKILL.md` 初始化一個 HTML5 單機 Skill Game 專案：包體 ≤ 8 MB（硬上限 10 MB）、基礎 Draw Call ≤ 5。
> 0. 先照 `references/bootstrap.md` §0 讀完知識庫必讀頁；題目來自廣告玩法或既有遊戲時，對應 `af-*.md` 的改造清單逐條採用或寫理由（gdd/05 §13）。
> 1. 2D 用 PixiJS 8（鎖確切版本），動畫與打擊回饋全用 GSAP，GSAP 全域設定照 `references/gsap.md` §1。
> 2. 計分板、升級彈窗等介面用純 HTML/CSS 疊在 canvas 上。
> 3. 模擬層固定 60 Hz、確定性（禁 `Math.random` / `Date` / DOM / GSAP），只 import `src/sim/core/`，匯出 `GAME`；render 只讀 sim 事件播特效。玩法依 `gdd/05_game_spec.md`（範本 `references/game-spec-template.md`）。
> 4. Spine 用 `@esotericsoftware/spine-pixi-v8`：Track 0 基礎動作、Track 1 疊加動作、`defaultMix = 0.2`、換裝用 `setSkin` + `setupPoseSlots`（4.3 API）。
> 5. 畫面震動用 GSAP 抖動包住 canvas 的外層 `<div>`；所有手感數值集中在 `fx/feel.js`。
> 先給目錄結構，再給 `index.html`、`main.js`、`sim/sim.js`、`fx/shake.js` 骨架。完成前跑 `npm run playtest` 與 `npm run audit`，未過就回報哪一項，不要改門檻。
