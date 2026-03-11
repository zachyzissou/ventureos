#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VentureOS Hybrid Deployment — Graceful Shutdown
# Issue #191
#
# Stops the Docker Compose stack and Bridge API in the correct order:
#   1. Stop containers (dashboard → db)
#   2. Stop Bridge API on host
#
# Usage: ./scripts/hybrid-shutdown.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_FILE="$REPO_ROOT/.env.hybrid"
BRIDGE_PID_FILE="$REPO_ROOT/runtime/tmp/bridge.pid"

info()  { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
step()  { echo ""; echo "── $* ──"; }

step "Stopping Docker Compose Stack"

if [ -f "$COMPOSE_FILE" ]; then
  if [ -f "$ENV_FILE" ]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down 2>/dev/null || true
  else
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
  fi
  info "Docker services stopped"
else
  warn "docker-compose.yml not found"
fi

step "Stopping Bridge API"

if [ -f "$BRIDGE_PID_FILE" ]; then
  BRIDGE_PID=$(cat "$BRIDGE_PID_FILE" 2>/dev/null || true)
  if [ -n "$BRIDGE_PID" ] && kill -0 "$BRIDGE_PID" 2>/dev/null; then
    kill "$BRIDGE_PID" 2>/dev/null || true
    info "Bridge API stopped (PID $BRIDGE_PID)"
  else
    info "Bridge API already stopped"
  fi
  rm -f "$BRIDGE_PID_FILE"
else
  # Try to kill any stray bridge processes
  if pkill -f 'node.*bridge\.js' 2>/dev/null; then
    info "Killed stray bridge process"
  else
    info "No bridge process found"
  fi
fi

step "Shutdown Complete"
echo ""
echo "  All VentureOS services stopped."
echo "  Data volumes preserved (use 'docker volume rm ventureos_ventureos-db' to delete)."
echo ""
