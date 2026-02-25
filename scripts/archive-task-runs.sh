#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/agent-env.sh
source "$SCRIPT_DIR/lib/agent-env.sh"

AGENT_ID="$(agent_env_agent_id)"
WORKSPACE_ROOT="$(agent_env_workspace_root)"
TMPDIR="$(agent_env_tmp_dir)"
export TMPDIR

SRC_DIR="$WORKSPACE_ROOT/runtime/logs/task_runs/$AGENT_ID"
ARCHIVE_DIR="$WORKSPACE_ROOT/archives/$(date +%Y-%m)/task_runs/$AGENT_ID"

mkdir -p "$ARCHIVE_DIR"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "NO_TASK_RUN_DIR"
  exit 0
fi

# Move JSONL files older than 30 days into monthly archive dir
find "$SRC_DIR" -maxdepth 1 -name '*.jsonl' -mtime +30 -print0 | while IFS= read -r -d '' file; do
  mv "$file" "$ARCHIVE_DIR/"
  echo "Archived: $file"
done

# Keep state.json in place
echo "ARCHIVE_OK: $ARCHIVE_DIR"
