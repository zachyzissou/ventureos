# Hybrid Deployment Plan — Issue #140

> **Scope:** Host-native OpenClaw + containerized Dashboard & Postgres, with a host Bridge API for safe data access.
>
> **Related:** [#138 — Roadmap: VentureOS delivery plan](https://github.com/zachyzissou/ventureos/issues/138)

---

## 1  Architecture Overview

```
┌─────────────────────────────────────────┐    ┌──────────────────────────────────────────────┐
│  Host (macOS workstation)               │    │  Docker Desktop  (project: ventureos)        │
│                                         │    │                                              │
│  OpenClaw runtime                       │    │  ┌────────────────────────────────────────┐  │
│    • gateway, agents, workspaces        │    │  │ dashboard  (service: dashboard)        │  │
│                                         │    │  │   • connects to bridge via              │  │
│  VentureOS Bridge API ─────────────────────────│     host.docker.internal:18790          │  │
│    • http://localhost:18790             │    │  │   • labels: com.ventureos.service=      │  │
│    • token-authenticated, CIDR-locked   │    │  │       dashboard, tier=app               │  │
│                                         │    │  └────────────────────────────────────────┘  │
│  Host data dirs                         │    │                                              │
│    • ~/.openclaw/         (runtime)     │    │  ┌────────────────────────────────────────┐  │
│    • ~/clawd/ventureos/   (repo)        │    │  │ db  (service: db)                      │  │
│    • ~/clawd/logs/        (bridge logs) │    │  │   • Postgres 16-alpine                  │  │
│                                         │    │  │   • volume: ventureos_db_data            │  │
│  Operator touchpoints                   │    │  │   • port 5433 → host                    │  │
│    • docker compose -p ventureos …      │    │  │   • labels: com.ventureos.service=      │  │
│    • Docker Desktop GUI (stack view)    │    │  │       db, tier=data                      │  │
│    • Bridge + OpenClaw logs on host     │    │  └────────────────────────────────────────┘  │
└─────────────────────────────────────────┘    └──────────────────────────────────────────────┘
```

### Design Principles

- **Isolation:** Dashboard + DB run in containers; host filesystem is never mounted into containers.
- **Reproducibility:** Compose spec + env template = repeatable setup on any Mac workstation.
- **Observability:** Monitoring labels, healthchecks, structured audit logs, and Docker Desktop stack grouping.
- **Security:** Token auth + CIDR allowlist on Bridge; no LAN bypass in container mode; secrets via env files only.

---

## 2  Docker Compose Spec

File: [`docker-compose.hybrid.yml`](../docker-compose.hybrid.yml)

### 2.1  Project & Services

| Property | Value |
|---|---|
| **Project name** | `ventureos` (set via `name:` key in compose file) |
| **Services** | `dashboard`, `db` |
| **Shared network** | `ventureos_default` (compose-managed) |
| **Persistent volume** | `ventureos_db_data` (Postgres data) |

### 2.2  Service Labels (Monitoring/Ops)

Every service carries these labels for Docker Desktop visibility and operational tooling:

| Label | Value | Purpose |
|---|---|---|
| `com.ventureos.stack` | `ventureos` | Stack grouping in Docker Desktop |
| `com.ventureos.service` | `dashboard` / `db` | Service identification |
| `com.ventureos.tier` | `app` / `data` | Tier classification |
| `com.ventureos.env` | `local-hybrid` | Environment tag |

### 2.3  Ports

| Service | Container Port | Host Port (default) | Notes |
|---|---|---|---|
| `dashboard` | 8001 | `$DASHBOARD_PORT` (8001) | Dashboard UI + API |
| `db` | 5432 | `$POSTGRES_PORT` (5433) | Avoids conflict with host Postgres |

### 2.4  Healthchecks

- **db:** `pg_isready` — interval 5s, 10 retries, 5s start period.
- **dashboard:** HTTP fetch to `/api/config` with auth header — interval 10s, 10 retries, 15s start period.
- Dashboard depends on `db` with `condition: service_healthy`.

---

## 3  Bridge API Contract

The Bridge API is a lightweight HTTP service running on the **host**, exposing sanitized data to the containerized dashboard.

### 3.1  Security Controls (Mandatory)

| Control | Implementation |
|---|---|
| **Authentication** | `Authorization: Bearer <BRIDGE_TOKEN>` (timing-safe comparison) |
| **CIDR allowlist** | Default: `127.0.0.1/32, ::1/128, 192.168.65.0/24, 172.17.0.0/16` |
| **Session redaction** | Drop `kind=isolated`, `subagent`, and `isolated` sessions from all outputs |
| **Rate limiting** | Sliding-window per IP per endpoint group |
| **Audit logging** | JSONL log for auth failures, rate-limit hits, sensitive endpoint access |

### 3.2  Endpoint Inventory

All endpoints require valid token **and** allowlisted client IP.

#### Health & Config
| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ ok, version, uptime, bridgeTime }` (unauthenticated) |
| GET | `/api/bridge/config` | Sanitized config + capability flags |

#### KPIs
| Method | Path | Description |
|---|---|---|
| GET | `/api/bridge/kpis/latest` | Latest KPI snapshot |
| GET | `/api/bridge/kpis/history?days=N` | KPI time series |

#### Agents & Sessions
| Method | Path | Description |
|---|---|---|
| GET | `/api/bridge/agent-health` | Agent health status |
| GET | `/api/bridge/sessions` | Session list (isolated/subagent filtered) |
| GET | `/api/bridge/session-messages?id=ID` | Messages for a non-isolated session |
| GET | `/api/bridge/response-time` | Average response time |

#### Observations
| Method | Path | Description |
|---|---|---|
| GET | `/api/bridge/observations/recent?hours=N` | Recent observations |
| GET | `/api/bridge/observations/search?q=TERM` | Full-text search |
| GET | `/api/bridge/observations?limit=N&offset=N` | Paginated list |

#### Costs & Usage
| Method | Path | Description |
|---|---|---|
| GET | `/api/bridge/costs` | Cost breakdown (expensive group) |
| GET | `/api/bridge/usage` | Usage windows |
| GET | `/api/bridge/tokens-today` | Today's token count |
| GET | `/api/bridge/lifetime-stats` | Lifetime aggregate stats |

#### System & Ops
| Method | Path | Description |
|---|---|---|
| GET | `/api/bridge/system` | CPU, memory, disk stats + disk history |
| GET | `/api/bridge/health-history` | Historical health snapshots |
| GET | `/api/bridge/live` | SSE live feed (rate-limited to 4 conn/60s) |

### 3.3  Rate Limits (Defaults)

| Group | Limit | Window | Endpoints |
|---|---|---|---|
| `default` | 60 | 60s | Most endpoints |
| `expensive` | 10 | 60s | `/costs`, `/usage`, `/session-messages`, `/lifetime-stats` |
| `sse` | 4 | 60s | `/live` |

### 3.4  Session Redaction Rules

Sessions are **dropped** from all outputs when:
- `kind === 'isolated'`
- Session key contains `subagent` or `isolated` (case-insensitive)

Redacted sessions are excluded from: session lists, message retrieval, aggregate costs, usage windows.

---

## 4  Environment Configuration

### 4.1  Dashboard Container (`.env.hybrid`)

Template: [`.env.hybrid.example`](../.env.hybrid.example)

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | **Yes** | — | Postgres password |
| `DASHBOARD_API_TOKEN` | **Yes** | — | Token to access dashboard UI/API |
| `BRIDGE_TOKEN` | **Yes** | — | Token for dashboard → bridge communication |
| `BRIDGE_URL` | No | `http://host.docker.internal:18790` | Bridge API base URL |
| `DASHBOARD_BRIDGE_JSON_TIMEOUT_MS` | No | `10000` | JSON bridge request timeout (ms) before 504 |
| `DASHBOARD_BRIDGE_SSE_CONNECT_TIMEOUT_MS` | No | `10000` | SSE bridge connect timeout (ms) before 504 |
| `DASHBOARD_PORT` | No | `8001` | Dashboard port |
| `POSTGRES_PORT` | No | `5433` | Host-exposed Postgres port |
| `DASHBOARD_DATA_MODE` | No | `bridge` | Data source (`bridge` or `filesystem`) |
| `DASHBOARD_ALLOW_LAN_BYPASS` | No | `false` | **Must be `false`** in hybrid mode |
| `DASHBOARD_ENABLE_ACTIONS` | No | `false` | Disable privileged actions in container |

