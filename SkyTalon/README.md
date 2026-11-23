# 諸神黃昏 Twilight of the Gods（代號 SkyTalon）

俯視捲軸飛行射擊，2D 渲染加假 3D（地形透視、雲層視差、機體側傾與落影），美術與音效全部程式產生，0 張圖檔、0 個音檔。

- **玩法**：機體自動開火，玩家只控制走位（8 向）。打掉敵機得分，連續擊破不被打中分數越高；讓敵彈擦身而過（擦彈）加分；段末頭目越快打掉加分越多。
- **世界觀**：古代神祇想要統治宇宙，地球是最後的壁壘。一局飛一個航段（四章）；航段一「守住地球」是現有四章，之後是月球到太陽的三個航段（路線圖）。頭目用古希臘羅馬神祇命名。
- **v8（進行中）**：每章前段加長、補給與過場合併、加入編隊／精英機／場景事件、後段敵機加甲殼、頭目有名字與半血後的新攻擊；介面上種子叫「關」。以下是 v7 的現況。
- **局長**：四章（海岸、雲海、峽谷、軌道深空），每章一個小王與一個頭目，段與段之間用推進過場銜接；一般約 4 分 40 秒、上限 356 秒；同種子所有人同一套敵機與彈幕。每章有新的敵機與頭目，打掉小王或頭目後有一次三選一的裝備補給（最多 8 次，選擇時暫停），擊破敵機會掉出回血與限時強化的掉落物，打掉頭目必掉一個裝備升級。
- **技巧軸**：走位瞄準、反應閃避。
- **操作**：手機用手指拖曳（機體飛到手指上方）；電腦用方向鍵或 WASD。
- **題目來源**：原創。美術方向參考一支 AI 生成飛行展示影片的俯視鏡頭（程序地形、傍晚色調、凝結尾），只借氛圍，不沿用其名稱、畫面或程式。 v2 的「三選一」機制借自知識庫 `knowledge-base/ad-funnel/af-survivor-skill-pick.md`，改造對照見 gdd/05 §13。

狀態：**原型 v1**（2026-11-18），迴圈 N0–N8 通過，N9 人工試玩進行中。流程狀態：`node shared/tools/loop.mjs status SkyTalon`。

## 指令（在 `game/` 執行）

| 指令 | 作用 |
|---|---|
| `npm run dev` | 開發伺服器（repo 的 `.claude/launch.json` 有 `sky-talon`，埠 5178） |
| `npm test` | 單元測試：確定性、golden match、技巧證據（調校批次）、難度曲線 |
| `npm run playtest` | 模擬玩家試玩，產生 [docs/playtest_report.md](docs/playtest_report.md) |
| `npm run evidence:confirm` | 技巧證據確認批次（策略凍結後由人執行） |
| `npm run human-report` | 分析 [playtest-data/](playtest-data/README.md) 的真人紀錄 |
| `npm run build && npm run size` | 一般建置與包體檢查 |
| `npm run build:zip` | 上架用單檔 zip → `release/skytalon.zip`（只有一個 `index.html`，可用 file:// 開啟） |
| `npm run audit` | 文件對照程式的稽核 |

開發用網址參數：`?seed=N` 換題、`?auto=expert` 看強策略自動飛、`?playtest=1&tester=代號` 試玩紀錄模式；`/art-preview.html` 是美術預覽頁。這些都不進正式包。

## 文件

| 文件 | 內容 |
|---|---|
| [gdd/03_skill_integrity.md](gdd/03_skill_integrity.md) | 技巧完整性、去隨機化 |
| [gdd/05_game_spec.md](gdd/05_game_spec.md) | 玩法規格 §0–§12 |
| [gdd/07_difficulty_curve.md](gdd/07_difficulty_curve.md) | 難度級、腳本表、調校紀錄、已知弱點 |
| [gdd/10_tech_constraints.md](gdd/10_tech_constraints.md) | 技術限制、假 3D 做法、上架打包 |
| [gdd/11_risks_open.md](gdd/11_risks_open.md) | 風險與待決 |
| [art/README.md](art/README.md) | 美術方向、資產表、禁忌驗收 |
| [docs/playtest_report.md](docs/playtest_report.md) | 模擬玩家試玩報告 |
| [docs/skill_evidence_report.md](docs/skill_evidence_report.md) | 技巧證據（確認批次） |
| [docs/loop/](docs/loop/) | 每個節點的關卡與核准紀錄 |

