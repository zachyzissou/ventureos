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
- [Task Board Endpoints](#task-board-endpoints)
- [Model Routing Security Endpoints](#model-routing-security-endpoints)
- [Token Compaction Endpoints](#token-compaction-endpoints)
- [Self-Improvement Endpoints](#self-improvement-endpoints)
- [Code Factory Endpoints](#code-factory-endpoints)
- [WebMCP Endpoints](#webmcp-endpoints)
- [Visual Explainer Endpoints](#visual-explainer-endpoints)
- [Proposal Lifecycle Endpoints](#proposal-lifecycle-endpoints)
- [Living Files Endpoints](#living-files-endpoints)
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
  "latestMtimeMs": 1760630400000,
  "dir": "/Users/you/clawd/shared-context/kpis",
  "count": 14
}
```

**Notes:**
- Returns `{ "latest": null, ... }` if no KPI files exist
- The `count` field indicates total KPI files available
- `latestMtimeMs` is the modification timestamp (epoch ms) of the returned `file`, `0` when unavailable

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

### `GET /api/openclaw-local-readiness`

Returns the latest local smoke-readiness artifact summary used by Mission Control.

Response highlights:
- `available`: `false` when no smoke artifacts exist yet
- `latest.summary`: verdict (`go|hold|blocked`), readiness score, confidence, and counts
- `latest.blockers`: top 3 failed checks with likely cause + next command
- `latest.checksByGroup`: pass/fail/skipped rollup by check group
- `latest.artifacts`: latest JSON/MD/SVG artifact names (no absolute paths)

### `GET /api/git`

Returns recent git commits (last 7 days) from tracked repositories.

### `GET /api/services`

Returns service status for `openclaw`, `agent-dashboard`, `tailscaled` using platform-aware checks:
- Linux: `systemctl is-active`
- macOS: `openclaw gateway status`, `launchctl list`, `tailscale status`

### `GET /api/memory`

Returns workspace memory file metadata (`MEMORY.md`, `HEARTBEAT.md`, daily logs).

### `GET /api/health-history`

Returns CPU/RAM snapshots (sampled every 5 minutes, up to 288 entries = 24 hours).

### `GET /api/config`

Returns dashboard configuration and capability inventory.

Also includes Overview freshness thresholds consumed by the Overview cards:

```json
{
  "overviewFreshnessThresholdsMs": {
    "kpi": { "freshMs": 129600000, "staleMs": 345600000 },
    "agentHealth": { "freshMs": 900000, "staleMs": 7200000 },
    "observations": { "freshMs": 21600000, "staleMs": 86400000 }
  },
  "overviewFreshnessTimelineLimit": 8,
  "overviewFreshnessEventDedupeWindowMs": 30000
}
```

Environment overrides:
- `DASHBOARD_OVERVIEW_FRESHNESS_KPI_FRESH_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_KPI_STALE_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_FRESH_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_STALE_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_FRESH_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_STALE_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_TIMELINE_LIMIT`
- `DASHBOARD_OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS`

### `GET /api/overview-freshness-events?limit=8`

Returns newest-first Overview freshness transition history from
`data/overview-freshness-events.jsonl`.

**Response (200):**
```json
{
  "ok": true,
  "limit": 8,
  "dedupeWindowMs": 30000,
  "events": [
    {
      "state": "fresh",
      "stale": 0,
      "aging": 0,
      "unavailable": 0,
      "total": 3,
      "source": "overview-widget",
      "emittedAt": 1700000002000,
      "receivedAt": 1700000002300
    }
  ]
}
```

### `POST /api/overview-freshness-event`

Ingests stale/aging/freshness state transitions from the Overview UI and appends them to
`data/overview-freshness-events.jsonl` for local auditing.

Duplicate events (same state/count/source tuple) are suppressed within
`DASHBOARD_OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS` to reduce multi-tab noise.

**Request:**
```json
{
  "state": "stale",
  "stale": 1,
  "aging": 0,
  "unavailable": 0,
  "total": 3,
  "source": "overview-widget",
  "emittedAt": 1700000000000
}
```

**Response (200):**
```json
{
  "ok": true,
  "state": "stale",
  "recordedAt": 1700000000300,
  "accepted": true,
  "dedupeWindowMs": 30000,
  "duplicateOfReceivedAt": null
}
```

**Error (400):**
```json
{ "ok": false, "error": "Invalid freshness event payload" }
```

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

### Replay Authority Endpoints

### `GET /api/replay/explain?sessionId=<id>&limit=200&offset=0`

Returns replay-only route/verdict/arbitration timeline and derived explanation text for one session.

Response shape:
```json
{
  "ok": true,
  "sessionId": "replay-123",
  "explanation": "Route event: ... Verdict event: ... Arbitration event: ...",
  "timeline": [
    { "sessionId": "replay-123", "ts": 1700000000000, "type": "route.evaluated", "missionId": "m-1", "summary": "..." }
  ],
  "totalCount": 3,
  "limit": 200,
  "offset": 0
}
```

### `GET /api/replay/control-health?sessionId=<id>`

Returns control-health summary for one replay session.

### `GET /api/replay/control-health?sessionLimit=20`

Returns aggregated control-health summary across recent replay sessions.
If no sessions exist, returns `status: "no-data"` with `health: null`.

Response shape:
```json
{
  "ok": true,
  "scope": "session",
  "sessionIds": ["replay-123"],
  "health": {
    "status": "healthy",
    "counts": {
      "routeDecisions": 4,
      "verdicts": 4,
      "arbitrationAccepted": 3,
      "arbitrationRejected": 1,
      "contractFailures": 0
    },
    "arbitrationResolutionRate": 0.75,
    "incidents": [],
    "evaluatedEventCount": 9
  },
  "updatedAt": 1700000000000
}
```

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
| `POST /api/action/restart-dashboard` | Restart dashboard service |
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

## Task Board Endpoints

Mission Control Kanban APIs (Issue #219). Task-board data is file-backed under `dashboard/data/task-board*.json`.

### `POST /api/task-board/heartbeat/pickup`

Heartbeat-driven queue pickup for agent workers.

**Request:**
```json
{
  "agentId": "oracle",
  "limit": 1,
  "allowParallel": false
}
```

**Routing rules:**
- Candidate cards must be `status=queued` and `assigneeType=agent`.
- Assignment must match `agentId` (`assigneeId`/`agentId`) unless unassigned.
- Priority sort: `critical` → `high` → `medium` → `low`, then oldest queued.
- Dependency gate: all `dependencies[]` must reference cards currently in `done`.
- If `allowParallel=false`, pickup is skipped when the agent already has running work.

**Response (200):**
```json
{
  "agentId": "oracle",
  "pickedCount": 1,
  "existingRunning": 0,
  "scannedQueued": 3,
  "skipped": {
    "nonAgentAssignee": 0,
    "assignedToOther": 1,
    "unmetDependencies": 1
  },
  "picked": [
    { "id": "task-123", "status": "running" }
  ]
}
```

### `POST /api/task-board/:id/retry`

Manual retry endpoint for failed cards.

**Request (optional):**
```json
{
  "note": "retry after dependency fix"
}
```

**Behavior:**
- Only allowed when the current card state is `failed` (otherwise HTTP `409`).
- Resets terminal fields (`startedAt`, `completedAt`, `resultSummary`, `tokensUsed`, `error`, `costEstimate`, `runtimeMs`).
- Moves card back to `queued` and appends a `statusHistory` entry with `by=retry`.

**Response (200):**
```json
{
  "card": {
    "id": "task-123",
    "status": "queued",
    "error": null
  }
}
```

### `GET /api/task-board/active`

Returns the current `memory/active-tasks.md` snapshot plus stale-task detection.

**Query params:**
- `staleAfterMs` (optional) — threshold for stale detection (default 30m, max 24h)

**Response (200):**
```json
{
  "snapshot": {
    "updatedAt": "2026-02-21T09:00:00.000Z",
    "active": [
      {
        "taskId": "task-123",
        "status": "RUNNING",
        "assigneeId": "oracle",
        "startedAt": "2026-02-21T08:45:00.000Z",
        "updatedAt": "2026-02-21T08:59:00.000Z"
      }
    ],
    "completed": []
  },
  "staleAfterMs": 1800000,
  "staleCount": 0,
  "stale": []
}
```

### `POST /api/task-board/recovery/resume`

Requeues running tasks found in the active-task snapshot. Used for crash/restart recovery.

**Request (optional):**
```json
{
  "agentId": "oracle",
  "limit": 20
}
```

**Response (200):**
```json
{
  "resumedCount": 2,
  "resumedIds": ["task-123", "task-456"],
  "consideredRunning": 3
}
```

---

## Model Routing Security Endpoints

Security-aware model routing telemetry (Issue #224).

### `GET /api/model-routing/security`

Returns usage breakdown + estimated savings from in-memory routing telemetry.

**Query params:**
- `limit` (optional, `1..1000`) — max telemetry entries included in summary window

**Response (200):**
```json
{
  "summary": {
    "updatedAt": "2026-02-21T09:00:00.000Z",
    "windowSize": 120,
    "riskCounts": { "low": 84, "medium": 22, "high": 14 },
    "tierCounts": { "tier1": 80, "tier2": 26, "tier3": 14 },
    "modelUsage": { "gpt-4o-mini": 62, "claude-sonnet": 26, "claude-opus": 14 },
    "injectionDetections": 6,
    "estimatedCostUsd": 0.9421,
    "baselineCostUsd": 2.3115,
    "estimatedSavingsUsd": 1.3694,
    "estimatedSavingsPct": 59.24
  },
  "integrations": {
    "source": "model-router",
    "dashboardReady": true
  }
}
```

### `GET /api/model-routing/security/injections`

Returns recent prompt-injection detection routing events.

**Query params:**
- `limit` (optional, `1..1000`) — max event count

**Response (200):**
```json
{
  "updatedAt": 1700000000000,
  "total": 2,
  "events": [
    {
      "detectedAt": "2026-02-21T09:00:00.000Z",
      "riskLevel": "high",
      "modelId": "claude-opus",
      "injectionScore": 0.91,
      "signals": ["containsExternalContent", "injectionScore:0.91"]
    }
  ]
}
```

---

## Token Compaction Endpoints

Deterministic, no-LLM context compression telemetry (Issue #221).

### `POST /api/token-compaction/run`

Runs the 5-layer token-compaction pipeline on an input file set.

**Request:**
```json
{
  "sessionId": "sess-abc",
  "agentId": "oracle",
  "files": [
    {
      "path": "src/main.ts",
      "content": "// comment\nexport const x = 1;\n",
      "priority": 2,
      "updatedAtMs": 1700000000000
    }
  ],
  "compression": {
    "level": "standard",
    "protected_files": ["SOUL.md", "*.key"],
    "max_processing_ms": 200
  }
}
```

**Response (200):**
```json
{
  "ok": true,
  "result": {
    "bundledContext": "F:src/main.ts (p=2,u=2026-02-21T09:00:00.000Z)\nexport const x = 1;",
    "files": [
      {
        "path": "src/main.ts",
        "protected": false,
        "layersApplied": [
          "whitespace-normalization",
          "comment-stripping",
          "deduplication",
          "priority-pruning"
        ],
        "originalChars": 31,
        "compressedChars": 20,
        "content": "export const x = 1;"
      }
    ],
    "metrics": {
      "sessionId": "sess-abc",
      "agentId": "oracle",
      "level": "standard",
      "preTokens": 12,
      "postTokens": 7,
      "reductionPct": 41.67,
      "estimatedSavingsUsd": 0.000015,
      "timedOut": false
    }
  }
}
```

**Validation errors (400):**
- missing `files[]`
- malformed file entries
- `files.length > 500`

### `GET /api/token-compaction/metrics`

Returns persisted compaction run history with per-session savings summary.

**Query params:**
- `limit` (optional, `1..500`, default `100`)
- `sessionId` (optional)
- `agentId` (optional)

**Response (200):**
```json
{
  "updatedAt": 1700000000000,
  "total": 2,
  "metrics": [
    {
      "sessionId": "sess-abc",
      "agentId": "oracle",
      "level": "standard",
      "preTokens": 1200,
      "postTokens": 310,
      "reductionPct": 74.17,
      "estimatedSavingsUsd": 0.00267,
      "timedOut": false
    }
  ],
  "summary": {
    "preTokens": 1200,
    "postTokens": 310,
    "savedTokens": 890,
    "avgReductionPct": 74.17,
    "estimatedSavingsUsd": 0.00267,
    "bySession": {
      "sess-abc": {
        "runs": 2,
        "preTokens": 2200,
        "postTokens": 620,
        "savedTokens": 1580
      }
    }
  }
}
```

---

## Self-Improvement Endpoints

Daily self-review digest generation + recommendation approvals (Issue #222).

### `POST /api/self-improvement/generate`

Generates a daily digest with actionable, diffable recommendations for one agent.

**Request (optional):**
```json
{
  "agentId": "oracle",
  "date": "2026-02-21",
  "minRecommendations": 3
}
```

**Response (200):**
```json
{
  "ok": true,
  "digestPath": "memory/self-improvement/2026-02-21.md",
  "digest": {
    "id": "sid-2026-02-21-oracle-abc123",
    "agentId": "oracle",
    "date": "2026-02-21",
    "approvedCount": 0,
    "rejectedCount": 0,
    "pendingCount": 3,
    "recommendations": [
      {
        "id": "sir-123",
        "type": "workflow_change",
        "target": "souls/oracle/PRINCIPLES.md",
        "status": "pending",
        "diff": "--- a/souls/oracle/PRINCIPLES.md\n+++ b/souls/oracle/PRINCIPLES.md\n@@\n-...\n+..."
      }
    ]
  }
}
```

### `GET /api/self-improvement/digests`

Lists stored digest runs.

**Query params:**
- `agentId` (optional)
- `limit` (optional, `1..365`, default `30`)

**Response (200):**
```json
{
  "total": 1,
  "digests": [
    {
      "id": "sid-2026-02-21-oracle-abc123",
      "agentId": "oracle",
      "date": "2026-02-21",
      "approvedCount": 1,
      "rejectedCount": 0,
      "pendingCount": 2
    }
  ]
}
```

### `GET /api/self-improvement/digests/:id`

Returns one full digest record by ID.

### `POST /api/self-improvement/recommendations/:id/approve`

Explicitly approves and auto-applies a recommendation.

**Request (optional):**
```json
{ "agentId": "oracle" }
```

### `POST /api/self-improvement/recommendations/:id/reject`

Rejects a recommendation without applying any file changes.

**Security note:**
- approvals only apply when the target path is inside `souls/<agentId>/` or `memory/self-improvement/`
- out-of-scope targets are rejected with no file mutation

---

## Code Factory Endpoints

Risk-tiered CI orchestration + harness-gap tracking (Issue #220).

### `GET /api/code-factory/risk-policy`

Returns the active machine-readable risk policy contract loaded from `.github/code-factory/risk-policy.json`.

### `POST /api/code-factory/preflight`

Runs path-based risk analysis for PR changes and returns SHA-bound preflight evidence.

**Request:**
```json
{
  "prNumber": 220,
  "headSha": "abc123",
  "changedFiles": ["lib/code-factory.ts", "dashboard/client/index.html"]
}
```

**Response (200):**
```json
{
  "ok": true,
  "analysis": {
    "riskTier": "high",
    "requiredChecks": ["lint", "typecheck", "test", "build", "review-agent", "sha-discipline", "auto-remediation", "browser-evidence"],
    "uiAffecting": true
  },
  "evidence": {
    "pr_number": 220,
    "head_sha": "abc123",
    "risk_tier": "high",
    "review_state": "pending"
  }
}
```

### `GET /api/code-factory/harness-gaps`

Returns open/resolved harness-gap records and SLA summary.

### `POST /api/code-factory/harness-gaps`

Creates a new harness-gap record.

**Request:**
```json
{
  "incidentRef": "INC-2026-02-21-001",
  "slaDays": 3
}
```

### `PATCH /api/code-factory/harness-gaps/:id`

Updates a harness-gap record (for example, marking `testCaseAdded: true`).

---

## WebMCP Endpoints

Structured website-tool integration with cache + browser fallback (Issue #225).

### `GET /api/webmcp/sites`

Returns default site profiles and current WebMCP telemetry.

### `GET /api/webmcp/metrics`

Returns discovery/invocation/fallback counters.

### `POST /api/webmcp/discover`

Discovers tools from a WebMCP-compatible site manifest.

**Request:**
```json
{
  "siteUrl": "https://example-site.com",
  "forceRefresh": false
}
```

### `POST /api/webmcp/invoke`

Invokes a structured tool with typed parameters.

**Request:**
```json
{
  "siteUrl": "https://example-site.com",
  "toolName": "search_catalog",
  "args": { "query": "ventureos" }
}
```

**Response behaviors:**
- `source: "webmcp"` when tool invocation succeeds over WebMCP
- `source: "fallback"` when discovery/invoke is unavailable and browser automation fallback is used

---

## Visual Explainer Endpoints

Slash-command visual rendering with interactive HTML patterns (Issue #226).

### `GET /api/visual-explainer/patterns`

Returns supported pattern identifiers:
- `table`
- `flow`
- `timeline`
- `hierarchy`
- `comparison`

### `POST /api/visual-explainer/render`

Renders `/explain` or `/visualize` command output into a Canvas-ready HTML payload.

**Request:**
```json
{
  "command": "/visualize intake > classify > route --pattern=flow",
  "title": "Routing Overview"
}
```

**Response (200):**
```json
{
  "ok": true,
  "render": {
    "pattern": "flow",
    "title": "Routing Overview",
    "renderTimeMs": 8,
    "html": "<!doctype html>..."
  }
}
```

The rendered HTML includes:
- expandable sections (`<details>`)
- hover tooltips via `data-tip`

---

## Proposal Lifecycle Endpoints

Closed-loop proposal → mission → step orchestration with human approval gate and live event streaming (Issue #227).

### `POST /api/proposal-lifecycle/proposals`

Submit a structured work proposal from an agent.

**Request:**
```json
{
  "title": "Ship partner onboarding flow",
  "goal": "Implement and verify onboarding automation",
  "submittedByAgentId": "echo",
  "estimatedCostUsd": 8.5,
  "requiredSkills": ["backend", "qa", "docs"],
  "riskAssessment": {
    "level": "medium",
    "summary": "API contract drift risk",
    "mitigations": ["contract tests", "staged rollout"]
  },
  "steps": [
    {
      "stepId": "build",
      "title": "Implement workflow",
      "description": "Create onboarding orchestration",
      "agentId": "synth"
    },
    {
      "stepId": "verify",
      "title": "Run validation",
      "description": "Execute QA + acceptance tests",
      "agentId": "verifier",
      "dependsOnStepIds": ["build"]
    }
  ]
}
```

### `GET /api/proposal-lifecycle/proposals`

List proposals (`?status=pending|approved|rejected|needs_changes&limit=50`).

### `POST /api/proposal-lifecycle/proposals/:proposalId/review`

Human review decision. Approval is required before mission execution.

**Request:**
```json
{
  "action": "approve",
  "reviewerId": "human",
  "notes": "Approved for execution",
  "autoStart": true
}
```

### `GET /api/proposal-lifecycle/missions`

List derived missions (`?status=pending|running|completed|failed|blocked`).

### `GET /api/proposal-lifecycle/missions/:missionId`

Get mission detail including step states and current step pointer.

### `POST /api/proposal-lifecycle/missions/:missionId/start`

Manually start an approved mission (if not auto-started during review).

### `GET /api/proposal-lifecycle/events`

Query lifecycle events (`?missionId=...&proposalId=...&limit=100`).

### `GET /api/proposal-lifecycle/summary`

Dashboard summary payload:
- pending proposal queue
- active proposal missions
- recent event timeline

### `GET /api/proposal-lifecycle/events/stream`

WebSocket stream endpoint for real-time lifecycle events.
If requested over plain HTTP, returns `426 Upgrade Required`.

---

## Living Files Endpoints

Self-maintaining documentation ownership, freshness checks, and stale-file triggers (Issue #228).

### `GET /api/living-files/dashboard`

Returns freshness counts, per-file status snapshots, recent checks, and open triggers for Mission Control UI.

### `GET /api/living-files/files`

List registered file ownership records (`?ownerAgentId=archivist` optional filter).

### `POST /api/living-files/files`

Register (or upsert) a managed file.

**Request:**
```json
{
  "filePath": "docs/API.md",
  "ownerAgentId": "archivist",
  "expectedUpdateHours": 24,
  "intentionallyStatic": false,
  "notes": "API docs should be refreshed on endpoint changes"
}
```

### `PATCH /api/living-files/files/:fileId`

Update owner/cadence/notes, including manual static override:
```json
{ "intentionallyStatic": true }
```

### `DELETE /api/living-files/files/:fileId`

Unregister a managed file.

### `POST /api/living-files/check-run`

Run staleness detection now.

**Request (optional):**
```json
{
  "source": "manual",
  "autoTrigger": true
}
```

### `GET /api/living-files/triggers`

List stale-file trigger records (`?status=queued|acknowledged|resolved`).

### `POST /api/living-files/triggers/:triggerId/acknowledge`

Mark trigger in-progress.

### `POST /api/living-files/triggers/:triggerId/resolve`

Resolve trigger with optional note.

---

## Rate Limiting

Per-IP, per-endpoint sliding window rate limits:

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `/api/sessions` | 60 req | 60s |
| `/api/costs` | 60 req | 60s |
| `/api/usage` | 60 req | 60s |
| `/api/system` | 60 req | 60s |
| `/api/token-compaction*` | 30 req | 60s |
| `/api/self-improvement*` | 20 req | 60s |
| `/api/code-factory*` | 20 req | 60s |
| `/api/webmcp*` | 30 req | 60s |
| `/api/visual-explainer*` | 30 req | 60s |
| `/api/proposal-lifecycle*` | 30 req | 60s |
| `/api/living-files*` | 30 req | 60s |
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
