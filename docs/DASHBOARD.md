# Dashboard — VentureOS Integration Guide

How the OpenClaw Dashboard integrates with the VentureOS multi-agent system.

## Overview

The dashboard is a read-only monitoring layer that surfaces data from across the VentureOS stack:

```
┌──────────────────────────────────────────────────────┐
│                   Dashboard UI                        │
│         http://localhost:8001                         │
├──────────┬──────────┬──────────┬─────────────────────┤
│ KPIs     │ Agents   │ Sessions │ Observations        │
├──────────┴──────────┴──────────┴─────────────────────┤
│               Dashboard Server                        │
│     Node.js HTTP server (dashboard/server/)           │
├──────────┬──────────┬──────────┬─────────────────────┤
│ KPI JSON │ Agent    │ Session  │ Observation          │
│ files    │ sessions │ JSONL    │ markdown             │
├──────────┴──────────┴──────────┴─────────────────────┤
│            Shared Filesystem (lib/paths.ts)           │
│                                                       │
│  ~/clawd/shared-context/kpis/    ← KPI snapshots     │
│  ~/.openclaw/agents/*/sessions/  ← Agent sessions    │
│  ~/.openclaw/workspace-*/        ← Agent workspaces  │
│  ~/.openclaw/workspace-archivist/observations/        │
│  ~/clawd/shared-context/         ← Active work/prios │
└──────────────────────────────────────────────────────┘
```

## How It Fits in the Monorepo

```
ventureos/
├── lib/               # Shared libraries
│   ├── paths.ts       # Centralized path resolution (used by dashboard)
│   └── error-handler.ts
├── dashboard/         # ← The dashboard
│   ├── server/        # API server
│   ├── client/        # Frontend
│   └── docs/API.md    # API reference
├── tactical-map/      # Served by dashboard at /map/
├── scripts/           # Ops scripts (produce KPI data the dashboard reads)
├── config/            # Shared configuration
└── docs/              # ← This file
```

### Shared Library Integration (Issue #79)

The dashboard imports from `lib/` for consistency:

```typescript
// All data paths flow through lib/paths.ts
import { KPI_DIR, OBSERVATIONS_DIR, OPENCLAW_DIR } from '../../lib/paths.js';

// Error responses use shared handler
import { toSafeError } from '../../lib/error-handler.js';
```

This ensures the dashboard reads the same paths as all other VentureOS components, regardless of environment variable overrides.

## Data Flow

### KPIs

```
Cron job (daily) → writes ~/clawd/shared-context/kpis/YYYY-MM-DD.json
                                    ↓
Dashboard reads ← GET /api/kpis/latest
                ← GET /api/kpis/history?days=N
                ← GET /api/ventureos-kpis?days=N  (with SLO evaluation)
```

KPI files are JSON snapshots produced by scheduled scripts. The dashboard reads them directly from disk — no database, no queue. The `ventureos-kpis` endpoint adds SLO status evaluation on top.

**SLO evaluation logic:**
- `success_rate` below target → `bad`, within 1% → `warn`
- `p95_latency_s` above target → `bad`, above 80% → `warn`
- `backup_age_h` above target → `bad`, above 80% → `warn`

### Agent Health

```
OpenClaw runtime → writes ~/.openclaw/agents/*/sessions/sessions.json
                                    ↓
Dashboard reads  ← GET /api/agent-health       (all agents summary)
                 ← GET /api/ventureos-agents   (detailed per-agent metrics)
```

The dashboard scans each agent's sessions directory for:
- **Session count** and **abort rate** from `sessions.json`
- **Average latency** by parsing JSONL files (user→assistant timestamp deltas)
- **Status**: `working` if active in last 2 minutes, `idle` otherwise

**Monitored agents** (configurable via `VENTUREOS_AGENTS`):
`oracle`, `atlas`, `sentinel`, `verifier`, `archivist`, `synth`

### Observations

```
Archivist agent → writes observations/YYYY-MM-DD.md + index.json
                                    ↓
Dashboard reads ← GET /api/observations/recent?hours=N
                ← GET /api/observations/search?q=term
                ← GET /api/observations         (paginated search/filter)
                ← GET /api/observations-index   (tags + topics)
```

Observations are structured markdown files with a specific format:

```markdown
## [09:30] Dashboard Migration Completed
**Context**: Issue #76 merge
**Action**: Migrated server code to TypeScript
**Outcome**: All tests passing
**Tags**: #infrastructure #dashboard
```

The `index.json` provides pre-computed tag→date and topic→date mappings for fast filtering.

### Mission Control

```
Shared context  → ~/clawd/shared-context/active-work.md
                  ~/clawd/shared-context/priorities.md
Agent sessions  → ~/.openclaw/agents/*/sessions/
                                    ↓
Dashboard reads ← GET /api/mission-control
```

