#!/usr/bin/env bash
# detect-phantom-sessions.sh — Lightweight cron wrapper for phantom detection
#
# Designed to run every 30 minutes via openclaw cron.
# Calls phantom-detector.sh with --json, parses results,
# and alerts to #nexus-mission-control if phantoms found.
#
# Also calls check-workspace-health.sh to combine both checks.
#
# Usage:
#   detect-phantom-sessions.sh [--alert] [--json]
#
# Cron: every 30 minutes

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PHANTOM_SCRIPT="${SCRIPTS_DIR}/phantom-detector.sh"
HEALTH_SCRIPT="${SCRIPTS_DIR}/check-workspace-health.sh"
LOG_DIR="${HOME}/clawd/ventureos/runtime/logs"
METRICS_FILE="${LOG_DIR}/phantom-metrics.jsonl"

ALERT=false
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --alert) ALERT=true; shift ;;
    --json) JSON_OUTPUT=true; shift ;;
    -h|--help) echo "Usage: detect-phantom-sessions.sh [--alert] [--json]"; exit 0 ;;
    *) shift ;;
  esac
done

mkdir -p "${LOG_DIR}"
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Source HTTP timeout defaults (docs/TIMEOUT_POLICY.md)
# shellcheck source=scripts/lib/http-defaults.sh
[[ -f "${SCRIPTS_DIR}/lib/http-defaults.sh" ]] && source "${SCRIPTS_DIR}/lib/http-defaults.sh"

# ============================================================================
# 1. Run phantom detector
# ============================================================================

phantom_json=""
phantom_count=0
phantom_exit=0

if [[ -x "${PHANTOM_SCRIPT}" ]]; then
  phantom_json=$(bash "${PHANTOM_SCRIPT}" --json 2>/dev/null) || phantom_exit=$?
  phantom_count=$(echo "${phantom_json}" | jq -r '.phantomCount // 0' 2>/dev/null || echo 0)
fi

# ============================================================================
# 2. Run workspace health check
# ============================================================================

health_json=""
health_unhealthy=0
health_exit=0

if [[ -x "${HEALTH_SCRIPT}" ]]; then
  health_json=$(bash "${HEALTH_SCRIPT}" --json 2>/dev/null) || health_exit=$?
  health_unhealthy=$(echo "${health_json}" | jq -r '.unhealthyCount // 0' 2>/dev/null || echo 0)
fi

# ============================================================================
# 3. Track metrics
# ============================================================================

echo "{\"ts\":\"${NOW_ISO}\",\"phantomCount\":${phantom_count},\"unhealthyWorkspaces\":${health_unhealthy}}" >> "${METRICS_FILE}"

# ============================================================================
# 4. Output
# ============================================================================

if [[ "${JSON_OUTPUT}" == "true" ]]; then
  echo "{\"ts\":\"${NOW_ISO}\",\"phantomCount\":${phantom_count},\"unhealthyWorkspaces\":${health_unhealthy},\"phantoms\":${phantom_json:-null},\"health\":${health_json:-null}}"
else
  echo "=== Phantom & Health Check @ $(date '+%Y-%m-%d %H:%M %Z') ==="
  echo ""

  if [[ ${phantom_count} -gt 0 ]]; then
    echo "🚨 ${phantom_count} phantom session(s) detected"
    echo "${phantom_json}" | jq -r '.phantoms[]? | "  └─ \(.agent)/\(.sessionKey | split(":") | .[-1] | .[0:8]) (\(.reason)) — \(.age) old"' 2>/dev/null || true
  else
    echo "✅ No phantom sessions"
  fi

  echo ""

  if [[ ${health_unhealthy} -gt 0 ]]; then
    echo "🚨 ${health_unhealthy} unhealthy workspace(s)"
    echo "${health_json}" | jq -r '.agents[]? | select(.status != "healthy" and .status != "not_found") | "  └─ \(.agent): \(.totalHuman) [\(.status)]"' 2>/dev/null || true
  else
    echo "✅ All workspaces healthy"
  fi
fi

# ============================================================================
# 5. Alert if issues found
# ============================================================================

if [[ "${ALERT}" == "true" ]] && [[ ${phantom_count} -gt 0 || ${health_unhealthy} -gt 0 ]]; then
  alert_msg="🔍 **System Health Check** ($(date '+%H:%M %Z'))\n\n"

  if [[ ${phantom_count} -gt 0 ]]; then
    alert_msg+="🚨 **${phantom_count} phantom session(s)**\n"
    while IFS= read -r line; do
      alert_msg+="${line}\n"
    done < <(echo "${phantom_json}" | jq -r '.phantoms[]? | "• `\(.sessionKey | split(":") | .[-1] | .[0:8])` (\(.agent)) — \(.reason)"' 2>/dev/null || true)
    alert_msg+="\n"
  fi

  if [[ ${health_unhealthy} -gt 0 ]]; then
    alert_msg+="🚨 **${health_unhealthy} unhealthy workspace(s)**\n"
    while IFS= read -r line; do
      alert_msg+="${line}\n"
    done < <(echo "${health_json}" | jq -r '.agents[]? | select(.status != "healthy" and .status != "not_found") | "• **\(.agent)**: \(.totalHuman)"' 2>/dev/null || true)
  fi

  # Use openclaw message or webhook
  WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
  if [[ -n "${WEBHOOK_URL}" ]]; then
    # shellcheck disable=SC2086
    curl -sS ${CURL_WEBHOOK_FLAGS:-"--connect-timeout 2 --max-time 10"} \
      -H "Content-Type: application/json" \
      -d "{\"content\":\"${alert_msg}\"}" \
      "${WEBHOOK_URL}" >/dev/null 2>&1 || true
  fi
fi

# ============================================================================
# Exit
# ============================================================================

if [[ ${phantom_count} -gt 0 ]] || [[ ${health_unhealthy} -gt 0 ]]; then
  exit 1
else
  exit 0
fi
