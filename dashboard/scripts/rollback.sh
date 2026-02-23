#!/bin/bash
set -euo pipefail

# ─── OpenClaw Dashboard — Rollback ───────────────────────────────────────────
# Rolls back from the VentureOS monorepo dashboard to the standalone version.
#
# Two modes:
#   Immediate rollback (< 5 min):
#     ./rollback.sh                    # Stop new, re-enable old
#
#   Full rollback (< 15 min):
#     ./rollback.sh --full             # Full restore + validation
#
# Options:
#   --full           Full rollback with validation
#   --dry-run        Show what would happen without doing it
#   --backup-dir DIR Use specific migration backup directory
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Service identifiers
OLD_LABEL="com.openclaw.dashboard"
OLD_PLIST="$HOME/Library/LaunchAgents/${OLD_LABEL}.plist"
NEW_LABEL="com.openclaw.dashboard.monorepo"
NEW_PLIST="$HOME/Library/LaunchAgents/${NEW_LABEL}.plist"
NEW_SYSTEMD="openclaw-dashboard-monorepo"

FULL=false
DRY_RUN=false
BACKUP_DIR=""

# ─── Parse args ──────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)       FULL=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--full] [--dry-run] [--backup-dir DIR]"
      echo ""
      echo "  (default)  Immediate rollback: stop new service, re-enable old (<5 min)"
      echo "  --full     Full rollback: restore config, validate endpoints (<15 min)"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

PLATFORM="$(uname)"
START_TIME=$(date +%s)

echo "⏪ OpenClaw Dashboard — Rollback"
echo "================================"
echo ""
echo "Platform: $PLATFORM"
echo "Mode:     $(if $FULL; then echo 'Full'; else echo 'Immediate'; fi)"
echo "Dry run:  $DRY_RUN"
echo ""

log()  { echo "  → $*"; }
warn() { echo "  ⚠️  $*"; }
fail() { echo "  ❌ $*"; exit 1; }
ok()   { echo "  ✅ $*"; }

run_or_dry() {
  if $DRY_RUN; then
    echo "  [DRY RUN] $*"
  else
    "$@"
  fi
}

# ─── Find backup dir if not specified ────────────────────────────────────────

if [[ -z "$BACKUP_DIR" ]]; then
  # Find most recent migration backup (newest by mtime)
  best=""
  for d in "$DASHBOARD_DIR"/.migration-backup-*/; do
    [[ -d "$d" ]] || continue
    if [[ -z "$best" ]] || [[ "$d" -nt "$best" ]]; then
      best="$d"
    fi
  done
  # Strip trailing slash for consistency
  BACKUP_DIR="${best%/}"
fi

if [[ -n "$BACKUP_DIR" ]] && [[ -d "$BACKUP_DIR" ]]; then
  ok "Found backup: $BACKUP_DIR"
  if [[ -f "$BACKUP_DIR/migration-info.json" ]]; then
    log "Migration info:"
    sed 's/^/     /' < "$BACKUP_DIR/migration-info.json"
    echo ""
  fi
else
  warn "No migration backup found — will attempt rollback without backup"
fi

# ─── Step 1: Stop new monorepo service ───────────────────────────────────────

echo "── Step 1: Stop New (Monorepo) Service ──"

if [[ "$PLATFORM" == "Darwin" ]]; then
  if launchctl list "$NEW_LABEL" &>/dev/null 2>&1; then
    run_or_dry launchctl unload "$NEW_PLIST" 2>/dev/null || true
    ok "New service stopped ($NEW_LABEL)"
  else
    log "New service not running"
  fi
else
  if systemctl is-active --quiet "$NEW_SYSTEMD" 2>/dev/null; then
    run_or_dry sudo systemctl stop "$NEW_SYSTEMD"
    run_or_dry sudo systemctl disable "$NEW_SYSTEMD"
    ok "New service stopped ($NEW_SYSTEMD)"
  else
    log "New service not running"
  fi
fi

echo ""

# ─── Step 2: Re-enable old standalone service ────────────────────────────────

echo "── Step 2: Re-enable Old (Standalone) Service ──"

if [[ "$PLATFORM" == "Darwin" ]]; then
  # Check if old plist exists (from backup or in place)
  if [[ -f "$OLD_PLIST" ]]; then
    run_or_dry launchctl load -w "$OLD_PLIST"
    ok "Old service re-enabled ($OLD_LABEL)"
  elif [[ -n "$BACKUP_DIR" ]] && [[ -f "$BACKUP_DIR/old.plist" ]]; then
    run_or_dry cp "$BACKUP_DIR/old.plist" "$OLD_PLIST"
    run_or_dry launchctl load -w "$OLD_PLIST"
    ok "Old plist restored from backup and loaded"
  else
    warn "Cannot find old plist to restore"
    echo "   If the old standalone is still installed, manually load it:"
    echo "   launchctl load -w ~/Library/LaunchAgents/com.openclaw.dashboard.plist"
  fi
