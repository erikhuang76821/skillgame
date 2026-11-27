---
id: KB-pixel-composer-gallery
kind: research
topic: [juice, art]
genre: ["*"]
reviewedAt: 2026-11-27
---
# 20 外部素材庫：Pixel Composer Gallery（節點式像素特效範例）

> 來源：[pixel-composer.com/gallery.html](https://pixel-composer.com/gallery.html)、[首頁](https://pixel-composer.com/)（2026-11-27 讀）。文件站 [docs.pixel-composer.com](https://docs.pixel-composer.com) 未讀，匯出格式與授權條款待補。
> 與其他頁的關係：像素特效的動態規則、節拍參數在 [18](18_pixel-vfx-codex.md)；特效規格模板在 [19](19_vfx-spec-templates.md)；生圖到 atlas 在 [06](06_art-pipeline.md)；資產登錄在 [10](10_asset-library.md)。本頁**不定門檻**。

## 1. 它是什麼
<!-- card: KB-pixel-composer-gallery.overview; topic=art; artStyle=pixel -->

- **Pixel Composer**：MakhamDev 的節點式像素特效合成工具（桌面軟體，Steam app 2299510）。300+ 節點：圖樣生成、流體模擬、剛體、回授迴圈；關鍵幀 / 曲線 / 表達式動畫；可匯入 3D 物件打光後渲染成像素。
- **Gallery**：作者自製的 **153 個專案**，單一平面格狀列表，**沒有分類或標籤**。每筆有縮圖（`thumbnail.png`，多數另有動態 `thumbnail.gif`）與一個 `.pxc` 專案檔下載（約 7–362 KB）。社群作品在 [Steam Workshop](https://steamcommunity.com/app/2299510/workshop/)。
- `.pxc` 要用 Pixel Composer 開，**不是遊戲可直接載入的格式**；遊戲要的是工具匯出的 PNG 序列 / sprite sheet（匯出規格見文件站，未讀）。
- 授權：網頁未寫 gallery 檔案的使用條款；本專案非營利，不展開授權分析，但取用的輸出仍在 `art/manifest.json` 登記來源。

## 2. 目錄：依品類整理（由名稱判斷，未逐一開檔）
<!-- card: KB-pixel-composer-gallery.catalog; topic=art,juice; artStyle=pixel -->

| 品類 | 專案名稱 | 對 skill game 的用處 |
|---|---|---|
| 爆炸 / 衝擊 | Mushroom Cloud、Black Hole、Plasma Ball | 頭目擊破、炸彈、清場 |
| 火焰 | Fire Tornado、Fire & Smoke、Spiral Fireball、Flame Path、Flame Sword Trail、Fire Wand、Rocket Thrust、Crochet Flame | 投射物、持續傷害區、推進尾焰 |
| 雷電 / 能量 | Spark Bolt、Plasma Ball、Circuit | 連鎖閃電、充能 |
| 斬擊 / 武器 | Slash、Flame Sword Trail、Sword Gen、Shield、Wooden Wand | 近戰命中、格擋、武器附魔 |
| 魔法 / 傳送 | Spiral Portal、Portal Cream、Healing FX、Ice Mage、Morphing Gem、Galaxy、Night Star | 出生點、補血、拾取光 |
| 冰 / 雪 | Icicle、Ice、SnowFlake、Snowy Day | 冰屬性、減速區 |
| 熔岩 / 液體 | Lava Floor、Lava Flow、Lava Bubble、Ocean wave、Terrain Wave、Fountain、Aqua Shots | 危險地形、背景循環 |
| 地形 / 磚 | Road Tile、Rocky Path、Dungeon Floor、Stone Wall、Cliff Face、Layered Hills、Bridge、Valley、Sewer、IsoCubes、Iso Tower | 地面拼貼、背景（對照 [11](11_terrain-style-kit.md)） |
| 生物 / 角色 | Dragon、Phoenix Feather、Boo、Tentacles、Jellyfish、Salmon、Dog Walking | 敵人參考，人形角色幾乎沒有 |
| 範例遊戲 | Top-Down Shooter | 俯視射擊的整體畫面參考 |
| 道具 / 圖示 | Potions、Armor、Barrel、Chess Pieces、Tower Badge、Rainbow Icon、Nixie | 升級卡圖示、掉落物 |

其餘是場景與食物小品（Cabin、Pie、Waffle、Toaster…），對戰鬥特效用處低。

## 3. 怎麼用：當參考，用程式重做
<!-- card: KB-pixel-composer-gallery.workflow; topic=art,juice,budget; kind=method; artStyle=pixel -->

1. **看動態縮圖找節奏**：gif 縮圖是最快的參考——看起手、峰值、收尾各佔幾格，主形狀與色階數。
2. **首選程式重做（0 bytes）**：照 [18 §3](18_pixel-vfx-codex.md) 的動態規則，寫成「時間的純函式」逐像素畫到低解析 buffer，最近鄰整數倍放大。範例在 [shared/vfx-lab](../shared/vfx-lab/README.md) 的像素戰鬥特效頁（斬擊、閃電、螺旋火球、電漿爆、火龍捲、爆炸）。
3. **要逐格手感才烘焙**：用同一支純函式離線輸出 PNG sprite strip（vfx-lab `npm run bake`），或在 Pixel Composer 開 `.pxc` 匯出序列幀；打進 atlas 後計入 `RULE-BUNDLE-SIZE`。
4. **不能照搬的**：Pixel Composer 的流體 / 剛體模擬是離線運算，遊戲內不跑；全螢幕後製效果受 `RULE-FX-FILTER`、`RULE-DRAWCALL-2D` 約束（[18 §6](18_pixel-vfx-codex.md)）。
5. 登錄：在該遊戲 `art/manifest.json` 寫來源（gallery 專案名、網址），由 `index-build` 彙整（[10](10_asset-library.md)）。

## 4. 待補
<!-- card: KB-pixel-composer-gallery.gaps; topic=art -->

- 讀 docs.pixel-composer.com：匯出格式（sprite sheet / gif / PNG 序列）、調色盤鎖定、輸出尺寸。
- 實際下載 3–5 個戰鬥類 `.pxc`（Slash、Spark Bolt、Fire Tornado、Mushroom Cloud）量格數、尺寸、色數，回填 §2。
