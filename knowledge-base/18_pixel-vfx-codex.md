---
id: KB-pixel-vfx-codex
kind: research
topic: [juice, art]
genre: ["*"]
reviewedAt: 2026-11-20
---
# 18 外部特效庫：Pixel VFX Codex（像素特效圖鑑）

> 來源：[888wing.github.io/pixel-vfx-codex](https://888wing.github.io/pixel-vfx-codex/)、repo [888wing/pixel-vfx-codex](https://github.com/888wing/pixel-vfx-codex)（讀 `README.md`、`docs/AUTHORING.md`、`data/meta.json`、`engine/pxfx.js`、`engine/prompt.js`、`app.js`，2026-11-20）。
> 與其他頁的關係：本專案的打擊感做法與 `FEEL` 在 [05](05_juice-and-feel.md)、[juice.md](../.claude/skills/lite-skillgame-stack/references/juice.md)；原則與審查順序在 [17 §6–§9](17_design-principles.md)；生圖到 atlas 在 [06](06_art-pipeline.md)；資產登錄在 [10](10_asset-library.md)；不限像素風的特效規格模板在 [19](19_vfx-spec-templates.md)。本頁**不定門檻**：文中數字都是來源程式的預設值或經驗值（未證實），要用就寫進該遊戲的 `fx/feel.js`，不得寫進 `rules.json` 當驗收條件。

## 1. 它是什麼、授權
<!-- card: KB-pixel-vfx-codex.overview; topic=art,legal; artStyle=pixel -->

- 靜態網站＋純 JS 的像素特效圖鑑兼產生器：**138 個特效**，每個是一支 `fx/<id>.js`，呼叫 `PXFX.define({ id, loop, palette, timeline, layers, beats, params, draw(p, t) })`。執行期零相依，`file://` 可開；選用工具要 Node 18+（`tools/snap.mjs` 截 8 格×3 鏡頭）、ffmpeg、puppeteer。
- **同一份 3D 世界座標定義，三種鏡頭輸出**：3D 透視（240×150，輕抖色，30 fps）、2.5D 等角 30°（240×150，完整 4×4 Bayer 抖色、長硬陰影，20 fps）、2D 斜視（160×100，色塊分層無抖色、1 px 描邊，12 fps 步進）。
- 渲染是**軟體光柵器**（低解析 buffer＋深度緩衝，逐像素累加光再經色階與 Bayer 解析），不是 GPU shader。
- 產出：① 複製 prompt（Canvas 2D / Three.js / Godot 4 / Unity URP，或生圖模型用的 sprite sheet prompt，中英文）——內含鏡頭規格、hex 色盤、時間軸、圖層拆解、打擊感數值、全部參數與驗收項；② 匯出 PNG sprite sheet（可去背景與道具）或「關鍵 6 格」條。
- **授權 MIT**（© 2026 Pixel VFX Codex contributors）。64 個 Library 特效重製自 [00GameDevs](https://00gamedevs.com/) VFX 庫（MIT，© 00GameDevs）；渲染手法改編自 [pixel-plays](https://github.com/amirmushichge/pixel-plays)（MIT）。00GameDevs 網站 UI / 品牌、pixel-plays 的音樂**不在授權內**。
- 我們的用法：把匯出的 sprite、改寫的程式放進遊戲時，在遊戲的 credits / `LICENSE-THIRD-PARTY` 保留這三份 MIT 聲明（照 [06 §5](06_art-pipeline.md) 授權欄登記）。

## 2. 目錄：六個包與分類
<!-- card: KB-pixel-vfx-codex.catalog; topic=art; artStyle=pixel -->

| 包 | 數量 | 內容 | 對 skill game 的用處 |
|---|---|---|---|
| Library | 64 | 遊戲常見特效：projectile 8、beam 9、area 21、burst 12、vortex 4、smoke 4、shield 3、portal / environment / screen 各 1；屬性有火、冰、雷、奧術、光、暗、自然、沙、毒、水、星、風 | **最常用**：子彈、命中爆炸、地面範圍、護盾、拾取光，直接對應射擊、割草、塔防、跑道射擊 |
| Ultimates | 28 | 原創動畫風大招，施法者人偶＋六段：起手 → 集氣 → 成形 → 推進 → 命中 → 餘波；由共用模組（能量核心、彎月斬、衝擊波、領域、餘波痕跡…）組合 | 頭目擊破、連擊結算、Cut-In 過場（對照 [15](15_reference-games.md) 的刷幕）的節奏範本 |
| Mass Spells | 10 | 一招對 30–60 個小兵：隕石、萬劍、扇形冰封、火牆、連鎖閃電、重力漩渦… | 割草 / 守線的清場演出 |
| Scale Ladder | 12 | 4 階規模（10 / 100 / 1,000 / 10,000 敵）× 3 種範圍形狀，含陣形（方陣、橫列、縱隊、楔形、環、新月、小隊、散兵） | 大量單位的 LOD 做法；「誠實範圍」規則（§5） |
| Twist | 12 | 改畫面本身的法術（解析度崩塌、橡皮擦、翻轉、摺地圖、拼圖、百萬兵 horde pass） | 大多需全螢幕後製，見 §6 的限制 |
| Armory | 12 | 6 種武器附魔（附無縫循環區間）＋6 種武器召喚 | 武器 / 角色待機特效、升級卡圖示的動態版 |

`data/meta.json` 每筆有 `category`、`schools`、主色 `color`、原版時間 `lifecycle.start / end`、`duration`。例：子彈類 start 0.35 s、end 0.8 s；爆炸類 start 約 0.28 s、end 約 1.26 s、總長 2.8 s；格擋 `prism-parry` 總長 0.55 s（start 0.055 s）。這些是**原特效的展示時間**，不是遊戲內判定時間。

## 3. 動態規則：不要等速
<!-- card: KB-pixel-vfx-codex.motion-rules; topic=juice; kind=method -->

作者文件的「打擊感 / 速度感」規則，可直接當我們寫 GSAP / Pixi 補間時的檢查表（緩動名稱對照 [gsap.md](../.claude/skills/lite-skillgame-stack/references/gsap.md)）：

| 對象 | 規則 | 緩動 |
|---|---|---|
| 投射物 | 先短暫後縮或集氣（蓄力），放開後**加速**撞向目標；快的東西沿速度方向拉長（smear） | 蓄力 `back.in`，飛行 `power3.in` |
| 命中 | **前 1–2 格（約 0.03–0.08 s）最大最亮**；環與衝擊波快速擴張、越擴越細；閃光快速收掉 | `expo.out` / `power3.out` |
| 粒子 | 位移用阻力曲線（先快後慢），重的加重力，出生時間錯開、壽命不一；**禁止 `x = v * t` 的直線噴灑** | 阻力 `drag(v0,k,t)` |
| 出現 | 法陣、護盾、結晶用回彈過衝或彈簧彈出 | `back.out`、彈簧 |
| 消失 | 快速收縮，不要線性淡出；Armory 更進一步：**碎裂而非淡出**（核心先退、主色殘影留下、再斷成段與單像素） | `power3.in` |
| 持續循環 | 脈衝要尖起慢落（如 `(1 - phase)^3`），旋轉要緩入緩出，波要錯開 | — |

可讀性：「**幾個大而肯定的形狀＋少量清楚的粒子**」。在 240×150 下火花 1–2 px，10–40 顆擺好的粒子比幾百顆好讀——這也剛好符合我們不做通用粒子系統、粒子進 `ParticleContainer` 的預算（[05 §1](05_juice-and-feel.md)）。

## 4. 節拍時間軸：頓幀、震動、閃光的參數化
<!-- card: KB-pixel-vfx-codex.beats; topic=juice; kind=method -->

每個特效標出 `beats: [{ t, kind, power }]`；來源 prompt 明寫「時間分兩層」：特效畫面只由自己的 t 決定，頓幀、加減速、震屏、閃光放在外層時間映射，由遊戲的命中結果觸發。四種節拍的預設比例（approach / hold / shake / flash / release）：`hit` 擊中目標 1/1/1/1/1；`burst` 爆炸起點 0/0.8/0.8/1/1；`cast` 發射或法陣出現 0/0/0/0.5/0.55；`pulse` 持續效果的重音 0/0/0.3/0.6/0。

搬到我們的架構：sim 事件帶 `kind` 與 `power`，render 查 `fx/feel.js` 的 `FEEL`。欄位與來源預設值（未證實）：

| 欄位 | 內容（來源預設） | PixiJS＋GSAP 做法 |
|---|---|---|
| `approach` | 命中前最多 0.4 s 加速到 snap 倍（2.2） | 只用在演出物的補間；判定時間由 sim 定，演出要在命中 tick 準時到達 |
| `hitstop` | 0.1 s；**停哪些對象** | 只暫停該次命中相關的 timeline 或 container 動畫（`tl.pause()`＋`gsap.delayedCall` 恢復），**不停 sim、不停輸入、不動 `gsap.globalTimeline`**（§6-2） |
| `shake` | 2 px（以 240×150 計），0.32 s 平方衰減，每 1/30 s 換方向，垂直 ×0.7 | 照 [05 §1](05_juice-and-feel.md) 抖 `#stage-shake`；連續命中取較大者 |
| `flash` | 亮度 +0.7，頓幀中保持，70 ms 時間常數衰減 | CSS `#fx-flash` overlay（0 DC） |
| `release` | 命中後最多 0.7 s 先快後慢 | `expo.out` / `power3.out` |
| `power` | 0.3–1.5，同時縮放 hitstop / shake / flash | render 乘上去；同種子重播結果不受影響 |

## 5. 對 skill game 最有價值的三個設計
<!-- card: KB-pixel-vfx-codex.skill-fit; topic=juice,fairness,tech; kind=method -->

1. **誠實範圍（honest areas）**：Scale Ladder / Twist / Armory 的 `hit(u)` 只對「畫出來的範圍內」的單位回傳命中時間，範圍外的活下來；畫出的環、光帶、爆圈與判定用**同一組數字**。對技巧賽這是公平問題，不是美術問題：玩家看到的範圍 = sim 判定範圍。我們的做法：判定半徑在 sim，render 從 sim 讀同一個值畫特效，不在 fx 層另寫半徑（對照 [01](01_skill-integrity.md)、[13](13_input-fairness.md)）。
2. **特效是時間的純函式**：`draw(p, t)` 不得用 `Math.random`、不保存跨幀狀態；粒子亂數用 `p.r(k, salt)`（以粒子索引雜湊，密度改變時粒子不會重排），閃爍用 noise / fbm。這和 `RULE-SIM-PURITY` 同精神，且讓重播畫面逐幀一致、任何一格都能跳轉匯出。我們 render 層的程式特效可照此寫（以事件起始時間為 t0、用事件 id 當 salt）。
3. **距離 ÷ 波速的群體命中**：群體法術中每個單位的命中時間 = 起始時間 + 與爆心距離 ÷ 波速 + 小抖動，讓傷害像波一樣掃過人群，再播各自反應（擊飛、冰封碎裂、燒成灰…）。若命中會影響分數，這個時間要在 sim 算；只是演出就在 render 用同公式錯開即可。

另外值得借的：
- **大量單位 LOD**：小兵畫面高度 ≥ 7.5 px 畫完整模型，低於就換成 1–3 px 寬的筆劃 sprite；一萬個約 3 ms（軟體光柵）。上千單位時不要逐單位發光或粒子，改換材質（冰、炭、石、骨…）＋共用大效果。
- **規模靠對比**：小兵約為施法者 40% 高，主形狀是小兵的數倍、可以超出畫面；先慢慢預告（陰影、天色、法陣、小兵後仰顫抖），再一口氣掃過。
- **Ultimates 六段**＋「先壓縮再爆發、整個畫面變色、一個巨大清晰的形狀、頓幀與速度反差、地面留痕」，適合當頭目擊破與結算演出的分鏡模板；作者明訂不得使用既有作品的角色、名稱、招式，和我們的 IP 規範一致。

## 6. 不能直接用的地方
<!-- card: KB-pixel-vfx-codex.limits; topic=juice,budget,tech -->

1. **引擎不能當執行期渲染器**：它是逐像素的 JS 軟體光柵器，作者自己的效能目標是單一特效每幀約 6 ms 以內；放進 PixiJS 遊戲等於多一張每幀上傳的 canvas 貼圖，還要和遊戲畫面的解析度、鏡頭對齊。只當**離線工具**（匯出 sprite、抄做法與數值）。
2. **時間映射（加速衝進、凍結、爆出）只能放在純表現的時鐘**：sim 時鐘、輸入時間戳、判定窗不得因頓幀而拉長或停住（[13](13_input-fairness.md)）。節奏 / 時機判定類（[12](12_genre-recipes.md)）連表現層也不要做「加速衝進命中」的變速，會讓畫面與判定脫鉤。
3. **全螢幕後製（`warp`、`grade`、`domain`、`impactFrame`、Twist 的 `post`）**在 Pixi 裡對應 filter，受 `RULE-FX-FILTER` 與 `RULE-DRAWCALL-2D` 約束；已覆寫為不用 filter 的遊戲（SwarmDuel）只能改用 sprite 或 CSS overlay（[05 §1](05_juice-and-feel.md)）。
4. **匯出 sprite 會吃包體**：程式特效 0 bytes，序列幀不是。只匯出真的需要逐格手繪感的特效（如 Armory 附魔循環、Ultimates 命中格），用 2D 鏡頭、去背、`loopWindow` 只匯循環段，打進 atlas 後計入 `RULE-BUNDLE-SIZE`；簡單的環、閃光、火花仍照 [05](05_juice-and-feel.md) 用 Graphics / CSS 算出來。
5. **解析度與畫面比**：它的畫布是 240×150 / 160×100 橫幅小島場景；我們是直版 375×812 並以整數倍放大像素。匯出時按遊戲的像素倍率決定匯出尺寸，不要把 240 寬的格子再非整數縮放（會糊，見 [10 §6](10_asset-library.md)）。
6. 2D 鏡頭下貼地的效果會變細，作者建議加垂直元素（上升光點、光柱）；頂視或斜視 2D 遊戲要注意同一問題。

## 7. 像素風規格（只在像素風專案記錄）
<!-- card: KB-pixel-vfx-codex.palette; topic=art; artStyle=pixel -->

> 這一節只給 `artStyle` 含 `pixel` 的遊戲。非像素風的遊戲不要把解析度、步進幀率、抖色當成全案預設。

像素風遊戲的 `gdd/02_art_spec.md` 要多寫這五項：

| 項目 | 來源的做法（參考值） | 在 PixiJS 的落地 |
|---|---|---|
| 內部渲染解析度 | 2D 160×100、3D / 2.5D 240×150，另有 0.75–1.5 倍的像素密度調整 | 整數倍放大：canvas `image-rendering: pixelated`、紋理 `scaleMode: 'nearest'`、`roundPixels`；若改成先畫到低解析 RenderTexture 再放大，會多一次 pass，要計入 `RULE-DRAWCALL-2D` |
| 動畫幀率 | 2D 12 fps、2.5D 20 fps、3D 30 fps（遊戲本身仍 60 fps） | 特效時間量化 `t = floor(t·fps)/fps`，或 GSAP `steps(n)`（[05 §2](05_juice-and-feel.md)）；sim 不受影響 |
| 描邊 | 2D 實體 1 px 深色描邊；半透明實體不描 | 烘進 sprite；不要用 outline filter |
| 色階 | 見下列規則 | 每遊戲一份特效色盤檔 |
| 抖色 | 2.5D 完整 4×4 Bayer、3D 輕抖、2D 不抖 | 即時抖色需要 filter（受 `RULE-FX-FILTER` 約束），建議烘進序列幀或不用 |

色階規則：

- 每種材質 **4–7 階色階，由暗到亮**；無反鋸齒、無平滑漸層。
- **發光色階不要從接近黑色起**（最低階會變成抖色光暈，看起來髒），從飽和的中暗色開始。
- 色相偏移：暗階往紫 / 藍偏，亮階往暖白偏；光的色階收在暖白。
- 主色取原特效的 `color` 當主色階的中段（例：火球 `#ff823e`、電漿彈 `#73e3ff`、冰刺 `#b3dcff`、格擋 `#ffe3a0`）。
- 和我們現有生圖風格鎖（[06 §2](06_art-pipeline.md)：每材質 3 色、≤ 16 色、1 px 深色輪廓）不衝突：特效可比角色多 1–4 階，但同一遊戲要固定一份特效色盤登錄在 `art/` 的 palette 檔。

## 8. 取用流程
<!-- card: KB-pixel-vfx-codex.workflow; topic=art,process; kind=method; artStyle=pixel -->

1. 在網站依品類找特效（子彈 → projectile、命中 → burst、地面技 → area、護盾 / 格擋 → shield）。
2. 調參數與 `density`（0.25–2），切到最接近遊戲視角的鏡頭（頂視 / 側視多半選 2D，等角選 2.5D）。
3. 二選一：
   - **程式重做（首選，0 bytes）**：複製「Canvas 2D」prompt，交給實作者照時間軸、圖層與緩動改寫成 Pixi Graphics / `ParticleContainer`＋GSAP，數值落在 `fx/feel.js` 的 `FEEL`。
   - **序列幀**：匯出 PNG sprite sheet（去背景、去道具）或「生圖 sprite sheet」prompt 交給 Codex 生圖，再走 [06](06_art-pipeline.md) 的切圖 → atlas → 量 DC。
4. 在該遊戲 `art/manifest.json` 登錄來源（effect id、網址、MIT），由 `index-build` 彙整進資產索引（[10](10_asset-library.md)）。
5. 照 §3 的動態規則與 [17 §9](17_design-principles.md) 的審查順序驗手感；判定範圍照 §5-1 由 sim 提供。

## 9. 分鏡與路徑
<!-- card: KB-pixel-vfx-codex.storyboard; topic=art; kind=method -->

大招、頭目擊破、結算演出照 Ultimates 的六段寫分鏡，每段都要能說出「誰在動、沿哪條路、被什麼擋住」：

| 段 | 要記錄 | 常見做法 |
|---|---|---|
| 起手 Pose | 施放者姿勢、錨點（手、武器尖、胸口） | 錨點由角色骨架或 sprite 的固定點提供，特效掛在錨點上 |
| 集氣 Charge | 匯聚點、光點從哪裡流入 | 光點沿固定路徑流向錨點，越近越快 |
| 成形 Shape | 主形狀（環、彎月、法陣）的大小與朝向 | 一個大而清楚的形狀；用回彈過衝彈出 |
| 推進 Motion | 路徑（直線、弧線、螺旋）、速度變化 | 路徑由固定數字定義，不用閃爍亂數；快段拉長筆劃 |
| 命中 Impact | 命中點、範圍、頓幀與閃光 | 範圍取 sim 的判定值（§5-1）；前 1–2 格最大最亮 |
| 餘波 Aftermath | 地面留痕、殘影、碎裂方式 | 碎裂而非淡出；循環前清乾淨 |

- **每層記錄路徑、錨點與遮擋**：路徑在武器或角色後方的那段要被遮住、從邊緣再出現（Armory 規則 1–2）。
- **驗收時切到「只看路徑」**：來源網站的引導線開關會把路徑畫成 1 px 線（被遮處畫成虛線），模式 2 隱藏所有發光只留路徑。我們的做法：開發模式加一個 debug 開關，用一個 `Graphics` 畫出每層的路徑與錨點，不畫粒子；方向、起訖點、遮擋對不對，先在這個視圖確認，不靠粒子外觀猜。
- 原創限制：分鏡描述視覺語言，不寫既有作品的角色、招式名稱（來源與我們的 IP 規範一致）。

## 10. 交付與驗收素材
<!-- card: KB-pixel-vfx-codex.deliverables; topic=art,process; kind=method -->

來源 prompt 的「交付與驗收」段，加上我們的預算規則，整理成每個特效的交付清單：

- **六張關鍵幀**：有六段分鏡的招式每段一張；其他特效在一輪循環內平均取 6 格（來源的「關鍵 6 格」匯出就是這樣取）。這是企劃與美術對齊的主要依據。
- **特效模組介面**：可調參數全部是輸入（預設值即驗收值），另有速度；提供開始、停止（自然收尾）、命中三個入口，由 sim 事件呼叫。
- **只有需要烘焙時**才匯出去背 PNG spritesheet：照特效幀率逐格輸出，**頓幀以重複格表現、震屏不烘入**（震屏由 `#stage-shake` 在遊戲內做）；打進 atlas 後計入 `RULE-BUNDLE-SIZE`。能用 Graphics / CSS 算出來的就不烘（§6-4）。
- **整數倍率檢查**：在 2 種以上的整數放大倍率下看，沒有半像素、模糊或混色漸層帶（像素風專案才需要）。
- **常駐效果驗收循環接點**：武器附魔、護盾、地面持續區這類會一直播放的效果，要另外驗收循環區間（來源的 `loopWindow`）：最後一格接回第一格不跳；只循環那一段，不重播起手。
- **路徑視圖截圖**：§9 的「只看路徑」各一張，附在驗收紀錄。
- 素材放在該遊戲 `art/` 底下並登錄 `art/manifest.json`（來源 id、網址、MIT），由 `index-build` 彙整（[10](10_asset-library.md)）。
