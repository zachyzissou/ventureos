# Dashboard Migration Guide

> **Migration:** `openclaw-dashboard` → `ventureos/dashboard/`  
> **Decision Record:** [ADR-001](./decisions/001-merge-dashboard-into-monorepo.md)  
> **Status:** Planning

---

## Overview

The OpenClaw dashboard is being merged into the VentureOS monorepo. This guide covers the new structure, build commands, development workflow, and deployment procedures.

## New Repository Structure

```
ventureos/
├── dashboard/                    # Dashboard package
│   ├── server/
│   │   ├── server.ts             # Main HTTP server (was server.js)
│   │   ├── config.ts             # Configuration (was server/config.js)
│   │   ├── routes/
│   │   │   ├── index.ts          # Route registry
│   │   │   ├── kpis.ts           # KPI endpoints
│   │   │   ├── observations.ts   # Observation search/recent
│   │   │   └── agent-health.ts   # Agent health with caching
│   │   └── middleware/
│   │       ├── auth.ts           # Cookie auth + token
│   │       ├── cors.ts           # CORS headers
│   │       ├── rate-limit.ts     # IP-based rate limiting
│   │       ├── security-headers.ts
│   │       └── audit-log.ts      # Request audit trail
│   ├── client/
│   │   ├── index.html            # Main dashboard UI
│   │   └── login.html            # Login page
│   ├── tests/
│   │   ├── auth-cookie.test.ts   # Auth tests (was .js)
│   │   ├── routes.test.ts        # Route handler tests (new)
│   │   └── integration.test.ts   # VentureOS integration tests (new)
│   ├── scripts/
│   │   ├── install.sh            # Installer (updated paths)
│   │   └── install-macos.sh      # macOS launchd installer (new)
│   ├── examples/
│   │   ├── launchd.plist         # macOS service template
│   │   └── systemd.service       # Linux service template
│   ├── docs/
│   │   └── screenshots/          # UI screenshots
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── lib/                          # Shared TypeScript libraries
│   ├── error-handler.ts          # ← dashboard can now import directly
│   ├── rate-limiter.ts           # ← shared rate limiting
│   └── ...
├── tactical-map/                 # Tactical Map (existing)
├── tactical-map-server/          # Tactical Map server (existing)
├── package.json                  # Root workspace
└── tsconfig.json                 # Root TS config
```

## Development Workflow

### Prerequisites

- Node.js v18+ (v20 recommended)
- TypeScript 5.5+
- Git

### Getting Started

```bash
# Clone (if fresh)
git clone https://github.com/zachyzissou/ventureos.git
cd ventureos

# Install all dependencies (root + packages)
npm install

# Install dashboard dependencies
cd dashboard && npm install && cd ..
```

### Running the Dashboard

```bash
# Development mode (auto-restart on changes)
cd dashboard
npm run dev

# Production mode
npm run start

# From root
npm run dashboard:dev
npm run dashboard:start
```

### Build Commands

```bash
# Type-check only (no emit)
npm run build           # Root: checks all packages
cd dashboard && npm run build  # Dashboard only

# Full build (compile TS → JS)
cd dashboard && npm run compile

# Run tests
cd dashboard && npm test

# Run E2E tests
cd dashboard && npm run test:e2e

# Lint
cd dashboard && npm run lint
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_PORT` | `8001` | HTTP listen port |
| `DASHBOARD_HOST` | `0.0.0.0` | Bind address |
| `OPENCLAW_DIR` | `~/.openclaw` | OpenClaw config directory |
| `WORKSPACE_DIR` | `cwd` | Agent workspace root |
| `OPENCLAW_AGENT` | `main` | Agent ID for session lookup |
| `DASHBOARD_TOKEN` | (none) | Auth token for API access |
| `AGENT_HEALTH_CACHE_TTL_MS` | `15000` | Health endpoint cache TTL (1000-60000) |
| `VENTUREOS_RPG_ROOT` | `~/clawd/ventureos-rpg` | RPG system root (legacy — will be local after merge) |
| `VENTUREOS_RPG_DB` | `~/clawd/agents/ventureos-rpg.db` | RPG SQLite database path |

### Key Changes from Standalone

| Before (standalone) | After (monorepo) |
|---------------------|-------------------|
| `require('./server/routes/kpis')` | `import { kpisRouter } from './routes/kpis'` |
| `require(path.join(VENTUREOS_RPG_ROOT, 'api', 'rpg-http'))` | `import { rpgRouter } from '../../lib/rpg-http'` (or local) |
| Plain JS, no types | TypeScript with `strict: true` |
| Standalone `node server.js` | `npm run start` with compiled output |
| No shared code | Direct imports from `../lib/*` |
| Separate git history | Monorepo with shared commits |

## TypeScript Migration Notes

### File Conversions

All `.js` files are converted to `.ts` with proper typing:

```typescript
// Before (server.js)
const PORT = parseInt(process.env.DASHBOARD_PORT || '8001');
let kpisRoute = null;
try { kpisRoute = require('./server/routes/kpis'); } catch {}

// After (server.ts)
const PORT: number = parseInt(process.env.DASHBOARD_PORT || '8001');

import { kpisRouter } from './routes/kpis';
// No more try/catch — it's a local import, guaranteed available
```

