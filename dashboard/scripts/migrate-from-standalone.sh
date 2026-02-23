#!/bin/bash
set -euo pipefail

# ─── OpenClaw Dashboard — Migration from Standalone ──────────────────────────
# Migrates from the standalone openclaw-dashboard repo to the VentureOS monorepo
# dashboard. Supports both macOS (launchd) and Linux (systemd).
#
# What it does:
#   1. Detects the old standalone service (plist/systemd)
#   2. Extracts environment config from the old service
#   3. Builds the new monorepo dashboard
#   4. Installs the new service (parallel mode by default — old on existing port, new on 8002)
#   5. Validates endpoint parity
#   6. Provides switchover and rollback commands
#
# Usage:
#   ./dashboard/scripts/migrate-from-standalone.sh                  # Full migration
#   ./dashboard/scripts/migrate-from-standalone.sh --parallel-only  # Just start parallel
#   ./dashboard/scripts/migrate-from-standalone.sh --switchover     # Complete switchover
#   ./dashboard/scripts/migrate-from-standalone.sh --dry-run        # Show what would happen
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENTUREOS_ROOT="$(cd "$DASHBOARD_DIR/.." && pwd)"

# Old standalone identifiers
OLD_LABEL="com.openclaw.dashboard"
OLD_PLIST="$HOME/Library/LaunchAgents/${OLD_LABEL}.plist"
OLD_SYSTEMD_NAMES=("agent-dashboard" "openclaw-dashboard")
OLD_STANDALONE_DIR="$HOME/clawd/openclaw-dashboard"

# New monorepo identifiers
NEW_LABEL="com.openclaw.dashboard.monorepo"
NEW_PLIST="$HOME/Library/LaunchAgents/${NEW_LABEL}.plist"
NEW_SYSTEMD="openclaw-dashboard-monorepo"

# Defaults
PARALLEL_PORT="${PARALLEL_PORT:-8002}"
DRY_RUN=false
PARALLEL_ONLY=false
SWITCHOVER=false

# ─── Parse args ──────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)      DRY_RUN=true; shift ;;
    --parallel-only) PARALLEL_ONLY=true; shift ;;
    --switchover)   SWITCHOVER=true; shift ;;
    --parallel-port) PARALLEL_PORT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--parallel-only] [--switchover] [--parallel-port PORT]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

PLATFORM="$(uname)"
BACKUP_DIR="$DASHBOARD_DIR/.migration-backup-$(date +%Y%m%d-%H%M%S)"

echo "🔄 OpenClaw Dashboard — Migration from Standalone"
echo "================================================="
echo ""
echo "Platform:    $PLATFORM"
echo "VentureOS:   $VENTUREOS_ROOT"
echo "Dry run:     $DRY_RUN"
echo ""

# ─── Helper functions ────────────────────────────────────────────────────────

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

# ─── Step 1: Detect old service ─────────────────────────────────────────────

echo "── Step 1: Detect Old Service ──"

OLD_PORT=""
OLD_OPENCLAW_DIR=""
OLD_WORKSPACE_DIR=""
FOUND_OLD=false

if [[ "$PLATFORM" == "Darwin" ]]; then
  if [[ -f "$OLD_PLIST" ]]; then
    ok "Found old plist: $OLD_PLIST"
    FOUND_OLD=true

    # Extract env vars from plist
    OLD_PORT=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:DASHBOARD_PORT" "$OLD_PLIST" 2>/dev/null || echo "")
    OLD_OPENCLAW_DIR=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:OPENCLAW_DIR" "$OLD_PLIST" 2>/dev/null || echo "")
    OLD_WORKSPACE_DIR=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:WORKSPACE_DIR" "$OLD_PLIST" 2>/dev/null || echo "")

    log "Old port:          ${OLD_PORT:-<not set>}"
    log "Old OPENCLAW_DIR:  ${OLD_OPENCLAW_DIR:-<not set>}"
    log "Old WORKSPACE_DIR: ${OLD_WORKSPACE_DIR:-<not set>}"
  else
    warn "No old plist found at $OLD_PLIST"
  fi
