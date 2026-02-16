# OpenClaw Dashboard

Operational dashboard for the OpenClaw multi-agent system — monitoring, session management, KPI tracking, and agent health.

> **Migrated into the VentureOS monorepo.** Previously at [`openclaw-dashboard`](https://github.com/zachyzissou/openclaw-dashboard) (now archived). See [Migration Guide](#migration-from-standalone-repo) below.

## Quick Start

### Prerequisites

- **Node.js** 18+ (tested with 25.x)
- **OpenClaw** installed and running (`~/.openclaw/` directory exists)
- A workspace directory (default: `~/clawd/`)

### Development

```bash
# From repo root
cd dashboard
npm install

# Start dev server with hot-reload (uses tsx)
npm run dev
# → Dashboard: http://0.0.0.0:8001

# Or from the repo root:
npm run dashboard:dev
```

### Production

```bash
# Build TypeScript
npm run build      # Type-check only (noEmit)
npm run compile    # Compile to dist/

# Start production server
npm run start      # Runs dist/dashboard/server/server.js
```

### First Login

1. On first start, a random API token is generated and saved to `dashboard/data/.api-token`
2. The token is printed to stdout: `[AUTH] Generated new API token. First 8 chars: aBcD1234...`
3. Open `http://localhost:8001/login` and enter the token
4. A session cookie is set — you won't need to re-enter it for 30 days
5. **LAN connections** (192.168.x.x, 10.x.x.x, etc.) bypass auth entirely

## Scripts

| Script    | Command | Description |
|-----------|---------|-------------|
| `dev`     | `tsx watch server/server.ts` | Dev server with hot-reload |
| `start`   | `node dist/dashboard/server/server.js` | Run production build |
| `build`   | `tsc --noEmit` | Type-check without emitting |
| `compile` | `tsc` | Compile TypeScript to `dist/` |
| `test`    | `vitest run` | Run tests via Vitest |

## Directory Structure

```
dashboard/
├── server/           # HTTP server & API
│   ├── server.ts     # Main entry point (Node http module, no Express)
│   ├── config.ts     # Environment-based configuration
│   ├── types.ts      # All TypeScript interfaces
│   ├── routes/       # Modular API route handlers
│   │   ├── kpis.ts           # /api/kpis/* endpoints
│   │   ├── observations.ts   # /api/observations/* endpoints
│   │   ├── agent-health.ts   # /api/agent-health endpoint
│   │   ├── rpg.ts            # /api/rpg/* endpoints
│   │   └── conversation.ts   # /api/rpg/conversations endpoint
│   └── middleware/   # Security middleware pipeline
│       ├── auth.ts           # Pre-shared token + cookie auth
│       ├── cors.ts           # Strict origin whitelist
│       ├── rate-limit.ts     # Per-IP sliding window rate limiter
│       ├── security-headers.ts # CSP + hardening headers
│       └── audit-log.ts      # Request audit logging
├── client/           # Static frontend assets
│   ├── index.html    # Main dashboard SPA
│   └── login.html    # Login page
├── data/             # Runtime data (gitignored)
│   ├── .api-token    # Auto-generated auth token
│   └── health-history.json
├── tests/            # Unit & integration tests
├── scripts/          # Deployment & migration scripts
│   ├── install.sh              # Linux systemd installer
│   ├── install-macos.sh        # macOS launchd installer
│   ├── migrate-from-standalone.sh  # Standalone → monorepo migration
│   └── rollback.sh             # Emergency rollback
├── docs/             # Dashboard-specific documentation
│   ├── API.md        # Complete API reference
│   └── MIGRATION.md  # Full migration guide
├── examples/         # Service templates
│   ├── launchd.plist       # macOS service template
│   └── systemd.service     # Linux service template
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration

All configuration is via environment variables with sensible defaults.

### Server Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_PORT` | `8001` | HTTP listen port |
| `DASHBOARD_HOST` | `0.0.0.0` | HTTP bind address |
| `DASHBOARD_API_TOKEN` | *(auto-generated)* | Override auth token |
| `DASHBOARD_AUTH_COOKIE` | `openclaw_dashboard_token` | Cookie name |

### Path Settings

All paths are resolved through `lib/paths.ts`. Override with environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VENTUREOS_ROOT` | `~/clawd/ventureos` | Monorepo root |
| `OPENCLAW_DIR` | `~/.openclaw` | OpenClaw runtime dir |
| `WORKSPACE_DIR` / `OPENCLAW_WORKSPACE` | `cwd()` | Agent workspace |
| `OPENCLAW_AGENT` | `main` | Agent ID for session data |
| `SHARED_CONTEXT` | `~/clawd/shared-context` | Cross-agent data |
| `KPI_DIR` | `$SHARED_CONTEXT/kpis` | KPI JSON files |
| `OBSERVATIONS_DIR` | `~/.openclaw/workspace-archivist/observations` | Observation files |
| `VENTUREOS_LOG_DIR` | `~/clawd/logs` | Dashboard log output |
| `VENTUREOS_AGENTS` | `oracle,atlas,sentinel,verifier,archivist,synth` | Agent IDs to monitor |

### Cache Tuning

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `AGENT_HEALTH_CACHE_TTL_MS` | `15000` | 1000–60000 | Agent health endpoint cache |
| `VENTUREOS_CACHE_TTL_MS` | `5000` | 1000–60000 | VentureOS data cache |

## API Reference

See **[docs/API.md](docs/API.md)** for the complete API reference covering all endpoints, schemas, authentication, and rate limiting.

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/kpis/latest` | Latest KPI snapshot |
| `GET /api/kpis/history?days=N` | KPI trend (1–90 days) |
| `GET /api/agent-health` | All agent health summaries |
| `GET /api/observations/recent?hours=N` | Recent observations (limit: 200) |
| `GET /api/observations/search?q=term` | Full-text observation search (limit: 100) |
| `GET /api/ventureos-agents` | Agent fleet status |
| `GET /api/ventureos-kpis` | KPI with SLO evaluation |
| `GET /api/mission-control` | Mission Control overview |
| `GET /api/sessions` | Active session list |
| `GET /api/costs` | Cost aggregation |
| `GET /api/live` | SSE real-time feed |

## Architecture

The dashboard is a **zero-dependency HTTP server** built on Node.js `http` module (no Express). This was a deliberate choice for:

- **Minimal footprint** — runs on resource-constrained agent hosts
- **No dependency conflicts** — only dev dependencies (TypeScript, Vitest)
- **Security** — smaller attack surface

### Request Pipeline

```
Request
  → Security Headers (CSP, X-Frame-Options, etc.)
  → CORS (strict origin whitelist)
  → Preflight handling (OPTIONS → 204)
  → Authentication (Bearer token / cookie / LAN bypass)
  → Rate Limiting (per-IP, per-endpoint sliding window)
  → Route dispatch
  → Response
```

### Data Sources

The dashboard reads data from disk (no database):

| Data | Source | Format |
|------|--------|--------|
| KPIs | `$KPI_DIR/YYYY-MM-DD.json` | JSON files |
| Sessions | `~/.openclaw/agents/*/sessions/` | JSONL + sessions.json |
| Observations | `$OBSERVATIONS_DIR/*.md` | Markdown + index.json |
| Agent health | `~/.openclaw/agents/*/` | Filesystem scan |
| Cron jobs | `~/.openclaw/cron/jobs.json` | JSON |
| System stats | OS APIs + `df`/`journalctl` | Runtime |

## Deployment

### Automated Installation

```bash
# macOS
./dashboard/scripts/install-macos.sh

# Linux
sudo ./dashboard/scripts/install.sh

# Custom port
DASHBOARD_PORT=8002 ./dashboard/scripts/install-macos.sh
```

The install scripts will:
1. Check Node.js ≥ 18
2. Install npm dependencies
3. Compile TypeScript → `dist/`
4. Install the service (launchd or systemd)
5. Start the service and verify health

### macOS (launchd)

Template: [`examples/launchd.plist`](examples/launchd.plist)

```bash
# Install via script
./dashboard/scripts/install-macos.sh

# Or manually
cp examples/launchd.plist ~/Library/LaunchAgents/com.openclaw.dashboard.monorepo.plist
# Edit placeholders, then:
launchctl load -w ~/Library/LaunchAgents/com.openclaw.dashboard.monorepo.plist

# Check status
launchctl list | grep openclaw

# Logs
tail -f ~/Library/Logs/openclaw-dashboard.log
```

### Linux (systemd)

Template: [`examples/systemd.service`](examples/systemd.service)

```bash
# Install via script
sudo ./dashboard/scripts/install.sh

# Check status
sudo systemctl status openclaw-dashboard

# View logs
journalctl -u openclaw-dashboard -f
```

### CI/CD

GitHub Actions workflow (`.github/workflows/dashboard.yml`) runs on PRs touching `dashboard/**`:
- TypeScript compilation on Node 18/20/22
- Unit + integration tests
- Deployment smoke test (start server, health check)
- Shell script linting

## Troubleshooting

### Dashboard won't start

```bash
# Check if port is in use
lsof -i :8001

# Run manually to see errors
cd dashboard && npx tsx server/server.ts
```

### "Unauthorized" on every request

- **LAN?** Verify your IP is private (check `ifconfig` / `ip addr`)
- **Remote?** Check the token: `cat dashboard/data/.api-token`
- **Cookie expired?** Visit `/login` to re-authenticate

### No KPI data showing

```bash
# Check KPI directory exists and has files
ls ~/clawd/shared-context/kpis/

# If empty, the KPI collection cron may not be running
# Check: ~/.openclaw/cron/jobs.json
```

### Agent health shows no agents

```bash
# Verify agents directory exists
ls ~/.openclaw/agents/

# Each agent needs a sessions/ subdirectory
ls ~/.openclaw/agents/oracle/sessions/
```

### Rate limited (429)

The dashboard polls several endpoints every 5 seconds. Each IP gets its own bucket. If you're hitting limits:
- Check if multiple dashboard tabs are open
- Limits are per-IP, so different devices won't conflict
- Wait for the `Retry-After` header value before retrying

### High memory usage

The server caches session cost data (re-scanned every 60s) and reads JSONL files. For large session histories:
- Archive old `.jsonl` files from `~/.openclaw/agents/*/sessions/`
- Clear caches via `POST /api/action/clear-cache`

## Migration from Standalone Repo

> **Full guide:** [docs/MIGRATION.md](docs/MIGRATION.md)

### Quick Migration (zero-downtime)

```bash
# 1. Start new dashboard in parallel (old untouched)
./dashboard/scripts/migrate-from-standalone.sh

# 2. Validate parity (both running simultaneously)
cd dashboard && npm run test:parity

# 3. Switch over when ready
./dashboard/scripts/migrate-from-standalone.sh --switchover

# 4. If anything goes wrong — immediate rollback (< 5 min)
./dashboard/scripts/rollback.sh
```

### What the migration script does:
1. Detects old standalone service (plist/systemd)
2. Extracts environment config (port, paths)
3. Builds the monorepo dashboard
4. Installs new service on parallel port (8002)
5. Validates endpoint parity
6. Provides switchover and rollback commands

### Timeline
| Day | Action |
|-----|--------|
| 0 | Parallel deploy (old on 7001, new on 8002) |
| 1–3 | Parity validation |
| 3–4 | Production switchover |
| 4–10 | Monitoring period |
| 10+ | Decommission old standalone |

**What changed:**
- Server is now TypeScript (was plain JS)
- Paths resolve through `lib/paths.ts` (no more hardcoded `~/clawd/`)
- Security middleware added: auth, CORS, rate limiting, CSP
- Shared libraries: `lib/error-handler.ts`, `lib/paths.ts`
- RPG and Conversation APIs integrated (Issue #78)

**What didn't change:**
- Same endpoints, same data directory structure
- Same auth token (reads from same `data/.api-token` location)
- Frontend HTML unchanged

## Related Documentation

- **[docs/API.md](docs/API.md)** — Complete API reference
- **[docs/DASHBOARD.md](../docs/DASHBOARD.md)** — VentureOS integration guide
- **[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)** — System architecture
- **[ADR-001](../docs/decisions/001-merge-dashboard-into-monorepo.md)** — Merge decision record
