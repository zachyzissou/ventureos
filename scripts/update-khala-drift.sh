#!/bin/bash

# update-khala-drift.sh - Process interactions and update Khala Network affinities
# Reads recent interaction_logs, calculates drift, updates affinity values
# Appends to khala_drift_history (keeping last 20 per pair)

set -euo pipefail

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
LOG_FILE="$HOME/clawd/runtime/logs/khala-drift-$(date +%Y-%m-%d).log"

# Create log directory if needed
mkdir -p "$(dirname "$LOG_FILE")"

# Configuration (override via environment)
DRIFT_BASE="${DRIFT_BASE:-0.03}"
AFFINITY_MIN="${AFFINITY_MIN:-0.10}"
AFFINITY_MAX="${AFFINITY_MAX:-0.95}"
DRIFT_HISTORY_RETENTION="${DRIFT_HISTORY_RETENTION:-20}"
LOOKBACK_HOURS="${LOOKBACK_HOURS:-24}"

# Specific drift magnitudes (match policy doc)
DRIFT_COLLAB_SUCCESS="${DRIFT_COLLABORATION_SUCCESS:-0.03}"
DRIFT_COLLAB_FAILURE="${DRIFT_COLLABORATION_FAILURE:--0.02}"
DRIFT_COLLAB_NEUTRAL="${DRIFT_COLLABORATION_NEUTRAL:-0.00}"

DRIFT_ESCALATION_VALID="${DRIFT_ESCALATION_VALID:-0.04}"
DRIFT_ESCALATION_FALSE="${DRIFT_ESCALATION_FALSE:--0.05}"
DRIFT_ESCALATION_RESOLVED="${DRIFT_ESCALATION_RESOLVED:-0.02}"

DRIFT_HANDOFF_SUCCESS="${DRIFT_HANDOFF_SUCCESS:-0.03}"
DRIFT_HANDOFF_FAILURE="${DRIFT_HANDOFF_FAILURE:--0.03}"
DRIFT_HANDOFF_NEUTRAL="${DRIFT_HANDOFF_NEUTRAL:-0.00}"

DRIFT_CONFLICT_SUCCESS="${DRIFT_CONFLICT_SUCCESS:-0.05}"
DRIFT_CONFLICT_FAILURE="${DRIFT_CONFLICT_FAILURE:--0.04}"
DRIFT_CONFLICT_NEUTRAL="${DRIFT_CONFLICT_NEUTRAL:--0.01}"

# State tracking file to avoid reprocessing
STATE_FILE="$HOME/clawd/runtime/tmp/khala-drift-last-processed.txt"
mkdir -p "$(dirname "$STATE_FILE")"

# Get last processed timestamp (default to LOOKBACK_HOURS ago)
if [ -f "$STATE_FILE" ]; then
    LAST_PROCESSED=$(cat "$STATE_FILE")
