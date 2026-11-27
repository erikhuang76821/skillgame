# 實驗：音樂檔壓縮與循環接縫（2026-11-26）

一次性實驗的可重跑紀錄，不是產品程式。支撐 [knowledge-base/14_audio.md §5](../../../knowledge-base/14_audio.md) 與 `RULE-MUSIC-ENCODE`、`RULE-MUSIC-LOOP`。正式工具是 [`shared/tools/music-pack.mjs`](../../tools/music-pack.mjs)；本資料夾的 `mkloop-prototype.py` 是它的前身（單一起點、不補尾），保留以重現當時的數字。

## 輸入

| 曲子 | 來源 | SHA-256 | 規格 |
|---|---|---|---|
| `inst_orchestral.mp3` | https://raw.githubusercontent.com/ace-step/ace-step-v1.5.github.io/main/mp3/samples/XLDemos/inst_orchestral.mp3 | `340f527ec324f3ec81a905571e3d1235b379be536081ec86a6de3e97d9ac9619` | 79 s，MP3 128k，48 kHz 立體聲 |
| `inst_synthwave.mp3` | …/XLDemos/inst_synthwave.mp3（同上路徑） | `4743ad296ab5b4dcf3bc7ac6a8014a2d288ba5ccfa18b798b9913590c8ab68e3` | 175 s，同上 |
| `inst_tango.mp3` | …/XLDemos/inst_tango.mp3（同上路徑） | `9beb209691bc87214dfcf9d9cacc92f51217509fcaca94cd17af4e8de675ad34` | 184 s，同上 |
| `leg1.wav`、`leg4boss.wav` | SkyTalon `game/src/audio/music.js` 的 `THEMES.leg1`／`leg4boss`，以 `render-skytalon.js` 離線渲染 16 小節 | 由程式重生 | 48 kHz 立體聲 16-bit |

ACE-Step 三首取自 [ACE-Step 1.5 示範頁](https://ace-step.github.io/ace-step-v1.5.github.io/) 的 XL 純音樂範例；官方只提供 MP3 128k，**所以 ACE 的結果是「MP3 再編碼」的損失**，來源本身的高頻只到 14–17 kHz。音檔不進 repo。

環境：ffmpeg 9.0.2（gyan.dev full build，libopus）、Python 3.12.10 + numpy 2.4.4 + scipy 1.17.1、Node 24.22.3、Chromium 156（Claude 桌面版內建瀏覽器）。

## 重跑

工作檔都放在 `out/`（不進 git）：

```powershell
cd shared/experiments/2026-11-26-music-compression; mkdir out; cd out
# 1. 取得輸入：下載上表三首到 out/dl/，核對 SHA-256；SkyTalon 兩首見步驟 4
# 2. 解碼與切循環段（原型參數：32 拍、起點在曲長 35%，合成器那首 30%）
ffmpeg -i dl/inst_orchestral.mp3 -c:a pcm_s16le inst_orchestral.wav
python -I ../mkloop-prototype.py inst_orchestral.wav inst_orchestral_loop.wav 32 0.35
# 3. 格式比較（輸出 JSON 到 stdout）
python -I ../bench.py out inst_orchestral.wav inst_orchestral_loop.wav > results.json
# 4. 試聽與接縫：node ../serve.mjs .  →  瀏覽器開 http://127.0.0.1:5190/listen.html
#    SkyTalon 曲：serve.mjs 開著，在 SkyTalon dev server 頁面的 console 貼 render-skytalon.js
#    接縫數字：在 listen.html 的 console 貼 seam-check.js（需要先做出 *_looppad.wav 編成的 out/*_looppad.opus_s48.webm：循環段尾端接上開頭 100 ms 再編碼）
```

## 指標的算法

- `KB_per_min`：檔案大小 ÷ 曲長 × 60。
- `bandSNR`：以互相關對齊後，對每個 STFT 幀（2048 點）、每個 1/3 倍頻帶算「原訊號能量 ÷ 誤差能量」的 dB，夾在 0–40，取平均。**波形誤差指標，對感知編碼偏低**；只用來比較同一首在不同格式間的相對好壞，最後以試聽為準。單聲道版本的數字因比對方式偏低，不可直接比較。
- `bw_kHz`：長時平均頻譜中，解碼後仍在原訊號 20 dB 以內的最高頻率。ACE 曲受來源 MP3 限制。
- `seamVsP999`（`seam-check.js`）：接縫 ±2 ms 內二階差分的最大值 ÷ 循環其餘部分二階差分的 99.9 百分位。約 1 表示接縫和曲中一樣平滑；可聽見的爆音通常 > 10。只抓爆音，抓不到節奏或樂句接錯。

## 結果摘要（原始數字在 `results.*.json`）

| 格式 | 每分鐘 | bandSNR：ACE 三首／SkyTalon 兩首 | 頻寬 |
|---|---|---|---|
| MP3 128k | 938 KB | 19.5–20.7／20–21 dB | 受來源限制 |
| AAC 96k | 709–730 KB | 14.6–16.9／18.2–21 | 同上 |
| Opus 64k | 490–515 KB | 12.0–14.0／16.5–17.3 | 同上 |
| Opus 48k | 369–398 KB | 10.6–12.6／14.4–15.3 | 同上 |
| Opus 32k | 250–269 KB | 8.7–10.6／10.5–12.4 | 同上 |
| AAC 64k／MP3 64k | 469–484 KB | — | 砍到 11–13 kHz |

接縫（Chromium 156）：

| 曲子 | 直接切 32 拍 | 處理後 WAV | Opus 48k，loopEnd = 解碼長度 | Opus 48k 補尾，loopEnd = samples |
|---|---|---|---|---|
| 管弦 | 1.83 | 0.46 | 0.75 | 0.38 |
| 合成器 | 0.36 | 0.08 | 0.14 | 0.09 |
| 探戈 | 1.79 | 0.35 | 2.06 | 1.31 |

## 讀結果前要知道的

- 樣本只有 5 首，ACE 三首是 MP3 再編碼；結論是「目前樣本支持 Opus 48k 當預設、密集配器要試聽」，不是普遍的音質門檻。
- WebM Opus 在這版 Chromium 解碼會少 24 個樣本（Ogg Opus、MP3、AAC 不會）；這是此環境的觀測，所以規則要求 loopEnd 取自 sidecar 的 samples、且打包後解碼長度不得短於它，而不是依賴這個數字。
- 起點選擇影響很大：合成器那首在 9 個起點間吻合度 0.49–0.87（原型）；正式工具掃多個起點後，三首吻合度為 0.99／0.94／0.90。
- 速度偵測可能抓成半速或倍速（例如管弦測到 80 BPM，未人工確認）；拍數錯了循環段長度就錯，要試聽。
- ACE-Step 的生成經驗（人聲效果差、純音樂可用）來自外部使用者回報與示範頁，不在本實驗量測範圍。
- 未測：Safari／iOS 實機、Firefox。
