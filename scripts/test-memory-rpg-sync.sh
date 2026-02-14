#!/bin/bash
# test-memory-rpg-sync.sh - Test memory→RPG integration
# Phase 2 Track 3: Observational Memory Integration

set -euo pipefail

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
TEST_OBS_DIR="/tmp/test-observations-$$"
SYNC_SCRIPT="$HOME/clawd/scripts/sync-memory-to-rpg.sh"

echo "========================================"
echo "Memory → RPG Sync Test Suite"
echo "========================================"

# Create test observations directory
mkdir -p "$TEST_OBS_DIR"

# Create test observation file with enough data to trigger activations
cat > "$TEST_OBS_DIR/2026-02-14.md" << 'EOF'
# Test Observations - 2026-02-14

## [08:00] Oracle: Research Pattern 1
**Context:** Research task
**Action:** Completed
**Outcome:** Success
**Tags:** #oracle #research #decisions

## [08:15] Oracle: Research Pattern 2
**Tags:** #oracle #research #cost-optimization

## [08:30] Oracle: Research Pattern 3
**Tags:** #oracle #research #finance

## [08:45] Oracle: Research Pattern 4
**Tags:** #oracle #decisions

## [09:00] Oracle: Research Pattern 5
**Tags:** #oracle #cost-optimization #decisions

## [09:15] Oracle: General Observation 6
**Tags:** #oracle

## [09:30] Oracle: General Observation 7
**Tags:** #oracle

## [09:45] Oracle: General Observation 8
**Tags:** #oracle

## [10:00] Atlas: Monitoring Pattern 1
**Tags:** #atlas #monitoring #infrastructure

## [10:15] Atlas: Monitoring Pattern 2
**Tags:** #atlas #monitoring #ci

## [10:30] Atlas: Monitoring Pattern 3
**Tags:** #atlas #infrastructure

## [10:45] Atlas: General Observation 4
**Tags:** #atlas

## [11:00] Nexus: Debugging Pattern 1
**Tags:** #nexus #debugging

## [11:15] Nexus: Debugging Pattern 2
**Tags:** #nexus #debugging #priorities

## [11:30] Nexus: Infrastructure Pattern
**Tags:** #nexus #infrastructure

## [11:45] Nexus: CI Pattern
**Tags:** #nexus #ci

## [12:00] Nexus: Monitoring Pattern
**Tags:** #nexus #monitoring

## [12:15] Nexus: General Observation 6
**Tags:** #nexus

## [13:00] Synth: CI Pattern 1
**Tags:** #synth #ci #testing

## [13:15] Synth: CI Pattern 2
**Tags:** #synth #ci #pipeline

## [13:30] Synth: Testing Pattern 3
**Tags:** #synth #testing

## [13:45] Synth: Pipeline Pattern 4
**Tags:** #synth #pipeline

## [14:00] Synth: CI Pattern 5
**Tags:** #synth #ci
EOF

# Create index.json for test observations
cat > "$TEST_OBS_DIR/index.json" << 'EOF'
{
  "dates": {
    "2026-02-14": {
      "observations": 21,
      "topics": ["research", "monitoring", "ci"],
      "tags": ["#oracle", "#atlas", "#nexus", "#synth"]
    }
  }
}
EOF

echo "✓ Created test observations"

# Temporarily modify sync script to use test directory
cp "$SYNC_SCRIPT" "${SYNC_SCRIPT}.backup"

# Run sync script with test data
echo ""
echo "Running sync with test observations..."
echo ""

# Create a wrapper script that overrides the OBS_DIR variable
cat > /tmp/test-sync-wrapper-$$.sh << EOF
#!/bin/bash
export OBS_DIR="$TEST_OBS_DIR"
export OBS_INDEX="$TEST_OBS_DIR/index.json"
export LOG_FILE="/tmp/test-sync-$$.log"
$(cat "$SYNC_SCRIPT" | sed 's|^OBS_DIR=.*|OBS_DIR="'"$TEST_OBS_DIR"'"|' | sed 's|^OBS_INDEX=.*|OBS_INDEX="'"$TEST_OBS_DIR"'/index.json"|' | sed 's|^LOG_FILE=.*|LOG_FILE="/tmp/test-sync-$$.log"|')
EOF

