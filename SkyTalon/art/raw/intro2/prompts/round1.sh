#!/usr/bin/env bash
# Leg two's cutscene ("反攻內圈"): four keyframes bridging from leg one. Story: Atlas falls in orbit at the end of leg
# one and the vanguard pulls back; the moon has become the gods' forward base (Selene); Earth gathers its last fleet
# and turns to attack, heading for the moon, then Mercury and Venus. Art rules (art/README.md): ships only, never
# statues, faces, human forms, halos or temples.
set -u
STYLE='直式 9:16 手機遊戲過場分鏡，高品質細緻像素藝術（pixel art，硬邊像素、有限色盤、像素抖色），電影感構圖，整體壓暗一階不刺眼，不要任何文字、字幕、UI、浮水印、Logo；不要神殿、柱廊、雕像、人臉、人形、光環。'
SHIP='主角戰機：白銀色三角翼小型戰鬥機，藍色座艙，雙引擎藍色噴焰。'
gen() {
  local name="$1" prompt="$2" LOG SID n=0
  LOG=$(mktemp "${TMPDIR:-/tmp}/codex-image.XXXXXX.log")
  codex exec --skip-git-repo-check --sandbox read-only > "$LOG" 2>&1 <<PROMPT_EOF
$STYLE
$prompt
PROMPT_EOF
  SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}')
  for f in "$HOME/.codex/generated_images/$SID"/*.png; do [ -e "$f" ] || continue; cp "$f" "art/raw/intro2/$name.png"; n=$((n+1)); done
  echo "$name: $n file(s) (session $SID)"
}
gen s1_atlas_falls "場景一：地球軌道上，下方是藍色的地球弧面與雲層；一艘扛著巨大天球的青銅巨艦（雙臂托著一顆有經緯線與黃道環的深藍天球）正在斷裂爆炸，天球碎成發光的碎片四散；其他青銅色古代戰艦拖著火焰撤退、遠離地球。前景是$SHIP 的剪影從爆炸光芒前飛過。宇宙背景深藍紫、繁星。" &
gen s2_moon_base "場景二：月球表面與地平線，灰色月塵、環形山；月面上被改造成巨大的銀白色前進基地：新月形的船塢、弧形的銀色裝甲塔與發著冷白光的能量環，停泊著數艘新月與弓形外型的銀色戰艦（不要建築神殿或柱子）；天空中是遠方藍色的地球。冷色調、壓迫感。" &
gen s3_fleet_gathers "場景三：地球軌道上的人類反攻艦隊集結：數艘灰色厚重的運輸母艦與護衛艦排成陣列，艦身亮著藍白色航行燈，許多白銀三角翼小戰機從母艦起飛排成編隊；下方是夜面的地球，城市燈火稀疏、有些地區仍在燃燒。整齊、決意的氣氛，俯視斜角。" &
gen s4_to_the_moon "場景四：$SHIP 帶著一隊同型僚機高速飛向畫面上方巨大的灰白月球，月面上那座銀白色基地閃著冷光；遠方深空中依稀可見水星與金星兩個亮點。戰機拖著藍色噴焰，畫面下方三分之一，動態感強烈的斜角構圖。" &
wait
