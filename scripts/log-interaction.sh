#!/bin/bash

# log-interaction.sh - Record agent-to-agent interactions
# Usage: log-interaction.sh <agent_a> <agent_b> <type> <outcome> [metadata_json]
# 
# Types: collaboration, escalation, handoff, conflict
# Outcomes: success, failure, neutral

set -euo pipefail

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"

# Validate arguments
if [ "$#" -lt 4 ]; then
    echo "Usage: $0 <agent_a> <agent_b> <interaction_type> <outcome> [metadata_json]"
    echo ""
    echo "Types: collaboration, escalation, handoff, conflict"
    echo "Outcomes: success, failure, neutral"
    echo ""
    echo "Example:"
    echo "  $0 oracle archivist collaboration success '{\"mission_id\":\"abc-123\"}'"
    exit 1
fi

AGENT_A="$1"
AGENT_B="$2"
INTERACTION_TYPE="$3"
OUTCOME="$4"
METADATA="${5:-null}"

# Validate interaction type
case "$INTERACTION_TYPE" in
    collaboration|escalation|handoff|conflict)
        ;;
    *)
        echo "Error: Invalid interaction_type '$INTERACTION_TYPE'"
        echo "Must be one of: collaboration, escalation, handoff, conflict"
        exit 1
        ;;
esac

# Validate outcome
case "$OUTCOME" in
    success|failure|neutral)
        ;;
    *)
        echo "Error: Invalid outcome '$OUTCOME'"
        echo "Must be one of: success, failure, neutral"
        exit 1
        ;;
esac

# Parse metadata JSON if provided
MISSION_ID="null"
SESSION_ID="null"
DESCRIPTION="null"

if [ "$METADATA" != "null" ]; then
    # Extract fields from JSON using simple grep/sed (avoiding jq dependency)
    MISSION_ID=$(echo "$METADATA" | grep -o '"mission_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' || echo "null")
    SESSION_ID=$(echo "$METADATA" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' || echo "null")
    DESCRIPTION=$(echo "$METADATA" | grep -o '"description"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' || echo "null")
    
    # Fallback: if parsing failed, use raw metadata as description
    if [ "$DESCRIPTION" = "null" ] && [ "$METADATA" != "null" ]; then
        DESCRIPTION="$METADATA"
    fi
fi

# Prepare SQL values
if [ "$MISSION_ID" = "null" ]; then
    MISSION_ID_SQL="NULL"
else
    MISSION_ID_SQL="'$MISSION_ID'"
fi

if [ "$SESSION_ID" = "null" ]; then
    SESSION_ID_SQL="NULL"
else
    SESSION_ID_SQL="'$SESSION_ID'"
fi

if [ "$DESCRIPTION" = "null" ]; then
    DESCRIPTION_SQL="NULL"
else
    # Escape single quotes for SQL
    DESCRIPTION_SAFE=$(echo "$DESCRIPTION" | sed "s/'/''/g")
    DESCRIPTION_SQL="'$DESCRIPTION_SAFE'"
fi

# Insert into interaction_logs
sqlite3 "$DB_PATH" <<EOF
INSERT INTO interaction_logs (
    initiator_agent,
    recipient_agent,
    interaction_type,
    outcome,
    mission_id,
    session_id,
    description,
    created_at
) VALUES (
    '$AGENT_A',
    '$AGENT_B',
    '$INTERACTION_TYPE',
    '$OUTCOME',
    $MISSION_ID_SQL,
    $SESSION_ID_SQL,
    $DESCRIPTION_SQL,
    CURRENT_TIMESTAMP
);
EOF

if [ $? -eq 0 ]; then
    echo "✓ Logged: $AGENT_A → $AGENT_B | $INTERACTION_TYPE ($OUTCOME)"
else
    echo "✗ Failed to log interaction"
    exit 1
fi

# Optional: Also update last_interaction_at and interaction_count in khala_network
# Normalize agent order (agent_a < agent_b alphabetically)
if [[ "$AGENT_A" < "$AGENT_B" ]]; then
    NORM_A="$AGENT_A"
    NORM_B="$AGENT_B"
else
    NORM_A="$AGENT_B"
    NORM_B="$AGENT_A"
fi

sqlite3 "$DB_PATH" <<EOF
UPDATE khala_network
SET 
    last_interaction_at = CURRENT_TIMESTAMP,
    interaction_count = interaction_count + 1
WHERE agent_a = '$NORM_A' AND agent_b = '$NORM_B';
EOF

exit 0
