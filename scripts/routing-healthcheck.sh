#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/agent-env.sh
source "$SCRIPT_DIR/lib/agent-env.sh"

AGENT_ID="$(agent_env_agent_id)"
WORKSPACE_ROOT="$(agent_env_workspace_root)"
TMPDIR="$(agent_env_tmp_dir)"
export TMPDIR

CFG="${ROUTING_CONFIG_PATH:-$WORKSPACE_ROOT/config/alert-routing.json}"
STATE_DIR="${ROUTING_STATE_DIR:-$WORKSPACE_ROOT/runtime/monitor/$AGENT_ID}"
STATE_FILE="$STATE_DIR/routing-healthcheck.json"

# Shared sender allowlist: workspace copy first, then shared canonical path(s).
DEFAULT_WEBHOOK_SEND_WORKSPACE="$WORKSPACE_ROOT/scripts/discord-webhook-send.mjs"
DEFAULT_WEBHOOK_SEND_SHARED="$HOME/clawd/scripts/discord-webhook-send.mjs"
WEBHOOK_SEND="${DISCORD_WEBHOOK_SEND:-}"
if [[ -z "$WEBHOOK_SEND" ]]; then
  if [[ -f "$DEFAULT_WEBHOOK_SEND_WORKSPACE" ]]; then
    WEBHOOK_SEND="$DEFAULT_WEBHOOK_SEND_WORKSPACE"
  else
    WEBHOOK_SEND="$DEFAULT_WEBHOOK_SEND_SHARED"
  fi
fi

DEFAULT_SHARED_ALLOWLIST=(
  "$DEFAULT_WEBHOOK_SEND_WORKSPACE"
  "$DEFAULT_WEBHOOK_SEND_SHARED"
  "$HOME/clawd/projects/openclaw-upgrade/scripts/retry.sh"
  "$HOME/clawd/projects/openclaw-upgrade/scripts/with-timeout.sh"
)

IFS=':' read -r -a EXTRA_SHARED_ALLOWLIST <<< "${SHARED_SCRIPT_ALLOWLIST:-}"

now_epoch() { date +%s; }
now_iso_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

fail() {
  echo "P1: $1"
}

resolved_cfg="$(agent_env_resolve_path "$CFG")"
resolved_state_file="$(agent_env_resolve_path "$STATE_FILE")"
resolved_webhook_send="$(agent_env_resolve_path "$WEBHOOK_SEND")"

is_in_workspace() {
  local target="$1"
  [[ "$(agent_env_is_within "$target" "$WORKSPACE_ROOT")" == "true" ]]
}

is_shared_allowlisted() {
  local target="$1"
  local candidate

  for candidate in "${DEFAULT_SHARED_ALLOWLIST[@]}"; do
    [[ -z "$candidate" ]] && continue
    if [[ "$(agent_env_resolve_path "$candidate")" == "$target" ]]; then
      return 0
    fi
  done

  for candidate in "${EXTRA_SHARED_ALLOWLIST[@]:-}"; do
    [[ -z "$candidate" ]] && continue
    if [[ "$(agent_env_resolve_path "$candidate")" == "$target" ]]; then
      return 0
    fi
  done

  return 1
}

assert_workspace_or_allowlisted() {
  local path="$1"
  local purpose="$2"

  if is_in_workspace "$path"; then
    return 0
  fi

  if is_shared_allowlisted "$path"; then
    return 0
  fi

  fail "PATH_ISOLATION_DENY:$purpose:$path"
  exit 1
}

# Default deny outside workspace for mutable paths.
if ! is_in_workspace "$resolved_cfg"; then
  fail "PATH_ISOLATION_DENY:config_outside_workspace:$resolved_cfg"
  exit 1
fi
if ! is_in_workspace "$resolved_state_file"; then
  fail "PATH_ISOLATION_DENY:state_outside_workspace:$resolved_state_file"
  exit 1
fi
assert_workspace_or_allowlisted "$resolved_webhook_send" "webhook_sender"

mkdir -p "$STATE_DIR"

