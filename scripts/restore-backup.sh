#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/agent-env.sh
source "$SCRIPT_DIR/lib/agent-env.sh"

TMPDIR="$(agent_env_tmp_dir)"
export TMPDIR

BACKUP_DIR="$HOME/backups/clawd"
ARCHIVE=""
CONFIRM=false

usage() {
  cat <<'USAGE'
Usage: restore-backup.sh [--archive PATH] [--confirm]

Restores OpenClaw backup contents from a tar.gz created by backup-clawd.sh.
- Default is DRY RUN (no changes).
- Use --confirm to apply restore.

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

# Dry-run by default
if [[ "$CONFIRM" != "true" ]]; then
  echo "DRY_RUN_ONLY (no changes). Re-run with --confirm to apply."
  rsync -av --dry-run "$SRC/.openclaw/openclaw.json" "$HOME/.openclaw/openclaw.json"
  rsync -av --dry-run "$SRC/.openclaw/cron/jobs.json" "$HOME/.openclaw/cron/jobs.json"
  rsync -av --dry-run "$SRC/clawd/memory/" "$HOME/clawd/memory/"
  rsync -av --dry-run "$SRC/clawd/state.json" "$HOME/clawd/state.json"
  exit 0
fi

mkdir -p "$HOME/.openclaw/cron" "$HOME/clawd"

rsync -av "$SRC/.openclaw/openclaw.json" "$HOME/.openclaw/openclaw.json"
rsync -av "$SRC/.openclaw/cron/jobs.json" "$HOME/.openclaw/cron/jobs.json"
rsync -av "$SRC/clawd/memory/" "$HOME/clawd/memory/"
rsync -av "$SRC/clawd/state.json" "$HOME/clawd/state.json"

echo "RESTORE_OK: $ARCHIVE"
