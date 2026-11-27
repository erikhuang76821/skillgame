# 10 Tech Constraints

- **目的**：技術選型、確定性模擬、渲染預算；本專案對 `lite-skillgame-stack` skill 的覆寫
- **相關系統**：[05](05_game_spec.md)、[03](03_skill_integrity.md)
- **狀態**：Draft

## 技術選型

| 項目 | 選擇 | 版本（鎖定） | 備註 |
|---|---|---|---|
| 渲染 | PixiJS | 8.22.0 | WebGL；不用 WebGPU |
| 補間 / 打擊回饋 | GSAP | 3.15.0 | 只在 render / UI 層 |
| 建置 | Vite | 8.3.2 | `assetsInlineLimit: 0` |
| 音效 | Web Audio 程式合成 | — | 0 bytes 音檔 |
| 美術 | 開機時用 Graphics 畫好再 `generateTexture` | — | 遊玩畫面不使用圖檔（佔位美術；`assets/terrain/dust.png` 未接上） |
| 字型 | Pixi `BitmapFont.install`（系統字型產生） | — | 只裝數字與 `+-×xLvMA●○` |

## 確定性規則

- `src/sim/` 不 import Pixi、GSAP、DOM，不用 `Math.random`、`Date`；全部整數運算，平方根用 `isqrt()`。
- 輸入：每 tick 1 byte（目標 x，見 05 §2）；觸控座標等只留在 render 層。
- 事件（`sim.events`）只給演出用，不進 `stateHash`；`recordEvents = false` 時結果相同（有測試）。
- 規則改變結果時 `GAME.version` +1，並更新 golden match。

## 畫面與預算

| 項目 | 規格 | 實測 |
|---|---|---|
| 畫面 | 直版，邏輯 720×1280，等比縮放置中；跑道寬 600 | — |
| Draw Call | 基礎 ≤ 5 | 遊玩中 2（頭目死亡衝擊波期間 +1～2） |
| 包體 | 目標 ≤ 8 MB、硬上限 10 MB | 680 KB（brotli 186 KB） |
| 士兵顯示 | 最多 90 個 sprite（向日葵排列），人數用數字顯示 | — |

## 對 skill 的覆寫

| 項目 | skill 通則 | 本作 | 理由 |
|---|---|---|---|
| 地形系統 | 範本附地形 | 不用 | 跑道是單一 TilingSprite |
| 粒子 | 範本 `Particles`（每次 `Math.random`） | 沿用 | 只在 render 層，不影響 sim |
| `fx/feel.js`、`audio/sfx.js` | 應改成本作內容 | 暫時沿用範本 | 佔位階段；`npm run audit` 會警告，正式美術音效時改寫 |
