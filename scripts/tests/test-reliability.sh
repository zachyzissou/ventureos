#!/usr/bin/env bash
# test-reliability.sh — Comprehensive reliability test suite for VentureOS
#
# Tests:
#   1.  guarded-run.sh timeout enforcement
#   2.  guarded-run.sh retry with backoff
#   3.  with-timeout.sh kills long-running process
#   4.  with-timeout.sh passes through success
#   5.  retry.sh exponential backoff
#   6.  retry.sh respects RETRY_EXCLUDE_CODES
#   7.  cron-runner.sh loads config correctly
#   8.  cron-runner.sh rejects unknown job name
#   9.  cron-runner.sh dry-run mode
#  10.  HTTP timeout defaults loaded correctly
#  11.  curl_with_timeout function profiles
#  12.  config/reliability.json is valid JSON with all jobs
#  13.  All cron scripts are executable
#  14.  All cron scripts referenced in config exist
#  15.  Network timeout simulation (curl --max-time)
#  16.  guarded-run.sh handles exit code 124 (timeout)
#  17.  Retry does not retry excluded exit codes
#  18.  cron-runner.sh JSONL logging
#  19.  Degradation policy references all cron jobs
#  20.  HTTP defaults fallback when lib not sourced
#
# Usage: bash scripts/tests/test-reliability.sh
# Exit: 0 if all pass, 1 if any fail

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

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
  echo "  ⏭️  SKIP: $1 — ${2:-}"
}

section() {
  echo ""
  echo "━━━ $1 ━━━"
}

# ============================================================================
# Test 1: guarded-run.sh timeout enforcement
# ============================================================================

section "Test 1: guarded-run.sh timeout enforcement"

# Create a script that sleeps forever
cat > "$TMP_DIR/sleeper.sh" <<'EOF'
#!/usr/bin/env bash
sleep 999
EOF
chmod +x "$TMP_DIR/sleeper.sh"

START=$(date +%s)
set +e
"$SCRIPTS_DIR/guarded-run.sh" 3 1 0 "$TMP_DIR/sleeper.sh" >/dev/null 2>&1
RC=$?
set -e
END=$(date +%s)
ELAPSED=$((END - START))

if [[ $RC -eq 124 ]]; then
  pass "guarded-run.sh returns exit code 124 on timeout"
else
  fail "guarded-run.sh expected exit 124, got $RC"
fi

if [[ $ELAPSED -le 8 ]]; then
  pass "guarded-run.sh killed process within timeout window (${ELAPSED}s)"
else
  fail "guarded-run.sh took too long (${ELAPSED}s, expected ≤8s)"
fi

# ============================================================================
# Test 2: guarded-run.sh retry with backoff
# ============================================================================

section "Test 2: guarded-run.sh retry with backoff"

STATE_FILE="$TMP_DIR/retry-state.txt"
echo "0" > "$STATE_FILE"

cat > "$TMP_DIR/flaky.sh" <<EOF
#!/usr/bin/env bash
n=\$(cat "$STATE_FILE")
n=\$((n + 1))
echo "\$n" > "$STATE_FILE"
if [[ \$n -lt 3 ]]; then
  exit 1
fi
echo "SUCCESS_ON_ATTEMPT_\$n"
exit 0
EOF
chmod +x "$TMP_DIR/flaky.sh"

OUTPUT=$("$SCRIPTS_DIR/guarded-run.sh" 10 3 1 "$TMP_DIR/flaky.sh" 2>&1)
RC=$?

if [[ $RC -eq 0 ]]; then
  pass "guarded-run.sh succeeded after retries"
else
  fail "guarded-run.sh did not succeed, exit $RC"
fi

ATTEMPTS=$(cat "$STATE_FILE")
if [[ "$ATTEMPTS" == "3" ]]; then
  pass "guarded-run.sh made 3 attempts (2 failures + 1 success)"
else
  fail "Expected 3 attempts, got $ATTEMPTS"
