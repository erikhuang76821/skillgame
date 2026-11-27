# 05 玩法規格 — Gate Lane（加乘門射擊跑道）

> 復刻 Last War: Survival 開場的「加乘門射擊跑道」玩法（調查見 [knowledge-base/ad-funnel/af-gate-lane-shooter.md](../../knowledge-base/ad-funnel/af-gate-lane-shooter.md)）。只復刻玩法結構；名稱、美術、音效全部原創，不使用原作任何素材。
> 本規格的每個數字都對應 `game/src/sim/sim.js` 的同名常數；改數值先改這裡，結果會變就 `GAME.version` +1。

## §0 Meta

| 欄位 | 值 |
|---|---|
| id | `gate-lane` |
| version | 3（v1 → v2 見 [docs/playtest_v2.md](../docs/playtest_v2.md)；v2 → v3 的波次腳本與數值見 [07_difficulty_curve.md](07_difficulty_curve.md)，**以 07 為準**） |
| 技巧軸 | 走位（選門、射門加值、閃桶、清怪路線） |
| 局長 | 跑道約 86 秒（`BOSS_STOP` = 20,660 px ÷ 240 px/s）＋頭目最多 15 秒；硬上限 `maxTicks` = 110 s = 6,600 tick |
| 對戰格式 | 同種子單人排行／非同步 1v1 |
| 世界座標 | 跑道寬 `LANE_W` = 600 px；縱向用「跑道距離」`y`（px，整數）。小隊在 `sim.dist`。畫面固定顯示小隊前方 1,060 px（邏輯畫面 1,280 高、小隊畫在 y = 1,060）；殭屍在前方 `VIEW_AHEAD` = 1,000 px 內才啟動，啟動點一定在畫面內（所有裝置相同，E3） |
| 精度 | 整數 px；平方根用整數 `isqrt` |

## §1 狀態

「進 hash」= `stateHash()` 實際混入的值；其餘欄位由種子或已混入的值決定，不另外混入。

| 欄位 | 初值 | 說明 | 進 hash |
|---|---|---|---|
| `tick` | 0 | 時鐘（作為 hash 的起始值） | ✓ |
| `dist` | 0 | 小隊跑道距離；到 `BOSS_STOP` 停止前進 | ✓ |
| `sx`、`target` | 300、300 | 小隊中心 x、目標 x（0–600） | ✓ |
| `troops` | 5 | 士兵數（0–9,999） | ✓ |
| `weapon` | 1 | 武器等級（1–6） | ✓ |
| `score`、`result` | 0、0 | 總分；0 進行中、1 贏、−1 輸 | ✓ |
| `kills`、`armoredKills`、`barrelsBroken`、`gatesPumped` | 0 | 計分與統計明細 | ✓ |
| `zombies[]` | 種子生成 | `{id, x, y, hp, maxHp, armored, spd, bite, active}`，依 id 遞增 | 只混 `x, y, hp` |
| `gates[]` | 種子生成 | 一列兩扇：`{id, y, side, kind:'add'|'mul', v, step, hits, used}` | 只混 `v, used` |
| `barrels[]` | 種子生成 | `{id, x, y, hp, maxHp, reward:'weapon'|'troops', amount}` | 只混 `hp` |
| `bullets[]` | 空 | `{x, y, dmg}`（順序即發射順序） | 長度與每顆 `x, y, dmg` |
| `boss` | 見 §5 | `{x, y, hp, maxHp, active}` | 混 `x, y, hp, active` |
| `peakTroops` | 5 | 最多士兵（只顯示，不計分） | ✗ |
| `bossDmgPts`、`bossBonus`、`survivorBonus` | 0 | 結束時才算的分數明細，已含在 `score` | ✗ |

## §2 輸入（每 tick 1 byte）

| 值 | 意義 |
|---|---|
| 0 | 維持目前目標 |
| 1–255 | 目標 x = `round((b − 1) × 600 / 254)` |

觸控：在畫面任意處按住左右拖曳，手指 x 對應跑道 x。鍵盤：←/→ 或 A/D。小隊每 tick 最多橫移 `moveSpeed` = 12 px 趨近目標。射擊全自動（原作如此）。

**取樣規則**（`core/input.js` `SteerInput`，跨裝置公平）：

