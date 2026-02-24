#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/post-merge-cadence.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

FAKE_PREFLIGHT="$TMP_DIR/fake-preflight-trigger.sh"
FAKE_QUEUE="$TMP_DIR/fake-queue-trigger.sh"
PREFLIGHT_CALL_LOG="$TMP_DIR/preflight-calls.log"
QUEUE_CALL_LOG="$TMP_DIR/queue-calls.log"
touch "$PREFLIGHT_CALL_LOG" "$QUEUE_CALL_LOG"

cat > "$FAKE_PREFLIGHT" <<'EOF_PREFLIGHT'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$PREFLIGHT_CALL_LOG"
echo "POST_MERGE_PREFLIGHT_STATUS=${FAKE_PREFLIGHT_STATUS:-SKIPPED}"
echo "POST_MERGE_PREFLIGHT_EVIDENCE_JSON=${FAKE_PREFLIGHT_EVIDENCE_JSON:-fake-preflight.json}"
exit "${FAKE_PREFLIGHT_RC:-0}"
EOF_PREFLIGHT
chmod +x "$FAKE_PREFLIGHT"

cat > "$FAKE_QUEUE" <<'EOF_QUEUE'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$QUEUE_CALL_LOG"
queue_json=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --queue-json)
      queue_json="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [[ -n "$queue_json" ]]; then
  mkdir -p "$(dirname "$queue_json")"
  echo '{"summary":{"queueStatus":"quiet"},"prs":[]}' > "$queue_json"
fi
echo "POST_MERGE_QUEUE_SWEEP_STATUS=${FAKE_QUEUE_STATUS:-quiet}"
exit "${FAKE_QUEUE_RC:-0}"
EOF_QUEUE
chmod +x "$FAKE_QUEUE"

SUCCESS_REPORT_DIR="$TMP_DIR/success-reports"
SUCCESS_OUT="$TMP_DIR/success.out"
SUCCESS_QUEUE_JSON="$TMP_DIR/success-queue.json"
PREFLIGHT_CALL_LOG="$PREFLIGHT_CALL_LOG" \
QUEUE_CALL_LOG="$QUEUE_CALL_LOG" \
POST_MERGE_CADENCE_PREFLIGHT_TRIGGER_SCRIPT="$FAKE_PREFLIGHT" \
POST_MERGE_CADENCE_QUEUE_TRIGGER_SCRIPT="$FAKE_QUEUE" \
bash "$SCRIPT" \
  --report-dir "$SUCCESS_REPORT_DIR" \
  --queue-json "$SUCCESS_QUEUE_JSON" \
  --base-ref HEAD~1 \
  --head-ref HEAD > "$SUCCESS_OUT" 2>&1

grep -q "^POST_MERGE_CADENCE_STATUS=PASS" "$SUCCESS_OUT"
SUCCESS_JSON="$(grep -E '^POST_MERGE_CADENCE_JSON=' "$SUCCESS_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$SUCCESS_JSON" ]]
python3 - "$SUCCESS_JSON" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["status"] == "pass", payload
steps = {row["id"]: row for row in payload["steps"]}
assert steps["post-merge-preflight-trigger"]["status"] == "pass", steps
assert steps["post-merge-queue-snapshot"]["status"] == "pass", steps
print("POST_MERGE_CADENCE_SUCCESS_OK")
PY

FAIL_CONTINUE_REPORT_DIR="$TMP_DIR/fail-continue-reports"
FAIL_CONTINUE_OUT="$TMP_DIR/fail-continue.out"
set +e
PREFLIGHT_CALL_LOG="$PREFLIGHT_CALL_LOG" \
QUEUE_CALL_LOG="$QUEUE_CALL_LOG" \
FAKE_PREFLIGHT_STATUS=REQUIRED \
FAKE_PREFLIGHT_RC=7 \
POST_MERGE_CADENCE_PREFLIGHT_TRIGGER_SCRIPT="$FAKE_PREFLIGHT" \
POST_MERGE_CADENCE_QUEUE_TRIGGER_SCRIPT="$FAKE_QUEUE" \
bash "$SCRIPT" \
  --report-dir "$FAIL_CONTINUE_REPORT_DIR" \
  --queue-json "$TMP_DIR/fail-continue-queue.json" \
  --base-ref HEAD~1 \
  --head-ref HEAD > "$FAIL_CONTINUE_OUT" 2>&1
FAIL_CONTINUE_RC=$?
set -e
if [[ "$FAIL_CONTINUE_RC" -ne 7 ]]; then
  echo "expected continue-mode preflight failure rc=7, got $FAIL_CONTINUE_RC" >&2
  exit 1
fi
grep -q "^POST_MERGE_CADENCE_STATUS=FAIL" "$FAIL_CONTINUE_OUT"
grep -q "^POST_MERGE_CADENCE_EXIT_CODE=7" "$FAIL_CONTINUE_OUT"
grep -q "queue-json $TMP_DIR/fail-continue-queue.json" "$QUEUE_CALL_LOG"

STOP_REPORT_DIR="$TMP_DIR/stop-reports"
STOP_OUT="$TMP_DIR/stop.out"
before_queue_calls="$(wc -l < "$QUEUE_CALL_LOG")"
set +e
PREFLIGHT_CALL_LOG="$PREFLIGHT_CALL_LOG" \
QUEUE_CALL_LOG="$QUEUE_CALL_LOG" \
FAKE_PREFLIGHT_STATUS=REQUIRED \
FAKE_PREFLIGHT_RC=7 \
POST_MERGE_CADENCE_PREFLIGHT_TRIGGER_SCRIPT="$FAKE_PREFLIGHT" \
POST_MERGE_CADENCE_QUEUE_TRIGGER_SCRIPT="$FAKE_QUEUE" \
bash "$SCRIPT" \
  --stop-on-failure \
  --report-dir "$STOP_REPORT_DIR" \
  --queue-json "$TMP_DIR/stop-queue.json" \
  --base-ref HEAD~1 \
  --head-ref HEAD > "$STOP_OUT" 2>&1
STOP_RC=$?
set -e
if [[ "$STOP_RC" -ne 7 ]]; then
  echo "expected stop-on-failure preflight failure rc=7, got $STOP_RC" >&2
  exit 1
fi
after_queue_calls="$(wc -l < "$QUEUE_CALL_LOG")"
if [[ "$after_queue_calls" -ne "$before_queue_calls" ]]; then
  echo "queue trigger should be skipped when --stop-on-failure is set" >&2
  exit 1
fi

STOP_JSON="$(grep -E '^POST_MERGE_CADENCE_JSON=' "$STOP_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$STOP_JSON" ]]
python3 - "$STOP_JSON" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["status"] == "fail", payload
steps = {row["id"]: row for row in payload["steps"]}
assert steps["post-merge-preflight-trigger"]["status"] == "fail", steps
assert steps["post-merge-queue-snapshot"]["status"] == "skipped", steps
print("POST_MERGE_CADENCE_STOP_ON_FAILURE_OK")
PY

echo "POST_MERGE_CADENCE_TEST_OK"
