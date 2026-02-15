#!/usr/bin/env bash
# spawn-health-check.sh — Post-spawn verification that a session actually started
#
# After spawning a subagent, call this script to verify the session is alive.
# Checks that the session's .jsonl transcript file exists AND has messages.
#
# Usage:
#   spawn-health-check.sh --session-key <key> --agent <agent-name> [options]
#
# Options:
#   --session-key <key>   Full session key (e.g., agent:atlas:subagent:UUID)
#   --agent <name>        Agent name (e.g., atlas, synth)
#   --timeout <seconds>   Max seconds to wait for messages (default: 60)
#   --interval <seconds>  Polling interval (default: 5)
#   --min-messages <n>    Minimum messages to consider "alive" (default: 1)
#   --json                Machine-readable output
#   --quiet               Suppress progress output
#
# Exit codes:
#   0 = Session is alive (has messages)
#   1 = Session is phantom (no messages after timeout)
#   2 = Error (missing args, session not found, etc.)
#
# Example:
#   spawn-health-check.sh --session-key "agent:atlas:subagent:abc12345-..." --agent atlas --timeout 30

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

AGENTS_DIR="${HOME}/.openclaw/agents"
SESSION_KEY=""
AGENT_NAME=""
TIMEOUT_SECONDS=60
POLL_INTERVAL=5
MIN_MESSAGES=1
JSON_OUTPUT=false
QUIET=false

# ============================================================================
# Parse args
# ============================================================================

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session-key) SESSION_KEY="$2"; shift 2 ;;
    --agent) AGENT_NAME="$2"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="$2"; shift 2 ;;
    --interval) POLL_INTERVAL="$2"; shift 2 ;;
    --min-messages) MIN_MESSAGES="$2"; shift 2 ;;
    --json) JSON_OUTPUT=true; shift ;;
    --quiet) QUIET=true; shift ;;
    -h|--help)
      echo "Usage: spawn-health-check.sh --session-key <key> --agent <agent> [--timeout <s>] [--interval <s>]"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${SESSION_KEY}" ]] || [[ -z "${AGENT_NAME}" ]]; then
  echo "Error: --session-key and --agent are required" >&2
  exit 2
fi

# Validate agent name (prevent path traversal)
if [[ ! "${AGENT_NAME}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Error: Invalid agent name: ${AGENT_NAME}" >&2
  exit 2
fi

# ============================================================================
# Find session ID from sessions.json index
# ============================================================================

sessions_file="${AGENTS_DIR}/${AGENT_NAME}/sessions/sessions.json"
sessions_dir="${AGENTS_DIR}/${AGENT_NAME}/sessions"

if [[ ! -f "${sessions_file}" ]]; then
  echo "Error: Sessions file not found: ${sessions_file}" >&2
  exit 2
fi

# Look up the sessionId (file UUID) from the session key
session_id=$(jq -r --arg key "${SESSION_KEY}" '
  (if .sessions then .sessions else . end) |
  .[$key].sessionId // empty
' "${sessions_file}" 2>/dev/null || true)

if [[ -z "${session_id}" ]]; then
  # Session key not yet in index — wait for it to appear
  if [[ "${QUIET}" != "true" ]]; then
    echo "⏳ Session key not yet in index, waiting..."
  fi
fi

# ============================================================================
# Poll for messages
# ============================================================================

start_time=$(date +%s)
check_count=0

while true; do
  check_count=$((check_count + 1))
  elapsed=$(( $(date +%s) - start_time ))

  # Re-read session ID in case it appeared in the index
  if [[ -z "${session_id}" ]]; then
    session_id=$(jq -r --arg key "${SESSION_KEY}" '
      (if .sessions then .sessions else . end) |
      .[$key].sessionId // empty
    ' "${sessions_file}" 2>/dev/null || true)
  fi

  # Check the transcript file
  msg_count=0
  transcript_exists=false
  if [[ -n "${session_id}" ]]; then
    jsonl_file="${sessions_dir}/${session_id}.jsonl"
    if [[ -f "${jsonl_file}" ]]; then
      transcript_exists=true
      msg_count=$(grep -c '"type":"message"' "${jsonl_file}" 2>/dev/null || echo "0")
    fi
  fi

  # Success: session has messages
  if [[ "${msg_count}" -ge "${MIN_MESSAGES}" ]]; then
    if [[ "${JSON_OUTPUT}" == "true" ]]; then
      echo "{\"status\":\"alive\",\"sessionKey\":\"${SESSION_KEY}\",\"agent\":\"${AGENT_NAME}\",\"messages\":${msg_count},\"elapsed\":${elapsed},\"checks\":${check_count}}"
    elif [[ "${QUIET}" != "true" ]]; then
      echo "✅ Session alive: ${msg_count} messages after ${elapsed}s (${check_count} checks)"
    fi
    exit 0
  fi

  # Timeout: session is phantom
  if [[ "${elapsed}" -ge "${TIMEOUT_SECONDS}" ]]; then
    if [[ "${JSON_OUTPUT}" == "true" ]]; then
      echo "{\"status\":\"phantom\",\"sessionKey\":\"${SESSION_KEY}\",\"agent\":\"${AGENT_NAME}\",\"messages\":${msg_count},\"elapsed\":${elapsed},\"checks\":${check_count},\"transcriptExists\":${transcript_exists},\"sessionIdFound\":$([ -n \"${session_id}\" ] && echo 'true' || echo 'false')}"
    else
      echo "🚨 PHANTOM DETECTED: ${SESSION_KEY}"
      echo "   Agent: ${AGENT_NAME}"
      echo "   Messages: ${msg_count}"
      echo "   Elapsed: ${elapsed}s (${check_count} checks)"
      echo "   Transcript exists: ${transcript_exists}"
      echo "   Session ID found: $([ -n "${session_id}" ] && echo 'yes' || echo 'no')"
    fi
    exit 1
  fi

  # Progress
  if [[ "${QUIET}" != "true" ]] && [[ "${JSON_OUTPUT}" != "true" ]]; then
    echo "   Check ${check_count}: ${msg_count} messages (${elapsed}s elapsed, timeout ${TIMEOUT_SECONDS}s)"
  fi

  sleep "${POLL_INTERVAL}"
done
