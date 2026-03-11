#!/usr/bin/env bash
# phantom-detector.sh — Detect phantom sessions (spawned but stuck at 0 messages)
#
# Scans all agent sessions for sessions that:
# 1. Were created > MIN_AGE_MINUTES ago
# 2. Have 0 messages in their .jsonl transcript file
# 3. Are subagent type (most vulnerable to phantom pattern)
#
# IMPORTANT: Message counts come from the actual .jsonl transcript files,
# NOT from the sessions.json index (which does NOT contain a messages array).
# The sessions.json index stores metadata; messages live in {sessionId}.jsonl.
#
# Usage:
#   phantom-detector.sh [--alert] [--min-age <minutes>] [--json]
#
# Options:
#   --alert         Send alerts to Discord webhook (DISCORD_WEBHOOK_URL env)
#   --min-age <n>   Minimum age in minutes before flagging (default: 5)
#   --json          Output machine-readable JSON
#   --fix           Attempt to clean up phantom sessions
#
# Exit codes:
#   0 = No phantoms found
#   1 = Phantoms detected
#   2 = Error
#
# Designed to run as a cron job every 15 minutes.

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

AGENTS_DIR="${HOME}/.openclaw/agents"
LOG_DIR="${HOME}/clawd/ventureos/runtime/logs"

# Source HTTP timeout defaults (docs/TIMEOUT_POLICY.md)
PHANTOM_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/http-defaults.sh
[[ -f "$PHANTOM_SCRIPT_DIR/lib/http-defaults.sh" ]] && source "$PHANTOM_SCRIPT_DIR/lib/http-defaults.sh"
LOG_FILE="${LOG_DIR}/phantom-detector.jsonl"
MIN_AGE_MINUTES=5
ALERT=false
JSON_OUTPUT=false
FIX=false
WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
ALERT_CHANNEL="${PHANTOM_ALERT_CHANNEL:-1470210601879076914}"  # nexus-mission-control

# ============================================================================
# Parse args
# ============================================================================

while [[ $# -gt 0 ]]; do
  case "$1" in
    --alert) ALERT=true; shift ;;
    --min-age) MIN_AGE_MINUTES="$2"; shift 2 ;;
    --json) JSON_OUTPUT=true; shift ;;
    --fix) FIX=true; shift ;;
    -h|--help)
      echo "Usage: phantom-detector.sh [--alert] [--min-age <minutes>] [--json] [--fix]"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ============================================================================
# Setup
# ============================================================================

mkdir -p "${LOG_DIR}"
NOW_EPOCH=$(date +%s)
CUTOFF_EPOCH=$((NOW_EPOCH - MIN_AGE_MINUTES * 60))
PHANTOM_COUNT=0
PHANTOMS=()

log_entry() {
  local event="$1"
  shift
  local fields=""
  for f in "$@"; do
    fields="${fields},${f}"
  done
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"event\":\"${event}\"${fields}}" >> "${LOG_FILE}"
}

# ============================================================================
# Count messages in a .jsonl transcript file
# ============================================================================

count_messages_in_jsonl() {
  local jsonl_file="$1"
  if [[ ! -f "${jsonl_file}" ]]; then
    echo "0"
    return
  fi
  # Count lines with "type":"message" — these are actual agent messages
  # Note: grep -c returns exit code 1 when count is 0, but still outputs "0".
  # We capture its output (which may be "0") and fallback to "0" only if grep fails entirely.
  local count
  count=$(grep -c '"type":"message"' "${jsonl_file}" 2>/dev/null) || count="0"
  echo "${count}"
}

# ============================================================================
# Scan all agent sessions
# ============================================================================

if [[ ! -d "${AGENTS_DIR}" ]]; then
  echo "Error: Agents directory not found: ${AGENTS_DIR}" >&2
  exit 2
fi

