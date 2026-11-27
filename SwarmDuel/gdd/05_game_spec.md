# 05 玩法規格（Game Spec）— sim 怎麼算

- **目的**：把現有原型 `game/src/sim/` 的規則逐節寫成規格（[規格範本](../../.claude/skills/lite-skillgame-stack/references/game-spec-template.md)），讓改數值時有唯一對照
- **相關系統**：02 玩法（為什麼）、04 內容、03 技巧完整性、07 難度曲線、10 技術
- **狀態**：補寫（2026-11-27）。本作早於範本：沒有 `src/sim/core/`（只補了 `GAME` 的 id 與版本），重播在 `sim/replay.js`、亂數在 `sim/rng.js`。本規格描述**程式現況**；02 與程式不一致的地方以程式為準，列在文末

數值大多在 `game/src/sim/content.js`（`TUNING`、`ENEMIES`、`WAVES`、`EVENTS`、`UPGRADES`、`WEAPONS`），`sim.js` 匯出的常數以 `NAME` = 值寫出，`npm run audit` 會逐一對帳。

## §0 Meta

| 欄位 | 值 |
|---|---|
| id | `swarm-duel`（`GAME.id`） |
| version | `GAME.version` = 2（2026-11-27 補上 `GAME` 為 1，同日難度重調為 2，見 07）；改了會影響結果的規則要 +1，並更新 golden match（`test/sim.test.mjs`） |
| 技巧軸 | 瞄準（走位決定武器打到誰）、路線（拉怪成團、撿球、Dash 穿怪） |
| 局長 | `MATCH_TICKS` = 10800 tick（180 秒）；`TPS` = 60；升級選擇時暫停、不計入局長 |
| 對戰格式 | 同種子非同步 1v1 / 錦標賽；Daily Seed 單人排行 |
| 世界座標 | 1440 × 2560 世界單位（直版）；可見視窗固定 720 × 1280（E3） |
| 定點精度 | 1 世界單位 = `SUB` = 256 子單位；三角函數查表 `fixed.js`（256 等分圓） |

## §1 狀態（sim 物件）

| 欄位 | 型別 | 初值 | 說明 | 進 stateHash？ |
|---|---|---|---|---|
| `tick` | int | 0 | 每次 `step()` 先 +1 | ✓ |
| `player.x / y` | int（子單位） | 場地中央 | | ✓ |
| `player.hp / maxHp` | int | 100 / 100 | `p_hp` 每級 maxHp +20 | hp ✓ |
| `player.dir / moving` | int / bool | 0 / false | 8 方向索引 | |
| `player.dashT / dashCd / dashDir / dashSeq` | int | 0 | Dash 剩餘、冷卻、方向、第幾次 Dash（Perfect Dodge 每次每隻只算一次） | |
| `player.invuln` | int | 0 | 受傷後無敵 tick | |
| `player.howl` | int | 0 | Howl 能量 0–100 | |
| `player.xp / level` | int | 0 / 1 | | ✓ |
| `levels` | 物件 | `{ pinecone: 1 }` | 各升級等級 | |
| `cds` | 物件 | 兩把武器各 1 | 武器冷卻 | |
| `enemies / shots / orbs / pickups / beams` | 陣列 | 空 | 依建立順序（id 遞增） | enemies 的 id、x、y、hp ✓；長度 ✓ |
| `flames` | 陣列 | 空 | 營火位置，每 tick 重算 | |
| `spawnIndex / spawnAcc / beamIndex` | int | 0 | 生成序號、速率累加器、光束序號 | |
| `levelups / offer / state` | int / 陣列 / 字串 | 0 / null / `play` | `play`、`levelup`、`over` | |
| `kills / combo / maxCombo / hits / grazes` | int | 0 | | kills、hits ✓ |
| `orbsCollected / killScore10 / grazeScore10 / bonus` | int | 0 | 分數以 ×10 整數累加 | 前三項 ✓ |
| `nextId` | int | 1 | 所有實體共用 | |
| `events / recordEvents` | 陣列 / bool | 空 / true | 只給 render；重播時關閉 | |

規則：全部是整數、布林、字串或其陣列；沒有 `Date`、DOM、Pixi 物件。`stateHash()` 混入上表打 ✓ 的欄位。

