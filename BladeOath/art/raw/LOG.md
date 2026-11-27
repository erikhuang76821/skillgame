# BladeOath 分件剪紙生成紀錄

工具：picanywhere（gpt-image-2）。Prompt = `art/tools/prompts.py` 的 `STYLE_LOCK` ＋ 各資產內文，原文在 `art/prompts/<name>.txt`。
版面：第 1 列＝正、側、背三姿勢的身分參考（不進遊戲），第 2 列＝骨架分件（頭 3 向、軀幹 3 向、武器）。背景純綠 `#00FF00`；主體是苔綠的蠱系（蠱蟲、蠱師、蠱母）改洋紅 `#FF00FF`。
後處理與打包：`python BladeOath/art/tools/build.py`；登錄：`python BladeOath/art/tools/manifest.py` → `node shared/tools/index-build.mjs --update-hashes`。6 倍預覽：`art/preview/actors_x6.png`。

| 日期 | job | 張 | 內容（順序） | 採用 |
|---|---|---|---|---|
| 2026-11-25 | `job_20261125-204617_322` | 9 | chr_player、chr_soldier、chr_bug、chr_caster、chr_brute、chr_mother、chr_general、chr_fallen、props | 全部採用（各一張 `_t1`） |

## 驗收與取捨

- 縮放：每個角色一個縮放比（軀幹正面高＝gdd/02 §3 目標），頭與軀幹保持原圖比例；武器另依骨架的 `weaponLen × scale` 定長度，讓刀光拖尾跟著的刀尖落在圖上。
- 結果（不含外框）：玩家頭 7×9、軀幹 7×10、劍 16 長；屍傀將偃月刀 37、墮仙長劍 45。蠱母、墮仙的頭因長髮較高（9×17、13×15）。
- 全組 176 格、256×256、29 色、PNG-8 約 10 KB。
- 台灣禁忌（`RULE-ART-TW-TABOO`）：無錢幣（寶箱開啟是空的）、無香爐／牌位（劍塚＝石堆＋斷劍＋無火石燈）、屍兵無符紙、蠱師無道袍與符咒、墮仙無光環／寶座／蓮座／金光；沒有綠色頭飾（蠱師髮結是深色布）；共用調色盤沒有純黑、純白、金、亮紅（build.py 會擋掉）。
- 保留色：墮仙的淺灰長袍量化到 `steel-hi` #b8c2cc，比讀條白光 #f3efe4 暗且偏冷，實際畫面可分辨。
- 受擊白閃：分件是像素圖，乘色無法變白，改為白閃期間分件半透明（四肢線段仍變白）；不加 filter。
- 劍塚點亮狀態目前只用色調（點亮＝原色、未點亮＝壓暗），規格說的程式光暈尚未做。

## v5 場景（橫向卷軸）

| 日期 | job | 張 | 內容（順序） | 採用 |
|---|---|---|---|---|
| 2026-11-26 | `job_20261126-172837_607` | 13 | far_gate、near_gate、far_forest、near_forest、far_well、near_well、far_hall、near_hall、far_cloister、near_cloister、far_terrace、near_terrace、props_v5 | 全部採用（各一張 `_t1`） |

- Prompt：`art/tools/scenes.py`（`LOOK` ＋ 遠景／近景／道具表），原文在 `art/prompts/`。後處理：`python BladeOath/art/tools/scenery.py`；預覽 `art/preview/scenes_x2.png`、`props_x6.png`。
- 近景圖的牆與地面分界由人工量（`NEAR_CUT`）：山門、迴廊、墮仙台的生成圖上方帶到天空，只取牆帶以下。
- 遊戲內每份背景條每隔一份水平鏡像拼接，接縫一定對齊；生成圖不必左右無縫。
- 保留色：墮仙台地面是淺灰石板，遊戲內加乘色 `#b4b4c4` 壓暗，白光預警仍是畫面最亮的東西。
- 台灣禁忌（`RULE-ART-TW-TABOO`）：沒有廟宇、牌位、神像、香爐、符咒、八卦、光環；山門是兩根素面方石柱（無屋頂、無匾額）；殿內布幡沒有文字；石燈未點火；斷碑無字；沒有金色與錢幣。

## v5 賽璐璐重畫（2026-11-26，使用者決定：像素風偏 low，改卡通賽璐璐 2D）

| 日期 | 工具 / job | 張 | 內容 | 採用 |
|---|---|---|---|---|
| 2026-11-26 | Codex CLI（`art/tools/codex_gen.sh`） | 1 | cel_near_gate | 採用。之後 Codex 本機閘道生圖回 404，改用 picanywhere |
| 2026-11-26 | picanywhere `job_20261126-174921_609` | 20 | 8 角色姿勢表、5 張近景以外的場景（far ×6、near ×5）、道具表 | 全部採用（各一張 `_t1`） |
| 2026-11-26 | picanywhere `job_20261126-175315_611` | 1 | cel_props2：劍塚、寶箱關／開 | 採用 |

- Prompt：`art/tools/cel_prompts.py`（`STYLE` ＋ 角色 9 姿勢／遠景／近景／道具），原文在 `art/prompts/cel_*.txt`。後處理：`python BladeOath/art/tools/cel_build.py`；預覽 `art/preview/cel_actors.png`、`cel_props.png`。
- 切件：去背（綠或洋紅）與去溢色後，以每欄不透明像素密度做 1-D k-means 找 9 個身體中心，在相鄰中心之間最空的欄下刀，脫離的刀尖仍跟著自己的姿勢；每個角色依待機姿勢高度統一縮放，腳底中央為錨點。
- 解析度：全部以 2 倍存（Pixi 紋理 resolution 2、線性取樣），角色圖集量化成 256 色含半透明（1.1 MB → 245 KB）。
- 近景牆帶與地面分界（`NEAR_CUT`）人工量；墮仙台生成圖上方是白底，從 30% 處開始取。
- 舊的像素版場景（`game/src/assets/scene/`）已移除；像素版角色分件 atlas 保留為賽璐璐圖集載入失敗時的備援。
- 台灣禁忌（`RULE-ART-TW-TABOO`）逐張檢查：沒有廟宇、神像、香爐、符咒、八卦、道袍、光環、蓮座；殿內布幡無字；石燈未點火；斷碑無字；寶箱開啟是空的、沒有錢幣；墮仙沒有光環與金光。枯井、迴廊遠景各有一個小月亮（冷白灰，面積很小，不與白光預警混淆）。

### 補走路幀（2026-11-27）

| 日期 | job | 張 | 內容 | 採用 |
|---|---|---|---|---|
| 2026-11-27 | picanywhere `job_20261127-084803_658` | 8 | 8 角色 12 姿勢表（兩列各 6，含走路 4 格循環），存成 `cel_chr_<角色>_t2.png` | 全部採用，取代 t1 |

- 另外單獨生成走路圖會跟原姿勢表的人物細節對不上，所以整張重生成：同一張圖裡 12 個姿勢一致。
- `cel_build.py` 先依每列不透明像素密度切成上下兩列，再各切 6 格；依待機高度統一縮放。蠱母的配色比 t1 暗一些（苔綠披肩、灰紫皮膚），仍在規格色內。