### 4.2  Host Bridge API (`config/bridge.env.example`)

Template: [`config/bridge.env.example`](../config/bridge.env.example)

| Variable | Required | Default | Description |
|---|---|---|---|
| `BRIDGE_TOKEN` | **Yes** | — | Bearer token (or use `BRIDGE_TOKEN_FILE`) |
| `BRIDGE_PORT` | No | `18790` | Bridge listen port |
| `BRIDGE_ALLOW_CIDRS` | No | `127.0.0.1/32,...` | Allowed client CIDRs |
| `BRIDGE_RATE_LIMITS` | No | `default=60/60s;...` | Rate limit spec |
| `BRIDGE_AUDIT_LOG` | No | `~/clawd/logs/bridge-access.jsonl` | Audit log path |
| `OPENCLAW_AGENT` | No | `main` | Agent identity |

---

## 5  Operator Runbook

### 5.1  Bootstrap — New Machine Setup

**Prerequisites checklist:**

- [ ] macOS with Docker Desktop installed and running
- [ ] Node.js ≥ 20 installed
- [ ] OpenClaw installed and configured (`~/.openclaw/` exists)
- [ ] VentureOS repo cloned to `~/clawd/ventureos/`
- [ ] Ports available: 8001 (dashboard), 5433 (Postgres), 18790 (bridge)