Aggregates:
- Active work and priorities markdown
- Team status (busy/idle based on agent activity)
- Recent completions across all agents

### Workflow Patterns

```
Antfarm validation → /tmp/agent-*/antfarm-validation.jsonl
                                    ↓
Dashboard reads    ← GET /api/workflow-patterns
```

Parses workflow event logs to extract:
- Workflow run success/failure rates
- Verify cycle counts
- Spawn retry counts
- Daily aggregations

## Caching Strategy

The dashboard uses tiered in-memory caching to avoid hammering the filesystem:

| Data | Cache TTL | Configurable |
|------|-----------|--------------|
| Agent health | 15s | `AGENT_HEALTH_CACHE_TTL_MS` |
| VentureOS data (agents, KPIs, observations) | 5s | `VENTUREOS_CACHE_TTL_MS` |
| Usage windows | 10s | No |
| Cost data | 60s | No |
| Lifetime stats | 300s | No |
| Session cost index | 60s | No |

All caches are invalidated via `POST /api/action/clear-cache`.

## Security Model

### Authentication

- **LAN bypass**: Private IPs skip auth (designed for home/office LAN deployment)
- **Remote**: Pre-shared token via Bearer header or HttpOnly cookie
- **Brute-force**: 10 failures in 5 min → 15 min IP block (LAN exempt)

### Middleware Pipeline

Every request passes through (in order):
1. **Security headers** — CSP, X-Frame-Options, nosniff
2. **CORS** — Strict origin whitelist (no wildcard)
3. **Preflight** — OPTIONS handled
4. **Auth** — Token validation or LAN bypass
5. **Rate limit** — Per-IP, per-endpoint sliding windows

### Audit Logging

Auth events (login, failure, brute-force) are logged to `~/clawd/logs/tactical-map-access.log` in JSONL format.

## Tactical Map Integration

The dashboard serves the Tactical Map as static files:

```
GET /map/* → ventureos/tactical-map/dist/*
```

The Tactical Map consumes the same dashboard API endpoints:
- `/api/ventureos-agents` for unit positions/status
- `/api/ventureos-kpis` for building indicators
- `/api/rpg/stats` for agent performance attributes
- `/api/rpg/affinity-network` for bond visualizations

## RPG System Integration

Dashboard provides RPG API endpoints that connect to the VentureOS RPG SQLite database:

```
Dashboard ← /api/rpg/stats          → VentureOS RPG DB (SQLite)
          ← /api/rpg/affinity-network
          ← /api/rpg/conversations
```

These are thin wrappers that query the RPG database at `VENTUREOS_RPG_DB` (default: `~/clawd/agents/ventureos-rpg.db`).

## Adding New Dashboard Panels

To add a new data source to the dashboard:

1. **Data producer**: Write a cron job or agent task that outputs structured data to a known path
2. **Path registration**: Add the path to `lib/paths.ts` so all components agree on the location
3. **Route handler**: Create a new file in `dashboard/server/routes/` following the dependency injection pattern:

```typescript
// dashboard/server/routes/my-data.ts
import type { IncomingMessage, ServerResponse } from 'node:http';

interface MyDataDeps {
  dataDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
}

export function handleMyData(req: IncomingMessage, res: ServerResponse, deps: MyDataDeps): boolean {
  if (req.url !== '/api/my-data') return false;
  // Read from deps.dataDir, return JSON
  deps.sendJson(res, { hello: 'world' });
  return true;
}
```

4. **Wire it up**: Add the route call in `server.ts`'s request handler
5. **Rate limit**: Add an entry to `LIMITS` in `middleware/rate-limit.ts`
6. **Document**: Update `docs/API.md` with the new endpoint

## Monitoring the Dashboard Itself

```bash
# macOS
launchctl list | grep openclaw

# Linux
sudo systemctl status agent-dashboard
journalctl -u agent-dashboard -f

# Health check
curl http://localhost:8001/api/config

# Auth check (from LAN — should work without token)
curl http://localhost:8001/api/system | jq .cpu

# Auth check (remote — needs token)
curl -H "Authorization: Bearer $(cat dashboard/data/.api-token)" \
  http://your-host:8001/api/system | jq .cpu
```

## Related

- **[dashboard/README.md](../dashboard/README.md)** — Quick start, build, deployment
- **[dashboard/docs/API.md](../dashboard/docs/API.md)** — Complete API reference
- **[docs/ARCHITECTURE.md](ARCHITECTURE.md)** — System architecture
- **[docs/RPG_SYSTEM.md](RPG_SYSTEM.md)** — performance overlay system
