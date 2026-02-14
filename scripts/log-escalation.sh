#!/bin/bash
# log-escalation.sh - Log escalation to RPG database
# Usage: log-escalation.sh <escalator> <target> <severity> <reason> [metadata_json]

set -euo pipefail

# Configuration
DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
SCRIPT_NAME="$(basename "$0")"

# Severity values
VALID_SEVERITIES=("critical" "high" "medium" "low" "informational")

# Usage
usage() {
    cat <<'EOF'
Usage: log-escalation.sh <escalator> <target> <severity> <reason> [metadata_json]

Arguments:
  escalator      Agent escalating the issue (e.g., sentinel)
  target         Agent receiving the escalation (e.g., verifier, echo)
  severity       One of: critical, high, medium, low, informational
  reason         Description of the issue (quoted string)
  metadata_json  Optional JSON metadata (default: {})

Severity Mapping:
  critical       = P0 (system down, user-facing impact)
  high           = P1 (significant degradation, multiple systems)
  medium         = P2 (notable but contained)
  low            = P3 (minor issue, low urgency)
  informational  = FYI (no action required, excluded from signal ratio)

Examples:
  log-escalation.sh sentinel verifier high "Memory extraction failed validation"
  log-escalation.sh sentinel echo critical "API latency >10s" '{"p95_latency":12.3}'
  log-escalation.sh sentinel verifier informational "Config drift detected" '{"preventive":true}'

Output:
  Escalation ID on success, error message on failure
EOF
    exit 1
}

# Validate inputs
if [ $# -lt 4 ]; then
    echo "❌ Error: Insufficient arguments" >&2
    usage
fi

ESCALATOR="$1"
TARGET="$2"
SEVERITY="$3"
REASON="$4"
if [ -n "${5:-}" ]; then
    METADATA="$5"
else
    METADATA="{}"
fi

# Validate severity
if [[ ! " ${VALID_SEVERITIES[@]} " =~ " ${SEVERITY} " ]]; then
    echo "❌ Error: Invalid severity '$SEVERITY'. Must be one of: ${VALID_SEVERITIES[*]}" >&2
    exit 1
fi

# Validate metadata is valid JSON
if ! echo "$METADATA" | jq empty 2>/dev/null; then
    echo "❌ Error: Invalid JSON in metadata parameter" >&2
    exit 1
fi

# Check database exists
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Error: Database not found at $DB_PATH" >&2
    echo "   Run: ~/clawd/scripts/init-rpg-database.sh" >&2
    exit 1
fi

# Escape single quotes for SQL
REASON_ESC=$(echo "$REASON" | sed "s/'/''/g")
METADATA_ESC=$(echo "$METADATA" | sed "s/'/''/g")

# Set severity value (empty for informational)
if [ "$SEVERITY" = "informational" ]; then
    SEVERITY_VALUE=""
else
    SEVERITY_VALUE="$SEVERITY"
fi

# Insert escalation
ESCALATION_ID=$(sqlite3 "$DB_PATH" "INSERT INTO escalations (escalated_by, escalated_to, issue_description, severity, metadata, created_at) VALUES ('$ESCALATOR', '$TARGET', '$REASON_ESC', '$SEVERITY_VALUE', '$METADATA_ESC', datetime('now')); SELECT last_insert_rowid();")

if [ -z "$ESCALATION_ID" ]; then
    echo "❌ Error: Failed to insert escalation" >&2
    exit 1
fi

# Log to interaction_logs as well (for drift tracking)
DESC_SHORT=$(echo "$REASON" | head -c 100 | sed "s/'/''/g")
sqlite3 "$DB_PATH" "INSERT INTO interaction_logs (initiator_agent, recipient_agent, interaction_type, outcome, description, created_at) VALUES ('$ESCALATOR', '$TARGET', 'escalation', 'neutral', 'Escalation #$ESCALATION_ID: $SEVERITY - $DESC_SHORT', datetime('now'));"

# Success output
echo "✅ Escalation logged: ID=$ESCALATION_ID"
echo "   Escalator: $ESCALATOR → Target: $TARGET"
echo "   Severity: $SEVERITY"
echo "   Reason: $REASON"

# Show next steps
if [ "$SEVERITY" = "informational" ]; then
    echo "   ℹ️  Informational escalation (no validation required)"
else
    echo "   ⏳ Pending validation (run: validate-escalation.sh $ESCALATION_ID true|false)"
fi

exit 0
