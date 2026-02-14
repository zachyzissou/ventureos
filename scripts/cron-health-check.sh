#!/usr/bin/env bash
# cron-health-check.sh — Checks actual cron job run results for failures
# Returns HEARTBEAT_OK if all healthy, or a P1 alert with details
#
# Checks:
# 1. Any enabled job with lastStatus != "ok"
# 2. Any enabled job that hasn't run in 2x its expected interval
# 3. Any job disabled in the last hour (possible rogue disable)

set -euo pipefail

OPENCLAW="${OPENCLAW_BIN:-openclaw}"
STATE_DIR="/Users/zachgonser/clawd/runtime/cron-health"
mkdir -p "$STATE_DIR"

# Track previously-disabled jobs so we can detect rogue disables
DISABLED_SNAPSHOT="$STATE_DIR/disabled-jobs.json"

# Get all jobs (including disabled)
ALL_JOBS=$(curl -s --max-time 10 \
  "http://127.0.0.1:18789/api/cron/jobs?includeDisabled=true" \
  -H "Authorization: Bearer $(cat /Users/zachgonser/.openclaw/gateway-token 2>/dev/null || echo '')" \
  2>/dev/null) || {
  echo "P1: cron-health-check — cannot reach gateway API"
  exit 0
}

ALERTS=""
NOW_MS=$(date +%s)000

# Check 1: Enabled jobs with lastStatus != "ok"
FAILED_JOBS=$(echo "$ALL_JOBS" | jq -r '
  .[] | select(.enabled == true and .state.lastStatus != null and .state.lastStatus != "ok") |
  "  - \(.name): lastStatus=\(.state.lastStatus) (last run: \(.state.lastRunAtMs // "never"))"
' 2>/dev/null || echo "")

if [ -n "$FAILED_JOBS" ]; then
  ALERTS="${ALERTS}**Failed jobs (lastStatus != ok):**\n${FAILED_JOBS}\n\n"
fi

# Check 2: Enabled jobs that are overdue (haven't run in 2x their interval)
OVERDUE_JOBS=$(echo "$ALL_JOBS" | jq -r --arg now "$NOW_MS" '
  .[] | select(.enabled == true and .schedule.everyMs != null and .state.lastRunAtMs != null) |
  select((.state.lastRunAtMs + (.schedule.everyMs * 2)) < ($now | tonumber)) |
  "  - \(.name): last ran \((($now | tonumber) - .state.lastRunAtMs) / 3600000 | floor)h ago (interval: \(.schedule.everyMs / 3600000)h)"
' 2>/dev/null || echo "")

if [ -n "$OVERDUE_JOBS" ]; then
  ALERTS="${ALERTS}**Overdue jobs (>2x interval since last run):**\n${OVERDUE_JOBS}\n\n"
fi

# Check 3: Detect rogue disables — jobs that were enabled last check but are now disabled
NEWLY_DISABLED=""
if [ -f "$DISABLED_SNAPSHOT" ]; then
  PREV_DISABLED=$(cat "$DISABLED_SNAPSHOT")
  NEWLY_DISABLED=$(echo "$ALL_JOBS" | jq -r --argjson prev "$PREV_DISABLED" '
    [.[] | select(.enabled == false) | .id] as $now_disabled |
    ($prev | map(.id)) as $prev_disabled |
    $now_disabled[] | select(. as $id | $prev_disabled | index($id) | not)
  ' 2>/dev/null || echo "")

  if [ -n "$NEWLY_DISABLED" ]; then
    # Get names for the newly disabled job IDs
    DISABLED_NAMES=$(echo "$ALL_JOBS" | jq -r --argjson prev "$PREV_DISABLED" '
      ($prev | map(.id)) as $prev_disabled |
      .[] | select(.enabled == false) |
      select(.id as $id | $prev_disabled | index($id) | not) |
      "  - \(.name) (id: \(.id))"
    ' 2>/dev/null || echo "")
    ALERTS="${ALERTS}**⚠️ Jobs disabled since last check (possible rogue disable):**\n${DISABLED_NAMES}\n\n"
  fi
fi

# Save current disabled snapshot for next run
echo "$ALL_JOBS" | jq '[.[] | select(.enabled == false) | {id, name}]' > "$DISABLED_SNAPSHOT" 2>/dev/null || true

# Output
if [ -n "$ALERTS" ]; then
  echo -e "P1: Cron Health Check\n\n${ALERTS}Run \`cron runs\` on flagged jobs for details."
else
  echo "HEARTBEAT_OK"
fi
