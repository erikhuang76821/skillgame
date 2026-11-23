#!/usr/bin/env bash
# Scene one again: round 1 put temples on the ships and an acropolis on the shore, which the art rules exclude
# (art/README.md: ships, never statues, faces, human forms, halos or temples).
LOG=$(mktemp "${TMPDIR:-/tmp}/codex-image.XXXXXX.log")
codex exec --skip-git-repo-check --sandbox read-only > "$LOG" 2>&1 <<'PROMPT_EOF'
直式 9:16 手機遊戲過場分鏡，高品質細緻像素藝術（pixel art，硬邊像素、有限色盤、像素抖色），電影感構圖，整體壓暗一階不刺眼，不要任何文字、字幕、UI、浮水印、Logo。
場景一：橘紅色黃昏的現代海岸城市與港口，天空像玻璃一樣裂開，裂縫後透出金色光芒；數艘巨大的「古代眾神艦隊」戰艦從雲層裂縫中緩緩降下：青銅與暗金裝甲的流線型飛行戰艦，船身刻著希臘回紋與浪花浮雕，船首有巨大的蟹螯或三叉狀撞角，艦腹發出金色光。戰艦上不要任何建築、神殿、柱廊、雕像、人臉或人形；地面城市也不要神殿。遠景、仰望構圖，氣勢壓迫。
PROMPT_EOF
SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}'); n=0
for f in "$HOME/.codex/generated_images/$SID"/*.png; do [ -e "$f" ] || continue; cp "$f" art/raw/intro/s1_gods_descend.png; n=$((n+1)); done
echo "s1 round2: $n (session $SID)"
