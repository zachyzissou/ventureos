#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/spawn-with-verification.mjs"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

WS="$TMP_DIR/workspace"
mkdir -p "$WS"

RUN_DIR="$WS/runtime/runs/test"
LOG_FILE="$WS/runtime/logs/verified.jsonl"
CALLS_FILE="$WS/runtime/logs/mock-calls.jsonl"

MOCK="$WS/mock-sessions-spawn.sh"
cat >"$MOCK" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
shift || true

label=""
context=""
prompt=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label)
      label="${2:-}"
      shift 2
      ;;
    --context)
      context="${2:-}"
      shift 2
      ;;
    --prompt)
      prompt="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

python3 - "$MOCK_CALLS" "$target" "$label" "$context" "$prompt" <<'PY'
import json, sys
from pathlib import Path

calls = Path(sys.argv[1])
calls.parent.mkdir(parents=True, exist_ok=True)
rec = {
  "target": sys.argv[2],
  "label": sys.argv[3],
  "context": sys.argv[4],
  "prompt": sys.argv[5],
  "tmpdir": Path((__import__('os').environ.get('TMPDIR') or '')).as_posix(),
}
with calls.open('a', encoding='utf-8') as f:
  f.write(json.dumps(rec) + "\n")
PY

# Transient failure injection for retry tests
state_file="${MOCK_STATE_FILE:-/tmp/mock-verified-state.txt}"
if [[ -n "${MOCK_TRANSIENT_TARGET:-}" && "$target" == "$MOCK_TRANSIENT_TARGET" ]]; then
  n=0
  if [[ -f "$state_file" ]]; then
    n="$(cat "$state_file")"
  fi
  n=$((n + 1))
  echo "$n" >"$state_file"
  if (( n <= ${MOCK_TRANSIENT_FAILS:-0} )); then
    echo "transient spawn failure n=$n" >&2
    exit 75
  fi
fi

case "$target" in
  *planner*)
    echo "PLAN_OUTPUT: tasks=1 tests=1 files=1"
    exit 0
    ;;
  *dev*)
    if [[ -n "${MOCK_ASSERT_CONTEXT_CONTAINS:-}" ]]; then
      grep -q "$MOCK_ASSERT_CONTEXT_CONTAINS" "$context"
    fi
    echo "DEV_OUTPUT: build ok"
    echo "STATUS: done"
    exit 0
    ;;
  *verifier*)
    mode="${MOCK_VERIFIER_MODE:-approve}"
    if [[ "$mode" == "retry-once" ]]; then
      n=0
      if [[ -f "$state_file" ]]; then
        n="$(cat "$state_file")"
      fi
      n=$((n + 1))
      echo "$n" >"$state_file"
      if (( n == 1 )); then
        echo "STATUS: retry"
        echo "ISSUES: missing test coverage"
        exit 0
      fi
    fi
    echo "STATUS: approved"
    echo "VERIFIED: ok"
    exit 0
    ;;
  *)
    echo "unknown target=$target" >&2
    exit 2
    ;;
esac
EOF
chmod +x "$MOCK"

# Test 1: Fresh context per step (plan -> dev -> verify), and context passing includes plan output.
AGENT_ID=atlas OPENCLAW_WORKSPACE="$WS" \
  MOCK_CALLS="$CALLS_FILE" \
  MOCK_ASSERT_CONTEXT_CONTAINS="PLAN_OUTPUT" \
  node "$SCRIPT" \
  --task "Add feature X" \
  --spawn-cmd "$MOCK" \
  --run-dir "$RUN_DIR" \
  --log-file "$LOG_FILE" \
  --max-verify-cycles 1 \
  --max-spawn-retries 0 \
  --quiet >/dev/null

python3 - <<PY
import json
from pathlib import Path

calls = [json.loads(l) for l in Path("$CALLS_FILE").read_text().splitlines() if l.strip()]
assert [c['target'] for c in calls] == ['agent:planner','agent:dev','agent:verifier'], calls

contexts = [Path(c['context']) for c in calls]
assert len({p.name for p in contexts}) == 3, contexts
assert all(p.exists() for p in contexts)

