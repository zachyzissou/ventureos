#!/bin/bash
set -euo pipefail

# ─── OpenClaw Dashboard — Linux Installer (systemd) ──────────────────────────
# Installs the VentureOS monorepo dashboard as a systemd service.
# Compiles TypeScript before first launch.
#
# Usage:
#   sudo ./dashboard/scripts/install.sh
#   sudo DASHBOARD_PORT=8002 ./dashboard/scripts/install.sh   # custom port
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENTUREOS_ROOT="$(cd "$DASHBOARD_DIR/.." && pwd)"

SERVICE_NAME="${SERVICE_NAME:-openclaw-dashboard}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SERVICE_TEMPLATE="$DASHBOARD_DIR/examples/systemd.service"

# Config — override via env
DASHBOARD_PORT="${DASHBOARD_PORT:-7000}"
RUN_USER="${SUDO_USER:-$USER}"
RUN_GROUP="$(id -gn "$RUN_USER")"

# Determine OPENCLAW_DIR default:
# - If OPENCLAW_DIR is explicitly provided, use it as-is.
# - If running as root via sudo, derive the target user's home from RUN_USER
#   (otherwise $HOME is /root, which is wrong).
# - Otherwise, fall back to the current user's $HOME.
if [[ -n "${OPENCLAW_DIR:-}" ]]; then
  : # use provided OPENCLAW_DIR
else
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    TARGET_HOME="$(getent passwd "$RUN_USER" 2>/dev/null | cut -d: -f6)"
    if [[ -z "$TARGET_HOME" ]]; then
      echo "❌ Could not determine home directory for user '$RUN_USER'."
      echo "   Please set OPENCLAW_DIR explicitly when running this installer."
      exit 1
    fi
    OPENCLAW_DIR="${TARGET_HOME}/.openclaw"
  else
    OPENCLAW_DIR="${HOME}/.openclaw"
  fi
fi

NODE_PATH="${NODE_PATH_OVERRIDE:-$(command -v node)}"

echo "🚀 OpenClaw Dashboard — Linux Installer"
echo "========================================"
echo ""

# ─── Preflight ────────────────────────────────────────────────────────────────

if [[ "$(uname)" == "Darwin" ]]; then
  echo "❌ This installer is for Linux. Use install-macos.sh for macOS."
  exit 1
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "❌ This installer must be run as root (sudo)."
  echo "   Usage: sudo ./dashboard/scripts/install.sh"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install via:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
  echo "   sudo apt-get install -y nodejs"
  exit 1
fi

NODE_MAJOR=$(node --version | cut -dv -f2 | cut -d. -f1)
if (( NODE_MAJOR < 18 )); then
  echo "❌ Node.js v18+ required (found v${NODE_MAJOR})"
  exit 1
fi
echo "✅ Node.js $(node --version)"

if ! command -v systemctl &>/dev/null; then
  echo "❌ systemd not found. This installer requires systemd."
  exit 1
fi

if [[ ! -f "$DASHBOARD_DIR/package.json" ]]; then
  echo "❌ Cannot find dashboard/package.json at $DASHBOARD_DIR"
  exit 1
fi

# ─── Build ────────────────────────────────────────────────────────────────────

echo ""
echo "📦 Installing dependencies & compiling TypeScript…"

cd "$VENTUREOS_ROOT"
npm install --workspace=dashboard --include=dev 2>/dev/null || npm install

cd "$DASHBOARD_DIR"
npx tsc -p tsconfig.json --outDir dist 2>&1 || {
  echo "⚠️  TypeScript compilation had warnings (non-fatal, continuing)"
}

# Mark dist/lib/ as CommonJS — see install-macos.sh for rationale.
mkdir -p "$DASHBOARD_DIR/dist/lib"
echo '{ "type": "commonjs" }' > "$DASHBOARD_DIR/dist/lib/package.json"

# Mark dist/scripts/ as CommonJS (mirrors compile script behavior).
mkdir -p "$DASHBOARD_DIR/dist/scripts"
echo '{ "type": "commonjs" }' > "$DASHBOARD_DIR/dist/scripts/package.json"

# Copy static client assets (HTML, CSS, JS) into dist so the compiled
# server can resolve them via import.meta.dirname (see Issue #178).
mkdir -p "$DASHBOARD_DIR/dist/dashboard/client"
cp -R "$DASHBOARD_DIR/client/"* "$DASHBOARD_DIR/dist/dashboard/client/"

if [[ ! -f "$DASHBOARD_DIR/dist/dashboard/server/server.js" ]]; then
  echo "❌ Build failed — dist/dashboard/server/server.js not found"
  exit 1
fi
echo "✅ Build complete → dashboard/dist/dashboard/server/server.js"

# ─── Ensure log directory exists ──────────────────────────────────────────────

mkdir -p "$DASHBOARD_DIR/logs"
chown "$RUN_USER:$RUN_GROUP" "$DASHBOARD_DIR/logs"
echo "✅ Log directory ready → dashboard/logs (owner: $RUN_USER)"

# ─── Stop existing service (if running) ──────────────────────────────────────

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  echo ""
  echo "♻️  Stopping existing service…"
  systemctl stop "$SERVICE_NAME"
fi

# ─── Generate unit file ──────────────────────────────────────────────────────

echo ""
echo "📝 Generating systemd unit…"

sed \
  -e "s|__VENTUREOS_ROOT__|${VENTUREOS_ROOT}|g" \
  -e "s|__NODE_PATH__|${NODE_PATH}|g" \
  -e "s|__DASHBOARD_PORT__|${DASHBOARD_PORT}|g" \
  -e "s|__OPENCLAW_DIR__|${OPENCLAW_DIR}|g" \
  -e "s|__USER__|${RUN_USER}|g" \
  -e "s|__GROUP__|${RUN_GROUP}|g" \
  "$SERVICE_TEMPLATE" > "$SERVICE_FILE"

echo "✅ Unit file written → $SERVICE_FILE"

# ─── Enable & start ──────────────────────────────────────────────────────────

echo ""
echo "🔄 Reloading systemd & starting service…"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

sleep 2

# ─── Verify ──────────────────────────────────────────────────────────────────

echo ""
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "✅ Service is running"
else
  echo "⚠️  Service may not have started. Check:"
  echo "   journalctl -u $SERVICE_NAME -n 30"
  exit 1
fi

# Quick health check
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${DASHBOARD_PORT}/api/health" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✅ Health check passed (HTTP $HTTP_CODE)"
else
  echo "⚠️  Health check returned HTTP $HTTP_CODE — service may still be starting"
  echo "   Logs: journalctl -u $SERVICE_NAME -f"
fi

echo ""
echo "📋 Summary"
echo "──────────"
echo "Service:  $SERVICE_NAME"
echo "Port:     $DASHBOARD_PORT"
echo "Unit:     $SERVICE_FILE"
echo "User:     $RUN_USER"
echo ""
echo "Commands:"
echo "  sudo systemctl status $SERVICE_NAME    # Status"
echo "  sudo systemctl restart $SERVICE_NAME   # Restart"
echo "  sudo systemctl stop $SERVICE_NAME      # Stop"
echo "  journalctl -u $SERVICE_NAME -f         # Logs"
echo ""
echo "🎉 Installation complete!"
