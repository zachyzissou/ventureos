# Phase 5.6 — Health & Diagnostics

## Summary

Phase 5.6 adds real-time system health monitoring and issue detection to the tactical map. Every agent gets continuous health telemetry (CPU, memory, latency, error rate), alert overlays for P0/P1 incidents, connectivity status tracking, and a system-wide health dashboard panel. The design preserves the existing current visual language — pulsing red auras for errors, amber for warnings, green for healthy — while integrating smoothly into the Phase 5.1–5.5 renderer and store architecture.

---

## Table of Contents

1. [System Design](#1-system-design)
2. [API Contracts](#2-api-contracts)
3. [Data Layer](#3-data-layer)
4. [UI/UX Specifications](#4-uiux-specifications)
5. [Performance Requirements](#5-performance-requirements)
6. [Implementation Plan](#6-implementation-plan)
7. [Test Strategy](#7-test-strategy)
8. [Migration & Rollout](#8-migration--rollout)

---

## 1. System Design

### 1.1 Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                         Tactical Map (Browser)                    │
│                                                                   │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────────────┐  │
│  │HealthClient │──▶│ healthStore  │──▶│ Health Renderer Layer │  │
│  │ (data/)     │   │ (state/)     │   │ (renderer/)           │  │
│  └──────┬──────┘   └──────┬───────┘   │  • Agent indicators   │  │
│         │                 │            │  • Alert overlays     │  │
│         │                 │            │  • Dashboard panel    │  │
│         │                 │            │  • Connectivity badge │  │
│  ┌──────┴──────┐   ┌──────┴───────┐   └───────────────────────┘  │
│  │ AlertRouter │   │diagnosticStore│                              │
│  │ (health/)   │   │ (state/)      │                              │
│  └─────────────┘   └──────────────┘                              │
└──────────────────────────────┬────────────────────────────────────┘
                               │ HTTP poll + WebSocket
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Dashboard Server (8001)                         │
│                                                                   │
│  GET /api/tactical-map/health          (snapshot)                 │
│  WS  /api/tactical-map/health/stream   (realtime)                │
│  GET /api/tactical-map/health/:agentId (per-agent detail)        │
│  GET /api/tactical-map/diagnostics     (system-wide aggregates)  │
│                                                                   │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐   │
│  │ Health       │  │ Prometheus     │  │ Alert Evaluator     │   │
│  │ Aggregator   │◀─│ Metrics Scraper│  │ (threshold engine)  │   │
│  └──────────────┘  └────────────────┘  └─────────────────────┘   │
│                                                                   │
│  Sources: OpenClaw gateway /status, process metrics, ping probes  │
└───────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Location | Responsibility |
|-----------|----------|----------------|
| **HealthClient** | `src/data/health-client.ts` | Fetch health snapshots, maintain WebSocket for realtime updates, exponential backoff reconnect |
| **healthStore** | `src/state/store.ts` (new store instance) | Hold `HealthState` — per-agent health + system diagnostics + alerts |
| **diagnosticStore** | `src/state/store.ts` (new store instance) | Aggregated system-wide metrics (total req/s, error rate, uptime) |
| **AlertRouter** | `src/health/alert-router.ts` | Evaluate health events against severity thresholds, emit typed alerts, cooldown/dedup |
| **Health Renderer** | `src/renderer/health-diagnostics.ts` | PixiJS layer: agent health indicators, pulsing error auras, connectivity badges |
| **Dashboard Panel** | `src/renderer/health-dashboard.ts` | HUD overlay: system-wide health summary, alert feed, performance sparklines |
| **Health types** | `src/health/types.ts` | Shared TypeScript types for the health domain |
| **Health normalization** | `src/health/normalize.ts` | Defensive parsing of server payloads into typed state |

### 1.3 Data Flow

1. **Bootstrap:** `HealthClient` fetches `GET /api/tactical-map/health` → full snapshot populates `healthStore`
2. **Realtime:** WebSocket at `/api/tactical-map/health/stream` pushes incremental `agent_health`, `alert`, `system_diagnostics` events
3. **Store update:** `healthStore.update()` applies normalized events; subscribers fire
4. **Alert routing:** `AlertRouter.evaluate()` runs on each store update, checking severity escalation and cooldown
5. **Render:** Health renderer reads `healthStore`, draws per-agent indicators + alert overlays each frame
6. **Dashboard:** Dashboard panel subscribes to both `healthStore` and `diagnosticStore`, redraws on changes
7. **Fallback:** If WebSocket disconnects, `HealthClient` falls back to polling `GET /api/tactical-map/health` every 3s

---

## 2. API Contracts

### 2.1 Health Snapshot

```
GET /api/tactical-map/health
Authorization: Bearer <token>

Response 200:
{
  "updatedAt": "2026-02-16T15:12:00.000Z",
  "agents": {
    "oracle": {
      "agentId": "oracle",
      "status": "healthy",           // "healthy" | "degraded" | "unhealthy" | "offline"
      "uptimeMs": 3600000,
      "lastHeartbeatAt": "2026-02-16T15:11:58.000Z",
      "metrics": {
        "cpuPercent": 12.4,           // 0-100
        "memoryMb": 256,              // RSS in MB
        "memoryLimitMb": 1024,
        "latencyMs": 23,              // p95 response latency
        "latencyP99Ms": 45,
        "requestsPerSec": 8.2,
        "errorsPerMin": 0.1,
        "activeConnections": 3
      },
      "errors": [],                   // recent errors (max 5)
      "alertLevel": null              // null | "info" | "warning" | "p1" | "p0"
    },
    // ... other agents
  },
  "system": {
    "overallStatus": "healthy",       // worst-of-all-agents
    "totalRequestsPerSec": 42.6,
    "totalErrorsPerMin": 0.3,
    "agentCount": 8,
    "healthyCount": 7,
    "degradedCount": 1,
    "unhealthyCount": 0,
    "offlineCount": 0
  },
  "alerts": []                        // active alerts array
}
```

### 2.2 Per-Agent Detail

```
GET /api/tactical-map/health/:agentId
Authorization: Bearer <token>

Response 200:
{
  "agentId": "oracle",
  "status": "healthy",
  "uptimeMs": 3600000,
  "lastHeartbeatAt": "2026-02-16T15:11:58.000Z",
  "metrics": { ... },                 // same as snapshot
  "errors": [
    {
      "id": "err-001",
      "message": "Connection timeout to model API",
      "code": "ECONNRESET",
      "severity": "warning",
      "occurredAt": "2026-02-16T15:10:22.000Z",
      "count": 3
    }
  ],
  "history": [                        // time-series (last 1h, 30s intervals)
    { "ts": 1708095600000, "cpuPercent": 11.2, "memoryMb": 245, "latencyMs": 20, "requestsPerSec": 7.8 },
    // ...
  ]
}
```

### 2.3 System Diagnostics

```
GET /api/tactical-map/diagnostics
Authorization: Bearer <token>

Response 200:
{
  "updatedAt": "2026-02-16T15:12:00.000Z",
  "overallStatus": "healthy",            // worst-of-all-agents
  "uptimeMs": 15120000,
  "totalRequestsPerSec": 42.6,
  "peakRequestsPerSec": 120.3,
  "totalErrorsPerMin": 0.3,
  "agentCount": 8,
  "healthyCount": 7,
  "degradedCount": 1,
  "unhealthyCount": 0,
  "offlineCount": 0,
  "totalCpuPercent": 34.2,
  "totalMemoryMb": 2048,
  "totalMemoryLimitMb": 8192
}
```

### 2.4 WebSocket Stream

```
WS /api/tactical-map/health/stream
Authorization: Bearer <jwt>
// Token sent via `protocols` or `headers` param — NOT as a query-string
// to avoid leaking credentials in server logs, browser history, or proxy caches.

Client → Server:
  { "type": "subscribe", "topic": "health" }

Server → Client events:

// Full snapshot (sent on connect)
{
  "type": "health.snapshot",
  "data": { ... }                      // same shape as GET /health response
}

// Single agent health update (sent on change)
{
  "type": "health.agent",
  "data": {
    "agentId": "oracle",
    "status": "degraded",
    "metrics": { ... },
    "alertLevel": "warning",
    "errors": [ ... ]
  }
}

// Alert fired
{
  "type": "health.alert",
  "data": {
    "id": "alert-abc123",
    "severity": "p1",                  // "p0" | "p1" | "warning" | "info"
    "scope": "agent",                  // "agent" | "system"
    "targetId": "oracle",
    "title": "High latency detected",
    "message": "Oracle p95 latency exceeded 200ms for 60s",
    "createdAt": "2026-02-16T15:12:00.000Z",
    "resolved": false
  }
}

// Alert resolved
{
  "type": "health.alert_resolved",
  "data": {
    "id": "alert-abc123",
    "resolvedAt": "2026-02-16T15:15:00.000Z"
  }
}

// System diagnostics update (every 30s)
{
  "type": "health.diagnostics",
  "data": { ... }                      // same shape as GET /diagnostics response
}

// Heartbeat (every 15s)
{
  "type": "ping",
  "ts": 1708095600000
}
```

### 2.5 Config Additions (`src/config.ts`)

```typescript
// ── URLs live alongside existing API paths ──────────────────────
export const API = {
  // ... existing API entries ...

  /** Health snapshot endpoint. */
  HEALTH_BASE_URL: '/api/tactical-map/health',
  /** Health WebSocket stream endpoint. */
  HEALTH_WS_URL: '/api/tactical-map/health/stream',
  /** Diagnostics endpoint. */
  HEALTH_DIAGNOSTICS_URL: '/api/tactical-map/diagnostics',
} as const;

// ── Thresholds & tuning knobs ───────────────────────────────────
export const HEALTH = {
  /** Poll interval when WebSocket is connected (diagnostics only). */
  DIAGNOSTICS_POLL_MS: 30_000,
  /** Fallback poll cadence while WebSocket is disconnected. */
  FALLBACK_POLL_MS: 3_000,
  /** Maximum age before marking agent as "stale" (no heartbeat). */
  STALE_THRESHOLD_MS: 30_000,
  /** Maximum age before marking agent as "offline". */
  OFFLINE_THRESHOLD_MS: 60_000,
  /** Performance SLA: health check round-trip budget (not an AbortController timeout). */
  HEALTH_CHECK_BUDGET_MS: 50,
  /** Alert visibility SLA — from event to rendered overlay. */
  ALERT_VISIBILITY_MS: 5_000,
  /** Max alerts retained in state. */
  MAX_ALERTS: 50,
  /** Alert cooldown to prevent spam. */
  ALERT_COOLDOWN_MS: 30_000,
  /** CPU threshold for warning (%). */
  CPU_WARNING_PCT: 70,
  /** CPU threshold for critical (%). */
  CPU_CRITICAL_PCT: 90,
  /** Memory threshold for warning (% of limit). */
  MEMORY_WARNING_PCT: 75,
  /** Memory threshold for critical (% of limit). */
  MEMORY_CRITICAL_PCT: 90,
  /** Latency threshold for warning (ms). */
  LATENCY_WARNING_MS: 150,
  /** Latency threshold for critical (ms). */
  LATENCY_CRITICAL_MS: 500,
  /** Error rate threshold for warning (per min). */
  ERROR_RATE_WARNING: 5,
  /** Error rate threshold for critical (per min). */
  ERROR_RATE_CRITICAL: 20,
  /** Health indicator ring radius (px, around agent building). */
  INDICATOR_RING_RADIUS: 52,
  /** Pulse animation speed for error state. */
  ERROR_PULSE_HZ: 2.0,
  /** Pulse animation speed for warning state. */
  WARNING_PULSE_HZ: 1.0,
  /** Dashboard panel width (px). */
  DASHBOARD_WIDTH: 320,
  /** Dashboard panel max height (px). */
  DASHBOARD_MAX_HEIGHT: 460,
  /** Sparkline dimensions for dashboard. */
  SPARKLINE_WIDTH: 80,
  SPARKLINE_HEIGHT: 20,
  /** History points retained per agent for sparklines. */
  HISTORY_MAX_POINTS: 120,
} as const;

export const CONNECTIVITY = {
  /** Connectivity check interval (ms). */
  CHECK_INTERVAL_MS: 10_000,
  /** Response time for "degraded" classification (ms). */
  DEGRADED_THRESHOLD_MS: 200,
  /** Consecutive failures before "offline" status. */
  OFFLINE_FAILURES: 3,
} as const;
```

---

## 3. Data Layer

### 3.1 Type Definitions (`src/health/types.ts`)

```typescript
import type { AgentId } from '@/config';

// ═══════════════════════════════════════════
// Agent Health
// ═══════════════════════════════════════════

export type AgentStatus = 'healthy' | 'degraded' | 'unhealthy' | 'offline';

export type HealthMetrics = {
  cpuPercent: number;        // 0-100
  memoryMb: number;          // RSS
  memoryLimitMb: number;
  latencyMs: number;         // p95
  latencyP99Ms: number;
  requestsPerSec: number;
  errorsPerMin: number;
  activeConnections: number;
};

export type AgentError = {
  id: string;
  message: string;
  code?: string;
  severity: AlertSeverity;
  occurredAt: string;
  count: number;
};

export type HealthHistoryPoint = {
  ts: number;
  cpuPercent: number;
  memoryMb: number;
  latencyMs: number;
  requestsPerSec: number;
};

export type AgentHealthState = {
  agentId: AgentId;
  status: AgentStatus;
  uptimeMs: number;
  lastHeartbeatAt: number;      // epoch ms
  metrics: HealthMetrics;
  errors: AgentError[];
  alertLevel: AlertSeverity | null;
  history: HealthHistoryPoint[];
  updatedAt: number;
};

// ═══════════════════════════════════════════
// System Diagnostics
// ═══════════════════════════════════════════

export type SystemDiagnostics = {
  overallStatus: AgentStatus;
  totalRequestsPerSec: number;
  totalErrorsPerMin: number;
  agentCount: number;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  offlineCount: number;
  uptimeMs: number;
  peakRequestsPerSec: number;
  totalCpuPercent: number;
  totalMemoryMb: number;
  totalMemoryLimitMb: number;
  updatedAt: number;
};

// ═══════════════════════════════════════════
// Alerts
// ═══════════════════════════════════════════

export type AlertSeverity = 'info' | 'warning' | 'p1' | 'p0';

export type HealthAlert = {
  id: string;
  severity: AlertSeverity;
  scope: 'agent' | 'system';
  targetId: string;            // agentId or 'system'
  title: string;
  message: string;
  createdAt: number;
  resolved: boolean;
  resolvedAt?: number;
};

// ═══════════════════════════════════════════
// Connectivity
// ═══════════════════════════════════════════

export type ConnectivityStatus = 'online' | 'degraded' | 'offline';

export type ConnectivityState = {
  status: ConnectivityStatus;
  latencyMs: number | null;
  lastCheckAt: number;
  consecutiveFailures: number;
  wsConnected: boolean;
};

// ═══════════════════════════════════════════
// Combined State
// ═══════════════════════════════════════════

export type HealthState = {
  updatedAt: number;
  agents: Record<AgentId, AgentHealthState>;
  system: SystemDiagnostics;
  alerts: HealthAlert[];
  connectivity: ConnectivityState;
};
```

### 3.2 State Normalization (`src/health/normalize.ts`)

Defensive parsing following the same pattern as `src/economy/state.ts`:

- Accept partial/malformed payloads gracefully
- Coerce types, clamp ranges, provide defaults
- Handle both camelCase and snake_case field names
- Export `__test` for unit testing internals

Key functions:
```typescript
export function normalizeAgentHealth(raw: unknown, agentId: AgentId): AgentHealthState;
export function normalizeHealthSnapshot(raw: unknown): HealthState;
export function normalizeHealthEvent(raw: unknown): HealthEvent;
export function applyAgentHealthUpdate(state: HealthState, raw: unknown): HealthState;
export function applyAlertEvent(state: HealthState, raw: unknown): HealthState;
export function applyAlertResolvedEvent(state: HealthState, raw: unknown): HealthState;
export function applyDiagnosticsUpdate(state: HealthState, raw: unknown): HealthState;
```

### 3.3 Health Client (`src/data/health-client.ts`)

Mirrors the `economy-client.ts` pattern:

```typescript
export type HealthClientOptions = {
  onSnapshot: (snapshot: HealthState) => void;
  onAgentUpdate: (agentId: AgentId, health: AgentHealthState) => void;
  onAlert: (alert: HealthAlert) => void;
  onAlertResolved: (alertId: string) => void;
  onDiagnostics: (diagnostics: SystemDiagnostics) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: unknown) => void;
};

export type HealthClient = {
  start: () => void;
  stop: () => void;
  fetchSnapshot: () => Promise<HealthState>;
  fetchAgentDetail: (agentId: AgentId) => Promise<AgentHealthState>;
  isConnected: () => boolean;
};

export function createHealthClient(
  opts: HealthClientOptions,
  scheduler?: Scheduler,
  deps?: Partial<Deps>
): HealthClient;
```

Behavior:
- On `start()`: fetch initial snapshot, connect WebSocket
- WebSocket events routed to appropriate callbacks
- Heartbeat/pong handling (same as economy client)
- Exponential backoff reconnect with jitter
- Fallback poll at `HEALTH.FALLBACK_POLL_MS` when WS disconnected
- `fetchAgentDetail()` for on-demand drill-down

### 3.4 Alert Router (`src/health/alert-router.ts`)

Client-side alert evaluation for local responsiveness (server alerts are authoritative, but we also detect locally for faster UI feedback):

```typescript
export type AlertThresholds = {
  cpuWarningPct: number;
  cpuCriticalPct: number;
  memoryWarningPct: number;
  memoryCriticalPct: number;
  latencyWarningMs: number;
  latencyCriticalMs: number;
  errorRateWarning: number;
  errorRateCritical: number;
  cooldownMs: number;
};

export class AlertRouter {
  constructor(thresholds?: Partial<AlertThresholds>);

  /** Evaluate agent health and return new alerts (respects cooldown/dedup). */
  evaluate(state: HealthState, nowMs?: number): HealthAlert[];

  /** Mark an alert as resolved. */
  resolve(alertId: string, nowMs?: number): void;

  /** Get all currently active (unresolved) alerts. */
  getActive(): HealthAlert[];

  /** Clear all state (for testing). */
  reset(): void;
}
```

Alert priority mapping:
- **P0:** Agent offline for >60s, system error rate >20/min, >50% agents unhealthy
- **P1:** Agent unhealthy, CPU >90%, memory >90%, latency >500ms
- **Warning:** Agent degraded, CPU >70%, memory >75%, latency >150ms, error rate >5/min
- **Info:** Agent recovered, alert auto-resolved

### 3.5 Connectivity Monitor (`src/health/connectivity.ts`)

```typescript
export type ConnectivityMonitor = {
  start: () => void;
  stop: () => void;
  getStatus: () => ConnectivityState;
  onStatusChange: (cb: (status: ConnectivityState) => void) => () => void;
};

export function createConnectivityMonitor(opts?: {
  checkIntervalMs?: number;
  degradedThresholdMs?: number;
  offlineFailures?: number;
  healthUrl?: string;
}): ConnectivityMonitor;
```

Behavior:
- Periodically pings `GET /api/tactical-map/health` (lightweight)
- Measures response time → classifies as online/degraded/offline
- Tracks consecutive failures for offline detection
- Also watches WebSocket connection state from HealthClient

---

## 4. UI/UX Specifications

### 4.1 Agent Health Indicators

Each agent building on the tactical map gets a health indicator ring (similar to economy rings but distinct):

```
                    ┌──────────┐
                    │ LATENCY  │  ← tooltip on hover
                    │  23ms    │
                    └──────────┘
                         │
              ╭──── health ring ────╮
              │                     │
        ┌─────┤    [BUILDING]       ├─────┐
        │     │    [  ORACLE  ]     │     │
        │     ╰─────────────────────╯     │
        │                                 │
     [CPU]                            [MEM]
     12.4%                            25%
```

**Ring rendering:**
- **Healthy (green `0x39e58c`):** Solid ring, subtle breathing glow (0.8Hz)
- **Degraded (amber `0xffc247`):** Ring with slow pulse (1.0Hz), warning icon `⚠` 
- **Unhealthy (red `0xff3b3b`):** Ring with fast pulse (2.0Hz), error icon `⛔`, particle smoke effect
- **Offline (grey `0x555555`):** Dashed ring, no pulse, `⊘` icon, building dims to 40% alpha

**Ring arc semantics:**
- Full ring = agent status indicator
- Inner arc (clockwise from top): CPU usage proportion (0–100%)
- Outer arc (clockwise from top): Memory usage proportion (0–100%)

**Per-agent mini-stats** (rendered below building, small text):
- Latency: `23ms` (colored by threshold)
- Req/s: `8.2/s`
- Visible only at zoom ≥ 1.0 (fade in between 0.8–1.0)

### 4.2 Error State Visualization

When an agent enters `unhealthy` or `offline` status:

1. **Red pulsing aura:** Radial gradient around building, pulsing at `ERROR_PULSE_HZ` (2.0Hz)
   - Color: `0xff3366` → `0xff0000` gradient
   - Radius: building size × 1.5
   - Alpha oscillates: 0.15 → 0.45
   
2. **Error particle effect:** Reuse existing particle system with `ERROR` and `SMOKE` types
   - Rate: 6 particles/s for unhealthy, 3 for offline
   
3. **Building tint:** Building body lerps to error color over 500ms (matches existing `STATE_CROSSFADE_MS`)

4. **Nexus color update:** Existing nexus color logic already handles this via `deriveBuildingState` — extend to consider health status alongside session-based state

### 4.3 Alert Overlays

Alerts appear as floating banners at the top-center of the viewport:

```
┌──────────────────────────────────────────────────────┐
│ ⛔ P0  Oracle offline for 120s — no heartbeat        │  ← red bg
│ ⚠  P1  Sentinel latency >500ms for 60s              │  ← amber bg  
│ ℹ  OK  Verifier recovered — latency nominal          │  ← green bg (fades after 10s)
└──────────────────────────────────────────────────────┘
```

**Alert banner design:**
- Fixed position: top-center, offset 60px from top (below HUD bar)
- Max 3 visible alerts (oldest dismissed first)
- Slide-in animation: 300ms ease-out from top
- P0: Red background `rgba(255,51,102,0.92)`, white text, persistent until resolved
- P1: Amber background `rgba(255,145,0,0.92)`, white text, persistent until resolved
- Warning: Amber background `rgba(255,194,71,0.85)`, auto-dismiss after 30s
- Info: Green background `rgba(57,229,140,0.75)`, auto-dismiss after 10s

**Alert → Agent connection:**
- When an alert is active for a specific agent, draw a subtle dashed line from alert banner to the agent building
- Line pulses with alert severity color

### 4.4 Performance Metrics Display

Integrated into the agent tooltip (shown on hover/click):

```
┌─────────────────────────────────┐
│  ORACLE — Healthy ●             │
│─────────────────────────────────│
│  CPU   ████░░░░░░  12.4%       │
│  MEM   ██████░░░░  256/1024 MB │
│  p95   23ms  p99 45ms          │
│  Req/s 8.2   Err/m 0.1        │
│  ─────────────────────         │
│  [latency sparkline ~~~~~~~~]  │
│  [req/s sparkline   ~~~~~~~~]  │
│  ─────────────────────         │
│  Uptime: 1h 0m                 │
│  Connections: 3                │
│  Last heartbeat: 2s ago        │
└─────────────────────────────────┘
```

### 4.5 Connectivity Status Badge

Bottom-left corner of the viewport (opposite side from economy panel):

```
┌──────────────────────┐
│  ● Online  12ms      │  ← green dot, server latency
│  WS: Connected       │  ← WebSocket status
└──────────────────────┘
```

States:
- **Online:** Green dot `●`, shows ping latency
- **Degraded:** Amber dot `●`, shows ping latency, "Slow connection" 
- **Offline:** Red dot `●`, "Reconnecting…", animated dots

### 4.6 System-Wide Health Dashboard

Overlay panel (togglable from HUD tab bar, alongside existing tabs):

```
┌─ Health Dashboard ───────────────────┐
│                                       │
│  System Status: Healthy ●             │
│  Uptime: 4h 12m                       │
│                                       │
│  ┌──────────────────────────────┐     │
│  │  Throughput                   │     │
│  │  42.6 req/s  (peak: 120.3)  │     │
│  │  [sparkline ~~~~~~~~~~~~~~~~] │     │
│  └──────────────────────────────┘     │
│                                       │
│  ┌──────────────────────────────┐     │
│  │  Error Rate                   │     │
│  │  0.3/min  (0.007%)           │     │
│  │  [sparkline ~~~~~~~~~~~~~~~~] │     │
│  └──────────────────────────────┘     │
│                                       │
│  ┌──────────────────────────────┐     │
│  │  Resources                    │     │
│  │  CPU: 34.2%  MEM: 2.0/8.0 GB│     │
│  │  [cpu sparkline  ~~~~~~~~~~] │     │
│  │  [mem sparkline  ~~~~~~~~~~] │     │
│  └──────────────────────────────┘     │
│                                       │
│  Agents    8/8 ████████████████      │
│  oracle    ● healthy   12% cpu       │
│  atlas     ● healthy    8% cpu       │
│  sentinel  ◐ degraded  72% cpu  ⚠   │
│  verifier  ● healthy   15% cpu       │
│  archivist ● healthy    5% cpu       │
│  synth     ● healthy   22% cpu       │
│  echo      ● healthy    9% cpu       │
│  nexus     ● healthy   18% cpu       │
│                                       │
│  ┌──────────────────────────────┐     │
│  │  Active Alerts (1)            │     │
│  │  ⚠ P1 sentinel latency high  │     │
│  └──────────────────────────────┘     │
└───────────────────────────────────────┘
```

**Panel behavior:**
- Position: right side, below HUD bar (same region as economy panel when toggled)
- Toggle: new "Health" tab in HUD tab bar
- Only one overlay visible at a time (economy or health panel)
- Smooth slide-in/out animation (200ms)

---

## 5. Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Health check round-trip | < 50ms | `performance.now()` around `fetchSnapshot()` |
| Alert visibility latency | < 5s | Time from server event → rendered overlay (end-to-end) |
| Alert visibility latency (client-side) | < 500ms | Time from `healthStore` update → rendered overlay |
| Frame budget impact | < 2ms per frame | Measure health renderer `update()` in ticker |
| Memory overhead | < 5MB | Health state + history + alert buffer |
| WebSocket reconnect | < 5s | Time to re-establish after disconnect |
| Fallback poll overhead | < 1% CPU | When WS disconnected, polling at 3s intervals |
| Store update latency | < 10ms | Time for `healthStore.update()` to complete |
| Max concurrent alerts | 50 | Hard cap in state, FIFO eviction |

**Performance strategies:**
- Dirty-flag rendering (only redraw changed agents)
- Throttled dashboard panel redraws (max every 100ms)
- Sparkline history bounded to 120 points per agent
- Alert buffer capped at 50, FIFO eviction of resolved
- Mini-stats text only rendered at zoom ≥ 0.8 (LOD)
- No per-frame allocations in health renderer hot path

---

## 6. Implementation Plan

### 6.1 File Structure

```
tactical-map/
├── src/
│   ├── config.ts                          # + HEALTH, CONNECTIVITY constants
│   ├── main.ts                            # + healthStore, diagnosticStore, health client init
│   ├── data/
│   │   ├── api-client.ts                  # (existing)
│   │   ├── economy-client.ts              # (existing)
│   │   └── health-client.ts               # NEW — health API + WebSocket client
│   ├── health/                            # NEW directory
│   │   ├── types.ts                       # Health domain types
│   │   ├── normalize.ts                   # Defensive payload normalization
│   │   ├── alert-router.ts               # Client-side alert evaluation
│   │   └── connectivity.ts               # Connectivity monitor
│   ├── renderer/
│   │   ├── health-diagnostics.ts          # NEW — per-agent health indicators
│   │   └── health-dashboard.ts            # NEW — system dashboard panel
│   ├── state/
│   │   ├── store.ts                       # (existing, reused for new stores)
│   │   └── types.ts                       # + HealthState, DiagnosticState re-exports
│   └── utils/
│       ├── color.ts                       # (existing)
│       └── fetch.ts                       # (existing)
├── tests/
│   ├── unit/
│   │   ├── health-types.test.ts           # NEW
│   │   ├── health-normalize.test.ts       # NEW
│   │   ├── health-alert-router.test.ts    # NEW
│   │   ├── health-connectivity.test.ts    # NEW
│   │   ├── health-client.test.ts          # NEW
│   │   ├── health-diagnostics-layer.test.ts # NEW
│   │   └── health-dashboard.test.ts       # NEW
│   ├── integration/
│   │   └── health-api-client.test.ts      # NEW — MSW-based integration test
│   └── e2e/
│       └── health-dashboard.visual.spec.ts # NEW — Playwright visual regression
```

### 6.2 Integration Points with Existing Code

| Integration | File | Change |
|-------------|------|--------|
| Config constants | `src/config.ts` | Add `HEALTH` and `CONNECTIVITY` export blocks |
| Store creation | `src/main.ts` | Add `healthStore`, `diagnosticStore` instances |
| Client lifecycle | `src/main.ts` | Create, start, stop `HealthClient` alongside existing clients |
| Alert router | `src/main.ts` | Instantiate `AlertRouter`, wire to `healthStore.subscribe()` |
| Connectivity | `src/main.ts` | Create `ConnectivityMonitor`, wire state to renderer |
| Render layer (world) | `src/main.ts` | Add `healthDiagnostics` container to world (above buildings, below HUD) |
| Render layer (HUD) | `src/main.ts` | Add `healthDashboard` container to stage |
| Ticker update | `src/main.ts` | Call `healthDiagnostics.update(elapsedMs)` + `healthDashboard.update(elapsedMs)` |
| HUD tabs | `src/renderer/hud.ts` | Add "Health" tab, toggle panel visibility |
| Building state | `src/renderer/building-states.ts` | Extend `deriveBuildingState()` to accept optional `AgentHealthState` |
| State types | `src/state/types.ts` | Re-export health types for convenience |
| Layout | `src/main.ts` `layout()` | Position health dashboard, connectivity badge |
| Cleanup | `src/main.ts` `beforeunload` | Stop health client + connectivity monitor |

### 6.3 Implementation Order (Suggested for Synth)

**Phase A — Foundation (types + normalization + config):**
1. `src/health/types.ts` — all type definitions
2. `src/config.ts` — add HEALTH and CONNECTIVITY constants
3. `src/health/normalize.ts` — normalization functions
4. Unit tests for types and normalization

**Phase B — Data pipeline (client + stores):**
5. `src/data/health-client.ts` — HTTP + WebSocket client
6. `src/health/alert-router.ts` — alert evaluation engine
7. `src/health/connectivity.ts` — connectivity monitor
8. Unit + integration tests for data layer

**Phase C — Rendering (indicators + dashboard):**
9. `src/renderer/health-diagnostics.ts` — per-agent health indicators
10. `src/renderer/health-dashboard.ts` — system dashboard panel
11. Update `src/renderer/hud.ts` — add Health tab
12. Update `src/renderer/building-states.ts` — health-aware state derivation

**Phase D — Integration (main.ts wiring):**
13. `src/main.ts` — wire everything together
14. `src/state/types.ts` — re-export health types
15. Integration tests, E2E visual tests

### 6.4 Dependency Graph

```
types.ts ──▶ normalize.ts ──▶ health-client.ts ──▶ main.ts
   │              │                                    ▲
   │              ▼                                    │
   ├──▶ alert-router.ts ──────────────────────────────┤
   │                                                   │
   ├──▶ connectivity.ts ──────────────────────────────┤
   │                                                   │
   ├──▶ health-diagnostics.ts ────────────────────────┤
   │                                                   │
   └──▶ health-dashboard.ts ──────────────────────────┘
```

---

## 7. Test Strategy

### 7.1 Coverage Target

**Overall target: >70% line coverage for new `src/health/` and `src/data/health-client.ts` files.**

| File | Coverage Target | Test Type |
|------|----------------|-----------|
| `health/types.ts` | 100% (types only, validated via tests of consumers) | Unit |
| `health/normalize.ts` | 90%+ | Unit |
| `health/alert-router.ts` | 90%+ | Unit |
| `health/connectivity.ts` | 80%+ | Unit |
| `data/health-client.ts` | 80%+ | Unit + Integration |
| `renderer/health-diagnostics.ts` | 60%+ | Unit (mock PixiJS) |
| `renderer/health-dashboard.ts` | 60%+ | Unit (mock PixiJS) |

### 7.2 Unit Tests

**`tests/unit/health-normalize.test.ts`:**
- Parse complete snapshot → valid HealthState
- Parse partial payload → defaults applied
- Parse snake_case fields → normalized
- Parse garbage → graceful defaults (no throws)
- Apply agent update → correct merge
- Apply alert → appended to list
- Apply alert resolved → marked resolved
- Trim history to max points
- Status derivation: healthy/degraded/unhealthy/offline from metrics

**`tests/unit/health-alert-router.test.ts`:**
- Healthy agent → no alerts
- CPU > warning threshold → warning alert
- CPU > critical threshold → P1 alert
- Agent offline > 60s → P0 alert
- >50% agents unhealthy → P0 system alert
- Cooldown prevents re-firing same alert
- Escalation (warning → P1) fires immediately despite cooldown
- Resolution clears alert
- Multiple agents with different severities → correct priority ordering

**`tests/unit/health-connectivity.test.ts`:**
- Successful ping → online status
- Slow ping → degraded status
- Failed ping → tracks consecutive failures
- 3 consecutive failures → offline status
- Recovery after offline → back to online
- WebSocket state integration

**`tests/unit/health-client.test.ts`:**
- `start()` fetches initial snapshot
- WebSocket messages routed to correct callbacks
- Reconnect with exponential backoff
- Fallback polling when WS unavailable
- `stop()` cleans up timers and socket
- Heartbeat pong response

**`tests/unit/health-diagnostics-layer.test.ts`:**
- Creates containers for each agent
- Updates ring color based on status
- Pulsing animation rate matches config
- Mini-stats hidden at low zoom
- Dirty-flag only redraws changed agents

**`tests/unit/health-dashboard.test.ts`:**
- Panel layout positions correctly
- Agent list renders all 8 agents
- Alert section shows active alerts
- System status text matches state
- Toggle visibility works

### 7.3 Integration Tests

**`tests/integration/health-api-client.test.ts`:**
- MSW mocks for all health endpoints
- Full lifecycle: start → receive snapshot → WS connect → events → stop
- Error handling: 500 responses, malformed JSON, WS close codes
- Auth token forwarding

### 7.4 E2E Tests

**`tests/e2e/health-dashboard.visual.spec.ts`:**
- Screenshot: all agents healthy
- Screenshot: one agent in error state (red pulsing)
- Screenshot: P0 alert overlay visible
- Screenshot: health dashboard panel open
- Screenshot: offline connectivity badge

### 7.5 Test Utilities

```typescript
// tests/unit/health-test-helpers.ts

export function createMockHealthState(overrides?: Partial<HealthState>): HealthState;
export function createMockAgentHealth(agentId: AgentId, status?: AgentStatus): AgentHealthState;
export function createMockAlert(severity?: AlertSeverity): HealthAlert;
export function createMockMetrics(overrides?: Partial<HealthMetrics>): HealthMetrics;
```

---

## 8. Migration & Rollout

### 8.1 Backward Compatibility

- All health features are **additive** — no changes to existing Phase 5.1–5.5 behavior
- If `/api/tactical-map/health` returns 404, health features gracefully degrade (no indicators, dashboard shows "Health data unavailable")
- `deriveBuildingState()` changes are backward-compatible: health parameter is optional, behavior unchanged when absent

### 8.2 Feature Flags (Recommended)

```typescript
// In config.ts or environment variable
export const FEATURES = {
  HEALTH_INDICATORS: true,     // per-agent health rings
  HEALTH_DASHBOARD: true,      // system dashboard panel
  ALERT_OVERLAYS: true,        // floating alert banners
  CONNECTIVITY_BADGE: true,    // bottom-left connectivity
} as const;
```

### 8.3 Rollout Sequence

1. Deploy server-side health endpoints (outside this design scope)
2. Deploy client with feature flags OFF
3. Enable `HEALTH_INDICATORS` → validate per-agent display
4. Enable `ALERT_OVERLAYS` → validate alert routing
5. Enable `HEALTH_DASHBOARD` → validate full dashboard
6. Enable `CONNECTIVITY_BADGE` → validate connectivity monitor
7. Remove feature flags after 1 week stable

---

## Appendix A: Color Reference

| Status | Primary | Glow | Pulse Hz |
|--------|---------|------|----------|
| Healthy | `0x39e58c` | `rgba(57,229,140,0.15)` | 0.8 (breathing) |
| Degraded | `0xffc247` | `rgba(255,194,71,0.25)` | 1.0 |
| Unhealthy | `0xff3b3b` | `rgba(255,59,59,0.35)` | 2.0 |
| Offline | `0x555555` | none | none (dashed) |

| Alert Severity | Background | Text |
|---------------|------------|------|
| P0 | `rgba(255,51,102,0.92)` | `0xffffff` |
| P1 | `rgba(255,145,0,0.92)` | `0xffffff` |
| Warning | `rgba(255,194,71,0.85)` | `0xffffff` |
| Info | `rgba(57,229,140,0.75)` | `0xffffff` |

## Appendix B: Metric Threshold Summary

| Metric | Green | Warning | Critical |
|--------|-------|---------|----------|
| CPU % | < 70 | 70–90 | > 90 |
| Memory % | < 75 | 75–90 | > 90 |
| Latency p95 | < 150ms | 150–500ms | > 500ms |
| Errors/min | < 5 | 5–20 | > 20 |
| Heartbeat age | < 30s | 30–60s | > 60s (offline) |
