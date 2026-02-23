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
echo "PR_QUEUE_SWEEP_CLASSIFY_OK"

PR_QUEUE_FIXTURE_JSON="$FIXTURE" bash "$SCRIPT" --merge-approved --dry-run >/tmp/test-pr-queue-sweep-merge.out
grep -q "\[dry-run\] would merge PR #102" /tmp/test-pr-queue-sweep-merge.out
echo "PR_QUEUE_SWEEP_DRY_MERGE_OK"
