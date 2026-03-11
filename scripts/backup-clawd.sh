#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$HOME/backups/clawd"
DATE=$(date +%Y-%m-%d)
ARCHIVE="$BACKUP_DIR/clawd-$DATE.tar.gz"
LOG_DIR="$HOME/clawd/runtime/logs/backups"
LOG_FILE="$LOG_DIR/$DATE.log"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

/usr/bin/tar -czf "$ARCHIVE" \
  "$HOME/.openclaw/openclaw.json" \
  "$HOME/.openclaw/cron/jobs.json" \
  "$HOME/clawd/memory" \
  "$HOME/clawd/state.json" \
  2>>"$LOG_FILE"

/usr/bin/shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"

# Retain last 30 days
find "$BACKUP_DIR" -name 'clawd-*.tar.gz' -mtime +30 -delete
find "$BACKUP_DIR" -name 'clawd-*.tar.gz.sha256' -mtime +30 -delete

echo "[$(date)] Backup complete: $ARCHIVE" >> "$LOG_FILE"
