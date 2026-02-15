#!/usr/bin/env bash
set -uo pipefail
# record-mission.sh — Record mission lifecycle events to the RPG database
#
# Usage:
#   record-mission.sh start   <session_key> <label> [estimated_duration_sec]
#   record-mission.sh complete <session_key> [result_summary]
#   record-mission.sh error   <session_key> [error_message]
#   record-mission.sh status  <session_key>
#
# Maps Phase 5 semantics to existing missions table schema:
#   start   → status='in_progress'
#   complete → status='completed', success=1
#   error   → status='failed', success=0
#
# Idempotent: safe to call multiple times.

DB_PATH="${DB_PATH:-$HOME/clawd/agents/ventureos-rpg.db}"
LOG_PREFIX="[record-mission]"

log() { echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') $*"; }
err() { echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') ERROR: $*" >&2; }

# Ensure missions table has the columns we need (safe migration)
migrate_db() {
  # Add session_key column if missing
  sqlite3 "$DB_PATH" "SELECT session_key FROM missions LIMIT 0;" 2>/dev/null || \
    sqlite3 "$DB_PATH" "ALTER TABLE missions ADD COLUMN session_key TEXT;" 2>/dev/null

  # Add task_label column if missing
  sqlite3 "$DB_PATH" "SELECT task_label FROM missions LIMIT 0;" 2>/dev/null || \
    sqlite3 "$DB_PATH" "ALTER TABLE missions ADD COLUMN task_label TEXT;" 2>/dev/null

  # Add result_summary column if missing
  sqlite3 "$DB_PATH" "SELECT result_summary FROM missions LIMIT 0;" 2>/dev/null || \
    sqlite3 "$DB_PATH" "ALTER TABLE missions ADD COLUMN result_summary TEXT;" 2>/dev/null

  # Add error_message column if missing
  sqlite3 "$DB_PATH" "SELECT error_message FROM missions LIMIT 0;" 2>/dev/null || \
    sqlite3 "$DB_PATH" "ALTER TABLE missions ADD COLUMN error_message TEXT;" 2>/dev/null

  # Add estimated_duration column if missing
  sqlite3 "$DB_PATH" "SELECT estimated_duration FROM missions LIMIT 0;" 2>/dev/null || \
    sqlite3 "$DB_PATH" "ALTER TABLE missions ADD COLUMN estimated_duration INTEGER;" 2>/dev/null

  # Create index on session_key for quick lookups
  sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_missions_session_key ON missions(session_key);" 2>/dev/null
}

# Parse agent_id from session key: agent:<agentId>:<type>:<rest>
parse_agent_id() {
  local key="$1"
  echo "$key" | awk -F: '{print $2}'
}

# Generate a deterministic mission ID from session key
generate_mission_id() {
  local session_key="$1"
  echo "mission:${session_key}"
}

cmd_start() {
  local session_key="${1:?session_key required}"
  local label="${2:-}"
  local estimated_duration="${3:-}"

  local agent_id
  agent_id=$(parse_agent_id "$session_key")
  local mission_id
  mission_id=$(generate_mission_id "$session_key")
  local now
  now=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  # Infer mission_type from key
  local mission_type="subagent"
  if echo "$session_key" | grep -q ":cron:"; then
    mission_type="cron"
  elif echo "$session_key" | grep -q ":discord:"; then
    mission_type="conversation"
  fi

  sqlite3 "$DB_PATH" "
    INSERT INTO missions (id, agent_id, session_key, task_label, mission_type, description, status, started_at, estimated_duration, success)
    VALUES ('${mission_id}', '${agent_id}', '${session_key}', '$(echo "$label" | sed "s/'/''/g")', '${mission_type}', '$(echo "$label" | sed "s/'/''/g")', 'in_progress', '${now}', ${estimated_duration:-NULL}, NULL)
    ON CONFLICT(id) DO UPDATE SET
      status = 'in_progress',
      started_at = COALESCE(missions.started_at, '${now}'),
      task_label = COALESCE(excluded.task_label, missions.task_label),
      description = COALESCE(excluded.description, missions.description),
      estimated_duration = COALESCE(excluded.estimated_duration, missions.estimated_duration);
  "

  if [ $? -eq 0 ]; then
    log "Mission started: agent=$agent_id key=$session_key label='$label'"
    echo "$mission_id"
  else
    err "Failed to start mission for $session_key"
    return 1
  fi
}

cmd_complete() {
  local session_key="${1:?session_key required}"
  local result_summary="${2:-}"

  local mission_id
  mission_id=$(generate_mission_id "$session_key")
  local now
  now=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  # Calculate duration
  sqlite3 "$DB_PATH" "
    UPDATE missions SET
      status = 'completed',
      completed_at = '${now}',
      success = 1,
      result_summary = '$(echo "$result_summary" | sed "s/'/''/g")',
      duration_seconds = CAST(
        (julianday('${now}') - julianday(started_at)) * 86400 AS INTEGER
      )
    WHERE id = '${mission_id}';
  "

  if [ $? -eq 0 ]; then
    log "Mission completed: key=$session_key result='${result_summary:0:80}'"
  else
    err "Failed to complete mission for $session_key"
    return 1
  fi
}

cmd_error() {
  local session_key="${1:?session_key required}"
  local error_message="${2:-unknown error}"

  local mission_id
  mission_id=$(generate_mission_id "$session_key")
  local now
  now=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  sqlite3 "$DB_PATH" "
    UPDATE missions SET
      status = 'failed',
      completed_at = '${now}',
      success = 0,
      error_message = '$(echo "$error_message" | sed "s/'/''/g")',
      duration_seconds = CAST(
        (julianday('${now}') - julianday(started_at)) * 86400 AS INTEGER
      )
    WHERE id = '${mission_id}';
  "

  if [ $? -eq 0 ]; then
    log "Mission failed: key=$session_key error='${error_message:0:80}'"
  else
    err "Failed to record error for $session_key"
    return 1
  fi
}

cmd_status() {
  local session_key="${1:?session_key required}"
  local mission_id
  mission_id=$(generate_mission_id "$session_key")

  sqlite3 -header -column "$DB_PATH" "
    SELECT id, agent_id, status, task_label, started_at, completed_at, duration_seconds, success
    FROM missions WHERE id = '${mission_id}';
  "
}

# --- Main ---
ACTION="${1:-}"
shift 2>/dev/null || true

if [ -z "$ACTION" ]; then
  echo "Usage: $0 start|complete|error|status <session_key> [args...]"
  exit 1
fi

# Run migration on every call (idempotent, fast)
migrate_db

case "$ACTION" in
  start)    cmd_start "$@" ;;
  complete) cmd_complete "$@" ;;
  error)    cmd_error "$@" ;;
  status)   cmd_status "$@" ;;
  *)
    err "Unknown action: $ACTION"
    echo "Usage: $0 start|complete|error|status <session_key> [args...]"
    exit 1
    ;;
esac
