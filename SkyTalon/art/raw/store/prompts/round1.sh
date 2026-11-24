#!/usr/bin/env bash
# Store icon and cover (lobby card / Google Play feature graphic) for 諸神黃昏：最後出擊, generated with Codex CLI.
set -u
STYLE='高品質細緻像素藝術（pixel art，硬邊像素、有限色盤、像素抖色），遊戲商店主視覺，色彩飽和、對比清楚，不要任何文字、字母、數字、UI、浮水印、Logo；不要畫廟宇、神像、人臉或人形。'
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
  for f in "$SRC"/*.png; do [ -e "$f" ] || continue; cp "$f" "art/raw/store/$name.png"; n=$((n+1)); done
  echo "$name: $n file(s) (session $SID)"
}
gen icon "正方形 1:1 的 App 圖示。$SHIP 機頭朝右上斜 45 度衝出，佔畫面約七成、輪廓完整不被裁切，機身邊緣有亮白描邊讓小尺寸也看得清楚；背景是深藍到紫色的太空，後方一輪巨大的金色日蝕光環（像眾神之眼），光環外緣迸出金色光芒，戰機前方有幾道金色敵彈擦身而過。構圖簡潔、主體置中、四周留一點邊。" &
gen cover "橫式 2:1 寬幅主視覺（之後會裁成 1024×500）。左側三分之二：$SHIP 從地球大氣層邊緣朝右上方衝刺，身後拖著藍色噴焰與白色氣流，戰機完整入鏡、位於畫面左下到中間；右側與上方：巨大的金色古代眾神艦隊（青銅與大理石質感、幾何稜角艦體，不要神殿柱式）從裂開的天空金光中壓下來，金色彈幕成弧線飛來。下方是彎曲的地平線與晨曦。畫面上方中間留一塊較乾淨的深藍天空放標題。電影感、史詩、壓迫但有希望。" &
wait
