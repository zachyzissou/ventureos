#!/usr/bin/env bash
# check-session-counts.sh — Monitor session file counts per agent.
#
# Outputs JSON with per-agent counts and alert status.
# Optionally sends Discord webhook alerts for critical counts.
#
# Usage:
#   ./check-session-counts.sh [--json] [--alert] [--quiet]
#
# Thresholds:
#   >200 files: WARNING
#   >500 files: CRITICAL (blocks spawns)

set -euo pipefail

OPENCLAW_DIR="${HOME}/.openclaw"
AGENTS_DIR="${OPENCLAW_DIR}/agents"

# Source HTTP timeout defaults (docs/TIMEOUT_POLICY.md)
SCRIPT_DIR_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/http-defaults.sh
[[ -f "$SCRIPT_DIR_SELF/lib/http-defaults.sh" ]] && source "$SCRIPT_DIR_SELF/lib/http-defaults.sh"
LOG_FILE="${OPENCLAW_DIR}/logs/session-monitor.log"

WARN_THRESHOLD=200
CRIT_THRESHOLD=500
JSON_MODE=false
ALERT_MODE=false
QUIET_MODE=false
WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)   JSON_MODE=true; shift ;;
    --alert)  ALERT_MODE=true; shift ;;
    --quiet)  QUIET_MODE=true; shift ;;
    -h|--help)
      echo "Usage: check-session-counts.sh [--json] [--alert] [--quiet]"
      exit 0
      ;;
    *) shift ;;
  esac
done

mkdir -p "$(dirname "$LOG_FILE")"

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

send_discord_alert() {
  local message="$1"
  if [[ -n "$WEBHOOK_URL" ]]; then
    # shellcheck disable=SC2086
    curl -sS ${CURL_WEBHOOK_FLAGS:-"--connect-timeout 2 --max-time 10"} \
      -H "Content-Type: application/json" \
      -d "{\"content\": \"$message\"}" \
      "$WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

# Collect data
declare -a json_entries=()
has_warning=false
has_critical=false
alert_messages=()

for agent_dir in "$AGENTS_DIR"/*/; do
  [[ -d "$agent_dir" ]] || continue
  agent_name="$(basename "$agent_dir")"
  sessions_dir="${agent_dir}sessions"

  jsonl_count=0
  deleted_count=0
  total_count=0

  if [[ -d "$sessions_dir" ]]; then
    jsonl_count=$(find "$sessions_dir" -maxdepth 1 -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')
    deleted_count=$(find "$sessions_dir" -maxdepth 1 -name '*.deleted.*' 2>/dev/null | wc -l | tr -d ' ')
    total_count=$(( jsonl_count + deleted_count ))
  fi

  # Determine status
  status="ok"
  if [[ $total_count -gt $CRIT_THRESHOLD ]]; then
    status="critical"
    has_critical=true
    alert_messages+=("🚨 **CRITICAL** \`$agent_name\`: $total_count files ($jsonl_count active, $deleted_count deleted)")
  elif [[ $total_count -gt $WARN_THRESHOLD ]]; then
    status="warning"
    has_warning=true
    alert_messages+=("⚠️ **WARNING** \`$agent_name\`: $total_count files ($jsonl_count active, $deleted_count deleted)")
  fi

  json_entries+=("{\"agent\":\"$agent_name\",\"jsonl\":$jsonl_count,\"deleted\":$deleted_count,\"total\":$total_count,\"status\":\"$status\"}")

  if [[ "$QUIET_MODE" != true ]]; then
    printf "%-25s jsonl=%-6d deleted=%-6d total=%-6d [%s]\n" "$agent_name" "$jsonl_count" "$deleted_count" "$total_count" "$status"
  fi
done

# Build JSON output
overall_status="ok"
if [[ "$has_critical" == true ]]; then
  overall_status="critical"
elif [[ "$has_warning" == true ]]; then
  overall_status="warning"
fi

json_agents=$(IFS=,; echo "${json_entries[*]}")
json_output="{\"ts\":\"$ts\",\"status\":\"$overall_status\",\"warn_threshold\":$WARN_THRESHOLD,\"crit_threshold\":$CRIT_THRESHOLD,\"agents\":[${json_agents}]}"

if [[ "$JSON_MODE" == true ]]; then
  echo "$json_output"
fi

# Log
echo "[$ts] status=$overall_status" >> "$LOG_FILE"

# Alert if needed
if [[ "$ALERT_MODE" == true && ${#alert_messages[@]} -gt 0 ]]; then
  alert_text="📊 **Session Count Monitor** ($ts)\\n"
  for msg in "${alert_messages[@]}"; do
    alert_text+="$msg\\n"
  done

  if [[ "$has_critical" == true ]]; then
    alert_text+="\\n🔧 Auto-rotation triggered."
    # Auto-rotate critical agents
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -x "$SCRIPT_DIR/rotate-agent-sessions.sh" ]]; then
      "$SCRIPT_DIR/rotate-agent-sessions.sh" --alert 2>&1 | tail -20 >> "$LOG_FILE"
    fi
  fi

  send_discord_alert "$alert_text"
fi

# Exit code reflects status
case "$overall_status" in
  critical) exit 2 ;;
  warning)  exit 1 ;;
  *)        exit 0 ;;
esac