## §2 輸入編碼（每 tick 1 byte）

| bit | 名稱 | 觸控 | 鍵鼠 | 說明 |
|---|---|---|---|---|
| 0–3 | 方向 | 任意處按住拖曳 = 浮動搖桿，量化 8 向 | WASD / 方向鍵 | 0 = 停、1–8 = `DX/DY[code-1]` |
| 4 | `IN_DASH` | 輕點（< 220 ms 未拖動） | Space / Shift | 值 = 16；冷卻中按了無效 |
| 5 | `IN_HOWL` | 右下大按鈕 | E | 值 = 32；能量未滿按了無效 |

- 升級三選一不放進 byte，走 §8。
- 輸入在 render 層進佇列，每 tick 取一筆；log 是 `Uint8Array(MATCH_TICKS)`，上傳時以 run-length + base64 編碼（`encodeLog`）。

## §3 隨機來源

`rng(seed, stream, index)` 是無狀態雜湊（`sim/rng.js` 的 `hash32`），stream id 固定：

| stream | id | 用途 | index 意義 | 範圍 / 分布 |
|---|---|---|---|---|
| `spawn` | 1 | 第 i 隻波次敵人的角度；頭目角度 | 生成序號 i；頭目用 1e6 + 事件秒數 | `& 255`：256 等分角，半徑 780（頭目 760） |
| `kind` | 2 | 第 i 隻波次敵人的種類 | 生成序號 i | 依該波 `kinds` 權重 |
| `offer` | 3 | 第 k 次升級的牌池排序 | `k × 64 + 牌序` | 整個池排序後取前 3 個可選 |
| `ai` | 4 | 敵人衝刺相位 | 敵人 id | `% 90` |
| `beam` | 5 | 第 i 道光束的角度與距離 | 光束序號 i（距離用 i + 1e5） | 角度 `& 255`、距離 0–120 |
| `map` | 6 | 保留（樹的位置用固定種子 `0x7ee`，每局相同） | — | — |

規則：index 都是事件序號，不是 tick 或呼叫次數；玩家行為不同也不會讓序列錯位。生成角度以玩家當下位置為圓心——**位置會隨玩家移動，但角度與種類序列只依種子**。沒有暴擊、沒有機率掉落。

## §4 Tick 順序

```
1. tick++
2. 玩家：無敵與冷卻遞減 → 方向 → Dash / Howl → 移動、夾在場內、推出樹
3. 生成：當前波次累加速率、產生敵人；本 tick 的事件（頭目、包圍環）
4. 敵人移動（衝刺相位、擊退）→ 互推（依 id 順序的空間格）→ 夾在場內
5. 武器：松果（最近的敵人）→ 營火（繞身旋轉）→ 靜電毛（範圍脈衝）
6. 子彈移動與命中 → 光束（預警、生效、傷害）
7. 接觸：熱狗回血 → Dash 無敵期間判 Perfect Dodge，否則判敵人接觸傷害
8. 清除死亡實體 → 經驗球吸附與拾取
9. HP ≤ 0 → 結束；tick ≥ MATCH_TICKS → 撐滿結束；否則檢查升級
```

## §5 規則與事件

