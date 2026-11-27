#!/usr/bin/env bash
# Generate one cel image with the local Codex CLI and copy it to art/raw/cel_<name>_<tag>.png (see the codex-image skill).
# Usage: bash BladeOath/art/tools/codex_gen.sh <name> [tag=t1]
set -euo pipefail
NAME=$1; TAG=${2:-t1}
HERE=$(cd "$(dirname "$0")" && pwd); ART=$(dirname "$HERE")
LOG=$(mktemp "${TMPDIR:-/tmp}/codex-image.XXXXXX.log")
{ echo "Generate exactly one image with your image generation tool. Do not write any files and do not run shell commands; just generate the image."; echo; python "$HERE/cel_prompts.py" "$NAME"; } \
  | codex exec --skip-git-repo-check --sandbox read-only > "$LOG" 2>&1
SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}')
[ -z "$SID" ] && { echo "FAIL $NAME: no session id ($LOG)"; exit 1; }
SRC="$HOME/.codex/generated_images/$SID"
n=0
for src in "$SRC"/*.png; do
  [ -e "$src" ] || continue
  if [ "$n" -eq 0 ]; then cp "$src" "$ART/raw/cel_${NAME}_${TAG}.png"; else cp "$src" "$ART/raw/cel_${NAME}_${TAG}_$n.png"; fi
  n=$((n + 1))
done
[ "$n" -eq 0 ] && { echo "FAIL $NAME: no PNG in $SRC ($LOG)"; exit 1; }
echo "OK $NAME session=$SID files=$n"
