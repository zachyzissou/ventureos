#!/usr/bin/env bash
# One-command rollback wrapper for last known good deployment state.
# Milestone M5 (#288): Deployment Safety

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$REPO_ROOT/runtime/deploy-state.json"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage: ./scripts/rollback-last-known-good.sh [--clean]

Wraps:
  ./scripts/deploy.sh rollback [--clean]
EOF
  exit 0
fi

if [[ ! -f "$STATE_FILE" ]]; then
  echo "WARN: No deploy state file at $STATE_FILE" >&2
  echo "INFO: Proceeding with rollback command anyway." >&2
fi

"$SCRIPT_DIR/deploy.sh" rollback "$@"