| 規則 | 條件 | 效果 | 事件 `emit` |
|---|---|---|---|
| Dash | 按 Dash 且冷卻 0 | 持續 15 tick、速度 ×3、前 12 tick 無敵；冷卻 100 tick | `{ type: 'dash' }` |
| Perfect Dodge | Dash 無敵期間與敵人距離 < 玩家半徑 + 敵人半徑 + 8 | 每次 Dash 每隻一次：40 × Combo 倍率、Howl +3、Combo 不斷 | `{ type: 'graze', x, y }` |
| Howl | 按 Howl 且能量 100 | 半徑 160 內傷害 40（Combo ≥ 50 時 ×2）、非頭目擊退 10 tick | `{ type: 'howl', x, y, doubled }` |
| 受傷 | 非無敵時碰到敵人或光束 | 扣 `atk`（光束 20）、無敵 30 tick、Combo 歸零 | `{ type: 'hurt' }` |
| 傷害 | 武器命中 | 傷害 × (10 + 力量等級) / 10 | `{ type: 'hit', x, y, dmg }`（只給傷害數字） |
| 擊殺 | 敵人 HP ≤ 0 | kills+1、Combo+1、Howl+1、計分、掉經驗球（頭目 20）；每 150 殺掉熱狗 | `{ type: 'kill', x, y, boss }` |
| 熱狗 | 玩家 18 單位內 | 回血 30 | `{ type: 'heal' }` |
| 靜電毛脈衝 | 冷卻到 | 半徑內全部受傷 | `{ type: 'zap' }` |
| 波次事件 | 事件秒數整點 | 頭目 / 18 隻包圍環 / 光束開始 | `{ type: 'boss' \| 'ring' \| 'beams', enemy }` |
| 升級 | xp ≥ 5 + 3 × 等級 | 進入 §8 | `{ type: 'levelup' }`、選完 `{ type: 'chose', key }` |
| 結束 | §7 | | `{ type: 'over', survived }` |

敵潮時間表（`WAVES`、`EVENTS`，v2）：每 30 秒一段，速率 1 → 2、2 → 2.5（加探針）、2.5 → 3（加巨灰）、3 → 3.5、3.5 → 3.75（探針加倍）、3.75 → 4.25 隻/秒。115 s 包圍環（18 隻）、120 s 偵察飛碟、160 s 母艦（HP 900）、170 s 起每 150 tick 一道光束（預警 60 tick、持續 12 tick）。起手松果冷卻 20 tick。同屏上限 300 隻，超過的生成直接略過。

## §6 計分

| 項目 | 公式 | 上限 | 技巧意義 |
|---|---|---|---|
| 擊殺 | Σ 敵人分數 × Combo 倍率 ÷ 10（灰仔 1、探針 2、巨灰 5、偵察飛碟 100、母艦 300） | 受生成數限制 | 走位成團、選卡 |
| Perfect Dodge | Σ 40 × Combo 倍率 ÷ 10 | 受 Dash 冷卻限制（每 2 秒一次） | 時機、風險控管 |
| Ecto | 撿到的經驗球值 | 受擊殺數限制 | 貼邊撿球 |
| 完賽 | 撐滿 180 秒 300 | 300 | 存活 |
| Bounty | 選到 bounty 卡每張 100 | 只在牌池用完時出現 | — |

Combo 倍率 = min(30, 10 + ⌊combo ÷ 10⌋) ÷ 10（×1.0–×3.0），受傷歸零。

- 理論最高分：尚未推導；伺服器目前以重播比對分數與狀態雜湊，不靠上限值擋異常。
- 結算明細 = `scoreBreakdown()`，逐項顯示（E4）。
- 只靠「活著」能拿的分只有完賽 300（02、03 R9 已拿掉每秒給分）。

## §7 結束條件

| 條件 | 結果 | 說明 |
|---|---|---|
| `tick >= MATCH_TICKS` | `over`、`survived = true` | 加完賽 300 |
| 玩家 HP ≤ 0 | `over`、`survived = false` | 剩餘時間不計分 |

## §8 選擇事件

| 觸發 | 選項來源 | 合法 index | 選擇期間時間 |
|---|---|---|---|
| 升級（xp ≥ 5 + 3 × 等級） | `offer` stream：整個牌池排序後取前 3 個仍可選的；不足補 snack / bounty | 0–2 | 暫停（不計入局長） |

- 可選 = 未滿 5 級，且是已持有的，或同類（武器 / 被動）未滿 4 格。
- 紀錄是 `[tick, 第幾次升級, index]`；重播時 tick 或序號對不上、或 `choose()` 回傳 false 即判無效。
- 一次升級後經驗仍足夠會立刻再開下一次選擇。
- 尚無 `maxChoices` 上限（範本結構才有）；選擇次數受經驗量限制。

## §9 比較策略

本作早於技巧證據流程（`RULE-SKILL-EVIDENCE`），沒有 `tools/strategies.mjs`；技巧證據用舊配方 `RULE-SKILL-DOMINANCE`（三級 bot，`tools/bots.mjs`，報告 `docs/skill_dominance_report.md`）：