## 立項檢核（RULE-LEGAL-EXCLUDE-CHANCE）

依 [knowledge-base/02_market-and-legal.md §4](../knowledge-base/02_market-and-legal.md) 排除標準逐條檢核：

| # | 排除標準 | 本作 | 結論 |
|---|---|---|---|
| 1 | 結果主要由機率或營運商設定決定 | 敵機進場時間表是固定腳本，種子只決定航道與同一單位內的順序；無暴擊、無動態難度。v6 的掉落物由擊破敵機掉出，但哪一架帶什麼在開局時由種子排定，同一題每個人相同，擊破時不擲骰；裝備與掉落物都不影響計分。分數只來自擊破、擦彈、頭目擊破時間、剩餘護盾。v2 的三選一不抽卡：每軸三張卡固定輪替、同種子所有人選項相同、時機固定、選卡本身不給分 | 不落入 |
| 2 | 傳統博弈形式（老虎機、撲克、麻將、牌戲） | 飛行射擊，無任何博弈外觀或語彙 | 不落入 |

其他立項確認：

- 精髓七條（[01_skill-integrity §2](../knowledge-base/01_skill-integrity.md)）逐條答案在 [gdd/05 §10](gdd/05_game_spec.md)；本作沒有局外養成、沒有付費影響分數的設計。
- 市場定位（[02 §1、§5](../knowledge-base/02_market-and-legal.md)）：局長落在北美 1–5 分鐘、台灣 2–5 分鐘區間的下緣；單機、單人、同種子。
- 參考遊戲（[15_reference-games](../knowledge-base/15_reference-games.md)）：直版彈幕射擊「9527」違反三原則的做法（`Math.random`、可變 dt、局外加成乘分數）本作一律不採用。
- 授權（[06_art-pipeline §5](../knowledge-base/06_art-pipeline.md)）：不使用外部素材；圖像與音效全部程式產生。

## Profile

見 [game.profile.json](game.profile.json)：品類 `shmup`、技巧軸 `aim` + `reaction` + `planning`、渲染 `2d`、美術 `procedural`、來源 `original` + `af-survivor-skill-pick`、有腳本進程。

`shmup` 是這次新增到 `shared/index/facets.json` 的品類值（捲軸飛行射擊：走位閃彈＋擊破計分），適用於所有同類新作，不是為本作特製。

## 已讀知識庫頁

| 節點 | 頁 |
|---|---|
| N0 立項 | [02_market-and-legal](../knowledge-base/02_market-and-legal.md)、[16_ad-funnel-games](../knowledge-base/16_ad-funnel-games.md)、[15_reference-games](../knowledge-base/15_reference-games.md)、[01_skill-integrity](../knowledge-base/01_skill-integrity.md)、[06_art-pipeline](../knowledge-base/06_art-pipeline.md) |
| N1 去隨機化 | [01_skill-integrity](../knowledge-base/01_skill-integrity.md)、[03_design-patterns](../knowledge-base/03_design-patterns.md)、[13_input-fairness](../knowledge-base/13_input-fairness.md)、[04_tech-stack](../knowledge-base/04_tech-stack.md) |
| N2 規格 | 同上，另加 [12_genre-recipes](../knowledge-base/12_genre-recipes.md)、[16_difficulty-curve](../knowledge-base/16_difficulty-curve.md) |
| N4–N5 sim 與調校 | [04_tech-stack §4](../knowledge-base/04_tech-stack.md)、[16_difficulty-curve](../knowledge-base/16_difficulty-curve.md)、[decisions/2026-11-11-skill-evidence](../knowledge-base/decisions/2026-11-11-skill-evidence.md) |
| N6 美術 | [06_art-pipeline](../knowledge-base/06_art-pipeline.md)、[10_asset-library](../knowledge-base/10_asset-library.md)、[07_themes-and-liveops](../knowledge-base/07_themes-and-liveops.md)、[11_terrain-style-kit](../knowledge-base/11_terrain-style-kit.md) |
| N7 手感、音效、UI | [05_juice-and-feel](../knowledge-base/05_juice-and-feel.md)、[14_audio](../knowledge-base/14_audio.md)、[04_tech-stack §7](../knowledge-base/04_tech-stack.md) |
| N8 包體 | [04_tech-stack](../knowledge-base/04_tech-stack.md) |
| N9 人工試玩 | [16_difficulty-curve §3、§5](../knowledge-base/16_difficulty-curve.md) |