chmod +x /tmp/test-sync-wrapper-$$.sh
/tmp/test-sync-wrapper-$$.sh

# Verify results
echo ""
echo "========================================"
echo "Test Results"
echo "========================================"

# Check Oracle: Should have reference_outcomes (8 observations) and cite_precedents (5 research)
oracle_ref=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM personality_activations WHERE agent_id='oracle' AND protocol_id='reference_outcomes' AND deactivated_at IS NULL;")
oracle_cite=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM personality_activations WHERE agent_id='oracle' AND protocol_id='cite_precedents' AND deactivated_at IS NULL;")

echo "Oracle Protocols:"
echo "  reference_outcomes: $oracle_ref (expected: 1)"
echo "  cite_precedents: $oracle_cite (expected: 1)"

# Check Atlas: Should have proactive_monitoring (3 monitoring patterns)
atlas_monitor=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM personality_activations WHERE agent_id='atlas' AND protocol_id='proactive_monitoring' AND deactivated_at IS NULL;")

echo ""
echo "Atlas Protocols:"
echo "  proactive_monitoring: $atlas_monitor (expected: 1)"

# Check Nexus: Should have use_frameworks (6 patterns: 2 debugging + 1 infra + 1 ci + 1 monitoring)
nexus_frameworks=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM personality_activations WHERE agent_id='nexus' AND protocol_id='use_frameworks' AND deactivated_at IS NULL;")

echo ""
echo "Nexus Protocols:"
echo "  use_frameworks: $nexus_frameworks (expected: 1)"

# Check Synth: Should have test_first_discipline (5 CI patterns)
synth_test=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM personality_activations WHERE agent_id='synth' AND protocol_id='test_first_discipline' AND deactivated_at IS NULL;")

echo ""
echo "Synth Protocols:"
echo "  test_first_discipline: $synth_test (expected: 1)"

# Count total activations
total_active=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM personality_activations WHERE deactivated_at IS NULL;")

echo ""
echo "========================================"
echo "Total Active Protocols: $total_active"
echo "Expected: 5 (oracle×2, atlas×1, nexus×1, synth×1)"
echo "========================================"

# Show all activations
echo ""
echo "All Active Protocols:"
sqlite3 "$DB_PATH" "
SELECT 
    agent_id || ' → ' || protocol_id || ' (' || protocol_type || ')' as activation,
    trigger_condition
FROM personality_activations 
WHERE deactivated_at IS NULL
ORDER BY agent_id, protocol_id;
"

# Validation
echo ""
echo "========================================"
echo "Validation"
echo "========================================"

if [[ $oracle_ref -eq 1 && $oracle_cite -eq 1 && $atlas_monitor -eq 1 && $nexus_frameworks -eq 1 && $synth_test -eq 1 ]]; then
    echo "✅ All expected protocols activated!"
    test_result="PASSED"
else
    echo "❌ Some protocols missing or incorrect"
    test_result="FAILED"
fi

# Cleanup
rm -rf "$TEST_OBS_DIR"
rm -f /tmp/test-sync-wrapper-$$.sh /tmp/test-sync-$$.log

# Note: We keep the test activations in the DB for inspection
echo ""
echo "Note: Test activations remain in database for inspection."
echo "To clean up: sqlite3 $DB_PATH 'DELETE FROM personality_activations;'"

echo ""
echo "========================================"
echo "Test Result: $test_result"
echo "========================================"

if [[ "$test_result" == "PASSED" ]]; then
    exit 0
else
    exit 1
fi
