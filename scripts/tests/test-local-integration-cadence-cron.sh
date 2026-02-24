#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON_SCRIPT="$ROOT/scripts/local-integration-cadence-cron.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

FAKE_CADENCE="$TMP_DIR/fake-cadence.sh"
cat > "$FAKE_CADENCE" <<'EOF_FAKE'
#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${CAPTURE_ARGS_FILE:-}" ]]; then
  echo "CAPTURE_ARGS_FILE is required" >&2
  exit 2
fi
printf '%s\n' "$@" > "$CAPTURE_ARGS_FILE"
exit "${FAKE_CADENCE_RC:-0}"
EOF_FAKE
chmod +x "$FAKE_CADENCE"

OPENCLAW_DIR_1="$TMP_DIR/openclaw-one"
BRIDGE_ENV_1="$TMP_DIR/bridge-one.env"
CAPTURE_1="$TMP_DIR/capture-1.txt"
mkdir -p "$OPENCLAW_DIR_1"
echo "BRIDGE_TOKEN_FILE=$TMP_DIR/bridge-token" > "$BRIDGE_ENV_1"

CAPTURE_ARGS_FILE="$CAPTURE_1" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_SCRIPT="$FAKE_CADENCE" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_OPENCLAW_DIR="$OPENCLAW_DIR_1" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_BRIDGE_ENV="$BRIDGE_ENV_1" \
bash "$CRON_SCRIPT" --dashboard-url http://127.0.0.1:8123 >/tmp/local-integration-cadence-cron-test-1.out 2>/tmp/local-integration-cadence-cron-test-1.err

python3 - "$CAPTURE_1" "$OPENCLAW_DIR_1" "$BRIDGE_ENV_1" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
assert args == [
    "--",
    "--openclaw-dir",
    sys.argv[2],
    "--bridge-env",
    sys.argv[3],
    "--dashboard-url",
    "http://127.0.0.1:8123",
], args
print("LOCAL_INTEGRATION_CADENCE_CRON_BRIDGE_ENV_OK")
PY

OPENCLAW_DIR_2="$TMP_DIR/openclaw-two"
MISSING_BRIDGE_ENV="$TMP_DIR/missing-bridge.env"
CAPTURE_2="$TMP_DIR/capture-2.txt"
mkdir -p "$OPENCLAW_DIR_2"

CAPTURE_ARGS_FILE="$CAPTURE_2" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_SCRIPT="$FAKE_CADENCE" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_OPENCLAW_DIR="$OPENCLAW_DIR_2" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_BRIDGE_ENV="$MISSING_BRIDGE_ENV" \
bash "$CRON_SCRIPT" >/tmp/local-integration-cadence-cron-test-2.out 2>/tmp/local-integration-cadence-cron-test-2.err

python3 - "$CAPTURE_2" "$OPENCLAW_DIR_2" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
assert args == [
    "--",
    "--openclaw-dir",
    sys.argv[2],
], args
print("LOCAL_INTEGRATION_CADENCE_CRON_SKIP_BRIDGE_ENV_OK")
PY

set +e
CAPTURE_ARGS_FILE="$TMP_DIR/capture-3.txt" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_SCRIPT="$FAKE_CADENCE" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_OPENCLAW_DIR="$TMP_DIR/openclaw-three" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_BRIDGE_ENV="$MISSING_BRIDGE_ENV" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_REQUIRE_BRIDGE_ENV=1 \
bash "$CRON_SCRIPT" >/tmp/local-integration-cadence-cron-test-3.out 2>&1
RC_REQUIRE=$?
set -e
if [[ "$RC_REQUIRE" -ne 2 ]]; then
  echo "expected missing required bridge env to fail with exit 2, got $RC_REQUIRE" >&2
  exit 1
fi

set +e
CAPTURE_ARGS_FILE="$TMP_DIR/capture-4.txt" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_SCRIPT="$TMP_DIR/does-not-exist.sh" \
bash "$CRON_SCRIPT" >/tmp/local-integration-cadence-cron-test-4.out 2>&1
RC_MISSING_SCRIPT=$?
set -e
if [[ "$RC_MISSING_SCRIPT" -ne 2 ]]; then
  echo "expected missing cadence script to fail with exit 2, got $RC_MISSING_SCRIPT" >&2
  exit 1
fi

set +e
CAPTURE_ARGS_FILE="$TMP_DIR/capture-5.txt" \
FAKE_CADENCE_RC=9 \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_SCRIPT="$FAKE_CADENCE" \
VENTUREOS_LOCAL_INTEGRATION_CADENCE_OPENCLAW_DIR="$TMP_DIR/openclaw-five" \
bash "$CRON_SCRIPT" >/tmp/local-integration-cadence-cron-test-5.out 2>&1
RC_UNDERLYING=$?
set -e
if [[ "$RC_UNDERLYING" -ne 9 ]]; then
  echo "expected underlying cadence rc to propagate (9), got $RC_UNDERLYING" >&2
  exit 1
fi

echo "LOCAL_INTEGRATION_CADENCE_CRON_TEST_OK"
