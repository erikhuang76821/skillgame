#!/usr/bin/env bash
# Legs three to six's cutscenes: four keyframes each, each leg picking up where the last one ended (story: gdd/05 v8 §5
# route map, gdd/13, gdd/12 §2). Art rules (art/README.md): ships and creatures only, never statues, faces, human
# forms, halos or temples. One leg at a time, four images in parallel.
set -u
STYLE='直式 9:16 手機遊戲過場分鏡，高品質細緻像素藝術（pixel art，硬邊像素、有限色盤、像素抖色），電影感構圖，整體壓暗一階不刺眼，不要任何文字、字幕、UI、浮水印、Logo；不要神殿、柱廊、雕像、人臉、人形、光環。'
SHIP='主角戰機：白銀色三角翼小型戰鬥機，藍色座艙，雙引擎藍色噴焰'
gen() {
  local dir="$1" name="$2" prompt="$3" LOG SID n=0
  mkdir -p "art/raw/$dir"
  LOG=$(mktemp "${TMPDIR:-/tmp}/codex-image.XXXXXX.log")
  codex exec --skip-git-repo-check --sandbox read-only > "$LOG" 2>&1 <<PROMPT_EOF
$STYLE
$prompt
PROMPT_EOF
  SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}')
  for f in "$HOME/.codex/generated_images/$SID"/*.png; do [ -e "$f" ] || continue; cp "$f" "art/raw/$dir/$name.png"; n=$((n+1)); done
  echo "$dir/$name: $n (session $SID)"
}
# leg three: from the ruined Earth (Nemesis down) out to Mars and Jupiter
gen intro3 s1_inner_retaken "場景一：黎明的地球廢墟城市，倒塌的高樓與焦黑的街道，一艘墜毀的巨大青銅古代戰艦斜插在城市中央冒著煙；天空放晴，一隊$SHIP 編隊從廢墟上空低飛掠過，朝向天空。希望重生的氣氛。" &
gen intro3 s2_mars_twins "場景二：火星的紅色沙漠與峽谷，紅褐色天空中兩艘外型對稱、一紅一黑的雙子古代戰艦並排懸停，艦身有尖刺與盾形裝甲，下方集結著許多紅色小型戰艇。肅殺、戰爭氣息。" &
gen intro3 s3_jupiter_storm "場景三：從木星雲頂附近仰望，巨大的條紋雲帶與大紅斑翻湧，雷電在雲層間閃爍；雲層深處浮現幾艘巨大的古代巨神戰艦剪影（厚重裝甲、像山一樣龐大）。壓迫的巨大感。" &
gen intro3 s4_outer_giants "場景四：$SHIP 帶著僚機穿越小行星帶，高速飛向畫面上方遠處巨大的木星與帶環的土星；噴焰拖曳，岩塊從身旁掠過。動態斜角構圖，戰機在畫面下方三分之一。" &
wait
# leg four: from Saturn (Janus down) to the underworld's edge
gen intro4 s1_rings_fall "場景一：土星與巨大的光環，一艘有兩張相反朝向艦首的古代雙面戰艦在光環上斷裂沉沒，碎片沿著光環散開；遠方其他古代戰艦潰散逃離。壯闊的宇宙場景。" &
gen intro4 s2_flee_to_edge "場景二：太陽系邊緣的深藍黑色宇宙，遠方是青綠色的天王星與深藍色的海王星，殘存的古代艦隊拖著微光往更深處逃去；太陽只是遠方一顆小亮星。孤寂、寒冷的氣氛。" &
gen intro4 s3_styx "場景三：冥王星旁的深空，一條由發光的灰藍色霧氣組成的冥河在太空中流淌、蜿蜒；河上漂著一艘細長、船首掛著提燈的古代渡船戰艦；兩岸是冰冷的岩塊與冰晶。陰森、神秘。" &
gen intro4 s4_into_the_dark "場景四：$SHIP 帶著僚機俯衝穿過冰冷的灰藍色霧氣，飛向畫面上方遠處的冥王星與那條發光的冥河；噴焰在霧中拉出藍色光痕。動態斜角構圖，戰機在畫面下方三分之一。" &
wait
# leg five: from the Styx back to the sun, and the black hole behind it
gen intro5 s1_styx_breaks "場景一：深空中發光的冥河霧氣斷裂、潰散成無數光點，一艘巨大的冥河守衛古代戰艦在河中崩解；遠方太陽的方向亮起一道刺眼的光。轉折、壯烈。" &
gen intro5 s2_sun_fire "場景二：近距離的太陽表面，日冕與日珥翻湧成一片火海，巨大的弧形日珥拱起；火海前方懸停著幾艘金色、輪輻狀與日輪外型的古代太陽戰艦。整體壓暗一階但仍熾熱。" &
gen intro5 s3_black_hole "場景三：太陽的背後，宇宙空間扭曲，一個巨大的黑洞睜開，四周是發光的橘白色吸積盤與被拉長的星光弧線，黑洞像一隻眼睛；前景是太陽邊緣的剪影。神秘、不祥。" &
gen intro5 s4_into_the_glare "場景四：$SHIP 帶著僚機迎著強烈的太陽光芒飛向畫面上方的太陽，戰機的輪廓被逆光勾出亮邊，噴焰拖曳；遠方隱約看得到黑洞的暗影。動態斜角構圖，戰機在畫面下方三分之一。" &
wait
# leg six: Chaos breaks, the black hole throws the ship into the past
gen intro6 s1_chaos_breaks "場景一：巨大黑洞前，一團由扭曲黑紫色裝甲組成的混沌古代戰艦碎裂，碎片連同其他眾神艦隊的殘骸被吸進黑洞的吸積盤，拉成發光的漩渦。宇宙災難感。" &
gen intro6 s2_time_warp "場景二：$SHIP 被捲進一條發光的時空隧道，隧道壁是旋轉的藍紫色光環與破碎的星光，四周飄著發光的金色碎片；戰機在畫面中央、略微失控地翻轉。迷幻、速度感。" &
gen intro6 s3_mesozoic "場景三：一億年前的史前地球，遠方噴發的火山、蕨類與巨木林、蜿蜒的河流；幾隻巨大的恐龍（暴龍、蛇頸龍、翼龍）身上嵌著發著金光的金屬碎片；天空中有一道剛撕開的發光裂縫。原始、壯闊。" &
gen intro6 s4_prehistoric_sortie "場景四：$SHIP 從天空的發光裂縫中衝出，俯衝飛向下方的三疊紀裂谷與火山平原，幾隻翼龍在旁邊飛；噴焰拖曳。動態斜角構圖，戰機在畫面下方三分之一。" &
wait
