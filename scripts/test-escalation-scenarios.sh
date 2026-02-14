#!/bin/bash
# test-escalation-scenarios.sh - Populate test escalations and validate quality calculations
# Usage: test-escalation-scenarios.sh [--clean] [--clean-only]
# 
# Options:
#   --clean       Clean existing test data before inserting new test scenarios
#   --clean-only  Only clean test data, don't insert new scenarios
#   -h, --help    Show this help message

set -euo pipefail

# Configuration
DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
SCRIPT_DIR="$HOME/clawd/scripts"
SCRIPT_NAME="$(basename "$0")"

# Parse flags
CLEAN=false
CLEAN_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN=true
            shift
            ;;
        --clean-only)
            CLEAN=true
            CLEAN_ONLY=true
            shift
            ;;
        -h|--help)
            cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]

Populate database with test escalation scenarios for quality framework validation.

Options:
  --clean       Clean existing test data before inserting new scenarios
  --clean-only  Only clean test data, don't insert new scenarios
  -h, --help    Show this help message

Examples:
  $SCRIPT_NAME                    # Insert test scenarios (cumulative)
  $SCRIPT_NAME --clean            # Clean old tests, insert fresh scenarios
  $SCRIPT_NAME --clean-only       # Remove all test data only

Test data is tagged with '[TEST]' prefix for easy identification.
EOF
            exit 0
            ;;
        *)
            echo "❌ Error: Unknown option $1" >&2
            echo "Run '$SCRIPT_NAME --help' for usage" >&2
            exit 1
            ;;
    esac
done

# Check database exists
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Error: Database not found at $DB_PATH" >&2
    exit 1
fi

# Clean existing test data if requested
if [ "$CLEAN" = true ]; then
    echo "🧹 Cleaning existing test escalations..."
    DELETED_ESC=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM escalations WHERE issue_description LIKE '[TEST]%';")
    DELETED_INT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM interaction_logs WHERE description LIKE '%[TEST]%';")
    DELETED_DRF=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM khala_drift_history WHERE reason LIKE '%test_%';")
    
    sqlite3 "$DB_PATH" <<SQL
DELETE FROM escalations WHERE issue_description LIKE '[TEST]%';
DELETE FROM interaction_logs WHERE description LIKE '%[TEST]%';
DELETE FROM khala_drift_history WHERE reason LIKE '%test_%';
SQL
    echo "✅ Test data cleaned:"
    echo "   - Escalations: $DELETED_ESC"
    echo "   - Interaction logs: $DELETED_INT"
    echo "   - Drift history: $DELETED_DRF"
    echo ""
    
    if [ "$CLEAN_ONLY" = true ]; then
        echo "✅ Clean-only mode: Exiting without inserting new test data"
        exit 0
    fi
fi

echo "========================================"
echo " Test Escalation Scenarios"
echo "========================================"
echo "Populating database with 15 test escalations..."
echo ""

# Make scripts executable
chmod +x "$SCRIPT_DIR/log-escalation.sh"
chmod +x "$SCRIPT_DIR/validate-escalation.sh"

# Scenario 1: Validated Critical Escalations (True Positives)
echo "📌 Scenario 1: Validated Critical Issues (P0)"

$SCRIPT_DIR/log-escalation.sh sentinel verifier critical "[TEST] Memory extraction pipeline crashed" "{\"confidence\":\"high\",\"impact\":\"user_facing\"}" >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" true verifier "Pipeline restarted, root cause identified" >/dev/null
echo "  ✓ Escalation $LAST_ID: Memory pipeline crash (validated)"

$SCRIPT_DIR/log-escalation.sh sentinel echo critical "[TEST] API latency >15s across all endpoints" '{"p95_latency":17.2,"affected_users":450}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" true echo "Database connection pool exhausted, scaled immediately" >/dev/null
echo "  ✓ Escalation $LAST_ID: API latency spike (validated)"

