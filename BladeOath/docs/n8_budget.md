# N8 包體與 Draw Call 實測（v6，賽璐璐美術，2026-11-27）

| 項目 | 實測 | 門檻 |
|---|---|---|
| 包體 | `npm run build && npm run size`：dist 原始 2,863 KB（gzip 2,339 KB） | `RULE-BUNDLE-SIZE`：目標 8,192 KB、硬上限 10,240 KB |
| Draw Call：開始畫面 | 2 | `RULE-DRAWCALL-2D` ≤ 5 |
| Draw Call：一般戰鬥逐幀峰值 | 2（山門、蠱林整局，每 20 tick 取一幀） | ≤ 5 |
| Draw Call：壓力測試 | 2（屍傀將殿、殿後迴廊、墮仙台：6 名敵人同時起手含預警圖形、2 個補給、主角出招中） | ≤ 5 |
| 執行期 CDN | 沒有（資產全部打包進 dist） | `RULE-NO-RUNTIME-CDN` |

## 量法

- dev 版加 `?debug`，在 WebGL context 上包住 `drawElements` / `drawArrays`（含 instanced），每次 `app.render()` 計數一幀，取最大值。HUD 的 DC 計數每 250 ms 取樣會漏掉峰值，所以不用它。
- 頭目關以 render 直接擺設：把敵人放進畫面、設成起手狀態，再呼叫 `world.update` 後計數；預警與刀光是同一個每幀重畫的 Graphics。

## 為什麼只有 2

- 遠景條、近景條（各關兩張 PNG，鏡像拼成多個 Sprite）、角色圖集、道具圖集合計 4 張貼圖，Pixi 8 一批最多 16 張，都在同一批。
- 預警與刀光的 Graphics 插在背景與角色之間，形成第二批；HUD、跳字、指引箭頭都是 DOM，不算。
- 沒有 filter、mask、blend mode 切換。

## 包體組成

| 部分 | 大小 |
|---|---|
| 賽璐璐角色圖集（12 姿勢 × 8 角色，256 色含半透明，2 倍解析度） | 約 300 KB |
| 場景 12 張（2 倍解析度、128 色） | 約 1.9 MB |
| 道具圖集 | 約 20 KB |
| 像素版角色分件（備援） | 約 10 KB |
| 程式（PixiJS、GSAP、遊戲） | 約 650 KB |

gdd/10 的 Draw Call 與包體兩列仍寫著 v4／像素版的數字；它屬於 N2 的產出，改它會讓 N2 的核准過期，待下次 N2 改版時一併更新為本頁數字。
