#!/bin/bash
# validate-escalation.sh - Mark escalation as validated or false positive
# Usage: validate-escalation.sh <escalation_id> <is_valid> [validator_agent] [notes]
# Example: validate-escalation.sh 42 true verifier "Confirmed data quality issue"

set -euo pipefail

# Configuration
DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
SCRIPT_NAME="$(basename "$0")"

# Usage
usage() {
    cat <<EOF
Usage: $SCRIPT_NAME <escalation_id> <is_valid> [validator_agent] [notes]

Arguments:
  escalation_id   ID of the escalation to validate
  is_valid        true (validated) or false (false positive)
  validator_agent Who validated (default: verifier)
  notes           Optional validation notes

Examples:
  $SCRIPT_NAME 42 true verifier "Issue confirmed, fix deployed"
  $SCRIPT_NAME 43 false verifier "Could not reproduce, likely transient"
  $SCRIPT_NAME 44 true echo "Critical issue, immediate action taken"

Output:
  Validation confirmation and drift update
EOF
    exit 1
}

# Validate inputs
if [ $# -lt 2 ]; then
    echo "❌ Error: Insufficient arguments" >&2
    usage
fi

ESCALATION_ID="$1"
IS_VALID="$2"
VALIDATOR="${3:-verifier}"
NOTES="${4:-}"

# Validate boolean
if [[ ! "$IS_VALID" =~ ^(true|false|1|0)$ ]]; then
    echo "❌ Error: is_valid must be true or false" >&2
    exit 1
fi

# Normalize to 1/0
if [[ "$IS_VALID" = "true" ]] || [[ "$IS_VALID" = "1" ]]; then
    VALIDATED=1
    STATUS="validated"
else
    VALIDATED=0
    STATUS="false_positive"
fi

# Check database exists
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Error: Database not found at $DB_PATH" >&2
    exit 1
fi

# Get escalation details
ESCALATION_INFO=$(sqlite3 "$DB_PATH" <<SQL
SELECT escalated_by, escalated_to, severity, issue_description
FROM escalations
WHERE id = $ESCALATION_ID;
SQL
)

if [ -z "$ESCALATION_INFO" ]; then
    echo "❌ Error: Escalation #$ESCALATION_ID not found" >&2
    exit 1
fi

# Parse escalation info
IFS='|' read -r ESCALATOR TARGET SEVERITY DESCRIPTION <<< "$ESCALATION_INFO"

# ANTI-GAMING: Prevent self-validation
if [ "$VALIDATOR" = "$ESCALATOR" ]; then
    echo "❌ Error: Self-validation not allowed" >&2
    echo "   Escalator: $ESCALATOR" >&2
    echo "   Validator: $VALIDATOR" >&2
    echo "   Policy: Escalators cannot mark their own escalations as validated" >&2
    exit 1
fi

# ANTI-GAMING: Enforce validator allowlist
ALLOWED_VALIDATORS=("verifier" "echo")
if [[ ! " ${ALLOWED_VALIDATORS[@]} " =~ " ${VALIDATOR} " ]]; then
    echo "❌ Error: Unauthorized validator: $VALIDATOR" >&2
    echo "   Allowed validators: ${ALLOWED_VALIDATORS[*]}" >&2
    echo "   Policy: Only authorized validators can mark escalations" >&2
    exit 1
fi

# Update escalation record
sqlite3 "$DB_PATH" <<SQL
UPDATE escalations
SET validated_as_real = $VALIDATED,
    validated_at = datetime('now'),
    validated_by = '$VALIDATOR',
    metadata = json_set(
        COALESCE(metadata, '{}'),
        '$.validation_notes',
        '$(echo "$NOTES" | sed "s/'/''/g")'
    )
WHERE id = $ESCALATION_ID;
SQL

# Update interaction_logs outcome
# NOTE: Drift is NOT applied here to avoid double-application
# The daily cron job (update-khala-drift.sh) will process this interaction
# and apply drift based on the outcome field set below
sqlite3 "$DB_PATH" <<SQL
UPDATE interaction_logs
SET outcome = '$([ $VALIDATED -eq 1 ] && echo "success" || echo "failure")'
WHERE description LIKE '%Escalation #$ESCALATION_ID:%'
  AND initiator_agent = '$ESCALATOR'
  AND recipient_agent = '$TARGET'
  AND interaction_type = 'escalation';
SQL

# Drift application deferred to update-khala-drift.sh (runs daily at 06:15 CST)
# This ensures single-source-of-truth for drift calculation and prevents double-application

# Success output
echo "✅ Escalation #$ESCALATION_ID validated: $STATUS"
echo "   Escalator: $ESCALATOR → Validator: $VALIDATOR"
echo "   Severity: $SEVERITY"
echo "   Result: $([ $VALIDATED -eq 1 ] && echo '✓ Validated' || echo '✗ False Positive')"
[ -n "$NOTES" ] && echo "   Notes: $NOTES"
echo "   📊 Drift deferred: Will be applied by daily cron (update-khala-drift.sh)"

exit 0
