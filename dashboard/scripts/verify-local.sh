#!/bin/bash
set -euo pipefail

# ─── OpenClaw Dashboard — Local Deployment Verifier ──────────────────────────
# Usage: ./dashboard/scripts/verify-local.sh
#        DASHBOARD_PORT=7000 ./dashboard/scripts/verify-local.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENTUREOS_ROOT="$(cd "$DASHBOARD_DIR/.." && pwd)"

PORT="${DASHBOARD_PORT:-8002}"
CANONICAL_TOKEN="${VENTUREOS_ROOT}/dashboard/data/.api-token"
STALE_TOKEN="${VENTUREOS_ROOT}/dashboard/dist/dashboard/data/.api-token"
DIST_LIB_PKG="${VENTUREOS_ROOT}/dashboard/dist/lib/package.json"
DIST_SERVER="${VENTUREOS_ROOT}/dashboard/dist/dashboard/server/server.js"
SRC_SERVER="${VENTUREOS_ROOT}/dashboard/server/server.ts"

E=0; W=0
ok()   { echo "  ✅ $*"; }
warn() { echo "  ⚠️  $*"; W=$((W+1)); }
fail() { echo "  ❌ $*"; E=$((E+1)); }

echo "🔍 Dashboard — Local Deployment Verifier"
echo "========================================="
echo ""

echo "── 1. Service ──"
if [[ "$(uname)" == "Darwin" ]]; then
  for L in com.openclaw.dashboard com.openclaw.dashboard.monorepo; do
    if launchctl list "$L" &>/dev/null 2>&1; then
      P=$(launchctl list "$L" 2>/dev/null | grep '"PID"' | grep -o '[0-9]*' || echo "")
      [[ -n "$P" && "$P" != "0" ]] && ok "$L running (PID $P)" || warn "$L loaded but not running"
    fi
  done
fi
echo ""

echo "── 2. Token Path ──"
[[ -f "$CANONICAL_TOKEN" ]] && ok "Canonical: $CANONICAL_TOKEN" || fail "Canonical token MISSING"
[[ -f "$STALE_TOKEN" ]] && fail "DRIFT: stale dist token at $STALE_TOKEN" || ok "No stale dist token"
echo ""

echo "── 3. HTTP (port $PORT) ──"
HC=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/config" 2>/dev/null || echo "000")
[[ "$HC" == "200" || "$HC" == "401" ]] && ok "API reachable (HTTP $HC)" || fail "API unreachable (HTTP $HC)"
echo ""

echo "── 4. Build ──"
[[ -f "$DIST_SERVER" ]] && ok "dist/server.js" || fail "dist/server.js MISSING"
[[ -f "$DIST_LIB_PKG" ]] && ok "dist/lib/package.json (CJS)" || fail "dist/lib/package.json MISSING"
DIST_LOGIN="${VENTUREOS_ROOT}/dashboard/dist/dashboard/client/login.html"
DIST_INDEX="${VENTUREOS_ROOT}/dashboard/dist/dashboard/client/index.html"
[[ -f "$DIST_LOGIN" ]] && ok "dist/client/login.html" || fail "dist/client/login.html MISSING — run: npm run compile"
[[ -f "$DIST_INDEX" ]] && ok "dist/client/index.html" || fail "dist/client/index.html MISSING — run: npm run compile"
if [[ -f "$DIST_SERVER" && -f "$SRC_SERVER" ]]; then
  DM=$(stat -f "%m" "$DIST_SERVER" 2>/dev/null || stat -c "%Y" "$DIST_SERVER")
  SM=$(stat -f "%m" "$SRC_SERVER" 2>/dev/null || stat -c "%Y" "$SRC_SERVER")
  [[ "$SM" -gt "$DM" ]] && warn "Source newer than dist" || ok "Dist up-to-date"
fi
echo ""

echo "══════════════════════════════════"
[[ $E -eq 0 && $W -eq 0 ]] && echo "  ✅ All checks passed" || { [[ $E -eq 0 ]] && echo "  ⚠️  $W warning(s)" || echo "  ❌ $E error(s), $W warning(s)"; }
echo "══════════════════════════════════"
echo "Token:   $CANONICAL_TOKEN"
echo "Restart: launchctl kickstart -k gui/\$(id -u)/com.openclaw.dashboard"
echo "Rebuild: cd dashboard && npm run compile"
exit $E
