#!/usr/bin/env bash
set -euo pipefail

STATE="$HOME/clawd/runtime/monitor/state.json"
LOG_ERR="$HOME/.openclaw/logs/gateway.err.log"
LOCK="$HOME/.openclaw/gateway.lock"

mkdir -p "$(dirname "$STATE")"
[[ -f "$STATE" ]] || echo '{"last_check":0,"gateway_err_pos":0,"gateway_err_inode":""}' > "$STATE"

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

# --- gateway.err.log incremental scan (avoid repeated alerts + false positives) ---
GATEWAY_ERR_POS=$(jq -r '.gateway_err_pos // 0' "$STATE" 2>/dev/null || echo 0)
GATEWAY_ERR_INODE=$(jq -r '.gateway_err_inode // ""' "$STATE" 2>/dev/null || echo "")
NEW_GATEWAY_ERR_POS=$GATEWAY_ERR_POS
NEW_GATEWAY_ERR_INODE=$GATEWAY_ERR_INODE

if [[ -f "$LOG_ERR" ]]; then
  CUR_INODE=""
  CUR_SIZE=0
  if CUR_INODE=$(stat -f %i "$LOG_ERR" 2>/dev/null); then
    CUR_SIZE=$(stat -f %z "$LOG_ERR" 2>/dev/null || echo 0)
  elif CUR_INODE=$(stat -c %i "$LOG_ERR" 2>/dev/null); then
    CUR_SIZE=$(stat -c %s "$LOG_ERR" 2>/dev/null || echo 0)
  fi

  # Reset cursor if log rotated/truncated.
  if [[ -n "$CUR_INODE" ]]; then
    if [[ "$CUR_INODE" != "$GATEWAY_ERR_INODE" || "$CUR_SIZE" -lt "$GATEWAY_ERR_POS" ]]; then
      GATEWAY_ERR_POS=0
    fi

    # NOTE: avoid broad matches like "timeout" or "token" because they appear in CLI help/usage.
    ERR_RE='TimeoutOverflowWarning|gateway timeout after|Subagent announce failed: Error: gateway timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|\\b401\\b|unauth|unauthorized|invalid\\s+token|token\\s+expired'

    RES=$(ERR_RE="$ERR_RE" python3 - "$LOG_ERR" "$GATEWAY_ERR_POS" <<'PY'
import json, os, re, sys
path = sys.argv[1]
pos = int(sys.argv[2])
rx = re.compile(os.environ.get('ERR_RE',''), re.I)
with open(path, 'rb') as f:
    f.seek(pos)
    data = f.read()
    new_pos = f.tell()
text = data.decode('utf-8', 'ignore')
found = bool(rx.search(text))
print(json.dumps({'found': found, 'new_pos': new_pos}))
PY
)

    if echo "$RES" | jq -e '.found == true' >/dev/null 2>&1; then
      ISSUES+=("P1: auth_or_timeout_errors")
    fi

    NEW_GATEWAY_ERR_POS=$(echo "$RES" | jq -r '.new_pos')
    NEW_GATEWAY_ERR_INODE="$CUR_INODE"
  fi
fi

# Persist state
jq --argjson now "$NOW" \
   --argjson pos "${NEW_GATEWAY_ERR_POS:-0}" \
   --arg inode "${NEW_GATEWAY_ERR_INODE:-}" \
   '.last_check=$now | .gateway_err_pos=$pos | .gateway_err_inode=$inode' \
   "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"

if [[ ${#ISSUES[@]} -eq 0 ]]; then
  echo "HEARTBEAT_OK"
else
  printf '%s\n' "${ISSUES[@]}"
fi
