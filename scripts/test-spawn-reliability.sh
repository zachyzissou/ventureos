#!/usr/bin/env bash
# test-spawn-reliability.sh — Tests for phantom detection, workspace health, and spawn reliability
#
# Tests:
#  1. spawn-with-retry.mjs --help exits 0
#  2. Model validation (invalid models detected)
#  3. Phantom detector runs without error
#  4. Phantom detector JSON output is valid
#  5. verify-session-exists.sh detects non-existent sessions
#  6. Rate tracking file is created
#  7. Audit log is valid
#  8. Provider-model mismatch detection
#  9. Workspace health check runs and produces valid output
# 10. Workspace health check JSON output is valid
# 11. Workspace health check detects known bloated workspaces
# 12. spawn-with-health-check.mjs --help exits 0
# 13. detect-phantom-sessions.sh runs without error
# 14. detect-phantom-sessions.sh produces metrics
#
# Usage: bash test-spawn-reliability.sh
#
# Exit: 0 if all pass, 1 if any fail

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
VERIFY_SCRIPT="${HOME}/clawd/scripts/verify-session-exists.sh"
SPAWN_SCRIPT="${SCRIPTS_DIR}/spawn-with-retry.mjs"
SPAWN_HEALTH_SCRIPT="${SCRIPTS_DIR}/spawn-with-health-check.mjs"
PHANTOM_SCRIPT="${SCRIPTS_DIR}/phantom-detector.sh"
HEALTH_SCRIPT="${SCRIPTS_DIR}/check-workspace-health.sh"
DETECT_SCRIPT="${SCRIPTS_DIR}/detect-phantom-sessions.sh"

PASS=0
FAIL=0
SKIP=0
TOTAL=0

# ============================================================================
# Test helpers
# ============================================================================

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo "  ✅ PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  ❌ FAIL: $1"
  if [[ -n "${2:-}" ]]; then
    echo "         Detail: $2"
  fi
}

skip() {
  SKIP=$((SKIP + 1))
  TOTAL=$((TOTAL + 1))
  echo "  ⏭️ SKIP: $1"
  if [[ -n "${2:-}" ]]; then
    echo "         Reason: $2"
  fi
}

section() {
  echo ""
  echo "━━━ $1 ━━━"
}

# ============================================================================
# Test 1: spawn-with-retry.mjs --help
# ============================================================================

section "Test 1: spawn-with-retry.mjs --help"

if node "${SPAWN_SCRIPT}" --help >/dev/null 2>&1; then
  pass "spawn-with-retry.mjs --help exits 0"
else
  fail "spawn-with-retry.mjs --help exits non-zero"
fi

# ============================================================================
# Test 2: spawn-with-retry.mjs handles missing command gracefully
# ============================================================================

section "Test 2: spawn-with-retry.mjs graceful failure"

output=$(node "${SPAWN_SCRIPT}" --max-retries 0 --quiet -- nonexistent-command-12345 2>&1 || true)
exit_code=$?

if echo "${output}" | grep -qi "SPAWN_FAILURE\|failed\|error" 2>/dev/null || [[ ${exit_code} -ne 0 ]]; then
  pass "spawn-with-retry.mjs reports failure for nonexistent command"
else
  fail "spawn-with-retry.mjs did not report failure" "Output: ${output:0:200}"
fi

# ============================================================================
# Test 3: Phantom detector runs
# ============================================================================

section "Test 3: Phantom detector execution"

if bash "${PHANTOM_SCRIPT}" 2>/dev/null; then
  pass "Phantom detector runs without error (no phantoms found)"
elif [[ $? -eq 1 ]]; then
  pass "Phantom detector runs (phantoms detected — expected in dev)"
else
  fail "Phantom detector failed with unexpected error"
fi

# ============================================================================
# Test 4: Phantom detector JSON output
# ============================================================================

section "Test 4: Phantom detector JSON output"

json_output=$(bash "${PHANTOM_SCRIPT}" --json 2>/dev/null || true)
if echo "${json_output}" | jq . >/dev/null 2>&1; then
  pass "Phantom detector produces valid JSON"

  phantom_count=$(echo "${json_output}" | jq -r '.phantomCount' 2>/dev/null || echo "null")
  if [[ "${phantom_count}" =~ ^[0-9]+$ ]]; then
    pass "JSON contains valid phantomCount: ${phantom_count}"
  else
    fail "JSON missing valid phantomCount" "Got: ${phantom_count}"
  fi
