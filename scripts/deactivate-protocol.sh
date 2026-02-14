#!/usr/bin/env bash
set -euo pipefail

# deactivate-protocol.sh — Manually deactivate an active personality protocol for an agent
#
# Idempotent: if the protocol is not active, exits 0 without changes.
#
# Usage:
#   ./deactivate-protocol.sh --agent <agent_id> --protocol <protocol_id> [--db <db_path>]

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
AGENT_ID=""
PROTOCOL_ID=""

usage() {
  cat >&2 <<'EOF'
deactivate-protocol.sh

Required:
  --agent <agent_id>
  --protocol <protocol_id>

Optional:
  --db <db_path>

Example:
  ./deactivate-protocol.sh --agent synth --protocol test_first_discipline
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT_ID="${2:-}"; shift 2;;
    --protocol) PROTOCOL_ID="${2:-}"; shift 2;;
    --db) DB_PATH="${2:-}"; shift 2;;
    -h|--help) usage; exit 0;;
    *) die "Unknown arg: $1";;
  esac
done

[[ -n "$AGENT_ID" ]] || { usage; die "--agent required"; }
[[ -n "$PROTOCOL_ID" ]] || { usage; die "--protocol required"; }
[[ -f "$DB_PATH" ]] || die "DB not found: $DB_PATH"
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 not found"

active_cnt=$(sqlite3 "$DB_PATH" -noheader -batch "
  SELECT COUNT(*)
  FROM personality_activations
  WHERE agent_id = '$AGENT_ID'
    AND protocol_id = '$PROTOCOL_ID'
    AND deactivated_at IS NULL;
")
active_cnt="${active_cnt:-0}"

if [[ "$active_cnt" == "0" ]]; then
  echo "OK: already inactive: $AGENT_ID → $PROTOCOL_ID" >&2
  exit 0
fi

sqlite3 "$DB_PATH" "
  UPDATE personality_activations
  SET deactivated_at = CURRENT_TIMESTAMP
  WHERE agent_id = '$AGENT_ID'
    AND protocol_id = '$PROTOCOL_ID'
    AND deactivated_at IS NULL;
"

echo "OK: deactivated: $AGENT_ID → $PROTOCOL_ID" >&2
