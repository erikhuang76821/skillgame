#!/usr/bin/env bash
# Scene three again: in round 1 the fighters read as flying INTO the carrier. They must launch out of it, away.
LOG=$(mktemp "${TMPDIR:-/tmp}/codex-image.XXXXXX.log")
codex exec --skip-git-repo-check --sandbox read-only > "$LOG" 2>&1 <<'PROMPT_EOF'
直式 9:16 手機遊戲過場分鏡，高品質細緻像素藝術（pixel art，硬邊像素、有限色盤、像素抖色），電影感構圖，整體壓暗一階不刺眼，不要任何文字、字幕、UI、浮水印、Logo；不要神殿、柱廊、雕像、人臉、人形、光環。
場景三：地球軌道上人類反攻艦隊集結。畫面下方是夜面的地球，城市燈火稀疏、有些地區仍在燃燒。畫面中段偏下是一艘灰色厚重的運輸母艦，艦首朝向畫面上方，前端的發射口打開。許多白銀三角翼小戰機正從母艦前端的發射口「起飛離開」，全部機頭朝向畫面正上方、往上方飛遠，機尾拖著藍色噴焰指向下方的母艦（飛離母艦，不是飛進去）；越上方的戰機越小，排成往上延伸的編隊。兩側有幾艘護衛艦同樣朝上航行。整齊、決意、出發的氣氛。
PROMPT_EOF
SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}'); n=0
mkdir -p art/raw/intro2/alt
[ -e art/raw/intro2/s3_fleet_gathers.png ] && mv art/raw/intro2/s3_fleet_gathers.png art/raw/intro2/alt/s3_round1_into_carrier.png
for f in "$HOME/.codex/generated_images/$SID"/*.png; do [ -e "$f" ] || continue; cp "$f" art/raw/intro2/s3_fleet_gathers.png; n=$((n+1)); done
echo "s3 round2: $n (session $SID)"