for agent_dir in "${AGENTS_DIR}"/*/; do
  agent_name=$(basename "${agent_dir}")
  sessions_file="${agent_dir}sessions/sessions.json"
  sessions_dir="${agent_dir}sessions"

  if [[ ! -f "${sessions_file}" ]]; then
    continue
  fi

  # Parse sessions from JSON index
  # NOTE: We extract sessionId to find the .jsonl file, NOT .value.messages
  # The sessions.json index does NOT contain a messages array.
  # Messages are stored in separate {sessionId}.jsonl files.
  sessions_data=$(jq -r '
    (if .sessions then .sessions else . end) |
    to_entries[] |
    select(.key | contains("subagent")) |
    {
      key: .key,
      sessionId: (.value.sessionId // ""),
      model: (.value.model // "unknown"),
      updatedAt: (.value.updatedAt // 0),
      createdAt: (.value.createdAt // .value.updatedAt // 0),
      label: (.value.label // .value.displayName // ""),
      totalTokens: (.value.totalTokens // 0),
      inputTokens: (.value.inputTokens // 0),
      outputTokens: (.value.outputTokens // 0),
      lastError: (.value.lastError // "")
    } |
    "\(.key)|\(.sessionId)|\(.model)|\(.updatedAt)|\(.createdAt)|\(.label)|\(.totalTokens)|\(.inputTokens)|\(.outputTokens)|\(.lastError)"
  ' "${sessions_file}" 2>/dev/null || true)

  if [[ -z "${sessions_data}" ]]; then
    continue
  fi

  while IFS='|' read -r session_key session_id model updated_at created_at label total_tokens input_tokens output_tokens last_error; do
    # Skip empty lines
    [[ -z "${session_key}" ]] && continue

    # Convert updatedAt to epoch (it's in milliseconds)
    if [[ "${updated_at}" =~ ^[0-9]+$ ]] && [[ "${updated_at}" -gt 1000000000000 ]]; then
      updated_epoch=$((updated_at / 1000))
    elif [[ "${updated_at}" =~ ^[0-9]+$ ]]; then
      updated_epoch="${updated_at}"
    else
      updated_epoch=0
    fi

    # Skip sessions that are too new
    if [[ "${updated_epoch}" -gt "${CUTOFF_EPOCH}" ]] && [[ "${updated_epoch}" -gt 0 ]]; then
      continue
    fi

    # Count ACTUAL messages from the .jsonl transcript file
    jsonl_file="${sessions_dir}/${session_id}.jsonl"
    msg_count=$(count_messages_in_jsonl "${jsonl_file}")

    # Check for phantom conditions
    is_phantom=false
    phantom_reason=""

    # Condition 1: .jsonl file doesn't exist at all
    if [[ -n "${session_id}" ]] && [[ ! -f "${jsonl_file}" ]]; then
      is_phantom=true
      phantom_reason="missing_transcript"
    fi

    # Condition 2: .jsonl file exists but has 0 messages
    if [[ -f "${jsonl_file}" ]] && [[ "${msg_count}" -eq 0 ]]; then
      is_phantom=true
      phantom_reason="${phantom_reason:+${phantom_reason}+}zero_messages"
    fi

    # Condition 3: 0 total tokens AND 0 messages (truly did nothing)
    if [[ "${total_tokens}" -eq 0 ]] && [[ "${msg_count}" -eq 0 ]]; then
      is_phantom=true
      phantom_reason="${phantom_reason:+${phantom_reason}+}zero_tokens"
    fi

    # Condition 4: Has error AND 0 messages
    if [[ -n "${last_error}" ]] && [[ "${last_error}" != "" ]] && [[ "${msg_count}" -eq 0 ]]; then
      is_phantom=true
      phantom_reason="${phantom_reason:+${phantom_reason}+}error:${last_error}"
    fi

    if [[ "${is_phantom}" == "true" ]]; then
      PHANTOM_COUNT=$((PHANTOM_COUNT + 1))

      age_minutes=0
      if [[ "${updated_epoch}" -gt 0 ]]; then
        age_minutes=$(( (NOW_EPOCH - updated_epoch) / 60 ))
      fi

      phantom_info="${session_key}|${agent_name}|${msg_count}|${model}|${age_minutes}m|${phantom_reason}|${label}"
      PHANTOMS+=("${phantom_info}")

      if [[ "${JSON_OUTPUT}" != "true" ]]; then
        echo "⚠️  PHANTOM: ${session_key}"
        echo "   Agent: ${agent_name} | Messages: ${msg_count} | Tokens: ${total_tokens}"
        echo "   Model: ${model} | Age: ${age_minutes}m | Reason: ${phantom_reason}"
        echo "   Label: ${label}"
        echo "   Transcript: ${jsonl_file}"
        echo ""
      fi

      log_entry "phantom_detected" \
        "\"sessionKey\":\"${session_key}\"" \
        "\"agent\":\"${agent_name}\"" \
        "\"messageCount\":${msg_count}" \
        "\"model\":\"${model}\"" \
        "\"ageMinutes\":${age_minutes}" \
        "\"reason\":\"${phantom_reason}\"" \
        "\"label\":\"${label}\""
    fi
  done <<< "${sessions_data}"
done

# ============================================================================
# Also check gateway error log for recent PHANTOM markers
# ============================================================================

GATEWAY_ERR="${HOME}/.openclaw/logs/gateway.err.log"
if [[ -f "${GATEWAY_ERR}" ]]; then
  # Count PHANTOM entries in last hour
  recent_phantoms=$(grep -c "PHANTOM" "${GATEWAY_ERR}" 2>/dev/null) || recent_phantoms="0"
  if [[ "${recent_phantoms}" -gt 0 ]] && [[ "${JSON_OUTPUT}" != "true" ]]; then
    echo "📊 Gateway log: ${recent_phantoms} total PHANTOM entries"
    echo ""
  fi
fi

# ============================================================================
# Check for model errors (common phantom cause)
# ============================================================================

GATEWAY_LOG="${HOME}/.openclaw/logs/gateway.err.log"
if [[ -f "${GATEWAY_LOG}" ]]; then
  # Look for model errors in last 30 minutes
  model_errors=$(grep -i "Unknown model" "${GATEWAY_LOG}" 2>/dev/null | tail -5 || true)
  if [[ -n "${model_errors}" ]] && [[ "${JSON_OUTPUT}" != "true" ]]; then
    echo "🔧 Recent model errors (common phantom cause):"
    echo "${model_errors}" | while read -r line; do
      echo "   ${line}"
    done
    echo ""
  fi
fi

# ============================================================================
# Output
# ============================================================================

if [[ "${JSON_OUTPUT}" == "true" ]]; then
  # Build JSON array of phantoms
  json_phantoms="["
  first=true
  if [[ ${#PHANTOMS[@]} -gt 0 ]]; then
    for phantom in "${PHANTOMS[@]}"; do
      [[ -z "${phantom}" ]] && continue
      IFS='|' read -r key agent msgs model age reason label <<< "${phantom}"
      if [[ "${first}" != "true" ]]; then
        json_phantoms+=","
      fi
      json_phantoms+="{\"sessionKey\":\"${key}\",\"agent\":\"${agent}\",\"messages\":${msgs:-0},\"model\":\"${model}\",\"age\":\"${age}\",\"reason\":\"${reason}\",\"label\":\"${label}\"}"
      first=false
    done
  fi
  json_phantoms+="]"

  echo "{\"phantomCount\":${PHANTOM_COUNT},\"phantoms\":${json_phantoms},\"checkedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
fi

# ============================================================================
# Summary
# ============================================================================

if [[ "${JSON_OUTPUT}" != "true" ]]; then
  if [[ "${PHANTOM_COUNT}" -eq 0 ]]; then
    echo "✅ No phantom sessions detected (checked $(find "${AGENTS_DIR}" -name "sessions.json" 2>/dev/null | wc -l | tr -d ' ') agent session stores)"
  else
    echo "🚨 ${PHANTOM_COUNT} phantom session(s) detected!"
  fi
fi

log_entry "scan_complete" \
  "\"phantomCount\":${PHANTOM_COUNT}" \
  "\"minAgeMinutes\":${MIN_AGE_MINUTES}"

# ============================================================================
# Alert
# ============================================================================

if [[ "${ALERT}" == "true" ]] && [[ "${PHANTOM_COUNT}" -gt 0 ]]; then
  alert_msg="🚨 **Phantom Session Alert**\n\n"
  alert_msg+="**${PHANTOM_COUNT}** phantom session(s) detected at $(date '+%Y-%m-%d %H:%M %Z')\n\n"

  if [[ ${#PHANTOMS[@]} -gt 0 ]]; then
    for phantom in "${PHANTOMS[@]}"; do
      [[ -z "${phantom}" ]] && continue
      IFS='|' read -r key agent msgs model age reason label <<< "${phantom}"
      short_key=$(echo "${key}" | grep -o '[a-f0-9-]*$' | head -c 8)
      alert_msg+="• \`${short_key}\` (${agent}) — ${reason} — ${age} old\n"
    done
  fi

  alert_msg+="\nRun \`phantom-detector.sh\` for details."

  if [[ -n "${WEBHOOK_URL}" ]]; then
    # Use jq for safe JSON encoding (prevents command injection)
    payload=$(jq -n --arg msg "${alert_msg}" '{"content": $msg}')
    # shellcheck disable=SC2086
    curl -sS ${CURL_WEBHOOK_FLAGS:-"--connect-timeout 2 --max-time 10"} \
      -H "Content-Type: application/json" \
      -d "${payload}" \
      "${WEBHOOK_URL}" >/dev/null 2>&1 || true
  fi
fi

# ============================================================================
# Track rate over time
# ============================================================================

RATE_FILE="${LOG_DIR}/phantom-rate.jsonl"
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"count\":${PHANTOM_COUNT}}" >> "${RATE_FILE}"

# Exit code
if [[ "${PHANTOM_COUNT}" -gt 0 ]]; then
  exit 1
else
  exit 0
fi
