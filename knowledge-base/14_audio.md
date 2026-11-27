---
id: KB-audio
kind: method
topic: [audio]
genre: ["*"]
reviewedAt: 2026-11-26
---
# 14 音效 — Web Audio 程式合成（0 bytes）

> 補 [09](09_knowledge-gaps.md) G6。模組：[`src/audio/sfx.js`](../.claude/skills/lite-skillgame-stack/templates/src/audio/sfx.js)，範本示範已接上（perfect / whiff / miss / boom / click，M 鍵靜音）。
> 優先序與起音原則：[17 §8](17_design-principles.md)。
> 規則與打擊感相同：音效只在 render 層，由 sim 事件觸發，不回寫 sim（[05](05_juice-and-feel.md)）。

## 1. 架構
<!-- card: KB-audio.architecture -->

| 元件 | 做法 |
|---|---|
| 配方 `RECIPES` | 每個音效 = 數層 `osc`（波形、起訖頻率）或 `noise`（白噪音 + 濾波器），各有起音、長度、音量、延遲 |
| `scheduleRecipe(ctx, …)` | 同一份配方可排到即時 `AudioContext` 或 `OfflineAudioContext`（測試、預覽、必要時匯出成檔） |
| `Sfx` | 首次手勢 `unlock()`（瀏覽器規定）、主音量 → 壓縮器（防爆音）→ 輸出、同時發聲上限 12、靜音存 localStorage |
| `comboPitch(combo)` | 連擊每 +1 升一個半音，上限 12（一個八度）——張力隨連擊上升 |
| 隨機 | ±4% 音高變化讓連打不機械；這是 render 層，可以用 `Math.random` |

## 2. 配方表（起手值，跟 FEEL 一樣在檔案裡調）
<!-- card: KB-audio.recipes -->

| 名稱 | 組成 | 長度 | 用途 |
|---|---|---|---|
| `perfect` | 三角波 880→1320 Hz + 正弦 1760 Hz 尾音 + 高通噪音「嚓」 | 0.22 s | 完美判定 |
| `hit` | 方波 420→300 Hz（低通）+ 帶通噪音 | 0.11 s | 一般命中 |
| `whiff` | 帶通噪音 1100→320 Hz 掃頻 | 0.17 s | 空揮 / 失誤點擊 |
| `miss` | 鋸齒波 220→110 Hz（低通） | 0.23 s | 斷 combo（範本只在真的斷 combo 時播，閒置不吵） |
| `pickup` | 兩段方波上行 660→990→1320 Hz | 0.18 s | 拾取 |
| `click` | 正弦 1200→900 Hz | 0.08 s | UI |
| `boom` | 正弦 110→38 Hz + 低通噪音 | 0.43 s | 大招 / 頭目 / 高連擊 |

實測（OfflineAudioContext 22.05 kHz）：7 個配方都有聲音、峰值 0.05–0.51（< 1，不爆音）、無 NaN；即時播放 `AudioContext` 狀態 running。

## 3. 混音原則
<!-- card: KB-audio.mixing -->

| 原則 | 做法 |
|---|---|
| 判定類音效最清楚 | perfect / hit 的高頻成分最多；環境音、音樂讓出 2–5 kHz |
| 失敗音不懲罰耳朵 | miss / whiff 音量低、低頻、短 |
| 同時大量觸發 | 發聲上限 + 壓縮器；大量擊殺時只播最近 N 個（survivor 類必備） |
| 無障礙 | 靜音開關；重要資訊不能只靠聲音（要有畫面提示） |
| 包體 | SFX 0 bytes；音樂檔照 §5（循環段、立體聲 Opus），預算見 [04](04_tech-stack.md) §6 |

## 4. 節奏遊戲的時鐘對齊
<!-- card: KB-audio.rhythm-clock; genre=rhythm -->

