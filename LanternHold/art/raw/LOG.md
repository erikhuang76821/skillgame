# LanternHold 像素組生成紀錄

工具：picanywhere（gpt-image-2）。Prompt = `art/tools/prompts.py` 的 `STYLE_LOCK` ＋ 各資產內文，原文在 `art/prompts/<name>.txt`。
背景一律純綠 `#00FF00`，由 `art/tools/slice.py` 去背（gpt-image-2 不給真 alpha）。後處理與打包：`python LanternHold/art/tools/build.py`；登錄：`python LanternHold/art/tools/manifest.py` → `node shared/tools/index-build.mjs --update-hashes`。
6 倍預覽在 `art/preview/*_x6.png`（底色 night-1）。

| 日期 | job | 張 | 內容 | 採用 |
|---|---|---|---|---|
| 2026-11-18 | `job_20261118-120547_307` | 20 | 4 友軍、8 敵人、主城、軍營 3 級、城牆 3×3、林地道具、fx 兩張、地表兩張（`*_t1.png`，順序見 `art/tools/manifest.py` 的 `ORDER1`） | 全部採用，`unit_priest_t1` 除外 |
| 2026-11-18 | `job_20261118-120851_308` | 3 | 卡片圖示 9＋9、進化 4＋資源 3 | 全部採用 |
| 2026-11-18 | `job_20261118-121508_309` | 2 | 治療者重生（`unit_priest_v2`：純青長袍＋琥珀腰帶，造型簡化） | 採用 `t2a`；`t2b` 輪廓較糊不採用 |

## 驗收與取捨

- `unit_priest_t1`：米色長袍縮到 18 px 後變成雜訊，與燈光暖色糊在一起 → 不採用（`rejected-take`）。
- 友軍原生尺寸由規格 16×18 提到內容高 20（含外框約 22–25 高）：18 px 時臉和武器讀不出來。
- 城牆「殘破」格的碎塊與主體分離，切格依「合併最小空隙到指定數量」處理，碎塊算在同一格。
- 主城光束原圖左端畫了一盞燈，打包時裁掉左 21%，只留光束本體。
- Boss attack 第 3 格含吐出的黑霧，整組 boss 幀因此寬 134 art px（右側多為透明）。
- 台灣禁忌（`RULE-ART-TW-TABOO`）：無錢幣（金幣一律金塊 / 皮袋）、無宗教符號（治療者、「祝禱」圖示是雙手捧燈）、調色盤夾在 14–244，沒有純黑 / 純白。