# Fresh context: each step gets a distinct context file, and they live in run_dir.
run_dir = Path("$RUN_DIR").resolve()
for p in contexts:
    rp = p.resolve()
    assert run_dir in rp.parents, f"context not in run dir: {rp}"

# Ensure output artifacts exist
assert (run_dir / 'output' / 'plan.md').exists()
assert (run_dir / 'output' / 'dev-cycle-1.md').exists()
assert (run_dir / 'output' / 'verify-cycle-1.md').exists()

print('TEST1_OK fresh context per step + context passing')
PY

# Test 2: Verification loop retry (verifier requests retry once, then approves). Ensure second dev context includes issues.
CALLS_FILE_2="$WS/runtime/logs/mock-calls-2.jsonl"
RUN_DIR_2="$WS/runtime/runs/test2"
LOG_FILE_2="$WS/runtime/logs/verified-2.jsonl"
STATE_2="$WS/runtime/tmp/state-2.txt"
mkdir -p "$(dirname "$STATE_2")"

AGENT_ID=oracle OPENCLAW_WORKSPACE="$WS" \
  MOCK_CALLS="$CALLS_FILE_2" \
  MOCK_VERIFIER_MODE="retry-once" \
  MOCK_STATE_FILE="$STATE_2" \
  node "$SCRIPT" \
  --task "Fix bug Y" \
  --spawn-cmd "$MOCK" \
  --run-dir "$RUN_DIR_2" \
  --log-file "$LOG_FILE_2" \
  --max-verify-cycles 2 \
  --max-spawn-retries 0 \
  --quiet >/dev/null

python3 - <<PY
import json
from pathlib import Path

calls = [json.loads(l) for l in Path("$CALLS_FILE_2").read_text().splitlines() if l.strip()]
targets = [c['target'] for c in calls]
# plan + (dev,verify) + (dev,verify)
assert targets == ['agent:planner','agent:dev','agent:verifier','agent:dev','agent:verifier'], targets

# Second dev context should contain verifier issues
second_dev = [c for c in calls if c['target']=='agent:dev'][1]
ctx = Path(second_dev['context']).read_text(encoding='utf-8')
assert 'missing test coverage' in ctx, ctx

print('TEST2_OK verification loop retry passes issues forward')
PY

# Test 3: Spawn retry logic (transient failure on planner spawn; ensure retries happen and succeed).
CALLS_FILE_3="$WS/runtime/logs/mock-calls-3.jsonl"
RUN_DIR_3="$WS/runtime/runs/test3"
LOG_FILE_3="$WS/runtime/logs/verified-3.jsonl"
STATE_3="$WS/runtime/tmp/state-3.txt"
mkdir -p "$(dirname "$STATE_3")"

AGENT_ID=atlas OPENCLAW_WORKSPACE="$WS" \
  MOCK_CALLS="$CALLS_FILE_3" \
  MOCK_TRANSIENT_TARGET="agent:planner" \
  MOCK_TRANSIENT_FAILS=2 \
  MOCK_STATE_FILE="$STATE_3" \
  node "$SCRIPT" \
  --task "Refactor module Z" \
  --spawn-cmd "$MOCK" \
  --run-dir "$RUN_DIR_3" \
  --log-file "$LOG_FILE_3" \
  --max-verify-cycles 1 \
  --max-spawn-retries 3 \
  --backoff-seconds "0,0,0,0" \
  --quiet >/dev/null

python3 - <<PY
import json
from pathlib import Path

calls = [json.loads(l) for l in Path("$CALLS_FILE_3").read_text().splitlines() if l.strip()]
planner_calls = [c for c in calls if c['target']=='agent:planner']
assert len(planner_calls) == 3, len(planner_calls)

records = [json.loads(l) for l in Path("$LOG_FILE_3").read_text().splitlines() if l.strip()]
retry_events = [r for r in records if r.get('event')=='spawn_retry' and r.get('step')=='plan']
assert len(retry_events) == 2, retry_events

print('TEST3_OK spawn retry logic exercised')
PY

echo "SPAWN_WITH_VERIFICATION_TESTS_OK"
