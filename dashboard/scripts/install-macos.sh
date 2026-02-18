#!/bin/bash
set -euo pipefail

# ─── OpenClaw Dashboard — macOS Installer ────────────────────────────────────
# Installs the VentureOS monorepo dashboard as a launchd service.
# Compiles TypeScript before first launch; subsequent restarts use compiled JS.
#
# Usage:
#   ./dashboard/scripts/install-macos.sh
#   DASHBOARD_PORT=8002 ./dashboard/scripts/install-macos.sh   # custom port
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENTUREOS_ROOT="$(cd "$DASHBOARD_DIR/.." && pwd)"

# NOTE: Uses com.openclaw.dashboard.monorepo to distinguish from the standalone
# com.openclaw.dashboard during parallel migration. After migration completes,
# the .monorepo suffix allows both services to coexist safely.
LABEL="com.openclaw.dashboard.monorepo"
PLIST_DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"
PLIST_TEMPLATE="$DASHBOARD_DIR/examples/launchd.plist"

DASHBOARD_PORT="${DASHBOARD_PORT:-7000}"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
LOG_DIR="${LOG_DIR:-$HOME/Library/Logs}"
NODE_PATH="${NODE_PATH_OVERRIDE:-$(command -v node)}"

echo "🚀 OpenClaw Dashboard — macOS Installer"
echo "========================================"
echo ""

# ─── Preflight ────────────────────────────────────────────────────────────────

if [[ "$(uname)" != "Darwin" ]]; then
  echo "❌ This installer is for macOS only. Use install.sh for Linux."
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install via: brew install node"
  exit 1
fi

NODE_MAJOR=$(node --version | cut -dv -f2 | cut -d. -f1)
if (( NODE_MAJOR < 18 )); then
  echo "❌ Node.js v18+ required (found v${NODE_MAJOR})"
  exit 1
fi
echo "✅ Node.js $(node --version)"

if [[ ! -f "$DASHBOARD_DIR/package.json" ]]; then
  echo "❌ Cannot find dashboard/package.json at $DASHBOARD_DIR"
  exit 1
fi

# ─── Build ────────────────────────────────────────────────────────────────────

echo ""
echo "📦 Installing dependencies & compiling TypeScript…"

cd "$VENTUREOS_ROOT"
npm install --workspace=dashboard --include=dev 2>/dev/null || npm install

# Validate native modules match this platform (fixes ELF-on-Darwin regression)
if [[ -x "$VENTUREOS_ROOT/scripts/ensure-native-modules.sh" ]]; then
  "$VENTUREOS_ROOT/scripts/ensure-native-modules.sh"
fi

cd "$DASHBOARD_DIR"
npx tsc -p tsconfig.json --outDir dist 2>&1 || {
  echo "⚠️  TypeScript compilation had warnings (non-fatal, continuing)"
}

# Mark dist/lib/ as CommonJS — lib/*.ts sources live under the root package
# ("type": "commonjs") but dist/lib/ lands under dashboard/ ("type": "module").
# Without this marker, Node treats the compiled CJS as ESM and crashes.
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
echo "✅ Log directory ready → dashboard/logs"

# ─── Unload existing service (if any) ────────────────────────────────────────

if launchctl list "$LABEL" &>/dev/null; then
  echo ""
  echo "♻️  Unloading existing service…"
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# ─── Generate plist ──────────────────────────────────────────────────────────

echo ""
echo "📝 Generating launchd plist…"

mkdir -p "$(dirname "$PLIST_DEST")"
mkdir -p "$LOG_DIR"

sed \
  -e "s|__VENTUREOS_ROOT__|${VENTUREOS_ROOT}|g" \
  -e "s|__NODE_PATH__|${NODE_PATH}|g" \
  -e "s|__DASHBOARD_PORT__|${DASHBOARD_PORT}|g" \
  -e "s|__OPENCLAW_DIR__|${OPENCLAW_DIR}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "$PLIST_TEMPLATE" > "$PLIST_DEST"

echo "✅ Plist written → $PLIST_DEST"

# ─── Load service ────────────────────────────────────────────────────────────

echo ""
echo "🔄 Loading service…"
launchctl load -w "$PLIST_DEST"

sleep 2

# ─── Verify ──────────────────────────────────────────────────────────────────

echo ""
if launchctl list "$LABEL" &>/dev/null; then
  echo "✅ Service loaded: $LABEL"
else
  echo "⚠️  Service may not have started. Check:"
  echo "   launchctl list | grep openclaw"
  echo "   cat $LOG_DIR/openclaw-dashboard.err.log"
fi

# Quick health check
sleep 1
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${DASHBOARD_PORT}/api/health" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✅ Health check passed (HTTP $HTTP_CODE)"
else
  echo "⚠️  Health check returned HTTP $HTTP_CODE — service may still be starting"
  echo "   Logs: tail -f $LOG_DIR/openclaw-dashboard.log"
fi

echo ""
echo "📋 Summary"
echo "──────────"
echo "Label:    $LABEL"
echo "Port:     $DASHBOARD_PORT"
echo "Plist:    $PLIST_DEST"
echo "Logs:     $LOG_DIR/openclaw-dashboard.{log,err.log}"
echo ""
echo "Commands:"
echo "  launchctl unload $PLIST_DEST   # Stop"
echo "  launchctl load -w $PLIST_DEST  # Start"
echo "  tail -f $LOG_DIR/openclaw-dashboard.log"
echo ""
echo "🎉 Installation complete!"
