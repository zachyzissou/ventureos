#!/bin/bash
set -euo pipefail

# ─── Tactical Map — Local Rollback ───────────────────────────────────────────
# Rolls back the tactical map dist to a previous build.
#
# Usage:
#   ./tactical-map/scripts/rollback.sh                  # restore from backup
#   ./tactical-map/scripts/rollback.sh <git-sha>        # rebuild from specific commit
#   ./tactical-map/scripts/rollback.sh --list            # list available backups
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TACTICAL_MAP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENTUREOS_ROOT="$(cd "$TACTICAL_MAP_DIR/.." && pwd)"
DIST_DIR="$TACTICAL_MAP_DIR/dist"
BACKUP_DIR="$TACTICAL_MAP_DIR/.dist-backups"

ok()   { echo "  ✅ $*"; }
warn() { echo "  ⚠️  $*"; }
fail() { echo "  ❌ $*"; exit 1; }

if [[ "${1:-}" == "--list" ]]; then
  echo "Available backups:"
  if [[ -d "$BACKUP_DIR" ]]; then
    ls -lt "$BACKUP_DIR" | tail -n +2
  else
    echo "  (none)"
  fi
  exit 0
fi

echo "⏪ Tactical Map — Rollback"
echo "=========================="
echo ""

# If a SHA is provided, rebuild from that commit
if [[ -n "${1:-}" ]]; then
  SHA="$1"
  echo "Rebuilding from commit: $SHA"
  echo ""

  # Backup current dist
  if [[ -d "$DIST_DIR" ]]; then
    mkdir -p "$BACKUP_DIR"
    BACKUP_NAME="dist-$(date +%Y%m%d-%H%M%S)"
    mv "$DIST_DIR" "$BACKUP_DIR/$BACKUP_NAME"
    ok "Current dist backed up to $BACKUP_DIR/$BACKUP_NAME"
  fi

  # Stash any local changes
  cd "$VENTUREOS_ROOT"
  git stash --include-untracked -q 2>/dev/null || true
  CURRENT_BRANCH=$(git branch --show-current)

  # Checkout the target SHA
  git checkout "$SHA" -- tactical-map/ 2>/dev/null || fail "Cannot checkout $SHA"

  # Build
  cd "$TACTICAL_MAP_DIR"
  npm ci --ignore-scripts 2>/dev/null || npm install
  npm run build || fail "Build failed for $SHA"

  # Restore working tree
  cd "$VENTUREOS_ROOT"
  git checkout "$CURRENT_BRANCH" -- tactical-map/ 2>/dev/null
  git stash pop -q 2>/dev/null || true

  ok "Rolled back to $SHA"
else
  # Restore from most recent backup
  if [[ ! -d "$BACKUP_DIR" ]]; then
    fail "No backups found at $BACKUP_DIR"
  fi

  LATEST_BACKUP=$(ls -t "$BACKUP_DIR" | head -1)
  if [[ -z "$LATEST_BACKUP" ]]; then
    fail "No backups found"
  fi

  echo "Restoring from backup: $LATEST_BACKUP"

  # Backup current dist
  if [[ -d "$DIST_DIR" ]]; then
    SWAP_NAME="dist-pre-rollback-$(date +%Y%m%d-%H%M%S)"
    mv "$DIST_DIR" "$BACKUP_DIR/$SWAP_NAME"
    ok "Current dist saved as $SWAP_NAME"
  fi

  # Restore
  cp -R "$BACKUP_DIR/$LATEST_BACKUP" "$DIST_DIR"
  ok "Restored from $LATEST_BACKUP"
fi

echo ""
echo "Verify: check http://localhost:8002/map/ after dashboard restart"
echo "Restart: launchctl kickstart -k gui/\$(id -u)/com.openclaw.dashboard"
