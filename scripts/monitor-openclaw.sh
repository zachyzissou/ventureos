#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/agent-env.sh
source "$SCRIPT_DIR/lib/agent-env.sh"

AGENT_ID="$(agent_env_agent_id)"
WORKSPACE_ROOT="$(agent_env_workspace_root)"
TMPDIR="$(agent_env_tmp_dir)"
export TMPDIR

STATE="$WORKSPACE_ROOT/runtime/monitor/$AGENT_ID/state.json"
LOG_ERR="$HOME/.openclaw/logs/gateway.err.log"
LOCK="$HOME/.openclaw/gateway.lock"

# Cooldown for repeated identical P1 alerts (seconds)
COOLDOWN_SECONDS=7200  # 2 hours

PATTERN='auth|unauth|unauthorized|forbidden|\b401\b|\b403\b|token(=|:|[[:space:]]|$)|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|gateway timeout'

stat_inode() {
  local f="$1"
  stat -f %i "$f" 2>/dev/null || stat -c %i "$f" 2>/dev/null || echo ""
}

stat_size() {
  local f="$1"
  stat -f %z "$f" 2>/dev/null || stat -c %s "$f" 2>/dev/null || echo "0"
}

mkdir -p "$(dirname "$STATE")"
[[ -f "$STATE" ]] || echo '{"last_check":0,"last_alert":0,"last_issue_hash":"","gateway_err_pos":0,"gateway_err_inode":""}' > "$STATE"

NOW=$(date +%s)
declare -a ISSUES=()
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

# Auth/network scan (incremental since last run; avoids "sticky" historical errors)
MATCH_SNIPPET=""
NEW_POS=0
CUR_INODE=""

LAST_POS=$(jq -r '.gateway_err_pos // 0' "$STATE" 2>/dev/null || echo 0)
LAST_INODE=$(jq -r '.gateway_err_inode // ""' "$STATE" 2>/dev/null || echo "")

if [[ -f "$LOG_ERR" ]]; then
  CUR_INODE=$(stat_inode "$LOG_ERR")
  SIZE=$(stat_size "$LOG_ERR")

  # If rotated/truncated, restart from beginning.
  if [[ -n "$CUR_INODE" && "$LAST_INODE" != "" && "$CUR_INODE" != "$LAST_INODE" ]]; then
    LAST_POS=0
  fi
  if (( SIZE < LAST_POS )); then
    LAST_POS=0
  fi

  if (( SIZE > LAST_POS )); then
    START=$((LAST_POS + 1))
    MATCH_SNIPPET=$(tail -c +"$START" "$LOG_ERR" 2>/dev/null | grep -Ei "$PATTERN" | tail -n 5 || true)
  fi

  NEW_POS=$SIZE

  if [[ -n "$MATCH_SNIPPET" ]]; then
    ISSUES+=("P1: auth_or_timeout_errors")
  fi
fi

LAST_ALERT=$(jq -r '.last_alert // 0' "$STATE" 2>/dev/null || echo 0)
LAST_HASH=$(jq -r '.last_issue_hash // ""' "$STATE" 2>/dev/null || echo "")

# Fingerprint current issue state + (small) evidence so we can dedupe repeats.
ISSUE_KEY=$(printf '%s;' "${ISSUES[@]-}")
CUR_HASH=$(printf '%s\n%s' "$ISSUE_KEY" "$MATCH_SNIPPET" | shasum -a 256 | awk '{print $1}')

# Always emit P0 immediately; only dedupe repeated P1-only alerts.
HAS_P0=false
for i in "${ISSUES[@]-}"; do
  if [[ "$i" == P0:* ]]; then
    HAS_P0=true
    break
  fi
done

SUPPRESS=false
if [[ ${#ISSUES[@]} -gt 0 && "$HAS_P0" == "false" ]]; then
  if [[ "$CUR_HASH" == "$LAST_HASH" && $((NOW - LAST_ALERT)) -lt $COOLDOWN_SECONDS ]]; then
    SUPPRESS=true
  fi
fi

# Decide how to persist state.
NEW_LAST_ALERT=$LAST_ALERT
NEW_HASH=$LAST_HASH
if [[ ${#ISSUES[@]} -eq 0 ]]; then
  NEW_HASH=""
elif [[ "$SUPPRESS" == "false" ]]; then
  NEW_LAST_ALERT=$NOW
  NEW_HASH=$CUR_HASH
else
  NEW_HASH=$CUR_HASH
fi

# Persist state (atomic)
jq --argjson now "$NOW" \
   --argjson last_alert "$NEW_LAST_ALERT" \
   --arg hash "$NEW_HASH" \
   --argjson pos "$NEW_POS" \
   --arg inode "$CUR_INODE" \
   --arg agentId "$AGENT_ID" \
   --arg workspace "$WORKSPACE_ROOT" \
   '.last_check=$now | .last_alert=$last_alert | .last_issue_hash=$hash | .gateway_err_pos=$pos | .gateway_err_inode=$inode | .agentId=$agentId | .workspace=$workspace' \
   "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"

if [[ ${#ISSUES[@]} -eq 0 ]]; then
  echo "HEARTBEAT_OK"
  exit 0
fi

if [[ "$SUPPRESS" == "true" ]]; then
  echo "HEARTBEAT_OK"
  exit 0
fi

printf '%s\n' "${ISSUES[@]}"
if [[ -n "$MATCH_SNIPPET" ]]; then
  echo "---"
  echo "evidence (new matches since last check):"
  echo "$MATCH_SNIPPET"
fi
