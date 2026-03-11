#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VentureOS Hybrid Deployment — Rollback
# Issue #191
#
# Rolls back from containerized deployment to dev-mode operation:
#   1. Stop Docker Compose stack
#   2. Stop Bridge API
#   3. Optionally remove container images and volumes
#
# Usage:
#   ./scripts/hybrid-rollback.sh              # Stop services, keep data
#   ./scripts/hybrid-rollback.sh --clean      # Stop services + remove volumes/images
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_FILE="$REPO_ROOT/.env.hybrid"
BRIDGE_PID_FILE="$REPO_ROOT/runtime/tmp/bridge.pid"

CLEAN=false
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=true ;;
    --help|-h)
      echo "Usage: $0 [--clean]"
      echo "  --clean  Remove Docker volumes and images after stopping"
      exit 0
      ;;
  esac
done

info()  { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
step()  { echo ""; echo "── $* ──"; }

# ── 1. Backup DB Before Teardown ────────────────────────────────────────────

step "Pre-Rollback Backup"

BACKUP_DIR="$REPO_ROOT/runtime/backups"
mkdir -p "$BACKUP_DIR"

if docker inspect ventureos-db >/dev/null 2>&1; then
  BACKUP_FILE="$BACKUP_DIR/ventureos-pre-rollback-$(date +%Y%m%d-%H%M%S).dump"
  echo "  Backing up Postgres..."
  if docker exec ventureos-db pg_dump -U ventureos -d ventureos \
       --format=custom --file=/tmp/pre-rollback.dump 2>/dev/null; then
    docker cp ventureos-db:/tmp/pre-rollback.dump "$BACKUP_FILE" 2>/dev/null || true
    docker exec ventureos-db rm -f /tmp/pre-rollback.dump 2>/dev/null || true
    if [ -f "$BACKUP_FILE" ]; then
      info "Postgres backed up to $BACKUP_FILE"
    fi
  else
    warn "Postgres backup failed (DB may be empty — this is OK for fresh deployments)"
  fi
else
  info "No running DB container — skipping backup"
fi

# ── 2. Stop Services ────────────────────────────────────────────────────────

step "Stopping Services"

# Stop containers
if [ -f "$COMPOSE_FILE" ]; then
  if $CLEAN; then
    if [ -f "$ENV_FILE" ]; then
      docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v --rmi local 2>/dev/null || true
    else
      docker compose -f "$COMPOSE_FILE" down -v --rmi local 2>/dev/null || true
    fi
    info "Docker services stopped, volumes removed, local images removed"
  else
    if [ -f "$ENV_FILE" ]; then
      docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down 2>/dev/null || true
    else
      docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
    fi
    info "Docker services stopped (data volumes preserved)"
  fi
fi

# Stop Bridge API
if [ -f "$BRIDGE_PID_FILE" ]; then
  BRIDGE_PID=$(cat "$BRIDGE_PID_FILE" 2>/dev/null || true)
  if [ -n "$BRIDGE_PID" ] && kill -0 "$BRIDGE_PID" 2>/dev/null; then
    kill "$BRIDGE_PID" 2>/dev/null || true
    info "Bridge API stopped"
  fi
  rm -f "$BRIDGE_PID_FILE"
fi
pkill -f 'node.*bridge\.js' 2>/dev/null || true

# ── 3. Verify Clean State ───────────────────────────────────────────────────

step "Verification"

# Check no ventureos containers remain
REMAINING=$(docker ps -a --filter "label=com.ventureos.stack=ventureos" --format "{{.Names}}" 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  warn "Some containers remain: $REMAINING"
else
  info "No VentureOS containers running"
fi

# Check ports freed
for port in 8001 5433 18790; do
  if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
    warn "Port $port still in use"
  else
    info "Port $port is free"
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────

step "Rollback Complete"
echo ""
echo "  VentureOS is back to dev mode."
echo ""
echo "  To return to hybrid deployment:"
echo "    ./scripts/hybrid-cutover.sh"
echo ""
echo "  To start dev mode:"
echo "    npm run dashboard:dev"
echo ""
if ! $CLEAN; then
  echo "  Data volumes are preserved. To fully clean up:"
  echo "    ./scripts/hybrid-rollback.sh --clean"
  echo ""
fi
