---
id: KB-input-fairness
kind: method
topic: [input, fairness]
genre: ["*"]
reviewedAt: 2026-11-24
---
# 13 輸入公平性 — 時間戳輸入、延遲校正、防巨集

> 補 [09](09_knowledge-gaps.md) G4。模組：[`src/sim/core/input.js`](../.claude/skills/lite-skillgame-stack/templates/src/sim/core/input.js)，測試：`test/input.test.mjs`，範本 `main.js` 已接上。
> 為什麼重要：時機型 skill game（節奏、OFDP、Timberman、塗記速度）比的是毫秒；如果判定跟著「哪一幀處理到點擊」走，120 Hz 手機的玩家天生比 60 Hz 或掉幀的玩家準——這是裝置造成的不公平，不是技巧。

## 1. 問題與對策
<!-- card: KB-input-fairness.problems -->

| 問題 | 傳統做法的後果 | 對策（範本做法） |
|---|---|---|
| 不同幀率（30 / 60 / 120 / 144 Hz） | 點擊被歸到「下一幀」→ 60 Hz 平均晚 8 ms、30 Hz 晚 17 ms | 用 `PointerEvent.timeStamp`（手指觸到螢幕的時間）換算 tick，不用處理當下的時間 |
| 一幀內 sim 走好幾步 | 慢幀時多個點擊被擠到同一 tick、或被吞掉 | `TapQueue` 依時間戳把點擊交給所屬的 tick，一 tick 一個，多出的順延並記為 late |
| 判定解析度只有 1 tick（16.7 ms） | Perfect 窗口 ±35 ms 只剩 4 格可用 | 輸入 byte 的 bit 4–7 帶「子 tick 相位」（1/16 tick ≈ 1 ms），sim 用整數子 tick 判定（[12](12_genre-recipes.md) §1） |
| 晚到的點擊 | tick 已模擬過才收到 → 判定錯位 | **只模擬「時間窗已完整過去」的 tick**（`targetTick` = 已結束的最後一 tick），換來 ≤ 1 tick 的顯示延遲 |
| 分頁切走 / 長卡頓 | 回來後 sim 一口氣快轉，玩家無法反應 | `clock.skip()`：卡頓 > 250 ms 視為暫停 |
| 裝置延遲不同（觸控面板、藍牙耳機、`AudioContext.outputLatency`） | 同一個人在不同手機上分數不同 | 校正測試：跟拍點擊 → `calibrate()` 取截尾中位數，限制在 ±150 ms，寫進上傳的 `meta.inputOffsetMs` |

驗證：`test/input.test.mjs` 用同一組真人點擊時間，分別以 30 / 60 / 120 / 144 Hz 與一次 90 ms 卡頓模擬，**產生的輸入紀錄逐 byte 相同**。

## 2. 用法（範本 `main.js`）
<!-- card: KB-input-fairness.usage; topic=input,tech -->

```js
clock = new InputClock(performance.now(), OFFSET, TICK_MS);   // 每局開始
taps = new TapQueue(clock);
stage.addEventListener('pointerdown', e => taps.push(e.timeStamp, { x, y }));

// 每幀：只走完已結束的 tick
const upTo = clock.targetTick(performance.now());
while (rec.sim.tick <= upTo) {
  const tap = taps.take(rec.sim.tick);
  rec.step(tap ? encodeTap(tap.phase) : 0);
}
rec.meta.lateTaps = taps.late;                                // 結束時，給伺服器風控看
```

## 3. 延遲校正的規則
<!-- card: KB-input-fairness.latency-calibration -->

| 規則 | 理由 |
|---|---|
| 校正是「補償裝置」，不是「調難度」：所有點擊整體平移，窗口不變 | 公平：不會讓任何人更容易 Perfect |
| 上限 ±150 ms、樣本 ≥ 8、離散度（MAD）< 40 ms 才採用 | 防止把亂按的結果當成校正 |
| 偏移值寫進上傳 `meta`，伺服器檢查範圍 | 可稽核；超出範圍的上傳作廢 |
| 校正畫面用**聲音**節拍（Web Audio 時鐘排程）＋畫面閃光各測一次 | 音訊延遲與觸控延遲不同，節奏遊戲兩者都要 |
| 排位前強制做一次，之後可在設定重做 | 換耳機 / 換手機時延遲會變 |