fi

# ============================================================================
# Test 3: with-timeout.sh kills long-running process
# ============================================================================

section "Test 3: with-timeout.sh kills long-running process"

START=$(date +%s)
set +e
"$SCRIPTS_DIR/with-timeout.sh" 2 sleep 999 >/dev/null 2>&1
RC=$?
set -e
END=$(date +%s)
ELAPSED=$((END - START))

if [[ $RC -eq 124 ]]; then
  pass "with-timeout.sh returns 124 on timeout"
else
  fail "with-timeout.sh expected exit 124, got $RC"
fi

if [[ $ELAPSED -le 5 ]]; then
  pass "with-timeout.sh killed within window (${ELAPSED}s)"
else
  fail "with-timeout.sh took too long (${ELAPSED}s)"
fi

# ============================================================================
# Test 4: with-timeout.sh passes through success
# ============================================================================

section "Test 4: with-timeout.sh passes through success"

OUTPUT=$("$SCRIPTS_DIR/with-timeout.sh" 10 echo "QUICK_SUCCESS")
RC=$?

if [[ $RC -eq 0 && "$OUTPUT" == "QUICK_SUCCESS" ]]; then
  pass "with-timeout.sh passes through successful command"
else
  fail "with-timeout.sh failed or wrong output (rc=$RC, output=$OUTPUT)"
fi

# ============================================================================
# Test 5: retry.sh exponential backoff
# ============================================================================

section "Test 5: retry.sh exponential backoff"

STATE2="$TMP_DIR/retry2-state.txt"
echo "0" > "$STATE2"

cat > "$TMP_DIR/fail-twice.sh" <<EOF
#!/usr/bin/env bash
n=\$(cat "$STATE2")
n=\$((n + 1))
echo "\$n" > "$STATE2"
if [[ \$n -le 2 ]]; then
  exit 1
fi
exit 0
EOF
chmod +x "$TMP_DIR/fail-twice.sh"

START=$(date +%s)
"$SCRIPTS_DIR/retry.sh" 3 1 "$TMP_DIR/fail-twice.sh"
RC=$?
END=$(date +%s)
ELAPSED=$((END - START))

if [[ $RC -eq 0 ]]; then
  pass "retry.sh succeeded after 2 failures"
else
  fail "retry.sh did not succeed, exit $RC"
fi

# Backoff: 1s + 2s = 3s minimum
if [[ $ELAPSED -ge 2 ]]; then
  pass "retry.sh applied backoff (${ELAPSED}s, expected ≥2s)"
else
  fail "retry.sh backoff too short (${ELAPSED}s, expected ≥2s)"
fi

# ============================================================================
# Test 6: retry.sh respects RETRY_EXCLUDE_CODES
# ============================================================================

section "Test 6: retry.sh RETRY_EXCLUDE_CODES"

cat > "$TMP_DIR/auth-fail.sh" <<'EOF'
#!/usr/bin/env bash
exit 42
EOF
chmod +x "$TMP_DIR/auth-fail.sh"

START=$(date +%s)
set +e
RETRY_EXCLUDE_CODES="42" "$SCRIPTS_DIR/retry.sh" 3 2 "$TMP_DIR/auth-fail.sh"
RC=$?
set -e
END=$(date +%s)
ELAPSED=$((END - START))

if [[ $RC -eq 42 ]]; then
  pass "retry.sh exits immediately with excluded code 42"
else
  fail "retry.sh expected exit 42, got $RC"
fi

if [[ $ELAPSED -le 1 ]]; then
  pass "retry.sh did not backoff on excluded code (${ELAPSED}s)"
else
  fail "retry.sh should not have retried (took ${ELAPSED}s)"
fi

# ============================================================================
# Test 7: cron-runner.sh loads config correctly
# ============================================================================

section "Test 7: cron-runner.sh config loading"

# Test help/usage message
set +e
USAGE=$("$SCRIPTS_DIR/cron-runner.sh" 2>&1)
RC=$?
set -e

