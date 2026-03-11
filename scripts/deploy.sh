#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VentureOS Production Deploy — Repeatable Rollout Workflow
# Issue #197: Automated deploy + rollback playbook
#
# Unified entrypoint that wraps hybrid deployment scripts into a deterministic,
# health-gated workflow with automatic rollback on failure.
#
# Subcommands:
#   up        Full deploy: preflight → build → bring-up → health gate → record
#   down      Graceful shutdown
#   rollback  Auto-rollback: backup → stop → restore previous state
#   status    Show current deployment state (SHA, uptime, health)
#   preflight Run preflight checks only
#   verify    Run health check suite only
#
# Usage:
#   ./scripts/deploy.sh up                    # Full deploy
#   ./scripts/deploy.sh up --skip-build       # Deploy without recompiling
#   ./scripts/deploy.sh up --timeout 180      # Custom health gate timeout
#   ./scripts/deploy.sh down                  # Graceful shutdown
#   ./scripts/deploy.sh rollback              # Auto-rollback to previous state
#   ./scripts/deploy.sh rollback --clean      # Rollback + remove volumes/images
#   ./scripts/deploy.sh status                # Show deployment state
#   ./scripts/deploy.sh preflight             # Validate environment
#   ./scripts/deploy.sh preflight --dry-run   # CI-safe preflight (no Docker needed)
#   ./scripts/deploy.sh verify                # Run health checks
#   ./scripts/deploy.sh verify --json         # Health checks as JSON
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_STATE_FILE="$REPO_ROOT/runtime/deploy-state.json"
DEPLOY_LOG_DIR="$REPO_ROOT/runtime/logs"
DEPLOY_LOG="$DEPLOY_LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
ENV_FILE="$REPO_ROOT/.env.hybrid"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
BRIDGE_ENV="$REPO_ROOT/config/bridge.env"
BRIDGE_PID_FILE="$REPO_ROOT/runtime/tmp/bridge.pid"

# Defaults
HEALTH_TIMEOUT=120
SKIP_BUILD=false
DRY_RUN=false
CLEAN=false
JSON_OUTPUT=false
AUTO_ROLLBACK=true
SUBCOMMAND="${1:-help}"
shift || true

VERSION="1.0.0"

# ── Parse subcommand-specific flags ──────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --skip-build)    SKIP_BUILD=true ;;
    --timeout)       ;; # next arg is the value, handled below
    --dry-run)       DRY_RUN=true ;;
    --clean)         CLEAN=true ;;
    --json)          JSON_OUTPUT=true ;;
    --no-rollback)   AUTO_ROLLBACK=false ;;
    --help|-h)       SUBCOMMAND="help" ;;
    *)
      # Handle --timeout N
      if [ "${PREV_ARG:-}" = "--timeout" ]; then
        HEALTH_TIMEOUT="$arg"
      fi
      ;;
  esac
  PREV_ARG="$arg"
done

# ── Formatting helpers ───────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { printf "${GREEN}  ✅ %s${NC}\n" "$*"; }
warn()    { printf "${YELLOW}  ⚠️  %s${NC}\n" "$*"; }
fail()    { printf "${RED}  ❌ %s${NC}\n" "$*"; }
step()    { printf "\n${BOLD}${BLUE}── %s ──${NC}\n" "$*"; }
header()  { printf "\n${BOLD}╔══════════════════════════════════════════════════╗${NC}\n"; \
            printf "${BOLD}║  %-48s║${NC}\n" "$*"; \
            printf "${BOLD}╚══════════════════════════════════════════════════╝${NC}\n"; }
die()     { fail "$*"; exit 1; }

log_to_file() {
  # Tee all output to deploy log if log dir exists
  if [ -d "$DEPLOY_LOG_DIR" ]; then
    exec > >(tee -a "$DEPLOY_LOG") 2>&1
  fi
}

# ── State management ─────────────────────────────────────────────────────────

