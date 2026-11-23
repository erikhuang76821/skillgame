#!/usr/bin/env bash
# run from SkyTalon/. Leg six: the four bosses (three stages each) and the four mid-bosses, in the composition the user
# chose (top-down long body, head raised and roaring at the camera, the core fragment on top of the head).
set -u
DEST=art/raw/leg6; mkdir -p "$DEST"
LOGDIR="$(dirname "$0")/codex_leg6_all_logs"; mkdir -p "$LOGDIR"
REF=art/raw/leg6_samples/C_topdown_roar_2.png
G="${SHMUP_PACK:?set SHMUP_PACK to the shmup-bosses-3phase folder}"
COMMON='請生成一張圖片（直接用圖片生成工具產生，不要寫程式、不要存檔、不要解說）。

用途：縱向卷軸射擊遊戲的頭目素材，一隻被神祕發光碎片附身的史前巨獸。巨獸比畫面大得多，平常只有頭與前肢那一段從畫面上緣伸進來往下攻擊。

構圖（照附圖一的構圖與筆觸，那是同一個系列已定案的範例）：
- 身體是從正上方看的背部，縱長（長寬比約 1:2），頭朝畫面下方，尾巴往畫面上方延伸。
- 頭往後仰、朝鏡頭咆哮：看得到雙眼、鼻孔、大張的上下顎、兩排牙與口腔。頭是整張圖最搶眼的部分。前肢張開爪子往前伸，在頭的兩側。
- **核心碎片嵌在頭頂正中央**（兩眼之間偏後的額頭上），是一顆菱形的發光晶體，從正面與上方都看得很清楚。這是玩家唯一能打的弱點。
- 附圖二是這隻生物的配色與特徵參考（不要照它的正面半身構圖）。

規格：
- 16-bit 街機射擊遊戲的像素畫。硬邊像素、有限色盤、深色描邊、左上受光右下濃陰影。不要平滑漸層、不要反鋸齒、不要景深。
- 身體是低飽和的顏色，外甲是骨白或淺岩色，皮膚是深色，大明暗對比。全身只有一種高飽和的發光色（下面指定），用在頭頂的碎片與身上那一個發光部位。發光不要太亮、不要大片光暈。
- 圖裡不要任何文字、字母、數字、記號、邊框。
- 背景整張是純色 #00ff00，沒有陰影、沒有地面、沒有霧、沒有光暈、沒有特效。
'
STAGES='
三個損壞階段由左到右並排，同樣大小、頂端對齊、彼此不重疊、之間留空，三個都完整入鏡：
- 左：外甲完整。只有頭頂的碎片與那一個發光部位穩定發光。
- 中：外甲裂開並剝落一部分，發光色的裂紋從碎片往全身擴散。輪廓與左邊一致。
- 右：外甲全部炸裂，碎甲懸浮環繞，露出發光的脊椎與肋骨，頭頂的碎片暴走放大。輪廓與左邊一致。
圖片比例橫向 3:2。
'
job() {
  local name=$1 ref2=$2 body=$3 log="$LOGDIR/$1.log"
  printf '%s\n%s\n' "$COMMON" "$body" | codex exec --skip-git-repo-check --sandbox read-only -i "$REF" -i "$ref2" - > "$log" 2>&1
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
job boss1_plateosaurus "$G/02_plateosaurus_板龍/phase1_intact.jpg" "生物：板龍（長頸的早期蜥腳類）。象牙灰與古銅色外甲、寬肩、很長的脖子。發光色：玫瑰金。身上的發光部位：喉部到長頸的一節一節光管。$STAGES" &
job boss2_diplodocus "$G/04_diplodocus_梁龍/phase1_intact.jpg" "生物：梁龍（巨大的長頸長尾蜥腳類）。風化青銅色的石甲、巨大的身軀、極長的鞭狀尾巴甩向一側。發光色：銅綠。身上的發光部位：尾端的一圈時間環（像齒輪的光環）。$STAGES" &
job boss3_mosasaurus "$G/06_mosasaurus_滄龍/phase1_intact.jpg" "生物：滄龍（巨大的海生爬行類）。深海藏青色鱗甲、寬大的胸鰭在頭的兩側、槳狀的尾。發光色：深青。身上的發光部位：下顎內側與鰓裂。$STAGES" &
job boss4_tyrannosaurus "$G/08_tyrannosaurus_暴龍/phase1_intact.jpg" "生物：暴龍（最終頭目）。黑曜石色鱗甲、蒼白的巨大骨質肩甲。發光色：黑紫帶銳利的白邊。身上的發光部位：背脊兩肩之間的裂縫。右邊那一階段頭頂的碎片變成中心極黑、外圈純白的小型黑洞。$STAGES" &
wait
job mid1_postosuchus "$G/01_postosuchus_波斯特鱷/phase1_intact.jpg" "生物：波斯特鱷（像鱷魚的三疊紀掠食者，四足、體型粗壯）。深色岩石般的厚鱗甲。發光色：土橘。身上的發光部位：背脊中央一道熔岩般的光。只畫一隻、外甲完整的狀態，整隻完整入鏡，體型比大頭目小、身體比較短（長寬比約 2:3）。圖片比例直向 2:3。" &
job mid2_allosaurus "$G/03_allosaurus_異特龍/phase1_intact.jpg" "生物：異特龍（侏羅紀的大型掠食恐龍）。鋼鐵灰的戰甲覆蓋雙臂與眉骨、巨大的前爪。發光色：暗紅。身上的發光部位：兩隻前爪。只畫一隻、外甲完整的狀態，整隻完整入鏡，體型比大頭目小、身體比較短（長寬比約 2:3）。圖片比例直向 2:3。" &
job mid3_quetzalcoatlus "$G/05_quetzalcoatlus_風神翼龍/phase1_intact.jpg" "生物：風神翼龍（巨大的翼龍）。霜白色外甲、修長的喙與頭冠、展開的巨大雙翼往兩側伸。發光色：淺藍。身上的發光部位：兩片翼膜上的霜晶脈絡。只畫一隻、外甲完整的狀態，整隻完整入鏡（雙翼展開，所以比較寬，長寬比約 3:2）。圖片比例橫向 3:2。" &
job mid4_spinosaurus "$G/07_spinosaurus_棘龍/phase1_intact.jpg" "生物：棘龍（背上有巨大帆狀棘的掠食恐龍，吻部細長像鱷魚）。風暴岩灰色重甲。發光色：電紫。身上的發光部位：背上那片高聳的背帆與每一根棘。只畫一隻、外甲完整的狀態，整隻完整入鏡，體型比大頭目小、身體比較短（長寬比約 2:3）。圖片比例直向 2:3。" &
wait
ls "$DEST"