else
  for svc in agent-dashboard openclaw-dashboard openclaw-dashboard-old; do
    if [[ -f "/etc/systemd/system/${svc}.service" ]]; then
      run_or_dry sudo systemctl enable --now "$svc"
      ok "Old service re-enabled ($svc)"
      break
    fi
  done
fi

echo ""

# ─── Step 3: Verify (immediate mode stops here) ─────────────────────────────

echo "── Step 3: Verify ──"

sleep 2

# Determine old port
OLD_PORT=""
if [[ -n "$BACKUP_DIR" ]] && [[ -f "$BACKUP_DIR/migration-info.json" ]]; then
  OLD_PORT=$(grep -o '"old_port": *"[^"]*"' "$BACKUP_DIR/migration-info.json" 2>/dev/null | grep -o '[0-9]*' || echo "")
fi
OLD_PORT="${OLD_PORT:-7001}"

if ! $DRY_RUN; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${OLD_PORT}/api/health" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    ok "Old dashboard responding on port $OLD_PORT (HTTP $HTTP_CODE)"
  else
    warn "Old dashboard returned HTTP $HTTP_CODE on port $OLD_PORT"
    echo "   Check: tail -f ~/Library/Logs/openclaw-dashboard.log"
  fi
fi

ELAPSED=$(( $(date +%s) - START_TIME ))
echo ""
echo "⏱️  Immediate rollback completed in ${ELAPSED}s"

# ─── Full rollback (optional) ───────────────────────────────────────────────

if $FULL; then
  echo ""
  echo "── Step 4: Full Validation (extended rollback) ──"
  echo ""

  # 4a. Remove new service files
  echo "  Cleaning up new service…"
  if [[ "$PLATFORM" == "Darwin" ]]; then
    if [[ -f "$NEW_PLIST" ]]; then
      run_or_dry trash "$NEW_PLIST" 2>/dev/null || run_or_dry rm "$NEW_PLIST"
      ok "Removed new plist"
    fi
  else
    if [[ -f "/etc/systemd/system/${NEW_SYSTEMD}.service" ]]; then
      run_or_dry sudo rm "/etc/systemd/system/${NEW_SYSTEMD}.service"
      run_or_dry sudo systemctl daemon-reload
      ok "Removed new systemd unit"
    fi
  fi

  # 4b. Validate all critical endpoints
  echo ""
  echo "  Validating critical endpoints…"
  ENDPOINTS=(
    "/api/health"
    "/api/kpis"
    "/api/sessions/active"
    "/api/system/stats"
  )

  ALL_OK=true
  for ep in "${ENDPOINTS[@]}"; do
    if ! $DRY_RUN; then
      HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${OLD_PORT}${ep}" 2>/dev/null || echo "000")
      if [[ "$HTTP" =~ ^(200|404)$ ]]; then
        ok "$ep → HTTP $HTTP"
      else
        warn "$ep → HTTP $HTTP"
        ALL_OK=false
      fi
    else
      log "[DRY RUN] Would check $ep"
    fi
  done

  # 4c. Verify old dashboard source is intact
  echo ""
  echo "  Checking standalone source…"
  if [[ -d "$HOME/clawd/openclaw-dashboard" ]]; then
    ok "Standalone repo intact at ~/clawd/openclaw-dashboard"
  else
    warn "Standalone repo not found at ~/clawd/openclaw-dashboard"
  fi

  ELAPSED=$(( $(date +%s) - START_TIME ))
  echo ""
  if $ALL_OK; then
    echo "✅ Full rollback completed in ${ELAPSED}s — all systems nominal"
  else
    echo "⚠️  Full rollback completed in ${ELAPSED}s — some endpoints need attention"
  fi
fi

echo ""
echo "════════════════════════════════════════════"
echo "  Rollback Complete"
echo "════════════════════════════════════════════"
echo ""
echo "  Old dashboard: http://localhost:${OLD_PORT}"
echo ""
echo "  To re-attempt migration later:"
echo "    $SCRIPT_DIR/migrate-from-standalone.sh"
echo ""
echo "  To permanently remove monorepo dashboard artifacts:"
echo "    rm -rf $DASHBOARD_DIR/dist"
echo "    rm -f $NEW_PLIST"
if [[ -n "$BACKUP_DIR" ]]; then
  echo "    rm -rf $BACKUP_DIR"
fi
echo ""
