#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VentureOS Hybrid Deployment — Health Check
# Issue #191
#
# Validates all components of the hybrid stack are operational.
# Returns exit code 0 if all critical checks pass, 1 otherwise.
#
# Usage:
#   ./scripts/hybrid-healthcheck.sh           # Full health check
#   ./scripts/hybrid-healthcheck.sh --json    # JSON output for scripting
# Notes:
#   - Prefers VentureOS Bridge API health on :18790.
#   - Falls back to OpenClaw gateway health on :18789 when available.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.hybrid"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

JSON_OUTPUT=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true ;;
  esac
done

PASS=0
FAIL=0
WARN=0
RESULTS=()

check() {
  local name="$1" status="$2" detail="${3:-}"
  if [ "$status" = "pass" ]; then
    PASS=$((PASS + 1))
    $JSON_OUTPUT || echo "  ✅ $name${detail:+ — $detail}"
  elif [ "$status" = "warn" ]; then
    WARN=$((WARN + 1))
    $JSON_OUTPUT || echo "  ⚠️  $name${detail:+ — $detail}"
  else
    FAIL=$((FAIL + 1))
    $JSON_OUTPUT || echo "  ❌ $name${detail:+ — $detail}"
  fi
  RESULTS+=("{\"name\":\"$name\",\"status\":\"$status\",\"detail\":\"${detail//\"/\\\"}\"}")
}