else
  fail "Phantom detector JSON output is invalid" "Output: ${json_output:0:200}"
fi

# ============================================================================
# Test 5: verify-session-exists.sh detects non-existent sessions
# ============================================================================

section "Test 5: Session verification"

if [[ -f "${VERIFY_SCRIPT}" ]]; then
  if bash "${VERIFY_SCRIPT}" "nonexistent-session-key-12345" --strict 2>/dev/null; then
    fail "verify-session-exists.sh should reject nonexistent session"
  else
    pass "verify-session-exists.sh correctly rejects nonexistent session"
  fi
else
  skip "verify-session-exists.sh not found" "${VERIFY_SCRIPT}"
fi

# ============================================================================
# Test 6: Rate tracking
# ============================================================================

section "Test 6: Rate tracking"

RATE_FILE="${HOME}/clawd/ventureos/runtime/logs/phantom-rate.jsonl"
if [[ -f "${RATE_FILE}" ]]; then
  last_line=$(tail -1 "${RATE_FILE}")
  if echo "${last_line}" | jq . >/dev/null 2>&1; then
    pass "Rate tracking file has valid JSONL entries"
  else
    fail "Rate tracking file has invalid entries" "Last line: ${last_line}"
  fi
else
  bash "${PHANTOM_SCRIPT}" --json >/dev/null 2>&1 || true
  if [[ -f "${RATE_FILE}" ]]; then
    pass "Rate tracking file created after detector run"
  else
    fail "Rate tracking file not created"
  fi
fi

# ============================================================================
# Test 7: Audit log
# ============================================================================

section "Test 7: Audit logging"

LOG_FILE="${HOME}/clawd/ventureos/runtime/logs/phantom-detector.jsonl"
if [[ -f "${LOG_FILE}" ]]; then
  last_entry=$(tail -1 "${LOG_FILE}")
  if echo "${last_entry}" | jq -e '.event' >/dev/null 2>&1; then
    pass "Detector audit log has valid entries with event field"
  else
    fail "Detector audit log entries missing event field"
  fi
else
  fail "Detector audit log not found (run phantom-detector.sh first)"
fi

# ============================================================================
# Test 8: spawn-with-health-check.mjs argument validation
# ============================================================================

section "Test 8: spawn-with-health-check.mjs argument validation"

# Missing required --agent should exit 3
shc_output=$(node "${SPAWN_HEALTH_SCRIPT}" --prompt "test" 2>&1 || true)
shc_exit=$?
if [[ ${shc_exit} -eq 3 ]] || echo "${shc_output}" | grep -qi "required\|error" 2>/dev/null; then
  pass "Rejects missing --agent argument"
else
  fail "Did not reject missing --agent" "Exit: ${shc_exit}, Output: ${shc_output:0:200}"
fi

# Missing required --prompt should exit 3
shc_output2=$(node "${SPAWN_HEALTH_SCRIPT}" --agent test 2>&1 || true)
shc_exit2=$?
if [[ ${shc_exit2} -eq 3 ]] || echo "${shc_output2}" | grep -qi "required\|error" 2>/dev/null; then
  pass "Rejects missing --prompt argument"
else
  fail "Did not reject missing --prompt" "Exit: ${shc_exit2}"
fi

# ============================================================================
# Test 9: Workspace health check runs
# ============================================================================

section "Test 9: Workspace health check execution"

health_output=$(bash "${HEALTH_SCRIPT}" 2>/dev/null || true)
health_exit=$?

if [[ -n "${health_output}" ]]; then
  pass "Workspace health check runs and produces output"
else
  fail "Workspace health check produced no output"
fi

# Check it reports at least some agents
if echo "${health_output}" | grep -qE "(atlas|oracle|synth|sentinel)" 2>/dev/null; then
  pass "Health check reports known agents"
else
  fail "Health check doesn't report expected agents" "Output: ${health_output:0:200}"
fi

# ============================================================================
# Test 10: Workspace health check JSON output
# ============================================================================

section "Test 10: Workspace health check JSON output"