| 名稱 | 角色 | 能看到什麼 | 能力限制 / 怎麼選動作 |
|---|---|---|---|
| expert | 最強 | 240 單位內的敵人、場上經驗球、自己的狀態 | 繞圈拉怪、安全時撿球、單隻時 Dash 穿怪拿 Perfect Dodge、Combo ≥ 50 或密集時放 Howl、依優先序選卡 |
| intermediate | 會走位 | 220 單位內的敵人、經驗球 | 遠離怪群、沒怪時撿球、太近才 Dash、能量滿就放 Howl、選第一張 |
| novice | 亂走 | 不看敵人 | 每秒換一個雜湊方向、能量滿就放 Howl、選第一張 |

難度曲線用的人性化玩家另寫在 `tools/humanBots.mjs`（07）。

## §10 公平檢查（GDD 03 精髓七條）

| # | 問題 | 本作答案 |
|---|---|---|
| E1 | 分數是否只來自玩家行為？ | 是：擊殺、Perfect Dodge、撿球、完賽、選卡，全部由輸入決定（§6） |
| E2 | 所有隨機都在 §3 且只依種子？ | 是：六個 stream 都以事件序號取值；無暴擊、無機率掉落 |
| E3 | 視野是否固定？ | 是：世界視窗固定 720 × 1280，高螢幕多出的空間只放 HUD |
| E4 | 計分公式是否公開、結算可拆解？ | 是：標題寫明公式，結算逐項列出 `scoreBreakdown()` |
| E5 | 天花板：高手比中手多拿分的行為是什麼？ | Perfect Dodge（每隻 40 × 倍率）、維持 Combo、Howl 留到 Combo ≥ 50；expert 對 intermediate 同種子勝率 90.0%（v2） |
| E6 | 付費是否完全不影響 sim？ | 是：排位用標準化配置，只賣外觀（07 變現） |
| E7 | 是否能用 `verify()` 重播驗分？ | 是：`sim/replay.js` 的 `replay(seed, log, choices)` 比對分數與狀態雜湊；竄改 log 測試會失敗 |

## §11 事件 → 演出

| 事件 | 演出（render 層，`render/world.js`） | FEEL 鍵 | LOW 模式 |
|---|---|---|---|
| `hurt` | 震動 10、紅白粒子 | 無（數值寫在 world.js，尚未集中到 `FEEL`） | 不震動、不噴粒子 |
| `hit` | 傷害數字上飄 | 無 | 不顯示 |
| `kill` | 粒子（頭目 40 顆＋震動 18） | 無 | 不顯示 |
| `graze` | 金色星星上飄 | 無 | 靜態星星 0.15 秒 |
| `howl` | 半徑 160 的圈放大淡出、震動 8；Combo 加倍時金色 | 無 | 靜態閃一次 0.12 秒 |

本作沒有 `fx/feel.js`（audit 的 `RULE-TEMPLATE-LEFTOVER` 警告），手感數值集中到 `FEEL` 是待辦。

## §12 驗收測試

`game/test/sim.test.mjs`（`npm test`）：

| 測試 | 門檻 |
|---|---|
| 同種子同輸入 → 同結果 | 相同 |
| golden match（種子 1234） | `{ score: 1720, hash: 104174396, ticks: 9588 }`（v2） |
| 錄下的 log 重播後分數與雜湊相同；編碼後 < 4096 B | — |
| 竄改 log 後重播不通過 | — |
| 第一次升級選項只依種子 | 相同 |
| 不同種子結果不同 | — |
| 三角表與雜湊是固定常數（跨引擎） | 相同 |
| 滿局重播 | 有效（目前只印耗時，未設門檻；結算畫面實測 20–90 ms） |
| 同種子 intermediate 勝 novice | 3 個種子都勝 |
| `node tools/playtest.mjs 30` | 難度曲線 D2–D6（`RULE-CURVE-*`）；結果見 [docs/playtest_report.md](../docs/playtest_report.md) 與 07 |

## 與 02 不一致處（以程式為準）

| 02 寫的 | 程式 |
|---|---|
| 接觸傷害「同一敵人 0.5 s 內不重複」 | 受傷後全體無敵 30 tick（0.5 s） |
