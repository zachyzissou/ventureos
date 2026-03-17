# Tactical Map — API Documentation

> **Issue #21** · VentureOS Phase 5 Documentation

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket Protocol](#websocket-protocol)
5. [Data Schemas](#data-schemas)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)
8. [Examples](#examples)

---

## Overview

The Tactical Map API is served by the VentureOS Dashboard Server on port **8001** (configurable via `DASHBOARD_PORT`). All API routes are prefixed with `/api/tactical-map`.

**Base URL:** `http://localhost:8001/api/tactical-map`

**Content Type:** All responses are `application/json` unless otherwise noted.

**OpenAPI Spec:** See [`openapi.yaml`](./openapi.yaml) for the formal specification.

---

## Authentication

### Bearer Token

All `/api/*` endpoints require authentication via a pre-shared API key.

**Token sources** (checked in order by the server):
1. Environment variable `DASHBOARD_API_TOKEN`
2. File at `dashboard/data/.api-token` (auto-generated if missing)

**Request header:**
```
Authorization: Bearer <token>
```

**WebSocket auth:**
```
wss://host/api/tactical-map/resources/stream?token=<token>
```

> ⚠️ **Security:** Query-parameter token auth is supported for backwards compatibility but not recommended — tokens may be logged by proxies. Prefer header-based auth (e.g. `Sec-WebSocket-Protocol` sub-protocol or an initial `auth` message after connection).

**Client-side token resolution** (checked in order):
1. `localStorage.getItem('token')`
2. `localStorage.getItem('authToken')`
3. `localStorage.getItem('auth_token')`
4. Cookie: `token`
5. Cookie: `authToken`

### Authentication Failures

```json
// 401 Unauthorized — Missing header
{
  "error": "Missing or invalid Authorization header"
}

// 401 Unauthorized — Invalid token
{
  "error": "Invalid API token"
}
```

### Exemptions

- `OPTIONS` preflight requests are always allowed (CORS)
- Static assets (`/map`, `/map/assets/*`) do not require auth

---

## REST API Endpoints

### GET `/api/tactical-map/state`

Returns the current map state for all agents (7 ring agents + 1 central Nexus).

**Response: `200 OK`**

```json
{
  "updatedAt": "2026-02-16T09:00:00.000Z",
  "agents": {
    "venture_research": {
      "state": "ACTIVE",
      "sessions": 2,
      "position": { "x": 0, "y": -350 },
      "activeSessions": [
        {
          "id": "venture_research:0",
          "label": "Research multi-domain synthesis",
          "startedAt": "2026-02-16T08:45:00.000Z",
          "estimatedMs": 600000,
          "progress": 0.35
        }
      ]
    },
    "venture_infrastructure": {
      "state": "IDLE",
      "sessions": 0,
      "position": { "x": 247.49, "y": -247.49 }
    },
    "venture_security": { "..." },
    "venture_evidence": { "..." },
    "venture_memory": { "..." },
    "venture_delivery": { "..." },
    "venture_strategy": { "..." },
    "venture_control": {
      "state": "ACTIVE",
      "sessions": 3,
      "position": { "x": 0, "y": 0 }
    }
  }
}
```

**Agent State Values:**

| State | Description |
|-------|-------------|
| `IDLE` | No active sessions |
| `ACTIVE` | Processing sessions |
| `OVERLOADED` | Sessions ≥ 80% capacity |
| `ERROR` | Agent experiencing errors |

**Session Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Stable session identifier |
| `label` | string | Yes | Human-readable description (untrusted, sanitized client-side) |
| `startedAt` | string (ISO 8601) | Yes | Session start time |
| `estimatedMs` | number | No | Estimated duration in ms |
| `progress` | number (0-1) | No | Completion ratio |

---

### GET `/api/tactical-map/resources`

Returns the current resource economy snapshot (token budgets + costs).

**Response: `200 OK`**

```json
{
  "updatedAt": "2026-02-16T09:00:00.000Z",
  "agents": {
    "venture_research": {
      "agentId": "venture_research",
      "tokenBudget": 100000,
      "tokensUsed": 45000,
      "tokensRemaining": 55000,
      "quotaRemainingRatio": 0.55,
      "costUsd": 2.34,
      "burnRateUsdPerHour": 0.78,
      "history": [
        { "ts": 1708070400000, "tokensUsed": 40000, "costUsd": 2.10 },
        { "ts": 1708074000000, "tokensUsed": 45000, "costUsd": 2.34 }
      ]
    },
    "venture_infrastructure": { "..." }
  },
  "pool": {
    "tokenQuotaTotal": 1000000,
    "tokenQuotaUsed": 320000,
    "tokenQuotaRemaining": 680000,
    "tokenQuotaRemainingRatio": 0.68,
    "costBudgetUsd": 100.00,
    "costUsedUsd": 23.45,
    "costRemainingUsd": 76.55,
    "costRemainingRatio": 0.7655
  }
}
```

**Health Tier Mapping:**

| Remaining Ratio | Health |
|----------------|--------|
| > 30% | `green` |
| 15% – 30% | `yellow` |
| ≤ 15% | `red` |

---

### GET `/api/tactical-map/health`

> **⚠️ IN DEVELOPMENT:** This endpoint is part of Phase 5.6 (Health & Diagnostics) and is not yet implemented. The specification below describes the planned API contract.

Returns the current health snapshot for all agents.

**Response: `200 OK`**

```json
{
  "updatedAt": "2026-02-16T09:00:00.000Z",
  "agents": {
    "venture_research": {
      "agentId": "venture_research",
      "status": "green",
      "connectivity": "online",
      "cpuUsage": 0.35,
      "memoryUsage": 0.52,
      "latencyMs": 120,
      "requestsPerSec": 4.5,
      "errorRate": 0.01,
      "uptimeSec": 86400,
      "consecutiveFailures": 0,
      "lastCheckAt": "2026-02-16T09:00:00.000Z",
      "errorMessages": [],
      "history": [
        {
          "ts": 1708074000000,
          "cpuUsage": 0.33,
          "memoryUsage": 0.51,
          "latencyMs": 115,
          "requestsPerSec": 4.2,
          "errorRate": 0.01
        }
      ]
    },
    "venture_infrastructure": { "..." }
  },
  "system": {
    "overallStatus": "green",
    "aggregateMetrics": {
      "cpuUsage": 0.42,
      "memoryUsage": 0.55,
      "latencyMs": 150,
      "requestsPerSec": 32.0,
      "errorRate": 0.02,
      "uptimeSec": 86400
    }
  }
}
```

**Health Status Thresholds:**

| Metric | Yellow Threshold | Red Threshold |
|--------|-----------------|---------------|
| CPU Usage | ≥ 70% | ≥ 90% |
| Memory Usage | ≥ 75% | ≥ 90% |
| Latency | ≥ 500ms | ≥ 2000ms |
| Error Rate | ≥ 5% | ≥ 15% |

**Connectivity Status:**

| Status | Condition |
|--------|-----------|
| `online` | 0 consecutive failures |
| `degraded` | ≥ 1 consecutive failure |
| `offline` | ≥ 3 consecutive failures |

---

### GET `/api/tactical-map/control-state`

Returns persisted interactive-control state (paused agents, budget overrides, saved config).

**Response: `200 OK`**

```json
{
  "ok": true,
  "updatedAt": "2026-02-16T15:30:00.000Z",
  "pausedAgents": ["venture_delivery"],
  "budgets": {
    "venture_delivery": 75000,
    "venture_research": 100000
  },
  "configs": {
    "venture_delivery": { "maxSessions": 3 }
  }
}
```

### POST `/api/tactical-map/agents/:agentId/pause`

Pause an agent (requires authenticated API access).

### POST `/api/tactical-map/agents/:agentId/resume`

Resume a previously paused agent.

### POST `/api/tactical-map/agents/:agentId/budget`

Persist an updated budget for an agent.

**Request Body**

```json
{
  "newBudget": 90000,
  "previousBudget": 100000
}
```

### POST `/api/tactical-map/missions/spawn`

Create a mission from the tactical map mission-spawn UI.

**Request Body**

```json
{
  "title": "Investigate build regression",
  "description": "Focus on tactical map controls",
  "assignee": "venture_delivery",
  "priority": "high",
  "tokenBudget": 32000
}
```

### POST `/api/tactical-map/missions/:missionId/priority`

Update mission priority.

### POST `/api/tactical-map/agents/:agentId/config`

Persist agent-specific configuration edits.

### GET `/api/rpg/stats`

Returns the RPG KPI statistics for the HUD ticker.

**Response: `200 OK`**

```json
{
  "stats": {
    "Oracle WIS": 78,
    "Atlas SPD": 85,
    "Sentinel TRU": 92,
    "Verifier LOG": 88,
    "Archivist MEM": 76,
    "Synth CRE": 81,
    "Echo CHA": 90,
    "Nexus POW": 87
  }
}
```

---

## WebSocket Protocol

### Resource Economy Stream

**Endpoint:** `wss://host/api/tactical-map/resources/stream?token=<token>`

#### Connection Handshake

```json
// Client → Server (after connection open)
{ "type": "subscribe", "topic": "resource_economy" }
```

#### Server → Client Events

**Snapshot** (full state, sent on connect and periodically):
```json
{
  "type": "snapshot",
  "snapshot": {
    "updatedAt": "2026-02-16T09:00:00.000Z",
    "agents": { "...same as GET /resources response..." },
    "pool": { "..." }
  }
}
```

**Agent Update** (incremental, per-agent):
```json
{
  "type": "agent_update",
  "agent": {
    "agentId": "venture_research",
    "tokensUsed": 46000,
    "costUsd": 2.40,
    "burnRateUsdPerHour": 0.82
  }
}
```

**Pool Update** (global resource pool change):
```json
{
  "type": "pool_update",
  "pool": {
    "tokenQuotaUsed": 325000,
    "costUsedUsd": 24.10
  }
}
```

**Heartbeat** (keep-alive, server → client):
```json
{ "type": "heartbeat", "ts": 1708074000000 }
```

**Client → Server Pong:**
```json
{ "type": "pong", "ts": 1708074000123 }
```

#### Accepted Type Aliases

The client parser accepts multiple type names for flexibility:

| Canonical | Also Accepted |
|-----------|--------------|
| `snapshot` | `economy.snapshot` |
| `agent_update` | `economy.agent` |
| `pool_update` | `economy.pool` |
| `heartbeat` | `ping`, `pong` |

#### Reconnection Strategy

```
Attempt 1: ~1s  (WS_RECONNECT_BASE_MS)
Attempt 2: ~2s
Attempt 3: ~4s
Attempt N: min(1s × 2^N, 30s) × jitter(0.8–1.2)
```

During disconnection, client falls back to polling `GET /resources` every 2s.

---

### Health Stream

> **⚠️ IN DEVELOPMENT:** This WebSocket endpoint is part of Phase 5.6 (Health & Diagnostics) and is not yet implemented. The specification below describes the planned protocol.

**Endpoint:** `wss://host/api/tactical-map/health/stream?token=<token>`

#### Connection Handshake

```json
// Client → Server
{ "type": "subscribe", "topic": "health" }
```

#### Server → Client Events

**Health Snapshot:**
```json
{
  "type": "health_snapshot",
  "snapshot": {
    "updatedAt": "2026-02-16T09:00:00.000Z",
    "agents": { "...same as GET /health response..." },
    "system": { "..." }
  }
}
```

**Agent Health Update:**
```json
{
  "type": "agent_health",
  "agent": {
    "agentId": "venture_research",
    "cpuUsage": 0.38,
    "memoryUsage": 0.54,
    "latencyMs": 125,
    "errorRate": 0.01
  }
}
```

**Health Alert:**
```json
{
  "type": "health_alert",
  "alert": {
    "id": "health:venture_research:cpu:1708074000000",
    "severity": "P1",
    "agentId": "venture_research",
    "title": "🟡 Warning",
    "message": "Oracle CPU elevated (72%)",
    "metric": "cpu",
    "value": 0.72,
    "threshold": 0.70,
    "createdAt": 1708074000000,
    "ttlMs": 120000
  }
}
```

**Heartbeat:** Same as economy stream.

#### Accepted Type Aliases

| Canonical | Also Accepted |
|-----------|--------------|
| `health_snapshot` | `snapshot` |
| `agent_health` | `agent_update` |
| `health_alert` | `alert` |
| `heartbeat` | `ping` |

---

## Data Schemas

### Agent Economy (Flexible Input)

The economy normalization layer accepts multiple field name variants. The server may send any combination:

| Canonical Field | Also Accepted |
|----------------|--------------|
| `tokenBudget` | `budgetTokens`, `budget` |
| `tokensUsed` | `usedTokens`, `spentTokens` |
| `tokensRemaining` | `remainingTokens` |
| `costUsd` | `totalCostUsd`, `cost` |
| `burnRateUsdPerHour` | `costRateUsdPerHour`, `burnRate` |
| `quotaRemainingRatio` | `quotaRemaining` |

### Agent Health (Flexible Input)

| Canonical Field | Also Accepted |
|----------------|--------------|
| `cpuUsage` | `cpu` |
| `memoryUsage` | `memory` |
| `latencyMs` | `latency` |
| `requestsPerSec` | `rps` |
| `errorRate` | `errors` |
| `uptimeSec` | `uptime` |

### Pool Economy (Flexible Input)

| Canonical Field | Also Accepted |
|----------------|--------------|
| `tokenQuotaTotal` | `totalTokens`, `tokenBudget` |
| `tokenQuotaUsed` | `usedTokens`, `tokensUsed` |
| `tokenQuotaRemaining` | `remainingTokens` |
| `costBudgetUsd` | `totalCostBudgetUsd`, `costQuotaUsd` |
| `costUsedUsd` | `usedCostUsd` |
| `costRemainingUsd` | `remainingCostUsd` |

### Alert Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique alert identifier |
| `severity` | `"P0"` \| `"P1"` | P0 = critical, P1 = warning |
| `state` | `"active"` \| `"acknowledged"` \| `"resolved"` | Lifecycle state |
| `agentId` | string \| `"system"` | Affected agent or `"system"` for global |
| `title` | string | Short alert title |
| `message` | string | Detailed alert message |
| `metric` | string | Metric that triggered: `cpu`, `memory`, `latency`, `errorRate`, `connectivity` |
| `value` | number | Current metric value |
| `threshold` | number | Threshold that was exceeded |
| `createdAt` | number | Epoch ms |
| `ttlMs` | number | Auto-dismiss timeout (0 = never) |

### Building State Derivation

The client derives building states from raw API data:

```
if state == 'ERROR' → ERROR
if state == 'OVERLOADED' → OVERLOADED
if sessions/maxSessions >= 0.8 → OVERLOADED
if state == 'ACTIVE' or sessions > 0 → ACTIVE
else → IDLE
```

Max sessions per agent:
| Agent | Max Sessions |
|-------|-------------|
| venture_research | 3 |
| venture_infrastructure | 5 |
| venture_security | 3 |
| venture_evidence | 4 |
| venture_memory | 3 |
| venture_delivery | 3 |
| venture_strategy | 5 |
| venture_control | 5 |

---

## Error Handling

### HTTP Error Responses

| Status | Meaning | Response Body |
|--------|---------|---------------|
| `200` | Success | JSON payload |
| `401` | Unauthorized | `{ "error": "..." }` |
| `404` | Not Found | `"Not found"` |
| `429` | Rate Limited | `{ "error": "Rate limited" }` |
| `500` | Server Error | `{ "error": "Internal server error" }` |

### Client-Side Error Handling

The API client handles errors gracefully:

```typescript
// Fetch errors trigger exponential backoff
api.start();
// onError callback for logging
opts.onError?.(err);
// backoffMs doubles on each failure, capped at 120s
backoffMs = Math.min(backoffMs * 2, 120_000);
```

### WebSocket Error Recovery

1. `onerror` event → log via `onError` callback
2. `onclose` event → mark disconnected, start fallback polling, schedule reconnect
3. Reconnect with exponential backoff + jitter
4. On successful reconnect → reset attempt counter, stop fallback polling

---

## Rate Limiting

The dashboard server applies rate limiting on all API routes:

| Endpoint Pattern | Rate Limit | Window |
|-----------------|------------|--------|
| `/api/*` | Configured per-route | Rolling window |

Rate limit headers are not exposed to the client. Exceeded limits return `429`.

**Client-side cadences:**

| Poll Type | Interval | Purpose |
|-----------|----------|---------|
| Map state | 15s | Agent positions and states |
| KPI stats | 30s | RPG stat ticker in HUD |
| Economy snapshot | On connect + fallback 2s | Token/cost budgets |
| Health snapshot | 10s + on connect | Agent health metrics |

---

## Examples

### cURL: Fetch Map State

```bash
TOKEN="your-api-token-here"

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8001/api/tactical-map/state | jq
```

### cURL: Fetch Economy Snapshot

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8001/api/tactical-map/resources | jq
```

### cURL: Fetch Health Status

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8001/api/tactical-map/health | jq
```

### WebSocket: Connect to Economy Stream (wscat)

```bash
wscat -c "ws://localhost:8001/api/tactical-map/resources/stream?token=$TOKEN"

# After connection, send subscribe:
> {"type":"subscribe","topic":"resource_economy"}
```

### JavaScript: Minimal Client

```typescript
import { createApiClient } from './data/api-client';
import { createEconomyClient } from './data/economy-client';
import { createHealthClient } from './data/health-client';

// Map state polling
const api = createApiClient({
  onMapState: (state) => console.log('Map:', state.agents),
  onError: (err) => console.error('Map error:', err),
});
api.start();

// Economy WebSocket + fallback
const economy = createEconomyClient({
  onSnapshot: (snap) => console.log('Economy snapshot:', snap),
  onAgentUpdate: (agent) => console.log('Agent update:', agent),
  onPoolUpdate: (pool) => console.log('Pool update:', pool),
  onConnectionChange: (connected) => console.log('WS:', connected),
});
economy.start();

// Health WebSocket + polling
const health = createHealthClient({
  onSnapshot: (snap) => console.log('Health snapshot:', snap),
  onAgentUpdate: (agent) => console.log('Agent health:', agent),
  onAlert: (alert) => console.log('Health alert:', alert),
});
health.start();

// Cleanup
window.addEventListener('beforeunload', () => {
  api.stop();
  economy.stop();
  health.stop();
});
```
