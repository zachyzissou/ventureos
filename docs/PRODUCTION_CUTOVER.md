# Production Cutover Runbook — Issue #191

> **Scope:** Execute the hybrid deployment from design (#140) to production.
> Containerized dashboard + Postgres with host-native Bridge API.

---

## Quick Start

```bash
# 1. Setup environment (one-time)
cp .env.hybrid.example .env.hybrid
cp config/bridge.env.example config/bridge.env
# Edit both files — generate secrets with:
#   openssl rand -base64 32
# BRIDGE_TOKEN must match in both files!

# 2. Cutover (builds, starts bridge, starts containers, health-checks)
./scripts/hybrid-cutover.sh

# 3. Verify
./scripts/hybrid-healthcheck.sh

# 4. Access
open http://localhost:8001
```

---

## Cutover Commands

### Full Production Cutover

```bash
cd ~/clawd/ventureos
./scripts/hybrid-cutover.sh
```

This script performs:
1. Pre-flight validation (Docker, env files, ports, token match)
2. TypeScript compilation (`npm run compile --workspace=dashboard`)
3. Bridge API startup on host (port 18790)
4. Docker Compose build + up (dashboard + Postgres)
5. Health check verification (waits up to 90s for healthy state)

### Skip Build (use existing dist/)

```bash
./scripts/hybrid-cutover.sh --skip-build
```

### Dry Run (validate only)

```bash
./scripts/hybrid-cutover.sh --dry-run
```

---

## Shutdown Commands

### Graceful Shutdown

```bash
./scripts/hybrid-shutdown.sh
```

Stops containers and Bridge API. Data volumes are preserved.

### Manual Shutdown

```bash
# Stop containers
docker compose -f docker-compose.yml --env-file .env.hybrid down

# Stop bridge
kill $(cat runtime/tmp/bridge.pid)
# or: pkill -f 'node.*bridge.js'
```

---

## Rollback Commands

### Standard Rollback (keep data)

```bash
./scripts/hybrid-rollback.sh
```

- Backs up Postgres before stopping
- Stops all services
- Verifies clean state
- Ports freed for dev mode

### Full Clean Rollback (remove volumes + images)

```bash
./scripts/hybrid-rollback.sh --clean
```

- Same as standard + removes Docker volumes and local images
- **Destroys Postgres data** — backup is created first

### Return to Dev Mode After Rollback

```bash
npm run dashboard:dev
```

---

## Health Verification

### Automated Health Check

```bash
./scripts/hybrid-healthcheck.sh          # Human-readable
./scripts/hybrid-healthcheck.sh --json   # JSON for scripting
```

`./scripts/hybrid-cutover.sh` also performs host dashboard cleanup so Docker remains the single source on port `8001`.

Checks:
- Docker Desktop running
- Postgres container healthy
- Dashboard container healthy
- Bridge endpoint responding (Bridge API on `:18790` or OpenClaw gateway on `:18789`)
- Dashboard API responding (authenticated)
- Bridge auth working (Bridge API mode) or explicitly skipped in gateway mode
- Postgres accepting connections
- Required ports listening (`8001`, `5433`, and bridge/gateway on `18790` or `18789`)
- Single dashboard listener on `:8001` (prevents host+container split-brain)

### Manual Health Checks

```bash
# Bridge health (unauthenticated)
curl -sf http://localhost:18790/health | jq .

# If using OpenClaw gateway mode instead of Bridge API
curl -sf http://localhost:18789/health >/dev/null

# Dashboard health (unauthenticated — Issue #191)
curl -sf http://localhost:8001/api/health | jq .

# Dashboard API (authenticated)
curl -sf -H "Authorization: Bearer $DASHBOARD_API_TOKEN" \
  http://localhost:8001/api/config | jq .name

# Bridge API (authenticated)
curl -sf -H "Authorization: Bearer $BRIDGE_TOKEN" \
  http://localhost:18790/api/bridge/config | jq .

# Postgres
docker exec ventureos-db pg_isready -U ventureos -d ventureos

# Container status
docker compose -f docker-compose.yml ps --format 'table {{.Name}}\t{{.Status}}'
```

---

## Environment Setup

### Generate Secrets

```bash
BRIDGE_TOKEN=$(openssl rand -base64 32)
DASHBOARD_API_TOKEN=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
```

### .env.hybrid

```ini
POSTGRES_DB=ventureos
POSTGRES_USER=ventureos
POSTGRES_PASSWORD=<generated>
POSTGRES_PORT=5433
DASHBOARD_PORT=8001
DASHBOARD_API_TOKEN=<generated>
BRIDGE_URL=http://host.docker.internal:18790
BRIDGE_TOKEN=<generated>  # Must match config/bridge.env
```

### config/bridge.env

```ini
BRIDGE_PORT=18790
BRIDGE_TOKEN=<same as above>
BRIDGE_ALLOW_CIDRS=127.0.0.1/32,::1/128,192.168.65.0/24,172.17.0.0/16
BRIDGE_AUDIT_LOG=$HOME/clawd/logs/bridge-access.jsonl
OPENCLAW_AGENT=main
```

---

## Backup & Restore

### Backup Postgres

```bash
docker exec ventureos-db pg_dump -U ventureos -d ventureos \
  --format=custom --file=/tmp/ventureos-backup.dump
docker cp ventureos-db:/tmp/ventureos-backup.dump \
  ~/clawd/backups/ventureos-$(date +%Y%m%d-%H%M%S).dump
docker exec ventureos-db rm /tmp/ventureos-backup.dump
```

### Restore Postgres

```bash
docker compose -f docker-compose.yml stop dashboard
docker cp ~/clawd/backups/ventureos-YYYYMMDD-HHMMSS.dump ventureos-db:/tmp/restore.dump
docker exec ventureos-db pg_restore -U ventureos -d ventureos --clean --if-exists /tmp/restore.dump
docker exec ventureos-db rm /tmp/restore.dump
docker compose -f docker-compose.yml start dashboard
```

### Backup Secrets

```bash
mkdir -p ~/clawd/backups
cp .env.hybrid ~/clawd/backups/env-hybrid-$(date +%Y%m%d).bak
cp config/bridge.env ~/clawd/backups/env-bridge-$(date +%Y%m%d).bak
chmod 600 ~/clawd/backups/env-*.bak
```

---

## Troubleshooting

### Dashboard not healthy

```bash
docker logs --tail 50 ventureos-dashboard
docker exec ventureos-dashboard node -e "fetch('http://localhost:8001/api/health').then(r=>console.log(r.status))"
```

### Bridge unreachable from container

```bash
docker exec ventureos-dashboard curl -sf http://host.docker.internal:18790/health
```

### Token mismatch

```bash
grep BRIDGE_TOKEN .env.hybrid
grep BRIDGE_TOKEN config/bridge.env
# These MUST be identical
```

### Port conflicts

```bash
lsof -i :8001 :5433 :18790
```

---

## Architecture Reference

```
┌──────────────────────────────┐    ┌──────────────────────────────────┐
│  Host (macOS)                │    │  Docker Desktop                  │
│                              │    │                                  │
│  OpenClaw runtime            │    │  ┌────────────────────────────┐  │
│    • gateway, agents         │    │  │ dashboard (:8001)          │  │
│                              │    │  │  → /api/* endpoints        │  │
│  Bridge API (:18790) ←───────────→│  │  → /map/ tactical map     │  │
│    • token + CIDR auth       │    │  │  → /api/health (unauth)   │  │
│                              │    │  └────────────────────────────┘  │
│                              │    │                                  │
│                              │    │  ┌────────────────────────────┐  │
│                              │    │  │ db (Postgres :5432→:5433)  │  │
│                              │    │  │  → ventureos_db volume     │  │
│                              │    │  └────────────────────────────┘  │
└──────────────────────────────┘    └──────────────────────────────────┘
```

---

## CI Smoke Test

The `hybrid-deploy.yml` workflow validates on every PR touching deployment files:
1. `docker compose config` — validates compose spec
2. `docker compose build` — builds dashboard image
3. `docker compose up` — boots stack
4. Health checks — verifies DB and dashboard containers

See: `.github/workflows/hybrid-deploy.yml`