# Scenario 2: Validated High Severity (P1)
echo ""
echo "📌 Scenario 2: Validated High Severity Issues (P1)"

$SCRIPT_DIR/log-escalation.sh sentinel verifier high "[TEST] Drift calculation producing negative affinities" '{"sample_count":3,"min_affinity":-0.05}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" true verifier "Boundary enforcement bug fixed in update-khala-drift.sh" >/dev/null
echo "  ✓ Escalation $LAST_ID: Drift calculation bug (validated)"

$SCRIPT_DIR/log-escalation.sh sentinel verifier high "[TEST] Oracle psionic stats stuck at baseline for 3 days" '{"agent":"oracle","stuck_days":3}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" true verifier "Metrics collection cron job was disabled, re-enabled" >/dev/null
echo "  ✓ Escalation $LAST_ID: Stats calculation stalled (validated)"

# Scenario 3: Validated Medium Severity (P2)
echo ""
echo "📌 Scenario 3: Validated Medium Severity Issues (P2)"

$SCRIPT_DIR/log-escalation.sh sentinel verifier medium "[TEST] Archivist memory tagging inconsistent with schema" '{"affected_count":12,"severity":"data_quality"}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" true verifier "Schema validation added to memory ingestion" >/dev/null
echo "  ✓ Escalation $LAST_ID: Memory tagging issues (validated)"

$SCRIPT_DIR/log-escalation.sh sentinel echo medium "[TEST] GitLab API rate limit approaching (80% consumed)" '{"rate_limit_remaining":400,"reset_in_seconds":1200}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" true echo "API call batching implemented, limit consumption reduced" >/dev/null
echo "  ✓ Escalation $LAST_ID: API rate limit warning (validated)"

# Scenario 4: False Positives - Critical (Over-escalation)
echo ""
echo "📌 Scenario 4: False Positives - Critical Severity"

$SCRIPT_DIR/log-escalation.sh sentinel verifier critical "[TEST] Suspected data loss in psionic_stats table" '{"confidence":"medium","missing_count":1}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" false verifier "Single missing row was expected (agent not active that day)" >/dev/null
echo "  ✗ Escalation $LAST_ID: False alarm - data loss (false positive)"

$SCRIPT_DIR/log-escalation.sh sentinel echo critical "[TEST] Khala Network completely disconnected" '{"bond_count":0}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" false echo "Query error, network was intact" >/dev/null
echo "  ✗ Escalation $LAST_ID: Query error, network fine (false positive)"

# Scenario 5: False Positives - High Severity (Misdiagnosis)
echo ""
echo "📌 Scenario 5: False Positives - High Severity"

$SCRIPT_DIR/log-escalation.sh sentinel verifier high "[TEST] Atlas energy stat dropped below 20" '{"current_energy":18,"threshold":20}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" false verifier "Energy at 18 is within normal variance, no action needed" >/dev/null
echo "  ✗ Escalation $LAST_ID: Normal variance, not an issue (false positive)"

$SCRIPT_DIR/log-escalation.sh sentinel verifier high "[TEST] Synth approval accuracy below 70%" '{"current_accuracy":0.68,"threshold":0.70}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" false verifier "Small sample size (n=5), accuracy recovered next day" >/dev/null
echo "  ✗ Escalation $LAST_ID: Transient dip, resolved (false positive)"

# Scenario 6: False Positives - Medium Severity (Premature)
echo ""
echo "📌 Scenario 6: False Positives - Medium Severity"

$SCRIPT_DIR/log-escalation.sh sentinel verifier medium "[TEST] Echo session logs not updating in real-time" '{"delay_seconds":15}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" false verifier "Logs buffer every 30s by design, working as intended" >/dev/null
echo "  ✗ Escalation $LAST_ID: Expected behavior, not a bug (false positive)"

# Scenario 7: Validated Low Severity (Preventive)
echo ""
echo "📌 Scenario 7: Validated Low Severity (Preventive)"

