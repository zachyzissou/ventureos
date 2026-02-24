#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/post-merge-queue-snapshot.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

FAKE_QUEUE="$TMP_DIR/fake-queue.sh"
CALL_LOG="$TMP_DIR/queue-calls.log"
touch "$CALL_LOG"

cat > "$FAKE_QUEUE" <<'EOF_FAKE'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$CALL_LOG"
json_out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json-out)
      json_out="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [[ -n "$json_out" ]]; then
  mkdir -p "$(dirname "$json_out")"
  cat > "$json_out" <<'JSON'
{"summary":{"queueStatus":"quiet","totalOpen":0},"prs":[]}
JSON
fi
echo "PR_QUEUE_STATUS=${FAKE_QUEUE_STATUS:-quiet}"
exit "${FAKE_QUEUE_RC:-0}"
EOF_FAKE
chmod +x "$FAKE_QUEUE"

QUEUE_JSON="$TMP_DIR/queue-latest.json"
PASS_OUT="$TMP_DIR/pass.out"
CALL_LOG="$CALL_LOG" \
bash "$SCRIPT" \
  --queue-script "$FAKE_QUEUE" \
  --queue-json "$QUEUE_JSON" \
  -- --merge-approved > "$PASS_OUT" 2>&1

grep -q "^POST_MERGE_QUEUE_STATUS=PASS" "$PASS_OUT"
grep -q "^POST_MERGE_QUEUE_JSON=$QUEUE_JSON" "$PASS_OUT"
grep -q "^POST_MERGE_QUEUE_SWEEP_STATUS=quiet" "$PASS_OUT"
grep -q "^POST_MERGE_QUEUE_EXIT_CODE=0" "$PASS_OUT"
grep -q "^--json-out $QUEUE_JSON --merge-approved$" "$CALL_LOG"
[[ -f "$QUEUE_JSON" ]]

FAIL_OUT="$TMP_DIR/fail.out"
set +e
CALL_LOG="$CALL_LOG" \
FAKE_QUEUE_STATUS=blocked \
FAKE_QUEUE_RC=5 \
bash "$SCRIPT" \
  --queue-script "$FAKE_QUEUE" \
  --queue-json "$QUEUE_JSON" > "$FAIL_OUT" 2>&1
FAIL_RC=$?
set -e

if [[ "$FAIL_RC" -ne 5 ]]; then
  echo "expected failure rc=5 to propagate, got $FAIL_RC" >&2
  exit 1
fi
grep -q "^POST_MERGE_QUEUE_STATUS=FAIL" "$FAIL_OUT"
grep -q "^POST_MERGE_QUEUE_SWEEP_STATUS=blocked" "$FAIL_OUT"
grep -q "^POST_MERGE_QUEUE_EXIT_CODE=5" "$FAIL_OUT"

echo "POST_MERGE_QUEUE_SNAPSHOT_TEST_OK"