**Setup steps:**

```bash
# 1. Clone repo and install dependencies
cd ~/clawd/ventureos
npm ci

# 2. Create environment files from templates
cp .env.hybrid.example .env.hybrid
cp config/bridge.env.example config/bridge.env

# 3. Generate secrets (IMPORTANT: use the SAME BRIDGE_TOKEN in both files)
BRIDGE_TOKEN=$(openssl rand -base64 32)
DASHBOARD_API_TOKEN=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)

# 4. Fill in .env.hybrid
cat > .env.hybrid <<EOF
POSTGRES_DB=ventureos
POSTGRES_USER=ventureos
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_PORT=5433
DASHBOARD_PORT=8001
DASHBOARD_API_TOKEN=${DASHBOARD_API_TOKEN}
BRIDGE_URL=http://host.docker.internal:18790
BRIDGE_TOKEN=${BRIDGE_TOKEN}
EOF

# 5. Fill in config/bridge.env
cat > config/bridge.env <<EOF
BRIDGE_PORT=18790
BRIDGE_TOKEN=${BRIDGE_TOKEN}
BRIDGE_ALLOW_CIDRS=127.0.0.1/32,::1/128,192.168.65.0/24,172.17.0.0/16
BRIDGE_AUDIT_LOG=$HOME/clawd/logs/bridge-access.jsonl
OPENCLAW_AGENT=main
EOF

# 6. Verify Docker Desktop is running
docker info >/dev/null 2>&1 || echo "ERROR: Docker Desktop not running"

# 7. Ensure .env.hybrid is gitignored (already in .gitignore)
grep -q '.env.hybrid' .gitignore && echo "OK: .env.hybrid is gitignored"
```

### 5.2  Bring-Up Sequence

```bash
# 1. Start Bridge API on host (background)
cd ~/clawd/ventureos
npm run compile --workspace=dashboard
source config/bridge.env
node dist/dashboard/server/bridge.js &
BRIDGE_PID=$!

# 2. Verify bridge health
curl -s http://localhost:18790/health | jq .
# Expected: { "ok": true, "version": "bridge-0.1", ... }

# 3. Start container stack
docker compose -f docker-compose.hybrid.yml --env-file .env.hybrid up -d

# 4. Watch services come healthy
docker compose -f docker-compose.hybrid.yml ps
# Both db and dashboard should show "healthy" within ~30s
```

### 5.3  Shutdown Sequence

```bash
# 1. Stop container stack
docker compose -f docker-compose.hybrid.yml --env-file .env.hybrid down

# 2. Stop bridge API
kill $BRIDGE_PID   # or: pkill -f 'node.*bridge.js'
```

### 5.4  Health Verification Checklist

