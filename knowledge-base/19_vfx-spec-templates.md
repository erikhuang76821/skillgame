---
id: KB-vfx-spec
kind: method
topic: [art]
genre: ["*"]
reviewedAt: 2026-11-20
---
# 19 特效規格：從畫面與企劃到 PixiJS 特效

> 來源：使用者提供的「PixiJS VFX 知識包 v1.0」（`GUIDE.md`、`PROMPT.md`、`SOURCES.md`、`templates.json`、`vfx-spec.schema.json`、`examples/`，2026-11-20）。機器可讀檔已複製到 [assets/vfx-spec/](assets/vfx-spec/)：[templates.json](assets/vfx-spec/templates.json)、[vfx-spec.schema.json](assets/vfx-spec/vfx-spec.schema.json)、[examples/](assets/vfx-spec/examples/)。
> 與其他頁的關係：打擊感做法與 `FEEL` 在 [05](05_juice-and-feel.md)；命中節拍、像素風規格、分鏡六段、交付清單在 [18 §4 / §7 / §9 / §10](18_pixel-vfx-codex.md)；授權在 [06 §5](06_art-pipeline.md)。本頁**不定門檻**：樣本裡的數字是預覽暫定值或外部原版值（未證實），遊戲要用就寫進該遊戲的 `fx/feel.js`。
> 適用：任何畫風、任何品類的「技能／子彈／命中／範圍」類特效。像素風只多套 `pixel_profile`（§2）。

## 1. 流程：先規格、再程式
<!-- card: KB-vfx-spec.workflow; topic=process; kind=method -->

1. **先定遊戲用途**：起手、施放、命中、退場；誰觸發、往哪發、是否跟隨角色、預警是否必須等於判定範圍。傷害、目標選擇、命中時機以企劃與 sim 事件為準。
2. **再拆畫面**：視角、尺寸基準、落點、移動方向、前後遮擋、主色與局部亮度；核心、亮邊、光暈、拖尾、粒子、煙霧、背景扭曲各成一層。**單張截圖不能證明速度、時長或隨機性。**
3. **選一個主模板，再組合模組**（§2）：冰矢＝projectile＋trail＋impact；火圈＝telegraph＋field。不要寫成不可重用的單體。
4. **每個數值標依據**：`企劃指定`／`來源程式`／`影片量測`／`畫面觀察`／`暫定`／`未知`。未知填 `null`，不用 0。截圖和企劃衝突時保留企劃判定，美術差異列「待確認」，不改玩法。
5. **審規格後才寫程式**；程式寫完照 §5 驗收。

## 2. 模板與模組
<!-- card: KB-vfx-spec.templates; topic=art; kind=method -->

主模板（11 類，`template` 欄只能選一個）：

| 模板 | 辨識 | 要產出的參數 | Pixi 做法 → 低畫質 | 本專案注意 |
|---|---|---|---|---|
| projectile | 起點、目標、飛行段 | 路徑、速度或飛行時間、弧高、轉向、拖尾、命中事件 | Sprite＋路徑取樣 → 縮短拖尾 | 飛行時間只供預覽，命中跟 sim |
| beam | 線狀連接，常有蓄力 | 起訖點、束寬、蓄力、持續、掃射角、分岔抖動 | Graphics / Mesh → 保留核心束 | Mesh 會加 DC，記峰值（`RULE-DRAWCALL-2D`） |
| telegraph | 圓／扇／矩形預警 | 判定形狀、尺寸、預警時間、填滿曲線、邊界落點 | 地面 Graphics＋遮罩 → 保留完整邊界與讀秒 | 形狀從 sim 判定資料畫（§3） |
| impact | 命中閃光、衝擊波、碎片 | 爆點、半徑、碎片數、初速、衰減、煙塵壽命 | 光環 Sprite＋共用粒子池 → 減碎片 | 粒子池見 [05 §1](05_juice-and-feel.md) |
| slash | 定向刃光、連斬 | 道數、角度、長寬、間隔、殘影、散布 | Sprite / 預建 Graphics → 保留刀光輪廓 | |
| field | 持續作用區 | 形狀、半徑、循環速度、強度、脈衝、停止條件 | Container＋循環 → 單層環 | 搭 `seamless_loop` |
| flow | 風、煙、捲吸 | 方向、流速、渦旋、發射率、生命、擴散 | 粒子或透明逐格圖 → 限量或改貼圖 | |
| shield | 貼附角色、受擊短亮 | 錨點、半徑、開關時間、亮邊、受擊位置 | 跟隨 Container＋遮罩 → 只畫輪廓 | |
| portal | 開／維持／關的入口 | 朝向、尺度、開關時間、旋轉、內外層、循環 | 遮罩＋旋轉內層 → 取消折射 | |
| distortion | 背景彎曲或分裂 | 取樣範圍、偏移方向與量、遮罩、還原時間 | 局部 Filter 或背景重取樣 → 關扭曲留輪廓 | 受 `RULE-FX-FILTER` 與專案覆寫限制（SwarmDuel 禁 filter） |
| screen | 閃光、衝擊幀、震屏 | 範圍、強度、時長、是否影響 HUD、減少動態選項 | 鏡頭層與 HUD 分開 → 可關震屏、降閃光 | 照 [05 §1–§2](05_juice-and-feel.md)：震 `#stage-shake`，HUD 不跟晃 |

