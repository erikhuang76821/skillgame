# Gate Lane（工作代號）

復刻 Last War: Survival 開場的「加乘門射擊跑道」：小隊沿跑道自動射擊，左右拖曳選門、射門加值、打爆桶子拿武器，最後擊倒頭目。只復刻玩法結構，名稱、美術、音效全部原創（目前遊玩畫面全部程式繪製，包體不含圖檔；`game/src/assets/terrain/dust.png` 是未接上的地形試作，啟用時要重查 `game.profile.json` 的 `artStyle`）。

## 核心技巧

- **選門**：×2 還是 +N。+N 依參考兵力出題，兵力超過參考值時 ×2 才划算；+兵會加寬隊形，更容易吃到側邊殭屍與桶子。
- **射門與清怪的取捨**：怪群不會同時出現在同一側，射門加值就得放掉一側的怪。
- **判斷桶能不能打破**：打破拿武器或兵力，打不破撞上要扣兵，要提早決定換道還是硬打。

## 排除標準檢核（N0 立項）

依 [RULE-LEGAL-EXCLUDE-CHANCE](../knowledge-base/02_market-and-legal.md)（§4 排除標準）逐條檢核。非法律意見，上線前需法務。

| # | 排除條件 | 判斷 | 依據 |
|---|---|---|---|
| 1 | 結果主要由機率決定 | 不落入 | 門值、左右位置、怪群、桶只在開局由種子產生，之後不再抽亂數；同種子＋輸入紀錄可重播驗分（[gdd/05 §3](gdd/05_game_spec.md)、`sim.js` `buildCourse()`）。技巧佔比 91.4%（30 種子、bot，[報告](docs/skill_dominance_report.md)）；真人證據留待 N9 |
| 2 | 結果由營運商設定決定（中獎門檻、派彩率、預設結果序列） | 不落入 | 勝負只看士兵存活與頭目 HP，分數只來自擊殺、打桶、頭目傷害、剩餘時間與生還士兵（[gdd/05 §6–7](gdd/05_game_spec.md)）；沒有派彩率或預設勝負 |
| 3 | 傳統博弈形式（老虎機、撲克、麻將、牌戲） | 不落入 | 核心是走位選門的跑道射擊 |
| 4 | 付費影響勝負 | 不落入 | 沒有局外養成、沒有看廣告復活；每局 5 名士兵、武器 Lv1 起步（[gdd/05 §10 E6](gdd/05_game_spec.md)） |
| 5 | 隨機獎勵 | 不落入 | 桶的獎勵由波次腳本指定、擊破即給固定值，沒有機率掉落（[gdd/05 §5](gdd/05_game_spec.md)） |

**種子鎖定原則**（同種子競賽）：同一場比賽所有人用同一個種子；種子在開賽前一次產生並記錄，開賽後不得更換，也不得依結果挑題；每日種子與錦標賽種子分開，錦標賽種子開賽前才發（[gdd/11 R8](gdd/11_risks_open.md)）。

**未涵蓋**：現金或獎品賽的營運模式不在本次核准範圍（[gdd/11 Open Questions](gdd/11_risks_open.md)）。

調查與原作分析：[knowledge-base/ad-funnel/af-gate-lane-shooter.md](../knowledge-base/ad-funnel/af-gate-lane-shooter.md)

| 項目 | 現況 |
|---|---|
| 玩法規格 | [gdd/05_game_spec.md](gdd/05_game_spec.md) |
| 畫面 | 直版 720×1280 邏輯畫面，等比縮放；跑道寬 600 |
| 包體 | 680 KB（brotli 186 KB），目標 8 MB |
| Draw Call | 遊玩中 2 |
| 確定性 | `npm test` 31/31；瀏覽器與 Node 跑同種子結果一致（golden match） |
| 技巧主導 | 30 種子：技巧佔比 91.4%、高手 vs 中等 93.3%（門檻 70%）→ [docs/skill_dominance_report.md](docs/skill_dominance_report.md) |
| 難度曲線 | D1–D8 全過（sim v3）→ [gdd/07_difficulty_curve.md](gdd/07_difficulty_curve.md)、[docs/playtest_report.md](docs/playtest_report.md) |
| 試玩報告 | v1 → v2 的 bug 與平衡調整 → [docs/playtest_v2.md](docs/playtest_v2.md) |

## 與原作的差異

| 原作 | 本作 |
|---|---|
| 看廣告復活、主城科技加成 | 無；每局 5 名士兵、武器 Lv1 起步 |
| 關卡 | 21 波固定腳本（每級只加一件新東西、3 個調息波）＋頭目；種子只換位置與數值區間 |
| 結果 | 確定性模擬＋輸入紀錄重播驗分（結算畫面顯示「重播驗證 ✓」） |

## 操作

- 手機：畫面任意處按住左右拖曳。射擊自動。
- 電腦：滑鼠拖曳，或 ←/→、A/D；M 靜音；空白鍵開始／重來。
- 網址 `?seed=N` 換種子。

## 指令

```bash
cd game && npm install && npm run dev
```

```bash
cd game && npm test
```

```bash
cd game && npm run build && npm run size
```

```bash
cd game && node tools/skill-dominance.mjs 30 --out ../docs/skill_dominance_report.md
```

```bash
cd game && node tools/stats.mjs 20
```

```bash
cd game && node tools/playtest.mjs 30 --out ../docs/playtest_report
```

## 已知待辦

見 [gdd/07_difficulty_curve.md](gdd/07_difficulty_curve.md) §7 與 [docs/playtest_v2.md](docs/playtest_v2.md) 第 3 節（新手太容易活到頭目、正式美術等）。