- 每個拖曳點與按鍵按下／放開都記下事件時間戳，換算成它所在的 sim tick（`InputClock`）。
- 第 *k* 個 tick 的目標 x = 時間戳落在第 *k* 個 tick 以前的最後一個拖曳點；按住方向鍵時，每 tick 再移 `KEY_STEP` = 10 px（不是每幀），夾在 0–600。
- 事件晚到（它的 tick 已經跑過）就在下一個 tick 套用，並計入 `late`。
- 結果：同一段操作在 30／60／120／144 Hz 與卡頓下產生同一份輸入紀錄（`test/input.test.mjs`）。

## §3 隨機

| stream | id | 用途 | index |
|---|---|---|---|
| `course` | 1 | 每段內容（門值、好門在哪邊、怪群位置、桶） | 段號 × 64 + 段內序號 |

整條跑道在 `createSim(seed)` 一次生成，之後不再抽亂數 → 挑戰只取決於種子（E2）。

## §4 Tick 順序

1. 清空 events
2. 套用輸入，小隊橫移
3. 前進 `runSpeed` px（到 `BOSS_STOP` 後停止）
4. `tick % firePeriod = 0` 時開火一輪
5. 子彈移動與碰撞（每顆子彈依 y、種類、id 由近到遠結算第一個目標；頭目 HP 歸零 → 立即贏）
6. 殭屍移動與接觸
7. 桶接觸
8. 過門
9. 頭目推進、擺動與接觸
10. `tick++`；若仍未結束且 `tick ≥ maxTicks` → 輸

**同 tick 的優先序**：結果一旦決定，該 tick 後面的步驟都不跑。所以同一 tick 內：擊倒頭目（步驟 5）先於任何受傷；殭屍咬到兵力歸零（6）先於撞桶（7）與過門（8）；頭目碰到小隊（9）先於時間到（10）。剩餘秒數 = `trunc((頭目 y − dist) ÷ (bossSpeed × 60))`。

## §5 規則

| 規則 | 數值 |
|---|---|
| 前進速度 `RUN_SPEED` | 4 px/tick（240 px/s） |
| 隊形半寬 | `min(140, 10 + 6·isqrt(troops))` |
| 開火 | 每 `firePeriod` = 8 tick 一輪；子彈數 `k = min(troops, 2 + weapon, 9)`；第 *i* 顆 x = `sx − 半寬 + trunc(2 × 半寬 × i ÷ (k − 1))`（k = 1 時在 `sx`）；每顆傷害 `ceil(troops × WEAPON_DMG[weapon] ÷ (10 × k))`（`WEAPON_DMG` = 10, 12, 14, 16, 18, 20）；速度 20 px/tick；射程 1,000 px |
| 子彈 | 擊中第一個目標即消失（不穿透） |
| 參考兵力 | `REF_TROOPS[0]` = 8，之後每波 `trunc(前一波 × 13 ÷ 10)`；`REF_DMG[波] = max(1, trunc(REF_TROOPS[波] ÷ 3))`。各波等級與段落見 [07 §2](07_difficulty_curve.md)，等級內容見 `sim.js` `LEVELS` |
| 門值 | 門值單位 `sc = max(1, trunc(REF_TROOPS[波] ÷ 10))`；`add` 門的值 = `r(lo, hi) × sc`，好門在左或右由種子決定。各級（lo–hi）：easy 好 2–4／壞 0–1；neg 好 1–2／壞 −4～−8；mul 好 ×2／壞 4–7；bothNeg 兩扇 −1～−2 與 −5～−9 |
| 射門 | 子彈打到 `add` 門：門值 + `max(1, trunc(sc ÷ 2))`，每扇最多 `pumpMax` = 6 次；射滿後子彈直接穿過（畫面顯示 MAX）。`mul` 門不吸子彈 |
| 過門 | 小隊中心越過門列時，依中心在左半或右半套用：`add` → `troops += v`；`mul` → `troops ×= v`；上限 9,999 |
| 殭屍 | HP = `max(1, trunc(REF_DMG[波] × hits ÷ 10))`，裝甲 × `armoredHpMul` = 4；速度 2 px/tick（等級 7、8 為 3）；前方 ≤ `homeRange` = 400 px 時每 tick 朝小隊 x 靠 `zombieHome` = 1 px；碰到隊形 → 殭屍消失、`troops −= bite`，`bite = max(1, trunc(REF_TROOPS[波] ÷ 25))`，裝甲再 × `armoredBite` = 3；走過小隊 40 px 沒碰到就消失、不扣兵 |
| 桶 | 每波最多一個。HP：武器桶 `REF_DMG[波] × 12`、閃避桶 × 80、兵力桶 × 6。擊破給獎勵（`weapon` +1 級，或 `troops` + `trunc(REF_TROOPS[波] ÷ 8)`，桶上顯示同一個數）；沒擊破就撞上 → `troops −= min(ceil(hp ÷ 10), ceil(troops × 40%))`，桶消失 |
| 頭目 | HP = `REF_TROOPS[21] × 35`、命中半寬 110 px；小隊停在頭目前 900 px（15 秒）；頭目每 tick 推進 1 px，以 `bossSwayPeriod` = 240 tick 為週期做 ±120 px 的三角波擺動；碰到小隊 = 輸。護衛：3 群各 12 隻，HP `REF_DMG[21] × 2`，速度 2 |