if [[ $RC -eq 2 ]] && echo "$USAGE" | grep -q "Available jobs"; then
  pass "cron-runner.sh shows usage with available jobs"
else
  fail "cron-runner.sh usage output unexpected (rc=$RC)"
fi

# ============================================================================
# Test 8: cron-runner.sh rejects unknown job name
# ============================================================================

section "Test 8: cron-runner.sh unknown job rejection"

set +e
OUTPUT=$("$SCRIPTS_DIR/cron-runner.sh" "nonexistent-job-xyz" 2>&1)
RC=$?
set -e

if [[ $RC -eq 2 ]]; then
  pass "cron-runner.sh rejects unknown job with exit 2"
else
  fail "cron-runner.sh expected exit 2 for unknown job, got $RC"
fi

# ============================================================================
# Test 9: cron-runner.sh dry-run mode
# ============================================================================

section "Test 9: cron-runner.sh dry-run"

set +e
DRY_RUN=true OUTPUT=$(DRY_RUN=true "$SCRIPTS_DIR/cron-runner.sh" "nightly-backup" 2>&1)
RC=$?
set -e

if [[ $RC -eq 0 ]] && echo "$OUTPUT" | grep -q "DRY_RUN"; then
  pass "cron-runner.sh dry-run mode works"
else
  fail "cron-runner.sh dry-run unexpected (rc=$RC, output=${OUTPUT:0:200})"
fi

# ============================================================================
# Test 10: HTTP timeout defaults loaded correctly
# ============================================================================

section "Test 10: HTTP timeout defaults"

(
  source "$SCRIPTS_DIR/lib/http-defaults.sh"

  if [[ "$HTTP_CONNECT_TIMEOUT" == "3" ]]; then
    echo "  ✅ PASS: HTTP_CONNECT_TIMEOUT default is 3s"
    echo "PASS" >> "$TMP_DIR/t10-results"
  else
    echo "  ❌ FAIL: HTTP_CONNECT_TIMEOUT expected 3, got $HTTP_CONNECT_TIMEOUT"
    echo "FAIL" >> "$TMP_DIR/t10-results"
  fi

  if [[ "$HTTP_TOTAL_TIMEOUT" == "20" ]]; then
    echo "  ✅ PASS: HTTP_TOTAL_TIMEOUT default is 20s"
    echo "PASS" >> "$TMP_DIR/t10-results"
  else
    echo "  ❌ FAIL: HTTP_TOTAL_TIMEOUT expected 20, got $HTTP_TOTAL_TIMEOUT"
    echo "FAIL" >> "$TMP_DIR/t10-results"
  fi

  if [[ "$CURL_WEBHOOK_FLAGS" == "--connect-timeout 2 --max-time 10" ]]; then
    echo "  ✅ PASS: CURL_WEBHOOK_FLAGS correct"
    echo "PASS" >> "$TMP_DIR/t10-results"
  else
    echo "  ❌ FAIL: CURL_WEBHOOK_FLAGS unexpected: $CURL_WEBHOOK_FLAGS"
    echo "FAIL" >> "$TMP_DIR/t10-results"
  fi
)

