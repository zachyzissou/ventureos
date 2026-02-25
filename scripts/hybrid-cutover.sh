#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VentureOS Hybrid Deployment — Production Cutover
# Issue #191: Execute hybrid deployment Docker Compose production cutover
#
# This script performs a safe, sequenced bring-up of the VentureOS hybrid stack:
#   1. Pre-flight checks (Docker, env files, ports)
#   2. Compile dashboard + bridge
#   3. Start Bridge API on host
#   4. Build & start Docker Compose stack
#   5. Health verification
#
# Usage:
#   ./scripts/hybrid-cutover.sh              # Full cutover
#   ./scripts/hybrid-cutover.sh --skip-build # Skip compilation (use existing dist/)
#   ./scripts/hybrid-cutover.sh --dry-run    # Validate only, don't start anything
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_FILE="$REPO_ROOT/.env.hybrid"
BRIDGE_ENV="$REPO_ROOT/config/bridge.env"
BRIDGE_PID_FILE="$REPO_ROOT/runtime/tmp/bridge.pid"
LOG_DIR="$REPO_ROOT/runtime/logs"

SKIP_BUILD=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --dry-run)    DRY_RUN=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build] [--dry-run]"
      echo "  --skip-build  Skip TypeScript compilation"
      echo "  --dry-run     Validate only, don't start services"
      exit 0
      ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────