Run after bring-up or when troubleshooting:

```bash
# Bridge API health (host)
curl -sf http://localhost:18790/health | jq .ok
# → true

# Alternative: OpenClaw gateway health (host)
curl -sf http://localhost:18789/health >/dev/null

# Bridge API authenticated endpoint (host)
curl -sf -H "Authorization: Bearer $BRIDGE_TOKEN" \
  http://localhost:18790/api/bridge/config | jq .name
# → "OpenClaw Bridge API"
# (Gateway mode does not expose the Bridge auth endpoint; healthcheck reports this as skipped/warn.)

# Dashboard health (container → host)
curl -sf -H "Authorization: Bearer $DASHBOARD_API_TOKEN" \
  http://localhost:8001/api/config | jq .
# → dashboard config object

# Postgres health (container)
docker exec ventureos-db pg_isready -U ventureos -d ventureos
# → accepting connections

# Docker Desktop stack check
docker compose -f docker-compose.hybrid.yml ps --format 'table {{.Name}}\t{{.Status}}'
# Both services: "Up ... (healthy)"
```

### 5.5  Docker Desktop GUI Verification

1. **Open Docker Desktop** → navigate to the **Containers** view.
2. Verify the **`ventureos`** stack appears as a single grouped entry.
3. Expand the stack → confirm both `ventureos-dashboard` and `ventureos-db` are listed.
4. Both services should show a **green/healthy** status indicator.
5. Click each service → **Logs** tab → confirm logs are accessible and readable.
6. Verify labels under **Inspect** tab for each service:
   - `com.ventureos.stack=ventureos`
   - `com.ventureos.service=dashboard` (or `db`)
   - `com.ventureos.env=local-hybrid`

### 5.6  Log Discovery

| Source | Location | Access Method |
|---|---|---|
| Bridge API audit log | `~/clawd/logs/bridge-access.jsonl` | `tail -f`, `jq` |
| Bridge API stdout | Terminal / process manager | Direct |
| Dashboard container logs | Docker-managed | `docker logs ventureos-dashboard` or Docker Desktop |
| Postgres container logs | Docker-managed | `docker logs ventureos-db` or Docker Desktop |
| OpenClaw runtime logs | `~/.openclaw/agents/main/sessions/` | Direct file access |

**Filtering bridge audit log:**
```bash
# Auth failures
jq 'select(.event == "auth_failed")' ~/clawd/logs/bridge-access.jsonl

# Rate limit hits
jq 'select(.event == "rate_limited")' ~/clawd/logs/bridge-access.jsonl

# All events for a specific IP
jq 'select(.ip == "192.168.65.3")' ~/clawd/logs/bridge-access.jsonl
```

---

## 6  Backup & Restore

### 6.1  What to Back Up

| Asset | Location | Criticality |
|---|---|---|
| Postgres data volume | Docker volume `ventureos_db_data` | **High** — persistent state |
| Environment secrets | `.env.hybrid`, `config/bridge.env` | **High** — not in git |
| Bridge audit log | `~/clawd/logs/bridge-access.jsonl` | Medium — operational history |
| OpenClaw workspaces | `~/.openclaw/` | **High** — agent state |

### 6.2  Backup Procedure (Postgres)

```bash
# Online backup via pg_dump (container running)
docker exec ventureos-db pg_dump -U ventureos -d ventureos \
  --format=custom --file=/tmp/ventureos-backup.dump

# Copy dump to host
docker cp ventureos-db:/tmp/ventureos-backup.dump \
  ~/clawd/backups/ventureos-$(date +%Y%m%d-%H%M%S).dump

# Clean up container temp file
docker exec ventureos-db rm /tmp/ventureos-backup.dump
```

### 6.3  Restore Procedure (Postgres)

```bash
# 1. Stop dashboard (prevent writes during restore)
docker compose -f docker-compose.hybrid.yml stop dashboard

# 2. Restore from dump
docker cp ~/clawd/backups/ventureos-YYYYMMDD-HHMMSS.dump \
  ventureos-db:/tmp/restore.dump

docker exec ventureos-db pg_restore -U ventureos -d ventureos \
  --clean --if-exists /tmp/restore.dump

docker exec ventureos-db rm /tmp/restore.dump

# 3. Restart dashboard
docker compose -f docker-compose.hybrid.yml start dashboard
```

