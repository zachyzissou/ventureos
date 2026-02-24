#!/usr/bin/env bash
# Install session management cron jobs with guarded execution.
# All jobs are wrapped with cron-runner.sh (timeout + retry per config/reliability.json).
#
# Run this manually: bash ~/clawd/ventureos/scripts/install-cron.sh
#
# Options:
#   --force     Replace existing VentureOS cron entries
#   --dry-run   Print crontab entries without installing
#   --list      Show current cron jobs and exit
#
# See: config/reliability.json for timeout/retry settings per job.
# See: docs/CRON_SPECS.md for schedule rationale.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/openclaw-local-defaults.sh"
RUNNER="$SCRIPT_DIR/cron-runner.sh"
LOG_BASE="$HOME/.openclaw/logs"

CRON_MARKER="VentureOS Managed Cron"
FORCE=false
DRY_RUN=false
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)   FORCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --list)    LIST_ONLY=true; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ "$LIST_ONLY" == "true" ]]; then
  echo "Current crontab:"
  crontab -l 2>/dev/null || echo "(empty)"
  exit 0
fi

LOCAL_READY_DASHBOARD_URL="$(openclaw_local_resolve_dashboard_url "" "${OPENCLAW_LOCAL_READY_DASHBOARD_URL:-}" "${DASHBOARD_URL:-}" "${DASHBOARD_PORT:-7000}")"
if ! openclaw_local_validate_dashboard_url "$LOCAL_READY_DASHBOARD_URL"; then
  echo "Invalid local readiness dashboard URL: $LOCAL_READY_DASHBOARD_URL" >&2
  exit 1
fi

# Check for existing installation
if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
  if [[ "$FORCE" != "true" ]]; then
    echo "Cron jobs already installed. Use --force to replace."
    echo "Current crontab:"
    crontab -l
    exit 0
  fi
  echo "Removing existing VentureOS cron entries..."
  # Strip existing VentureOS block
  EXISTING=$(crontab -l 2>/dev/null | sed "/# === $CRON_MARKER/,/# === END $CRON_MARKER/d")
else
  EXISTING=$(crontab -l 2>/dev/null || true)
fi

mkdir -p "$LOG_BASE"

# Build new cron entries — all wrapped with cron-runner.sh
NEW_CRON=$(cat <<EOF

# === $CRON_MARKER (GitHub #26) ===
# All jobs use cron-runner.sh for guarded execution (timeout + retry).
# Config: config/reliability.json | Docs: docs/CRON_SPECS.md

# 1) Nightly Backup — daily at 2 AM CST (8 AM UTC)
0 8 * * * $RUNNER nightly-backup >> $LOG_BASE/cron-backup.log 2>&1

# 2) Weekly Backup Verify — Sunday at 2:30 AM CST (8:30 AM UTC)
30 8 * * 0 $RUNNER weekly-backup-verify >> $LOG_BASE/cron-backup-verify.log 2>&1

# 3) Monitoring (Crash/Auth/Timeout) — every 15 minutes
*/15 * * * * $RUNNER monitoring >> $LOG_BASE/cron-monitor.log 2>&1

# 4) Budget Check — daily at 9 AM CST (3 PM UTC)
0 15 * * * $RUNNER budget-check >> $LOG_BASE/cron-budget.log 2>&1

# 5) Export Cron Logs — every 30 minutes
*/30 * * * * $RUNNER export-cron-logs >> $LOG_BASE/cron-export-logs.log 2>&1

# 6) Archive Task Run Logs — 1st of month at 3 AM CST (9 AM UTC)
0 9 1 * * $RUNNER archive-task-runs >> $LOG_BASE/cron-archive.log 2>&1

# 7) Workspace Health Check — daily at 3 AM CST (9 AM UTC)
0 9 * * * $RUNNER workspace-health --alert --quarantine >> $LOG_BASE/cron-workspace-health.log 2>&1

# 8) Phantom Session Detector — every 30 minutes
*/30 * * * * $RUNNER phantom-detector --alert >> $LOG_BASE/cron-phantom-detect.log 2>&1

# 9) Session Rotation — daily at 2 AM CST (8 AM UTC)
0 8 * * * $RUNNER session-rotation --alert >> $LOG_BASE/cron-session-rotation.log 2>&1

# 10) Session Monitoring — every 6 hours
0 */6 * * * $RUNNER session-monitor --alert --quiet >> $LOG_BASE/cron-session-monitor.log 2>&1

# 11) Routing Healthcheck — every 30 minutes
*/30 * * * * $RUNNER routing-healthcheck >> $LOG_BASE/cron-routing-healthcheck.log 2>&1

# 12) Local OpenClaw readiness refresh — every 4 hours
15 */4 * * * OPENCLAW_LOCAL_READY_DASHBOARD_URL=$LOCAL_READY_DASHBOARD_URL $RUNNER openclaw-local-ready >> $LOG_BASE/cron-openclaw-local-ready.log 2>&1

# 13) VB-003 telemetry synthesis — every 6 hours
30 */6 * * * $RUNNER vb003-telemetry-synthesis >> $LOG_BASE/cron-vb003-telemetry.log 2>&1

# 14) VB-003 watchdog — every 3 hours
45 */3 * * * $RUNNER vb003-watchdog >> $LOG_BASE/cron-vb003-watchdog.log 2>&1

# === END $CRON_MARKER ===
EOF
)

if [[ "$DRY_RUN" == "true" ]]; then
  echo "=== DRY RUN — Would install: ==="
  echo "$NEW_CRON"
  exit 0
fi

# Install
{
  echo "$EXISTING"
  echo "$NEW_CRON"
} | crontab -

echo "✅ Cron jobs installed with guarded execution. Verify with: crontab -l"
echo ""
echo "Configuration: $REPO_ROOT/config/reliability.json"
echo "Runner: $RUNNER"
echo "Logs: $LOG_BASE/cron-*.log"
echo "Local readiness dashboard URL: $LOCAL_READY_DASHBOARD_URL"
