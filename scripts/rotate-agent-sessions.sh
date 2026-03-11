#!/usr/bin/env bash
# rotate-agent-sessions.sh — Archive old session transcripts to prevent spawn failures.
#
# Root Cause (GitHub #34): OpenClaw session init scans the sessions directory.
# When file count exceeds ~200-500, spawn silently times out ("phantom sessions").
# Atlas had 1,813 files → 0% spawn. After cleanup to 50 → 100% spawn.
#
# Usage:
#   ./rotate-agent-sessions.sh [--dry-run] [--agent <name>] [--max-keep <n>] [--max-age-days <n>]
#   ./rotate-agent-sessions.sh --alert   # Send Discord alert if counts are high
#
# Defaults:
#   --max-keep 100      Keep at most 100 newest .jsonl files per agent
#   --max-age-days 7    Archive anything older than 7 days regardless
#
# Archive destination: ~/.openclaw/agents/{agent}/sessions-archive/YYYY-MM-DD/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${HOME}/.openclaw"

# Source HTTP timeout defaults (docs/TIMEOUT_POLICY.md)
# shellcheck source=scripts/lib/http-defaults.sh
[[ -f "$SCRIPT_DIR/lib/http-defaults.sh" ]] && source "$SCRIPT_DIR/lib/http-defaults.sh"
AGENTS_DIR="${OPENCLAW_DIR}/agents"
LOG_FILE="${OPENCLAW_DIR}/logs/session-rotation.log"

# Defaults
MAX_KEEP=100
MAX_AGE_DAYS=7
DRY_RUN=false
SPECIFIC_AGENT=""
ALERT_MODE=false
WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
ALERT_THRESHOLD_WARN=200
ALERT_THRESHOLD_CRIT=500

usage() {
  cat <<'EOF'
rotate-agent-sessions.sh — Archive old session transcripts

Options:
  --dry-run            Show what would be archived without moving files
  --agent <name>       Only rotate for a specific agent
  --max-keep <n>       Keep at most N newest .jsonl files (default: 100)
  --max-age-days <n>   Archive files older than N days (default: 7)
  --alert              Send Discord webhook alert if counts exceed thresholds
  -h, --help           Show this help

Environment:
  DISCORD_WEBHOOK_URL  Discord webhook for alerts (optional)
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)     DRY_RUN=true; shift ;;
    --agent)       SPECIFIC_AGENT="$2"; shift 2 ;;
    --max-keep)    MAX_KEEP="$2"; shift 2 ;;
    --max-age-days) MAX_AGE_DAYS="$2"; shift 2 ;;
    --alert)       ALERT_MODE=true; shift ;;
    -h|--help)     usage ;;
    *)             echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[$ts] $*" | tee -a "$LOG_FILE"
}

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

