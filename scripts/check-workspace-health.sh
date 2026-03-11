#!/usr/bin/env bash
# check-workspace-health.sh — Workspace health monitoring for all agents
#
# Checks all agent workspaces for:
# - Total size (flag >500MB)
# - Single large files (flag >50MB)
# - SQLite/DB files >10MB (auto-quarantine if --quarantine)
# - Reports JSON health status per agent
#
# Usage:
#   check-workspace-health.sh [--json] [--alert] [--quarantine] [--threshold-total <MB>] [--threshold-file <MB>]
#
# Exit codes:
#   0 = All healthy
#   1 = At least one workspace unhealthy
#   2 = Error
#
# Designed to run daily at 3 AM CST via cron.

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

WORKSPACE_BASE="${HOME}/.openclaw"
AGENTS=(atlas oracle synth sentinel verifier archivist nexus echo main)
THRESHOLD_TOTAL_MB=500
THRESHOLD_FILE_MB=50
QUARANTINE_THRESHOLD_MB=10
DB_EXTENSIONS="sqlite|sqlite3|db|sqlite-wal|sqlite-shm|sqlite-journal"

JSON_OUTPUT=false
ALERT=false
QUARANTINE=false
WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
ALERT_CHANNEL="${WORKSPACE_ALERT_CHANNEL:-1470210601879076914}"  # nexus-mission-control

LOG_DIR="${HOME}/clawd/ventureos/runtime/logs"
LOG_FILE="${LOG_DIR}/workspace-health.jsonl"
QUARANTINE_LOG="${LOG_DIR}/workspace-quarantine.jsonl"

# Source HTTP timeout defaults (docs/TIMEOUT_POLICY.md)
SCRIPT_DIR_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/http-defaults.sh
[[ -f "$SCRIPT_DIR_SELF/lib/http-defaults.sh" ]] && source "$SCRIPT_DIR_SELF/lib/http-defaults.sh"

# ============================================================================
# Parse args
# ============================================================================

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON_OUTPUT=true; shift ;;
    --alert) ALERT=true; shift ;;
    --quarantine) QUARANTINE=true; shift ;;
    --threshold-total) THRESHOLD_TOTAL_MB="$2"; shift 2 ;;
    --threshold-file) THRESHOLD_FILE_MB="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ============================================================================
# Setup
# ============================================================================

mkdir -p "${LOG_DIR}"

THRESHOLD_TOTAL_BYTES=$((THRESHOLD_TOTAL_MB * 1024 * 1024))
THRESHOLD_FILE_BYTES=$((THRESHOLD_FILE_MB * 1024 * 1024))
QUARANTINE_BYTES=$((QUARANTINE_THRESHOLD_MB * 1024 * 1024))

NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
UNHEALTHY_COUNT=0
RESULTS=()

# ============================================================================
# Helper: get size in bytes (macOS + Linux compatible)
# ============================================================================

get_size_bytes() {
  local path="$1"
  if [[ "$(uname)" == "Darwin" ]]; then
    stat -f%z "$path" 2>/dev/null || echo 0
  else
    stat -c%s "$path" 2>/dev/null || echo 0
  fi
}

get_dir_size_bytes() {
  local path="$1"
  # du -sk gives kilobytes
  local kb
  kb=$(du -sk "$path" 2>/dev/null | awk '{print $1}')
  echo $((kb * 1024))
}

bytes_to_human() {
  local bytes=$1
  if [[ $bytes -ge $((1024 * 1024 * 1024)) ]]; then
    echo "$(echo "scale=1; $bytes / 1073741824" | bc)GB"
  elif [[ $bytes -ge $((1024 * 1024)) ]]; then
    echo "$(echo "scale=1; $bytes / 1048576" | bc)MB"
  elif [[ $bytes -ge 1024 ]]; then
    echo "$(echo "scale=1; $bytes / 1024" | bc)KB"
  else
    echo "${bytes}B"
  fi
}

# ============================================================================
# Check each workspace
# ============================================================================

