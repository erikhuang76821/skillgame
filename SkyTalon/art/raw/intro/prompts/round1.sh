#!/usr/bin/env bash
# Leg one's departure cutscene: four keyframes (9:16), generated with Codex CLI, copied into art/raw/intro/.
# Story (gdd/05 v8 §5): the ancient gods wake to rule the universe; Earth is the last bastion; leg one "守住地球".
set -u
STYLE='直式 9:16 手機遊戲過場分鏡，高品質細緻像素藝術（pixel art，硬邊像素、有限色盤、像素抖色），電影感構圖，整體壓暗一階不刺眼，不要任何文字、字幕、UI、浮水印、Logo。'
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
  for f in "$SRC"/*.png; do [ -e "$f" ] || continue; cp "$f" "art/raw/intro/$name.png"; n=$((n+1)); done
  echo "$name: $n file(s) (session $SID)"
}
gen s1_gods_descend "場景一：橘紅色黃昏的海岸線與城市，天空像玻璃一樣裂開，裂縫後透出金色神光，數艘巨大的古代神祇戰艦（青銅與大理石質感、帶有希臘神殿柱式與浮雕紋樣的艦艇外型，但不要人臉、神像、人形）從雲層裂縫中緩緩降下，艦影籠罩海面。遠景、仰望構圖，氣勢壓迫。" &
gen s2_last_bastion "場景二：夜色降臨的海岸防線，海平線上升起一道比山還高的巨浪牆，浪頭泛著神光；岸邊的防禦砲台與城市燈火一排排熄滅，只剩少數紅色警示燈。中景，畫面下方是陰暗的海岸與防波堤，氣氛絕望但仍有反擊的火光。" &
gen s3_hangar "場景三：臨海的地下機庫內部，長長的發射軌道一路延伸向遠處明亮的出口，兩側亮著一排藍白色誘導燈；$SHIP 停在發射軌道起點，從後方斜上方俯視，地勤吊臂收起，機庫昏暗、蒸氣瀰漫。" &
gen s4_launch "場景四：$SHIP 從海岸峭壁下的機庫出口高速衝出，拖著藍色噴焰與白色氣流，衝向橘紅色黃昏的天空與雲層；遠方天空中看得見降臨的巨大古代戰艦剪影。動態感強烈的斜角構圖，戰機在畫面下方三分之一處。" &
wait
