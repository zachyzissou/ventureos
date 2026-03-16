#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/run-local-integration-cadence.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

CADENCE_DIR="$TMP_DIR/cadence"
PREFLIGHT_REPORT_DIR="$TMP_DIR/preflight-reports"
PREFLIGHT_JSON="$TMP_DIR/preflight-latest.json"
QUEUE_JSON="$TMP_DIR/queue-latest.json"
CHECKLIST_PATH="$TMP_DIR/LOCAL_INTEGRATION_CHECKLIST.md"
CALL_LOG="$TMP_DIR/calls.log"
FAKE_PREFLIGHT="$TMP_DIR/fake-preflight.sh"
FAKE_QUEUE="$TMP_DIR/fake-queue.sh"
FAKE_CHECKLIST="$TMP_DIR/fake-checklist.sh"
FAKE_VALIDATE="$TMP_DIR/fake-validate.sh"

mkdir -p "$CADENCE_DIR" "$PREFLIGHT_REPORT_DIR"
echo "# checklist fixture" > "$CHECKLIST_PATH"
touch "$CALL_LOG"

cat > "$FAKE_PREFLIGHT" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "preflight|$*" >> "$CALL_LOG"
echo "VENTUREOS_PREFLIGHT_EVIDENCE_JSON=$PREFLIGHT_JSON"
echo "VENTUREOS_PREFLIGHT_EVIDENCE_MD=${PREFLIGHT_JSON%.json}.md"
cat > "$PREFLIGHT_JSON" <<'JSON'
{"status":"pass","installResult":"PREFLIGHT"}
JSON
cat > "${PREFLIGHT_JSON%.json}.md" <<'MD'
# preflight evidence
MD
exit "${FAKE_PREFLIGHT_RC:-0}"
SH

cat > "$FAKE_QUEUE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "queue|$*" >> "$CALL_LOG"
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
{"summary":{"queueStatus":"quiet","totalOpen":0,"draft":0,"reviewNeeded":0,"approvedMergeReady":0,"approvedBlocked":0,"recommendedAction":"No immediate queue action required."},"prs":[]}
JSON
fi
echo "PR_QUEUE_STATUS=quiet"
exit "${FAKE_QUEUE_RC:-0}"
SH

cat > "$FAKE_CHECKLIST" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "checklist|$*" >> "$CALL_LOG"
checklist_path=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --checklist-path)
      checklist_path="${2:-}"
      shift 2
      ;;
    --preflight-json|--queue-json)
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [[ -n "$checklist_path" ]]; then
  echo "refreshed" >> "$checklist_path"
fi
exit "${FAKE_CHECKLIST_RC:-0}"
SH

cat > "$FAKE_VALIDATE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "validate|$*" >> "$CALL_LOG"
report_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report-dir)
      report_dir="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [[ -n "$report_dir" ]]; then
  mkdir -p "$report_dir"
  cat > "$report_dir/evidence-validate-latest.json" <<'JSON'
{"status":"pass"}
JSON
  cat > "$report_dir/evidence-validate-latest.md" <<'MD'
# evidence validate
MD
fi
echo "EVIDENCE_VALIDATE_STATUS=PASS"
echo "EVIDENCE_VALIDATE_TARGET=latest"
echo "EVIDENCE_VALIDATE_JSON=${report_dir}/evidence-validate-latest.json"
echo "EVIDENCE_VALIDATE_MD=${report_dir}/evidence-validate-latest.md"
exit "${FAKE_VALIDATE_RC:-0}"
SH

chmod +x "$FAKE_PREFLIGHT" "$FAKE_QUEUE" "$FAKE_CHECKLIST" "$FAKE_VALIDATE"
export CALL_LOG PREFLIGHT_JSON