### Dashboard tsconfig.json

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./server",
    "declaration": true
  },
  "include": ["server/**/*.ts"],
  "exclude": ["tests/**/*", "node_modules"]
}
```

### Shared Type Imports

```typescript
// Import shared types from lib/
import type { ErrorResponse } from '../lib/error-handler';
import type { RateLimitConfig } from '../lib/rate-limiter';
```

## API Endpoints

All existing endpoints remain unchanged. No breaking API changes.

### Core Endpoints (unchanged)
- `GET /api/config` — Dashboard configuration
- `GET /api/sessions` — Agent session list
- `GET /api/usage` — Token usage statistics
- `GET /api/costs` — Cost tracking
- `GET /api/system` — System information
- `GET /api/session-messages?session=<id>` — Session transcript
- `GET /api/crons` — Cron job list
- `GET /api/memory-files` — Memory file list
- `GET /api/memory-file?name=<file>` — Memory file content
- `GET /api/logs` — Server logs
- `GET /api/live-feed` — SSE event stream

### VentureOS Endpoints (unchanged)
- `GET /api/ventureos-kpis?days=7` — VentureOS KPI data
- `GET /api/ventureos-agents` — Agent status overview
- `GET /api/ventureos-workflow-patterns` — Workflow analytics
- `GET /api/ventureos-mission-control` — Mission status
- `GET /api/ventureos-observations` — Observation feed

### KPI/Health Endpoints (unchanged)
- `GET /api/kpis/latest` — Latest KPI snapshot
- `GET /api/kpis/history?days=N` — KPI history (1-90 days)
- `GET /api/agent-health` — Agent health with 15s cache
- `GET /api/observations/recent?hours=N` — Recent observations (1-720h)
- `GET /api/observations/search?q=term` — Observation search

### RPG API Endpoints (now local imports)
- `GET /api/rpg/*` — RPG system HTTP API
- `GET /api/conversation/*` — Conversation engine HTTP API

## Deployment

### macOS (launchd)

```bash
# Install/update
cd ventureos/dashboard
./scripts/install-macos.sh

# Or manually:
cp examples/launchd.plist ~/Library/LaunchAgents/com.ventureos.dashboard.plist
# Edit plist: update WorkingDirectory to ventureos/dashboard
launchctl load ~/Library/LaunchAgents/com.ventureos.dashboard.plist
launchctl start com.ventureos.dashboard
```

**Migration from old plist:**
```bash
# Stop old service
launchctl stop com.openclaw.dashboard
launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.plist

# Install new service
launchctl load ~/Library/LaunchAgents/com.ventureos.dashboard.plist
launchctl start com.ventureos.dashboard

# Verify
curl http://localhost:8001/api/config
```

### Linux (systemd)

```bash
# Install/update
cd ventureos/dashboard
sudo ./scripts/install.sh

# Or manually:
sudo cp examples/systemd.service /etc/systemd/system/ventureos-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable ventureos-dashboard
sudo systemctl start ventureos-dashboard
```

**Migration from old service:**
```bash
# Stop old service
sudo systemctl stop openclaw-dashboard
sudo systemctl disable openclaw-dashboard

# Install new service
sudo systemctl enable ventureos-dashboard
sudo systemctl start ventureos-dashboard

# Verify
curl http://localhost:8001/api/config
```

### Rollback Procedure

If the merged dashboard has issues:

1. **Immediate rollback** (< 5 minutes):
   ```bash
   # Stop new dashboard
   launchctl stop com.ventureos.dashboard  # macOS
   # sudo systemctl stop ventureos-dashboard  # Linux

   # Restart old dashboard
   cd ~/clawd/openclaw-dashboard
   node server.js &
   ```

2. **Full rollback** (< 15 minutes):
   ```bash
   # Re-enable old service
   launchctl load ~/Library/LaunchAgents/com.openclaw.dashboard.plist
   launchctl start com.openclaw.dashboard
   ```

3. **Parallel operation** (recommended during migration):
   ```bash
   # Old dashboard on port 8001
   DASHBOARD_PORT=8001 node ~/clawd/openclaw-dashboard/server.js &

   # New dashboard on port 8002 for testing
   cd ~/clawd/ventureos/dashboard
   DASHBOARD_PORT=8002 npm run start &

   # Compare responses
   diff <(curl -s localhost:8001/api/config) <(curl -s localhost:8002/api/config)
   ```

## Testing the Migration

### Smoke Tests

```bash
cd ventureos/dashboard

# 1. TypeScript compiles
npm run build

# 2. All tests pass
npm test

# 3. Server starts
npm run start &
sleep 2

# 4. Core endpoints respond
curl -s localhost:8001/api/config | jq .
curl -s localhost:8001/api/sessions | jq .status
curl -s localhost:8001/api/system | jq .

# 5. VentureOS endpoints respond
curl -s localhost:8001/api/kpis/latest | jq .
curl -s localhost:8001/api/agent-health | jq .
curl -s localhost:8001/api/observations/recent?hours=1 | jq .

# 6. Static files serve
curl -s localhost:8001/ | head -5   # Should return HTML
```

### Integration Tests

```bash
# E2E tests with Playwright
npm run test:e2e

# Response parity test (requires old dashboard running on 8002)
./scripts/test-parity.sh 8001 8002
```

## FAQ

**Q: Will the dashboard URL change?**  
A: No. Same port, same endpoints. Only the server's file location changes.

**Q: Do I need to update my OpenClaw config?**  
A: Only if you have hardcoded paths to `~/clawd/openclaw-dashboard`. The dashboard reads from `OPENCLAW_DIR` and `WORKSPACE_DIR`, which don't change.

**Q: What happens to the old `openclaw-dashboard` repo?**  
A: It will be archived (read-only) with a notice pointing to `ventureos/dashboard/`.

**Q: Can I still run the dashboard standalone?**  
A: During the transition, yes. After migration is complete, the monorepo version is the canonical source.

**Q: What about the RPG database?**  
A: The SQLite database path (`VENTUREOS_RPG_DB`) doesn't change. Only the code that reads it moves into the monorepo.