## 4. 防巨集 / 防腳本（伺服器風控用）
<!-- card: KB-input-fairness.anti-macro -->

| 函式 | 看什麼 | 預設門檻 | 適用 |
|---|---|---|---|
| `macroSuspicion(times)` | 連續點擊間隔過快或過度規律 | 最短間隔 < 45 ms 或間隔標準差 < 3 ms（≥ 20 次） | OFDP、Timberman、狂按類 |
| `errorSuspicion(errors)` | 判定誤差的分布過窄 | 標準差 < 2.5 ms（≥ 30 次命中） | 節奏類：真人誤差至少數毫秒 |

這兩個只是**標記**，不直接作廢——真正的處理流程（人工複查、高額獎金局抽查、誤判申訴）仍屬 [09](09_knowledge-gaps.md) G9。門檻要用真人試玩資料重設。

## 5. 自由移動的觸控：相對拖曳追點
<!-- card: KB-input-fairness.drag-to-aim; genre=shmup,survivor,arena; skillAxis=aim,reaction; topic=input,ux -->

適用：機體在平面上自由走位、靠閃避與站位得分的品類（直版彈幕、倖存者、競技場）。不適用：比時機的點擊類（用 §1–§3）、要瞄準方向的雙搖桿射擊。

**做法**：手指在畫面任何地方按下拖曳，移動的是一個「目標點」，不是機體。目標點跟著手指的位移量走（乘上靈敏度），機體每 tick 朝目標點全速飛，到了就停；放手後機體飛完剩下的距離再停。

| 比較 | 浮動虛擬搖桿 | 相對拖曳追點 |
|---|---|---|
| 手指與機體 | 手指管方向，機體不跟手 | 機體跟著手指的移動量走，手指不必壓在機體上（不擋視線，E3） |
| 精細走位 | 靠推桿深淺換速度，小幅修正難 | 手指動 2 px 機體就動 2 px 左右，貼彈微調直覺 |
| 學習 | 要先理解搖桿 | 拖到哪飛到哪，零說明 |
| 放手 | 立刻停 | 飛到目標點才停 |

**確定性接法**（sim 輸入格式不變）：

- 目標點存在輸入層，單位用 sim 的定點座標；`pointerdown` 時設成機體目前位置，`pointermove` 加上（手指位移 ÷ 畫面縮放 × 靈敏度），並限制在可飛範圍內。
- 每 tick 依「目標點 − 機體」決定 8 向方向碼：每軸誤差超過**半步**（當下速度 ÷ 2，含推進器等加速）才往該軸走，否則該軸不動。用半步當門檻，機體會停在目標點上，不會來回抖。
- sim 仍只收方向碼，所以紀錄、重播、驗分、技巧證據的 bot 都不用改，也不必升 `GAME.version`；速度上限仍由 sim 決定，觸控不會比鍵盤快。
- 鍵盤按下時清掉目標點，回到鍵盤操控。暫停、選卡、重開、失焦一律清掉目標點與手指。
- 只認第一根手指（鎖 `pointerId`、`setPointerCapture`），HUD 按鈕 `stopPropagation`，不讓按暫停變成拖曳。
- 靈敏度是手感數值，放 `FEEL`（參考作品約 1.2）。

實作：[SkyTalon/game/src/main.js](../SkyTalon/game/src/main.js) 的 `moveAim` 與 `directionCode`；觀察來源見 [15 §5](15_reference-games.md)。

## 6. 還沒做到的
<!-- card: KB-input-fairness.todo; kind=gap -->

- ~~校正畫面 UI~~ ✅ 2026-10-21：實作範例在 [TwinStrike/game/src/ui/calibration.js](../TwinStrike/game/src/ui/calibration.js)（聽拍 + 看閃光兩輪，觸控 offset 與音訊延遲分開量；說明見 [TwinStrike gdd/06 §8.1](../TwinStrike/gdd/06_combo_feel.md)）。
- 鍵盤 / 手把輸入同樣適用（`KeyboardEvent.timeStamp`），範本只接了 pointer。
- 多點觸控同一 tick 多個點擊：目前順延一 tick；真正的多軌節奏遊戲要把同 tick 的多個點擊編進同一 byte（範例 `examples/rhythm` 用 bit0 / bit1 表示兩軌）。
