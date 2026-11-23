#!/usr/bin/env bash
# usage: codex_boss.sh   (run from SkyTalon/). One codex image job per boss sheet, in parallel; PNGs copied to art/raw/boss/.
set -u
DEST=art/raw/boss; mkdir -p "$DEST"
LOGDIR="$(dirname "$0")/codex_boss_logs"; mkdir -p "$LOGDIR"
REF1=art/raw/ship_heavy.jpg; REF2=art/preview/v9_bosses_x3.png

COMMON='請生成一張圖片（直接用圖片生成工具產生，不要寫程式、不要存檔、不要解說）。

共同規格：
- 16-bit 街機縱向射擊遊戲的像素畫（pixel art）戰艦素材圖。硬邊像素、有限色盤、深色描邊、左上受光右下陰影、清楚的面板線與鉚釘。不要平滑漸層、不要反鋸齒、不要光暈、不要景深。
- 正俯視（從正上方垂直往下看），艦首朝畫面下方，左右對稱。
- 筆觸與細節密度對齊附圖一（玩家機的風格參考：機甲式外掛裝甲、推進莢艙、感測燈）。附圖二是目前遊戲裡的簡化版造型，只當構圖與配色參考，請畫得更精緻、更有份量。
- 這是戰艦，不是人物：不畫人臉、人體、宗教符號。圖裡不要任何文字、標籤、數字、邊框。
- 背景是純色 #00ff00，沒有陰影、沒有地面、沒有特效。
'
STAGES='
構圖：同一艘戰艦的三個損壞階段由左到右並排，等比例、垂直置中、彼此不重疊、之間留空。
- 左：外甲完整。裝甲板齊全，砲管與燈點都在。
- 中：外甲被打掉。外掛部分只剩同色系的桁架骨架與外露管線，艦身留著，有彈孔、焦痕與餘燼。
- 右：只剩核心。核心與周圍一小塊撕裂的艦身，寬度約為左邊的六成，邊緣是燒紅的金屬，核心發亮。
圖片比例橫向 3:2。
'
job() {  # name, body
  local name=$1 body=$2 log="$LOGDIR/$1.log"
  printf '%s\n%s\n' "$COMMON" "$body" | codex exec --skip-git-repo-check --sandbox read-only -i "$REF1" -i "$REF2" - > "$log" 2>&1
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

job boss_oceanus "主體：海神艦「俄刻阿諾斯」（附圖二第一列）。配色深海藍 #1c4a6e、海藍 #2f7aa8、淺藍 #7fc8e0、浪白 #d8f4f4、金 #ffd24a。造型：艦首兩側一對大蟹螯、艦尾一對角、浪花捲形的側鰭且鰭緣有一道白浪、螯與鰭之間有砲管。核心是金色圓核，外面一圈水環。$STAGES" &
job boss_nyx "主體：夜之艦「倪克斯」（附圖二第二列）。配色夜黑紫 #1e1a40、靛 #3a3478、紫 #6a5fc0、星白 #f4f0c8。造型：兩片垂墜的星幕大翼（上面有星點與布料般的摺線）、上方一對深色短翼、修長的艦身。核心是艦身上一彎發亮的新月，下方一顆青色燈。$STAGES" &
job boss_eos "主體：黎明之艦「厄俄斯」（附圖二第三列）。配色玫瑰 #e8829a、深玫瑰 #b85478、番紅花橙 #ffb85a、奶油 #ffe9c0、暮紫 #7a6ac0。造型：兩側各五道玫瑰色與橙色相間的光芒組成的翼、艦身像古代戰車的車身並帶兩條護欄。核心是一個奶油色的戰車車輪（輪圈與十字輪輻），輪心發亮。$STAGES" &
job boss_atlas "主體：扛天之艦「阿特拉斯」（附圖二第四列）。配色青銅 #8a5a3a、亮銅 #c98a52、石灰藍 #5a5f78、深空藍 #1e2a5a、星白 #fff1c9。造型：一對粗壯的青銅機械臂（指尖是砲管）與厚重肩甲，從下方托著一顆巨大的天球儀。核心就是天球：深藍球面、經線與緯線、星點、銅色外環。$STAGES" &
job mids "主體：四艘中型戰艦由左到右並排，等比例、垂直置中、彼此不重疊（附圖二最左一欄由上到下的四艘）。大小約為頭目艦的六成。圖片比例橫向 2:1。
1. 「涅柔斯」：海綠 #1f6f7a、#2f9aa6、#7fd6d6。三叉戟形艦首、魚尾形艦尾、金色核心。
2. 「玻瑞阿斯」：冰藍 #3d5c8a、#6f93c4、#bfd8f2。像風標的後掠長翼、翼上導流片、翼下冰柱、青色核心。
3. 「安泰俄斯」：岩褐 #5a3d2a、#8a6142、#c49a6c 加少量苔綠。岩板重裝甲、粗壯前臂、橙色核心。
4. 「伊里斯」：紫 #4a3f7a、#7a6ac0、#c9bdf2。細長的信使艦，翼上有紅橙黃綠青五色彩虹帶，淡紫核心。" &
wait
ls -la "$DEST"