else
    LAST_PROCESSED=$(date -u -v-${LOOKBACK_HOURS}H "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -u -d "${LOOKBACK_HOURS} hours ago" "+%Y-%m-%d %H:%M:%S")
fi

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Khala Drift Update Started ==="
log "Database: $DB_PATH"
log "Lookback: Processing interactions since $LAST_PROCESSED"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    log "ERROR: Database not found at $DB_PATH"
    exit 1
fi

# Get new interactions since last run
INTERACTIONS=$(sqlite3 "$DB_PATH" <<EOF
SELECT 
    id,
    initiator_agent,
    recipient_agent,
    interaction_type,
    outcome,
    mission_id,
    created_at
FROM interaction_logs
WHERE created_at > '$LAST_PROCESSED'
ORDER BY created_at ASC;
EOF
)

if [ -z "$INTERACTIONS" ]; then
    log "No new interactions to process."
    log "=== Drift Update Complete (No Changes) ==="
    exit 0
fi

INTERACTION_COUNT=$(echo "$INTERACTIONS" | wc -l | xargs)
log "Found $INTERACTION_COUNT new interaction(s) to process"

# Process each interaction
while IFS='|' read -r ID AGENT_A AGENT_B TYPE OUTCOME MISSION_ID CREATED_AT; do
    # Skip empty lines
    [ -z "$ID" ] && continue
    
    log "Processing: $AGENT_A → $AGENT_B | $TYPE ($OUTCOME)"
    
    # Normalize agent order (agent_a < agent_b)
    if [[ "$AGENT_A" < "$AGENT_B" ]]; then
        NORM_A="$AGENT_A"
        NORM_B="$AGENT_B"
    else
        NORM_A="$AGENT_B"
        NORM_B="$AGENT_A"
    fi
    
    # Calculate drift based on interaction type and outcome
    DELTA=0
    REASON=""
    
    case "$TYPE" in
        collaboration)
            case "$OUTCOME" in
                success)
                    DELTA="$DRIFT_COLLAB_SUCCESS"
                    REASON="Successful collaboration"
                    ;;
                failure)
                    DELTA="$DRIFT_COLLAB_FAILURE"
                    REASON="Failed collaboration"
                    ;;
                neutral)
                    DELTA="$DRIFT_COLLAB_NEUTRAL"
                    REASON="Routine collaboration"
                    ;;
            esac
            ;;
        escalation)
            # For escalation, we need to check if it was validated
            # This is a simplified version - full version would join with escalations table
            case "$OUTCOME" in
                success)
                    DELTA="$DRIFT_ESCALATION_VALID"
                    REASON="Validated escalation (good catch)"
                    ;;
                failure)
                    DELTA="$DRIFT_ESCALATION_FALSE"
                    REASON="False positive escalation"
                    ;;
                neutral)
                    DELTA="$DRIFT_ESCALATION_RESOLVED"
                    REASON="Escalation resolved constructively"
                    ;;
            esac
            ;;
        handoff)
            case "$OUTCOME" in
                success)
                    DELTA="$DRIFT_HANDOFF_SUCCESS"
                    REASON="Smooth handoff"
                    ;;
                failure)
                    DELTA="$DRIFT_HANDOFF_FAILURE"
                    REASON="Fumbled handoff"
                    ;;
                neutral)
                    DELTA="$DRIFT_HANDOFF_NEUTRAL"
                    REASON="Standard handoff"
                    ;;
            esac
            ;;
        conflict)
            case "$OUTCOME" in
                success)
                    DELTA="$DRIFT_CONFLICT_SUCCESS"
                    REASON="Conflict resolved constructively"
                    ;;
                failure)
                    DELTA="$DRIFT_CONFLICT_FAILURE"
                    REASON="Conflict escalated negatively"
                    ;;
                neutral)
                    DELTA="$DRIFT_CONFLICT_NEUTRAL"
                    REASON="Unresolved conflict (stalemate)"
                    ;;
            esac
            ;;
    esac
    
    # Get current affinity
    CURRENT=$(sqlite3 "$DB_PATH" "SELECT affinity FROM khala_network WHERE agent_a = '$NORM_A' AND agent_b = '$NORM_B';" | head -1)
    
    if [ -z "$CURRENT" ]; then
        log "WARNING: No bond found for $NORM_A <-> $NORM_B, skipping"
        continue
    fi
    
    # Calculate new affinity with bounds
    NEW=$(python3 -c "print(max($AFFINITY_MIN, min($AFFINITY_MAX, $CURRENT + $DELTA)))")
    
    # Only update if there's actual change
    if [ "$CURRENT" != "$NEW" ]; then
        log "  Drift: $CURRENT → $NEW (Δ$DELTA) - $REASON"
        
        # Update affinity in khala_network
        sqlite3 "$DB_PATH" <<EOSQL
UPDATE khala_network
SET affinity = $NEW, updated_at = CURRENT_TIMESTAMP
WHERE agent_a = '$NORM_A' AND agent_b = '$NORM_B';
EOSQL
        
        # Log to drift_history
        MISSION_REF="${MISSION_ID:-NULL}"
        if [ "$MISSION_REF" = "NULL" ] || [ -z "$MISSION_REF" ]; then
            MISSION_SQL="NULL"
        else
            MISSION_SQL="'$MISSION_REF'"
        fi
        
        sqlite3 "$DB_PATH" <<EOSQL
INSERT INTO khala_drift_history (
    agent_a,
    agent_b,
    old_affinity,
    new_affinity,
    delta,
    reason,
    interaction_type,
    related_mission_id,
    created_at
) VALUES (
    '$NORM_A',
    '$NORM_B',
    $CURRENT,
    $NEW,
    $DELTA,
    '$REASON',
    '$TYPE',
    $MISSION_SQL,
    CURRENT_TIMESTAMP
);
EOSQL
        
        # Prune old drift history (keep last N records per pair)
        sqlite3 "$DB_PATH" <<EOSQL
DELETE FROM khala_drift_history
WHERE id IN (
    SELECT id FROM khala_drift_history
    WHERE agent_a = '$NORM_A' AND agent_b = '$NORM_B'
    ORDER BY created_at DESC
    LIMIT -1 OFFSET $DRIFT_HISTORY_RETENTION
);
EOSQL
        
    else
        log "  No change (delta=$DELTA resulted in same value)"
    fi
    
done <<< "$INTERACTIONS"

# Update state file with current timestamp
CURRENT_TIME=$(date -u "+%Y-%m-%d %H:%M:%S")
echo "$CURRENT_TIME" > "$STATE_FILE"

log "State updated: Next run will process from $CURRENT_TIME"
log "=== Khala Drift Update Complete ==="

exit 0
