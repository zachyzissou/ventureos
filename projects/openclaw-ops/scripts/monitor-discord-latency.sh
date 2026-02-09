#!/usr/bin/env bash
set -euo pipefail

# Monitor Discord latency/backlog signals in OpenClaw gateway logs.
# Alerts to SlurpNet alerts channel and (optionally) restarts gateway with cooldown.

ALERTS_CHANNEL_ID="1466893115460812979"
WEBHOOK_SEND="/Users/zachgonser/clawd/scripts/discord-webhook-send.mjs"

LOG_MAIN="/Users/zachgonser/.openclaw/logs/gateway.log"
LOG_ERR="/Users/zachgonser/.openclaw/logs/gateway.err.log"

STATE_DIR="/Users/zachgonser/clawd/runtime/monitor"
STATE_FILE="$STATE_DIR/discord-latency.json"

# How much log to scan each run
TAIL_LINES="${TAIL_LINES:-8000}"

# Only consider hits within this recent window
WINDOW_MINUTES="${WINDOW_MINUTES:-60}"

# Alert suppression window (seconds)
SUPPRESS_SECONDS="${SUPPRESS_SECONDS:-3600}"

# Auto-restart controls
AUTO_RESTART="${AUTO_RESTART:-0}"          # set to 1 to allow
RESTART_COOLDOWN_SECONDS="${RESTART_COOLDOWN_SECONDS:-14400}"  # 4h default

now_epoch() { date +%s; }
now_iso_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

mkdir -p "$STATE_DIR"

last_alert_at=0
last_restart_at=0
if [[ -f "$STATE_FILE" ]]; then
  last_alert_at=$(jq -r '.lastAlertAt // 0' "$STATE_FILE" 2>/dev/null || echo 0)
  last_restart_at=$(jq -r '.lastRestartAt // 0' "$STATE_FILE" 2>/dev/null || echo 0)
fi

scan_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0

  local cutoff
  cutoff=$(python3 - <<PY
import time
print(int(time.time()) - (int("$WINDOW_MINUTES")*60))
PY
)

  # Ignore our own exec traces. Only keep recent hits (based on leading ISO timestamp).
  # Patterns include latency/backlog AND Mission Control critical errors (GitLab MCP/webhook).
  ( tail -n "$TAIL_LINES" "$f" \
      | rg -n "Slow listener detected|lane wait exceeded|Webhook POST failed|No webhook configured for channel|Authorization required for gitlab|GitLab API error: 401 Unauthorized|MCP error -32603" \
      | rg -v "\[exec\]" \
      | python3 - <<PY
import sys,datetime
cutoff=int("$cutoff")
for line in sys.stdin:
    # Expected prefix: 2026-02-08T20:06:57.300Z ...
    ts=line[:24]
    try:
        dt=datetime.datetime.fromisoformat(ts.replace('Z','+00:00'))
        if int(dt.timestamp()) >= cutoff:
            sys.stdout.write(line)
    except Exception:
        # If we can't parse, keep it (better noisy than blind)
        sys.stdout.write(line)
PY
    ) || true
}

hits_main=$(scan_file "$LOG_MAIN")
hits_err=$(scan_file "$LOG_ERR")

status="ok"
reason=""
if [[ -n "$hits_main" || -n "$hits_err" ]]; then
  status="degraded"
  # classify reason (best-effort)
  if echo "$hits_main$hits_err" | rg -q "Slow listener detected|lane wait exceeded"; then
    reason="discord_latency_signals_detected"
  elif echo "$hits_main$hits_err" | rg -q "Webhook POST failed|No webhook configured for channel"; then
    reason="discord_webhook_failures_detected"
  elif echo "$hits_main$hits_err" | rg -q "Authorization required for gitlab|GitLab API error: 401 Unauthorized|MCP error -32603"; then
    reason="gitlab_mcp_errors_detected"
  else
    reason="discord_or_mission_control_errors_detected"
  fi
fi

now=$(now_epoch)
should_alert="false"
if [[ "$status" != "ok" ]]; then
  if (( now - last_alert_at >= SUPPRESS_SECONDS )); then
    should_alert="true"
  fi
fi

can_alert="false"
webhook_map="/Users/zachgonser/.openclaw/credentials/discord/webhooks.json"
if [[ -f "$webhook_map" ]]; then
  if jq -e --arg cid "$ALERTS_CHANNEL_ID" 'has($cid)' "$webhook_map" >/dev/null 2>&1; then
    can_alert="true"
  fi
fi

send_alert() {
  local text="$1"
  if [[ "$can_alert" == "true" ]]; then
    node "$WEBHOOK_SEND" --channel "$ALERTS_CHANNEL_ID" --text "$text" >/dev/null
  else
    echo "NOTE: alerts webhook missing; cannot send alert" >&2
  fi
}

restart_gateway() {
  # Prefer OpenClaw CLI; safe and explicit.
  openclaw gateway restart
}

restart_attempted="false"
restart_performed="false"

if [[ "$should_alert" == "true" ]]; then
  text=$(
    cat <<EOF
P1 OpenClaw Discord / Mission Control health ($(now_iso_utc))
- signal: ${reason}
- patterns: latency/backlog OR webhook failures OR GitLab MCP auth/errors
- next: consider gateway restart (latency) or re-auth GitLab MCP / fix webhook map (errors)
EOF
  )

  # include a small snippet (trimmed) to aid diagnosis
  if [[ -n "$hits_main" ]]; then
    text+=$'\n\nRecent hits (gateway.log):\n'
    text+="$(echo "$hits_main" | tail -n 8)"
  fi
  if [[ -n "$hits_err" ]]; then
    text+=$'\n\nRecent hits (gateway.err.log):\n'
    text+="$(echo "$hits_err" | tail -n 8)"
  fi

  send_alert "$text"
  last_alert_at=$now
fi

if [[ "$status" != "ok" && "$AUTO_RESTART" == "1" ]]; then
  restart_attempted="true"
  if (( now - last_restart_at >= RESTART_COOLDOWN_SECONDS )); then
    restart_gateway || true
    restart_performed="true"
    last_restart_at=$now

    send_alert "P1 Auto-restart executed (${now_iso_utc}) due to Discord latency/backlog signals. Cooldown=${RESTART_COOLDOWN_SECONDS}s"
  fi
fi

# persist state
jq -n \
  --arg status "$status" \
  --arg reason "$reason" \
  --argjson lastAlertAt "$last_alert_at" \
  --argjson lastRestartAt "$last_restart_at" \
  --argjson restartAttempted "$( [[ "$restart_attempted" == "true" ]] && echo true || echo false )" \
  --argjson restartPerformed "$( [[ "$restart_performed" == "true" ]] && echo true || echo false )" \
  '{status:$status,reason:$reason,lastAlertAt:$lastAlertAt,lastRestartAt:$lastRestartAt,restartAttempted:$restartAttempted,restartPerformed:$restartPerformed,updatedAt:(now|floor)}' \
  > "$STATE_FILE"

if [[ "$status" == "ok" ]]; then
  echo "HEARTBEAT_OK"
  exit 0
else
  echo "P1: ${reason}"
  exit 2
fi
