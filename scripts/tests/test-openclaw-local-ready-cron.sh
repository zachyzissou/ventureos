#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON_SCRIPT="$ROOT/scripts/openclaw-local-ready-cron.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

STUB_REFRESH="$TMP_DIR/refresh-stub.sh"
cat > "$STUB_REFRESH" <<'EOF_STUB'
#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${CAPTURE_ARGS_FILE:-}" ]]; then
  echo "CAPTURE_ARGS_FILE is required" >&2
  exit 2
fi
printf '%s\n' "$@" > "$CAPTURE_ARGS_FILE"
EOF_STUB
chmod +x "$STUB_REFRESH"

CAPTURE_1="$TMP_DIR/capture-1.txt"
CAPTURE_ARGS_FILE="$CAPTURE_1" \
OPENCLAW_LOCAL_READY_REFRESH_SCRIPT="$STUB_REFRESH" \
bash "$CRON_SCRIPT" --skip-smoke >/tmp/openclaw-local-ready-cron-test-1.out

python3 - "$CAPTURE_1" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
assert args == [
    '--history-limit', '7',
    '--prune-keep', '14',
    '--profile', 'full',
    '--skip-smoke',
], args
print('OPENCLAW_LOCAL_READY_CRON_DEFAULTS_OK')
PY

CAPTURE_2="$TMP_DIR/capture-2.txt"
CAPTURE_ARGS_FILE="$CAPTURE_2" \
OPENCLAW_LOCAL_READY_REFRESH_SCRIPT="$STUB_REFRESH" \
OPENCLAW_LOCAL_READY_HISTORY_LIMIT=3 \
OPENCLAW_LOCAL_READY_PRUNE_KEEP=5 \
OPENCLAW_LOCAL_READY_PROFILE=quick \
bash "$CRON_SCRIPT" --profile bridge --history-limit 9 >/tmp/openclaw-local-ready-cron-test-2.out

python3 - "$CAPTURE_2" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
pairs = {}
i = 0
while i < len(args):
    key = args[i]
    if key.startswith('--') and i + 1 < len(args) and not args[i + 1].startswith('--'):
        pairs[key] = args[i + 1]
        i += 2
    else:
        i += 1
assert pairs.get('--history-limit') == '9', pairs
assert pairs.get('--prune-keep') == '5', pairs
assert pairs.get('--profile') == 'bridge', pairs
print('OPENCLAW_LOCAL_READY_CRON_OVERRIDES_OK')
PY

set +e
OPENCLAW_LOCAL_READY_REFRESH_SCRIPT="$STUB_REFRESH" \
OPENCLAW_LOCAL_READY_HISTORY_LIMIT=0 \
bash "$CRON_SCRIPT" >/tmp/openclaw-local-ready-cron-test-bad.out 2>&1
rc=$?
set -e
if [[ "$rc" -ne 2 ]]; then
  echo "expected invalid history limit to fail with exit 2, got $rc" >&2
  exit 1
fi

echo "OPENCLAW_LOCAL_READY_CRON_VALIDATION_OK"
