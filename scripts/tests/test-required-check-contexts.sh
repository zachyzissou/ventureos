#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/required-check-contexts.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

PR_FIXTURE="$TMP_DIR/pr.json"
REQUIRED_FIXTURE="$TMP_DIR/required.json"
STATUS_PASS_FIXTURE="$TMP_DIR/status-pass.json"
CHECKS_PASS_FIXTURE="$TMP_DIR/checks-pass.json"
STATUS_MISSING_FIXTURE="$TMP_DIR/status-missing.json"
CHECKS_MISSING_FIXTURE="$TMP_DIR/checks-missing.json"
STATUS_FAIL_FIXTURE="$TMP_DIR/status-fail.json"
CHECKS_FAIL_FIXTURE="$TMP_DIR/checks-fail.json"

cat > "$PR_FIXTURE" <<'EOF_JSON'
{
  "number": 999,
  "url": "https://example/pr/999",
  "baseRefName": "main",
  "headRefOid": "abc123",
  "state": "OPEN"
}
EOF_JSON

cat > "$REQUIRED_FIXTURE" <<'EOF_JSON'
{
  "strict": true,
  "contexts": ["baseline-ts-ci", "build-and-test"]
}
EOF_JSON

cat > "$STATUS_PASS_FIXTURE" <<'EOF_JSON'
{
  "state": "success",
  "statuses": [
    {
      "context": "baseline-ts-ci",
      "state": "success",
      "target_url": "https://example/check/baseline"
    }
  ]
}
EOF_JSON

cat > "$CHECKS_PASS_FIXTURE" <<'EOF_JSON'
{
  "check_runs": [
    {
      "name": "build-and-test",
      "status": "COMPLETED",
      "conclusion": "SUCCESS",
      "details_url": "https://example/check/build-and-test"
    }
  ]
}
EOF_JSON

cat > "$STATUS_MISSING_FIXTURE" <<'EOF_JSON'
{
  "state": "success",
  "statuses": [
    {
      "context": "baseline-ts-ci",
      "state": "success",
      "target_url": "https://example/check/baseline"
    }
  ]
}
EOF_JSON

cat > "$CHECKS_MISSING_FIXTURE" <<'EOF_JSON'
{
  "check_runs": [
    {
      "name": "lint-typecheck-test-build",
      "status": "COMPLETED",
      "conclusion": "SUCCESS",
      "details_url": "https://example/check/lint-typecheck-test-build"
    }
  ]
}
EOF_JSON

cat > "$STATUS_FAIL_FIXTURE" <<'EOF_JSON'
{
  "state": "failure",
  "statuses": [
    {
      "context": "baseline-ts-ci",
      "state": "failure",
      "target_url": "https://example/check/baseline"
    }
  ]
}
EOF_JSON

cat > "$CHECKS_FAIL_FIXTURE" <<'EOF_JSON'
{
  "check_runs": [
    {
      "name": "build-and-test",
      "status": "COMPLETED",
      "conclusion": "SUCCESS",
      "details_url": "https://example/check/build-and-test"
    }
  ]
}
EOF_JSON

PASS_REPORT="$TMP_DIR/pass-report.json"
PR_HEAD_FIXTURE_JSON="$PR_FIXTURE" \
REQUIRED_CHECKS_FIXTURE_JSON="$REQUIRED_FIXTURE" \
COMMIT_STATUS_FIXTURE_JSON="$STATUS_PASS_FIXTURE" \
CHECK_RUNS_FIXTURE_JSON="$CHECKS_PASS_FIXTURE" \
bash "$SCRIPT" --pr 999 --json-out "$PASS_REPORT" >/tmp/test-required-check-contexts-pass.out

jq -e '.status == "aligned-ready"' "$PASS_REPORT" >/dev/null
jq -e '.exitCode == 0' "$PASS_REPORT" >/dev/null
grep -q "REQUIRED_CHECK_CONTEXT_STATUS=aligned-ready" /tmp/test-required-check-contexts-pass.out
echo "REQUIRED_CHECK_CONTEXT_AUDIT_PASS_OK"

MISSING_REPORT="$TMP_DIR/missing-report.json"
set +e
PR_HEAD_FIXTURE_JSON="$PR_FIXTURE" \
REQUIRED_CHECKS_FIXTURE_JSON="$REQUIRED_FIXTURE" \
COMMIT_STATUS_FIXTURE_JSON="$STATUS_MISSING_FIXTURE" \
CHECK_RUNS_FIXTURE_JSON="$CHECKS_MISSING_FIXTURE" \
bash "$SCRIPT" --pr 999 --json-out "$MISSING_REPORT" >/tmp/test-required-check-contexts-missing.out 2>&1
missing_rc=$?
set -e

if [[ "$missing_rc" -ne 3 ]]; then
  echo "expected missing-context run to exit 3, got $missing_rc" >&2
  cat /tmp/test-required-check-contexts-missing.out >&2
  exit 1
fi
jq -e '.status == "missing-contexts"' "$MISSING_REPORT" >/dev/null
jq -e '.summary.missing == 1' "$MISSING_REPORT" >/dev/null
jq -e '.rows[] | select(.context == "build-and-test" and .result == "missing")' "$MISSING_REPORT" >/dev/null
grep -q "REQUIRED_CHECK_CONTEXT_STATUS=missing-contexts" /tmp/test-required-check-contexts-missing.out
echo "REQUIRED_CHECK_CONTEXT_AUDIT_MISSING_OK"

FAIL_REPORT="$TMP_DIR/fail-report.json"
set +e
PR_HEAD_FIXTURE_JSON="$PR_FIXTURE" \
REQUIRED_CHECKS_FIXTURE_JSON="$REQUIRED_FIXTURE" \
COMMIT_STATUS_FIXTURE_JSON="$STATUS_FAIL_FIXTURE" \
CHECK_RUNS_FIXTURE_JSON="$CHECKS_FAIL_FIXTURE" \
bash "$SCRIPT" --pr 999 --json-out "$FAIL_REPORT" >/tmp/test-required-check-contexts-fail.out 2>&1
fail_rc=$?
set -e

if [[ "$fail_rc" -ne 4 ]]; then
  echo "expected failing-context run to exit 4, got $fail_rc" >&2
  cat /tmp/test-required-check-contexts-fail.out >&2
  exit 1
fi
jq -e '.status == "aligned-not-ready"' "$FAIL_REPORT" >/dev/null
jq -e '.summary.failing == 1' "$FAIL_REPORT" >/dev/null
jq -e '.rows[] | select(.context == "baseline-ts-ci" and .result == "fail")' "$FAIL_REPORT" >/dev/null
grep -q "REQUIRED_CHECK_CONTEXT_STATUS=aligned-not-ready" /tmp/test-required-check-contexts-fail.out
echo "REQUIRED_CHECK_CONTEXT_AUDIT_FAILING_OK"
