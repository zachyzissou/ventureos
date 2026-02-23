#!/usr/bin/env bash
# cron-runner.sh — Universal cron job runner with guarded execution.
#
# Wraps any cron job script with timeout + retry from config/reliability.json.
# Logs execution metadata (start, end, duration, exit code) to JSONL.
#
# Usage:
#   cron-runner.sh <job-name> [extra-args...]
#
# Examples:
#   cron-runner.sh nightly-backup
#   cron-runner.sh workspace-health --alert --quarantine
#   cron-runner.sh phantom-detector --alert
#
# The job-name must match a key in config/reliability.json → cron_jobs.
#
# Environment:
#   VENTUREOS_ROOT    Override repo root (default: auto-detect)
#   CRON_LOG_DIR      Override log directory
#   DRY_RUN           Set to "true" to print command without executing
#
# Exit codes:
#   0   = Success
#   1   = Job failed (after retries if applicable)
#   2   = Configuration error (job not found, missing script)
#   124 = Timeout (from with-timeout.sh)

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# ============================================================================
# Setup
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${VENTUREOS_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
CONFIG_FILE="$REPO_ROOT/config/reliability.json"
GUARDED_RUN="$SCRIPT_DIR/guarded-run.sh"
WITH_TIMEOUT="$SCRIPT_DIR/with-timeout.sh"
LOG_DIR="${CRON_LOG_DIR:-$REPO_ROOT/runtime/logs/cron-runs}"
DRY_RUN="${DRY_RUN:-false}"

if [[ $# -lt 1 ]]; then
  echo "Usage: cron-runner.sh <job-name> [extra-args...]" >&2
  echo "" >&2
  echo "Available jobs:" >&2
  if [[ -f "$CONFIG_FILE" ]]; then
    python3 -c "
import json, sys
cfg = json.load(open('$CONFIG_FILE'))
for k in sorted(cfg.get('cron_jobs', {})):
    j = cfg['cron_jobs'][k]
    print(f'  {k:24s} timeout={j[\"timeout_seconds\"]}s retries={j[\"max_attempts\"]} network={j[\"has_network\"]}')
" 2>/dev/null || true
  fi
  exit 2
fi

JOB_NAME="$1"; shift
# Capture extra args safely (empty array if none)
if [[ $# -gt 0 ]]; then
  EXTRA_ARGS=("$@")
else
  EXTRA_ARGS=()
fi

mkdir -p "$LOG_DIR"

# ============================================================================
# Read config
# ============================================================================

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config not found: $CONFIG_FILE" >&2
  exit 2
fi

# Extract job config using Python (reliable JSON parsing)
JOB_CONFIG=$(python3 - "$CONFIG_FILE" "$JOB_NAME" <<'PY'
import json, sys

with open(sys.argv[1]) as f:
    cfg = json.load(f)

job_name = sys.argv[2]
jobs = cfg.get("cron_jobs", {})
defaults = cfg.get("defaults", {})

if job_name not in jobs:
    print(f"ERROR: Job '{job_name}' not found in config", file=sys.stderr)
    sys.exit(2)

job = jobs[job_name]
# Merge defaults
for key in defaults:
    if key not in job:
        job[key] = defaults[key]

print(json.dumps(job))
PY
) || exit 2

SCRIPT_PATH=$(echo "$JOB_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['script'])")
TIMEOUT=$(echo "$JOB_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['timeout_seconds'])")
MAX_ATTEMPTS=$(echo "$JOB_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['max_attempts'])")
BASE_SLEEP=$(echo "$JOB_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['base_sleep_seconds'])")
HAS_NETWORK=$(echo "$JOB_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['has_network'])")

FULL_SCRIPT="$REPO_ROOT/$SCRIPT_PATH"

if [[ ! -f "$FULL_SCRIPT" ]]; then
  echo "ERROR: Script not found: $FULL_SCRIPT" >&2
  exit 2
fi

if [[ ! -x "$FULL_SCRIPT" ]]; then
  chmod +x "$FULL_SCRIPT"
fi

# ============================================================================
# Log setup
# ============================================================================

LOG_FILE="$LOG_DIR/$JOB_NAME.jsonl"
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOW_EPOCH=$(date +%s)

log_event() {
  local event="$1"
  shift
  local extra_fields=""
  for field in "$@"; do
    extra_fields="${extra_fields},${field}"
  done
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"job\":\"$JOB_NAME\",\"event\":\"$event\"${extra_fields}}" >> "$LOG_FILE"
}

# ============================================================================
# Execute with guarded-run or with-timeout
# ============================================================================

if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  CMD=("$FULL_SCRIPT" "${EXTRA_ARGS[@]}")
else
  CMD=("$FULL_SCRIPT")
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY_RUN] Would execute:"
  if [[ "$MAX_ATTEMPTS" -gt 1 ]]; then
    echo "  guarded-run.sh $TIMEOUT $MAX_ATTEMPTS $BASE_SLEEP ${CMD[*]}"
  else
    echo "  with-timeout.sh $TIMEOUT ${CMD[*]}"
  fi
  exit 0
fi

# Ensure CMD array is set before execution
if [[ ${#CMD[@]} -eq 0 ]]; then
  echo "ERROR: No command to execute" >&2
  exit 2
fi

log_event "start" \
  "\"timeout\":$TIMEOUT" \
  "\"maxAttempts\":$MAX_ATTEMPTS" \
  "\"baseSleep\":$BASE_SLEEP" \
  "\"hasNetwork\":$HAS_NETWORK" \
  "\"script\":\"$SCRIPT_PATH\""

EXIT_CODE=0

if [[ "$MAX_ATTEMPTS" -gt 1 ]]; then
  # Use guarded-run (retry + timeout)
  "$GUARDED_RUN" "$TIMEOUT" "$MAX_ATTEMPTS" "$BASE_SLEEP" "${CMD[@]}" || EXIT_CODE=$?
else
  # Use timeout only (no retry)
  "$WITH_TIMEOUT" "$TIMEOUT" "${CMD[@]}" || EXIT_CODE=$?
fi

END_EPOCH=$(date +%s)
DURATION=$((END_EPOCH - NOW_EPOCH))

if [[ "$EXIT_CODE" -eq 0 ]]; then
  log_event "success" "\"durationSeconds\":$DURATION"
elif [[ "$EXIT_CODE" -eq 124 ]]; then
  log_event "timeout" "\"durationSeconds\":$DURATION" "\"exitCode\":$EXIT_CODE"
else
  log_event "failure" "\"durationSeconds\":$DURATION" "\"exitCode\":$EXIT_CODE"
fi

exit $EXIT_CODE
