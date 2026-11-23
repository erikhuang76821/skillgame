#!/usr/bin/env bash
# run from SkyTalon/. Third sample: option A's top-down long body, with the head raised so the open jaws and teeth read.
set -u
DEST=art/raw/leg6_samples; LOG="$(dirname "$0")/codex_leg6_logs/C.log"
codex exec --skip-git-repo-check --sandbox read-only -i art/raw/leg6_samples/A_topdown.png -i art/raw/leg6_samples/B_frontal.png - > "$LOG" 2>&1 <<'PROMPT_EOF'
請生成一張圖片（直接用圖片生成工具產生，不要寫程式、不要存檔、不要解說）。

主體：縱向卷軸射擊遊戲的最終頭目，一隻被神祕碎片附身的暴龍。黑曜石色的鱗甲、蒼白的巨大骨質外甲，背上嵌著一塊「黑紫色帶銳利白邊」的發光碎片，是全身唯一的高飽和顏色。

構圖：照附圖一（俯視、縱長的身體、頭朝畫面下方、尾巴往上延伸、碎片在兩肩之間的背脊）。只改一件事：**頭往上抬、朝鏡頭仰起來咆哮**。身體仍然是從正上方看的背部，但脖子往後仰，所以看得到整張臉的正面：兩隻發白光的眼睛、鼻孔、大張的上下顎、兩排完整的牙齒與口腔內部，像附圖二那張臉的表情與魄力。頭比附圖一大約 30%，是整張圖最搶眼的部分。兩隻前肢張開爪子往前伸，在頭的兩側。碎片的位置不變，仍在頭後方兩肩之間的背脊上，沒有被頭擋住。

規格：
- 16-bit 街機射擊遊戲的像素畫。硬邊像素、有限色盤、深色描邊、左上受光右下濃陰影。不要平滑漸層、不要反鋸齒、不要景深。
- 身體是低飽和的黑曜石灰與骨白，大明暗對比；只有碎片與它的裂紋是高飽和的黑紫加白邊。發光不要太亮、不要大片光暈。
- 圖裡不要任何文字、字母、數字、記號、邊框。
- 背景整張是純色 #00ff00，沒有陰影、沒有地面、沒有霧、沒有光暈、沒有特效。

三個損壞階段由左到右並排，同樣大小、頂端對齊、彼此不重疊、之間留空，三個都完整入鏡：
- 左：外甲完整。碎片只在一個部位穩定發光。
- 中：外甲裂開並剝落一部分，黑紫白邊的裂紋從碎片往全身擴散。輪廓與左邊一致。
- 右：外甲全部炸裂，碎甲懸浮環繞，露出發光的脊椎與肋骨，碎片變成中心極黑、外圈純白的小型黑洞。
圖片比例橫向 3:2。
PROMPT_EOF
SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}')
[ -z "$SID" ] && { echo "no session id"; exit 1; }
n=0; for src in "$HOME/.codex/generated_images/$SID"/*.png; do [ -e "$src" ] || continue; n=$((n + 1)); cp "$src" "$DEST/C_topdown_roar$([ $n -gt 1 ] && echo _$n).png"; done
echo "C: $n png"
