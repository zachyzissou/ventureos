# Tactical Map — Deployment Guide

> **Issue #22** · VentureOS Phase 5 Documentation

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Development Setup](#development-setup)
4. [Production Deployment](#production-deployment)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Docker Deployment](#docker-deployment)
7. [Environment Configuration](#environment-configuration)
8. [SSL/TLS Setup](#ssltls-setup)
9. [Monitoring & Logging](#monitoring--logging)
10. [Backup & Recovery](#backup--recovery)
11. [Rollback](#rollback)
12. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Development
cd tactical-map
npm install
npm run dev          # Vite dev server on :5174

# Production build
npm run build        # Output to dist/

# Tests
npm test             # Vitest unit + integration
npm run test:e2e     # Playwright visual regression
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Production Setup                    │
│                                                       │
│  ┌──────────────────────────────────────────────┐    │
│  │        Dashboard Server (Node.js :8001)       │    │
│  │                                               │    │
│  │  /map/*  → Static files (tactical-map/dist/)  │    │
│  │  /api/*  → API handlers (routes/)             │    │
│  │  /ws/*   → WebSocket streams                  │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  ┌──────────────────────────────────────────────┐    │
│  │        Vite Dev Server (:5174) [dev only]     │    │
│  │                                               │    │
│  │  Proxies /api/* → Dashboard Server :8001      │    │
│  │  Hot Module Replacement for TypeScript         │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

In **production**, the dashboard server serves the built static files at `/map/` and handles all API routes. In **development**, Vite's dev server runs separately with API proxy forwarding.

---

## Development Setup

### Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | 25+ | Required for tactical-map |
| npm | 10+ | Comes with Node.js |
| Playwright | Auto-installed | For E2E tests |

### Install & Run

```bash
cd tactical-map

# Install dependencies
npm install

# Start development server
npm run dev
# → Vite dev server at http://localhost:5174/map/
# → API requests proxied to http://localhost:8001

# Run unit + integration tests
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E visual regression tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui
```

### Vite Dev Server Configuration

The dev server is configured in `vite.config.ts`:

```typescript
{
  root: 'src',           // Entry: src/index.html
  base: '/map/',         // URL prefix for production
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false
      }
    }
  }
}
```

### Test Configuration

| Test Type | Command | Config |
|-----------|---------|--------|
| Unit | `npm test` | `vite.config.ts` (Vitest) |
| Integration | `npm test` | Tests in `tests/integration/` |
| E2E | `npm run test:e2e` | `playwright.config.ts` |
| Visual Regression | `npm run test:e2e` | Snapshot files in `tests/e2e/*.spec.ts-snapshots/` |
| Performance | `PERF=1 npm run test:e2e -- tests/e2e/performance.spec.ts` | FPS benchmarks |

### Dev Surface

In development, `window.__TACTICAL_MAP__` is exposed with:

```typescript
window.__TACTICAL_MAP__ = {
  app,                  // PIXI.js Application
  mapStore,             // Reactive store for map state
  economyStore,         // Reactive store for economy
  healthStore,          // Reactive store for health
  api,                  // API client instance
  economyClient,        // Economy WebSocket client
  healthClient,         // Health WebSocket client
  camera,               // Camera controller
  pause: () => {},      // Stop render loop
  resume: () => {},     // Resume render loop
  setMapState: (s) => {},
  setEconomyState: (s) => {},
  setHealthState: (s) => {},
  toggleHealthDashboard: () => {},
  snapshot: () => {},   // Force render (for visual tests)
};
```

---

## Production Deployment

### Build

```bash
cd tactical-map
npm run build
# Output: tactical-map/dist/
#   ├── index.html
#   └── assets/
#       ├── index-*.js
#       ├── index-*.js.map
#       └── (PIXI.js chunks)
```

### Serve via Dashboard

The dashboard server serves the built files at `/map/`:

```bash
# Dashboard reads from tactical-map/dist/
http://localhost:8001/map
```

Configure with the `tryServeStatic` function in `dashboard/server/server.ts`:
```typescript
tryServeStatic(req, res, {
  urlPrefix: '/map',
  rootDir: path.join(__dirname, '..', 'tactical-map', 'dist')
});
```

### Bare Metal Deployment

```bash
# 1. Build the tactical map
cd tactical-map && npm ci && npm run build

# 2. Start the dashboard server
cd ../dashboard
node --experimental-strip-types server/server.ts

# 3. Access the tactical map
open http://localhost:8001/map
```

### Process Management (systemd)

```ini
# /etc/systemd/system/ventureos-dashboard.service
[Unit]
Description=VentureOS Dashboard Server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/ventureos
ExecStart=/usr/bin/node --experimental-strip-types dashboard/server/server.ts
Restart=always
RestartSec=5
Environment=DASHBOARD_PORT=8001
Environment=DASHBOARD_HOST=0.0.0.0
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ventureos-dashboard
sudo systemctl start ventureos-dashboard
sudo systemctl status ventureos-dashboard
```

---

## CI/CD Pipeline

GitHub Actions handles tactical map validation and staged promotion.

### Workflows

- `.github/workflows/tactical-map-ci.yml`
  - Runs on PRs and pushes touching tactical map code.
  - Executes `npm test` and `npm run build`.
  - Uploads `tactical-map/dist` as a build artifact for review.

- `.github/workflows/tactical-map-deploy.yml`
  - Builds a deployable artifact.
  - Deploys to **staging** on push to `main` and on manual dispatch.
  - Deploys to **production** only on manual dispatch (`target=production`) with a protected environment gate.

### Environment Gates

Configure GitHub Environments for `staging` and `production`:

- **staging**: Optional environment URL; no approvals required.
- **production**: Require reviewers for manual approval before the job runs.

Environment-level secrets (if needed) keep deployment credentials out of the repo. Replace the placeholder deploy steps with your sync/rsync, container registry, or hosting provider commands.

---

## Docker Deployment

### Dockerfile

```dockerfile
# Build stage
FROM node:25-alpine AS builder
WORKDIR /app

# Install tactical-map dependencies and build
COPY tactical-map/package*.json tactical-map/
RUN cd tactical-map && npm ci

COPY tactical-map/ tactical-map/
RUN cd tactical-map && npm run build

# Install dashboard dependencies
COPY dashboard/package*.json dashboard/
RUN cd dashboard && npm ci --omit=dev

COPY dashboard/ dashboard/
COPY lib/ lib/

# Runtime stage
FROM node:25-alpine
WORKDIR /app

COPY --from=builder /app/dashboard/ dashboard/
COPY --from=builder /app/tactical-map/dist/ tactical-map/dist/
COPY --from=builder /app/lib/ lib/

EXPOSE 8001

ENV NODE_ENV=production
ENV DASHBOARD_PORT=8001
ENV DASHBOARD_HOST=0.0.0.0

CMD ["node", "--experimental-strip-types", "dashboard/server/server.ts"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: "3.9"

services:
  dashboard:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8001:8001"
    environment:
      - DASHBOARD_PORT=8001
      - DASHBOARD_HOST=0.0.0.0
      - DASHBOARD_API_TOKEN=${DASHBOARD_API_TOKEN}
      - NODE_ENV=production
      - VENTUREOS_AGENTS=venture_research,venture_infrastructure,venture_security,venture_evidence,venture_memory,venture_delivery
    volumes:
      # Persist API token across restarts
      - api-token:/app/dashboard/data
      # Mount OpenClaw data for session monitoring
      - ${OPENCLAW_DIR:-~/.openclaw}:/data/openclaw:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8001/api/tactical-map/state"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

volumes:
  api-token:
```

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f dashboard

# Rebuild after code changes
docker compose up -d --build
```

---

## Environment Configuration

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_PORT` | `8001` | HTTP server port |
| `DASHBOARD_HOST` | `0.0.0.0` | Bind address |
| `DASHBOARD_API_TOKEN` | Auto-generated | Pre-shared API authentication token |
| `NODE_ENV` | `development` | `production` enables optimizations |
| `WORKSPACE_DIR` | `cwd()` | Base workspace directory |
| `OPENCLAW_WORKSPACE` | (fallback for WORKSPACE_DIR) | OpenClaw workspace path |
| `OPENCLAW_AGENT` | `main` | Agent ID for session directory lookup |
| `VENTUREOS_AGENTS` | `venture_research,venture_infrastructure,...` | Comma-separated list of VentureOS agent IDs |
| `VENTUREOS_CACHE_TTL_MS` | `5000` | Cache TTL for agent metrics (1000-60000) |

### Client-Side Configuration

All client configuration lives in `src/config.ts`. Key tunable values:

| Constant | Value | Description |
|----------|-------|-------------|
| `API.POLL_INTERVAL` | `15000` | Map state poll interval (ms) |
| `API.KPI_POLL_INTERVAL` | `30000` | RPG stats poll interval (ms) |
| `API.TIMEOUT_MS` | `8000` | Default fetch timeout (ms) |
| `API.REALTIME_FALLBACK_POLL_MS` | `2000` | Economy fallback poll when WS down (ms) |
| `API.WS_RECONNECT_BASE_MS` | `1000` | WebSocket reconnect base delay |
| `API.WS_RECONNECT_MAX_MS` | `30000` | WebSocket reconnect max delay |
| `ECONOMY.WARNING_THRESHOLD` | `0.30` | Budget warning at ≤30% remaining |
| `ECONOMY.CRITICAL_THRESHOLD` | `0.15` | Budget critical at ≤15% remaining |
| `ECONOMY.ALERT_COOLDOWN_MS` | `45000` | Budget alert cooldown |
| `ECONOMY.HISTORY_MAX_POINTS` | `64` | Max economy trend data points |
| `ECONOMY.HISTORY_MAX_AGE_MS` | `6h` | Max economy trend history age |
| `HEALTH.POLL_INTERVAL` | `10000` | Health check poll interval (ms) |
| `HEALTH.HISTORY_MAX_POINTS` | `64` | Max health history points |
| `HEALTH.HISTORY_MAX_AGE_MS` | `1h` | Max health history age |
| `HEALTH.P0_COOLDOWN_MS` | `60000` | P0 alert cooldown |
| `HEALTH.P1_COOLDOWN_MS` | `120000` | P1 alert cooldown |
| `PARTICLES.MAX` | `500` | Hard cap on particles |
| `PARTICLES.AMBIENT_TARGET` | `120` | Ambient background particles |
| `CAMERA.MIN_ZOOM` | `0.5` | Camera minimum zoom |
| `CAMERA.MAX_ZOOM` | `2.0` | Camera maximum zoom |

### CORS Allowed Origins

Configured in `tactical-map-server/middleware/cors.ts`:

```
http://localhost:8001
http://localhost:5174
http://localhost:5173
```

Add additional origins as needed for your deployment.

---

## SSL/TLS Setup

### Reverse Proxy (Recommended)

Use nginx or Caddy as a TLS-terminating reverse proxy:

```nginx
# /etc/nginx/sites-available/ventureos
server {
    listen 443 ssl http2;
    server_name ventureos.example.com;

    ssl_certificate     /etc/ssl/certs/ventureos.crt;
    ssl_certificate_key /etc/ssl/private/ventureos.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Tactical map
    location /map/ {
        proxy_pass http://127.0.0.1:8001/map/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /api/tactical-map/resources/stream {
        proxy_pass http://127.0.0.1:8001/api/tactical-map/resources/stream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }

    location /api/tactical-map/health/stream {
        proxy_pass http://127.0.0.1:8001/api/tactical-map/health/stream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name ventureos.example.com;
    return 301 https://$server_name$request_uri;
}
```

### Caddy (Simpler Alternative)

```
ventureos.example.com {
    reverse_proxy /map/* localhost:8001
    reverse_proxy /api/* localhost:8001
}
```

Caddy automatically provisions and renews TLS certificates via Let's Encrypt.

### WebSocket Notes

When behind a TLS proxy:
- Client automatically detects `wss:` vs `ws:` based on `location.protocol`
- Ensure proxy timeouts accommodate long-lived WebSocket connections (`proxy_read_timeout 86400s`)
- CSP policy allows `connect-src 'self'` which covers both WSS and HTTPS

---

## Monitoring & Logging

### What to Monitor

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Dashboard server uptime | Process manager / healthcheck | Down > 30s |
| API response time | Access logs | p95 > 2s |
| WebSocket connections | Connection count metric | Abnormal disconnect spike |
| Agent health status | `/api/tactical-map/health` *(Phase 5.6 — in progress)* | Any agent `red` for > 5min |
| Resource budget remaining | `/api/tactical-map/resources` | Pool < 15% remaining |
| Browser error rate | Console errors | Any increase |
| Memory usage | OS metrics | Dashboard process > 512MB |

### Server Logs

The dashboard server logs to:

| Log | Location | Format |
|-----|----------|--------|
| Access log | `LOG_DIR/tactical-map-access.log` | JSON lines |
| Auth events | Same access log | `{ ts, event, ip, method, path, userAgent, detail }` |
| Console | stdout/stderr | Plain text with `[TAG]` prefixes |

**Access log entry format:**
```json
{
  "ts": "2026-02-16T09:00:00.000Z",
  "event": "auth_success",
  "ip": "192.168.225.1",
  "method": "GET",
  "path": "/api/tactical-map/state",
  "userAgent": "Mozilla/5.0...",
  "detail": ""
}
```

### Client Console Tags

The tactical map client uses tagged console output:

| Tag | Meaning |
|-----|---------|
| `[tactical-map] api error` | REST API request failed |
| `[tactical-map] economy stream error` | Economy WebSocket error |
| `[tactical-map] health client error` | Health WebSocket error |
| `[tactical-map] health stream connected/disconnected` | Health WS lifecycle |
| `[tactical-map] budget alert` | Economy budget alert triggered |
| `[tactical-map] health alert` | Health threshold alert |
| `[tactical-map] health alert from server` | Server-pushed alert |
| `[tactical-map] bootstrap failed` | Fatal initialization error |

### Health Check Endpoint

For load balancers or monitoring tools:

```bash
# Simple health check — returns 200 if server is responding
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8001/api/tactical-map/state
```

---

## Backup & Recovery

### What to Back Up

| Data | Location | Frequency |
|------|----------|-----------|
| API token | `dashboard/data/.api-token` | On change (persistent) |
| Session data | `~/.openclaw/agents/*/sessions/` | Daily |
| RPG database | `RPG_DB_PATH` (SQLite) | Daily |
| KPI history | `KPI_DIR/*.json` | Daily |
| Observation data | `OBSERVATIONS_DIR/` | Daily |

### Backup Script

```bash
#!/bin/bash
# backup-ventureos.sh
BACKUP_DIR="/backups/ventureos/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# API token
cp -p dashboard/data/.api-token "$BACKUP_DIR/" 2>/dev/null

# Session data (incremental)
rsync -a ~/.openclaw/agents/ "$BACKUP_DIR/agents/"

# RPG database
sqlite3 "$RPG_DB_PATH" ".backup '$BACKUP_DIR/rpg.db'"

venture_strategy "Backup complete: $BACKUP_DIR"
```

### Recovery

```bash
# 1. Restore API token (or let it auto-generate)
cp /backups/ventureos/latest/.api-token dashboard/data/

# 2. Restore session data
rsync -a /backups/ventureos/latest/agents/ ~/.openclaw/agents/

# 3. Restart dashboard
sudo systemctl restart ventureos-dashboard

# 4. Verify
curl -s -H "Authorization: Bearer $(cat dashboard/data/.api-token)" \
  http://localhost:8001/api/tactical-map/state | jq .updatedAt
```

### Disaster Recovery

If the tactical map frontend is corrupted:
```bash
# Rebuild from source
cd tactical-map && npm ci && npm run build
# Dashboard will serve the fresh build immediately
```

If the dashboard server won't start:
```bash
# Check logs
journalctl -u ventureos-dashboard -n 50

# Common fixes:
# 1. Port conflict
lsof -i :8001
# 2. Missing dependencies
cd dashboard && npm ci
# 3. Permissions
ls -la dashboard/data/.api-token  # Should be 600
```

---

## Rollback

The tactical map is served as static assets from `tactical-map/dist` by the dashboard server. Rollback is a fast swap to a previous known‑good build.

### Bare Metal Rollback

1. Preserve the current build (optional):
   ```bash
   mv tactical-map/dist tactical-map/dist.bad-$(date +%Y%m%d%H%M%S)
   ```
2. Restore the previous build (from an archive or CI artifact):
   ```bash
   rsync -a --delete /path/to/known-good/dist/ tactical-map/dist/
   ```
3. Restart the dashboard server:
   ```bash
   sudo systemctl restart ventureos-dashboard
   ```
4. Verify:
   ```bash
   curl -f http://localhost:8001/map/ > /dev/null
   curl -f -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/tactical-map/state > /dev/null
   ```

### Docker Rollback

1. Re-deploy the last known‑good image tag (or digest).
2. Restart the container:
   ```bash
   docker compose up -d
   ```
3. Verify `/map/` and `/api/tactical-map/state` respond as expected.

### Artifact‑Based Rollback

Download the last successful `tactical-map-dist-<sha>` artifact from GitHub Actions and extract it into `tactical-map/dist`. This provides a clean rollback path without a full rebuild.

---

## Troubleshooting

### Common Issues

#### Map shows "Loading KPIs…" forever

**Cause:** API client can't reach the dashboard server.

**Fix:**
1. Verify the dashboard is running: `curl http://localhost:8001/api/tactical-map/state`
2. Check if auth token is configured in the browser: open DevTools → Application → Local Storage → look for `token`
3. Check CORS: the request origin must be in the allowed origins list

#### WebSocket keeps reconnecting

**Cause:** WebSocket connection drops repeatedly.

**Diagnosis:**
```javascript
// In browser console:
window.__TACTICAL_MAP__.economyClient.isConnected()
window.__TACTICAL_MAP__.healthClient.isConnected()
```

**Fix:**
1. Check if the server supports WebSocket upgrade
2. If behind a proxy, ensure it forwards `Upgrade` headers
3. Check `proxy_read_timeout` (must be long for WS)
4. The client will automatically fall back to polling

#### Buildings stuck in IDLE state

**Cause:** Map state API returning all agents as IDLE.

**Fix:**
1. Check server response: `curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/tactical-map/state | jq '.agents.venture_research.state'`
2. The state is derived from active sessions — verify agents have running sessions
3. In dev mode: `window.__TACTICAL_MAP__.setMapState({...})` to test manually

#### Economy panel shows "Realtime: reconnecting"

**Cause:** Economy WebSocket is disconnected.

**Fix:**
1. Verify the WebSocket endpoint exists on the server
2. Check for firewall rules blocking WebSocket
3. Client falls back to REST polling automatically — check for data updates

#### Health dashboard not visible

**Cause:** Dashboard is hidden by default.

**Fix:** Press **H** key to toggle the health dashboard panel.

#### High memory usage in browser

**Cause:** Possible particle system or history accumulation issue.

**Diagnosis:**
```javascript
// Check particle count
window.__TACTICAL_MAP__.app.stage.children.length
// Check store sizes
JSON.stringify(window.__TACTICAL_MAP__.healthStore.get()).length
```

**Fix:**
1. Particle count is hard-capped at 500 — should be safe
2. History arrays are bounded (64 points) — check if trimming is working
3. Try refreshing the page

#### Visual tests failing

**Cause:** Pixel differences in Playwright snapshot comparisons.

**Fix:**
```bash
# Update snapshots
npx playwright test --update-snapshots

# Check for non-determinism:
# - Ensure deterministic API mocks are enabled in visual E2E tests
# - Ensure visual reset hook is called before snapshot assertions
```

Deterministic visual harness requirements (CI):
1. Use `installDeterministicApiMocks(page)` before `page.goto(...)` in visual specs.
2. Use `stabilizeForVisualSnapshot(page)` before `toHaveScreenshot(...)`.
3. Keep snapshot fixtures generated from the same harness path as CI.

Debug helpers (browser console):
```javascript
window.__TACTICAL_MAP__.pause()
window.__TACTICAL_MAP__.resetVisualState()
window.__TACTICAL_MAP__.snapshot()
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **H** | Toggle health dashboard panel |
| **Home** | Reset camera to center |
| **Double-click** (on terrain) | Reset camera |
| **Mouse wheel** | Zoom in/out |
| **Click + drag** (on terrain) | Pan camera |

### Performance Troubleshooting

```javascript
// Check FPS in browser console
window.__TACTICAL_MAP__.app.ticker.FPS

// Pause/resume render loop
window.__TACTICAL_MAP__.pause()
window.__TACTICAL_MAP__.resume()

// Check draw stats
window.__TACTICAL_MAP__.economyStore.get()
```

If FPS drops below 30:
1. Check `PARTICLES.MAX` — reduce if needed
2. Check `BONDS.LINE_REDRAW_MS` — increase to reduce line geometry rebuilds
3. Check `ECONOMY.HEATMAP_REDRAW_MS` — increase to throttle heat map redraws
4. Verify GPU acceleration is enabled in the browser