info()  { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
fail()  { echo "  ❌ $*"; exit 1; }
step()  { echo ""; echo "── $* ──"; }

# ── 1. Pre-flight Checks ────────────────────────────────────────────────────

step "Pre-flight Checks"

# Docker running?
docker info >/dev/null 2>&1 || fail "Docker Desktop is not running"
info "Docker Desktop is running"

# Compose file exists?
[ -f "$COMPOSE_FILE" ] || fail "docker-compose.yml not found at $COMPOSE_FILE"
info "docker-compose.yml found"

# Validate compose file with the hybrid env file loaded
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config --quiet 2>/dev/null || fail "docker-compose.yml is invalid"
info "docker-compose.yml is valid"

# Environment file exists?
[ -f "$ENV_FILE" ] || fail ".env.hybrid not found — copy .env.hybrid.example and fill secrets"
info ".env.hybrid found"

# Bridge env exists?
[ -f "$BRIDGE_ENV" ] || fail "config/bridge.env not found — copy config/bridge.env.example and fill secrets"
info "config/bridge.env found"

# Check for placeholder secrets
if grep -q 'change-me' "$ENV_FILE"; then
  fail ".env.hybrid contains 'change-me' placeholder — generate real secrets first"
fi
info "No placeholder secrets detected"

# Verify BRIDGE_TOKEN match
BRIDGE_TOKEN_HYBRID=$(grep '^BRIDGE_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
BRIDGE_TOKEN_HOST=$(grep '^BRIDGE_TOKEN=' "$BRIDGE_ENV" | cut -d'=' -f2-)
if [ -n "$BRIDGE_TOKEN_HYBRID" ] && [ -n "$BRIDGE_TOKEN_HOST" ]; then
  if [ "$BRIDGE_TOKEN_HYBRID" != "$BRIDGE_TOKEN_HOST" ]; then
    fail "BRIDGE_TOKEN mismatch between .env.hybrid and config/bridge.env"
  fi
  info "BRIDGE_TOKEN matches across env files"
fi

# Prevent host+container dashboard split-brain by removing stray host server.
HOST_DASH_PIDS="$(pgrep -f 'node.*dashboard/dist/dashboard/server/server\.js' || true)"
if [ -n "$HOST_DASH_PIDS" ]; then
  warn "Stopping host dashboard process(es) to avoid dual 8001 listeners: $HOST_DASH_PIDS"
  for pid in $HOST_DASH_PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
  info "Host dashboard listener cleanup complete"
fi

# Port availability
for port in 8001 5433 18790; do
  if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
    warn "Port $port is already in use — may conflict"
  else
    info "Port $port is available"
  fi
done

DASHBOARD_LISTENER_COUNT=$(lsof -nP -iTCP:8001 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 { print $2 }' | sort -u | wc -l | tr -d ' ')
if [ "${DASHBOARD_LISTENER_COUNT:-0}" -gt 1 ]; then
  fail "Port 8001 has multiple listeners; stop host dashboard process and retry"
fi

if $DRY_RUN; then
  echo ""
  echo "✅ Dry run complete — all pre-flight checks passed"
  exit 0
fi

# ── 2. Compile Dashboard + Bridge ───────────────────────────────────────────

step "Build"

mkdir -p "$LOG_DIR" "$(dirname "$BRIDGE_PID_FILE")"

if $SKIP_BUILD; then
  info "Skipping build (--skip-build)"
  [ -f "$REPO_ROOT/dashboard/dist/dashboard/server/server.js" ] || fail "dist/ not found — run without --skip-build first"
else
  echo "  Compiling dashboard..."
  cd "$REPO_ROOT"
  npm run compile --workspace=dashboard 2>&1 | tail -3
  info "Dashboard compiled"
fi

# ── 3. Start Bridge API on Host ──────────────────────────────────────────────

step "Bridge API"

# Kill any existing bridge process
if [ -f "$BRIDGE_PID_FILE" ]; then
  OLD_PID=$(cat "$BRIDGE_PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "  Stopping existing bridge (PID $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$BRIDGE_PID_FILE"
fi

# Also kill any stray bridge processes
pkill -f 'node.*bridge\.js' 2>/dev/null || true
sleep 1

# Source bridge env and start
set -a
# shellcheck disable=SC1090
source "$BRIDGE_ENV"
set +a

cd "$REPO_ROOT"
node dashboard/dist/dashboard/server/bridge.js > "$LOG_DIR/bridge.log" 2>&1 &
BRIDGE_PID=$!
echo "$BRIDGE_PID" > "$BRIDGE_PID_FILE"
info "Bridge API started (PID $BRIDGE_PID)"

# Wait for bridge health
echo "  Waiting for bridge health..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:18790/health >/dev/null 2>&1; then
    info "Bridge API healthy"
    break
  fi
  if [ "$i" -eq 15 ]; then
    fail "Bridge API did not become healthy within 15s — check $LOG_DIR/bridge.log"
  fi
  sleep 1
done

# ── 4. Docker Compose Up ────────────────────────────────────────────────────

step "Docker Compose"

cd "$REPO_ROOT"

echo "  Building dashboard image..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build dashboard 2>&1 | tail -5
info "Dashboard image built"

echo "  Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d 2>&1
info "Services started"

# ── 5. Health Verification ──────────────────────────────────────────────────

step "Health Verification"

echo "  Waiting for services to become healthy..."
TIMEOUT=90
START_TIME=$(date +%s)

while true; do
  ELAPSED=$(( $(date +%s) - START_TIME ))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo ""
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    echo ""
    docker logs ventureos-dashboard --tail 30 2>/dev/null || true
    fail "Services did not become healthy within ${TIMEOUT}s"
  fi

  DB_HEALTHY=$(docker inspect --format='{{.State.Health.Status}}' ventureos-db 2>/dev/null || echo "missing")
  DASH_HEALTHY=$(docker inspect --format='{{.State.Health.Status}}' ventureos-dashboard 2>/dev/null || echo "missing")

  if [ "$DB_HEALTHY" = "healthy" ] && [ "$DASH_HEALTHY" = "healthy" ]; then
    break
  fi

  printf "  ⏳ db=%s dashboard=%s (%ds)\\r" "$DB_HEALTHY" "$DASH_HEALTHY" "$ELAPSED"
  sleep 3
done

echo ""
info "Database: healthy"
info "Dashboard: healthy"

# Load tokens for endpoint checks
DASHBOARD_API_TOKEN=$(grep '^DASHBOARD_API_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)

# Dashboard /api/config
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $DASHBOARD_API_TOKEN" \
  http://localhost:8001/api/config 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  info "Dashboard /api/config → 200"
else
  warn "Dashboard /api/config → $HTTP_CODE"
fi

# Bridge health
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  http://localhost:18790/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  info "Bridge /health → 200"
else
  warn "Bridge /health → $HTTP_CODE"
fi

# Postgres connectivity
if docker exec ventureos-db pg_isready -U ventureos -d ventureos >/dev/null 2>&1; then
  info "Postgres accepting connections"
else
  warn "Postgres not ready"
fi

# ── Summary ──────────────────────────────────────────────────────────────────

step "Cutover Complete"

echo ""
echo "  🟢 VentureOS hybrid stack is running"
echo ""
echo "  Dashboard:  http://localhost:8001"
echo "  Bridge API: http://localhost:18790"
echo "  Postgres:   localhost:5433"
echo ""
echo "  Bridge PID: $(cat "$BRIDGE_PID_FILE" 2>/dev/null || echo 'unknown')"
echo ""
echo "  View logs:"
echo "    docker logs -f ventureos-dashboard"
echo "    docker logs -f ventureos-db"
echo "    tail -f $LOG_DIR/bridge.log"
echo ""
echo "  Shutdown:"
echo "    ./scripts/hybrid-shutdown.sh"
echo ""
echo "  Rollback:"
echo "    ./scripts/hybrid-rollback.sh"
echo ""
