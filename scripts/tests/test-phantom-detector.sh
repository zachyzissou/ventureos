#!/usr/bin/env bash
set -uo pipefail
# Note: NOT using set -e because phantom-detector exits 1 for UNHEALTHY (expected in tests)

# Test phantom-detector.mjs with synthetic log data
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DETECTOR="$REPO_ROOT/scripts/phantom-detector.mjs"

TEST_DIR="$(mktemp -d)"
TEST_LOG_DIR="$TEST_DIR/logs"
mkdir -p "$TEST_LOG_DIR"

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

PASS=0
FAIL=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $label"
    ((PASS++))
  else
    echo "  ❌ $label: expected=$expected actual=$actual"
    ((FAIL++))
  fi
}

json_summary() {
  local key="$1"
  node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(0,'utf8')); console.log(j.summary[process.argv[1]]);" "$key"
}

json_root() {
  local key="$1"
  node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(0,'utf8')); console.log(j[process.argv[1]]);" "$key"
}

NOW=$(node -e "console.log(new Date().toISOString())")
OLD=$(node -e "console.log(new Date(Date.now() - 10*60*1000).toISOString())")

echo "=== Test 1: Empty logs (healthy) ==="
touch "$TEST_LOG_DIR/gateway.log"
touch "$TEST_LOG_DIR/gateway.err.log"
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
STATUS=$(echo "$OUTPUT" | json_summary healthStatus 2>/dev/null)
assert_eq "empty logs = HEALTHY" "HEALTHY" "$STATUS"

echo ""
echo "=== Test 2: Phantom session detected (older than threshold) ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
${OLD} [tools] exec failed: PHANTOM: No JSONL file found for session abcd1234
${OLD} [tools] exec failed: PHANTOM: No JSONL file found for session abcd1234
${OLD} [tools] exec failed: PHANTOM: Session not found in sessions list: agent:test:subagent:abcd1234-1111-2222-3333-444444444444
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} normal activity
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
ACTIVE=$(echo "$OUTPUT" | json_summary activePhantoms 2>/dev/null)
STATUS=$(echo "$OUTPUT" | json_summary healthStatus 2>/dev/null)
assert_eq "phantom detected" "1" "$ACTIVE"
assert_eq "status UNHEALTHY" "UNHEALTHY" "$STATUS"

echo ""
echo "=== Test 3: Resolved phantom (slow start) ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
${OLD} [tools] exec failed: PHANTOM: No JSONL file found for session ae3f5678
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} [agent:nested] session=agent:test:subagent:ae3f5678-1111-2222-3333-444444444444 output here
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
RESOLVED=$(echo "$OUTPUT" | json_summary resolvedPhantoms 2>/dev/null)
ACTIVE=$(echo "$OUTPUT" | json_summary activePhantoms 2>/dev/null)
assert_eq "resolved phantom count" "1" "$RESOLVED"
assert_eq "no active phantoms" "0" "$ACTIVE"

echo ""
echo "=== Test 4: Lane contention warnings ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
${OLD} [diagnostic] lane wait exceeded: lane=session:agent:test waitedMs=150000 queueAhead=2
${OLD} [diagnostic] lane wait exceeded: lane=session:agent:test waitedMs=80000 queueAhead=1
${OLD} [diagnostic] lane wait exceeded: lane=cron waitedMs=25000 queueAhead=0
${OLD} [diagnostic] lane wait exceeded: lane=session:agent:other waitedMs=90000 queueAhead=0
${OLD} [diagnostic] lane wait exceeded: lane=session:agent:test waitedMs=65000 queueAhead=0
${OLD} [diagnostic] lane wait exceeded: lane=session:agent:test waitedMs=70000 queueAhead=0
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} normal
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
WARNINGS=$(echo "$OUTPUT" | json_summary laneWarnings 2>/dev/null)
STATUS=$(echo "$OUTPUT" | json_summary healthStatus 2>/dev/null)
assert_eq "lane warnings counted" "6" "$WARNINGS"
assert_eq "degraded status" "DEGRADED" "$STATUS"