else
  for svc in "${OLD_SYSTEMD_NAMES[@]}"; do
    if systemctl list-unit-files "${svc}.service" 2>/dev/null | grep -q "^${svc}.service"; then
      ok "Found old systemd service: $svc"
      FOUND_OLD=true

      # Extract port from unit
      UNIT_FILE="/etc/systemd/system/${svc}.service"
      if [[ -f "$UNIT_FILE" ]]; then
        OLD_PORT=$(grep -oP 'DASHBOARD_PORT=\K\d+' "$UNIT_FILE" 2>/dev/null || echo "")
        OLD_OPENCLAW_DIR=$(grep -oP 'OPENCLAW_DIR=\K[^ ]+' "$UNIT_FILE" 2>/dev/null || echo "")
      fi
      break
    fi
  done

  if ! $FOUND_OLD; then
    warn "No old systemd service found"
  fi
fi

# Defaults for extracted config
OLD_PORT="${OLD_PORT:-7001}"
OLD_OPENCLAW_DIR="${OLD_OPENCLAW_DIR:-$HOME/.openclaw}"

echo ""

# ─── Step 2: Backup ─────────────────────────────────────────────────────────

echo "── Step 2: Backup ──"

run_or_dry mkdir -p "$BACKUP_DIR"

if [[ "$PLATFORM" == "Darwin" ]] && [[ -f "$OLD_PLIST" ]]; then
  run_or_dry cp "$OLD_PLIST" "$BACKUP_DIR/old.plist"
  ok "Backed up old plist"
fi

# Save migration metadata
if ! $DRY_RUN; then
  cat > "$BACKUP_DIR/migration-info.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platform": "$PLATFORM",
  "old_port": "$OLD_PORT",
  "old_openclaw_dir": "$OLD_OPENCLAW_DIR",
  "old_standalone_dir": "$OLD_STANDALONE_DIR",
  "new_parallel_port": "$PARALLEL_PORT",
  "ventureos_root": "$VENTUREOS_ROOT"
}
EOF
  ok "Migration metadata saved → $BACKUP_DIR/migration-info.json"
fi

echo ""

# ─── Step 3: Build new dashboard ────────────────────────────────────────────

echo "── Step 3: Build New Dashboard ──"

if ! $DRY_RUN; then
  cd "$VENTUREOS_ROOT"
  npm install --workspace=dashboard --include=dev 2>/dev/null || npm install
  cd "$DASHBOARD_DIR"
  rm -rf dist
  npx tsc -p tsconfig.json --outDir dist 2>&1

  # Mark dist/lib/ as CommonJS (see install-macos.sh for rationale)
  mkdir -p "$DASHBOARD_DIR/dist/lib"
  echo '{ "type": "commonjs" }' > "$DASHBOARD_DIR/dist/lib/package.json"

  if [[ -f "$DASHBOARD_DIR/dist/dashboard/server/server.js" ]]; then
    ok "Build complete → dashboard/dist/dashboard/server/server.js"
  else
    fail "Build failed — dist/dashboard/server/server.js not found"
  fi
else
  log "[DRY RUN] Would compile TypeScript → dashboard/dist/"
fi

echo ""

# ─── Step 4: Install new service (parallel mode) ────────────────────────────

echo "── Step 4: Install New Service (parallel on port $PARALLEL_PORT) ──"

export DASHBOARD_PORT="$PARALLEL_PORT"
export OPENCLAW_DIR="$OLD_OPENCLAW_DIR"
export SERVICE_NAME="$NEW_SYSTEMD"

if [[ "$PLATFORM" == "Darwin" ]]; then
  if ! $DRY_RUN; then
    # Unload if already loaded
    launchctl unload "$NEW_PLIST" 2>/dev/null || true

    NODE_PATH="$(command -v node)"
    LOG_DIR="$HOME/Library/Logs"

    sed \
      -e "s|__VENTUREOS_ROOT__|${VENTUREOS_ROOT}|g" \
      -e "s|__NODE_PATH__|${NODE_PATH}|g" \
      -e "s|__DASHBOARD_PORT__|${PARALLEL_PORT}|g" \
      -e "s|__OPENCLAW_DIR__|${OLD_OPENCLAW_DIR}|g" \
      -e "s|__LOG_DIR__|${LOG_DIR}|g" \
      "$DASHBOARD_DIR/examples/launchd.plist" > "$NEW_PLIST"

    launchctl load -w "$NEW_PLIST"
    ok "New service loaded on port $PARALLEL_PORT"
  else
    log "[DRY RUN] Would install plist → $NEW_PLIST (port $PARALLEL_PORT)"
  fi