SUCCESS_OUT="$TMP_DIR/success.out"
VENTUREOS_CADENCE_PREFLIGHT_SCRIPT="$FAKE_PREFLIGHT" \
VENTUREOS_CADENCE_QUEUE_SCRIPT="$FAKE_QUEUE" \
VENTUREOS_CADENCE_CHECKLIST_SCRIPT="$FAKE_CHECKLIST" \
VENTUREOS_CADENCE_VALIDATE_SCRIPT="$FAKE_VALIDATE" \
bash "$SCRIPT" \
  --report-dir "$CADENCE_DIR" \
  --preflight-report-dir "$PREFLIGHT_REPORT_DIR" \
  --preflight-json "$PREFLIGHT_JSON" \
  --queue-json "$QUEUE_JSON" \
  --checklist-path "$CHECKLIST_PATH" \
  -- --openclaw-dir "$TMP_DIR/.openclaw" > "$SUCCESS_OUT" 2>&1

grep -q "LOCAL_INTEGRATION_CADENCE_STATUS=PASS" "$SUCCESS_OUT"
grep -q "preflight|--report-dir $PREFLIGHT_REPORT_DIR -- --openclaw-dir $TMP_DIR/.openclaw" "$CALL_LOG"
grep -q "queue|--json-out $QUEUE_JSON" "$CALL_LOG"
grep -q "checklist|--checklist-path $CHECKLIST_PATH --preflight-json $PREFLIGHT_JSON --queue-json $QUEUE_JSON" "$CALL_LOG"
grep -q "validate|--cadence daily --target latest --report-dir $ROOT/runtime/reports/evidence" "$CALL_LOG"

SUCCESS_JSON="$(grep -E '^LOCAL_INTEGRATION_CADENCE_JSON=' "$SUCCESS_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$SUCCESS_JSON" ]]
python3 - "$SUCCESS_JSON" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["status"] == "pass", payload
steps = {row["id"]: row for row in payload["steps"]}
assert steps["preflight-evidence"]["status"] == "pass", steps
assert steps["queue-sweep"]["status"] == "pass", steps
assert steps["queue-sweep"]["queueStatus"] == "quiet", steps
assert steps["checklist-refresh"]["status"] == "pass", steps
assert steps["evidence-validate"]["status"] == "pass", steps
print("RUN_LOCAL_INTEGRATION_CADENCE_SUCCESS_OK")
PY

FAIL_OUT="$TMP_DIR/fail.out"
set +e
VENTUREOS_CADENCE_PREFLIGHT_SCRIPT="$FAKE_PREFLIGHT" \
VENTUREOS_CADENCE_QUEUE_SCRIPT="$FAKE_QUEUE" \
VENTUREOS_CADENCE_CHECKLIST_SCRIPT="$FAKE_CHECKLIST" \
VENTUREOS_CADENCE_VALIDATE_SCRIPT="$FAKE_VALIDATE" \
FAKE_PREFLIGHT_RC=7 \
bash "$SCRIPT" \
  --report-dir "$CADENCE_DIR" \
  --preflight-report-dir "$PREFLIGHT_REPORT_DIR" \
  --preflight-json "$PREFLIGHT_JSON" \
  --queue-json "$QUEUE_JSON" \
  --checklist-path "$CHECKLIST_PATH" > "$FAIL_OUT" 2>&1
FAIL_RC=$?
set -e

if [[ "$FAIL_RC" -eq 0 ]]; then
  echo "Expected cadence fail scenario to exit non-zero" >&2
  cat "$FAIL_OUT" >&2
  exit 1
fi

grep -q "LOCAL_INTEGRATION_CADENCE_STATUS=FAIL" "$FAIL_OUT"
FAIL_JSON="$(grep -E '^LOCAL_INTEGRATION_CADENCE_JSON=' "$FAIL_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$FAIL_JSON" ]]
python3 - "$FAIL_JSON" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["status"] == "fail", payload
steps = {row["id"]: row for row in payload["steps"]}
assert steps["preflight-evidence"]["status"] == "fail", steps
assert steps["queue-sweep"]["status"] == "skipped", steps
assert steps["checklist-refresh"]["status"] == "skipped", steps
assert steps["evidence-validate"]["status"] == "skipped", steps
print("RUN_LOCAL_INTEGRATION_CADENCE_FAIL_OK")
PY

echo "RUN_LOCAL_INTEGRATION_CADENCE_TEST_OK"
