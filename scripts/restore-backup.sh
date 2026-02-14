#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$HOME/backups/clawd"
ARCHIVE=""
CONFIRM=false

usage() {
  cat <<'USAGE'
Usage: restore-backup.sh [--archive PATH] [--confirm]

Restores OpenClaw backup contents from a tar.gz created by backup-clawd.sh.
- Default is DRY RUN (no changes).
- Use --confirm to apply restore.

Notes:
- SQLite DBs are stored as consistent snapshots under:
  clawd/runtime/tmp/sqlite-snapshots/<DATE>/{memory.sqlite,ventureos-rpg.db}

Options:
  --archive PATH   Use a specific backup archive (default: latest)
  --confirm        Apply restore (otherwise dry-run)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      ARCHIVE="$2"; shift 2 ;;
    --confirm)
      CONFIRM=true; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE=$(find "$BACKUP_DIR" -maxdepth 1 -name 'clawd-*.tar.gz' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -n 1 || true)
fi

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "NO_BACKUP_FOUND"; exit 1
fi

if [[ ! -f "$ARCHIVE.sha256" ]]; then
  echo "CHECKSUM_MISSING: $ARCHIVE.sha256"; exit 1
fi

/usr/bin/shasum -a 256 -c "$ARCHIVE.sha256"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

/usr/bin/tar -xzf "$ARCHIVE" -C "$STAGE"

# Locate extracted home directory
if [[ -d "$STAGE$HOME" ]]; then
  SRC="$STAGE$HOME"
elif [[ -d "$STAGE/Users/$(whoami)" ]]; then
  SRC="$STAGE/Users/$(whoami)"
else
  echo "STAGING_PATH_NOT_FOUND"; exit 1
fi

echo "Staged backup at: $SRC"

# Locate SQLite snapshot directory in the archive
SNAP_BASE=$(ls -d "$SRC/clawd/runtime/tmp/sqlite-snapshots/"* 2>/dev/null | sort | tail -n 1 || true)
MEM_SNAP="${SNAP_BASE:-}/memory.sqlite"
RPG_SNAP="${SNAP_BASE:-}/ventureos-rpg.db"

# Dry-run by default
if [[ "$CONFIRM" != "true" ]]; then
  echo "DRY_RUN_ONLY (no changes). Re-run with --confirm to apply."
  rsync -av --dry-run "$SRC/.openclaw/openclaw.json" "$HOME/.openclaw/openclaw.json"
  rsync -av --dry-run "$SRC/.openclaw/cron/jobs.json" "$HOME/.openclaw/cron/jobs.json"
  rsync -av --dry-run "$SRC/clawd/memory/" "$HOME/clawd/memory/"
  rsync -av --dry-run "$SRC/clawd/state.json" "$HOME/clawd/state.json"

  if [[ -f "$MEM_SNAP" ]]; then
    rsync -av --dry-run "$MEM_SNAP" "$HOME/clawd/memory/memory.sqlite"
  else
    echo "WARN: memory.sqlite snapshot not found in archive" >&2
  fi

  if [[ -f "$RPG_SNAP" ]]; then
    rsync -av --dry-run "$RPG_SNAP" "$HOME/clawd/agents/ventureos-rpg.db"
  else
    echo "WARN: ventureos-rpg.db snapshot not found in archive" >&2
  fi

  exit 0
fi

mkdir -p "$HOME/.openclaw/cron" "$HOME/clawd" "$HOME/clawd/agents" "$HOME/clawd/memory"

rsync -av "$SRC/.openclaw/openclaw.json" "$HOME/.openclaw/openclaw.json"
rsync -av "$SRC/.openclaw/cron/jobs.json" "$HOME/.openclaw/cron/jobs.json"
rsync -av "$SRC/clawd/memory/" "$HOME/clawd/memory/"
rsync -av "$SRC/clawd/state.json" "$HOME/clawd/state.json"

# Restore SQLite DB snapshots (overwrite production DBs)
if [[ -f "$MEM_SNAP" ]]; then
  cp -f "$MEM_SNAP" "$HOME/clawd/memory/memory.sqlite"
  rm -f "$HOME/clawd/memory/memory.sqlite-wal" "$HOME/clawd/memory/memory.sqlite-shm" || true
fi
if [[ -f "$RPG_SNAP" ]]; then
  cp -f "$RPG_SNAP" "$HOME/clawd/agents/ventureos-rpg.db"
  rm -f "$HOME/clawd/agents/ventureos-rpg.db-wal" "$HOME/clawd/agents/ventureos-rpg.db-shm" || true
fi

echo "RESTORE_OK: $ARCHIVE"
