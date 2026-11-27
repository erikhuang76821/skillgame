# 10 技術限制

> 技術規範：`lite-skillgame-stack` skill；[04_tech-stack](../../knowledge-base/04_tech-stack.md)。門檻以 `knowledge-base/index/rules.json` 為準，本作**目前無覆寫**（不建 `config/rules.overrides.json`）。
> 上架規範：只用 PixiJS／GSAP、觸控可玩、單機離線、單檔 zip 可用 file:// 開啟、不連外部網址、≤ 10 MB。

| 項目 | 做法 |
|---|---|
| 渲染 | PixiJS 8（鎖確切版本），2D，WebGL2。不用 three／ogl、不用 Spine（角色是程式骨架＋分件剪紙像素，gdd/12 §7、gdd/02） |
| 畫面比例 | 橫式。遊戲解析度固定 480×270，整數倍最近鄰放大置中（E3）；多出的螢幕只放 HUD 與虛擬按鈕 |
| 橫向卷軸 | v5：每關是一條長帶（`x` 卷軸、`y` 深度 0–96、`z` 高度），鏡頭只橫移。地面帶畫在畫面 y 150–246；背景分遠景、中景兩層視差（render 層，按鏡頭 x 位移），前景遮擋件少量、半透明，不得蓋住地面帶上的角色。v4 的地形套件（`grid.js` 高度層、`terrain.js`、`xray.js`）不再使用。角色、障礙物、破壞物放進 y 排序容器，`zIndex` = 腳底 `y`；跳躍以向上偏移＋地上落影表現 |
| 角色 | 只有左右兩個面向（側視，向左用鏡像）；判定是 x 區段＋深度厚度，跟圖分開（預警＝判定，從 sim 資料畫範圍提示） |
| 鏡頭 | 位置由 sim 的 `cam` 決定（只增不減、戰區鎖定時停住）；render 只做平滑插值與震動，不影響 sim |
| Draw Call | 目標：背景遠景＋中景 1–2（每關一張長條圖切成畫面寬的片，或 TilingSprite）＋ sprite 批次 1（角色、敵人、障礙物、破壞物、補給、特效、落影同一張 atlas）。`RULE-DRAWCALL-2D`；不切 blend mode、不用 mask。v4 的 N8 實測（基礎 2、峰值 2）是俯視版，v5 完成後 N8 重量 |
| Filter | 不用 Pixi filter；衝擊與刀光用 atlas 內的 sprite（`RULE-FX-FILTER` 的預設允許，但本作不需要） |
| 美術資產 | 像素 PNG-8／WebP（不用 KTX2）；角色、障礙物、破壞物、補給共用一張 actors atlas；每關背景另一張（遠景與中景，水平可接縫）。生圖與登錄在 N6（`RULE-ASSET-REGISTER`、`RULE-ART-TW-TABOO`）；包體預估見下方「包體」 |
| 動畫 | 程式骨架＋姿勢資料（與 sim 招式時間軸同步）；GSAP 只做 UI、鏡頭震動、hit-stop 的時間縮放、跳字 |
| UI | HTML/CSS 疊在 canvas 上：虛擬搖桿、動作鈕（攻、擋、閃、跳、脫、招一～四）＋情境互動鈕、冷卻數字、氣血／體力／架勢／內力條、頭目血條、「前進 →」提示、劍塚面板（升級、技能樹、招式欄、裝備、鍛造）、選路面板、開始畫面的計分說明、結算面板 |
| 輸入 | 觸控：Pointer Events 多點觸控，搖桿與按鈕分開追蹤 pointerId。鍵盤：`keydown` 時間戳。滑鼠：點地面設定目標點、點按鈕；按鈕有 hover／按下狀態，實體鍵按下時對應按鈕同步亮。三者都進 `InputClock`／`TapQueue`，sim 只看 byte |
| sim | 固定 60 Hz、整數子像素、方向查表、判定框軸對齊；無 `Math.random`／`Date`／DOM（`RULE-SIM-PURITY`） |
| 輸入紀錄 | 每 tick 1 byte，上限 25200 bytes（RLE 後預估 < 6 KB，N4 實測回寫）；劍塚選擇最多 300 筆；結束時本機重播驗證 |
| 實體上限 | 設計值：同戰區敵人 ≤ 6、同時在畫面內 ≤ 8（含進場中）、障礙物＋破壞物每畫面 ≤ 6、補給 ≤ 4、飛行物 ≤ 16；只模擬目前關卡；N4 實測 |
| 音效 | Web Audio 程式合成（金屬撞擊、刀風、鼓、環境低頻），0 個音檔為目標；首次手勢解鎖 |
| 單機 | 不連線、不做線上排行、不做雲端存檔；最佳紀錄存 `localStorage` |
| 包體 | v4 實測（2026-11-25）：dist 原始 760 KB（gzip 246 KB）。v5 估：每關背景 2 層約 40–80 KB（PNG-8，480 高 × 關長），五關加選路約 0.5 MB；仍遠低於 `RULE-BUNDLE-SIZE`。沒有執行期 CDN（`RULE-NO-RUNTIME-CDN`） |
| 上架打包 | `npm run build:zip` → `release/bladeoath.zip`：只有一個 `index.html`，程式、樣式、圖片內嵌（做法沿用 LanternHold 的 `scripts/singlefile.mjs`） |
| 資源載入 | 不從 CDN 載入任何東西（`RULE-NO-RUNTIME-CDN`） |
| 降級 | `prefers-reduced-motion` 與遊戲內「降低特效」：不震動、不閃白、粒子減量；起手光色、讀條、範圍提示、字樣不變 |