## §6 計分

| 項目 | 公式 |
|---|---|
| 擊殺 | 一般 2、裝甲 6 |
| 擊破桶 | 50 |
| 頭目傷害 | 每 100 點 +1（輸贏都算） |
| 頭目 | 擊敗 +300，再加 `剩餘秒數 × 30`（頭目到達前的時間） |
| 生還 | 擊敗頭目時每名士兵 +1 |

失敗時保留已得分，不歸零。標題畫面列出上表每一項（數字直接讀 `RULES`）；結算畫面逐項列出，擊倒頭目與剩餘時間分兩列。

## §7 結束

| 條件 | 結果 | 結算標題（`scoreBreakdown().cause`） |
|---|---|---|
| 頭目 HP ≤ 0 | 贏 | 擊倒頭目！（`win`） |
| `troops = 0`（被咬、撞桶或負門） | 輸 | 小隊全滅（`wiped`） |
| 頭目碰到小隊 | 輸 | 頭目衝到面前（`boss`） |
| `tick ≥ maxTicks` | 輸（保險） | 時間到（`timeout`） |

同 tick 的優先序見 §4。

## §8 選擇事件

無（選門靠走位）。

## §9 Bot

| 等級 | 策略 | 誤差 |
|---|---|---|
| novice | 每約 2 秒換一個隨機目標位置，不看門 | 反應慢 |
| intermediate | 看下一列門，走向「立即結果」較大的一邊；桶子到 300 px 內才注意到，一半機率閃開；其餘時間對準最近的怪群 | 位置誤差 ±30 px |
| expert | 估算到門前還能射幾次，算出兩扇門（含可加值）的結果，選較好的一側站過去射；殭屍快到時先清最近的一群；估算打不破的桶就閃開，打得破且獎勵有用才去打；頭目戰追擺動 | 位置誤差 ±10 px |

## §10 公平檢查（GDD 03 精髓七條）

細節見 [03_skill_integrity.md](03_skill_integrity.md)。

| # | 問題 | 本作答案 |
|---|---|---|
| E1 | 分數是否只來自玩家行為？ | 是：擊殺、打桶、頭目傷害、擊倒頭目與剩餘時間、生還士兵（§6）；沒有隨機獎勵 |
| E2 | 所有隨機都在 §3 且只依種子？ | 是：只有 `course` 一條 stream，在 `createSim` 一次生成整條跑道；之後零隨機 |
| E3 | 視野是否固定？ | 是：邏輯畫面 720×1280 等比縮放，前方固定顯示 1,060 px，所有裝置相同，高螢幕只多出邊框；拖曳與按鍵依事件時間歸 tick，幀率不影響輸入（§2） |
| E4 | 計分公式是否公開、結算可拆解？ | 是：標題畫面列出每項計分（讀 `RULES`）；結算畫面逐項列出，擊倒頭目與剩餘時間分開（`scoreBreakdown()`） |
| E5 | 天花板：高手比中手多拿分的行為是什麼？ | 選對門（含 ×2 vs +N 的兵力判斷）、射滿要走的門、閃打不破的桶、先清快到的殭屍群、頭目戰追擺動 |
| E6 | 付費是否完全不影響 sim？ | 是：沒有局外養成、沒有看廣告復活；每局 5 名士兵、武器 Lv1 起步 |
| E7 | 是否能用 `verify()` 重播驗分？ | 是：結算畫面即時重播，顯示「重播驗證 ✓」；golden match 在 Node 與瀏覽器一致 |

## §11 事件 → 演出

都在 `game/src/main.js`：`over` 由 `finish()` 處理（結算面板），其餘事件由 `playJuice()` 處理；數值在 `fx/feel.js`；sim 不讀任何演出狀態。

