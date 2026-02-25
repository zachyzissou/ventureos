#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/pr-queue-sweep.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

FIXTURE="$TMP_DIR/prs.json"
REPORT="$TMP_DIR/report.json"
MERGE_REPORT="$TMP_DIR/merge-report.json"
BLOCKED_REPORT="$TMP_DIR/blocked-report.json"
QUEUE_REPORT_DIR="$TMP_DIR/queue-reports"
CALL_LOG="$TMP_DIR/calls.log"
FAKE_READINESS="$TMP_DIR/fake-pr-merge-readiness.sh"
FAKE_REQUIRED="$TMP_DIR/fake-required-checks.sh"

cat > "$FIXTURE" <<'EOF_JSON'
[
  {
    "number": 101,
    "title": "Draft PR",
    "url": "https://example/pr/101",
    "isDraft": true,
    "reviewDecision": "",
    "mergeStateStatus": "DIRTY",
    "headRefName": "codex/draft",
    "baseRefName": "main",
    "author": { "login": "dev1" }
  },
  {
    "number": 102,
    "title": "Approved and clean",
    "url": "https://example/pr/102",
    "isDraft": false,
    "reviewDecision": "APPROVED",
    "mergeStateStatus": "CLEAN",
    "headRefName": "codex/clean",
    "baseRefName": "main",
    "author": { "login": "dev2" }
  },
  {
    "number": 103,
    "title": "Waiting review",
    "url": "https://example/pr/103",
    "isDraft": false,
    "reviewDecision": "",
    "mergeStateStatus": "CLEAN",
    "headRefName": "codex/review",
    "baseRefName": "main",
    "author": { "login": "dev3" }
  },
  {
    "number": 104,
    "title": "Approved but blocked",
    "url": "https://example/pr/104",
    "isDraft": false,
    "reviewDecision": "APPROVED",
    "mergeStateStatus": "DIRTY",
    "headRefName": "codex/blocked",
    "baseRefName": "main",
    "author": { "login": "dev4" }
  }
]
EOF_JSON

PR_QUEUE_FIXTURE_JSON="$FIXTURE" bash "$SCRIPT" --json-out "$REPORT" >/tmp/test-pr-queue-sweep.out

jq -e '.summary.totalOpen == 4' "$REPORT" >/dev/null
jq -e '.summary.draft == 1' "$REPORT" >/dev/null
jq -e '.summary.reviewNeeded == 1' "$REPORT" >/dev/null
jq -e '.summary.approvedMergeReady == 1' "$REPORT" >/dev/null
jq -e '.summary.approvedBlocked == 1' "$REPORT" >/dev/null

grep -q $'#102\tapproved-merge-ready' /tmp/test-pr-queue-sweep.out
grep -q "PR_QUEUE_STATUS=merge-ready" /tmp/test-pr-queue-sweep.out
echo "PR_QUEUE_SWEEP_CLASSIFY_OK"

cat > "$FAKE_READINESS" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

pr=""
json_out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)
      pr="${2:-}"
      shift 2
      ;;
    --json-out)
      json_out="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "readiness:$pr" >> "$CALL_LOG"
if [[ "${FAIL_READY_PR:-}" == "$pr" ]]; then
  exit 3
fi

mkdir -p "$(dirname "$json_out")"
cat > "$json_out" <<JSON
{"status":"merge-ready","number":$pr}
JSON
exit 0
SH

cat > "$FAKE_REQUIRED" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

pr=""
json_out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)
      pr="${2:-}"
      shift 2
      ;;
    --json-out)
      json_out="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "required:$pr" >> "$CALL_LOG"
if [[ "${FAIL_REQUIRED_PR:-}" == "$pr" ]]; then
  exit 4
fi

mkdir -p "$(dirname "$json_out")"
cat > "$json_out" <<JSON
{"status":"aligned-ready","number":$pr}
JSON
exit 0
SH

chmod +x "$FAKE_READINESS" "$FAKE_REQUIRED"
export CALL_LOG

PR_QUEUE_FIXTURE_JSON="$FIXTURE" \
PR_QUEUE_READINESS_SCRIPT="$FAKE_READINESS" \
PR_QUEUE_REQUIRED_CHECKS_SCRIPT="$FAKE_REQUIRED" \
bash "$SCRIPT" --merge-approved --dry-run --report-dir "$QUEUE_REPORT_DIR" --json-out "$MERGE_REPORT" >/tmp/test-pr-queue-sweep-merge.out

grep -q "\[dry-run\] would merge PR #102" /tmp/test-pr-queue-sweep-merge.out
grep -q "PR_QUEUE_MERGE_EXECUTION_STATUS=ready-executed" /tmp/test-pr-queue-sweep-merge.out
grep -q "readiness:102" "$CALL_LOG"
grep -q "required:102" "$CALL_LOG"
jq -e '.mergeExecution.summary.dryRun == 1' "$MERGE_REPORT" >/dev/null
jq -e '.mergeExecution.summary.blocked == 0' "$MERGE_REPORT" >/dev/null
echo "PR_QUEUE_SWEEP_DRY_MERGE_OK"

: > "$CALL_LOG"
PR_QUEUE_FIXTURE_JSON="$FIXTURE" \
PR_QUEUE_READINESS_SCRIPT="$FAKE_READINESS" \
PR_QUEUE_REQUIRED_CHECKS_SCRIPT="$FAKE_REQUIRED" \
FAIL_READY_PR=102 \
bash "$SCRIPT" --merge-approved --dry-run --report-dir "$QUEUE_REPORT_DIR" --json-out "$BLOCKED_REPORT" >/tmp/test-pr-queue-sweep-blocked.out

grep -q "SKIP merge PR #102" /tmp/test-pr-queue-sweep-blocked.out
grep -q "PR_QUEUE_MERGE_EXECUTION_STATUS=blocked" /tmp/test-pr-queue-sweep-blocked.out
jq -e '.mergeExecution.summary.blocked == 1' "$BLOCKED_REPORT" >/dev/null
jq -e '.mergeExecution.summary.dryRun == 0' "$BLOCKED_REPORT" >/dev/null
echo "PR_QUEUE_SWEEP_BLOCKED_OK"