write_state() {
  local status="$1"
  local sha branch timestamp operator db_health dash_health bridge_health

  sha=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  operator=$(whoami 2>/dev/null || echo "unknown")

  db_health=$(docker inspect --format='{{.State.Health.Status}}' ventureos-db 2>/dev/null || echo "unknown")
  dash_health=$(docker inspect --format='{{.State.Health.Status}}' ventureos-dashboard 2>/dev/null || echo "unknown")
  bridge_health="unknown"
  if curl -sf http://localhost:18790/health >/dev/null 2>&1; then
    bridge_health="healthy"
  fi

  mkdir -p "$(dirname "$DEPLOY_STATE_FILE")"
  cat > "$DEPLOY_STATE_FILE" <<EOF
{
  "version": "$VERSION",
  "sha": "$sha",
  "branch": "$branch",
  "timestamp": "$timestamp",
  "operator": "$operator",
  "status": "$status",
  "healthTimeout": $HEALTH_TIMEOUT,
  "services": {
    "db": "$db_health",
    "dashboard": "$dash_health",
    "bridge": "$bridge_health"
  }
}
EOF
}

read_state() {
  if [ -f "$DEPLOY_STATE_FILE" ]; then
    cat "$DEPLOY_STATE_FILE"
  else
    echo '{"status":"no-deployment","sha":"none"}'
  fi
}

# ── Preflight checks ────────────────────────────────────────────────────────

do_preflight() {
  local errors=0

  step "Preflight Checks"

  # 1. Git repository
  if git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    local sha
    sha=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null)
    info "Git repository OK (HEAD: $sha)"
  else
    fail "Not a git repository"; errors=$((errors + 1))
  fi

  # 2. Uncommitted changes warning
  if ! git -C "$REPO_ROOT" diff --quiet HEAD -- scripts/ docker-compose*.yml dashboard/Dockerfile 2>/dev/null; then
    warn "Uncommitted changes in deployment-related files"
  else
    info "Working tree clean (deployment files)"
  fi

  # 3. Required files
  for f in "$COMPOSE_FILE" "$ENV_FILE" "$BRIDGE_ENV"; do
    if [ -f "$f" ]; then
      info "Found $(basename "$f")"
    else
      fail "Missing: $f"; errors=$((errors + 1))
    fi
  done

  # 4. Placeholder secrets
  if [ -f "$ENV_FILE" ] && grep -q 'change-me\|CHANGEME\|TODO\|FIXME' "$ENV_FILE"; then
    fail ".env.hybrid contains placeholder secrets"; errors=$((errors + 1))
  else
    info "No placeholder secrets in .env.hybrid"
  fi

  # 5. BRIDGE_TOKEN match
  if [ -f "$ENV_FILE" ] && [ -f "$BRIDGE_ENV" ]; then
    local tok_hybrid tok_bridge
    tok_hybrid=$(grep '^BRIDGE_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)
    tok_bridge=$(grep '^BRIDGE_TOKEN=' "$BRIDGE_ENV" 2>/dev/null | cut -d'=' -f2- || true)
    if [ -n "$tok_hybrid" ] && [ -n "$tok_bridge" ]; then
      if [ "$tok_hybrid" = "$tok_bridge" ]; then
        info "BRIDGE_TOKEN matches across env files"
      else
        fail "BRIDGE_TOKEN mismatch between .env.hybrid and config/bridge.env"
        errors=$((errors + 1))
      fi
    fi
  fi

  # 6. Required env vars
  if [ -f "$ENV_FILE" ]; then
    for var in POSTGRES_PASSWORD DASHBOARD_API_TOKEN BRIDGE_TOKEN; do
      if grep -q "^${var}=.\+" "$ENV_FILE"; then
        info "$var is set"
      else
        fail "$var is empty or missing in .env.hybrid"; errors=$((errors + 1))
      fi
    done
  fi

  if ! $DRY_RUN; then
    # 7. Docker Desktop
    if docker info >/dev/null 2>&1; then
      info "Docker Desktop is running"
    else
      fail "Docker Desktop is not running"; errors=$((errors + 1))
    fi

    # 8. Compose validation
    if [ -f "$COMPOSE_FILE" ] && [ -f "$ENV_FILE" ]; then
      if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config --quiet 2>/dev/null; then
        info "docker-compose.yml is valid"
      else
        fail "docker-compose.yml validation failed"; errors=$((errors + 1))
      fi
    fi

    # 9. Port availability (only warn if currently deploying)
    for port in 8001 5433 18790; do
      if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
        warn "Port $port already in use"
      else
        info "Port $port is available"
      fi
    done

    # 10. Disk space
    local avail_kb
    avail_kb=$(df -k "$REPO_ROOT" | awk 'NR==2 {print $4}')
    if [ "$avail_kb" -lt 1048576 ]; then  # < 1 GB
      warn "Low disk space: $(( avail_kb / 1024 )) MB available"
    else
      info "Disk space OK: $(( avail_kb / 1024 )) MB available"
    fi

    # 11. Docker image disk usage
    local docker_used
    docker_used=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "unknown")
    info "Docker disk usage: $docker_used"
  else
    info "Dry-run mode — skipping Docker / port / disk checks"
  fi

  # Summary
  echo ""
  if [ $errors -gt 0 ]; then
    die "Preflight failed with $errors error(s) — fix issues above before deploying"
  else
    info "All preflight checks passed"
  fi

  return $errors
}

