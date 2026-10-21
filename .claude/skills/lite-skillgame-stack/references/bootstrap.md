# 新專案起手

## 1. 複製範本

```bash
cp -r .claude/skills/lite-skillgame-stack/templates <NewGame>/game
cd <NewGame>/game && npm install && npm run dev
```

範本已驗證（2026-10-19，pixi.js 8.22.0 / gsap 3.15.0 / vite 8.3.2）：`npm test` 41/41、`npm run build` 637 KB（brotli 190 KB，含 21 KB 生成的地表 tile）；瀏覽器實測基礎 DC 1、衝擊波期間 2～3、結束回 1，60 FPS，無 WebGL 錯誤。Spine 封裝（`spineActor.js`）只對過 4.3.13 的型別定義，未接實際骨骼檔跑過。

背景是種子產生的示範地形（3 種材質 + 一層高台，0 bytes 圖片、基礎 DC 仍為 1）；鏡頭對準一座高台，一個示範角色在它後方來回走，被擋住時顯示輪廓。開發模式下 `window.__demo` 可在 console 檢查。示範玩法 Beat Tap（30 秒）：拍點依種子出現，圓漸亮、變綠時點 = perfect（分數 + 連擊、閃白、衝擊波、粒子、震動、hit-stop）；其他時間點 = whiff（扣分、紅暗角、小震動）。結束時在裝置上用 `verify()` 重播驗分並顯示「Replay verified ✓」，點擊重來；網址 `?seed=N` 換種子。

換成正式玩法：

1. 先填 [game-spec-template.md](game-spec-template.md)（存成 `<NewGame>/gdd/05_game_spec.md`）。
2. 依規格改寫 `src/sim/sim.js`（匯出 `GAME`）、`tools/bots.mjs`、`test/determinism.test.mjs`、`main.js` 的 `playJuice`。
3. **不要改** `src/sim/core/` 與 `test/core.test.mjs`（遊戲無關，跨專案共用）。
4. `npm test` + `node tools/skill-dominance.mjs 30` 過門檻後，更新 golden match 的值。

## 2. 目錄結構

```
<NewGame>/
├─ README.md            定位、指令、套用的 skill
├─ gdd/                 gdd-framework 產出；10_tech_constraints.md 寫本專案對本 skill 的覆寫
├─ docs/size_budget.md  預算表 + 實測
├─ art/                 生圖 prompt、原始輸出、最終 atlas 來源
└─ game/
   ├─ index.html        #stage > #stage-shake > canvas；#fx、#hud 為兄弟節點
   ├─ vite.config.js
   ├─ scripts/size-check.mjs
   ├─ public/           transcoders/、音樂等不經打包的檔案
   ├─ test/             core.test.mjs（核心保證，不改）、determinism.test.mjs（本作規則、golden match）、terrain.test.mjs（地形保證）
   ├─ tools/            bots.mjs（技巧分級 bot）、skill-dominance.mjs、lib/dominance.mjs（通用統計）、tile_check.py / tile_prep.py（材質 tile 驗收與後處理，需 Pillow）
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
> 1. 2D 用 PixiJS 8（鎖確切版本），動畫與打擊回饋全用 GSAP，GSAP 全域設定照 `references/gsap.md` §1。
> 2. 計分板、升級彈窗等介面用純 HTML/CSS 疊在 canvas 上。
> 3. 模擬層固定 60 Hz、確定性（禁 `Math.random` / `Date` / DOM / GSAP），只 import `src/sim/core/`，匯出 `GAME`；render 只讀 sim 事件播特效。玩法依 `gdd/05_game_spec.md`（範本 `references/game-spec-template.md`）。
> 4. Spine 用 `@esotericsoftware/spine-pixi-v8`：Track 0 基礎動作、Track 1 疊加動作、`defaultMix = 0.2`、換裝用 `setSkin` + `setupPoseSlots`（4.3 API）。
> 5. 畫面震動用 GSAP 抖動包住 canvas 的外層 `<div>`；所有手感數值集中在 `fx/feel.js`。
> 先給目錄結構，再給 `index.html`、`main.js`、`sim/sim.js`、`fx/shake.js` 骨架。