echo ""
echo "=== Test 5: Slow listeners ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
${OLD} [discord] Slow listener detected: DiscordMessageListener took 309.6 seconds for event MESSAGE_CREATE
${OLD} [discord] Slow listener detected: DiscordMessageListener took 45.2 seconds for event MESSAGE_CREATE
${OLD} [discord] Slow listener detected: DiscordMessageListener took 120.0 seconds for event MESSAGE_CREATE
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} normal
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
SLOW=$(echo "$OUTPUT" | json_summary slowListeners 2>/dev/null)
assert_eq "slow listeners counted" "3" "$SLOW"

echo ""
echo "=== Test 6: Embedded run timeouts ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
${OLD} [agent/embedded] embedded run timeout: runId=abc-123 sessionId=abc-123 timeoutMs=60000
${OLD} [agent/embedded] embedded run timeout: runId=def-456 sessionId=def-456 timeoutMs=120000
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} normal
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
TIMEOUTS=$(echo "$OUTPUT" | json_summary runTimeouts 2>/dev/null)
assert_eq "run timeouts counted" "2" "$TIMEOUTS"

echo ""
echo "=== Test 7: Alert writing ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
${OLD} [tools] exec failed: PHANTOM: No JSONL file found for session a1e4f234
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} normal
EOF
ALERT_FILE="$TEST_DIR/phantom-alerts.jsonl"
node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --alert --since "2020-01-01T00:00:00Z" >/dev/null 2>/dev/null || true
if [ -f "$ALERT_FILE" ]; then
  assert_eq "alert file created" "true" "true"
  ALERT_HEALTH=$(head -1 "$ALERT_FILE" | json_root health 2>/dev/null)
  assert_eq "alert health status" "UNHEALTHY" "$ALERT_HEALTH"
else
  assert_eq "alert file created" "true" "false"
fi

echo ""
echo "=== Test 8: threshold-minutes filters out too-recent phantoms ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
${NOW} [tools] exec failed: PHANTOM: No JSONL file found for session feedbeef1
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${NOW} normal
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" --threshold-minutes 5 2>/dev/null || true)
ACTIVE=$(echo "$OUTPUT" | json_summary activePhantoms 2>/dev/null)
STATUS=$(echo "$OUTPUT" | json_summary healthStatus 2>/dev/null)
assert_eq "recent phantom ignored" "0" "$ACTIVE"
assert_eq "recent phantom does not mark unhealthy" "HEALTHY" "$STATUS"

echo ""
echo "=== Test 9: Timestamp parsing works when timestamp is bracketed ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
[${OLD}] [tools] exec failed: PHANTOM: No JSONL file found for session cafebabe2
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} normal
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
ACTIVE=$(echo "$OUTPUT" | json_summary activePhantoms 2>/dev/null)
assert_eq "bracketed timestamp counted" "1" "$ACTIVE"

echo ""
echo "=== Test 10: Lines without timestamps are ignored (no 1970 dates) ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
[tools] exec failed: PHANTOM: No JSONL file found for session deadbeef3
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} normal
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
ACTIVE=$(echo "$OUTPUT" | json_summary activePhantoms 2>/dev/null)
STATUS=$(echo "$OUTPUT" | json_summary healthStatus 2>/dev/null)
assert_eq "missing timestamp phantom ignored" "0" "$ACTIVE"
assert_eq "missing timestamp phantom keeps healthy" "HEALTHY" "$STATUS"

echo ""
echo "=== Test 11: Lane warnings without timestamps are ignored ==="
cat > "$TEST_LOG_DIR/gateway.err.log" <<EOF
[diagnostic] lane wait exceeded: lane=session:agent:test waitedMs=150000 queueAhead=2
EOF
cat > "$TEST_LOG_DIR/gateway.log" <<EOF
${OLD} normal
EOF
OUTPUT=$(node "$DETECTOR" --log-dir "$TEST_LOG_DIR" --json --since "2020-01-01T00:00:00Z" 2>/dev/null || true)
WARNINGS=$(echo "$OUTPUT" | json_summary laneWarnings 2>/dev/null)
STATUS=$(echo "$OUTPUT" | json_summary healthStatus 2>/dev/null)
assert_eq "missing timestamp lane warning ignored" "0" "$WARNINGS"
assert_eq "missing timestamp lane warning keeps healthy" "HEALTHY" "$STATUS"

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
