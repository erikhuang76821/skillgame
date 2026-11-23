# 10 技術限制

> 技術規範：`lite-skillgame-stack` skill；[04_tech-stack](../../knowledge-base/04_tech-stack.md)。門檻以 `knowledge-base/index/rules.json` 為準，本作**目前無覆寫**（不建 `config/rules.overrides.json`）。
> 上架規範（2026-11-18 使用者提供）：只用 PixiJS／GSAP、直版觸控可玩、單機離線、單檔 zip 可用 file:// 開啟、不連外部網址。

| 項目 | 做法 |
|---|---|
| 渲染 | PixiJS 8，2D，WebGL2。不用 three／ogl（上架規範不允許） |
| 假 3D | 全部在畫面層，不進 sim：<br>1. 地表：一支全螢幕片段 shader，程序生成島嶼、海岸、秋色林地，依坡度打光，上遠下近的透視壓縮，隨時間往下捲動<br>2. 雲層與雲影：同一支 shader 內，捲動比地表快（視差）；雲畫在機體下方，不遮敵彈（公平視野 E3）<br>3. 機體側傾：依 `bank` 切換 5 格側傾圖<br>4. 落影：機體與敵機在地表上的偏移陰影，高度越高偏移越大<br>5. 凝結尾：翼尖拖出的白色粒子帶 |
| 像素風 | 地表 shader 以固定格點取樣（每格 3 螢幕像素）；機體、敵機、子彈在開機時用程式畫到一張小 atlas，再以最近鄰放大。0 張圖檔 |
| Draw Call | 實測 2：地表貼圖 1、sprite 批次 1（同一張 atlas，粒子也用 atlas 內的 sprite）。`RULE-DRAWCALL-2D`；不切 blend mode、不用 mask |
| Filter | 不用 Pixi filter；衝擊波用 atlas 內的擴散環 sprite（`RULE-FX-FILTER` 的預設允許，但本作不需要） |
| UI | HTML/CSS 疊在 canvas 上：分數、連鎖、護盾、頭目血條、開始畫面的計分說明、結算面板；v2 加選卡面板與 HUD 的卡片列（卡片圖示用 CSS 與文字，不加圖檔，Draw Call 不變） |
| 畫面比例 | 直版。世界固定 720×1280，等比縮放置中；多出的螢幕只顯示地表背景與半透明邊欄 |
| sim | 固定 60 Hz、整數子像素、方向查表；無 `Math.random`／`Date`／DOM（`RULE-SIM-PURITY`） |
| 輸入紀錄 | 每 tick 1 byte（core `Recorder`），v7 上限 356 秒最多 21360 bytes，RLE 後仍遠小於預算（N4 實測回寫）；另有最多 8 筆選擇紀錄（`maxChoices` = 8）；結束時本機重播驗證 |
| 實體上限 | 設計值：敵機同時 ≤ 30、敵彈 ≤ 120、玩家子彈 ≤ 40（v2 連射加散射滿級時每次 6 發、每 3 tick 一次，預估 ≤ 140）；N4 實測後回寫 |
| 音效 | Web Audio 程式合成，0 個音檔；首次手勢解鎖 |
| 單機 | 不連線、不做線上排行榜、不做雲端存檔；最佳紀錄存 `localStorage` |
| 包體 | 一般 build 實測 627 KB（gzip 196 KB）；`RULE-BUNDLE-SIZE` |
| 上架打包 | `npm run build:zip` → `release/skytalon.zip`：只有一個 `index.html`，程式與樣式內嵌，執行時不連任何外部網址（做法沿用 LanternHold）。實測 index.html 634 KB、zip 194 KB |
| 資源載入 | 不從 CDN 載入任何東西（`RULE-NO-RUNTIME-CDN`） |
| 降級 | `prefers-reduced-motion` 與遊戲內「降低特效」：不震動、不閃白、粒子減量；資訊（敵彈、預告線）不變 |
| shader | 自寫片段 shader 開頭加 `precision highp float;`；寫之前對照已安裝 pixi 版本的 Mesh／Shader API |
