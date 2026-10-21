# 08 生產流程與工具 — 從點子到可玩原型

> 把 SwarmDuel 實際走過的流程抽象成新遊戲可重用的步驟。每一步列出現有的知識、工具、驗收標準。

## 1. 流程總覽

| # | 階段 | 輸入 / 知識 | 工具 / skill | 產出 | 驗收 |
|---|---|---|---|---|---|
| 1 | 選市場與品類 | [02](02_market-and-legal.md)、[03](03_design-patterns.md) | — | 一頁定位 | 不落入排除標準；有空缺或差異化 |
| 2 | 去隨機化設計 | [01](01_skill-integrity.md) §3 | — | 隨機來源清單 + 公平化做法 | 精髓七條全過 |
| 3 | GDD + 玩法規格 | 規則卡範本、[01](01_skill-integrity.md) | `gdd-framework`（`~/.claude/skills/`）、[game-spec-template.md](../.claude/skills/lite-skillgame-stack/references/game-spec-template.md) | `gdd/00–11`、`gdd/05_game_spec.md` | 03 技巧完整性、10 技術、11 風險必寫；規格 §0–§12 填完 |
| 4 | 專案起手 | [04](04_tech-stack.md) | `lite-skillgame-stack` templates | 可跑骨架 | `npm run dev` 基礎 DC 1 |
| 5 | 確定性 sim + 測試 | [04](04_tech-stack.md) §4、規格 | 範本 `sim/core/`（不改）；依規格改寫 `sim/sim.js`、`test/determinism.test.mjs`（可用規格裡的 AI 提示詞） | `sim/`、`test/` | `npm test` 全過、golden match 更新 |
| 6 | 技巧主導驗證 | [01](01_skill-integrity.md) §4 | 依規格 §9 改寫 `tools/bots.mjs`；`node tools/skill-dominance.mjs 30 --out ../docs/skill_dominance_report.md` | 報告 | 技巧佔比 ≥ 70%、最強 vs 次強 ≥ 70%（未過 exit 1） |
| 6b | 難度曲線 | [16](16_difficulty-curve.md) | 腳本（難度級 + 段落表）寫進 sim；`tools/humanBots.mjs` + `tools/playtest.mjs`（參考 TwinStrike） | `gdd/07_difficulty_curve.md`、`docs/playtest_report.md/.html` | D1–D8 全過（失敗 exit 1）；調校紀錄寫進 gdd/07 |
| 7 | 美術 | [06](06_art-pipeline.md)、[07](07_themes-and-liveops.md) | `codex-image`、`pokesurvivor-asset-dev`（`~/.codex/skills/`） | atlas + metadata | 身分一致、真 alpha、validate 通過 |
| 8 | 打擊感 / UI | [05](05_juice-and-feel.md) | `FEEL`、GSAP | juice、DOM HUD、結算 | LOW 模式資訊不丟 |
| 9 | 包體 / 效能 | [04](04_tech-stack.md) §5–6 | `npm run size`、drawCalls.js、Spector.js | size budget 實測 | ≤ 8 MB、DC ≤ 5 |
| 10 | 交付自檢 | [04](04_tech-stack.md) §9 | — | — | 清單全勾 |

## 2. 常用指令

```bash
cp -r .claude/skills/lite-skillgame-stack/templates <NewGame>/game
```

```bash
npm run build && npm run size
```

```bash
npm test
```

```bash
node tools/skill-dominance.mjs 30
```

```bash
npm run playtest
```

```bash
codex exec --skip-git-repo-check --sandbox read-only < art/prompts/<asset>.txt
```

## 3. Skill / 工具所在位置

| 名稱 | 位置 | 用途 | 風險 |
|---|---|---|---|
| `lite-skillgame-stack` | repo `.claude/skills/` | 技術規範 + 範本 | — |
| `gdd-framework` | `~/.claude/skills/` | GDD 結構 | 不在 repo，換機要另裝 |
| `codex-image` | `~/.claude/skills/` | Codex CLI 生圖 | 同上 |
| `pokesurvivor-asset-dev` | `~/.codex/skills/` | sprite 契約、`sprite_sheet.py` pack / validate | 不在 repo；`anim_frames.py` 寫死此路徑 |
| `skill-dominance.mjs`、`lib/dominance.mjs`、`bots.mjs` | 範本 `tools/` | 技巧主導報告（通用統計 + 本作 bot） | `bots.mjs` 每款要依規格重寫 |
| `humanBots.mjs`、`difficulty-curve.mjs`、`playtest.mjs` | `TwinStrike/game/tools/` | 人性化試玩、難度曲線與節奏驗收（[16](16_difficulty-curve.md)） | 尚未抽進範本；負荷模型與 DI 要依品類改寫 |
| `anim_prompts.py / gen_anim.sh / anim_frames.py / anim_preview.py` | `SwarmDuel/tools/` | 8 方向像素動畫管線 | 只適用像素俯視角色 |
| `.claude/launch.json` | repo | dev server 預覽（swarm-duel :5173） | 新遊戲要加一筆 |

## 4. 給其他 AI 的啟動提示詞

見 [bootstrap.md §4](../.claude/skills/lite-skillgame-stack/references/bootstrap.md)。
