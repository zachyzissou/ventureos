#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# test-kpi-validation.sh — Test Suite for KPI Validation System
#
# 4 test cases:
#   1. Happy path — all 34 KPIs validate with known issues documented
#   2. Missing column — inject KPI with fake column, verify detection
#   3. Missing table — inject KPI with fake table, verify detection
#   4. Schema drift — test with a modified DB, verify detection
#
# Usage:
#   ./test-kpi-validation.sh
#
# Exit codes:
#   0 — All tests pass
#   1 — One or more tests failed
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE_SCRIPT="${SCRIPT_DIR}/validate-kpi-schema.sh"
LINT_SCRIPT="${SCRIPT_DIR}/lint-kpi-definitions.sh"
DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
KPI_DIR="$HOME/clawd/agents/kpis"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# --- Test infrastructure ---
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

tests_run=0
tests_passed=0
tests_failed=0

pass() {
    tests_passed=$((tests_passed + 1))
    printf "  ${GREEN}✅ PASS${NC}: %s\n" "$1"
}

fail() {
    tests_failed=$((tests_failed + 1))
    printf "  ${RED}❌ FAIL${NC}: %s\n" "$1"
    [[ -n "${2:-}" ]] && printf "         %s\n" "$2"
}

run_test() {
    tests_run=$((tests_run + 1))
    printf "\n${YELLOW}━━━ Test %d: %s ━━━${NC}\n" "$tests_run" "$1"
}

