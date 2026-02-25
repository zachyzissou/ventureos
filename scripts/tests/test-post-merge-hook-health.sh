#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/post-merge-hook-health.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

STATUS_SCRIPT="$TMP_DIR/fake-hook-status.sh"
HOOK_SCRIPT="$TMP_DIR/fake-post-merge-hook.sh"
LOG_DIR="$TMP_DIR/git-hooks"
CADENCE_JSON="$TMP_DIR/post-merge-cadence-latest.json"
mkdir -p "$LOG_DIR"

cat > "$STATUS_SCRIPT" <<'EOF_STATUS'
#!/usr/bin/env bash
set -euo pipefail
echo "POST_MERGE_HOOK_STATUS=${FAKE_HOOK_STATUS:-managed}"
echo "POST_MERGE_HOOK_PATH=${FAKE_HOOK_PATH:-/tmp/post-merge}"
echo "POST_MERGE_HOOK_LOG_DIR=$LOG_DIR"
EOF_STATUS
chmod +x "$STATUS_SCRIPT"

cat > "$HOOK_SCRIPT" <<'EOF_HOOK'
#!/usr/bin/env bash
set -euo pipefail
log_dir="${HOOK_TOUCH_LOG_DIR:?}"
mkdir -p "$log_dir"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
touch "$log_dir/post-merge-cadence-${ts}.log"
EOF_HOOK
chmod +x "$HOOK_SCRIPT"

python3 - "$CADENCE_JSON" <<'PY'
import json
import pathlib
from datetime import datetime, timezone

path = pathlib.Path(__import__("sys").argv[1])
payload = {"generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
path.write_text(json.dumps(payload), encoding="utf-8")
PY
touch "$LOG_DIR/post-merge-cadence-20260224T010101Z.log"

PASS_OUT="$TMP_DIR/pass.out"
LOG_DIR="$LOG_DIR" \
bash "$SCRIPT" \
  --status-script "$STATUS_SCRIPT" \
  --cadence-json "$CADENCE_JSON" \
  --max-age-min 60 > "$PASS_OUT" 2>&1

grep -q "^POST_MERGE_HOOK_HEALTH_STATUS=PASS" "$PASS_OUT"
grep -q "^POST_MERGE_HOOK_HEALTH_REASON=ok" "$PASS_OUT"
grep -q "^POST_MERGE_HOOK_REFRESH_ATTEMPTED=0" "$PASS_OUT"
grep -q "^POST_MERGE_HOOK_REFRESH_RESULT=skipped" "$PASS_OUT"

MISSING_OUT="$TMP_DIR/missing.out"
set +e
LOG_DIR="$LOG_DIR" \
FAKE_HOOK_STATUS=missing \
bash "$SCRIPT" \
  --status-script "$STATUS_SCRIPT" \
  --cadence-json "$CADENCE_JSON" > "$MISSING_OUT" 2>&1
MISSING_RC=$?
set -e
if [[ "$MISSING_RC" -ne 3 ]]; then
  echo "expected hook missing rc=3, got $MISSING_RC" >&2
  exit 1
fi
grep -q "^POST_MERGE_HOOK_HEALTH_STATUS=FAIL" "$MISSING_OUT"
grep -q "^POST_MERGE_HOOK_HEALTH_REASON=hook-not-managed" "$MISSING_OUT"

touch -t 200001010000 "$LOG_DIR/post-merge-cadence-20260224T010101Z.log"

STALE_LOG_OUT="$TMP_DIR/stale-log.out"
set +e
LOG_DIR="$LOG_DIR" \
bash "$SCRIPT" \
  --status-script "$STATUS_SCRIPT" \
  --cadence-json "$CADENCE_JSON" \
  --max-age-min 5 > "$STALE_LOG_OUT" 2>&1
STALE_LOG_RC=$?
set -e
if [[ "$STALE_LOG_RC" -ne 7 ]]; then
  echo "expected stale log rc=7, got $STALE_LOG_RC" >&2
  exit 1
fi
grep -q "^POST_MERGE_HOOK_HEALTH_REASON=hook-log-stale" "$STALE_LOG_OUT"
grep -q "^POST_MERGE_HOOK_REFRESH_ATTEMPTED=0" "$STALE_LOG_OUT"

REFRESH_OUT="$TMP_DIR/refresh.out"
HOOK_TOUCH_LOG_DIR="$LOG_DIR" \
LOG_DIR="$LOG_DIR" \
FAKE_HOOK_PATH="$HOOK_SCRIPT" \
bash "$SCRIPT" \
  --status-script "$STATUS_SCRIPT" \
  --cadence-json "$CADENCE_JSON" \
  --max-age-min 5 \
  --refresh-stale-log > "$REFRESH_OUT" 2>&1
grep -q "^POST_MERGE_HOOK_HEALTH_STATUS=PASS" "$REFRESH_OUT"
grep -q "^POST_MERGE_HOOK_HEALTH_REASON=ok" "$REFRESH_OUT"
grep -q "^POST_MERGE_HOOK_REFRESH_ATTEMPTED=1" "$REFRESH_OUT"
grep -q "^POST_MERGE_HOOK_REFRESH_RESULT=pass" "$REFRESH_OUT"
grep -q "^POST_MERGE_HOOK_REFRESH_RC=0" "$REFRESH_OUT"

python3 - "$CADENCE_JSON" <<'PY'
import json
import pathlib

path = pathlib.Path(__import__("sys").argv[1])
path.write_text(json.dumps({"generatedAtUtc": "2000-01-01T00:00:00Z"}), encoding="utf-8")
PY

STALE_OUT="$TMP_DIR/stale.out"
set +e
LOG_DIR="$LOG_DIR" \
bash "$SCRIPT" \
  --status-script "$STATUS_SCRIPT" \
  --cadence-json "$CADENCE_JSON" \
  --max-age-min 5 > "$STALE_OUT" 2>&1
STALE_RC=$?
set -e
if [[ "$STALE_RC" -ne 5 ]]; then
  echo "expected stale cadence rc=5, got $STALE_RC" >&2
  exit 1
fi
grep -q "^POST_MERGE_HOOK_HEALTH_REASON=cadence-stale" "$STALE_OUT"
grep -q "^POST_MERGE_HOOK_REFRESH_ATTEMPTED=0" "$STALE_OUT"

echo "POST_MERGE_HOOK_HEALTH_TEST_OK"