rotate_agent() {
  local agent_name="$1"
  local sessions_dir="${AGENTS_DIR}/${agent_name}/sessions"

  if [[ ! -d "$sessions_dir" ]]; then
    return 0
  fi

  # Count only .jsonl files (session transcripts)
  local all_jsonl=()
  while IFS= read -r -d '' f; do
    all_jsonl+=("$f")
  done < <(find "$sessions_dir" -maxdepth 1 -name '*.jsonl' -print0 2>/dev/null)

  local total=${#all_jsonl[@]}

  if [[ $total -eq 0 ]]; then
    return 0
  fi

  # Also count .deleted files for cleanup
  local deleted_count
  deleted_count=$(find "$sessions_dir" -maxdepth 1 -name '*.deleted.*' 2>/dev/null | wc -l | tr -d ' ')

  log "Agent=$agent_name: $total .jsonl files, $deleted_count .deleted files"

  # Alert check
  if [[ "$ALERT_MODE" == true ]]; then
    if [[ $total -gt $ALERT_THRESHOLD_CRIT ]]; then
      local msg="🚨 **CRITICAL** Agent \`$agent_name\` has $total session files (threshold: $ALERT_THRESHOLD_CRIT). Auto-rotating."
      log "$msg"
      send_discord_alert "$msg"
    elif [[ $total -gt $ALERT_THRESHOLD_WARN ]]; then
      local msg="⚠️ **WARNING** Agent \`$agent_name\` has $total session files (threshold: $ALERT_THRESHOLD_WARN)."
      log "$msg"
      send_discord_alert "$msg"
    fi
  fi

  # Archive destination
  local archive_date
  archive_date="$(date +%Y-%m-%d)"
  local archive_dir="${AGENTS_DIR}/${agent_name}/sessions-archive/${archive_date}"

  local archived=0

  # Step 1: Archive .deleted files (always — they're already soft-deleted)
  if [[ $deleted_count -gt 0 ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      log "  [DRY-RUN] Would archive $deleted_count .deleted files"
    else
      mkdir -p "$archive_dir"
      find "$sessions_dir" -maxdepth 1 -name '*.deleted.*' -exec mv {} "$archive_dir/" \; 2>/dev/null
      log "  Archived $deleted_count .deleted files → $archive_dir/"
    fi
  fi

  # Step 2: Archive .jsonl files older than MAX_AGE_DAYS
  local old_files=()
  while IFS= read -r -d '' f; do
    old_files+=("$f")
  done < <(find "$sessions_dir" -maxdepth 1 -name '*.jsonl' -mtime "+${MAX_AGE_DAYS}" -print0 2>/dev/null)

  if [[ ${#old_files[@]} -gt 0 ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      log "  [DRY-RUN] Would archive ${#old_files[@]} files older than ${MAX_AGE_DAYS} days"
    else
      mkdir -p "$archive_dir"
      for f in "${old_files[@]}"; do
        mv "$f" "$archive_dir/"
        ((archived++))
      done
      log "  Archived ${#old_files[@]} files older than ${MAX_AGE_DAYS} days"
    fi
  fi

  # Step 3: If still over MAX_KEEP, archive oldest until at MAX_KEEP
  # Re-count remaining .jsonl files
  local remaining=()
  while IFS= read -r -d '' f; do
    remaining+=("$f")
  done < <(find "$sessions_dir" -maxdepth 1 -name '*.jsonl' -print0 2>/dev/null)

  local remain_count=${#remaining[@]}

  if [[ $remain_count -gt $MAX_KEEP ]]; then
    local to_archive=$((remain_count - MAX_KEEP))

    # Sort by modification time (oldest first) and archive the oldest
    local oldest_files=()
    while IFS= read -r -d '' f; do
      oldest_files+=("$f")
    done < <(find "$sessions_dir" -maxdepth 1 -name '*.jsonl' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | tail -n "$to_archive" | tr '\n' '\0')

    # Fallback: use stat-based sort if xargs approach doesn't work
    if [[ ${#oldest_files[@]} -eq 0 ]]; then
      while IFS= read -r f; do
        oldest_files+=("$f")
      done < <(find "$sessions_dir" -maxdepth 1 -name '*.jsonl' -exec stat -f '%m %N' {} \; 2>/dev/null | sort -n | head -n "$to_archive" | awk '{print $2}')
    fi

    if [[ ${#oldest_files[@]} -gt 0 ]]; then
      if [[ "$DRY_RUN" == true ]]; then
        log "  [DRY-RUN] Would archive ${#oldest_files[@]} oldest files to stay under MAX_KEEP=$MAX_KEEP"
      else
        mkdir -p "$archive_dir"
        for f in "${oldest_files[@]}"; do
          if [[ -f "$f" ]]; then
            mv "$f" "$archive_dir/"
            ((archived++))
          fi
        done
        log "  Archived ${#oldest_files[@]} oldest files (cap at $MAX_KEEP)"
      fi
    fi
  fi

  # Step 4: Also clean sessions.json if it's huge (>5MB)
  local sessions_json="${sessions_dir}/sessions.json"
  if [[ -f "$sessions_json" ]]; then
    local size_bytes
    size_bytes=$(stat -f%z "$sessions_json" 2>/dev/null || stat -c%s "$sessions_json" 2>/dev/null || echo 0)
    if [[ $size_bytes -gt 5242880 ]]; then
      log "  sessions.json is $(( size_bytes / 1024 ))KB — backing up"
      if [[ "$DRY_RUN" != true ]]; then
        mkdir -p "$archive_dir"
        cp "$sessions_json" "$archive_dir/sessions.json.bak"
      fi
    fi
  fi

  # Final count
  local final_count
  final_count=$(find "$sessions_dir" -maxdepth 1 -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')
  log "  Final: $final_count .jsonl files remaining (archived $archived this run)"
}

# Main
log "=== Session rotation started (max_keep=$MAX_KEEP, max_age=${MAX_AGE_DAYS}d, dry_run=$DRY_RUN) ==="

if [[ -n "$SPECIFIC_AGENT" ]]; then
  rotate_agent "$SPECIFIC_AGENT"
else
  # Rotate all agents
  for agent_dir in "$AGENTS_DIR"/*/; do
    if [[ -d "$agent_dir" ]]; then
      agent_name="$(basename "$agent_dir")"
      rotate_agent "$agent_name"
    fi
  done
fi

log "=== Session rotation complete ==="