while IFS= read -r result; do
  if [[ "$result" == "PASS" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
  TOTAL=$((TOTAL + 1))
done < "$TMP_DIR/t10-results"

# ============================================================================
# Test 11: curl_with_timeout function profiles
# ============================================================================

section "Test 11: curl_with_timeout profiles"

(
  source "$SCRIPTS_DIR/lib/http-defaults.sh"

  # Test that the function exists and is callable
  if type curl_with_timeout >/dev/null 2>&1; then
    echo "  ✅ PASS: curl_with_timeout function available"
    echo "PASS" >> "$TMP_DIR/t11-results"
  else
    echo "  ❌ FAIL: curl_with_timeout function not found"
    echo "FAIL" >> "$TMP_DIR/t11-results"
  fi
)

while IFS= read -r result; do
  if [[ "$result" == "PASS" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
  TOTAL=$((TOTAL + 1))
done < "$TMP_DIR/t11-results"

# ============================================================================
# Test 12: config/reliability.json validation
# ============================================================================

section "Test 12: config/reliability.json validation"

CONFIG_FILE="$REPO_ROOT/config/reliability.json"

if [[ ! -f "$CONFIG_FILE" ]]; then
  fail "config/reliability.json not found"
else
  # Valid JSON?
  if python3 -c "import json; json.load(open('$CONFIG_FILE'))" 2>/dev/null; then
    pass "config/reliability.json is valid JSON"
  else
    fail "config/reliability.json is not valid JSON"
  fi

  # Has all expected jobs?
  EXPECTED_JOBS="nightly-backup weekly-backup-verify monitoring budget-check export-cron-logs archive-task-runs workspace-health phantom-detector session-rotation session-monitor routing-healthcheck openclaw-local-ready vb003-telemetry-synthesis vb003-watchdog"
  MISSING=""
  for job in $EXPECTED_JOBS; do
    if ! python3 -c "import json; assert '$job' in json.load(open('$CONFIG_FILE'))['cron_jobs']" 2>/dev/null; then
      MISSING="$MISSING $job"
    fi
  done

  if [[ -z "$MISSING" ]]; then
    pass "All 14 cron jobs defined in reliability config"
  else
    fail "Missing jobs in config:$MISSING"
  fi

  # All jobs have required fields?
  VALID=$(python3 - "$CONFIG_FILE" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1]))
required = ["script", "timeout_seconds", "max_attempts", "base_sleep_seconds", "has_network", "degradation_tier"]
missing = []
for name, job in cfg.get("cron_jobs", {}).items():
    for field in required:
        if field not in job:
            missing.append(f"{name}.{field}")
if missing:
    print("MISSING:" + ",".join(missing))
else:
    print("OK")
PY
)
  if [[ "$VALID" == "OK" ]]; then
    pass "All cron jobs have required fields"
  else
    fail "Missing fields: $VALID"
  fi
fi

# ============================================================================
# Test 13: All cron scripts are executable
# ============================================================================

section "Test 13: Script executability"

NON_EXEC=""
for script in \
  "$SCRIPTS_DIR/guarded-run.sh" \
  "$SCRIPTS_DIR/retry.sh" \
  "$SCRIPTS_DIR/with-timeout.sh" \
  "$SCRIPTS_DIR/cron-runner.sh" \
  "$SCRIPTS_DIR/backup-clawd.sh" \
  "$SCRIPTS_DIR/verify-backup.sh" \
  "$SCRIPTS_DIR/monitor-openclaw.sh" \
  "$SCRIPTS_DIR/budget-check.sh" \
  "$SCRIPTS_DIR/export-cron-logs.sh" \
  "$SCRIPTS_DIR/archive-task-runs.sh" \
  "$SCRIPTS_DIR/check-workspace-health.sh" \
  "$SCRIPTS_DIR/detect-phantom-sessions.sh" \
  "$SCRIPTS_DIR/rotate-agent-sessions.sh" \
  "$SCRIPTS_DIR/check-session-counts.sh" \
  "$SCRIPTS_DIR/routing-healthcheck.sh" \
  "$SCRIPTS_DIR/openclaw-local-ready-cron.sh" \
  "$SCRIPTS_DIR/vb003-telemetry-synthesis.sh" \
  "$SCRIPTS_DIR/vb003-watchdog.sh"; do
  if [[ -f "$script" && ! -x "$script" ]]; then
    NON_EXEC="$NON_EXEC $(basename "$script")"
  fi
done

if [[ -z "$NON_EXEC" ]]; then
  pass "All cron scripts are executable"
else
  fail "Non-executable scripts:$NON_EXEC"
fi

# ============================================================================
# Test 14: All config scripts exist
# ============================================================================

section "Test 14: Config script references"

MISSING_SCRIPTS=$(python3 - "$CONFIG_FILE" "$REPO_ROOT" <<'PY'
import json, sys
from pathlib import Path

cfg = json.load(open(sys.argv[1]))
repo = Path(sys.argv[2])
missing = []
for name, job in cfg.get("cron_jobs", {}).items():
    script = repo / job["script"]
    if not script.exists():
        missing.append(f"{name}:{job['script']}")
if missing:
    print(",".join(missing))
else:
    print("OK")
PY
)

if [[ "$MISSING_SCRIPTS" == "OK" ]]; then
  pass "All scripts referenced in config exist"
else
  fail "Missing scripts: $MISSING_SCRIPTS"
fi

# ============================================================================
# Test 15: Network timeout simulation
# ============================================================================

section "Test 15: Network timeout simulation"

# Use curl against a non-routable IP to trigger connect timeout
START=$(date +%s)
set +e
# 192.0.2.1 is TEST-NET (RFC 5737), guaranteed non-routable
curl --connect-timeout 2 --max-time 3 http://192.0.2.1/ >/dev/null 2>&1
RC=$?
set -e
END=$(date +%s)
ELAPSED=$((END - START))

# curl exit codes: 7=connect fail, 28=timeout
if [[ $RC -eq 7 || $RC -eq 28 ]]; then
  pass "curl correctly reports timeout/connection failure (rc=$RC, ${ELAPSED}s)"
else
  fail "curl unexpected exit code $RC (expected 7 or 28)"
fi

if [[ $ELAPSED -le 6 ]]; then
  pass "curl respected --max-time within bounds (${ELAPSED}s)"
else
  fail "curl exceeded --max-time (${ELAPSED}s, expected ≤6s)"
fi

# ============================================================================
# Test 16: guarded-run.sh exit code 124 passthrough
# ============================================================================

section "Test 16: Timeout exit code 124"

cat > "$TMP_DIR/slow-cmd.sh" <<'EOF'
#!/usr/bin/env bash
sleep 60
EOF
chmod +x "$TMP_DIR/slow-cmd.sh"

set +e
"$SCRIPTS_DIR/guarded-run.sh" 2 1 0 "$TMP_DIR/slow-cmd.sh" >/dev/null 2>&1
RC=$?
set -e

if [[ $RC -eq 124 ]]; then
  pass "Timeout produces exit code 124 (matching standard convention)"
else
  fail "Expected exit code 124 for timeout, got $RC"
fi

# ============================================================================
# Test 17: retry.sh max attempts exhausted
# ============================================================================

section "Test 17: Retry max attempts exhausted"

cat > "$TMP_DIR/always-fail.sh" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$TMP_DIR/always-fail.sh"

START=$(date +%s)
set +e
"$SCRIPTS_DIR/retry.sh" 2 1 "$TMP_DIR/always-fail.sh"
RC=$?
set -e
END=$(date +%s)
ELAPSED=$((END - START))

if [[ $RC -eq 1 ]]; then
  pass "retry.sh propagates failure exit code after exhausting attempts"
else
  fail "retry.sh expected exit 1, got $RC"
fi

# Backoff of 1s between attempt 1 and 2
if [[ $ELAPSED -ge 1 ]]; then
  pass "retry.sh applied backoff before giving up (${ELAPSED}s)"
else
  fail "retry.sh backoff too short (${ELAPSED}s)"
fi

# ============================================================================
# Test 18: cron-runner.sh JSONL logging
# ============================================================================

section "Test 18: cron-runner.sh JSONL logging"

# Create a temp workspace config and run a trivial job
CRON_LOG_DIR="$TMP_DIR/cron-logs"
mkdir -p "$CRON_LOG_DIR"

# Run nightly-backup (which will likely fail in test env, but that's ok)
set +e
CRON_LOG_DIR="$CRON_LOG_DIR" "$SCRIPTS_DIR/cron-runner.sh" "nightly-backup" >/dev/null 2>&1
RC=$?
set -e

LOG_FILE="$CRON_LOG_DIR/nightly-backup.jsonl"
if [[ -f "$LOG_FILE" ]]; then
  # Check that it has valid JSONL entries
  LAST_LINE=$(tail -1 "$LOG_FILE")
  if echo "$LAST_LINE" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'event' in d and 'job' in d" 2>/dev/null; then
    pass "cron-runner.sh writes valid JSONL log entries"
  else
    fail "JSONL log entry invalid: $LAST_LINE"
  fi

  # Check start event exists
  if grep -q '"event":"start"' "$LOG_FILE" 2>/dev/null; then
    pass "cron-runner.sh logs start event"
  else
    fail "cron-runner.sh missing start event in log"
  fi
else
  fail "cron-runner.sh did not create log file at $LOG_FILE"
fi

# ============================================================================
# Test 19: Degradation policy references all cron jobs
# ============================================================================

section "Test 19: Degradation policy completeness"

DEGRAD_FILE="$REPO_ROOT/docs/DEGRADATION_POLICY.md"
if [[ -f "$DEGRAD_FILE" ]]; then
  MISSING_IN_DOC=""
  for job in "Nightly Backup" "Backup Verify" "Monitoring" "Budget Check" "Export Cron Logs" "Archive Task Runs" "Workspace Health" "Phantom Detector" "Session Rotation" "Session Monitor" "Routing Healthcheck" "OpenClaw Local Readiness Refresh" "VB-003 Telemetry Synthesis" "VB-003 Watchdog"; do
    if ! grep -qi "$job" "$DEGRAD_FILE" 2>/dev/null; then
      MISSING_IN_DOC="$MISSING_IN_DOC '$job'"
    fi
  done

  if [[ -z "$MISSING_IN_DOC" ]]; then
    pass "Degradation policy documents all 14 cron jobs"
  else
    fail "Degradation policy missing:$MISSING_IN_DOC"
  fi

  # Check for degradation matrix section
  if grep -q "Cron Job Degradation Matrix" "$DEGRAD_FILE" 2>/dev/null; then
    pass "Degradation matrix section exists"
  else
    fail "Degradation matrix section not found"
  fi
else
  fail "DEGRADATION_POLICY.md not found"
fi

# ============================================================================
# Test 20: HTTP defaults fallback when lib not sourced
# ============================================================================

section "Test 20: HTTP defaults fallback"

# Scripts should use fallback values in ${CURL_WEBHOOK_FLAGS:-"..."} patterns
SCRIPTS_WITH_CURL=(
  "$SCRIPTS_DIR/check-workspace-health.sh"
  "$SCRIPTS_DIR/detect-phantom-sessions.sh"
  "$SCRIPTS_DIR/rotate-agent-sessions.sh"
  "$SCRIPTS_DIR/check-session-counts.sh"
  "$SCRIPTS_DIR/phantom-detector.sh"
)

ALL_HAVE_FALLBACK=true
for script in "${SCRIPTS_WITH_CURL[@]}"; do
  if [[ -f "$script" ]] && grep -q "curl" "$script"; then
    if grep -q 'CURL_WEBHOOK_FLAGS:-' "$script" || grep -q 'CURL_TIMEOUT_FLAGS:-' "$script"; then
      : # has fallback
    else
      ALL_HAVE_FALLBACK=false
      echo "         Missing fallback in: $(basename "$script")"
    fi
  fi
done

if [[ "$ALL_HAVE_FALLBACK" == "true" ]]; then
  pass "All curl-using scripts have timeout fallback defaults"
else
  fail "Some scripts missing curl timeout fallbacks"
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Reliability Tests: ${PASS}/${TOTAL} passed, ${FAIL} failed, ${SKIP} skipped"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
else
  echo "🎉 All reliability tests passed!"
  exit 0
fi