| 事件 | 演出（render 層） | FEEL 鍵 | LOW 模式 |
|---|---|---|---|
| `kill` | 綠色（裝甲為灰色）粒子爆開、擊中音（60 ms 節流） | `particles` | 粒子數 ÷ 3 |
| `gateHit` | 門值放大回彈；射滿時跳 MAX 字樣與音效；門下 6 格次數、射滿變金色 | `popup` | 保留文字與顏色 |
| `gate` | 過門跳出 +N / ×2 / −N；好門閃白、壞門紅暗角＋輕震；人數標籤彈跳 | `shake.light`、`flash`、`hurt` | 不震、保留文字 |
| `barrelHit` | 桶子壓扁回彈 | — | 保留 |
| `barrel`（打爆） | 橘色粒子、中震、hit-stop、爆炸音、跳出 Lv+ / +N | `shake.crit`、`hitStop.crit` | 不震、不停格 |
| `crash`（撞桶） | 大震、紅色粒子、跳出 −N | `shake.boss` | 不震 |
| `hurt` | 紅暗角，強度依損失人數 | `hurt` | 保留暗角 |
| `boss` | 頭目出場、血條出現、低音、中震 | `shake.crit` | 不震 |
| `bossHit` | 頭目泛紅 | — | 保留 |
| `bossDead` | 大震、閃白、衝擊波、hit-stop、大量粒子 | `shake.boss`、`shockwave`、`hitStop.boss` | 不震、無衝擊波 |
| `over` | 結算面板滑入；1.2 秒內忽略點擊 | `ui` | 保留 |

## §12 驗收測試

| 測試 | 門檻 | 結果（sim v3） |
|---|---|---|
| 同種子同輸入 → 同結果 | 相同 | ✅ |
| golden match（種子 1234 + expert bot） | Node 與瀏覽器相同 | ✅ |
| 上傳後 `verify` 通過；竄改分數不通過 | — | ✅ |
| 挑戰內容只依種子（換玩家行為，跑道不變） | 相同 | ✅ |
| `node tools/skill-dominance.mjs 30` | 技巧佔比 ≥ 70%、最強 vs 次強 ≥ 70% | ✅ 91.4% / 93.3% |
| 滿局重播耗時 | < 500 ms | ✅ |
| `npm run playtest` | 難度曲線 D1–D8 全過 | ✅（[docs/playtest_report.md](../docs/playtest_report.md)） |
| `npm run audit` | RULE-GAME-*、RULE-AF-ADAPTATION 必要項目全過 | 見本節之後的 §13 |

## §13 改造對照

來源：[knowledge-base/ad-funnel/af-gate-lane-shooter.md](../../knowledge-base/ad-funnel/af-gate-lane-shooter.md)「Skill Game 化改造（必做）」6 條，編號照原文。