共用模組（`modules` 欄可多選，也可放其他模板當次模板）：

| 模組 | 用途 | 參數 | 詳見 |
|---|---|---|---|
| trail | 跟隨移動物件，不判定命中 | sample_count、length、lifetime_s、alpha_curve | |
| hit_pacing | 命中節奏與回饋 | anticipation_s、hit_stop_s、shake_px、flash_gain、decay_s | [18 §4](18_pixel-vfx-codex.md)：頓幀只停該次命中的動畫 |
| seamless_loop | 持續場、護盾、附魔循環 | loop_start_s、loop_end_s、exit_s | [18 §10](18_pixel-vfx-codex.md) 循環接點驗收 |
| pixel_profile | 只在像素風啟用 | 內部寬高、動畫 fps、描邊、色盤、抖色 | [18 §7](18_pixel-vfx-codex.md) |
| debug_guides | 路徑、錨點、遮罩、判定形狀疊圖，不進正式素材 | path_overlay、anchors、mask_outline、hit_shape_overlay | [18 §9](18_pixel-vfx-codex.md) |

## 3. 跟 skill game 架構的接法
<!-- card: KB-vfx-spec.skill-fit; topic=fairness,tech; kind=method -->

- **特效不結算**：規格的 `timeline.preview` 只是預覽秒數；`timeline.runtimeImpact` 寫 sim 事件名（如 `hit`），正式遊戲的命中、傷害、分數都由 sim 決定（`RULE-SIM-PURITY`）。改預覽飛行秒數不得影響判定。
- **預警＝判定**：telegraph 的形狀與尺寸從 sim 的判定資料畫，不另外手調；低畫質也要保留完整邊界與讀秒（[05 §2](05_juice-and-feel.md) 低特效不拿掉資訊）。特效不得遮住判定物件。
- **亂數種子分開**：粒子用 render 自己的種子亂數，由「種子＋目標時間」直接算出狀態；**不得取用 sim 的亂數流**，否則開關特效或改畫質會改變重播結果。
- **規格數值落點**：規格 JSON 是設計文件；遊戲實際讀的手感數值放 `fx/feel.js` 的 `FEEL`（每個特效一組 key），規格的 `params` 註明對應 key。
- **成本**：distortion 與 beam 的 Mesh 會加 pass / DC，特效全開時記 DC 峰值；同屏上限、粒子上限、低畫質三者一起控負載。
- **語言**：知識包原稿要求 TypeScript；本 repo 遊戲是 JS 模組（`game/src/fx/*.js`），照 JS 寫。不引入 three 等白名單外套件（[04](04_tech-stack.md)）。

## 4. 規格格式與實作契約
<!-- card: KB-vfx-spec.contract; topic=tech -->

