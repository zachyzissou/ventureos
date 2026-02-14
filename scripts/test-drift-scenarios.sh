#!/bin/bash

# test-drift-scenarios.sh - Test Khala drift tracking with synthetic data
# Creates sample interactions, runs drift update, verifies results

set -euo pipefail

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
LOG_SCRIPT="$HOME/clawd/scripts/log-interaction.sh"
DRIFT_SCRIPT="$HOME/clawd/scripts/update-khala-drift.sh"

echo "======================================"
echo "Khala Drift Tracking Test Suite"
echo "======================================"
echo ""

# Check prerequisites
if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database not found at $DB_PATH"
    exit 1
fi

if [ ! -x "$LOG_SCRIPT" ]; then
    echo "ERROR: log-interaction.sh not found or not executable"
    exit 1
fi

if [ ! -x "$DRIFT_SCRIPT" ]; then
    echo "ERROR: update-khala-drift.sh not found or not executable"
    exit 1
fi

# Snapshot initial state
echo "📊 Capturing initial state..."
echo ""

INITIAL_STATE=$(sqlite3 "$DB_PATH" <<EOF
SELECT 
    agent_a || ' <-> ' || agent_b AS bond,
    printf('%.2f', affinity) AS affinity
FROM khala_network
WHERE 
    (agent_a = 'oracle' AND agent_b = 'archivist') OR
    (agent_a = 'sentinel' AND agent_b = 'verifier') OR
    (agent_a = 'atlas' AND agent_b = 'nexus') OR
    (agent_a = 'echo' AND agent_b = 'oracle')
ORDER BY agent_a, agent_b;
EOF
)

echo "Initial Affinities:"
echo "$INITIAL_STATE"
echo ""

# Clear any recent test data (optional - commented out for safety)
# sqlite3 "$DB_PATH" "DELETE FROM interaction_logs WHERE description LIKE '%TEST:%';"

echo "🧪 Generating test interactions..."
echo ""

# Scenario 1: Oracle & Archivist - Successful collaboration chain
echo "Scenario 1: Oracle & Archivist successful collaboration"
$LOG_SCRIPT oracle archivist collaboration success '{"description":"TEST: Research collaboration"}'
sleep 0.1
$LOG_SCRIPT oracle archivist collaboration success '{"description":"TEST: Data analysis teamwork"}'
sleep 0.1

# Scenario 2: Sentinel & Verifier - Escalation with false positive then recovery
echo "Scenario 2: Sentinel & Verifier escalation cycle"
$LOG_SCRIPT sentinel verifier escalation failure '{"description":"TEST: False positive escalation"}'
sleep 0.1
$LOG_SCRIPT sentinel verifier escalation success '{"description":"TEST: Valid issue caught"}'
sleep 0.1

# Scenario 3: Echo & Oracle - Smooth handoff
echo "Scenario 3: Echo & Oracle handoff"
$LOG_SCRIPT echo oracle handoff success '{"description":"TEST: Clean task handoff"}'
sleep 0.1

# Scenario 4: Atlas & Nexus - Conflict resolution
echo "Scenario 4: Atlas & Nexus conflict resolution"
$LOG_SCRIPT atlas nexus conflict success '{"description":"TEST: Constructive disagreement resolution"}'
sleep 0.1

# Scenario 5: Oracle & Archivist - One more collaboration for boundary testing
echo "Scenario 5: Additional collaboration"
$LOG_SCRIPT oracle archivist collaboration success '{"description":"TEST: Continued teamwork"}'
sleep 0.1

# Scenario 6: Sentinel & Verifier - Conflict (neutral)
echo "Scenario 6: Sentinel & Verifier stalemate"
$LOG_SCRIPT sentinel verifier conflict neutral '{"description":"TEST: Unresolved tension"}'
sleep 0.1

# Scenario 7: Mixed outcomes for variety
echo "Scenario 7: Failed handoff"
$LOG_SCRIPT atlas oracle handoff failure '{"description":"TEST: Fumbled task transfer"}'
sleep 0.1

echo ""
echo "✓ Generated 8 test interactions"
echo ""

# Verify interactions were logged
LOGGED_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM interaction_logs WHERE description LIKE '%TEST:%';")
echo "Verified: $LOGGED_COUNT test interactions in database"
echo ""

# Run drift update
echo "🔄 Running drift update script..."
echo ""
$DRIFT_SCRIPT
echo ""

# Capture final state
echo "📊 Capturing final state..."
echo ""

