#!/usr/bin/env bash
# Install session management cron jobs.
# Run this manually: bash ~/clawd/ventureos/scripts/install-cron.sh

set -euo pipefail

CRON_MARKER="VentureOS Session Management"

# Check if already installed
if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
  echo "Cron jobs already installed. Current crontab:"
  crontab -l
  exit 0
fi

# Get existing crontab
EXISTING=$(crontab -l 2>/dev/null || true)

# Append our jobs
{
  echo "$EXISTING"
  echo ""
  echo "# === $CRON_MARKER (GitHub #34) ==="
  echo "# Session rotation — daily at 2 AM CST (8 AM UTC)"
  echo "0 8 * * * /Users/zachgonser/clawd/ventureos/scripts/rotate-agent-sessions.sh --alert >> /Users/zachgonser/.openclaw/logs/session-rotation-cron.log 2>&1"
  echo ""
  echo "# Session monitoring — every 6 hours"
  echo "0 */6 * * * /Users/zachgonser/clawd/ventureos/scripts/check-session-counts.sh --alert --quiet >> /Users/zachgonser/.openclaw/logs/session-monitor-cron.log 2>&1"
} | crontab -

echo "✅ Cron jobs installed. Verify with: crontab -l"
