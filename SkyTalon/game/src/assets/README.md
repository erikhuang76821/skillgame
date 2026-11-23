# assets

本作沒有圖檔與音檔，這個資料夾刻意是空的。

- 地表：`../render/ground.js`（片段 shader）
- 機體、敵機、子彈、特效：`../render/atlas.js`（開機時用程式畫成一張 atlas）
- 音效：`../audio/sfx.js`（Web Audio 合成）

資產清單與登錄：`SkyTalon/art/manifest.json`。之後若加入圖檔或音檔，放在這裡並登錄到 manifest（`RULE-ASSET-REGISTER`）。