else
  if ! $DRY_RUN; then
    # On Linux, install.sh writes to /etc/systemd/system and uses systemctl,
    # which typically requires root. Use sudo when not already running as root.
    if [[ "$(id -u)" -ne 0 ]]; then
      run_or_dry sudo -E bash "$SCRIPT_DIR/install.sh"
    else
      run_or_dry bash "$SCRIPT_DIR/install.sh"
    fi
  else
    log "[DRY RUN] Would run install.sh with DASHBOARD_PORT=$PARALLEL_PORT (via sudo if needed)"
  fi
fi

echo ""

# ─── Step 5: Validate endpoint parity ───────────────────────────────────────

echo "── Step 5: Validate Endpoint Parity ──"

ENDPOINTS=(
  "/api/health"
  "/api/kpis"
  "/api/sessions/active"
)

if ! $DRY_RUN; then
  sleep 3  # Let new service start

  PARITY_OK=true
  for ep in "${ENDPOINTS[@]}"; do
    OLD_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${OLD_PORT}${ep}" 2>/dev/null || echo "000")
    NEW_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PARALLEL_PORT}${ep}" 2>/dev/null || echo "000")

    if [[ "$OLD_HTTP" == "$NEW_HTTP" ]]; then
      ok "$ep — old=$OLD_HTTP new=$NEW_HTTP ✓"
    else
      warn "$ep — old=$OLD_HTTP new=$NEW_HTTP (mismatch)"
      PARITY_OK=false
    fi
  done

  echo ""
  if $PARITY_OK; then
    ok "All endpoints match! Safe to switchover."
  else
    warn "Some endpoints differ. Investigate before switching over."
    echo "   Run full parity tests: cd dashboard && npm run test:parity"
  fi
else
  log "[DRY RUN] Would compare responses on ports $OLD_PORT vs $PARALLEL_PORT"
fi

echo ""

# ─── Switchover (if requested) ──────────────────────────────────────────────

if $SWITCHOVER; then
  echo "── Step 6: Switchover ──"
  echo ""
  warn "Switchover will:"
  echo "   1. Stop the old service on port $OLD_PORT"
  echo "   2. Reconfigure the new service to port $OLD_PORT"
  echo "   3. Restart the new service"
  echo ""

  read -p "Proceed? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [[ "$PLATFORM" == "Darwin" ]]; then
      # Stop old
      launchctl unload "$OLD_PLIST" 2>/dev/null || true
      ok "Old service stopped"

      # Reconfigure new to use old port
      launchctl unload "$NEW_PLIST" 2>/dev/null || true
      sed -i '' "s|<string>${PARALLEL_PORT}</string>|<string>${OLD_PORT}</string>|" "$NEW_PLIST"
      launchctl load -w "$NEW_PLIST"
      ok "New service switched to port $OLD_PORT"
    else
      sudo systemctl stop agent-dashboard 2>/dev/null || true
      sudo sed -i "s|DASHBOARD_PORT=${PARALLEL_PORT}|DASHBOARD_PORT=${OLD_PORT}|" "/etc/systemd/system/${NEW_SYSTEMD}.service"
      sudo systemctl daemon-reload
      sudo systemctl restart "$NEW_SYSTEMD"
      ok "New service switched to port $OLD_PORT"
    fi

    sleep 2
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${OLD_PORT}/api/health" 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" ]]; then
      ok "Health check passed on port $OLD_PORT"
    else
      warn "Health check returned HTTP $HTTP_CODE"
      echo ""
      echo "⚡ IMMEDIATE ROLLBACK:"
      echo "   $SCRIPT_DIR/rollback.sh"
    fi
  else
    echo "Switchover cancelled."
  fi

  echo ""
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

if $PARALLEL_ONLY || ! $SWITCHOVER; then
  echo "══════════════════════════════════════════════"
  echo "  Migration — Parallel Deployment Active"
  echo "══════════════════════════════════════════════"
  echo ""
  echo "  Old dashboard:  http://localhost:${OLD_PORT}"
  echo "  New dashboard:  http://localhost:${PARALLEL_PORT}"
  echo ""
  echo "  Next steps:"
  echo "  1. Run parity tests: cd dashboard && npm run test:parity"
  echo "  2. Monitor both for 24-48h"
  echo "  3. Switchover: $0 --switchover"
  echo ""
  echo "  Rollback (any time):"
  echo "    $SCRIPT_DIR/rollback.sh"
  echo ""
  echo "  Backup: $BACKUP_DIR"
fi
