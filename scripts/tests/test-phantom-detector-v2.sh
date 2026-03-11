#!/usr/bin/env bash
# test-phantom-detector-v2.sh — Tests for the fixed phantom-detector.sh
#
# Tests that phantom detection correctly:
# 1. Reads messages from .jsonl transcript files (NOT sessions.json index)
# 2. Does NOT false-positive on sessions that have messages
# 3. Correctly identifies truly phantom sessions (no transcript, no messages)
# 4. Handles edge cases (missing files, empty transcripts, etc.)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DETECTOR="$SCRIPT_DIR/../phantom-detector.sh"
HEALTH_CHECK="$SCRIPT_DIR/../spawn-health-check.sh"

# TEST_AGENTS_DIR is set per-test to isolate environments
TEST_AGENTS_DIR=""

PASS=0
FAIL=0
TOTAL=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  ((TOTAL++))
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $label"
    ((PASS++))
  else
    echo "  ❌ $label: expected='$expected' actual='$actual'"
    ((FAIL++))
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  ((TOTAL++))
  if echo "$haystack" | grep -q "$needle"; then
    echo "  ✅ $label"
    ((PASS++))
  else
    echo "  ❌ $label: '$needle' not found in output"
    ((FAIL++))
  fi
}

assert_not_contains() {
  local label="$1" needle="$2" haystack="$3"
  ((TOTAL++))
  if ! echo "$haystack" | grep -q "$needle"; then
    echo "  ✅ $label"
    ((PASS++))
  else
    echo "  ❌ $label: '$needle' was found in output (should not be)"
    ((FAIL++))
  fi
}

# ============================================================================
# Helper: Create a mock agent with sessions
# ============================================================================

create_mock_agent() {
  local agent_name="$1"
  local sessions_dir="$TEST_AGENTS_DIR/$agent_name/sessions"
  mkdir -p "$sessions_dir"
  echo "{}" > "$sessions_dir/sessions.json"
}

add_subagent_session() {
  local agent_name="$1"
  local uuid_prefix="$2"
  local session_id="$3"
  local updated_at="$4"
  local total_tokens="${5:-1000}"
  local sessions_dir="$TEST_AGENTS_DIR/$agent_name/sessions"
  local sessions_file="$sessions_dir/sessions.json"

  # Add to index
  local full_key="agent:${agent_name}:subagent:${uuid_prefix}-0000-0000-0000-000000000000"
  local tmp_file="${sessions_file}.tmp"
  jq --arg key "$full_key" \
     --arg sid "$session_id" \
     --argjson upd "$updated_at" \
     --argjson tok "$total_tokens" \
     '. + {($key): {"sessionId": $sid, "updatedAt": $upd, "totalTokens": $tok, "model": "test-model"}}' \
     "$sessions_file" > "$tmp_file" && mv "$tmp_file" "$sessions_file"
}

create_transcript() {
  local agent_name="$1"
  local session_id="$2"
  local message_count="$3"
  local sessions_dir="$TEST_AGENTS_DIR/$agent_name/sessions"
  local jsonl_file="$sessions_dir/${session_id}.jsonl"

  # Session header
  echo "{\"type\":\"session\",\"version\":3,\"id\":\"${session_id}\",\"timestamp\":\"2026-02-15T00:00:00.000Z\"}" > "$jsonl_file"
  echo "{\"type\":\"model_change\",\"id\":\"mc1\",\"timestamp\":\"2026-02-15T00:00:00.000Z\"}" >> "$jsonl_file"

  # Add messages (only if count > 0)
  if [[ "$message_count" -gt 0 ]]; then
    for i in $(seq 1 "$message_count"); do
      echo "{\"type\":\"message\",\"id\":\"msg${i}\",\"timestamp\":\"2026-02-15T00:0${i}:00.000Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Message $i\"}]}}" >> "$jsonl_file"
    done
  fi
}

# Helper: run detector with isolated HOME
run_detector() {
  local test_home="$1"
  shift
  HOME="$test_home" bash "$DETECTOR" "$@"
}

# Helper: create an isolated test environment for a single test
create_test_env() {
  local test_env_dir
  test_env_dir="$(mktemp -d)"
  mkdir -p "$test_env_dir/.openclaw/agents" "$test_env_dir/.openclaw/logs" "$test_env_dir/logs"
  touch "$test_env_dir/.openclaw/logs/gateway.err.log"
  echo "$test_env_dir"
}

