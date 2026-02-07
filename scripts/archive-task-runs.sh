#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="$HOME/clawd/runtime/logs/task_runs"
ARCHIVE_DIR="$HOME/clawd/archives/$(date +%Y-%m)/task_runs"

mkdir -p "$ARCHIVE_DIR"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "NO_TASK_RUN_DIR"; exit 0
fi

# Move JSONL files older than 30 days into monthly archive dir
find "$SRC_DIR" -maxdepth 1 -name '*.jsonl' -mtime +30 -print0 | while IFS= read -r -d '' file; do
  mv "$file" "$ARCHIVE_DIR/"
  echo "Archived: $file"
done

# Keep state.json in place

echo "ARCHIVE_OK: $ARCHIVE_DIR"