| # | 改造項目 | 採用？ | 本作做法 / 不採用理由 | 對應程式 |
|---|---|---|---|---|
| 1 | 手動射擊＋子彈經濟（按住射擊、彈匣、換彈、不開火加速） | 不採用 | 理由：這次的需求是「直接復刻」Last War 的操作，原作是單指拖曳＋自動射擊；加入按住射擊會變成雙重操作，直版單指玩不了。替代做法：子彈本身就是要分配的資源，打門（加值，每扇最多 6 次）就打不到殭屍，射滿後才穿過去；要不要先射門、先清哪一群，取決於站位。技巧主導已達 91.4%，不靠手動射擊也過門檻。之後若要做進階模式，再評估「按住才射、放開加速」 | `sim.js` `moveBullets()`（門吸子彈、`pumpMax`） |
| 2 | 門是取捨不是最大值（+兵加寬隊形、+火力單點、× 門只在隊伍夠大時划算） | 部分採用 | 採用：×2 vs +N 的那一級（等級 5），+N 依參考兵力出題；`×2` 多給的兵力 = 目前兵力，所以兵力大於該次 `+N` 門值（含射門加值）時才選 ×2；+兵會加寬隊形（半寬 `10 + 6·√兵數`，最寬 140 px），更容易吃到側邊殭屍與桶子。不採用「+火力門」：火力只從武器桶來，讓門專心做兵力判斷、桶子專心做瞄準題，一扇門只有一種意義 | `sim.js` `LEVELS` L5（`mul`）、`halfWidth()`、`buildCourse()` 門值 |
| 3 | 數字桶是瞄準題（不同線、HP 不同、獎勵寫在桶上，有限 DPS 下決定先打哪個） | 部分採用 | 採用：桶在不同線、HP 不同、獎勵寫在桶上。不採用「同時多桶選先打哪個」：每波最多一個桶，因為直版跑道寬 600 px、一波已有 2–3 群怪與一列門，再放第二個桶會讓畫面判斷超過新手負荷。替代的取捨是「這波的火力給誰」：同一段時間裡要在打桶、射門加值、清最近的怪群之間分配（子彈不穿透，打桶就打不到門與怪）；HP 依該波參考傷害放大（武器桶約 12 發、閃避桶約 80 發），打不破的撞上去損失最多 40% 兵力，所以要判斷打得破就對準、打不破就閃。證據：expert 與 intermediate 平均打爆桶 11.7 vs 10.3，novice 7.5（[skill_dominance_report](../docs/skill_dominance_report.md)） | `sim.js` `buildCourse()` 桶、`touchBarrels()`；`main.js` 桶標籤 |
| 4 | 同種子（殭屍波次、門、桶全由種子決定；無主城數值、無看廣告復活） | 採用 | 單一 stream `course`，index = 波次 × 64 + 波內序號，`createSim` 一次生成；沒有局外養成、沒有復活。stream 名稱用 `course` 而非原文的 `wave`，內容相同 | `sim.js` `rng`、`buildCourse()`；`test/determinism.test.mjs` E2 測試 |
| 5 | 計分公式（擊殺 ×2、打爆桶 ×20、Boss 剩餘秒數 ×10、存活士兵 ×5；被淹沒時保留分數） | 採用（權重調整） | 擊殺 2、裝甲 6、打爆桶 50、頭目傷害每 100 點 1 分、擊倒頭目 300＋剩餘秒數 × 30、擊倒時生還士兵 × 1；全滅時保留已得分。權重調整原因：原文的生還士兵 × 5 套在本作上千的兵力上，會讓生還分遠大於其他所有項目；桶子 20 分又太低沒人想打（[docs/playtest_v2.md](../docs/playtest_v2.md) P6）。目前的分數拆解見下方「計分貢獻」：生還分仍是高手與中手差距的主要來源，但它來自選門與避傷，不是運氣；權重是否再調列在 [11 R9](11_risks_open.md) | `sim.js` `RULES.pts*`、`end()`、`scoreBreakdown()` |
| 6 | 局長 75–120 秒，1 條跑道＋1 Boss | 採用 | 跑道 21 波約 86 秒＋頭目最多 15 秒 ≈ 101 秒；硬上限 110 秒 | `sim.js` `SCRIPT`、`WAVE_LEN`、`RULES.bossStopGap`、`MAX_TICKS` |

### 計分貢獻（第 5 條的證據）

由 [skill_dominance_report](../docs/skill_dominance_report.md)（sim v3、30 種子）各等級平均值乘上 §6 權重：

| 項目 | novice | intermediate | expert | expert − intermediate |
|---|---|---|---|---|
| 擊殺（一般＋裝甲） | 482 | 727 | 739 | 12 |
| 打爆桶 | 375 | 515 | 585 | 70 |
| 頭目傷害 | 113 | 562 | 562 | 0 |
| 擊倒頭目＋剩餘時間 | 39 | 603 | 639 | 36 |
| 生還士兵 | 121 | 1,954 | 2,502 | 548 |
| **總分** | **1,131** | **4,361** | **5,027** | **666** |

- 中手比新手多的 3,230 分分散在各項，生還占 57%。
- 高手比中手多的 666 分有 82% 來自生還士兵：兩者都能擊倒頭目、頭目傷害相同，差在選門（×2 vs +N、射門加值）與避傷累積的兵力。
- 生還士兵是技巧的結果（兵力只來自門、兵力桶與避傷），不是運氣；但它讓「選門」這條技巧軸在頂端幾乎決定排名。還沒驗證的是不同走位策略（例如只顧兵力、不清怪）在同種子下的分數，列為 [11 R9](11_risks_open.md)。

### 與原作的差異總覽

| 原作 | 本作 |
|---|---|
| 看廣告復活、主城科技加成 | 無；每局 5 名士兵、武器 Lv1 起步 |
| 關卡內容 | 種子產生，固定腳本難度曲線（[07](07_difficulty_curve.md)） |
| 結果驗證 | 確定性 sim＋輸入紀錄重播驗分 |
