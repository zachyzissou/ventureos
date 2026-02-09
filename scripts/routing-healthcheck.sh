#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/zachgonser/clawd"
REPO="$ROOT/projects/ventureos"
CFG="$REPO/config/alert-routing.json"
STATE_DIR="$ROOT/runtime/monitor"
STATE_FILE="$STATE_DIR/routing-healthcheck.json"

# Existing sender (posts with webhook identity)
WEBHOOK_SEND="$ROOT/scripts/discord-webhook-send.mjs"

now_epoch() { date +%s; }
now_iso_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

fail() {
  echo "P1: $1"
}

mkdir -p "$STATE_DIR"

if [[ ! -f "$CFG" ]]; then
  fail "missing_config:$CFG"
  exit 1
fi

alerts_channel_id=$(jq -r '.alertsChannelId' "$CFG")
webhook_map_path=$(jq -r '.webhookMapPath' "$CFG")
suppress_seconds=$(jq -r '.suppressSeconds' "$CFG")

if [[ -z "$alerts_channel_id" || "$alerts_channel_id" == "null" ]]; then
  fail "invalid_config:alertsChannelId"
  exit 1
fi

if [[ ! -f "$webhook_map_path" ]]; then
  fail "missing_webhook_map:$webhook_map_path"
  exit 1
fi

# Required role channel ids (alerts channel is where we notify; a webhook for alerts is preferred but not required)
role_ids=$(jq -r '.roleChannels | to_entries | map(.value) | unique | .[]' "$CFG")

missing_roles=()
for cid in $role_ids; do
  # webhook map is expected to be an object keyed by channelId
  # (we treat presence of any value at that key as "configured")
  present=$(jq -r --arg cid "$cid" 'has($cid)' "$webhook_map_path")
  if [[ "$present" != "true" ]]; then
    missing_roles+=("$cid")
  fi
done

has_alerts_webhook=$(jq -r --arg cid "$alerts_channel_id" 'has($cid)' "$webhook_map_path")

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
- reason: ${reason}
- cfg: ${CFG}
- expected webhook map keys for alerts + role channels
- remediation: create/add webhooks for missing channel ids in ${webhook_map_path}
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
  '{lastStatus:$lastStatus,lastAlertAt:$lastAlertAt,lastReason:$reason,updatedAt:(now|floor)}' \
  > "$STATE_FILE"

if [[ "$status" == "ok" ]]; then
  echo "HEARTBEAT_OK"
  exit 0
else
  fail "$reason"
  exit 2
fi
