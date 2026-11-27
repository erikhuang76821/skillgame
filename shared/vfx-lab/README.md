# VFX Lab

[knowledge-base/19](../../knowledge-base/19_vfx-spec-templates.md) 的特效規格預覽台。一個特效一組檔案，畫面只由「參數＋種子＋時間」決定，可拖曳、可重播。

```bash
npm install
npm run dev     # 或 preview_start「vfx-lab」（port 5179）
npm test        # 狀態函式的純度與時序測試
```

| 檔案 | 內容 |
|---|---|
| `src/fx/iceBoltState.js` | 冰矢狀態函式 `iceBoltAt(plan, t)`：不碰 Pixi / GSAP，不累積上一幀 |
| `src/fx/iceBolt.js` | Pixi 8 + GSAP 3 模組：`play / pause / resume / seek / hit / dispose`；圖層 trail、core、hit-flash、ice-shards |
| `src/fx/feel.js` | 數值（來自 ice-bolt.json，全為暫定） |
| `src/main.js` | 預覽 UI：時間軸、圖層開關、低畫質、路徑疊圖、正反向自檢 |

搬進遊戲：把 `iceBolt*.js` 複製到 `game/src/fx/`，數值併進該遊戲的 `FEEL`；起手 `play()`，sim 的 hit 事件到了呼叫 `hit()`。飛行秒數只供預覽，不結算。

## 像素戰鬥特效（`pixel.html`）

[knowledge-base/20](../../knowledge-base/20_pixel-composer-gallery.md)：參考 Pixel Composer Gallery 的動態，程式重做 6 個高對比特效（彎月斬、落雷、螺旋火球、電漿爆、火龍捲、爆炸）。

| 檔案 | 內容 |
|---|---|
| `src/pixel/raster.js` | 低解析色階 buffer（最亮者勝、無混色）、`hash` / `noise2` / 緩動 / `drag`；不碰 DOM、不用 `Math.random` |
| `src/pixel/effects.js` | 6 個 `draw(cell, t, seed)` 純函式、色階表 `RAMPS`；每個特效有自己的步進幀率（12–20 fps） |
| `src/pixel/main.js` | 預覽：6 格 atlas 一張 `BufferImageSource`（`nearest`）＋一個 Sprite，整數倍放大；FPS、光柵耗時、DC、壓力測試 |
| `tools/bake.mjs` | `npm run bake [輸出目錄] [種子]`：同一支純函式烘成 PNG strip＋JSON（預設 `out/pixel/`，不進版控） |

量測（2026-11-27，預覽頁內）：6 個特效全部重算一格合計約 0.44 ms；DC 2（背景格 Graphics＋atlas Sprite）；6 條 strip 烘出合計 17.5 KB。