health_json=$(bash "${HEALTH_SCRIPT}" --json 2>/dev/null || true)
if echo "${health_json}" | jq . >/dev/null 2>&1; then
  pass "Health check produces valid JSON"

  agents_count=$(echo "${health_json}" | jq '.agents | length' 2>/dev/null || echo "0")
  if [[ "${agents_count}" -gt 0 ]]; then
    pass "JSON contains ${agents_count} agent entries"
  else
    fail "JSON contains no agent entries"
  fi

  # Check required fields
  has_fields=$(echo "${health_json}" | jq -e '.checkedAt and .unhealthyCount != null and .thresholds' >/dev/null 2>&1 && echo "yes" || echo "no")
  if [[ "${has_fields}" == "yes" ]]; then
    pass "JSON has required fields (checkedAt, unhealthyCount, thresholds)"
  else
    fail "JSON missing required fields"
  fi
else
  fail "Health check JSON output is invalid" "Output: ${health_json:0:200}"
fi

# ============================================================================
# Test 11: Health check detects known bloated workspace
# ============================================================================

section "Test 11: Bloated workspace detection"

if [[ -n "${health_json}" ]]; then
  synth_status=$(echo "${health_json}" | jq -r '.agents[] | select(.agent == "synth") | .status' 2>/dev/null || echo "unknown")
  synth_size=$(echo "${health_json}" | jq -r '.agents[] | select(.agent == "synth") | .totalHuman' 2>/dev/null || echo "unknown")

  if [[ "${synth_status}" == "unhealthy" ]]; then
    pass "Correctly flags synth workspace as unhealthy (${synth_size})"
  elif [[ "${synth_status}" == "warning" ]]; then
    pass "Flags synth workspace as warning (${synth_size})"
  else
    fail "Did not flag synth workspace (status: ${synth_status}, size: ${synth_size})"
  fi
else
  skip "No health JSON available for bloat detection test"
fi

# ============================================================================
# Test 12: spawn-with-health-check.mjs --help
# ============================================================================

section "Test 12: spawn-with-health-check.mjs --help"

if node "${SPAWN_HEALTH_SCRIPT}" --help >/dev/null 2>&1; then
  pass "spawn-with-health-check.mjs --help exits 0"
else
  fail "spawn-with-health-check.mjs --help exits non-zero"
fi

# ============================================================================
# Test 13: detect-phantom-sessions.sh runs
# ============================================================================

section "Test 13: detect-phantom-sessions.sh execution"

detect_output=$(bash "${DETECT_SCRIPT}" 2>/dev/null || true)
if echo "${detect_output}" | grep -qE "(Phantom|Health Check)" 2>/dev/null; then
  pass "Combined detector runs and produces expected output"
else
  fail "Combined detector output unexpected" "Output: ${detect_output:0:200}"
fi

# ============================================================================
# Test 14: Metrics file created
# ============================================================================

section "Test 14: Metrics tracking"

METRICS_FILE="${HOME}/clawd/ventureos/runtime/logs/phantom-metrics.jsonl"
if [[ -f "${METRICS_FILE}" ]]; then
  last_metric=$(tail -1 "${METRICS_FILE}")
  if echo "${last_metric}" | jq -e '.phantomCount != null and .unhealthyWorkspaces != null' >/dev/null 2>&1; then
    pass "Metrics file has valid entries with phantomCount and unhealthyWorkspaces"
  else
    fail "Metrics file entries missing expected fields" "Last: ${last_metric}"
  fi
else
  fail "Metrics file not created at ${METRICS_FILE}"
fi

# ============================================================================
# Test 15: Workspace health log file
# ============================================================================

section "Test 15: Workspace health logging"

HEALTH_LOG="${HOME}/clawd/ventureos/runtime/logs/workspace-health.jsonl"
if [[ -f "${HEALTH_LOG}" ]]; then
  last_log=$(tail -1 "${HEALTH_LOG}")
  if echo "${last_log}" | jq -e '.event == "health_check"' >/dev/null 2>&1; then
    pass "Workspace health log has valid entries"
  else
    fail "Workspace health log entries missing event field"
  fi
else
  fail "Workspace health log not created"
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS}/${TOTAL} passed, ${FAIL} failed, ${SKIP} skipped"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
else
  echo "🎉 All tests passed!"
  exit 0
fi
