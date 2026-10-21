#!/usr/bin/env bash
# Usage: tools/gen_image.sh <prompt stem> [take] [-i ref.png ...]
#   e.g. tools/gen_image.sh icon_p_speed 3
# Static assets (identity sheets, icons, props, key art), same codex-image flow as gen_anim.sh:
# freeze the prompt in art/prompts/_history/static/, run codex read-only, copy PNGs from the session.
# Every PNG of the session is kept: <stem>_<take>.png, then <stem>_<take>b.png, ...
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
stem=$1; take=${2:-1}; shift $(( $# < 2 ? $# : 2 ))
PROMPT="$ROOT/art/prompts/${stem}.txt"
SNAP="$ROOT/art/prompts/_history/static/${stem}_${take}.txt"
LOG="$ROOT/art/raw/logs/${stem}_${take}.log"
[ -f "$PROMPT" ] || { echo "FAIL no prompt $PROMPT"; exit 1; }
[ -e "$SNAP" ] && { echo "FAIL take $take already exists ($SNAP); use a new take number"; exit 1; }
mkdir -p "$(dirname "$SNAP")" "$ROOT/art/raw/logs"
cp "$PROMPT" "$SNAP"
codex exec --skip-git-repo-check --sandbox read-only "$@" < "$SNAP" > "$LOG" 2>&1
SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}')
[ -z "$SID" ] && { echo "FAIL $stem: no session id ($LOG)"; exit 1; }
n=0; suffix=""
for src in "$HOME/.codex/generated_images/$SID"/*.png; do
  [ -e "$src" ] || continue
  cp "$src" "$ROOT/art/raw/${stem}_${take}${suffix}.png"; n=$((n+1))
  suffix=$(printf "\x$(printf %x $((97 + n)))")   # b, c, ...
done
[ $n -eq 0 ] && { echo "FAIL $stem: no PNG in $SID"; exit 1; }
echo "OK $stem take $take ($n image(s)) sid $SID"