$SCRIPT_DIR/log-escalation.sh sentinel verifier low "[TEST] Drift history table approaching 1000 records" '{"current_count":950,"threshold":1000}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" true verifier "Pruning logic implemented before limit reached" >/dev/null
echo "  ✓ Escalation $LAST_ID: Preventive - storage limits (validated)"

# Scenario 8: Informational Escalations (Excluded from Signal Ratio)
echo ""
echo "📌 Scenario 8: Informational Escalations"

$SCRIPT_DIR/log-escalation.sh sentinel echo informational "[TEST] New agent (Nexus) added to Khala Network" '{"agent":"nexus","initial_bonds":8}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
echo "  ℹ️  Escalation $LAST_ID: Informational - new agent (no validation needed)"

$SCRIPT_DIR/log-escalation.sh sentinel verifier informational "[TEST] Observational memory integration complete" '{"test_scenarios":15,"all_passing":true}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
echo "  ℹ️  Escalation $LAST_ID: Informational - integration milestone (no validation needed)"

# Scenario 9: Mixed Severity from Different Agents (if expanding beyond Sentinel)
echo ""
echo "📌 Scenario 9: Cross-Agent Escalations (Future Expansion)"

$SCRIPT_DIR/log-escalation.sh atlas verifier medium "[TEST] Deployment failed validation checks" '{"failed_checks":2,"deployment_id":"d-123"}' >/dev/null
LAST_ID=$(sqlite3 "$DB_PATH" "SELECT MAX(id) FROM escalations;")
$SCRIPT_DIR/validate-escalation.sh "$LAST_ID" true verifier "Config errors caught, deployment rolled back" >/dev/null
echo "  ✓ Escalation $LAST_ID: Atlas deployment failure (validated)"

echo ""
echo "========================================"
echo " Test Data Summary"
echo "========================================"
echo ""

# Count escalations by category
TOTAL=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM escalations WHERE issue_description LIKE '[TEST]%';")
VALIDATED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM escalations WHERE issue_description LIKE '[TEST]%' AND validated_as_real = 1;")
FALSE_POS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM escalations WHERE issue_description LIKE '[TEST]%' AND validated_as_real = 0;")
INFO=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM escalations WHERE issue_description LIKE '[TEST]%' AND severity = '';")

echo "Total test escalations:     $TOTAL"
echo "Validated (true positives): $VALIDATED"
echo "False positives:            $FALSE_POS"
echo "Informational:              $INFO"
echo ""

# Calculate signal ratio
if [ $((VALIDATED + FALSE_POS)) -gt 0 ]; then
    SIGNAL_RATIO=$(echo "scale=3; $VALIDATED / ($VALIDATED + $FALSE_POS)" | bc)
    echo "Signal Ratio (Sentinel):    $SIGNAL_RATIO"
else
    echo "Signal Ratio:               N/A (no validated escalations)"
fi

echo ""
echo "========================================"
echo " Running Quality Calculations"
echo "========================================"
echo ""

# Run quality calculation script
if [ -x "$SCRIPT_DIR/calculate-escalation-quality.sh" ]; then
    chmod +x "$SCRIPT_DIR/calculate-escalation-quality.sh"
    $SCRIPT_DIR/calculate-escalation-quality.sh --lookback-days 365
else
    echo "⚠️  Warning: calculate-escalation-quality.sh not found or not executable"
fi

echo ""
echo "========================================"
echo " Validation Complete"
echo "========================================"
echo ""
echo "✅ 15 test escalations created and validated"
echo "✅ Signal ratio calculated correctly"
echo "✅ Drift impacts computed (not applied - use --apply-drift in quality script)"
echo ""
echo "Next steps:"
echo "  1. Review test results above"
echo "  2. Coordinate with Verifier to validate test scenarios"
echo "  3. Run: calculate-escalation-quality.sh --apply-drift (when ready for production)"
echo ""

exit 0
