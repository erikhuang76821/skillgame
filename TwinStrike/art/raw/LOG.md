# 生成紀錄

| 檔案 | prompt 快照 | 工具 / job | 狀態 | 備註 |
|---|---|---|---|---|
| cat_identity_t1a.png | [_history/hero_cat_identity_t1.txt](../prompts/_history/hero_cat_identity_t1.txt) | picanywhere `job_20261019-203943_326` #0 | 未採用 | 背景是畫出來的棋盤格（RGB，無 alpha）；`tools/dechecker.py` 去背 → `cat_identity_t1a_alpha.png` |
| cat_identity_t1b.png | 同上 | 同上 #1 | **採用**（2026-10-20）→ `cat_identity.png` | 同上 → `cat_identity_t1b_alpha.png` |
| cat_poses_t1.png | [_history/hero_cat_poses_t1.txt](../prompts/_history/hero_cat_poses_t1.txt)，附圖 `cat_identity.png` | lobster（Codex，edit 模式）`job_mvgbbqz209fc61063393a2ac` | **採用**（2026-10-21）→ `game/src/assets/cat.png` | 1254×1254 RGBA 真透明；第 1 列腳底貼齊格線、跨到下一格，不能等分切 → 切格要依連通區塊 |
| mouse_poses_t1.png | [_history/enemy_mouse_t1.txt](../prompts/_history/enemy_mouse_t1.txt)，風格附圖 `cat_identity.png` | lobster `job_mvhh4geabe6870743a626670` | **採用**（2026-10-21）→ `mouse_poses.png` | 2172×724 RGBA 真透明；hit 格的星星是分離的小塊，切格依重心歸格即可 |
| squirrel_poses_t1.png | [_history/enemy_squirrel_t1.txt](../prompts/_history/enemy_squirrel_t1.txt)，同上 | lobster `job_mvhh5ikp7b9724c0d4ad91c6` | 未採用（貼紙感不足） | 同上；漸層陰影較多、外框略細，比其他三隻少一點貼紙感 |
| tanuki_poses_t1.png | [_history/enemy_tanuki_t1.txt](../prompts/_history/enemy_tanuki_t1.txt)，同上 | lobster `job_mvhh6kps9ba5539045959671` | **採用**（2026-10-21）→ `tanuki_poses.png` | 同上；楓葉為橘紅（無綠色頭飾） |
| squirrel_poses_t2.png | [_history/enemy_squirrel_t2.txt](../prompts/_history/enemy_squirrel_t2.txt)，風格附圖 `cat_identity.png` + `mouse_poses.png` | lobster `job_mvhjf8c238b19b7283926006` | **採用**（2026-10-21）→ `squirrel_poses.png` | 2172×724 RGBA 真透明；prompt 加「粗外框、平塗、無漸層」，外框與平塗已和貓、老鼠一致 |
| bg_dojo_t1.png | [_history/bg_dojo_t1.txt](../prompts/_history/bg_dojo_t1.txt)，風格附圖 `cat_identity.png` | lobster `job_mvhk48c5f2095288f19c2fec` | **採用**（2026-10-21）→ `bg_dojo.png` → `game/src/assets/bg_dojo.webp`（41 KB） | 941×1672 RGB（9:16）；牆地交界約在 58–66% 高（規格要 70%），角色腳底在 70% 時會站在牆前約 50 px 的地板上 |
| fx_sheet_t1.png | [_history/fx_sheet_t1.txt](../prompts/_history/fx_sheet_t1.txt)，風格附圖 `cat_identity.png` | lobster `job_mvhlp48ve86e98bb21bd3997` | **採用**（2026-10-21）→ `fx_sheet.png` → `game/src/assets/fx.png`（25 KB） | 2172×724 RGBA 真透明，6 個特效順序正確；肉球衝擊線右端越過 1/6 等分線、和星星只隔約 1 px → 打包時切格要改成「依最近的大區塊歸屬」，不能等分 |
| key_art_t1.png | [_history/key_art_t1.txt](../prompts/_history/key_art_t1.txt)，附圖：貓師父、老鼠、飛鼠、狸貓、道場背景 | lobster `job_mvhp8zoea191ae10d2868c68` | 未採用（Logo 空間不足） | 1672×941（16:9）RGB；角色與定版一致、無文字；上方 20% 有燈籠與貓耳，Logo 空間偏擠；直版標題可用中央 9:16 裁切 |
| key_art_t2a.png / key_art_t2b.png | [_history/key_art_t2.txt](../prompts/_history/key_art_t2.txt)，附圖：貓師父、老鼠、飛鼠、狸貓、key_art_t1（構圖參考） | lobster `job_mvhpnxoxc065daf8a5ddbc00`（一次產出 2 張） | **t2a 採用**（2026-10-21）→ `key_art.png` → `game/src/assets/title_keyart.webp`；t2b 未採用 | 上方 25% 只剩牆面與橫樑；貓耳頂約在 31% 高；上方 25% 邊緣密度 t1 8.8% → t2a 3.8% / t2b 4.3% |