### 6.4  Backup Secrets

```bash
# Copy env files to secure location (NOT git)
cp .env.hybrid ~/clawd/backups/env-hybrid-$(date +%Y%m%d).bak
cp config/bridge.env ~/clawd/backups/env-bridge-$(date +%Y%m%d).bak
chmod 600 ~/clawd/backups/env-*.bak
```

---

## 7  Incident Response Playbook

### 7.1  Common Failure Modes

#### Bridge API Down

**Symptoms:** Dashboard shows "Bridge unavailable" errors; `/api/bridge/*` returns 502.

**Steps:**
```bash
# 1. Check if bridge process is running
pgrep -f 'node.*bridge.js' || echo "Bridge not running"

# 2. Check bridge health
curl -sf http://localhost:18790/health | jq .

# 3. Check port availability
lsof -i :18790

# 4. Check audit log for clues
tail -20 ~/clawd/logs/bridge-access.jsonl | jq .

# 5. Restart bridge
source config/bridge.env
node dist/dashboard/server/bridge.js &
```

#### Database Unavailable

**Symptoms:** Dashboard health check fails; Postgres connection errors in logs.

**Steps:**
```bash
# 1. Check container status
docker ps -f name=ventureos-db --format '{{.Status}}'

# 2. Check Postgres readiness
docker exec ventureos-db pg_isready -U ventureos -d ventureos

# 3. Check container logs
docker logs --tail 50 ventureos-db

# 4. Restart DB (dashboard will reconnect)
docker compose -f docker-compose.hybrid.yml restart db
```

#### Dashboard Failing Health Checks

**Symptoms:** Docker Desktop shows dashboard as unhealthy; UI inaccessible.

**Steps:**
```bash
# 1. Check container status and health
docker inspect ventureos-dashboard --format '{{.State.Health.Status}}'

# 2. Check dashboard logs
docker logs --tail 50 ventureos-dashboard

# 3. Test from inside the container
docker exec ventureos-dashboard curl -sf http://localhost:8001/api/config \
  -H "Authorization: Bearer $DASHBOARD_API_TOKEN" | head -c 200

# 4. Check if bridge is reachable from container
docker exec ventureos-dashboard curl -sf http://host.docker.internal:18790/health

# 5. Restart dashboard
docker compose -f docker-compose.hybrid.yml restart dashboard
```

#### Token Mismatch

**Symptoms:** 401 Unauthorized from bridge; dashboard cannot fetch data.

**Steps:**
```bash
# 1. Verify bridge token matches
grep BRIDGE_TOKEN .env.hybrid
grep BRIDGE_TOKEN config/bridge.env
# These MUST match

# 2. Test bridge auth directly
curl -sf -H "Authorization: Bearer $(grep BRIDGE_TOKEN config/bridge.env | cut -d= -f2)" \
  http://localhost:18790/api/bridge/config | jq .ok

# 3. If mismatch: regenerate, update both files, restart both
```

### 7.2  Escalation Checklist

Before escalating, verify:
- [ ] Docker Desktop is running
- [ ] Bridge API process is alive and healthy
- [ ] Both containers show "healthy" in `docker compose ps`
- [ ] Tokens match between `.env.hybrid` and `config/bridge.env`
- [ ] No port conflicts (`lsof -i :8001 :5433 :18790`) and exactly one listener on `:8001`
- [ ] Audit log checked for auth failures or rate limits
- [ ] Container logs reviewed for errors

---

## 8  Security & Secrets Handling

### 8.1  Patterns (Do)

- Inject secrets via `.env.hybrid` and `config/bridge.env` (gitignored).
- Use `BRIDGE_TOKEN_FILE` for file-based secret injection (permissions `0600`).
- Generate tokens with `openssl rand -base64 32`.
- Restrict bridge access with CIDR allowlist.
- Disable `DASHBOARD_ALLOW_LAN_BYPASS` and `DASHBOARD_ENABLE_ACTIONS` in container mode.

### 8.2  Anti-Patterns (Don't)

