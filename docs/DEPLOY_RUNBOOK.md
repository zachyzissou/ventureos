# VentureOS Deploy Runbook — Operator Guide

> **Issue:** #197 Repeatable production rollout workflow
> **Prerequisite:** Hybrid deployment (#191) artifacts in place

---

## Quick Reference

```bash
./scripts/deploy.sh up            # Deploy
./scripts/deploy.sh verify        # Check health
./scripts/deploy.sh status        # Show state
./scripts/deploy.sh down          # Shutdown
./scripts/deploy.sh rollback      # Rollback
./scripts/preflight-routing.sh    # M5 routing+binding preflight
./scripts/rollback-last-known-good.sh   # M5 one-command rollback wrapper
```

---

## Command Matrix

| Action | Command | Duration | Destructive? |
|--------|---------|----------|-------------|
| **Fresh deploy** | `./scripts/deploy.sh up` | ~2–4 min | No |
| **Quick redeploy** | `./scripts/deploy.sh up --skip-build` | ~1–2 min | No |
| **Validate only** | `./scripts/deploy.sh preflight` | ~5s | No |
| **CI validation** | `./scripts/deploy.sh preflight --dry-run` | ~2s | No |
| **Routing preflight** | `./scripts/preflight-routing.sh` | ~5–15s | No |
| **Routing preflight (dry-run)** | `./scripts/preflight-routing.sh --dry-run` | ~2–5s | No |
| **Health check** | `./scripts/deploy.sh verify` | ~5s | No |
| **Health check (JSON)** | `./scripts/deploy.sh verify --json` | ~5s | No |
| **Deployment status** | `./scripts/deploy.sh status` | ~3s | No |
| **Graceful shutdown** | `./scripts/deploy.sh down` | ~10s | No (data preserved) |
| **Rollback (keep data)** | `./scripts/deploy.sh rollback` | ~15s | No (DB backed up) |
| **Rollback (full clean)** | `./scripts/deploy.sh rollback --clean` | ~20s | **Yes** (removes volumes) |

---

## Deployment Flow

### 1. First-Time Setup

```bash
# One-time: create environment files
cp .env.hybrid.example .env.hybrid
cp config/bridge.env.example config/bridge.env

# Generate secrets
BRIDGE_TOKEN=$(openssl rand -base64 32)
DASHBOARD_API_TOKEN=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)

# Edit .env.hybrid and config/bridge.env with generated values
# IMPORTANT: BRIDGE_TOKEN must match in both files!

# M5 safety lint (single-token-first + dangerous combo checks)
./scripts/lint-dangerous-config.sh
```

### 2. Deploy

```bash
./scripts/deploy.sh up
```

**What happens:**
1. **Preflight** — validates Docker, env files, secrets, ports, compose config
2. **Build** — compiles dashboard TypeScript (skip with `--skip-build`)
3. **Bridge API** — starts host-native Bridge on port 18790
4. **Docker Compose** — builds dashboard image, starts db + dashboard containers
5. **Health gate** — polls containers for up to 120s (configurable with `--timeout`)
6. **Record state** — writes `runtime/deploy-state.json`

**If health gate fails:** auto-rollback triggers (disable with `--no-rollback`).

### 3. Verify

```bash
./scripts/deploy.sh verify
```

Checks:
- Docker Desktop running
- Postgres container healthy + accepting connections
- Dashboard container healthy + API responding
- Bridge API healthy + authenticated endpoint working
- All ports (8001, 5433, 18790) listening

### 4. Monitor

```bash
# Current state and resource usage
./scripts/deploy.sh status

# Container logs
docker logs -f ventureos-dashboard
docker logs -f ventureos-db
tail -f runtime/logs/bridge.log

# Deploy logs
ls -lt runtime/logs/deploy-*.log | head -5
```

---

## Rollback Procedures

### Standard Rollback (Preserves Data)

```bash
./scripts/deploy.sh rollback
# equivalent wrapper:
./scripts/rollback-last-known-good.sh
```

**What happens:**
1. Reads current deploy state and displays it
2. Backs up Postgres to `runtime/backups/`
3. Stops Docker Compose stack
4. Stops Bridge API
5. Verifies all ports are freed
6. Updates state to `rolled-back`

### Full Clean Rollback

```bash
./scripts/deploy.sh rollback --clean
```

Same as standard, **plus removes Docker volumes and images**. Postgres data is destroyed (backup created first).

### Return to Dev Mode After Rollback

```bash
npm run dashboard:dev
```

### Manual Rollback (if scripts fail)

```bash
# 1. Stop containers
docker compose -f docker-compose.yml --env-file .env.hybrid down

# 2. Stop bridge
kill $(cat runtime/tmp/bridge.pid) 2>/dev/null
pkill -f 'node.*bridge.js' 2>/dev/null

# 3. Verify ports freed
lsof -i :8001 :5433 :18790

# 4. If you need to destroy volumes:
docker volume rm ventureos_ventureos-db
```

---

## Failure Scenarios

### Preflight Fails

| Symptom | Fix |
|---------|-----|
| `Docker Desktop is not running` | Start Docker Desktop |
| `Missing: .env.hybrid` | `cp .env.hybrid.example .env.hybrid` + fill secrets |
| `Missing: config/bridge.env` | `cp config/bridge.env.example config/bridge.env` + fill secrets |
| `Placeholder secrets` | Replace `change-me` / `TODO` values with real secrets |
| `BRIDGE_TOKEN mismatch` | Ensure same BRIDGE_TOKEN in `.env.hybrid` and `config/bridge.env` |
| `Port XXXX already in use` | Stop conflicting process or change port in env files |

### Build Fails

| Symptom | Fix |
|---------|-----|
| `Dashboard compilation failed` | Check TypeScript errors: `npm run compile --workspace=dashboard` |
| `dist/ not found` | Run without `--skip-build` |

### Bridge API Fails

| Symptom | Fix |
|---------|-----|
| `crashed on startup` | Check `runtime/logs/bridge.log` for error details |
| `did not become healthy` | Verify `config/bridge.env` has correct `BRIDGE_PORT=18790` |

### Health Gate Fails

| Symptom | Fix |
|---------|-----|
| DB not healthy | `docker logs ventureos-db --tail 30` — check for auth/disk issues |
| Dashboard not healthy | `docker logs ventureos-dashboard --tail 30` — check for startup errors |
| Auto-rollback triggered | Fix root cause, then `./scripts/deploy.sh up` again |
| Increase timeout | `./scripts/deploy.sh up --timeout 180` |

### Rollback Fails

| Symptom | Fix |
|---------|-----|
| `hybrid-rollback.sh not found` | Run from repo root: `cd ~/clawd/ventureos` |
| Containers still running | `docker compose down -v` (manual cleanup) |
| Ports still occupied | `lsof -i :8001` → `kill <PID>` |

---

## Deployment State

The deploy script tracks state in `runtime/deploy-state.json`:

```json
{
  "version": "1.0.0",
  "sha": "4f175c48",
  "branch": "main",
  "timestamp": "2026-02-17T18:00:00Z",
  "operator": "zach",
  "status": "healthy",
  "healthTimeout": 120,
  "services": {
    "db": "healthy",
    "dashboard": "healthy",
    "bridge": "healthy"
  }
}
```

**Status values:**
- `deploying` — deploy in progress
- `healthy` — all services up and passing health checks
- `stopped` — gracefully shut down
- `rolled-back` — rolled back (manually or auto)
- `preflight-failed` — preflight checks didn't pass
- `build-failed` — TypeScript compilation failed
- `bridge-failed` — Bridge API didn't start
- `image-build-failed` — Docker image build failed
- `compose-up-failed` — Docker Compose up failed
- `health-gate-failed` — services didn't become healthy in time

---

## CI Integration

The CI workflow (`.github/workflows/hybrid-deploy.yml`) validates on every PR:

1. **Shellcheck** — lints all deploy scripts for shell best practices
2. **Dry-run preflight** — `./scripts/deploy.sh preflight --dry-run`
3. **Compose validation** — `docker compose config`
4. **Image build** — builds dashboard Docker image
5. **Smoke test** — boots stack, verifies DB health

---

## Architecture

```
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│  Host (macOS)                    │    │  Docker Desktop                  │
│                                  │    │                                  │
│  deploy.sh ─── orchestrates ────────→ │  ┌────────────────────────────┐  │
│                                  │    │  │ dashboard (:8001)          │  │
│  OpenClaw runtime                │    │  │  → /api/* endpoints        │  │
│    • gateway, agents             │    │  │  → /map/ tactical map      │  │
│                                  │    │  │  → /api/health (unauth)    │  │
│  Bridge API (:18790) ←───────────────→│  └────────────────────────────┘  │
│    • token + CIDR auth           │    │                                  │
│                                  │    │  ┌────────────────────────────┐  │
│  deploy-state.json               │    │  │ db (Postgres :5432→:5433)  │  │
│    • SHA, status, timestamps     │    │  │  → ventureos_db volume     │  │
│                                  │    │  └────────────────────────────┘  │
└──────────────────────────────────┘    └──────────────────────────────────┘
```

---

## Cutover/Rollback Decision Matrix

| Scenario | Action | Command |
|----------|--------|---------|
| Fresh install, first deploy | Deploy | `./scripts/deploy.sh up` |
| Code update on main | Redeploy | `git pull && ./scripts/deploy.sh up` |
| Quick config change | Redeploy (skip build) | `./scripts/deploy.sh up --skip-build` |
| Dashboard is broken | Rollback | `./scripts/deploy.sh rollback` |
| Need to debug locally | Shutdown + dev mode | `./scripts/deploy.sh down && npm run dashboard:dev` |
| Corrupt database | Clean rollback | `./scripts/deploy.sh rollback --clean` |
| CI is failing on deploy files | Validate locally | `./scripts/deploy.sh preflight --dry-run` |
| Health check flaky (slow machine) | Increase timeout | `./scripts/deploy.sh up --timeout 180` |
| Maintenance window | Shutdown | `./scripts/deploy.sh down` |
| Resume after maintenance | Deploy (skip build) | `./scripts/deploy.sh up --skip-build` |

---

## Backup Policy

| When | What | Where |
|------|------|-------|
| Every rollback | Postgres pg_dump | `runtime/backups/ventureos-pre-rollback-*.dump` |
| Manual backup | Postgres pg_dump | See `docs/PRODUCTION_CUTOVER.md` |
| Env files | `.env.hybrid` + `config/bridge.env` | `~/clawd/backups/` |

### Restore from Backup

```bash
# Stop dashboard to avoid writes during restore
docker compose -f docker-compose.yml stop dashboard

# Copy dump into container and restore
docker cp runtime/backups/ventureos-pre-rollback-YYYYMMDD-HHMMSS.dump \
  ventureos-db:/tmp/restore.dump
docker exec ventureos-db pg_restore -U ventureos -d ventureos \
  --clean --if-exists /tmp/restore.dump
docker exec ventureos-db rm /tmp/restore.dump

# Restart dashboard
docker compose -f docker-compose.yml start dashboard
```

---

## References

- [#197](https://github.com/zachyzissou/ventureos/issues/197) — Repeatable production rollout workflow
- [#191](https://github.com/zachyzissou/ventureos/issues/191) — Hybrid deployment execution
- [#140](https://github.com/zachyzissou/ventureos/issues/140) — Hybrid deployment design
- [PRODUCTION_CUTOVER.md](./PRODUCTION_CUTOVER.md) — Original cutover docs
- [HYBRID_DEPLOYMENT.md](./HYBRID_DEPLOYMENT.md) — Architecture deep-dive
