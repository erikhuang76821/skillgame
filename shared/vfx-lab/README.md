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