- ❌ Bake secrets into Docker images.
- ❌ Commit `.env.hybrid` or `config/bridge.env` to git.
- ❌ Pass tokens via URL query strings.
- ❌ Mount host `~/.openclaw/` into containers.
- ❌ Enable `DASHBOARD_ALLOW_LAN_BYPASS` in hybrid mode.
- ❌ Run containers as root (Dockerfile uses `USER node`).

---

## 9  Risks & Anti-Patterns

| Risk | Mitigation |
|---|---|
| **Hidden host dependencies** — "snowflake" host setups | Bootstrap checklist (§5.1) documents all prereqs |
| **Unclear bridge API contract** — coupling to internals | Versioned endpoint inventory (§3.2) with stable paths |
| **Ephemeral data loss** — DB without durable volumes | Named volume `ventureos_db_data` + backup runbook (§6) |
| **Opaque logging** — scattered log locations | Log discovery table (§5.6) with concrete access commands |
| **Inconsistent naming** — per-machine drift | Fixed project name `ventureos`, stable service names |
| **Security shortcuts** — secrets in images/git | Anti-patterns documented (§8.2), gitignore enforced |
| **Network mismatch** — Docker subnet differs on Linux | `BRIDGE_ALLOW_CIDRS` documented as configurable |

---

## 10  Parity-Run & Cutover

### 10.1  Parity-Run Strategy

Before cutting over from host-only to hybrid, run both in parallel:

1. Keep host dashboard on port **8001** (current).
2. Start container dashboard on port **8002**:
   ```bash
   DASHBOARD_PORT=8002 docker compose -f docker-compose.hybrid.yml \
     --env-file .env.hybrid up -d dashboard
   ```
3. Compare key endpoints for 24–48h:
   - `/api/kpis/latest`, `/api/agent-health`, `/api/sessions`
   - `/api/costs`, `/api/observations/recent`
4. Validate: no isolated sessions visible, SSE consistency, UI parity.

### 10.2  Cutover

```bash
# Stop host dashboard (launchctl / tmux / however it's managed)
# Start container dashboard on port 8001
DASHBOARD_PORT=8001 docker compose -f docker-compose.hybrid.yml \
  --env-file .env.hybrid up -d dashboard
```

`scripts/hybrid-cutover.sh` now enforces single-listener behavior on `:8001` and stops stray host dashboard processes before container bring-up to avoid split-brain UI/API responses.

### 10.3  Rollback

```bash
# Stop containerized dashboard
docker compose -f docker-compose.hybrid.yml stop dashboard
# Restart host dashboard
```

---

## 11  Implementation Status

### Delivered in This Plan (Issue #140)

- [x] Architecture document with hybrid layout and bridge API contract
- [x] Docker Compose spec (`docker-compose.hybrid.yml`) with services, volumes, labels, healthchecks
- [x] Dashboard `Dockerfile` (multi-stage, no runtime npm installs, non-root user)
- [x] Bridge API scaffold (`dashboard/server/bridge.ts`) with token auth + CIDR allowlist
- [x] Bridge metrics implementation (`dashboard/server/bridge-metrics.ts`)
- [x] Bridge proxy helper for dashboard bridge mode (`dashboard/server/bridge-proxy.ts`)
- [x] Environment templates (`.env.hybrid.example`, `config/bridge.env.example`)
- [x] Operator runbook: bootstrap, bring-up, shutdown, health verification
- [x] Docker Desktop visibility: project name, labels, GUI verification steps
- [x] Backup & restore procedures
- [x] Incident response playbook
- [x] Security & secrets documentation

### Follow-Up Work (Separate Issues)

- [ ] Bridge: implement remaining stub endpoints (`/ventureos-agents`, `/crons`, `/git`, `/services`, `/memory`, `/mission-control`, `/workflow-patterns`)
- [ ] Bridge: implement SSE live feed with real event stream (currently ping-only)
- [ ] DB: define schema/migrations for history caching
- [ ] DB: implement ingest job (sessions/costs → Postgres)
- [ ] Dashboard: complete bridge-mode proxy for all remaining endpoints
- [ ] Registry: push prebuilt dashboard image to container registry
- [ ] Monitoring: add alerting for dashboard + bridge health checks
- [ ] CI: add compose validation (`docker compose config`) to CI pipeline
