#!/usr/bin/env bash
set -euo pipefail

# Daily backup for VentureOS RPG SQLite DB
# Usage:
#   ./backup-rpg-db.sh [db_path] [backup_dir]
# Defaults:
#   db_path    = ~/clawd/agents/ventureos-rpg.db
#   backup_dir = ~/clawd/backups
#
# Output:
#   ~/clawd/backups/rpg-YYYY-MM-DD.db
# Retention:
#   Keep last 7 days (delete backups older than 7 days)

umask 022

DB_PATH="${1:-$HOME/clawd/agents/ventureos-rpg.db}"
BACKUP_DIR="${2:-$HOME/clawd/backups}"
DATE="$(date +%F)" # YYYY-MM-DD
DEST="$BACKUP_DIR/rpg-$DATE.db"
TMP="$DEST.tmp.$$"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 not found in PATH" >&2
  exit 127
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: DB not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 755 "$BACKUP_DIR" || true

# Use SQLite online backup API for a consistent snapshot
sqlite3 "$DB_PATH" ".backup '$TMP'"

mv -f "$TMP" "$DEST"
chmod 644 "$DEST" || true

echo "✅ RPG DB backup written: $DEST"

# Retention: delete backups older than 7 days
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'rpg-*.db' -mtime +6 -print -delete || true
