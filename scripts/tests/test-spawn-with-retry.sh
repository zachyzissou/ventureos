#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/spawn-with-retry.mjs"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

WS_A="$TMP_DIR/workspace-atlas"
WS_B="$TMP_DIR/workspace-oracle"
mkdir -p "$WS_A" "$WS_B"

MOCK_A="$WS_A/mock-sessions-spawn.sh"
MOCK_B="$WS_B/mock-sessions-spawn.sh"
STATE_FILE="$TMP_DIR/flaky-state.txt"

cat > "$MOCK_A" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mode="${MOCK_MODE:-invalid-agent}"
state_file="${MOCK_STATE_FILE:-/tmp/agent-main/mock-spawn-state.txt}"
target="${1:-}"

echo "${TMPDIR:-}" > "${MOCK_TMPDIR_FILE:-/dev/null}"

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
chmod +x "$MOCK_A"
cp "$MOCK_A" "$MOCK_B"
chmod +x "$MOCK_B"

# Test 1: Invalid-agent failure path + backoff timing verification (2s + 4s + 8s ~= 14s)
start="$(python3 - <<'PY'
import time
print(time.time())
PY
)"

set +e
AGENT_ID=atlas OPENCLAW_WORKSPACE="$WS_A" MOCK_MODE=invalid-agent node "$SCRIPT" \
  --spawn-cmd "$MOCK_A" \
  --max-retries 3 \
  --log-file "$WS_A/runtime/logs/failure.log" \
  -- --agent-invalid >"$TMP_DIR/test-spawn-fail.out" 2>"$TMP_DIR/test-spawn-fail.err"
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

records = [json.loads(line) for line in Path("$WS_A/runtime/logs/failure.log").read_text().splitlines() if line.strip()]
retry_records = [r for r in records if r.get("event") == "spawn_retry"]
failed_records = [r for r in records if r.get("event") == "spawn_failed"]

assert len(retry_records) == 3, f"expected 3 retry records, got {len(retry_records)}"
assert len(failed_records) == 1, f"expected 1 terminal failure record, got {len(failed_records)}"

backoffs = [r.get("nextBackoffSeconds") for r in retry_records]
assert backoffs == [2, 4, 8], f"unexpected backoff schedule: {backoffs}"
assert {r.get('agentId') for r in records} == {'atlas'}

print("TEST1_OK invalid-agent failure + backoff verified")
PY

# Test 2: Transient failure then success
AGENT_ID=oracle OPENCLAW_WORKSPACE="$WS_B" MOCK_MODE=flaky MOCK_STATE_FILE="$STATE_FILE" node "$SCRIPT" \
  --spawn-cmd "$MOCK_B" \
  --max-retries 3 \
  --log-file "$WS_B/runtime/logs/flaky.log" \
  -- worker-agent >"$TMP_DIR/test-spawn-flaky.out" 2>"$TMP_DIR/test-spawn-flaky.err"

python3 - <<PY
import json
from pathlib import Path

out = Path("$TMP_DIR/test-spawn-flaky.out").read_text()
assert 'SPAWN_SUCCESS attempt=3 retries_used=2' in out, out

records = [json.loads(line) for line in Path("$WS_B/runtime/logs/flaky.log").read_text().splitlines() if line.strip()]
retry_records = [r for r in records if r.get("event") == "spawn_retry"]
success_records = [r for r in records if r.get("event") == "spawn_success"]

assert len(retry_records) == 2, f"expected 2 retries, got {len(retry_records)}"
assert len(success_records) == 1, f"expected 1 success record, got {len(success_records)}"
assert success_records[0].get("attempt") == 3, success_records[0]
assert {r.get('agentId') for r in records} == {'oracle'}

print("TEST2_OK transient failure recovered")
PY

# Test 3: Default deny outside workspace (cross-workspace log path)
set +e
AGENT_ID=oracle OPENCLAW_WORKSPACE="$WS_B" node "$SCRIPT" \
  --spawn-cmd "$MOCK_B" \
  --max-retries 0 \
  --log-file "$WS_A/runtime/logs/should-deny.log" \
  -- worker-agent >"$TMP_DIR/test-spawn-deny.out" 2>"$TMP_DIR/test-spawn-deny.err"
rc=$?
set -e

python3 - <<PY
from pathlib import Path

rc = int("$rc")
assert rc != 0, "expected non-zero for cross-workspace denial"
err = Path("$TMP_DIR/test-spawn-deny.err").read_text()
assert "PATH_ISOLATION_DENY" in err, err
print("TEST3_OK path isolation deny verified")
PY

# Test 4: per-agent TMPDIR propagation
TMPDIR_EVIDENCE="$TMP_DIR/tmpdir.txt"
AGENT_ID=atlas OPENCLAW_WORKSPACE="$WS_A" MOCK_MODE=invalid-agent MOCK_TMPDIR_FILE="$TMPDIR_EVIDENCE" node "$SCRIPT" \
  --spawn-cmd "$MOCK_A" \
  --max-retries 0 \
  --log-file "$WS_A/runtime/logs/tmpdir.log" \
  -- ok-agent >"$TMP_DIR/test-spawn-tmp.out" 2>"$TMP_DIR/test-spawn-tmp.err"

python3 - <<PY
from pathlib import Path

tmpdir = Path("$TMPDIR_EVIDENCE").read_text().strip()
assert tmpdir == "/tmp/agent-atlas", tmpdir
assert Path(tmpdir).is_dir(), tmpdir
print("TEST4_OK per-agent tmp dir verified")
PY

echo "SPAWN_WITH_RETRY_TESTS_OK"