# ── Deploy (up) ──────────────────────────────────────────────────────────────

do_up() {
  local start_time
  start_time=$(date +%s)

  header "VentureOS Deploy — $(date '+%Y-%m-%d %H:%M:%S')"

  mkdir -p "$DEPLOY_LOG_DIR" "$(dirname "$BRIDGE_PID_FILE")" "$(dirname "$DEPLOY_STATE_FILE")"
  log_to_file

  # Record intent
  write_state "deploying"

  # Phase 1: Preflight
  do_preflight || {
    write_state "preflight-failed"
    exit 1
  }

  # Phase 2: Build
  step "Build"
  if $SKIP_BUILD; then
    if [ -f "$REPO_ROOT/dashboard/dist/dashboard/server/server.js" ]; then
      info "Skipping build (--skip-build) — using existing dist/"
    else
      die "dist/ not found — run without --skip-build first"
    fi
  else
    echo "  Compiling dashboard..."
    cd "$REPO_ROOT"
    if npm run compile --workspace=dashboard 2>&1 | tail -5; then
      info "Dashboard compiled"
    else
      write_state "build-failed"
      die "Dashboard compilation failed"
    fi
  fi

  # Phase 3: Bridge API
  step "Bridge API"

  # Stop existing bridge
  if [ -f "$BRIDGE_PID_FILE" ]; then
    local old_pid
    old_pid=$(cat "$BRIDGE_PID_FILE" 2>/dev/null || true)
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      echo "  Stopping existing bridge (PID $old_pid)..."
      kill "$old_pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$BRIDGE_PID_FILE"
  fi
  pkill -f 'node.*bridge\.js' 2>/dev/null || true
  sleep 1

  # Start bridge
  set -a
  # shellcheck disable=SC1090
  source "$BRIDGE_ENV"
  set +a

  cd "$REPO_ROOT"
  node dashboard/dist/dashboard/server/bridge.js > "$DEPLOY_LOG_DIR/bridge.log" 2>&1 &
  local bridge_pid=$!
  echo "$bridge_pid" > "$BRIDGE_PID_FILE"

  # Wait for bridge health
  echo "  Waiting for Bridge API (PID $bridge_pid)..."
  local bridge_ready=false
  for _i in $(seq 1 20); do
    if curl -sf http://localhost:18790/health >/dev/null 2>&1; then
      bridge_ready=true
      break
    fi
    if ! kill -0 "$bridge_pid" 2>/dev/null; then
      write_state "bridge-failed"
      die "Bridge API crashed on startup — check $DEPLOY_LOG_DIR/bridge.log"
    fi
    sleep 1
  done

  if ! $bridge_ready; then
    write_state "bridge-failed"
    die "Bridge API did not become healthy within 20s — check $DEPLOY_LOG_DIR/bridge.log"
  fi
  info "Bridge API healthy (PID $bridge_pid)"

  # Phase 4: Docker Compose
  step "Docker Compose"

  cd "$REPO_ROOT"
  echo "  Building dashboard image..."
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build dashboard 2>&1 | tail -5; then
    info "Dashboard image built"
  else
    write_state "image-build-failed"
    die "Docker image build failed"
  fi

  echo "  Starting services..."
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d 2>&1; then
    info "Services started"
  else
    write_state "compose-up-failed"
    die "docker compose up failed"
  fi

  # Phase 5: Health-gated verification
  step "Health Gate (timeout: ${HEALTH_TIMEOUT}s)"

  local gate_start gate_elapsed db_ok dash_ok
  gate_start=$(date +%s)

  while true; do
    gate_elapsed=$(( $(date +%s) - gate_start ))

    if [ "$gate_elapsed" -ge "$HEALTH_TIMEOUT" ]; then
      echo ""
      fail "Health gate timeout after ${HEALTH_TIMEOUT}s"

      # Collect diagnostics
      step "Diagnostics"
      docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps 2>/dev/null || true
      echo ""
      echo "  Dashboard logs (last 20 lines):"
      docker logs ventureos-dashboard --tail 20 2>/dev/null || true
      echo ""
      echo "  DB logs (last 10 lines):"
      docker logs ventureos-db --tail 10 2>/dev/null || true

      write_state "health-gate-failed"

      if $AUTO_ROLLBACK; then
        echo ""
        warn "Auto-rollback triggered — health gate failed"
        do_rollback_internal
      fi
      exit 1
    fi

    db_ok=$(docker inspect --format='{{.State.Health.Status}}' ventureos-db 2>/dev/null || echo "missing")
    dash_ok=$(docker inspect --format='{{.State.Health.Status}}' ventureos-dashboard 2>/dev/null || echo "missing")

    if [ "$db_ok" = "healthy" ] && [ "$dash_ok" = "healthy" ]; then
      break
    fi

    printf "  ⏳ db=%-10s dashboard=%-10s (%ds/%ds)\r" "$db_ok" "$dash_ok" "$gate_elapsed" "$HEALTH_TIMEOUT"
    sleep 3
  done

  echo ""
  info "Database: healthy"
  info "Dashboard: healthy"

  # Verify endpoints
  local dash_token
  dash_token=$(grep '^DASHBOARD_API_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- || true)

  local dash_code
  dash_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $dash_token" \
    http://localhost:8001/api/config 2>/dev/null || echo "000")
  if [ "$dash_code" = "200" ]; then
    info "Dashboard /api/config → 200"
  else
    warn "Dashboard /api/config → $dash_code"
  fi

  local bridge_code
  bridge_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    http://localhost:18790/health 2>/dev/null || echo "000")
  if [ "$bridge_code" = "200" ]; then
    info "Bridge /health → 200"
  else
    warn "Bridge /health → $bridge_code"
  fi

  if docker exec ventureos-db pg_isready -U ventureos -d ventureos >/dev/null 2>&1; then
    info "Postgres accepting connections"
  else
    warn "Postgres not responding to pg_isready"
  fi

  # Record success
  write_state "healthy"

  local total_time=$(( $(date +%s) - start_time ))

  # Summary
  step "Deploy Complete"

  local sha
  sha=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")

  echo ""
  printf "  ${GREEN}${BOLD}🟢 VentureOS deployed successfully${NC}\n"
  echo ""
  echo "  SHA:        $sha"
  echo "  Duration:   ${total_time}s"
  echo "  Dashboard:  http://localhost:8001"
  echo "  Bridge API: http://localhost:18790"
  echo "  Postgres:   localhost:5433"
  echo ""
  echo "  State file: $DEPLOY_STATE_FILE"
  echo "  Deploy log: $DEPLOY_LOG"
  echo ""
  echo "  Next steps:"
  echo "    ./scripts/deploy.sh status     # Check deployment"
  echo "    ./scripts/deploy.sh verify     # Full health check"
  echo "    ./scripts/deploy.sh down       # Shutdown"
  echo "    ./scripts/deploy.sh rollback   # Rollback"
  echo ""
}

# ── Shutdown (down) ──────────────────────────────────────────────────────────

do_down() {
  header "VentureOS Shutdown"

  if [ -x "$SCRIPT_DIR/hybrid-shutdown.sh" ]; then
    "$SCRIPT_DIR/hybrid-shutdown.sh"
    write_state "stopped"
  else
    die "hybrid-shutdown.sh not found at $SCRIPT_DIR/hybrid-shutdown.sh"
  fi
}

# ── Rollback (internal — called from health gate failure) ────────────────────

do_rollback_internal() {
  step "Automatic Rollback"

  local args=()
  $CLEAN && args+=(--clean)

  if [ -x "$SCRIPT_DIR/hybrid-rollback.sh" ]; then
    "$SCRIPT_DIR/hybrid-rollback.sh" "${args[@]+"${args[@]}"}"
    write_state "rolled-back"
    info "Rollback complete — system returned to pre-deploy state"
  else
    die "hybrid-rollback.sh not found — manual intervention required"
  fi
}

# ── Rollback (explicit) ─────────────────────────────────────────────────────

do_rollback() {
  header "VentureOS Rollback"

  echo ""
  echo "  Current deployment state:"
  if [ -f "$DEPLOY_STATE_FILE" ]; then
    local state_sha state_status state_ts
    state_sha=$(jq -r '.sha // "unknown"' "$DEPLOY_STATE_FILE" 2>/dev/null || echo "unknown")
    state_status=$(jq -r '.status // "unknown"' "$DEPLOY_STATE_FILE" 2>/dev/null || echo "unknown")
    state_ts=$(jq -r '.timestamp // "unknown"' "$DEPLOY_STATE_FILE" 2>/dev/null || echo "unknown")
    echo "    SHA:       $state_sha"
    echo "    Status:    $state_status"
    echo "    Deployed:  $state_ts"
  else
    echo "    No deployment state found"
  fi

  do_rollback_internal

  echo ""
  echo "  To return to hybrid deployment:"
  echo "    ./scripts/deploy.sh up"
  echo ""
  echo "  To start dev mode:"
  echo "    npm run dashboard:dev"
  echo ""
}

# ── Status ───────────────────────────────────────────────────────────────────

do_status() {
  header "VentureOS Deployment Status"

  echo ""

  # Read state file
  if [ ! -f "$DEPLOY_STATE_FILE" ]; then
    echo "  No deployment recorded."
    echo "  Run: ./scripts/deploy.sh up"
    echo ""
    return
  fi

  local state
  state=$(cat "$DEPLOY_STATE_FILE")

  local sha branch timestamp operator status
  sha=$(echo "$state" | jq -r '.sha // "unknown"')
  branch=$(echo "$state" | jq -r '.branch // "unknown"')
  timestamp=$(echo "$state" | jq -r '.timestamp // "unknown"')
  operator=$(echo "$state" | jq -r '.operator // "unknown"')
  status=$(echo "$state" | jq -r '.status // "unknown"')

  echo "  Recorded State:"
  echo "    SHA:        $sha"
  echo "    Branch:     $branch"
  echo "    Deployed:   $timestamp"
  echo "    Operator:   $operator"
  echo "    Status:     $status"
  echo ""

  # Live checks
  step "Live Service Health"

  local db_live dash_live bridge_live
  db_live=$(docker inspect --format='{{.State.Health.Status}}' ventureos-db 2>/dev/null || echo "not running")
  dash_live=$(docker inspect --format='{{.State.Health.Status}}' ventureos-dashboard 2>/dev/null || echo "not running")
  if curl -sf http://localhost:18790/health >/dev/null 2>&1; then
    bridge_live="healthy"
  else
    bridge_live="not responding"
  fi

  echo "  Database:     $db_live"
  echo "  Dashboard:    $dash_live"
  echo "  Bridge API:   $bridge_live"

  # Uptime
  local dash_started
  dash_started=$(docker inspect --format='{{.State.StartedAt}}' ventureos-dashboard 2>/dev/null || echo "")
  if [ -n "$dash_started" ] && [ "$dash_started" != "" ]; then
    local started_epoch now_epoch uptime_s
    started_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${dash_started%%.*}" +%s 2>/dev/null || echo "0")
    now_epoch=$(date +%s)
    if [ "$started_epoch" -gt 0 ]; then
      uptime_s=$(( now_epoch - started_epoch ))
      local hours=$(( uptime_s / 3600 ))
      local mins=$(( (uptime_s % 3600) / 60 ))
      echo "  Uptime:       ${hours}h ${mins}m"
    fi
  fi

  # Container resource usage
  step "Container Resources"
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
    ventureos-db ventureos-dashboard 2>/dev/null || echo "  (containers not running)"

  echo ""
}

# ── Verify ───────────────────────────────────────────────────────────────────

do_verify() {
  if $JSON_OUTPUT; then
    "$SCRIPT_DIR/hybrid-healthcheck.sh" --json
  else
    header "VentureOS Health Verification"
    "$SCRIPT_DIR/hybrid-healthcheck.sh"
  fi
}

# ── Help ─────────────────────────────────────────────────────────────────────

do_help() {
  cat <<'HELP'
VentureOS Deploy — Repeatable Production Rollout Workflow

USAGE:
  ./scripts/deploy.sh <command> [options]

COMMANDS:
  up          Full deploy: preflight → build → bring-up → health gate → record
  down        Graceful shutdown (stop all services, preserve data)
  rollback    Auto-rollback: backup DB → stop stack → restore state
  status      Show current deployment state and live health
  preflight   Run preflight checks only (validate environment)
  verify      Run health check suite only

OPTIONS (up):
  --skip-build    Skip TypeScript compilation (use existing dist/)
  --timeout N     Health gate timeout in seconds (default: 120)
  --no-rollback   Don't auto-rollback on health gate failure

OPTIONS (rollback):
  --clean         Remove Docker volumes and images (destroys data)

OPTIONS (preflight):
  --dry-run       Skip Docker/port/disk checks (CI-safe)

OPTIONS (verify):
  --json          Output health check results as JSON

EXAMPLES:
  # Fresh deploy
  ./scripts/deploy.sh up

  # Quick redeploy (skip build)
  ./scripts/deploy.sh up --skip-build

  # Check everything is OK
  ./scripts/deploy.sh verify

  # Something went wrong — rollback
  ./scripts/deploy.sh rollback

  # CI validation
  ./scripts/deploy.sh preflight --dry-run

DEPLOY STATE:
  Stored in runtime/deploy-state.json with SHA, timestamp, operator, and
  service health. Inspect with: ./scripts/deploy.sh status

HEALTH GATE:
  After bring-up, the deploy continuously polls health for up to --timeout
  seconds. If critical services don't pass, it auto-rollbacks (unless
  --no-rollback is set) and exits non-zero with diagnostics.

SEE ALSO:
  docs/DEPLOY_RUNBOOK.md — full operator runbook with command matrix
HELP
}

# ── Main dispatch ────────────────────────────────────────────────────────────

case "$SUBCOMMAND" in
  up)         do_up ;;
  down)       do_down ;;
  rollback)   do_rollback ;;
  status)     do_status ;;
  preflight)  do_preflight ;;
  verify)     do_verify ;;
  help|--help|-h) do_help ;;
  *)
    fail "Unknown command: $SUBCOMMAND"
    echo ""
    do_help
    exit 1
    ;;
esac