- 必填欄位見 [vfx-spec.schema.json](assets/vfx-spec/vfx-spec.schema.json)：`id`（kebab-case）、`version`、`template`、`modules`、`tags`、`intent`、`space`（world／screen／hud）、`anchor`、`target`、`trigger{start,impact,end}`、`timeline{unit:"s",basis,preview[],runtimeImpact}`、`params`、`layers`、`quality.low`、`checks`；選填 `sources`、`verification`。
- 每個 `params` 項目都要 `value`／`unit`／`basis`／`range`（無範圍填 `null`），可加 `source`。
- 單位：畫面座標 px、時間 s、角度規格用 deg（進程式轉 rad）；世界單位不是 px 時另註換算。
- **時序**：預覽只用一個時間來源。GSAP 排事件與轉場；拖時間軸用 `tl.seek(t, true)` 抑制回呼，粒子由種子＋時間重建，不從上一幀累積。同一時間點不論從前或從後跳到，畫面都一樣，且不觸發音效、傷害或遊戲事件。
- **生命週期**：每次播放提供 `pause`／`resume`／`seek`／`dispose`；切場或取消時清掉 timeline、監聽與物件，不銷毀共用貼圖。
- **來源與授權**：存來源 URL；畫面推估附影片時間碼或截圖檔名。複用外部程式或素材逐檔核對授權並保留聲明（[06 §5](06_art-pipeline.md)）；特效程式的授權不延伸到原作品牌與美術。

## 5. 兩筆樣本與驗收順序
<!-- card: KB-vfx-spec.examples; topic=process; kind=method -->

| 樣本 | 依據 | 重點 |
|---|---|---|
| [ice-bolt.json](assets/vfx-spec/examples/ice-bolt.json) 冰矢命中 | 企劃示例，數值全為暫定 | 圖上只有一道藍線、企劃寫「射出冰矢、命中碎裂」→ projectile＋trail＋impact，不是 beam。藍色與朝向可由圖觀察；飛行秒數與碎片數只供預覽，清除時間跟著爆點移動。若企劃改成「光束連線 1 秒」，主模板改 beam，不沿用飛行時間 |
| [rift-shattering-slashes.json](assets/vfx-spec/examples/rift-shattering-slashes.json) 裂空碎斬 | 來源程式（[00GameDevs](https://00gamedevs.com/zh-TW/effects/dimensional-rend/)） | slash＋distortion＋impact；斬痕數、扭曲板數、碎片數、主色、總長取自原版。`runtimeImpact` 為 `null`（原版沒有遊戲傷害事件）。2D 遮罩偏移是近似，Pixi 版未逐幀對照 |

驗收順序：① 預警與命中是否符合企劃 → ② 時間、輪廓、方向、顏色、背景位移 → ③ 同種子正反向拖到同一時間畫面一致 → ④ 暫停、切場清理、連續播放不殘留 → ⑤ 低畫質仍看得出方向與命中。回報時分開寫「參數已核對」「實際渲染已驗證」「仍屬近似」；**沒並排播放就不給相似度百分比**。

## 6. 交給 AI 的提示詞（已改成本 repo 版）
<!-- card: KB-vfx-spec.prompt; topic=process -->

```text
先讀 knowledge-base/19_vfx-spec-templates.md 與 knowledge-base/assets/vfx-spec/（templates.json、vfx-spec.schema.json、examples/）。
輸入：遊戲截圖／短片／分鏡 [附上]；企劃 [觸發、目標、範圍、節奏或停止條件]；優先與限制 [可讀性、像素風、HUD、目標裝置]；參考效果與來源 [選填]。
1. 分開列出「畫面觀察／企劃要求／未知／實作暫定」。單張截圖不判定時長或速度；取自原版的欄位附來源。
2. 選一個主模板與需要的模組，用一張表對應時間、圖層、路徑、遮擋與 PixiJS 元件。未知填 null，不捏造來源。
3. 輸出符合 vfx-spec.schema.json 的 JSON；預覽秒數與 sim 的 hit 事件分開；樣式、效能和玩法衝突時先保留玩法所需輪廓。
4. 規格通過後，寫 PixiJS 8＋GSAP 3 的 JS 模組（放 game/src/fx/），數值進 fx/feel.js 的 FEEL；附可拖曳預覽：播放、暫停、重播、時間軸、圖層開關、低畫質。不加白名單外套件。
5. 回報：關鍵幀比較、同種子正反向拖曳、命中區域、暫停、切場清理；分開「程式／設定核對」與「視覺驗證」，沒實測就標明。
```
