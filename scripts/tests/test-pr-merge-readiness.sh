#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/pr-merge-readiness.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

READY_FIXTURE="$TMP_DIR/ready.json"
BLOCKED_FIXTURE="$TMP_DIR/blocked.json"
READY_REPORT="$TMP_DIR/ready-report.json"
BLOCKED_REPORT="$TMP_DIR/blocked-report.json"

cat > "$READY_FIXTURE" <<'EOF_JSON'
{
  "number": 501,
  "title": "Ready PR",
  "url": "https://example/pr/501",
  "state": "OPEN",
  "isDraft": false,
  "reviewDecision": "APPROVED",
  "mergeStateStatus": "CLEAN",
  "author": { "login": "dev-ready" },
  "baseRefName": "main",
  "headRefName": "codex/ready",
  "statusCheckRollup": [
    {
      "name": "baseline-ts-ci",
      "status": "COMPLETED",
      "conclusion": "SUCCESS",
      "workflowName": "baseline-ts-ci",
      "detailsUrl": "https://example/check/baseline-ts-ci"
    },
    {
      "name": "build-and-test",
      "status": "COMPLETED",
      "conclusion": "SUCCESS",
      "workflowName": "core-lib-ci",
      "detailsUrl": "https://example/check/build-and-test"
    }
  ]
}
EOF_JSON

cat > "$BLOCKED_FIXTURE" <<'EOF_JSON'
{
  "number": 502,
  "title": "Blocked PR",
  "url": "https://example/pr/502",
  "state": "OPEN",
  "isDraft": false,
  "reviewDecision": "REVIEW_REQUIRED",
  "mergeStateStatus": "BLOCKED",
  "author": { "login": "dev-blocked" },
  "baseRefName": "main",
  "headRefName": "codex/blocked",
  "statusCheckRollup": [
    {
      "name": "baseline-ts-ci",
      "status": "IN_PROGRESS",
      "conclusion": "",
      "workflowName": "baseline-ts-ci",
      "detailsUrl": "https://example/check/baseline-ts-ci"
    },
    {
      "name": "build-and-test",
      "status": "COMPLETED",
      "conclusion": "FAILURE",
      "workflowName": "core-lib-ci",
      "detailsUrl": "https://example/check/build-and-test"
    }
  ]
}
EOF_JSON

PR_MERGE_READINESS_FIXTURE_JSON="$READY_FIXTURE" \
bash "$SCRIPT" --pr 501 --json-out "$READY_REPORT" >/tmp/test-pr-merge-readiness-ready.out

jq -e '.status == "merge-ready"' "$READY_REPORT" >/dev/null
jq -e '.exitCode == 0' "$READY_REPORT" >/dev/null
jq -e '.blockers | length == 0' "$READY_REPORT" >/dev/null
grep -q "PR_MERGE_READINESS_STATUS=merge-ready" /tmp/test-pr-merge-readiness-ready.out
echo "PR_MERGE_READINESS_READY_OK"

set +e
PR_MERGE_READINESS_FIXTURE_JSON="$BLOCKED_FIXTURE" \
bash "$SCRIPT" --pr 502 --json-out "$BLOCKED_REPORT" >/tmp/test-pr-merge-readiness-blocked.out 2>&1
blocked_rc=$?
set -e

if [[ "$blocked_rc" -ne 3 ]]; then
  echo "expected blocked fixture to exit 3, got $blocked_rc" >&2
  cat /tmp/test-pr-merge-readiness-blocked.out >&2
  exit 1
fi

jq -e '.status == "blocked"' "$BLOCKED_REPORT" >/dev/null
jq -e '.exitCode == 3' "$BLOCKED_REPORT" >/dev/null
jq -e '.blockers | length >= 3' "$BLOCKED_REPORT" >/dev/null
jq -e '.blockers[] | select(.id == "approval-required")' "$BLOCKED_REPORT" >/dev/null
jq -e '.blockers[] | select(.id == "checks-pending")' "$BLOCKED_REPORT" >/dev/null
jq -e '.blockers[] | select(.id == "checks-failing")' "$BLOCKED_REPORT" >/dev/null
grep -q "PR_MERGE_READINESS_STATUS=blocked" /tmp/test-pr-merge-readiness-blocked.out
echo "PR_MERGE_READINESS_BLOCKED_OK"
