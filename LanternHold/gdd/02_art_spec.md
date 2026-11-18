# 02 美術與資產設定

> 管線：[06_art-pipeline](../../knowledge-base/06_art-pipeline.md)、[10_asset-library](../../knowledge-base/10_asset-library.md)、[11_terrain-style-kit](../../knowledge-base/11_terrain-style-kit.md)。台灣禁忌：`RULE-ART-TW-TABOO`（每張圖人工驗收）。生成前先查[中央資產索引](../../knowledge-base/index/INDEX.md)有無可重用。
> 包體與 Draw Call 門檻見 `RULE-BUNDLE-SIZE`、`RULE-DRAWCALL-2D`，本頁只列預估。

## 1. 風格

| 項目 | 設定 |
|---|---|
| 名稱 | 暖燈夜林（原創） |
| 視角 | 2D 斜俯視約 35°，建築與角色用正面略俯的單張圖 |
| 筆觸 | 手繪平塗＋少量漸層，深色描邊 1–2 px；不寫實、不像素 |
| 色彩 | 背景深靛藍夜林（**不用純黑大面積**）；焦點是暖橘燈光；敵人偏冷紫，與友軍暖色分得開 |
| 可讀性 | 燈光半徑 = 防線，光內亮、光外暗；敵人永遠有冷色亮邊，暗處也看得到 |
| 要避開 | 雪地、暖爐、寒冷末日（參考作品的識別元素）；錢幣、骰子、轉盤、紅金大面積、「倍」字；神明、招財貓；綠色頭飾 |

### 調色盤（token）

| token | 用途 | 參考值 |
|---|---|---|
| `night-0` | 最深背景 | #141a33 |
| `night-1` | 林地 | #1f2a4a |
| `night-2` | 道路、空地 | #2f3b5e |
| `lamp` | 燈光核心 | #ffb64a |
| `lamp-soft` | 光暈外緣 | #ff8a3d（低透明度） |
| `gold` | 金幣（圖示畫金塊） | #d9a85b |
| `meat` | 肉 | #e07a5f |
| `ore` | 礦 | #8fb3d9 |
| `ally` | 友軍旗色、守備圈 | #6fd3c4 |
| `foe` | 敵人主色 | #7a5cc9 |
| `foe-rim` | 敵人亮邊 | #c6a8ff |
| `danger` | 預警、耐久低 | #ff5a5a |

## 2. 畫面與尺寸

- 邏輯畫面 720×1280（直版），世界固定、不捲動（公平視野 E3）；長螢幕多出的空間只放 HUD。
- 主城在畫面中心偏上（y ≈ 560），下方留給操作區。8 個出怪口在可見框外。

| 物件 | 畫布尺寸（px） | 腳底錨點 |
|---|---|---|
| 主城 | 192×224 | 底部中央 |
| 建築 | 96×112 | 底部中央 |
| 城牆段 | 72×56（3 個角度變體：水平、斜 45°、垂直） | 底部中央 |
| 英雄 | 56×56 | 腳底 |
| 士兵 | 40×40 | 腳底 |
| 敵人（小／中／大） | 32 / 48 / 72 | 腳底 |
| Boss | 192×192 | 腳底 |

## 3. 資產清單

方向：只生 3 向（下、側、上），側向水平鏡像得到另一側（比 06 的 5 向更省）。

### 3.1 建築與城牆（世界 atlas）

| ID | 名稱 | 狀態／等級 | 張數 | 來源 |
|---|---|---|---|---|
| `bld_castle` | 主城：前哨 → 城鎮 → 要塞 | Lv1–3 | 3 | AI 生成 |
| `bld_barracks` | 軍營（出弓箭手、盾兵、牧師） | Lv1–3 | 3 | AI 生成 |
| `bld_ranch` | 牧場（圍欄＋小屋＋牲畜） | Lv1–3 | 3 | AI 生成 |
| `bld_mine` | 礦場（礦坑口＋礦車） | Lv1–3 | 3 | AI 生成 |
| `vein` | 礦脈點（未開採的發光礦石堆） | 1 | 1 | AI 生成 |
| `wall_wood` / `wall_stone` / `wall_iron` | 城牆三級 | 每級 × 3 角度（水平、斜、垂直） | 9 | AI 生成；龜裂／殘破用裂痕疊圖＋程式 |
| `bld_site` | 施工鷹架 | 1 | 1 | AI 生成 |
| `bld_rubble` | 瓦礫 | 2 尺寸 | 2 | AI 生成 |
| `slot_empty` | 空建造點 | 1 | 1 | 程式繪製 |

