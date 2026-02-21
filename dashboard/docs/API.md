# Dashboard API Reference

Complete reference for all OpenClaw Dashboard HTTP endpoints.

**Base URL:** `http://<host>:<port>` (default: `http://localhost:8001`)

## Table of Contents

- [Authentication](#authentication)
- [KPI Endpoints](#kpi-endpoints)
- [Agent Health Endpoints](#agent-health-endpoints)
- [Observation Endpoints](#observation-endpoints)
- [VentureOS Integration Endpoints](#ventureos-integration-endpoints)
- [Session & Cost Endpoints](#session--cost-endpoints)
- [System Endpoints](#system-endpoints)
- [Action Endpoints](#action-endpoints)
- [Schemas](#schemas)

---

## Authentication

All `/api/*` endpoints require authentication (except `/api/login` and `/api/logout`).

By default there is **no LAN auth bypass**. `X-Forwarded-For` is ignored unless trusted-proxy mode is explicitly enabled.

### Methods (in priority order)

| Method | Format | Example |
|--------|--------|---------|
| Bearer token | `Authorization: Bearer <token>` | `curl -H "Authorization: Bearer abc123" ...` |
| HttpOnly cookie | Set via `/api/login` | Browser sessions |

### Token Management

The API token is auto-generated on first start and stored at `dashboard/data/.api-token` (mode `0600`). Override with the `DASHBOARD_API_TOKEN` environment variable.

### Proxy / Forwarded Header Trust

- `DASHBOARD_TRUST_PROXY=false` (default): use direct peer socket IP only.
- `DASHBOARD_TRUST_PROXY=true`: honor `X-Forwarded-For` only when peer IP is in `DASHBOARD_TRUSTED_PROXY_IPS`.

### Brute-Force Protection

- **Window:** 10 failures per IP within 5 minutes triggers a 15-minute block
- **LAN IPs:** Exempt from IP blocking (prevents self-DoS from misconfigured components)
- **Response:** `429 Too Many Requests` with JSON body

### `POST /api/login`

Exchange a token for an HttpOnly session cookie.

**Request:**
```json
{ "token": "<api-token>" }
```

**Content-Types:** `application/json`, `application/x-www-form-urlencoded`, or raw text.

**Response (200):**
```json
{ "ok": true }
```

**Response (401):**
```json
{ "ok": false, "error": "Unauthorized" }
```

**Cookie set:** `openclaw_dashboard_token=<token>; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`

### `POST /api/logout`

Clear the auth cookie.

**Response (200):**
```json
{ "ok": true }
```

---

## KPI Endpoints

KPI data is read from daily JSON files in the KPI directory (`$KPI_DIR`, default: `~/clawd/shared-context/kpis/`). Files are named `YYYY-MM-DD.json`.

### `GET /api/kpis/latest`

Returns the most recent KPI snapshot.

**Response (200):**
```json
{
  "latest": {
    "date": "2026-02-16",
    "overall": {
      "success_rate": 0.987,
      "latency_ms": {
        "p50": 12400,
        "p95": 34200,
        "p99": 58700
      },
      "handoff": { "success_rate": 0.95 },
      "backup": { "age_hours": 2.3 }
    },
    "slo": {
      "success_rate": 0.95,
      "p95_latency_s": 60,
      "backup_age_h": 24
    }
  },
  "file": "2026-02-16.json",
  "dir": "/Users/you/clawd/shared-context/kpis",
  "count": 14
}
```

**Notes:**
- Returns `{ "latest": null, ... }` if no KPI files exist
- The `count` field indicates total KPI files available

### `GET /api/kpis/history`

Returns KPI history over a configurable window.

**Parameters:**

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `days` | integer | `7` | 1–90 | Number of days of history |

**Example:** `GET /api/kpis/history?days=30`

**Response (200):**
```json
{
  "days": 30,
  "dir": "/Users/you/clawd/shared-context/kpis",
  "files": ["2026-01-17.json", "2026-01-18.json", "..."],
  "items": [
    {
      "date": "2026-01-17",
      "overall": {
        "success_rate": 0.98,
        "latency_ms": { "p50": 11000, "p95": 32000, "p99": 55000 }
      },
      "slo": { "success_rate": 0.95, "p95_latency_s": 60 }
    }
  ],
  "count": 30
}
```

---

## Agent Health Endpoints

### `GET /api/agent-health`

Returns health summary for all registered OpenClaw agents.

**Caching:** Response is cached for `AGENT_HEALTH_CACHE_TTL_MS` milliseconds (default: 15000, range: 1000–60000). Configure via environment variable.

**Response (200):**
```json
{
  "now": 1708070400000,
  "openclawDir": "/Users/you/.openclaw",
  "workspaceDir": "/Users/you/clawd",
  "lastActiveMs": 1708070390000,
  "workspace": {
    "bytes": 524288000,
    "bytesHuman": null
  },
  "openclaw": {
    "bytes": 1073741824,
    "bytesHuman": null
  },
  "agents": [
    {
      "agentId": "oracle",
      "sessionsDir": "/Users/you/.openclaw/agents/oracle/sessions",
      "sessionCount": 142,
      "abortedCount": 3,
      "successRate": 0.9789,
      "lastUpdatedAt": 1708070390000,
      "lastLabel": "Research task"
    }
  ]
}
```

**Agent Summary Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | string | Agent identifier (e.g., `oracle`, `atlas`) |
| `sessionCount` | integer | Total sessions for this agent |
| `abortedCount` | integer | Sessions that ended with abort/failure |
| `successRate` | number \| null | `(total - aborted) / total`, null if no sessions |
| `lastUpdatedAt` | integer | Unix timestamp (ms) of most recent session activity |
| `lastLabel` | string \| null | Human-readable label of the most recent session |

---

## Observation Endpoints

Observations are markdown and JSONL files in the observations directory (`$OBSERVATIONS_DIR`, default: `~/.openclaw/workspace-archivist/observations/`).

### `GET /api/observations/recent`

Returns recently modified observation files.

**Parameters:**

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `hours` | integer | `24` | 1–720 | Lookback window in hours |

**Limits:** Returns at most **200 files**.

**Example:** `GET /api/observations/recent?hours=48`

**Response (200):**
```json
{
  "hours": 48,
  "cutoff": 1708070400000,
  "dir": "/Users/you/.openclaw/workspace-archivist/observations",
  "count": 12,
  "items": [
    {
      "path": "2026-02-16.md",
      "type": "md",
      "date": "2026-02-16",
      "mtimeMs": 1708070400000,
      "size": 4096,
      "snippet": "## [09:30] Dashboard Migration Completed..."
    }
  ]
}
```

### `GET /api/observations/search`

Full-text search across all observation files.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | **Yes** | Search query (case-insensitive substring match) |

**Limits:** Returns at most **100 results**.

**Example:** `GET /api/observations/search?q=dashboard`

**Response (200):**
```json
{
  "q": "dashboard",
  "dir": "/Users/you/.openclaw/workspace-archivist/observations",
  "count": 5,
  "items": [
    {
      "path": "2026-02-16.md",
      "type": "md",
      "date": "2026-02-16",
      "mtimeMs": 1708070400000,
      "size": 4096,
      "match": "...completed the dashboard migration to the monorepo..."
    }
  ]
}
```

**Response (400) — Missing query:**
```json
{
  "error": "Missing q parameter",
  "dir": "/Users/you/.openclaw/workspace-archivist/observations",
  "count": 0,
  "items": []
}
```

---

## VentureOS Integration Endpoints

These endpoints aggregate data from across the VentureOS multi-agent system. All are cached for 5 seconds (`VENTUREOS_CACHE_TTL_MS`, configurable 1000–60000ms).

### `GET /api/ventureos-kpis`

Returns KPI data with SLO status evaluation and trend history.

**Parameters:**

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `days` | integer | `7` | 1–60 | History window |

**Response (200):**
```json
{
  "updatedAt": 1708070400000,
  "latest": {
    "date": "2026-02-16",
    "successRate": 0.987,
    "p95s": 34.2,
    "handoffSuccessRate": null,
    "backupAgeH": 2.3,
    "slo": { "success_rate": 0.95, "p95_latency_s": 60, "backup_age_h": 24 },
    "sloStatus": {
      "status": "ok",
      "emoji": "✅",
      "checks": [
        { "metric": "success_rate", "status": "ok", "value": 0.987, "target": 0.95 },
        { "metric": "p95_latency_s", "status": "ok", "value": 34.2, "target": 60 }
      ]
    }
  },
  "baseline": {
    "successRate": 0.983,
    "p95s": 35.1,
    "backupAgeH": 3.1
  },
  "history": [
    { "date": "2026-02-10", "successRate": 0.98, "p50s": 11.0, "p95s": 32.0, "p99s": 55.0, "backupAgeH": 4.0 }
  ]
}
```

### `GET /api/ventureos-agents`

Returns health and activity for all VentureOS agents.

**Response (200):**
```json
{
  "updatedAt": 1708070400000,
  "agentIds": ["oracle", "atlas", "sentinel", "verifier", "archivist", "synth"],
  "agents": {
    "oracle": {
      "agentId": "oracle",
      "status": "idle",
      "lastActivityMs": 1708070000000,
      "sessionCount": 142,
      "successRate": 0.978,
      "avgLatencyMs": 15000,
      "recentSessions": [
        {
          "label": "Research task",
          "sessionId": "abc-123",
          "updatedAt": 1708070000000,
          "aborted": false,
          "lastMessage": "Completed analysis of..."
        }
      ],
      "recentSessions24h": 8,
      "successRate24h": 1.0,
      "avgLatencySeconds24h": 15,
      "recentCompletions": []
    }
  }
}
```

**Agent status values:** `working` (active in last 2 min), `idle` (otherwise).

### `GET /api/mission-control`

Returns Mission Control overview: active work, priorities, team status, and recent completions.

**Response (200):**
```json
{
  "updatedAt": 1708070400000,
  "activeWorkMd": "## Active Work\n- Dashboard docs (#82)...",
  "prioritiesMd": "## Priorities\n1. Documentation...",
  "team": {
    "overall": "idle",
    "agents": [
      {
        "agentId": "oracle",
        "status": "idle",
        "lastActivityMs": 1708070000000,
        "successRate24h": 1.0,
        "recentSessions24h": 8,
        "avgLatencySeconds24h": 15
      }
    ]
  },
  "recentCompletions": [
    {
      "agentId": "archivist",
      "label": "Dashboard docs",
      "sessionId": "abc-123",
      "updatedAt": 1708070000000,
      "summary": "Completed documentation..."
    }
  ]
}
```

### `GET /api/workflow-patterns`

Returns workflow execution statistics (verify cycles, retries, success rates).

**Response (200):**
```json
{
  "updatedAt": 1708070400000,
  "totals": {
    "totalWorkflowRuns": 45,
    "successful": 42,
    "failed": 3,
    "successRate": 0.933,
    "avgVerifyCycles": 1.8,
    "maxVerifyCycles": 5,
    "avgRetries": 0.4,
    "maxRetries": 3
  },
  "perDay": [
    {
      "day": "2026-02-16",
      "runs": 6,
      "success": 5,
      "failure": 1,
      "avgVerifyCycles": 2.0,
      "maxVerifyCycles": 4,
      "avgRetries": 0.5
    }
  ]
}
```

### `GET /api/observations-index`

Returns the observation index with tag cloud and totals.

### `GET /api/observations`

Search/filter observations with pagination.

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Full-text search query |
| `tag` | string | — | Filter by tag (e.g., `#homekit`) |
| `topic` | string | — | Filter by topic |
| `limit` | integer | `30` | Results per page (1–200) |
| `offset` | integer | `0` | Pagination offset |

### `GET /api/ventureos-observation`

Returns content of a single observation file.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Filename (must match `YYYY-MM-DD.md`) |

---

## Session & Cost Endpoints

### `GET /api/sessions`

Returns all active sessions with metadata, costs, and last messages.

### `GET /api/costs`

Returns cost aggregation (today, week, total, per-model, per-day, per-session). Cached for 60 seconds.

### `GET /api/usage`

Returns 5-hour and weekly usage windows with burn rate predictions. Cached for 10 seconds.

### `GET /api/tokens-today`

Returns today's token usage breakdown by model.

### `GET /api/lifetime-stats`

Returns lifetime statistics (total tokens, messages, cost, sessions, days active). Cached for 5 minutes.

### `GET /api/session-messages`

Returns last 30 messages for a session.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Session ID |

### `GET /api/response-time`

Returns average response time in seconds for today's sessions.

---

## System Endpoints

### `GET /api/system`

Returns system resource stats (CPU, memory, disk) with disk history.

### `GET /api/crons`

Returns all cron jobs with schedule, status, and timing info.

### `GET /api/scheduler-jobs`

Returns unified scheduled jobs for Mission Control:
- OpenClaw cron jobs (`~/.openclaw/cron/jobs.json`)
- macOS LaunchAgents (Nexus/OpenClaw/VentureOS automation labels)

Each row includes:
- `label`
- `triggerTypes` + `triggerLabel`
- `nextRunAt` / `nextRunLabel`
- `lastRunAt`
- `lastExit` / `lastExitCode`
- `logPath` (when available)

### `GET /api/git`

Returns recent git commits (last 7 days) from tracked repositories.

### `GET /api/services`

Returns systemd service status for `openclaw`, `agent-dashboard`, `tailscaled`.

### `GET /api/memory`

Returns workspace memory file metadata (`MEMORY.md`, `HEARTBEAT.md`, daily logs).

### `GET /api/health-history`

Returns CPU/RAM snapshots (sampled every 5 minutes, up to 288 entries = 24 hours).

### `GET /api/config`

Returns dashboard configuration and capability inventory.

### `GET /api/live`

**Server-Sent Events (SSE)** stream of real-time session activity.

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event format:**
```json
{
  "timestamp": "2026-02-16T09:30:00.000Z",
  "session": "Research task",
  "role": "assistant",
  "content": "I found the relevant documentation..."
}
```

**Auth for SSE:** same as all API routes (Bearer header or HttpOnly cookie). Query-parameter token auth is disabled.

---

## Action Endpoints

All action endpoints require `POST` method.

Security guardrails:
- Disabled by default (`DASHBOARD_ENABLE_ACTIONS=false`)
- Loopback-only by default (`DASHBOARD_ACTIONS_LOCALHOST_ONLY=true`)
- Optional re-auth header (`DASHBOARD_ACTION_REAUTH=true` + `x-openclaw-action-token`)

| Endpoint | Description |
|----------|-------------|
| `POST /api/action/restart-openclaw` | Restart OpenClaw service |
| `POST /api/action/restart-dashboard` | Restart dashboard (2s delay) |
| `POST /api/action/clear-cache` | Clear all in-memory caches |
| `POST /api/action/restart-tailscale` | Restart Tailscale daemon |
| `POST /api/action/update-openclaw` | Run `npm update -g openclaw` |
| `POST /api/action/kill-tmux` | Kill all tmux sessions |
| `POST /api/action/gc` | Run `git gc` on tracked repos |
| `POST /api/action/check-update` | Check for OpenClaw updates |
| `POST /api/action/sys-update` | Run system package updates |
| `POST /api/action/disk-cleanup` | Autoremove + journal vacuum |
| `POST /api/action/restart-claude` | Restart Claude tmux session |

**Standard response:**
```json
{ "success": true }
```

**Error response:**
```json
{ "ok": false, "error": "Error message", "errorRef": "ERR_20260216_abc123" }
```

---

## Rate Limiting

Per-IP, per-endpoint sliding window rate limits:

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `/api/sessions` | 60 req | 60s |
| `/api/costs` | 60 req | 60s |
| `/api/usage` | 60 req | 60s |
| `/api/system` | 60 req | 60s |
| `/api/ventureos-agents` | 30 req | 60s |
| `/api/ventureos-kpis` | 30 req | 60s |
| `/api/rpg/*` | 20 req | 60s |
| `/api/replay` | 10 req | 60s |
| `/api/live` | 10 req | 60s |

**Response headers (all rate-limited endpoints):**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 42
```

**Rate-limited response (429):**
```json
{
  "ok": false,
  "error": "Rate limit exceeded",
  "retryAfterMs": 42000
}
```

---

## Schemas

### KPI File Schema (`YYYY-MM-DD.json`)

```json
{
  "date": "2026-02-16",
  "overall": {
    "success_rate": 0.987,
    "latency_ms": {
      "p50": 12400,
      "p95": 34200,
      "p99": 58700
    },
    "handoff": {
      "success_rate": 0.95
    },
    "backup": {
      "age_hours": 2.3
    }
  },
  "slo": {
    "success_rate": 0.95,
    "p95_latency_s": 60,
    "backup_age_h": 24
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | ISO date (`YYYY-MM-DD`) |
| `overall.success_rate` | number | 0–1 ratio of successful operations |
| `overall.latency_ms.p50` | number | 50th percentile latency in ms |
| `overall.latency_ms.p95` | number | 95th percentile latency in ms |
| `overall.latency_ms.p99` | number | 99th percentile latency in ms |
| `overall.handoff.success_rate` | number | Agent handoff success ratio |
| `overall.backup.age_hours` | number | Hours since last successful backup |
| `slo.success_rate` | number | SLO target for success rate |
| `slo.p95_latency_s` | number | SLO target for p95 latency (seconds) |
| `slo.backup_age_h` | number | SLO target for max backup age (hours) |

### Observation Index Schema (`index.json`)

```json
{
  "dates": {
    "2026-02-16": {
      "topics": ["dashboard", "migration"],
      "tags": ["#infrastructure", "#documentation"]
    }
  },
  "tags": {
    "#infrastructure": ["2026-02-16", "2026-02-15"],
    "#documentation": ["2026-02-16"]
  },
  "topics": {
    "dashboard": ["2026-02-16", "2026-02-14"],
    "migration": ["2026-02-16"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `dates` | object | Per-date metadata (topics, tags) |
| `tags` | object | Tag → list of dates mapping |
| `topics` | object | Topic → list of dates mapping |

### SLO Status Schema

```json
{
  "status": "ok",
  "emoji": "✅",
  "checks": [
    {
      "metric": "success_rate",
      "status": "ok",
      "value": 0.987,
      "target": 0.95
    }
  ]
}
```

**Status values:** `ok`, `warn`, `bad`

**Thresholds:**
- `success_rate`: bad if below SLO target, warn if within 1% of target
- `p95_latency_s`: bad if above target, warn if above 80% of target
- `backup_age_h`: bad if above target, warn if above 80% of target

---

## Security Headers

All responses include:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

### CORS

Allowed origins (configurable in `middleware/cors.ts`):
- `http://192.168.225.149:7001`
- `http://192.168.225.149:7000`
- `http://localhost:7001`
- `http://localhost:7000`
- `http://localhost:5173` (Vite dev server)

---

## Error Handling

All error responses follow a consistent format:

```json
{
  "ok": false,
  "error": "Human-readable error message",
  "errorRef": "ERR_20260216_abc123"
}
```

The `errorRef` is generated by the shared `lib/error-handler.ts` and can be used for log correlation.