# --- Verify prerequisites ---
[[ -x "$VALIDATE_SCRIPT" ]] || { echo "ERROR: validate-kpi-schema.sh not found"; exit 2; }
[[ -x "$LINT_SCRIPT" ]] || { echo "ERROR: lint-kpi-definitions.sh not found"; exit 2; }
[[ -f "$DB_PATH" ]] || { echo "ERROR: Database not found: $DB_PATH"; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 2; }
command -v sqlite3 >/dev/null 2>&1 || { echo "ERROR: sqlite3 not found"; exit 2; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         VentureOS KPI Validation — Test Suite               ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ==========================================================================
# TEST 1: Happy Path — All existing KPIs validate with known issues
# ==========================================================================
run_test "Happy Path — All 34 KPIs validate (known issues documented)"

output=$(bash "$VALIDATE_SCRIPT" "$DB_PATH" "$KPI_DIR" 2>/dev/null) || true
exit_code=$?

if [[ $exit_code -eq 0 ]]; then
    pass "Schema validator returns exit 0"
else
    fail "Schema validator returned exit $exit_code (expected 0)" "Known issues may not be properly documented"
fi

# Check counts
total=$(echo "$output" | grep "Total KPIs:" | grep -oE '[0-9]+')
valid=$(echo "$output" | grep "Valid:" | grep -oE '[0-9]+')
known=$(echo "$output" | grep "Known issues:" | grep -oE '[0-9]+')

if [[ "$total" -eq 34 ]]; then
    pass "Found all 34 KPIs"
else
    fail "Expected 34 KPIs, found $total"
fi

if [[ "$valid" -eq 34 ]]; then
    pass "All 34 KPIs marked as valid"
else
    fail "Expected 34 valid KPIs, found $valid"
fi

if [[ "$known" -gt 0 ]]; then
    pass "Known issues tracked ($known entries)"
else
    fail "Expected known issues to be tracked, found 0"
fi

# Also run the linter
lint_output=$(bash "$LINT_SCRIPT" "$KPI_DIR" 2>/dev/null) || true
lint_exit=$?
if [[ $lint_exit -eq 0 ]]; then
    pass "KPI linter passes all definitions"
else
    fail "KPI linter found errors (exit $lint_exit)"
fi

# ==========================================================================
# TEST 2: Missing Column Detection
# ==========================================================================
run_test "Missing Column — Detect fake column reference"

# Create a temp KPI dir with a bad KPI
TEST_KPI_DIR="$TMPDIR_TEST/kpis_test2"
mkdir -p "$TEST_KPI_DIR"

# Copy existing KPIs
cp "$KPI_DIR"/*.json "$TEST_KPI_DIR/" 2>/dev/null || true
# Remove known issues so we can test fresh detection
rm -f "$TEST_KPI_DIR/.known-issues.json"

# Add a KPI with a fake column
cat > "$TEST_KPI_DIR/test_fake_column.json" <<'EOF'
{
  "kpi_id": "test_fake_column",
  "agent_id": "nexus",
  "category": "quality",
  "name": "Test Fake Column",
  "description": "Test KPI with non-existent column",
  "stakeholder_description": "Test only",
  "formula": {
    "type": "count",
    "field": "fake_count_field",
    "aggregation": "count"
  },
  "data_sources": [
    {
      "table": "psionic_stats",
      "field": "completely_fake_column",
      "filter": "agent_id = 'nexus'"
    }
  ],
  "thresholds": {
    "excellent": 100,
    "good": 80,
    "acceptable": 60,
    "poor": 40,
    "direction": "higher_is_better"
  },
  "visualization": {
    "dashboard_section": "test",
    "chart_type": "number",
    "update_frequency": "daily"
  },
  "audit_trail": {
    "created": "2026-02-14",
    "last_modified": "2026-02-14"
  }
}
EOF

output=$(KNOWN_ISSUES=/dev/null bash "$VALIDATE_SCRIPT" "$DB_PATH" "$TEST_KPI_DIR" 2>/dev/null) || true
exit_code=$?

if [[ $exit_code -eq 1 ]]; then
    pass "Validator correctly returns exit 1 for missing column"
else
    fail "Expected exit 1, got $exit_code"
fi

if echo "$output" | grep -q "completely_fake_column"; then
    pass "Detected fake column 'completely_fake_column'"
else
    fail "Did not detect 'completely_fake_column' in output"
fi

if echo "$output" | grep -q "test_fake_column"; then
    pass "Reported the correct KPI ID (test_fake_column)"
else
    fail "Did not report KPI ID 'test_fake_column'"
fi

# ==========================================================================
# TEST 3: Missing Table Detection
# ==========================================================================
run_test "Missing Table — Detect non-existent table reference"

TEST_KPI_DIR3="$TMPDIR_TEST/kpis_test3"
mkdir -p "$TEST_KPI_DIR3"
cp "$KPI_DIR"/schema.json "$TEST_KPI_DIR3/" 2>/dev/null || true

# Add a KPI with a completely fake table
cat > "$TEST_KPI_DIR3/test_fake_table.json" <<'EOF'
{
  "kpi_id": "test_fake_table",
  "agent_id": "atlas",
  "category": "reliability",
  "name": "Test Fake Table",
  "description": "Test KPI with non-existent table",
  "stakeholder_description": "Test only",
  "formula": {
    "type": "count",
    "field": "some_field",
    "aggregation": "count"
  },
  "data_sources": [
    {
      "table": "completely_nonexistent_table",
      "field": "some_field",
      "filter": "agent_id = 'atlas'"
    }
  ],
  "thresholds": {
    "excellent": 100,
    "good": 80,
    "acceptable": 60,
    "poor": 40,
    "direction": "higher_is_better"
  },
  "visualization": {
    "dashboard_section": "test",
    "chart_type": "number",
    "update_frequency": "daily"
  },
  "audit_trail": {
    "created": "2026-02-14",
    "last_modified": "2026-02-14"
  }
}
EOF

output=$(KNOWN_ISSUES=/dev/null bash "$VALIDATE_SCRIPT" "$DB_PATH" "$TEST_KPI_DIR3" 2>/dev/null) || true
exit_code=$?

if [[ $exit_code -eq 1 ]]; then
    pass "Validator correctly returns exit 1 for missing table"
else
    fail "Expected exit 1, got $exit_code"
fi

if echo "$output" | grep -q "completely_nonexistent_table"; then
    pass "Detected fake table 'completely_nonexistent_table'"
else
    fail "Did not detect 'completely_nonexistent_table' in output"
fi

if echo "$output" | grep -q "MISSING TABLES"; then
    pass "Report includes 'MISSING TABLES' section"
else
    fail "Missing 'MISSING TABLES' section in report"
fi

# ==========================================================================
# TEST 4: Schema Drift Detection
# ==========================================================================
run_test "Schema Drift — Detect when DB schema doesn't match expectations"

# Create a copy of the DB with a renamed column
TEST_DB="$TMPDIR_TEST/test_drift.db"
cp "$DB_PATH" "$TEST_DB"

# Rename a column to simulate schema drift
# SQLite doesn't support RENAME COLUMN on older versions, so recreate the table
sqlite3 "$TEST_DB" <<'SQL'
ALTER TABLE psionic_stats RENAME COLUMN success_rate TO old_success_rate;
SQL

# Create a minimal KPI that references the now-missing column
TEST_KPI_DIR4="$TMPDIR_TEST/kpis_test4"
mkdir -p "$TEST_KPI_DIR4"
cp "$KPI_DIR"/schema.json "$TEST_KPI_DIR4/" 2>/dev/null || true

cat > "$TEST_KPI_DIR4/test_drift_kpi.json" <<'EOF'
{
  "kpi_id": "test_drift_kpi",
  "agent_id": "nexus",
  "category": "reliability",
  "name": "Test Schema Drift",
  "description": "Test KPI for schema drift detection",
  "stakeholder_description": "Test only",
  "formula": {
    "type": "average",
    "field": "success_rate",
    "aggregation": "avg"
  },
  "data_sources": [
    {
      "table": "psionic_stats",
      "field": "success_rate",
      "filter": "agent_id = 'nexus'"
    }
  ],
  "thresholds": {
    "excellent": 0.99,
    "good": 0.95,
    "acceptable": 0.90,
    "poor": 0.80,
    "direction": "higher_is_better"
  },
  "visualization": {
    "dashboard_section": "test",
    "chart_type": "number",
    "update_frequency": "daily"
  },
  "audit_trail": {
    "created": "2026-02-14",
    "last_modified": "2026-02-14"
  }
}
EOF

# Run against the modified DB
output=$(KNOWN_ISSUES=/dev/null bash "$VALIDATE_SCRIPT" "$TEST_DB" "$TEST_KPI_DIR4" 2>/dev/null) || true
exit_code=$?

if [[ $exit_code -eq 1 ]]; then
    pass "Validator correctly detects schema drift (exit 1)"
else
    fail "Expected exit 1 for schema drift, got $exit_code"
fi

if echo "$output" | grep -q "success_rate"; then
    pass "Detected missing 'success_rate' column after rename"
else
    fail "Did not detect 'success_rate' column drift"
fi

# Verify the original column name is still present  
if sqlite3 "$TEST_DB" "PRAGMA table_info(psionic_stats);" | grep -q "old_success_rate"; then
    pass "Confirmed DB has 'old_success_rate' (drift verified)"
else
    fail "DB modification didn't take effect"
fi

# ==========================================================================
# TEST 5: Pre-calculation hook integration
# ==========================================================================
run_test "Pre-Calculation Hook — validate-kpi-schema runs before stats calc"

calc_script="$HOME/clawd/scripts/calculate-psionic-stats.sh"
if grep -q "validate-kpi-schema.sh" "$calc_script"; then
    pass "calculate-psionic-stats.sh references validate-kpi-schema.sh"
else
    fail "calculate-psionic-stats.sh does not reference validation script"
fi

if grep -q "SKIP_KPI_VALIDATION" "$calc_script"; then
    pass "Has SKIP_KPI_VALIDATION escape hatch"
else
    fail "Missing SKIP_KPI_VALIDATION override"
fi

if grep -q "Pre-Calculation" "$calc_script"; then
    pass "Pre-calculation validation section found"
else
    fail "Missing pre-calculation validation section"
fi

# ==========================================================================
# TEST 6: Linter detects bad KPI definitions
# ==========================================================================
run_test "Linter — Detect malformed KPI definitions"

TEST_KPI_DIR6="$TMPDIR_TEST/kpis_test6"
mkdir -p "$TEST_KPI_DIR6"
cp "$KPI_DIR"/schema.json "$TEST_KPI_DIR6/" 2>/dev/null || true

# Create a KPI missing required fields
cat > "$TEST_KPI_DIR6/test_bad_kpi.json" <<'EOF'
{
  "kpi_id": "test_bad_kpi",
  "agent_id": "nexus",
  "category": "invalid_category",
  "name": "Bad KPI",
  "description": "Missing fields",
  "formula": {
    "type": "ratio"
  },
  "data_sources": [],
  "thresholds": {
    "excellent": 100,
    "poor": 40,
    "direction": "higher_is_better"
  },
  "visualization": {
    "chart_type": "pie",
    "update_frequency": "daily"
  },
  "audit_trail": {
    "created": "not-a-date"
  }
}
EOF

output=$(bash "$LINT_SCRIPT" "$TEST_KPI_DIR6" 2>/dev/null) || true
exit_code=$?

if [[ $exit_code -eq 1 ]]; then
    pass "Linter correctly returns exit 1 for bad KPI"
else
    fail "Expected linter exit 1, got $exit_code"
fi

if echo "$output" | grep -q "invalid_category\|Invalid category"; then
    pass "Detected invalid category"
else
    fail "Did not detect invalid category"
fi

if echo "$output" | grep -q "numerator\|requires numerator"; then
    pass "Detected missing numerator for ratio type"
else
    fail "Did not detect missing numerator"
fi

if echo "$output" | grep -q "data_sources is empty\|empty"; then
    pass "Detected empty data_sources"
else
    fail "Did not detect empty data_sources"
fi

# ==========================================================================
# Summary
# ==========================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    TEST RESULTS SUMMARY                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  Tests Run:    %-44s║\n" "$tests_run"
printf "║  ${GREEN}Passed${NC}:       %-44s║\n" "$tests_passed"
printf "║  ${RED}Failed${NC}:       %-44s║\n" "$tests_failed"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [[ $tests_failed -eq 0 ]]; then
    printf "${GREEN}✅ ALL TESTS PASSED${NC}\n"
    exit 0
else
    printf "${RED}❌ %d TEST(S) FAILED${NC}\n" "$tests_failed"
    exit 1
fi
