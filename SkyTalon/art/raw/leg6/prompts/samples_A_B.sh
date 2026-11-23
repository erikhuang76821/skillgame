#!/usr/bin/env bash
# run from SkyTalon/. Two sample sheets of the leg-six final boss (tyrannosaur with a Chaos fragment): A top-down long body, B frontal bust.
set -u
DEST=art/raw/leg6_samples; mkdir -p "$DEST"
LOGDIR="$(dirname "$0")/codex_leg6_logs"; mkdir -p "$LOGDIR"
REF_TREX="${SHMUP_PACK:?set SHMUP_PACK to the shmup-bosses-3phase folder}/08_tyrannosaurus_暴龍/phase1_intact.jpg"
REF_SHIP=art/raw/boss/big_oceanus.png
COMMON='請生成一張圖片（直接用圖片生成工具產生，不要寫程式、不要存檔、不要解說）。

主體：縱向卷軸射擊遊戲的最終頭目，一隻被神祕碎片附身的暴龍。黑曜石色的鱗甲、蒼白的巨大骨質外甲，身上嵌著一塊「黑紫色帶銳利白邊」的發光碎片，是全身唯一的高飽和顏色，也是玩家唯一能打的弱點。

共同規格：
- 16-bit 街機射擊遊戲的像素畫（pixel art）。硬邊像素、有限色盤、深色描邊、左上受光右下濃陰影。不要平滑漸層、不要反鋸齒、不要景深。
- 身體是低飽和的黑曜石灰與骨白，大明暗對比；只有碎片與它的裂紋是高飽和的黑紫加白邊。發光不要太亮、不要大片光暈。
- 圖裡不要任何文字、字母、數字、記號、邊框。
- 背景整張是純色 #00ff00，沒有陰影、沒有地面、沒有特效。

三個損壞階段由左到右並排，同樣大小、頂端對齊、彼此不重疊、之間留空，三個都完整入鏡：
- 左：外甲完整。骨質外甲齊全，碎片只在一個部位穩定發光。
- 中：外甲裂開並剝落一部分，黑紫白邊的裂紋從碎片往全身擴散，發光面積變大。輪廓與左邊一致。
- 右：外甲全部炸裂，碎甲懸浮環繞，露出發光的骨骼與暴走的核心（中心極黑、外圈純白的小型黑洞）。
圖片比例橫向 3:2。
'
job() {
  local name=$1 body=$2 log="$LOGDIR/$1.log"; shift 2
  printf '%s\n%s\n' "$COMMON" "$body" | codex exec --skip-git-repo-check --sandbox read-only "$@" - > "$log" 2>&1
  local sid; sid=$(grep -m1 '^session id:' "$log" | awk '{print $3}')
  [ -z "$sid" ] && { echo "$name: no session id (see $log)"; return 1; }
  local n=0
  for src in "$HOME/.codex/generated_images/$sid"/*.png; do
    [ -e "$src" ] || continue
    n=$((n + 1)); cp "$src" "$DEST/$name$([ $n -gt 1 ] && echo _$n).png"
  done
  [ "$n" -eq 0 ] && { echo "$name: no PNG in session $sid"; return 1; }
  echo "$name: $n png"
}
job A_topdown "視角 A：正俯視，從正上方垂直往下看這隻暴龍的背部。牠是比畫面大得多的巨獸，身體縱長（長寬比約 1:2），頭朝畫面下方。下半段是玩家平常看到的部分：頭頂、張開的上下顎、兩隻往前伸的短前肢與爪、寬闊的肩與骨質肩甲；碎片嵌在兩肩之間的背脊上，從上方看得很清楚，放在離吻端約四分之一身長的位置。上半段是背、後腿與往畫面上方延伸的長尾。看不到臉的正面，看到的是頭頂與背。附圖一只當配色與質感參考（不要照它的正面構圖），附圖二是構圖參考（巨大的長條形頭目、頭朝下、弱點在前段）。" -i "$REF_TREX" -i "$REF_SHIP" &
job B_frontal "視角 B：正面半身像，暴龍面向鏡頭、從畫面上緣探出上半身往下壓。看得到臉、張開的嘴與牙、兩側的骨質肩甲、兩隻前肢與爪、肋骨，碎片嵌在胸口正中央。構圖與質感照附圖，但畫得更精緻，並改成上面規定的純綠背景。" -i "$REF_TREX" &
wait
ls "$DEST"