> 建築等級外觀：Lv1 木造 → Lv2 石基 → Lv3 加燈與旗。一次生成同一建築三級並排，確保一致。
> 耐久顯示：建築上方細血條由程式畫；受擊閃白、龜裂疊圖由 render 控制，不另生圖。

### 3.2 角色（世界 atlas，3 向 × 動作）

| ID | 動作（幀數） | 張數小計 |
|---|---|---|
| `chr_worker` | walk 4、work 3（挖礦／餵牲畜共用）、fight 2 | 3 向 × 9 = 27 |
| `chr_{archer,shield,priest}` | walk 4、attack 3（牧師 = 治療 3） | 3 種 × 3 向 × 7 = 63 |
| 小兵等級 1–3 | **不另生圖**：頭上 1–3 條槓（程式）；Lv3 加披風疊圖 | 疊圖 1 張 / 種 |
| `hero_{mage,warrior,summoner,assassin}` | walk 4、attack 4、skill 3 | 4 種 × 3 向 × 11 = 132 |
| 英雄 2 階 | **不另生圖**：換配色＋光環（程式） | |
| `wisp` | 召喚師的燈靈：飄 4、攻擊 2 | 1 向 × 6 |
| `foe_{rat,beetle,moth,shroom,snail,wolf}` | walk 4、attack 2（菇 = 膨脹 3 幀） | 6 種 × 3 向 × 6 ≈ 108 |
| `boss_throat` | 移動 6、噴潮 6、受擊 2 | 1 向（正面）× 14；可選 Spine |

### 3.3 特效與投射物（fx atlas，加色混合）

| ID | 說明 | 來源 |
|---|---|---|
| `fx_arrow`、`fx_beam`、`fx_wisp_bolt` | 箭、主城光束、燈靈飛彈 | AI 生成小圖 |
| `fx_fireball` | 法師火球＋落地爆炸 4 幀 | AI 生成 |
| `fx_slash` | 戰士、刺客的近戰刀光 3 幀 | 預生成 sprite |
| `fx_heal` | 牧師治療光點 | 程式粒子 |
| `fx_ring` | 爆炸／衝擊／英雄落地擴散環（取代 filter） | 程式產生 |
| `fx_gold` | 金粒（飛向資源列；**金塊顆粒，不畫錢幣**） | AI 生成 |
| `fx_meat`、`fx_ore` | 產出時從建築彈出的小圖示 | AI 生成 |
| `fx_light` | 主城燈光半徑漸層（也是放置範圍） | 程式產生 |
| `fx_path` | 調防時腳下虛線、架設進度圈、冷卻圈 | 程式繪製 |
| `fx_crack` | 牆面裂痕疊圖 2 張 | AI 生成 |
| `fx_spark`、`fx_dust` | 打擊火花、碎石 | 程式粒子 |
| `fx_fog` | 霧潮 | 程式產生雜訊貼圖 |

### 3.4 地表與場景

| ID | 說明 | 來源 |
|---|---|---|
| `ground` | 夜林空地，中央石板廣場、放射小徑通往 8 口 | 依 11 地表設定集程式生成＋1 張手繪廣場 |
| `prop_tree_{1..6}` | 邊緣樹叢（遮住出怪口） | AI 生成 |
| `prop_gate_{1..2}` | 出怪口（樹洞、石拱） | AI 生成 |

### 3.5 UI（DOM，不佔 Draw Call）

