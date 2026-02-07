#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$HOME/backups/clawd"
LATEST=$(ls -t "$BACKUP_DIR"/clawd-*.tar.gz 2>/dev/null | head -n 1)

if [[ -z "$LATEST" ]]; then
  echo "NO_BACKUP_FOUND"; exit 1
fi

/usr/bin/shasum -a 256 -c "$LATEST.sha256"
/usr/bin/tar -tzf "$LATEST" >/dev/null

echo "BACKUP_OK: $LATEST"
