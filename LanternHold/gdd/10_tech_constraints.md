# 10 技術限制

> 技術規範：`lite-skillgame-stack` skill；[04_tech-stack](../../knowledge-base/04_tech-stack.md)。門檻以 `knowledge-base/index/rules.json` 為準，本作**目前無覆寫**（不建 `config/rules.overrides.json`）。

| 項目 | 做法 |
|---|---|
| 渲染 | PixiJS 8，2D；4 個 Draw Call（地表、世界 atlas、加色特效、BitmapText），見 [02 §4](02_art_spec.md)；`RULE-DRAWCALL-2D` |
| UI | HTML/CSS 疊在 canvas 上：資源列、羅盤、建築選單、英雄四選一卡、選取時的放置範圍提示 |
| 特效 | 衝擊用 sprite 擴散環；燈光半徑用預烘漸層 sprite；`RULE-FX-FILTER` 依預設 |
| sim | 固定 60 Hz、定點、無 `Math.random` / `Date` / DOM（`RULE-SIM-PURITY`） |
| 輸入紀錄 | `Uint16Array`（每 tick 16 bit）；5 分鐘約 32 KB，上傳前壓縮 |
| 實體上限 | 敵 400、小兵＋工人 64、投射物 500、英雄 2、燈靈 6；SoA + 物件池 |
| 尋路 | 每個出怪方位一張 32 px 網格流場（23×40 格），用整數 BFS；只在牆／建築新增或毀壞時重算，同 tick 內依方位序 |
| 輸入 | 只有點擊與拖曳；拖曳 = 「選取」「放下」兩個指令（05 §2） |
| 碰撞 | 空間雜湊 cell 48 px，依 id 排序 |
| 效能預算 | 滿局重播 < 500 ms 待 N4 實測；超標時先降 `MAX_FOES`、合併同 cell 小怪 |
| 包體 | 預估 ≈ 4.9 MB（02 §4）；`RULE-BUNDLE-SIZE` |
| 資源載入 | 全部打包，不從 CDN 載入（`RULE-NO-RUNTIME-CDN`） |
| Spine | 只在 Boss 可選；原型不用 |