1. 音樂用 `AudioContext.currentTime` 排程（不要用 `<audio>`：起播延遲不固定）。
2. 對局開始時記下 `audioT0 = ctx.currentTime + 0.1`（預留排程時間）與 `perfT0 = performance.now() + 100`，用 `perfT0` 建 `InputClock`。
3. 譜面時間（子 tick）→ 音樂時間 = `audioT0 + t / (SUB × 60)`。
4. 輸出延遲 `Sfx.latencyMs`（`outputLatency + baseLatency`）納入延遲校正的預設值（[13](13_input-fairness.md) §3）。

> 實作參考：[15 §3](15_reference-games.md)——《三國奇兵》以全合成撐出五聲音階 BGM 與拾取連擊升音；《9527》的 bgm / sfx 分軌 → master → compressor（-14 dB / knee 18 / 6:1 / 4 ms / 160 ms）與逐 key 節流可直接照抄。

## 5. 音樂檔：只出貨循環段，Opus／WebM
<!-- card: KB-audio.music-loop; kind=method; topic=audio,budget; rules=RULE-MUSIC-ENCODE,RULE-MUSIC-LOOP -->

適用：`game.profile.json` 的 `fileMusic` 為 true（BGM 是錄音或生成的音檔）。程式合成的 BGM 0 bytes，填 false、不走這條。

1. 素材：整首曲子，WAV／FLAC 優先；從會重複的樂句挑段，以聽感為準。
2. `node shared/tools/music-pack.mjs <曲子> <Game>/game/src/assets/music --name battle --game <Game>` → `battle.webm` ＋ `battle.loop.json`。工具自動挑起點、接縫、補尾並解碼驗長度；印出的報告抄進 manifest。
3. 執行期：複製 skill 的 `optional/audio/music.js`；`loopEnd = samples / sampleRate`，不用解碼後長度。Safari／iPhone 尚未實機驗證。
4. 試聽接縫與音質才定稿。聽得出損失就在 `config/rules.overrides.json` 覆寫 bitrate，附試聽理由。
5. 登錄：manifest 一筆 `kind: music`，`files.shipped` 先 `.webm` 再 `.loop.json`，外部來源寫 `sourceUrl`；audit 查成對與雜湊。

### 5.1 節奏遊戲的音樂檔
<!-- card: KB-audio.music-rhythm; kind=method; genre=rhythm; topic=audio -->

要跟譜面對拍時，拍點與循環點人工定，不用 music-pack 自動切段（它會微調段長來改善接縫），時鐘照 §4。

### 5.2 實測依據
<!-- card: KB-audio.music-evidence; kind=research; topic=budget -->

2026-11-26 的 5 首樣本（[實驗紀錄與重跑方法](../shared/experiments/2026-11-26-music-compression/README.md)）支持這幾點，不是普遍的音質門檻：

- 只出貨循環段是最大的一刀：整首 1.5–3 分鐘 → 一段 16–24 秒。
- Opus 每分鐘約 MP3 128k 的 4 成，低位元率仍保留高頻；AAC／MP3 在 64k 會砍到 11–13 kHz。同位元率改單聲道不會變小。
- 配器越密越難壓，密集混音在 48k 可能聽得出損失，要試聽。
- 起點選擇對接縫影響很大；用解碼後長度當 loopEnd 可能造成可量測的接縫跳動。
- 相容性：只在 Chromium 156 實測。WebM Opus 據 WebKit 討論於 Safari 17.4 起穩定；Ogg Opus 在 iOS 未確認，所以用 WebM。Safari／iPhone 實機待第一個 `fileMusic` 遊戲以出貨檔驗證。

## 6. 還沒做到的
<!-- card: KB-audio.todo; kind=gap -->

- 音樂：§5 流程可用；Safari／iOS 實機與出貨檔的瀏覽器接縫，等第一個 `fileMusic` 遊戲驗證並把試聽結果綁到該版檔案雜湊；速度偵測可能抓成半速或倍速（要試聽確認拍數）。
- 音樂與音效的分軌匯流排、大音效時壓低音樂（ducking）：範本只有一條 master，未做。
- iOS 靜音鍵：Web Audio 在 iOS 靜音模式下預設不出聲，需提示玩家。
- 空間化（左右聲道依位置）：survivor 類可加 `StereoPannerNode`，範本未做（SkyTalon 已用）。
