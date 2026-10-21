#!/usr/bin/env bash
# Usage: tools/gen_anim.sh <name> <Anim> <direction> [take]
# codex-image skill: prompt from file on stdin, read-only sandbox, copy PNG from ~/.codex/generated_images/{sid}/.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
name=$1; anim=$2; dir=$3; take=${4:-1}
case $name in sasq) sheet=native_hero_1.png;; greyling) sheet=native_greyling_1.png;; esac
case $dir in down|down_right) near=down;; right) near=right;; *) near=up;; esac
imgs=(-i "$ROOT/art/raw/$sheet" -i "$ROOT/art/raw/ref/${name}_${near}.png")
if [ "$anim" = Walk ] && [ -f "$ROOT/art/raw/anim/${name}_Idle_${dir}.png" ]; then
  imgs+=(-i "$ROOT/art/raw/anim/${name}_Idle_${dir}.png")
fi
mkdir -p "$ROOT/art/raw/anim" "$ROOT/art/raw/anim/logs" "$ROOT/art/prompts/_history/anim"
LOG="$ROOT/art/raw/anim/logs/${name}_${anim}_${dir}_${take}.log"
PROMPT="$ROOT/art/prompts/anim/${name}_${anim}_${dir}.txt"
SNAP="$ROOT/art/prompts/_history/anim/${name}_${anim}_${dir}_t${take}.txt"
# Version history: freeze the exact prompt of this take (tools/prompt_ledger.py builds the ledger from these).
[ -e "$SNAP" ] && { echo "FAIL take $take already exists ($SNAP); use a new take number"; exit 1; }
cp "$PROMPT" "$SNAP"
codex exec --skip-git-repo-check --sandbox read-only "${imgs[@]}" < "$SNAP" > "$LOG" 2>&1
SID=$(grep -m1 '^session id:' "$LOG" | awk '{print $3}')
[ -z "$SID" ] && { echo "FAIL $name $anim $dir: no session id ($LOG)"; exit 1; }
n=0
for src in "$HOME/.codex/generated_images/$SID"/*.png; do
  [ -e "$src" ] || continue
  cp "$src" "$ROOT/art/raw/anim/${name}_${anim}_${dir}_t${take}.png"; n=$((n+1))
done
[ $n -eq 0 ] && { echo "FAIL $name $anim $dir: no PNG in $SID"; exit 1; }
echo "OK $name $anim $dir take $take sid $SID"
