#!/usr/bin/env bash
set -euo pipefail

SRC="${1:-$HOME/.claude/skills/dingjie-baodeng-lun}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$(cd "$HERE/.." && pwd)/content"

if [ ! -f "$SRC/SKILL.md" ]; then
  echo "找不到 skill 目录：$SRC" >&2
  exit 1
fi

mkdir -p "$DEST"
cp -R "$SRC"/. "$DEST"/
node "$HERE/build-kb.mjs"
echo "[sync] 已同步 $SRC -> content/，并重新生成 data/kb.js"
