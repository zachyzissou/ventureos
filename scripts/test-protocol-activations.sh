#!/usr/bin/env bash
set -euo pipefail

# test-protocol-activations.sh — Integration test for protocol activation engine
#
# Runs the trigger checker against:
#   (A) a temporary copy of the current RPG DB (safe, no prod mutations)
#   (B) the current RPG DB in dry-run mode (observability)
#
# Produces a Markdown report under ~/clawd/shared-context/.

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
CHECK_SCRIPT="$HOME/clawd/scripts/check-protocol-triggers.sh"
OUT_DIR="$HOME/clawd/shared-context"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
TMP_DB="/tmp/ventureos-rpg-test-$STAMP.db"
REPORT="$OUT_DIR/rpg-protocol-activation-test-report-$STAMP.md"

usage() {
  cat >&2 <<EOF
Usage:
  ./test-protocol-activations.sh [--db <path>] [--out <dir>]

Outputs:
  $REPORT
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db) DB_PATH="${2:-}"; shift 2;;
    --out) OUT_DIR="${2:-}"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; exit 2;;
  esac
done

[[ -f "$DB_PATH" ]] || { echo "ERROR: DB not found: $DB_PATH" >&2; exit 1; }
[[ -x "$CHECK_SCRIPT" ]] || { echo "ERROR: Missing script: $CHECK_SCRIPT" >&2; exit 1; }
mkdir -p "$OUT_DIR"

cp -f "$DB_PATH" "$TMP_DB"

# Run checker on temp DB (mutating temp DB)
TEMP_RUN_LOG="/tmp/protocol-test-temp-run-$STAMP.log"
"$CHECK_SCRIPT" --db "$TMP_DB" >"$TEMP_RUN_LOG" 2>&1

# Run checker on prod DB (dry-run)
PROD_DRY_LOG="/tmp/protocol-test-prod-dry-$STAMP.log"
"$CHECK_SCRIPT" --db "$DB_PATH" --dry-run >"$PROD_DRY_LOG" 2>&1

active_temp=$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM personality_activations WHERE deactivated_at IS NULL;")

{
  printf "# RPG Protocol Activation Test Report\n\n"
  printf -- "- **Generated:** %s\n" "$(date +"%Y-%m-%d %H:%M:%S %Z")"
  printf -- "- **Temp DB:** %s\n" "$TMP_DB"
  printf -- "- **Prod DB:** %s\n" "$DB_PATH"
  printf -- "- **Engine:** %s\n\n" "$CHECK_SCRIPT"

  printf "## A) Temp DB run (applies changes)\n\n"
  printf -- "**Active protocols after run:** %s\n\n" "$active_temp"

  cat <<'MD'
### Active protocols

```sql
SELECT agent_id, protocol_id, protocol_type, trigger_condition
FROM personality_activations
WHERE deactivated_at IS NULL
ORDER BY agent_id, protocol_id;
```

```text
MD
} > "$REPORT"

sqlite3 "$TMP_DB" "
  SELECT agent_id || ' → ' || protocol_id || ' (' || protocol_type || ')  ' || COALESCE(trigger_condition,'')
  FROM personality_activations
  WHERE deactivated_at IS NULL
  ORDER BY agent_id, protocol_id;
" >> "$REPORT"

cat >> "$REPORT" <<'EOF'
```

### Engine log excerpt

```text
EOF

tail -n 120 "$TEMP_RUN_LOG" >> "$REPORT"

cat >> "$REPORT" <<'EOF'
```

## B) Prod DB dry-run (no changes)

```text
EOF

tail -n 120 "$PROD_DRY_LOG" >> "$REPORT"

cat >> "$REPORT" <<'EOF'
```

## Notes

- The temp DB run validates activation/deactivation logic without mutating production.
- If you need to re-run with a clean slate in temp DB:
  - delete the temp DB and rerun this script.
EOF

echo "OK: wrote report: $REPORT" >&2