# Load tokens
DASHBOARD_API_TOKEN=""
BRIDGE_TOKEN=""
BRIDGE_URL=""
if [ -f "$ENV_FILE" ]; then
  DASHBOARD_API_TOKEN=$(grep '^DASHBOARD_API_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- || true)
  BRIDGE_TOKEN=$(grep '^BRIDGE_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- || true)
  BRIDGE_URL=$(grep '^BRIDGE_URL=' "$ENV_FILE" | cut -d'=' -f2- || true)
fi

if [ -n "$BRIDGE_URL" ]; then
  BRIDGE_BASE_URL="${BRIDGE_URL%/}"
else
  BRIDGE_BASE_URL="http://localhost:18790"
fi
# Healthcheck runs on host; convert Docker host alias to host-local loopback.
BRIDGE_BASE_URL="${BRIDGE_BASE_URL/host.docker.internal/localhost}"

$JSON_OUTPUT || echo ""
$JSON_OUTPUT || echo "── VentureOS Hybrid Health Check ──"
$JSON_OUTPUT || echo ""

# 1. Docker Desktop
if docker info >/dev/null 2>&1; then
  check "Docker Desktop" "pass"
else
  check "Docker Desktop" "fail" "Not running"
fi

# 2. Compose services status
if [ -f "$COMPOSE_FILE" ]; then
  DB_STATUS=$(docker inspect --format='{{.State.Health.Status}}' ventureos-db 2>/dev/null || echo "missing")
  DASH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' ventureos-dashboard 2>/dev/null || echo "missing")

  if [ "$DB_STATUS" = "healthy" ]; then
    check "Postgres container" "pass" "$DB_STATUS"
  else
    check "Postgres container" "fail" "$DB_STATUS"
  fi

  if [ "$DASH_STATUS" = "healthy" ]; then
    check "Dashboard container" "pass" "$DASH_STATUS"
  else
    check "Dashboard container" "fail" "$DASH_STATUS"
  fi
fi

# 3. Bridge API or OpenClaw gateway health (host)
BRIDGE_MODE=""
BRIDGE_ACTIVE_BASE=""
BRIDGE_DETAIL=""
BRIDGE_CANDIDATES=()
BRIDGE_CANDIDATES+=("$BRIDGE_BASE_URL")
for fallback in "http://localhost:18790" "http://localhost:18789"; do
  if [ "$fallback" != "$BRIDGE_BASE_URL" ]; then
    BRIDGE_CANDIDATES+=("$fallback")
  fi
done

for base in "${BRIDGE_CANDIDATES[@]}"; do
  health_url="${base}/health"
  response=$(curl -s -w "\n%{http_code}" "$health_url" 2>/dev/null || true)
  code=$(printf '%s\n' "$response" | tail -n1)
  body=$(printf '%s\n' "$response" | sed '$d')
  if [ "$code" != "200" ]; then
    continue
  fi
  if echo "$body" | grep -q '"ok"'; then
    BRIDGE_MODE="bridge"
    BRIDGE_ACTIVE_BASE="$base"
    BRIDGE_DETAIL="bridge mode (${base})"
    break
  fi
  if echo "$body" | grep -qi '<openclaw-app>'; then
    BRIDGE_MODE="gateway"
    BRIDGE_ACTIVE_BASE="$base"
    BRIDGE_DETAIL="gateway mode (${base})"
    break
  fi
done

if [ -n "$BRIDGE_MODE" ]; then
  check "Bridge API" "pass" "$BRIDGE_DETAIL"
else
  check "Bridge API" "fail" "Not responding on $BRIDGE_BASE_URL, :18790, or :18789"
fi

# 4. Dashboard /api/config
if [ -n "$DASHBOARD_API_TOKEN" ]; then
  DASH_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $DASHBOARD_API_TOKEN" \
    http://localhost:8001/api/config 2>/dev/null || echo "000")
  if [ "$DASH_CODE" = "200" ]; then
    check "Dashboard API" "pass" "HTTP $DASH_CODE"
  else
    check "Dashboard API" "fail" "HTTP $DASH_CODE"
  fi
else
  check "Dashboard API" "warn" "No DASHBOARD_API_TOKEN — cannot check"
fi

# 5. Bridge authenticated endpoint
if [ -n "$BRIDGE_TOKEN" ]; then
  if [ "$BRIDGE_MODE" = "bridge" ] && [ -n "$BRIDGE_ACTIVE_BASE" ]; then
    BRIDGE_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $BRIDGE_TOKEN" \
      "$BRIDGE_ACTIVE_BASE/api/bridge/config" 2>/dev/null || echo "000")
    if [ "$BRIDGE_CODE" = "200" ]; then
      check "Bridge Auth" "pass" "HTTP $BRIDGE_CODE"
    else
      check "Bridge Auth" "fail" "HTTP $BRIDGE_CODE"
    fi
  elif [ "$BRIDGE_MODE" = "gateway" ]; then
    check "Bridge Auth" "warn" "Gateway mode detected; skipping bridge auth probe"
  else
    check "Bridge Auth" "fail" "Bridge endpoint unavailable for auth probe"
  fi
fi

# 6. Postgres connectivity
if docker exec ventureos-db pg_isready -U ventureos -d ventureos >/dev/null 2>&1; then
  check "Postgres connectivity" "pass"
else
  check "Postgres connectivity" "fail"
fi

# 7. Port checks
for port in 8001 5433; do
  if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
    check "Port $port" "pass" "listening"
  else
    check "Port $port" "fail" "not listening"
  fi
done

if lsof -i ":18790" -sTCP:LISTEN >/dev/null 2>&1; then
  check "Bridge/Gateway Port" "pass" "18790 listening"
elif lsof -i ":18789" -sTCP:LISTEN >/dev/null 2>&1; then
  check "Bridge/Gateway Port" "pass" "18789 listening"
else
  check "Bridge/Gateway Port" "fail" "neither 18790 nor 18789 is listening"
fi

DASHBOARD_LISTENER_COUNT=$(lsof -nP -iTCP:8001 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 { print $2 }' | sort -u | wc -l | tr -d ' ')
if [ "${DASHBOARD_LISTENER_COUNT:-0}" -gt 1 ]; then
  check "Dashboard Listener Uniqueness" "fail" "multiple listeners on :8001"
else
  check "Dashboard Listener Uniqueness" "pass"
fi

# ── Output ───────────────────────────────────────────────────────────────────

$JSON_OUTPUT || echo ""

if $JSON_OUTPUT; then
  JOINED=$(printf ',%s' "${RESULTS[@]}")
  echo "{\"pass\":$PASS,\"fail\":$FAIL,\"warn\":$WARN,\"checks\":[${JOINED:1}]}"
else
  TOTAL=$((PASS + FAIL + WARN))
  echo "  Summary: $PASS/$TOTAL passed, $FAIL failed, $WARN warnings"
  echo ""
fi

if [ $FAIL -gt 0 ]; then
  exit 1
fi
exit 0
