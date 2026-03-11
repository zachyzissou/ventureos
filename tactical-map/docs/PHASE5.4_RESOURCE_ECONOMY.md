# Phase 5.4 — Resource Management & Economy Dashboard

## Summary

Phase 5.4 adds real-time resource visibility to the tactical map:

- Per-agent **token budget indicators**
- Real-time **cost + quota updates** via WebSocket
- **Resource pool panel** (remaining tokens + cost budget)
- **Cost heat map overlay** on the map
- Configurable **budget alerts** (warning / critical)
- Per-agent **historical trend sparklines**

## What shipped

### 1) Economy state + normalization

**Files:**
- `src/economy/types.ts`
- `src/economy/state.ts`
- `src/economy/health.ts`
- `src/economy/time-series.ts`
- `src/economy/sparkline.ts`

Capabilities:
- Normalizes budget payloads from snapshot + incremental events
- Handles missing/partial fields defensively
- Computes derived metrics:
  - usage ratio
  - remaining ratio
  - health tier (green/yellow/red)
  - burn rate from time-series deltas
- Maintains bounded trend history (count + max-age trimming)

### 2) Real-time WebSocket integration

**File:** `src/data/economy-client.ts`

Capabilities:
- Fetches initial snapshot from `API.RESOURCE_BASE_URL`
- Connects to `API.RESOURCE_WS_URL`
- Handles event envelopes:
  - `snapshot` / `economy.snapshot`
  - `agent_update` / `economy.agent`
  - `pool_update` / `economy.pool`
  - heartbeats (`ping/pong`)
- Reconnect strategy with exponential backoff + jitter
- Fallback polling every `API.REALTIME_FALLBACK_POLL_MS` while disconnected

### 3) Resource economy renderer

**File:** `src/renderer/resource-economy.ts`

Adds two integrated visual components:

- **World overlay**
  - budget ring around each agent
  - mini sparkline per agent
  - warning icon for low budget health
  - cost heat map circles per agent (usage + burn blended intensity)

- **HUD-side panel**
  - token pool bar + label
  - cost pool bar + label
  - realtime socket status (online/reconnecting)
  - latest budget alert messages

Performance strategy:
- Dirty-flag redraw per agent indicator (no full-scene redraw)
- Throttled heat-map redraw (`ECONOMY.HEATMAP_REDRAW_MS`)
- Panel redraw only on data/status/alert changes

### 4) Alert system

**File:** `src/economy/alerts.ts`

- Configurable warning + critical thresholds
- Cooldown to prevent alert spam while ratio remains low
- Escalation behavior (warning → critical triggers immediately)
- Supports both agent and global pool alerts

### 5) Main pipeline integration

**File:** `src/main.ts`

Integrated into the existing Phase 5.1–5.3 render/update flow:
- New `economyStore`
- `createEconomyClient()` startup + lifecycle
- state reducers for snapshot/agent/pool updates
- `BudgetAlertManager` evaluation on economy updates
- `resourceEconomy.update()` in ticker loop
- map position sync from `mapStore` to economy overlay

## Config additions

**File:** `src/config.ts`

- `API.RESOURCE_BASE_URL`
- `API.RESOURCE_WS_URL`
- `API.REALTIME_FALLBACK_POLL_MS`
- `API.WS_RECONNECT_BASE_MS`
- `API.WS_RECONNECT_MAX_MS`
- `ECONOMY.*` thresholds and rendering constants

## Tests

New test coverage for Phase 5.4 modules:

- `tests/unit/economy-health.test.ts`
- `tests/unit/economy-state.test.ts`
- `tests/unit/economy-alerts.test.ts`
- `tests/unit/economy-series.test.ts`
- `tests/unit/economy-client.test.ts`
- `tests/unit/resource-economy-layer.test.ts`

## Operational notes

- If websocket is unavailable, dashboard still updates via fallback snapshot polling.
- Unknown websocket events are ignored safely.
- Partial budget payloads are tolerated; missing metrics are derived when possible.
- Alert thresholds can be tuned from `ECONOMY` config without changing renderer logic.

## Acceptance criteria mapping

- ✅ Token budgets per agent: rings + labels per agent
- ✅ Real-time updates: websocket stream + reconnect + fallback poll
- ✅ Health indicators: green/yellow/red health mapping
- ✅ Historical sparklines: per-agent sparkline renderer
- ✅ Budget alerts: thresholded alert manager with cooldown
- ✅ Performance: incremental redraw strategy + throttled heatmap
- ✅ Integration: wired into existing tactical map render loop / store flow