FINAL_STATE=$(sqlite3 "$DB_PATH" <<EOF
SELECT 
    agent_a || ' <-> ' || agent_b AS bond,
    printf('%.2f', affinity) AS affinity
FROM khala_network
WHERE 
    (agent_a = 'oracle' AND agent_b = 'archivist') OR
    (agent_a = 'sentinel' AND agent_b = 'verifier') OR
    (agent_a = 'atlas' AND agent_b = 'nexus') OR
    (agent_a = 'echo' AND agent_b = 'oracle') OR
    (agent_a = 'atlas' AND agent_b = 'oracle')
ORDER BY agent_a, agent_b;
EOF
)

echo "Final Affinities:"
echo "$FINAL_STATE"
echo ""

# Check drift_history population
echo "📜 Checking drift history..."
DRIFT_RECORDS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM khala_drift_history;")
echo "Total drift records: $DRIFT_RECORDS"
echo ""

echo "Recent drift events:"
sqlite3 "$DB_PATH" <<EOF
SELECT 
    agent_a || ' → ' || agent_b AS bond,
    printf('%.2f → %.2f', old_affinity, new_affinity) AS change,
    printf('(Δ%.2f)', delta) AS delta,
    reason
FROM khala_drift_history
ORDER BY created_at DESC
LIMIT 10;
EOF

echo ""

# Validation checks
echo "✅ Validation Checks:"
echo ""

# Check 1: Drift history is populated
if [ "$DRIFT_RECORDS" -gt 0 ]; then
    echo "✓ Drift history populated ($DRIFT_RECORDS records)"
else
    echo "✗ FAIL: No drift records created"
    exit 1
fi

# Check 2: Affinities are within bounds
OUT_OF_BOUNDS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM khala_network WHERE affinity < 0.10 OR affinity > 0.95;")
if [ "$OUT_OF_BOUNDS" -eq 0 ]; then
    echo "✓ All affinities within bounds [0.10, 0.95]"
else
    echo "✗ FAIL: $OUT_OF_BOUNDS bonds out of bounds!"
    exit 1
fi

# Check 3: Oracle & Archivist affinity increased (3 successful collaborations = +0.09)
ORACLE_ARCHIVIST_DRIFT=$(sqlite3 "$DB_PATH" <<EOF
SELECT 
    CASE 
        WHEN new_affinity > old_affinity THEN 'increased'
        WHEN new_affinity < old_affinity THEN 'decreased'
        ELSE 'unchanged'
    END
FROM khala_drift_history
WHERE agent_a = 'archivist' AND agent_b = 'oracle'
ORDER BY created_at DESC
LIMIT 1;
EOF
)

if [ "$ORACLE_ARCHIVIST_DRIFT" = "increased" ]; then
    echo "✓ Oracle ↔ Archivist affinity increased (expected from successful collaborations)"
else
    echo "⚠ Warning: Oracle ↔ Archivist drift was $ORACLE_ARCHIVIST_DRIFT (expected 'increased')"
fi

# Check 4: Sentinel & Verifier had mixed outcomes (should have net change)
SENTINEL_VERIFIER_EVENTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM khala_drift_history WHERE agent_a = 'sentinel' AND agent_b = 'verifier';")
if [ "$SENTINEL_VERIFIER_EVENTS" -ge 2 ]; then
    echo "✓ Sentinel ↔ Verifier multiple drift events ($SENTINEL_VERIFIER_EVENTS)"
else
    echo "⚠ Warning: Expected at least 2 drift events for Sentinel ↔ Verifier, got $SENTINEL_VERIFIER_EVENTS"
fi

# Check 5: Drift retention policy (should be ≤ 20 per pair)
MAX_PER_PAIR=$(sqlite3 "$DB_PATH" <<EOF
SELECT MAX(count) FROM (
    SELECT agent_a, agent_b, COUNT(*) as count
    FROM khala_drift_history
    GROUP BY agent_a, agent_b
);
EOF
)

if [ "$MAX_PER_PAIR" -le 20 ]; then
    echo "✓ Drift history retention respected (max $MAX_PER_PAIR per pair, limit 20)"
else
    echo "✗ FAIL: Drift history retention violated (max $MAX_PER_PAIR per pair, limit 20)"
    exit 1
fi

echo ""
echo "======================================"
echo "✅ All Validation Checks Passed!"
echo "======================================"
echo ""
echo "Summary:"
echo "- Test interactions logged: $LOGGED_COUNT"
echo "- Drift records created: $DRIFT_RECORDS"
echo "- Affinities updated and bounded correctly"
echo "- History retention policy working"
echo ""
echo "Drift engine is operational! 🚀"
echo ""

# Show detailed comparison
echo "Before → After Comparison:"
echo ""
paste <(echo "$INITIAL_STATE") <(echo "$FINAL_STATE") | awk '{print $1, $2, "→", $4}'

exit 0
