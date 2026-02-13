#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/spawn-with-retry.mjs"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

MOCK="$TMP_DIR/mock-sessions-spawn.sh"
LOG1="$TMP_DIR/failure.log"
LOG2="$TMP_DIR/flaky.log"
STATE_FILE="$TMP_DIR/flaky-state.txt"

cat > "$MOCK" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

mode="${MOCK_MODE:-invalid-agent}"
state_file="${MOCK_STATE_FILE:-/tmp/mock-spawn-state.txt}"

target="${1:-}"

case "$mode" in
  invalid-agent)
    if [[ "$target" == *"invalid"* ]]; then
      echo "sessions_spawn: invalid agent target: $target" >&2
      exit 42
    fi
    echo "session spawned for $target"
    exit 0
    ;;
  flaky)
    n=0
    if [[ -f "$state_file" ]]; then
      n="$(cat "$state_file")"
    fi
    n=$((n + 1))
    echo "$n" > "$state_file"

    if (( n <= 2 )); then
      echo "sessions_spawn: transient gateway timeout (attempt $n)" >&2
      exit 75
    fi

    echo "session spawned after transient failures"
    exit 0
    ;;
  *)
    echo "unknown MOCK_MODE=$mode" >&2
    exit 2
    ;;
esac
EOF
chmod +x "$MOCK"

# Test 1: Invalid-agent failure path + backoff timing verification (2s + 4s + 8s ~= 14s)
start="$(python3 - <<'PY'
import time
print(time.time())
PY
)"

set +e
MOCK_MODE=invalid-agent node "$SCRIPT" \
  --spawn-cmd "$MOCK" \
  --max-retries 3 \
  --log-file "$LOG1" \
  -- --agent-invalid >/tmp/test-spawn-fail.out 2>/tmp/test-spawn-fail.err
rc=$?
set -e

end="$(python3 - <<'PY'
import time
print(time.time())
PY
)"

python3 - <<PY
import json
from pathlib import Path

rc = int("$rc")
assert rc == 42, f"expected rc=42 got {rc}"

elapsed = float("$end") - float("$start")
# 2 + 4 + 8 seconds backoff + command overhead
assert elapsed >= 13.5, f"elapsed too short, expected ~14s, got {elapsed:.2f}s"
assert elapsed < 25, f"elapsed too long, got {elapsed:.2f}s"

records = [json.loads(line) for line in Path("$LOG1").read_text().splitlines() if line.strip()]
retry_records = [r for r in records if r.get("event") == "spawn_retry"]
failed_records = [r for r in records if r.get("event") == "spawn_failed"]

assert len(retry_records) == 3, f"expected 3 retry records, got {len(retry_records)}"
assert len(failed_records) == 1, f"expected 1 terminal failure record, got {len(failed_records)}"

backoffs = [r.get("nextBackoffSeconds") for r in retry_records]
assert backoffs == [2, 4, 8], f"unexpected backoff schedule: {backoffs}"

print("TEST1_OK invalid-agent failure + backoff verified")
PY

# Test 2: Transient failure then success
MOCK_MODE=flaky MOCK_STATE_FILE="$STATE_FILE" node "$SCRIPT" \
  --spawn-cmd "$MOCK" \
  --max-retries 3 \
  --log-file "$LOG2" \
  -- worker-agent >/tmp/test-spawn-flaky.out 2>/tmp/test-spawn-flaky.err

python3 - <<PY
import json
from pathlib import Path

out = Path('/tmp/test-spawn-flaky.out').read_text()
assert 'SPAWN_SUCCESS attempt=3 retries_used=2' in out, out

records = [json.loads(line) for line in Path("$LOG2").read_text().splitlines() if line.strip()]
retry_records = [r for r in records if r.get("event") == "spawn_retry"]
success_records = [r for r in records if r.get("event") == "spawn_success"]

assert len(retry_records) == 2, f"expected 2 retries, got {len(retry_records)}"
assert len(success_records) == 1, f"expected 1 success record, got {len(success_records)}"
assert success_records[0].get("attempt") == 3, success_records[0]

print("TEST2_OK transient failure recovered")
PY

echo "SPAWN_WITH_RETRY_TESTS_OK"