if [[ ! -f "$CFG" ]]; then
  fail "missing_config:$CFG"
  exit 1
fi

alerts_channel_id=$(jq -r '.alertsChannelId' "$CFG")
webhook_map_path=$(jq -r '.webhookMapPath' "$CFG")
suppress_seconds=$(jq -r '.suppressSeconds' "$CFG")
resolved_webhook_map_path="$(agent_env_resolve_path "$webhook_map_path")"

if [[ -z "$alerts_channel_id" || "$alerts_channel_id" == "null" ]]; then
  fail "invalid_config:alertsChannelId"
  exit 1
fi

if [[ ! -f "$resolved_webhook_map_path" ]]; then
  fail "missing_webhook_map:$resolved_webhook_map_path"
  exit 1
fi

# Required role channel ids (alerts channel is where we notify; a webhook for alerts is preferred but not required)
role_ids=$(jq -r '.roleChannels | to_entries | map(.value) | unique | .[]' "$CFG")

missing_roles=()
for cid in $role_ids; do
  # webhook map is expected to be an object keyed by channelId
  # (we treat presence of any value at that key as "configured")
  present=$(jq -r --arg cid "$cid" 'has($cid)' "$resolved_webhook_map_path")
  if [[ "$present" != "true" ]]; then
    missing_roles+=("$cid")
  fi
done

has_alerts_webhook=$(jq -r --arg cid "$alerts_channel_id" 'has($cid)' "$resolved_webhook_map_path")

status="ok"
reason=""
if (( ${#missing_roles[@]} > 0 )); then
  status="fail"
  reason="missing_role_webhooks:${missing_roles[*]}"
elif [[ "$has_alerts_webhook" != "true" ]]; then
  status="fail"
  reason="missing_alerts_webhook:$alerts_channel_id"
fi

# Load prior state for dedupe
last_status=""
last_alert_at=0
if [[ -f "$STATE_FILE" ]]; then
  last_status=$(jq -r '.lastStatus // ""' "$STATE_FILE" 2>/dev/null || echo "")
  last_alert_at=$(jq -r '.lastAlertAt // 0' "$STATE_FILE" 2>/dev/null || echo 0)
fi

now=$(now_epoch)
should_alert="false"
if [[ "$status" != "ok" ]]; then
  # alert on first failure, or on state change, or after suppression window
  if [[ "$last_status" != "$status" ]]; then
    should_alert="true"
  elif (( now - last_alert_at >= suppress_seconds )); then
    should_alert="true"
  fi
fi

if [[ "$should_alert" == "true" ]]; then
  text=$(
    cat <<EOF
P1 Routing Healthcheck FAILED ($(now_iso_utc))
- agent: ${AGENT_ID}
- workspace: ${WORKSPACE_ROOT}
- reason: ${reason}
- cfg: ${CFG}
- webhookMapPath: ${resolved_webhook_map_path}
- expected webhook map keys for alerts + role channels
- remediation: create/add webhooks for missing channel ids in ${resolved_webhook_map_path}
EOF
  )

  if [[ "$has_alerts_webhook" == "true" ]]; then
    # Send alert via webhook (to alerts channel only)
    node "$WEBHOOK_SEND" --channel "$alerts_channel_id" --text "$text" >/dev/null
    last_alert_at=$now
  else
    # Can't alert without an alerts-channel webhook; leave last_alert_at unchanged.
    echo "NOTE: alerts webhook missing; no alert sent" >&2
  fi
fi

# Persist state
jq -n \
  --arg lastStatus "$status" \
  --argjson lastAlertAt "$last_alert_at" \
  --arg reason "$reason" \
  --arg agentId "$AGENT_ID" \
  --arg workspace "$WORKSPACE_ROOT" \
  '{lastStatus:$lastStatus,lastAlertAt:$lastAlertAt,lastReason:$reason,agentId:$agentId,workspace:$workspace,updatedAt:(now|floor)}' \
  > "$STATE_FILE"

if [[ "$status" == "ok" ]]; then
  echo "HEARTBEAT_OK"
  exit 0
else
  fail "$reason"
  exit 2
fi
