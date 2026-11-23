#!/usr/bin/env bash
# run from SkyTalon/. Second round of the leg-six bosses: round one drew all four as the same tyrannosaur recoloured,
# with the fragment on the back. Style reference is now a finished mid-boss (fragment on the head), not the T-rex sample.
set -u
DEST=art/raw/leg6; mkdir -p "$DEST"
LOGDIR="$(dirname "$0")/codex_leg6_boss2_logs"; mkdir -p "$LOGDIR"
REF=art/raw/leg6/mid4_spinosaurus.png
G="${SHMUP_PACK:?set SHMUP_PACK to the shmup-bosses-3phase folder}"
COMMON='請生成一張圖片（直接用圖片生成工具產生，不要寫程式、不要存檔、不要解說）。

用途：縱向卷軸射擊遊戲的大頭目素材，一隻被神祕發光碎片附身的史前巨獸，比畫面大得多。

最重要的要求：**這隻動物的身體構造必須是下面指定的那個物種，一眼認得出來**。不要畫成暴龍或一般的獸腳類恐龍。附圖一只是筆觸、配色方式與「碎片在頭頂」的參考（那是另一種動物），不要照它的身體形狀。附圖二是這個物種的配色與特徵參考（不要照它的正面半身構圖）。

構圖：
- 身體是從正上方看的背部，縱長，頭朝畫面下方，尾巴往畫面上方延伸。
- 頭往後仰、朝鏡頭咆哮，看得到雙眼、大張的嘴與牙。
- **核心碎片嵌在頭頂正中央的額頭上**，是一顆菱形的發光晶體，從正面與上方都看得很清楚。背上不要另外放一顆晶體。

規格：
- 16-bit 街機射擊遊戲的像素畫。硬邊像素、有限色盤、深色描邊、左上受光右下濃陰影。不要平滑漸層、不要反鋸齒、不要景深。
- 身體是低飽和的顏色，外甲是骨白或淺岩色，皮膚是深色，大明暗對比。全身只有一種高飽和的發光色（下面指定），用在頭頂的碎片與身上那一個發光部位。發光不要太亮、不要大片光暈。
- 圖裡不要任何文字、字母、數字、記號、邊框。
- 背景整張是純色 #00ff00，沒有陰影、沒有地面、沒有霧、沒有光暈、沒有特效。

三個損壞階段由左到右並排，同樣大小、頂端對齊、彼此不重疊、之間留空，三個都完整入鏡：
- 左：外甲完整。只有頭頂的碎片與那一個發光部位穩定發光。
- 中：外甲裂開並剝落一部分，發光色的裂紋從頭頂的碎片往全身擴散。輪廓與左邊一致。
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
job boss1_plateosaurus "$G/02_plateosaurus_板龍/phase1_intact.jpg" "物種：板龍，早期的長頸蜥腳形類。特徵：**非常長的脖子**往前（往畫面下方）伸出去，佔全長的三分之一以上，脖子末端是一顆相對小的頭；寬厚的肩與桶狀的身體；粗壯的前肢有大拇指爪；長尾。牙齒是小而密的葉狀齒，不是大獠牙。外甲是象牙灰與古銅色。發光色：玫瑰金。身上的發光部位：整條長頸背面一節一節的光管，從肩一路排到頭後方。" &
job boss2_diplodocus "$G/04_diplodocus_梁龍/phase1_intact.jpg" "物種：梁龍，巨大的蜥腳類。特徵：**巨大的橢圓形桶狀身體**、四條柱子般的粗腿從身體兩側伸出、**長脖子**往前（往畫面下方）伸出去、頭很小而且扁長（像馬臉，釘狀的小牙）；**極長的鞭狀尾巴**從身體後方往上延伸再甩向一側。外甲是風化的青銅色石板。發光色：銅綠。身上的發光部位：尾巴末端的一圈像齒輪的光環。" &
job boss3_mosasaurus "$G/06_mosasaurus_滄龍/phase1_intact.jpg" "物種：滄龍，巨大的海生爬行類。特徵：**沒有腳、沒有爪**；身體是流線形像巨大的蜥蜴加鯨魚，兩側是**四片槳狀的鰭肢**（前面一對大、後面一對小）；長而尖的鱷魚般的雙顎，嘴裡有成排的圓錐尖牙；尾巴末端是**上下葉的尾鰭**。皮膚是深海藏青色的細鱗，背上有淺色的骨板。發光色：深青。身上的發光部位：下顎內側、口腔與鰓裂。" &
job boss4_tyrannosaurus "$G/08_tyrannosaurus_暴龍/phase1_intact.jpg" "物種：暴龍（最終頭目）。特徵：**巨大厚重的頭骨**、粗短的脖子、**很小的兩指前肢**貼在胸前兩側、強壯的後腿、粗長的尾巴。黑曜石色鱗甲、蒼白的巨大骨質肩甲。發光色：黑紫帶銳利的白邊。身上的發光部位：背脊上一道裂縫。右邊那一階段，頭頂的碎片變成中心極黑、外圈純白的小型黑洞。" &
wait
ls "$DEST"
