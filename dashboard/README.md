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
npm run start      # Runs dist/server.js
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
| `start`   | `node dist/server.js` | Run production build |
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
├── scripts/          # Deployment scripts
│   └── install.sh    # Linux systemd installer
├── docs/             # Dashboard-specific documentation
│   └── API.md        # Complete API reference
├── examples/         # Usage examples
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

### macOS (launchd)

Create `~/Library/LaunchAgents/com.openclaw.dashboard.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOU/clawd/ventureos/dashboard/dist/server.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>DASHBOARD_PORT</key>
        <string>8001</string>
        <key>WORKSPACE_DIR</key>
        <string>/Users/YOU/clawd</string>
        <key>OPENCLAW_DIR</key>
        <string>/Users/YOU/.openclaw</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOU/clawd/logs/dashboard-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOU/clawd/logs/dashboard-stderr.log</string>
</dict>
</plist>
```

```bash
# Replace /Users/YOU with your home directory, then:
launchctl load ~/Library/LaunchAgents/com.openclaw.dashboard.plist

# Check status
launchctl list | grep openclaw

# Unload
launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.plist
```

**Note:** If using Homebrew Node.js, find the path with `which node` (likely `/opt/homebrew/bin/node`).

### Linux (systemd)

Run the included installer:

```bash
cd dashboard
bash scripts/install.sh
```

Or create manually at `/etc/systemd/system/agent-dashboard.service`:

```ini
[Unit]
Description=OpenClaw Agent Dashboard
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/clawd/ventureos/dashboard
ExecStart=/usr/bin/node /home/YOUR_USER/clawd/ventureos/dashboard/dist/server.js
Environment=DASHBOARD_PORT=8001
Environment=WORKSPACE_DIR=/home/YOUR_USER/clawd
Environment=OPENCLAW_DIR=/home/YOUR_USER/.openclaw
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable agent-dashboard
sudo systemctl start agent-dashboard

# Check status
sudo systemctl status agent-dashboard

# View logs
journalctl -u agent-dashboard -f
```

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

If you were running the standalone `openclaw-dashboard` repository:

1. **Stop the old service:**
   ```bash
   sudo systemctl stop agent-dashboard
   # or: launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.plist
   ```

2. **Pull the monorepo:**
   ```bash
   cd ~/clawd/ventureos
   git pull origin main
   cd dashboard
   npm install
   ```

3. **Build:**
   ```bash
   npm run compile
   ```

4. **Update service paths** to point to `~/clawd/ventureos/dashboard/dist/server.js` instead of the old standalone path.

5. **Start the new service:**
   ```bash
   sudo systemctl start agent-dashboard
   # or: launchctl load ~/Library/LaunchAgents/com.openclaw.dashboard.plist
   ```

6. **Verify:** Open `http://localhost:8001` — same auth token, same data.

**What changed:**
- Server is now TypeScript (was plain JS)
- Paths resolve through `lib/paths.ts` (no more hardcoded `~/clawd/`)
- Security middleware added (Phase 5.1): auth, CORS, rate limiting, CSP
- Shared libraries: `lib/error-handler.ts`, `lib/paths.ts`
- RPG and Conversation APIs integrated (Issue #78)

**What didn't change:**
- Same port, same endpoints, same data directory structure
- Same auth token (reads from same `data/.api-token` location)
- Frontend HTML unchanged

## Related Documentation

- **[docs/API.md](docs/API.md)** — Complete API reference
- **[docs/DASHBOARD.md](../docs/DASHBOARD.md)** — VentureOS integration guide
- **[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)** — System architecture
- **[ADR-001](../docs/decisions/001-merge-dashboard-into-monorepo.md)** — Merge decision record