echo "=== Test 1: No agents → no phantoms ==="
T1_DIR=$(create_test_env)
OUTPUT=$(HOME="$T1_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
COUNT=$(echo "$OUTPUT" | jq -r '.phantomCount' 2>/dev/null || echo "error")
assert_eq "empty agents dir = 0 phantoms" "0" "$COUNT"
rm -rf "$T1_DIR"

echo ""
echo "=== Test 2: Session WITH messages → NOT phantom (false positive fix) ==="
T2_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T2_DIR/.openclaw/agents"
create_mock_agent "test-agent-a"
add_subagent_session "test-agent-a" "aaaaaaaa" "sid-with-messages" "1700000000000" "5000"
create_transcript "test-agent-a" "sid-with-messages" 10
OUTPUT=$(HOME="$T2_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
COUNT=$(echo "$OUTPUT" | jq -r '.phantomCount' 2>/dev/null || echo "error")
assert_eq "session with 10 messages = 0 phantoms" "0" "$COUNT"
rm -rf "$T2_DIR"

echo ""
echo "=== Test 3: Session with ZERO messages → IS phantom ==="
T3_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T3_DIR/.openclaw/agents"
create_mock_agent "test-agent-b"
add_subagent_session "test-agent-b" "bbbbbbbb" "sid-zero-messages" "1700000000000" "0"
create_transcript "test-agent-b" "sid-zero-messages" 0
OUTPUT=$(HOME="$T3_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
COUNT=$(echo "$OUTPUT" | jq -r '.phantomCount' 2>/dev/null || echo "error")
assert_eq "session with 0 messages = 1 phantom" "1" "$COUNT"
REASON=$(echo "$OUTPUT" | jq -r '.phantoms[0].reason' 2>/dev/null || echo "error")
assert_contains "reason includes zero_messages" "zero_messages" "$REASON"
rm -rf "$T3_DIR"

echo ""
echo "=== Test 4: Missing transcript file → IS phantom ==="
T4_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T4_DIR/.openclaw/agents"
create_mock_agent "test-agent-c"
add_subagent_session "test-agent-c" "cccccccc" "sid-no-file" "1700000000000" "0"
# Don't create transcript file
OUTPUT=$(HOME="$T4_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
COUNT=$(echo "$OUTPUT" | jq -r '.phantomCount' 2>/dev/null || echo "error")
assert_eq "missing transcript = 1 phantom" "1" "$COUNT"
REASON=$(echo "$OUTPUT" | jq -r '.phantoms[0].reason' 2>/dev/null || echo "error")
assert_contains "reason includes missing_transcript" "missing_transcript" "$REASON"
rm -rf "$T4_DIR"

echo ""
echo "=== Test 5: Session too new → NOT flagged (respects min-age) ==="
T5_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T5_DIR/.openclaw/agents"
create_mock_agent "test-agent-d"
NOW_MS=$(( $(date +%s) * 1000 ))
add_subagent_session "test-agent-d" "dddddddd" "sid-new" "$NOW_MS" "0"
create_transcript "test-agent-d" "sid-new" 0
OUTPUT=$(HOME="$T5_DIR" bash "$DETECTOR" --json --min-age 10 2>/dev/null || true)
COUNT=$(echo "$OUTPUT" | jq -r '.phantomCount' 2>/dev/null || echo "error")
assert_eq "new session with min-age 10 = 0 phantoms" "0" "$COUNT"
rm -rf "$T5_DIR"

echo ""
echo "=== Test 6: Session with tokens and messages → NOT phantom ==="
T6_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T6_DIR/.openclaw/agents"
create_mock_agent "test-agent-e"
add_subagent_session "test-agent-e" "eeeeeeee" "sid-has-tokens" "1700000000000" "50000"
create_transcript "test-agent-e" "sid-has-tokens" 25
OUTPUT=$(HOME="$T6_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
E_PHANTOMS=$(echo "$OUTPUT" | jq '[.phantoms[] | select(.agent == "test-agent-e")] | length' 2>/dev/null || echo "error")
assert_eq "session with tokens+messages = 0 phantoms" "0" "$E_PHANTOMS"
rm -rf "$T6_DIR"

echo ""
echo "=== Test 7: Non-subagent sessions → NOT checked ==="
T7_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T7_DIR/.openclaw/agents"
create_mock_agent "test-agent-f"
sessions_file="$TEST_AGENTS_DIR/test-agent-f/sessions/sessions.json"
jq '. + {"agent:test-agent-f:cron:ffffffff-0000-0000-0000-000000000000": {"sessionId": "sid-cron", "updatedAt": 1700000000000, "totalTokens": 0, "model": "test"}}' \
  "$sessions_file" > "${sessions_file}.tmp" && mv "${sessions_file}.tmp" "$sessions_file"
OUTPUT=$(HOME="$T7_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
F_PHANTOMS=$(echo "$OUTPUT" | jq '[.phantoms[] | select(.agent == "test-agent-f")] | length' 2>/dev/null || echo "error")
assert_eq "cron session ignored" "0" "$F_PHANTOMS"
rm -rf "$T7_DIR"

echo ""
echo "=== Test 8: Multiple agents, mixed states ==="
T8_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T8_DIR/.openclaw/agents"
create_mock_agent "test-agent-g"
add_subagent_session "test-agent-g" "g1111111" "sid-g-alive" "1700000000000" "1000"
create_transcript "test-agent-g" "sid-g-alive" 5
add_subagent_session "test-agent-g" "g2222222" "sid-g-phantom" "1700000000000" "0"
# No transcript for g2222222
OUTPUT=$(HOME="$T8_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
G_PHANTOMS=$(echo "$OUTPUT" | jq '[.phantoms[] | select(.agent == "test-agent-g")] | length' 2>/dev/null || echo "error")
assert_eq "1 alive + 1 phantom = 1 phantom detected" "1" "$G_PHANTOMS"
rm -rf "$T8_DIR"

echo ""
echo "=== Test 9: Transcript with only headers (no messages) → phantom ==="
# Use a dedicated isolated test dir to avoid contamination
TEST9_DIR="$(mktemp -d)"
mkdir -p "$TEST9_DIR/.openclaw/agents/test-agent-h/sessions" "$TEST9_DIR/.openclaw/logs" "$TEST9_DIR/logs"
touch "$TEST9_DIR/.openclaw/logs/gateway.err.log"
echo '{}' > "$TEST9_DIR/.openclaw/agents/test-agent-h/sessions/sessions.json"
jq --arg key "agent:test-agent-h:subagent:hhhhhhhh-0000-0000-0000-000000000000" \
   --arg sid "sid-headers-only" \
   --argjson upd "1700000000000" \
   --argjson tok "0" \
   '. + {($key): {"sessionId": $sid, "updatedAt": $upd, "totalTokens": $tok, "model": "test-model"}}' \
   "$TEST9_DIR/.openclaw/agents/test-agent-h/sessions/sessions.json" > "$TEST9_DIR/tmp.json" && mv "$TEST9_DIR/tmp.json" "$TEST9_DIR/.openclaw/agents/test-agent-h/sessions/sessions.json"
# Create transcript with only session/model headers, no messages
echo '{"type":"session","version":3,"id":"sid-headers-only"}' > "$TEST9_DIR/.openclaw/agents/test-agent-h/sessions/sid-headers-only.jsonl"
echo '{"type":"model_change","id":"mc1"}' >> "$TEST9_DIR/.openclaw/agents/test-agent-h/sessions/sid-headers-only.jsonl"
echo '{"type":"thinking_level_change","id":"tl1"}' >> "$TEST9_DIR/.openclaw/agents/test-agent-h/sessions/sid-headers-only.jsonl"
OUTPUT=$(HOME="$TEST9_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
H_PHANTOMS=$(echo "$OUTPUT" | jq '[.phantoms[] | select(.agent == "test-agent-h")] | length' 2>/dev/null || echo "error")
assert_eq "transcript with only headers = 1 phantom" "1" "$H_PHANTOMS"
rm -rf "$TEST9_DIR"

echo ""
echo "=== Test 10: Large transcript (many messages) → NOT phantom ==="
T10_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T10_DIR/.openclaw/agents"
create_mock_agent "test-agent-i"
add_subagent_session "test-agent-i" "iiiiiiii" "sid-large" "1700000000000" "100000"
create_transcript "test-agent-i" "sid-large" 100
OUTPUT=$(HOME="$T10_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
I_PHANTOMS=$(echo "$OUTPUT" | jq '[.phantoms[] | select(.agent == "test-agent-i")] | length' 2>/dev/null || echo "error")
assert_eq "session with 100 messages = 0 phantoms" "0" "$I_PHANTOMS"
rm -rf "$T10_DIR"

echo ""
echo "=== Test 11: Reproduce the EXACT false positive from production ==="
# This reproduces the bug: session has messages in .jsonl but old detector
# counted from sessions.json (which never has .messages array)
T11_DIR=$(create_test_env)
TEST_AGENTS_DIR="$T11_DIR/.openclaw/agents"
create_mock_agent "test-agent-prod"
PROD_UPDATED_AT=$(($(date +%s) * 1000 - 3600000))  # 1 hour ago
add_subagent_session "test-agent-prod" "0e84becd" "9f12d986-6540-4f04-b10b-8207f4e42c8c" "$PROD_UPDATED_AT" "63150"
create_transcript "test-agent-prod" "9f12d986-6540-4f04-b10b-8207f4e42c8c" 61
OUTPUT=$(HOME="$T11_DIR" bash "$DETECTOR" --json --min-age 0 2>/dev/null || true)
PROD_PHANTOMS=$(echo "$OUTPUT" | jq '[.phantoms[] | select(.agent == "test-agent-prod")] | length' 2>/dev/null || echo "error")
assert_eq "production false positive case = 0 phantoms" "0" "$PROD_PHANTOMS"
rm -rf "$T11_DIR"

echo ""
echo "=== Test 12: Spawn health check — session with messages ==="
if [[ -f "$HEALTH_CHECK" ]]; then
  T12_DIR=$(create_test_env)
  TEST_AGENTS_DIR="$T12_DIR/.openclaw/agents"
  create_mock_agent "test-health"
  NOW_MS=$(( $(date +%s) * 1000 ))
  add_subagent_session "test-health" "hc111111" "sid-health-alive" "$NOW_MS" "1000"
  create_transcript "test-health" "sid-health-alive" 3
  HC_OUTPUT=$(HOME="$T12_DIR" bash "$HEALTH_CHECK" \
    --session-key "agent:test-health:subagent:hc111111-0000-0000-0000-000000000000" \
    --agent "test-health" \
    --timeout 2 --interval 1 --json 2>/dev/null || true)
  HC_STATUS=$(echo "$HC_OUTPUT" | jq -r '.status' 2>/dev/null || echo "error")
  assert_eq "health check: alive session = alive" "alive" "$HC_STATUS"
  HC_MSGS=$(echo "$HC_OUTPUT" | jq -r '.messages' 2>/dev/null || echo "error")
  assert_eq "health check: correct message count" "3" "$HC_MSGS"
  rm -rf "$T12_DIR"
else
  echo "  ⏭️  spawn-health-check.sh not found, skipping"
fi

echo ""
echo "=== Test 13: Spawn health check — phantom session (no transcript) ==="
if [[ -f "$HEALTH_CHECK" ]]; then
  T13_DIR=$(create_test_env)
  TEST_AGENTS_DIR="$T13_DIR/.openclaw/agents"
  create_mock_agent "test-health2"
  NOW_MS=$(( $(date +%s) * 1000 ))
  add_subagent_session "test-health2" "hc222222" "sid-health-phantom" "$NOW_MS" "0"
  # DON'T create a transcript file — this is a true phantom
  HC_OUTPUT=$(HOME="$T13_DIR" bash "$HEALTH_CHECK" \
    --session-key "agent:test-health2:subagent:hc222222-0000-0000-0000-000000000000" \
    --agent "test-health2" \
    --timeout 3 --interval 1 --json 2>/dev/null || true)
  HC_STATUS=$(echo "$HC_OUTPUT" | jq -r '.status' 2>/dev/null || echo "error")
  assert_eq "health check: phantom session = phantom" "phantom" "$HC_STATUS"
  rm -rf "$T13_DIR"
else
  echo "  ⏭️  spawn-health-check.sh not found, skipping"
fi

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed (of $TOTAL tests)"
echo "================================"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
