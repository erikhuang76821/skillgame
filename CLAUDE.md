# SKILLGAME

輕量化 HTML5 單機 Skill Game 作品集。每個遊戲一個資料夾（目前：`SwarmDuel/`、`TwinStrike/`（規格階段））。

跨遊戲的調查與技術框架彙整在 [`knowledge-base/`](knowledge-base/README.md)（市場法規、規則卡索引、技術棧、美術管線、生產流程、知識缺口）。開新遊戲前先讀。

## 技術規範（必讀）

寫任何遊戲程式（渲染、動畫、GSAP、特效、Spine、資源載入、選型）前先載入 repo skill **`lite-skillgame-stack`**（`.claude/skills/lite-skillgame-stack/`）。硬規則摘要：

- 包體 ≤ 8 MB（硬上限 10 MB），`npm run build && npm run size` 必過
- 2D 基礎 Draw Call ≤ 5、3D ≤ 9；UI 一律 HTML/CSS 疊在 canvas 上
- 技術棧白名單：PixiJS 8 / GSAP 3 / spine-pixi-v8 / Web Audio（Howler、ogl、three 視需要），版本鎖確切值，不引入整套引擎
- 模擬層確定性：`sim/` 禁 DOM / Pixi / GSAP / `Math.random` / `Date`；打擊感只在 render / UI 層，由 sim 事件驅動
- 手感數值集中在 `fx/feel.js` 的 `FEEL`，GSAP 參數照 skill 的 `references/gsap.md`
- 不從 CDN 執行期載入任何程式或 wasm

## 優先序

專案自己的技術文件 > skill 通則。已知覆寫：

| 專案 | 覆寫 | 出處 |
|---|---|---|
| SwarmDuel | 像素風：sprite 不用 KTX2；**不使用任何 filter**（衝擊波改用 sprite 擴散環）；不做通用粒子系統；WebGPU 關閉 | `SwarmDuel/gdd/10_tech_constraints.md`、`SwarmDuel/docs/size_budget.md` |

新遊戲用 `.claude/skills/lite-skillgame-stack/templates/` 起手。
