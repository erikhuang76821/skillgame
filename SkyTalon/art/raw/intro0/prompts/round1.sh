#!/usr/bin/env bash
# The game's opening (before the stage map): four keyframes (9:16), generated with Codex CLI, copied into art/raw/intro0/.
# Story (gdd/05 v8 §5): the ancient gods return to take the universe back; one planet after another goes dark; Earth
# is the last light. Ends on the title. Same style lines as leg one's cutscene (art/raw/intro/prompts/round1.sh).
set -u
STYLE='直式 9:16 手機遊戲過場分鏡，高品質細緻像素藝術（pixel art，硬邊像素、有限色盤、像素抖色），電影感構圖，整體壓暗一階不刺眼，不要任何文字、字幕、UI、浮水印、Logo；不要畫廟宇、神像、人臉或人形。'
SHIP='主角戰機：白銀色三角翼小型戰鬥機，藍色座艙，雙引擎藍色噴焰（不要寫實軍機標誌）。'
gen() {
  local name="$1" prompt="$2" LOG SID SRC n=0
  LOG=$(mktemp "${TMPDIR:-/tmp}/codex-image.XXXXXX.log")
  codex exec --skip-git-repo-check --sandbox read-only > "$LOG" 2>&1 <<PROMPT_EOF
$STYLE
$prompt
PROMPT_EOF
  SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}')
  SRC="$HOME/.codex/generated_images/$SID"
  for f in "$SRC"/*.png; do [ -e "$f" ] || continue; cp "$f" "art/raw/intro0/$name.png"; n=$((n+1)); done
  echo "$name: $n file(s) (session $SID)"
}
gen p1_gate_wakes "場景一：太陽系外緣的漆黑深空，一座巨大的古代青銅環形星門靜靜漂浮，環面刻滿幾何浮雕紋樣，佈滿星塵與冰霜；環的中心剛裂開第一道金色光縫，光芒向外滲出。遠處是一顆渺小的太陽。寧靜、神秘、壓迫的大遠景。" &
gen p2_armada "場景二：金色光芒從畫面上方湧出，一支由青銅與大理石質感巨型戰艦組成的古代艦隊（幾何稜角艦體、金色紋路，不要神殿柱式）穿越土星的光環，掠過的衛星一顆顆失去光芒變成暗紅色。宇宙廣角、斜向縱深構圖。" &
gen p3_last_light "場景三：從太空俯瞰夜面的地球，海岸城市燈火連成網，地面防空探照燈的光柱射向天空；地球周圍的太空中，遠方月球邊緣出現大片逼近的金色光點群。地球是畫面中唯一溫暖的光，四周深藍黑色宇宙。" &
gen p4_title "場景四：$SHIP 在地球大氣層邊緣的晨曦中逆光飛行，從畫面下方往上方衝去，身後拖著藍色噴焰；下方是彎曲的地平線與一道金白色日出光芒，遠處天空中隱約有古代艦隊的金色剪影。畫面上方三分之一是乾淨的深藍漸層天空（要留白放標題）。" &
wait
