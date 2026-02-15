#!/usr/bin/env bash
# verify-session-exists.sh — Validate that a session exists in persisted state
# Usage: verify-session-exists.sh <session-key> [--strict]
# 
# Exit codes:
#   0 = Session found in sessions.json (persisted)
#   1 = Session not found (phantom)
#   2 = Too new to verify (< 10 seconds, not yet persisted)
#
# Note: Brand new sessions (< 10 seconds) may not be in sessions.json yet.
# Use --strict to fail on new sessions instead of returning exit code 2.

set -euo pipefail

SESSION_KEY="${1:-}"
STRICT_MODE="${2:-}"

if [[ -z "$SESSION_KEY" ]]; then
  cat >&2 <<EOF
Usage: verify-session-exists.sh <session-key> [--strict]

Checks if a session exists in persisted state (sessions.json).

Exit codes:
  0 = Session found (persisted)
  1 = Session not found (phantom or > 10s old)
  2 = Too new to verify (not persisted yet, < 10s old)

Options:
  --strict    Treat new sessions as failures (exit 1 instead of 2)

Note: This script checks persisted state only. Brand new sessions
(<10 seconds) accepted by sessions_spawn may not be persisted yet.
Use 'openclaw sessions list' to check running sessions immediately.
EOF
  exit 1
fi

# Search for session in ALL agent sessions.json files
# (Subagents can be stored in parent agent's sessions.json)
FOUND=0
TRANSCRIPT_PATH=""
AGENT_NAME=""

for AGENT_DIR in ~/.openclaw/agents/*/; do
  SESSIONS_JSON="${AGENT_DIR}sessions/sessions.json"
  
  if [[ ! -f "$SESSIONS_JSON" ]]; then
    continue
  fi
  
  # Try two formats:
  # 1. Wrapped: { "sessions": { "key": {...} } }
  # 2. Direct: { "key": {...} }
  
  # Try wrapped format first
  if jq -e ".sessions[\"$SESSION_KEY\"]" "$SESSIONS_JSON" >/dev/null 2>&1; then
    FOUND=1
    TRANSCRIPT_PATH=$(jq -r ".sessions[\"$SESSION_KEY\"].transcriptPath // empty" "$SESSIONS_JSON" 2>/dev/null || true)
    AGENT_NAME=$(basename "$AGENT_DIR")
    break
  fi
  
  # Try direct format
  if jq -e ".[\"$SESSION_KEY\"]" "$SESSIONS_JSON" >/dev/null 2>&1; then
    FOUND=1
    TRANSCRIPT_PATH=$(jq -r ".[\"$SESSION_KEY\"].transcriptPath // empty" "$SESSIONS_JSON" 2>/dev/null || true)
    AGENT_NAME=$(basename "$AGENT_DIR")
    break
  fi
done

if [[ $FOUND -eq 0 ]]; then
  # Session not found in persisted state
  # This could mean: phantom, or too new (< 10s), or different storage location
  
  if [[ "$STRICT_MODE" == "--strict" ]]; then
    echo "PHANTOM: Session not found in persisted state: $SESSION_KEY" >&2
    exit 1
  else
    echo "NOT_PERSISTED: Session not in sessions.json yet (may be < 10s old): $SESSION_KEY" >&2
    echo "  Use 'openclaw sessions list' to check if session is actually running" >&2
    exit 2
  fi
fi

# Session found in sessions.json
if [[ -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
  echo "✓ Session exists with transcript: $SESSION_KEY (agent: $AGENT_NAME)" >&2
  echo "  Transcript: $TRANSCRIPT_PATH" >&2
else
  echo "✓ Session persisted (transcript pending): $SESSION_KEY (agent: $AGENT_NAME)" >&2
fi

exit 0
