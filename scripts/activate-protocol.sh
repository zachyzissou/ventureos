#!/usr/bin/env bash
set -euo pipefail

# activate-protocol.sh — Manually activate a personality protocol for an agent
#
# Idempotent by default: if the protocol is already active, exits 0 without changes.
#
# Usage:
#   ./activate-protocol.sh --agent <agent_id> --protocol <protocol_id> \
#     [--type base|quality_gate|agent_specific] \
#     [--trigger '<json>'] \
#     [--mission <mission_id>] \
#     [--db <path/to/ventureos-rpg.db>] \
#     [--replace]

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
AGENT_ID=""
PROTOCOL_ID=""
PROTOCOL_TYPE="quality_gate"
TRIGGER_CONDITION=""
MISSION_ID=""
REPLACE=0

usage() {
  cat >&2 <<'EOF'
activate-protocol.sh

Required:
  --agent <agent_id>
  --protocol <protocol_id>

Optional:
  --type <base|quality_gate|agent_specific>
  --trigger <json-string>
  --mission <mission_id>
  --db <db_path>
  --replace           Deactivate any currently-active instance first, then activate.

Examples:
  ./activate-protocol.sh --agent synth --protocol test_first_discipline \
    --type quality_gate --trigger '{"ci_events":5,"threshold":5}'

  ./activate-protocol.sh --agent sentinel --protocol false_positive_cooldown \
    --trigger '{"false_positive_streak":3,"window_days":30}' --replace
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT_ID="${2:-}"; shift 2;;
    --protocol) PROTOCOL_ID="${2:-}"; shift 2;;
    --type) PROTOCOL_TYPE="${2:-}"; shift 2;;
    --trigger) TRIGGER_CONDITION="${2:-}"; shift 2;;
    --mission) MISSION_ID="${2:-}"; shift 2;;
    --db) DB_PATH="${2:-}"; shift 2;;
    --replace) REPLACE=1; shift 1;;
    -h|--help) usage; exit 0;;
    *) die "Unknown arg: $1";;
  esac
done

[[ -n "$AGENT_ID" ]] || { usage; die "--agent required"; }
[[ -n "$PROTOCOL_ID" ]] || { usage; die "--protocol required"; }
[[ -f "$DB_PATH" ]] || die "DB not found: $DB_PATH"
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 not found"

# Is active?
active_cnt=$(sqlite3 "$DB_PATH" -noheader -batch "
  SELECT COUNT(*)
  FROM personality_activations
  WHERE agent_id = '$AGENT_ID'
    AND protocol_id = '$PROTOCOL_ID'
    AND deactivated_at IS NULL;
")
active_cnt="${active_cnt:-0}"

if [[ "$active_cnt" != "0" && "$REPLACE" -eq 0 ]]; then
  echo "OK: already active: $AGENT_ID → $PROTOCOL_ID" >&2
  exit 0
fi

if [[ "$REPLACE" -eq 1 ]]; then
  sqlite3 "$DB_PATH" "
    UPDATE personality_activations
    SET deactivated_at = CURRENT_TIMESTAMP
    WHERE agent_id = '$AGENT_ID'
      AND protocol_id = '$PROTOCOL_ID'
      AND deactivated_at IS NULL;
  "
fi

# Insert activation row.
# NOTE: We intentionally guard idempotency by checking active first; UNIQUE allows multiple historical activations.
# Escape single-quotes for SQL string literals.
esc() { sed "s/'/''/g"; }
TRIGGER_ESC=$(printf "%s" "$TRIGGER_CONDITION" | esc)
MISSION_ESC=$(printf "%s" "$MISSION_ID" | esc)

sqlite3 "$DB_PATH" "
  INSERT INTO personality_activations
    (agent_id, protocol_id, protocol_type, trigger_condition, mission_id, activated_at)
  VALUES
    ('$AGENT_ID', '$PROTOCOL_ID', '$PROTOCOL_TYPE',
     CASE WHEN '$TRIGGER_ESC' = '' THEN NULL ELSE '$TRIGGER_ESC' END,
     CASE WHEN '$MISSION_ESC' = '' THEN NULL ELSE '$MISSION_ESC' END,
     CURRENT_TIMESTAMP);
"

echo "OK: activated: $AGENT_ID → $PROTOCOL_ID ($PROTOCOL_TYPE)" >&2
