#!/usr/bin/env bash
set -euo pipefail

# backup-clawd.sh
# Nightly backup of core OpenClaw + VentureOS state.
#
# IMPORTANT: SQLite files must be snapshotted via `.backup` (consistent) rather than tar'ing live DB files.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

BACKUP_DIR="$HOME/backups/clawd"
DATE=$(date +%Y-%m-%d)
ARCHIVE="$BACKUP_DIR/clawd-$DATE.tar.gz"
LOG_DIR="$HOME/clawd/runtime/logs/backups"
LOG_FILE="$LOG_DIR/$DATE.log"

SNAP_SCRIPT="$HOME/clawd/ventureos/scripts/backup-sqlite-consistent.sh"
SNAP_DIR="$HOME/clawd/runtime/tmp/sqlite-snapshots/$DATE"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

{
  echo "[$(date)] Starting backup..."
  echo "[$(date)] Creating SQLite snapshots in: $SNAP_DIR"
  "$SNAP_SCRIPT" "$SNAP_DIR"
  echo "[$(date)] Creating tar archive: $ARCHIVE"
} >>"$LOG_FILE" 2>&1

# Build archive with relative paths (avoid absolute paths in tar)
/usr/bin/tar -czf "$ARCHIVE" \
  --exclude="clawd/memory/memory.sqlite" \
  --exclude="clawd/memory/memory.sqlite-wal" \
  --exclude="clawd/memory/memory.sqlite-shm" \
  -C "$HOME" \
  ".openclaw/openclaw.json" \
  ".openclaw/cron/jobs.json" \
  "clawd/memory" \
  "clawd/state.json" \
  "clawd/runtime/tmp/sqlite-snapshots/$DATE" \
  >>"$LOG_FILE" 2>&1

/usr/bin/shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"

# Retain last 30 days
find "$BACKUP_DIR" -name 'clawd-*.tar.gz' -mtime +30 -delete || true
find "$BACKUP_DIR" -name 'clawd-*.tar.gz.sha256' -mtime +30 -delete || true

echo "[$(date)] Backup complete: $ARCHIVE" >> "$LOG_FILE"