| ID | 數量 | 規格 |
|---|---|---|
| 資源圖示 | 3（金塊、肉、礦石）＋人口 1 | 64×64 |
| 建築／動作圖示 | 4 建築＋買工人、升級、修理、城牆 3 級 | 64×64 |
| 兵種按鈕 | 3（弓、盾、牧）＋剋制小標（打輕／擋路／補血） | 96×96 |
| 英雄卡 | 4（法師、戰士、召喚師、刺客），主城升級時彈出 | 160×220 卡面，CSS 外框 |
| 敵人預警圖示 | 7 | 48×48 |
| 羅盤 | 1 | CSS + SVG |
| 主視覺 | 1 | 16:9，WebP q78 寬 960 |
| 字型 | 1 中文標題字（子集化）＋系統字 | woff2 |

### 3.6 音效與音樂

| 類別 | 項目 | 做法 |
|---|---|---|
| SFX（約 24） | 箭、火球、刀光、命中（剋制／被剋兩種）、治療、金幣入帳、小兵升級、蓋造、升級建築、工人出生、挖礦、牲畜、兵練成、選取、放下、架設完成、牆受擊、牆龜裂、牆倒塌、修理、英雄登場、預警、事件開始、商隊抵達、Boss 吼、主城受擊、結算 | Web Audio 合成（[14_audio](../../knowledge-base/14_audio.md)） |
| BGM | 1 首可分層的循環：底流層＋事件鼓層＋Boss 層，依壓力疊加 | Opus/OGG |

BGM 跟著「底流 → 事件 → 餘燼」的節奏疊層，是節奏感的一半。

## 4. Atlas、Draw Call 與包體預估

| 圖層 | 內容 | DC |
|---|---|---|
| 地表 | 烘成一張 | 1 |
| 世界 | 建築、牆、角色、敵人同一張 atlas（2048²，Y 排序） | 1 |
| 特效 | 加色 atlas：刀光、投射物、金粒、燈光、擴散環 | 1 |
| 數字 | BitmapText 傷害數字 | 1 |
| UI | DOM | 0 |
| **合計** | | **4** |

> 角色約 350 格、建築約 25 張；48–64 px 一格塞得進一張 2048² atlas。超出時依序：英雄改 2 向 → 敵人 attack 幀減為 1 → 拆成兩張 atlas（世界 DC 變 2，總計 5，仍在 `RULE-DRAWCALL-2D` 內）。

| 項目 | 預估 |
|---|---|
| 程式（Pixi + GSAP + 遊戲） | 1.1 MB |
| 世界 atlas（WebP） | 1.0 MB |
| 特效 atlas | 0.2 MB |
| 地表 + 主視覺 | 0.3 MB |
| UI 圖示 atlas | 0.3 MB |
| 字型 | 0.2 MB |
| BGM（分層） | 1.8 MB |
| **合計** | **≈ 4.9 MB** |

## 5. 生成用風格鎖（英文，所有資產共用開頭）

```
Original game asset for a cozy night-forest tower-defense game.
Hand-painted flat style with soft gradients, clean 1-2px dark outline,
3/4 top-down view at about 35 degrees, warm amber lantern light as the key light,
deep indigo night palette (never pure black), enemies in cool violet with a bright rim light.
Single object, centered, true transparent background, no text, no ground, no cast shadow.
Do not imitate any existing game, brand or IP. No snow, no furnace, no coins, no dice.
```

每種資產再接：物件描述 → 尺寸／方向 → 「與附圖 1 同一角色／同一建築系列」。

## 6. 生成順序與驗收

1. 主城 Lv1 + 軍營 Lv1 + 弓箭手下向 idle → 定風格（人工 ✋）。
2. 其餘建築 Lv1 → 城牆三級 → 工人、盾兵、牧師 → 敵人 6 種 → 英雄 4 種 → 等級與動作補齊。
3. 每張驗收：同系列一致、真透明、無文字、方向正確、台灣禁忌清單、暗背景上看得清楚（放到 `night-1` 底色上檢查）。
4. 縮圖打包照 06 §2 第 6 步；登錄到 `art/manifest.json` 後跑 `node shared/tools/index-build.mjs`（`RULE-ASSET-REGISTER`）。
5. **原型階段先用程式繪製的色塊與幾何圖形**（同 GateLane），玩法過了技巧主導測試再進 AI 生圖。
