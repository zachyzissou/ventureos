#!/bin/bash
set -euo pipefail

# ─── Tactical Map — Local Deploy ─────────────────────────────────────────────
# Builds and deploys the tactical map locally. The dashboard serves dist/ at /map/.
#
# Usage:
#   ./tactical-map/scripts/deploy-local.sh
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TACTICAL_MAP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$TACTICAL_MAP_DIR/dist"
BACKUP_DIR="$TACTICAL_MAP_DIR/.dist-backups"

echo "🚀 Tactical Map — Local Deploy"
echo "==============================="
echo ""

# Backup current dist
if [[ -d "$DIST_DIR" ]]; then
  mkdir -p "$BACKUP_DIR"
  BACKUP_NAME="dist-$(date +%Y%m%d-%H%M%S)"
  cp -R "$DIST_DIR" "$BACKUP_DIR/$BACKUP_NAME"
  echo "  📦 Backed up current dist → $BACKUP_NAME"

  # Keep only last 5 backups
  ls -t "$BACKUP_DIR" | tail -n +6 | while read -r OLD; do
    rm -rf "${BACKUP_DIR:?}/$OLD"
  done
fi

# Build
cd "$TACTICAL_MAP_DIR"
echo "  🔨 Building..."
npm run build 2>&1 | tail -5

# Verify
if [[ -f "$DIST_DIR/index.html" ]]; then
  SIZE=$(du -sh "$DIST_DIR" | cut -f1)
  FILES=$(find "$DIST_DIR" -type f | wc -l | tr -d ' ')
  echo "  ✅ Build complete (${SIZE}, ${FILES} files)"
else
  echo "  ❌ Build failed — dist/index.html not found"
  exit 1
fi

echo ""
echo "The dashboard auto-serves from tactical-map/dist/ at /map/"
echo "If the dashboard is running, changes are live immediately."
echo ""
echo "Rollback: ./tactical-map/scripts/rollback.sh"