for agent in "${AGENTS[@]}"; do
  workspace="${WORKSPACE_BASE}/workspace-${agent}"

  if [[ ! -d "${workspace}" ]]; then
    RESULTS+=("{\"agent\":\"${agent}\",\"status\":\"not_found\",\"exists\":false}")
    continue
  fi

  # Total workspace size
  total_bytes=$(get_dir_size_bytes "${workspace}")
  total_human=$(bytes_to_human "${total_bytes}")

  # Find largest files (top 5) — use find -size to avoid scanning every file
  largest_files=()
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    file_kb=$(echo "$line" | awk '{print $1}')
    file_path=$(echo "$line" | awk '{$1=""; print substr($0,2)}')
    file_bytes=$((file_kb * 1024))
    file_human=$(bytes_to_human "${file_bytes}")
    # Make path relative to workspace
    rel_path="${file_path#${workspace}/}"
    largest_files+=("{\"path\":\"${rel_path}\",\"bytes\":${file_bytes},\"human\":\"${file_human}\"}")
  done < <(find "${workspace}" -type f -size +1M -exec du -k {} + 2>/dev/null | sort -rn | head -5)

  # Find largest directories (top 3)
  largest_dirs=()
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    dir_kb=$(echo "$line" | awk '{print $1}')
    dir_path=$(echo "$line" | awk '{$1=""; print substr($0,2)}')
    dir_bytes=$((dir_kb * 1024))
    dir_human=$(bytes_to_human "${dir_bytes}")
    rel_path="${dir_path#${workspace}/}"
    [[ "${rel_path}" == "${workspace}" ]] && rel_path="."
    largest_dirs+=("{\"path\":\"${rel_path}\",\"bytes\":${dir_bytes},\"human\":\"${dir_human}\"}")
  done < <(du -sk "${workspace}"/*/ 2>/dev/null | sort -rn | head -3)

  # Find DB/SQLite files
  db_files=()
  while IFS= read -r db_file; do
    [[ -z "$db_file" ]] && continue
    db_bytes=$(get_size_bytes "$db_file")
    db_human=$(bytes_to_human "$db_bytes")
    rel_path="${db_file#${workspace}/}"
    db_files+=("{\"path\":\"${rel_path}\",\"bytes\":${db_bytes},\"human\":\"${db_human}\"}")
  done < <(find "${workspace}" -type f \( -name "*.sqlite" -o -name "*.sqlite3" -o -name "*.db" -o -name "*.sqlite-wal" -o -name "*.sqlite-shm" -o -name "*.sqlite-journal" \) 2>/dev/null)

  # Determine health status
  status="healthy"
  issues=()

  if [[ ${total_bytes} -gt ${THRESHOLD_TOTAL_BYTES} ]]; then
    status="unhealthy"
    issues+=("\"total_size_exceeds_${THRESHOLD_TOTAL_MB}MB\"")
    UNHEALTHY_COUNT=$((UNHEALTHY_COUNT + 1))
  fi

  # Check for oversized single files (only scan files > threshold)
  oversized_files=()
  threshold_file_kb=$((THRESHOLD_FILE_MB * 1024))
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    file_kb=$(echo "$line" | awk '{print $1}')
    file_path=$(echo "$line" | awk '{$1=""; print substr($0,2)}')
    file_bytes=$((file_kb * 1024))
    rel_path="${file_path#${workspace}/}"
    file_human=$(bytes_to_human "${file_bytes}")
    oversized_files+=("${rel_path} (${file_human})")
    if [[ "${status}" == "healthy" ]]; then
      status="warning"
    fi
    issues+=("\"file_exceeds_${THRESHOLD_FILE_MB}MB:${rel_path}\"")
  done < <(find "${workspace}" -type f -size +${threshold_file_kb}k -exec du -k {} + 2>/dev/null | sort -rn)

  # Auto-quarantine DB files >10MB
  quarantined=()
  if [[ "${QUARANTINE}" == "true" ]]; then
    for db_entry in "${db_files[@]:-}"; do
      [[ -z "${db_entry}" ]] && continue
      db_bytes=$(echo "${db_entry}" | jq -r '.bytes' 2>/dev/null || echo 0)
      db_path=$(echo "${db_entry}" | jq -r '.path' 2>/dev/null || echo "")
      if [[ ${db_bytes} -gt ${QUARANTINE_BYTES} ]] && [[ -n "${db_path}" ]]; then
        full_path="${workspace}/${db_path}"
        quarantine_dir="${workspace}/QUARANTINE"
        if [[ -f "${full_path}" ]]; then
          mkdir -p "${quarantine_dir}"
          mv "${full_path}" "${quarantine_dir}/"
          quarantined+=("${db_path}")
          echo "{\"ts\":\"${NOW_ISO}\",\"event\":\"quarantined\",\"agent\":\"${agent}\",\"file\":\"${db_path}\",\"bytes\":${db_bytes}}" >> "${QUARANTINE_LOG}"
          if [[ "${JSON_OUTPUT}" != "true" ]]; then
            echo "🔒 QUARANTINED: ${agent}/${db_path} ($(bytes_to_human ${db_bytes}))"
          fi
        fi
      fi
    done
  fi

  # Build JSON for this agent
  largest_files_json=$(IFS=,; echo "[${largest_files[*]:-}]")
  largest_dirs_json=$(IFS=,; echo "[${largest_dirs[*]:-}]")
  db_files_json=$(IFS=,; echo "[${db_files[*]:-}]")
  issues_json=$(IFS=,; echo "[${issues[*]:-}]")

  agent_result="{\"agent\":\"${agent}\",\"status\":\"${status}\",\"exists\":true,\"totalBytes\":${total_bytes},\"totalHuman\":\"${total_human}\",\"thresholdMB\":${THRESHOLD_TOTAL_MB},\"largestFiles\":${largest_files_json},\"largestDirs\":${largest_dirs_json},\"dbFiles\":${db_files_json},\"issues\":${issues_json}}"
  RESULTS+=("${agent_result}")

  # Human-readable output
  if [[ "${JSON_OUTPUT}" != "true" ]]; then
    icon="✅"
    [[ "${status}" == "warning" ]] && icon="⚠️"
    [[ "${status}" == "unhealthy" ]] && icon="🚨"

    echo "${icon} ${agent}: ${total_human} [${status}]"
    if [[ ${#oversized_files[@]} -gt 0 ]]; then
      for f in "${oversized_files[@]}"; do
        echo "   └─ LARGE: ${f}"
      done
    fi
    if [[ ${#db_files[@]} -gt 0 ]]; then
      for db in "${db_files[@]}"; do
        db_path=$(echo "${db}" | jq -r '.path' 2>/dev/null || echo "?")
        db_human=$(echo "${db}" | jq -r '.human' 2>/dev/null || echo "?")
        echo "   └─ DB: ${db_path} (${db_human})"
      done
    fi
  fi
done

# ============================================================================
# JSON output
# ============================================================================

if [[ "${JSON_OUTPUT}" == "true" ]]; then
  results_json=$(IFS=,; echo "[${RESULTS[*]}]")
  echo "{\"checkedAt\":\"${NOW_ISO}\",\"unhealthyCount\":${UNHEALTHY_COUNT},\"thresholds\":{\"totalMB\":${THRESHOLD_TOTAL_MB},\"fileMB\":${THRESHOLD_FILE_MB},\"quarantineMB\":${QUARANTINE_THRESHOLD_MB}},\"agents\":${results_json}}"
fi

# ============================================================================
# Log
# ============================================================================

results_json_log=$(IFS=,; echo "[${RESULTS[*]}]")
echo "{\"ts\":\"${NOW_ISO}\",\"event\":\"health_check\",\"unhealthyCount\":${UNHEALTHY_COUNT},\"agents\":${results_json_log}}" >> "${LOG_FILE}"

# ============================================================================
# Summary
# ============================================================================

if [[ "${JSON_OUTPUT}" != "true" ]]; then
  echo ""
  if [[ ${UNHEALTHY_COUNT} -eq 0 ]]; then
    echo "✅ All workspaces healthy (threshold: ${THRESHOLD_TOTAL_MB}MB total, ${THRESHOLD_FILE_MB}MB per file)"
  else
    echo "🚨 ${UNHEALTHY_COUNT} workspace(s) exceed ${THRESHOLD_TOTAL_MB}MB threshold!"
  fi
fi

# ============================================================================
# Alert
# ============================================================================

if [[ "${ALERT}" == "true" ]] && [[ ${UNHEALTHY_COUNT} -gt 0 ]]; then
  alert_msg="🚨 **Workspace Health Alert**\n\n"
  alert_msg+="**${UNHEALTHY_COUNT}** workspace(s) unhealthy at $(date '+%Y-%m-%d %H:%M %Z')\n\n"

  for result in "${RESULTS[@]}"; do
    agent_name=$(echo "${result}" | jq -r '.agent' 2>/dev/null || echo "?")
    agent_status=$(echo "${result}" | jq -r '.status' 2>/dev/null || echo "?")
    agent_size=$(echo "${result}" | jq -r '.totalHuman' 2>/dev/null || echo "?")
    if [[ "${agent_status}" == "unhealthy" ]] || [[ "${agent_status}" == "warning" ]]; then
      icon="🚨"
      [[ "${agent_status}" == "warning" ]] && icon="⚠️"
      alert_msg+="${icon} **${agent_name}**: ${agent_size}\n"

      # Include top issues
      issues_count=$(echo "${result}" | jq -r '.issues | length' 2>/dev/null || echo 0)
      if [[ ${issues_count} -gt 0 ]]; then
        while IFS= read -r issue; do
          alert_msg+="   └─ ${issue}\n"
        done < <(echo "${result}" | jq -r '.issues[]' 2>/dev/null)
      fi
    fi
  done

  alert_msg+="\nRun \`check-workspace-health.sh --quarantine\` to auto-clean DB files."

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

if [[ ${UNHEALTHY_COUNT} -gt 0 ]]; then
  exit 1
else
  exit 0
fi
