#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

STATE="$HOME/clawd/runtime/monitor/state.json"
LOG_ERR="$HOME/.openclaw/logs/gateway.err.log"
LOCK="$HOME/.openclaw/gateway.lock"

mkdir -p "$(dirname "$STATE")"
[[ -f "$STATE" ]] || echo '{"last_check":0}' > "$STATE"

NOW=$(date +%s)
ISSUES=()
GATEWAY_OK=true

if ! openclaw gateway status >/dev/null 2>&1; then
  GATEWAY_OK=false
  ISSUES+=("P0: gateway_down")
fi

# Stale gateway.lock (only meaningful if gateway is down)
if [[ "$GATEWAY_OK" == "false" && -f "$LOCK" ]]; then
  MTIME=""
  if MTIME=$(stat -f %m "$LOCK" 2>/dev/null); then
    :
  elif MTIME=$(stat -c %Y "$LOCK" 2>/dev/null); then
    :
  else
    MTIME=""
  fi
  if [[ -n "$MTIME" ]]; then
    AGE=$((NOW - MTIME))
    if (( AGE > 600 )); then
      ISSUES+=("P1: stale_gateway_lock (${AGE}s)")
    fi
  fi
fi

# Auth/network scan (last 200 lines)
if [[ -f "$LOG_ERR" ]]; then
  if tail -n 200 "$LOG_ERR" | grep -Eiq 'auth|unauth|unauthorized|forbidden|401|403|token(=|:|[[:space:]]|$)|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|gateway timeout'; then
    ISSUES+=("P1: auth_or_timeout_errors")
  fi
fi

jq ".last_check=$NOW" "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"

if [[ ${#ISSUES[@]} -eq 0 ]]; then
  echo "HEARTBEAT_OK"
else
  printf '%s\n' "${ISSUES[@]}"
fi
