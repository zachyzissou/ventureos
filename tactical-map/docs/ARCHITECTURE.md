# Tactical Map — Architecture Guide

> **Issue #20** · VentureOS Phase 5 Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Canvas Rendering Architecture](#canvas-rendering-architecture)
4. [State Management](#state-management)
5. [Data Layer & Real-Time Updates](#data-layer--real-time-updates)
6. [Performance Optimization](#performance-optimization)
7. [Extension Patterns](#extension-patterns)
8. [Security Architecture](#security-architecture)

---

## System Overview

The Tactical Map is a real-time 2D command center built with **PIXI.js v8** and **TypeScript**. It visualizes the VentureOS multi-agent system as a tactical map, showing:

- **7 AI agents** as hexagonal buildings arranged in a ring
- **1 Central Nexus** at the hub, reflecting overall system health
- **Affinity Network** — 28 bond lines showing inter-agent collaboration affinity
- **Resource Economy** — token budgets, cost tracking, sparklines per agent
- **Mission Tracking** — task cards, dependency arrows, progress indicators
- **Particle System** — activity-driven visual effects

> **Note:** Phase 5.6 (Health & Diagnostics with CPU, memory, latency, connectivity monitoring) is currently in development. The architecture described in this document includes the planned health monitoring infrastructure.

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Rendering | PIXI.js v8 | WebGL/Canvas 2D |
| Language | TypeScript 5.7 | Strict mode |
| Build | Vite 6.1 | Dev server + bundling |
| Testing | Vitest 4.x + Playwright | Unit/integration + E2E |
| Sanitization | DOMPurify | XSS prevention |

### Agent ↔ current Mapping

| Agent ID | current Unit | Color | Role |
|----------|-------------|-------|------|
| `venture_research` | Oracle | `#7BDCFF` | Research & Foresight |
| `venture_infrastructure` | Atlas | `#00D4FF` | Infrastructure Fabricator |
| `venture_security` | Sentinel | `#4AA0FF` | Security Guardian |
| `venture_evidence` | Verifier | `#7A7DFF` | Detection & QA |
| `venture_memory` | Archivist | `#67FFD1` | Knowledge Keeper |
| `venture_delivery` | Synth | `#00E1C3` | Shadow Weaver / Creator |
| `venture_strategy` | Echo | `#FFD700` | CEO Orchestrator |
| `venture_control` | Nexus | `#FFD700` | Mission Control Hub |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ MapStore │  │ Economy  │  │ Health   │  │ Mission       │  │
│  │          │  │ Store    │  │ Store    │  │ Tracker       │  │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └──────┬────────┘  │
│        │             │             │               │            │
│  ┌─────┴─────────────┴─────────────┴───────────────┴────────┐  │
│  │                   PIXI.js Render Loop                     │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Terrain → affinity → Particles → Buildings → Units →   │  │  │
│  │  │ Nexus → Health Bars → Resource Economy →            │  │  │
│  │  │ Health Indicators → HUD → Alerts → Dashboard        │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │ API Client│  │ Economy Client │  │ Health Client          │ │
│  │ (polling) │  │ (WS + poll)    │  │ (WS + poll)            │ │
│  └─────┬─────┘  └───────┬────────┘  └──────────┬─────────────┘ │
└────────┼────────────────┼──────────────────────┼────────────────┘
         │                │                      │
    ─────┼────────────────┼──────────────────────┼─────────
         │  HTTP / WebSocket                     │
         ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              VentureOS Dashboard Server (:8001)                  │
│                                                                 │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────────────┐  │
│  │ /api/tactical │ │ /api/tactical│  │ /api/tactical-map/    │  │
│  │ -map/state   │  │ -map/       │  │ health{/stream}       │  │
│  │              │  │ resources   │  │                       │  │
│  │              │  │ {/stream}   │  │                       │  │
│  └──────────────┘  └─────────────┘  └───────────────────────┘  │
│                                                                 │
│  Middleware: Auth (pre-shared Bearer token) → CORS → CSP → Rate Limiting │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

1. **API Client** polls `/api/tactical-map/state` every 15s → updates `MapStore`
2. **Economy Client** connects via WebSocket to `/api/tactical-map/resources/stream`, falls back to polling → updates `EconomyStore`
3. **Health Client** *(Phase 5.6 - in development)* will connect via WebSocket to `/api/tactical-map/health/stream`, polls every 10s → updates `HealthStore`
4. Stores notify subscribers → renderer layers update visuals
5. PIXI.js ticker calls `update(elapsedMs)` on all layers at 60fps

---

## Canvas Rendering Architecture

### Layer Stack

The rendering pipeline uses a layered container hierarchy within PIXI.js. Layers are added in Z-order (back to front):

```
app.stage
├── world (Container — camera transforms applied here)
│   ├── terrain          Z=0   Hex grid, vignette, crystal clusters
│   ├── affinityNetwork     Z=1   28 bond curves + collaboration particles
│   ├── particles        Z=2   Activity/ambient particle system
│   ├── buildings        Z=3   7 hexagonal ring-agent buildings
│   ├── units            Z=4   Orbiting session sprites
│   ├── venture_control            Z=5   Central Nexus structure
│   ├── healthBars       Z=6   Session capacity bars per agent
│   ├── resourceEconomy  Z=7   Budget rings, sparklines, heat map
│   │   (worldContainer)
│   └── healthIndicators Z=8   Status rings, connectivity icons [in progress]
│
├── hud                  Z=9   Top bar: tabs + KPI ticker (screen space)
├── resourceEconomy      Z=10  Economy panel overlay (screen space)
│   (overlayContainer)
├── alertOverlay         Z=11  P0/P1 alert banners (screen space) [planned]
└── healthDashboard      Z=12  Full health dashboard panel (screen space) [planned]
```

> **Implementation Note:** Layers Z=0-10 are currently implemented. Layers Z=8 (healthIndicators), Z=11 (alertOverlay), and Z=12 (healthDashboard) are planned as part of Phase 5.6.

**World-space layers** (Z=0-8) are children of the `world` container, which receives camera pan/zoom transforms. **Screen-space layers** (Z=9-12) are direct children of `app.stage` and remain fixed regardless of camera position.

### Rendering Pipeline

Each frame, the PIXI.js ticker fires with `elapsedMs`:

```typescript
app.ticker.add((ticker) => {
  const elapsedMs = ticker.deltaMS;

  // 1. Camera animation (smooth reset, pan inertia)
  camera.update(elapsedMs);

  // 2. HUD scroll animation (KPI ticker)
  hud.update(elapsedMs);

  // 3. Bond line drift + particle movement
  affinityNetwork.update(elapsedMs);

  // 4. Building crossfade, pulse, jitter animations
  buildingsLayer.update(elapsedMs);

  // 5. Unit orbit animation + progress bars
  unitsLayer.update(elapsedMs);

  // 6. Nexus core pulse
  venture_control.update(elapsedMs);

  // 7. Particle emission (based on agent activity state)
  // ... emit particles per agent based on MapStore state ...
  particles.update(elapsedMs);

  // 8. Health bar flash animations
  healthBars.update(elapsedMs);

  // 9. Economy ring animations, heatmap throttled redraws
  resourceEconomy.update(elapsedMs);

  // 10. Health indicator pulsing (red/yellow status)
  healthIndicators.update(elapsedMs);

  // 11. Alert banner fade in/out
  alertOverlay.update(elapsedMs);

  // 12. Health dashboard panel updates
  healthDashboard.update(elapsedMs);
});
```

### Building States & Animation

Each agent building has 4 visual states with smooth crossfade transitions:

| State | Body Color | Glow | Animation |
|-------|-----------|------|-----------|
| `IDLE` | `#4A6FA5` | Subtle | Slow rotation |
| `ACTIVE` | `#00D4FF` | Strong | Faster rotation, bright outline |
| `OVERLOADED` | `#FF9500` | Intense | Jitter (2px), fast pulse |
| `ERROR` | `#FF3366` | Dim | Jitter (0.6px), flicker |

State transitions use a **dual-buffer crossfade** technique (see `src/renderer/buildings.ts`):
1. Target state is drawn into the back buffer
2. Alpha crossfades over `ANIMATION.STATE_CROSSFADE_MS` (500ms)
3. Buffers swap when transition completes

### Particle System

The particle system (`src/renderer/particles.ts`) uses an **object pool** pattern:

- **Hard cap**: `PARTICLES.MAX` (500) active particles
- **Ambient target**: 120 persistent background particles
- **Pool recycling**: Dead particles return to a pool, avoiding GC pressure
- **Deterministic RNG**: Mulberry32 PRNG seeded for reproducible visual tests
- **8 particle kinds**: `AMBIENT`, `TYPING`, `COMPILING`, `DEPLOY`, `SCAN`, `SPARK`, `SMOKE`, `ERROR`

Emission is rate-based via `emitRate(kind, origin, rate, elapsedMs)`, which uses a fractional accumulator to produce smooth particle streams independent of frame rate.

### Affinity Network Rendering

The bond visualization (`src/renderer/affinity-network.ts`) renders 28 agent-pair connections:

1. **Path calculation**: Quadratic Bézier curves with collision avoidance against building footprints
2. **5-tier affinity system**: Colors range from dim blue (nascent) to gold (synergistic)
3. **Organic motion**: Control point drift + alpha pulsing for natural feel
4. **Collaboration particles**: Sprites travel along bond paths at tier-dependent speeds
5. **Throttled redraw**: Line geometry rebuilds every `BONDS.LINE_REDRAW_MS` (100ms), not every frame

---

## State Management

### Store Architecture

The Tactical Map uses a **minimal reactive store** pattern (see `src/state/store.ts`):

```typescript
type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  update: (fn: (curr: T) => T) => void;
  subscribe: (fn: (next: T) => void) => Unsubscribe;
};
```

This is a simplified Redux-like pattern without actions/reducers — just direct state replacement with subscriber notification. Three independent stores manage the application state:

```
┌──────────────────────────────────────────────────┐
│                   Stores                          │
│                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐│
│  │  mapStore    │  │ economyStore │  │healthStore││
│  │  MapState    │  │ EconomyState │  │HealthState││
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘│
│         │                │                 │      │
│  Subscribers:     Subscribers:       Subscribers: │
│  - Buildings      - ResourceEconomy  - HealthInd. │
│  - Units          - AlertManager     - AlertOverlay│
│  - HealthBars     - Console.warn     - Dashboard  │
│  - affinity links                       - HealthAlert│
│  - Nexus color                         Manager    │
└──────────────────────────────────────────────────┘
```

### MapState

```typescript
type MapState = {
  updatedAt: string;
  agents: Record<AgentId, {
    id: AgentId;
    position: Point;           // World-space coordinates
    state: BuildingState;      // 'IDLE' | 'ACTIVE' | 'OVERLOADED' | 'ERROR'
    sessions?: number;         // Current session count
    activeSessions?: AgentSession[];  // Detailed session info
  }>;
};
```

### EconomyState

```typescript
type EconomyState = {
  updatedAt: number;
  agents: Record<AgentId, {
    agentId: AgentId;
    tokenBudget: number;
    tokensUsed: number;
    tokensRemaining: number;
    usageRatio: number;        // 0-1
    costUsd: number;
    burnRateUsdPerHour: number;
    health: 'green' | 'yellow' | 'red';
    history: TrendPoint[];     // Bounded time-series
  }>;
  pool: ResourcePoolState;     // Global token/cost budgets
};
```

### HealthState

```typescript
type HealthState = {
  agents: Record<AgentId, {
    agentId: AgentId;
    status: 'green' | 'yellow' | 'red';
    connectivity: 'online' | 'offline' | 'degraded';
    metrics: PerformanceMetrics;  // CPU, memory, latency, RPS, error rate, uptime
    history: MetricsSample[];     // Bounded time-series
    consecutiveFailures: number;
    errors: string[];
  }>;
  system: SystemHealthState;   // Aggregated across all agents
  alerts: HealthAlert[];       // Active P0/P1 alerts
};
```

### State Update Flow

```
API Response → Normalization → Store.update() → Subscribers notified → Renderers update
```

All normalization functions are **pure** (in `economy/state.ts`, `health/state.ts`). They handle:
- Missing/partial fields with fallback values
- Multiple field name variants (e.g., `tokensUsed` vs `usedTokens` vs `spentTokens`)
- Timestamp parsing (ISO strings, epoch ms, numeric strings)
- History trimming (bounded by `maxPoints` and `maxAgeMs`)
- Derived metrics (burn rate from time-series deltas, health tier from ratios)

---

## Data Layer & Real-Time Updates

### API Client (Polling)

**File:** `src/data/api-client.ts`

Polls the map state endpoint with exponential backoff on errors:

```
Normal:  Poll every 15s (API.POLL_INTERVAL)
Error:   Backoff doubles each failure, capped at 120s
Recovery: Resets to 15s on successful response
```

### Economy Client (WebSocket + Fallback Polling)

**File:** `src/data/economy-client.ts`

```
┌──────┐         ┌───────────────────────┐
│Client│         │  Dashboard Server     │
└──┬───┘         └───────────┬───────────┘
   │  GET /resources         │
   │────────────────────────>│  Initial snapshot
   │<────────────────────────│
   │                         │
   │  WS /resources/stream   │
   │═══════════════════════>│  Upgrade to WebSocket
   │                         │
   │  { type: "subscribe",   │
   │    topic: "resource_economy" }
   │────────────────────────>│
   │                         │
   │  { type: "snapshot" }   │
   │<────────────────────────│  Full state
   │                         │
   │  { type: "agent_update"}│
   │<────────────────────────│  Incremental update
   │                         │
   │  { type: "heartbeat" }  │
   │<────────────────────────│  Keep-alive
   │  { type: "pong" }       │
   │────────────────────────>│
   │                         │
   │  [connection lost]      │
   │         ×               │
   │                         │
   │  Fallback: poll /resources every 2s
   │  Reconnect: exponential backoff (1s → 30s + jitter)
```

### Health Client (WebSocket + Polling)

**File:** `src/data/health-client.ts`

Same pattern as Economy Client, with:
- Poll interval: 10s
- WebSocket events: `health_snapshot`, `agent_health`, `health_alert`, `heartbeat`
- Reconnect backoff: 2s → 30s

### WebSocket Event Types

| Topic | Event Type | Payload |
|-------|-----------|---------|
| `resource_economy` | `snapshot` | Full `RawEconomySnapshot` |
| `resource_economy` | `agent_update` | Single `RawAgentEconomy` |
| `resource_economy` | `pool_update` | `RawPoolEconomy` |
| `resource_economy` | `heartbeat` | `{ ts: number }` |
| `health` | `health_snapshot` | Full `RawHealthSnapshot` |
| `health` | `agent_health` | Single `RawAgentHealth` |
| `health` | `health_alert` | `RawHealthEvent['alert']` |
| `health` | `heartbeat` | `{ ts: number }` |

### Authentication

All API requests include a Bearer token:

```typescript
const token = getAuthToken();
// Checks: localStorage.token, localStorage.authToken, 
//         localStorage.auth_token, cookie:token, cookie:authToken
headers.Authorization = `Bearer ${token}`;
```

WebSocket connections pass the token as a query parameter:
```
wss://host/api/tactical-map/resources/stream?token=<token>
```

> **Security note:** Prefer sending the token via a `Sec-WebSocket-Protocol` sub-protocol header or an initial `auth` message after connection, rather than a query parameter. Query strings may be logged by proxies and appear in server access logs. The query-parameter method is supported for backwards compatibility but is not recommended for new integrations.

---

## Performance Optimization

### Rendering Optimizations

| Strategy | Implementation | Impact |
|----------|---------------|--------|
| **Dirty-flag redraws** | Agent economy indicators only redraw when their data signature changes | Avoids per-frame full redraws |
| **Throttled heatmap** | Heat map redraws at most every `ECONOMY.HEATMAP_REDRAW_MS` (90ms) | Prevents GPU thrash |
| **Object pooling** | Particle system recycles Sprite objects | Eliminates GC pressure |
| **Bounded geometry** | affinity bond line geometry rebuilds throttled to 100ms | Reduces path calculation cost |
| **Off-screen culling** | Particles outside ±2200px/±1400px are killed | Prevents unbounded growth |
| **Hard caps** | Max 500 particles, max 64 history points, max 50 alerts | Memory bounds |
| **Deterministic RNG** | Mulberry32 PRNG for particle/ambient positions | Reproducible visual tests |

### State Update Optimizations

| Strategy | Details |
|----------|---------|
| **Incremental updates** | WebSocket delivers per-agent deltas, not full snapshots |
| **Signature-based skip** | Economy layer computes a string signature per agent; skips redraw if unchanged |
| **Bounded history** | Time-series capped by count (`maxPoints`) and age (`maxAgeMs`) |
| **Exponential backoff** | Failed API calls back off to reduce server load |
| **Fallback polling** | WebSocket disconnect triggers lower-cadence REST polling |

### Memory Management

- History arrays trimmed on every update (see `pushTrendPoint` and `trimHistory`)
- Alert list capped at 50; oldest resolved alerts evicted first
- Particle pool grows on demand but dead particles are recycled, not allocated fresh

---

## Extension Patterns

### Adding a New Renderer Layer

1. Create `src/renderer/your-layer.ts`:

```typescript
import { Container } from 'pixi.js';

export type YourLayer = {
  container: Container;
  update: (elapsedMs: number) => void;
  // ... your public API
};

export function createYourLayer(): YourLayer {
  const container = new Container();
  
  function update(elapsedMs: number) {
    // Per-frame animation logic
  }
  
  return { container, update };
}
```

2. In `src/main.ts`, add to the layer stack:
```typescript
const yourLayer = createYourLayer();
world.addChild(yourLayer.container);  // or app.stage for screen-space
```

3. Add to the ticker loop:
```typescript
app.ticker.add((ticker) => {
  // ...existing layers...
  yourLayer.update(ticker.deltaMS);
});
```

4. Wire to store subscriptions if needed:
```typescript
mapStore.subscribe((s) => {
  yourLayer.setData(s.agents);
});
```

### Adding a New Data Client

Follow the established pattern (see `src/data/economy-client.ts`):

1. Create `src/data/your-client.ts` with:
   - `fetchSnapshot()` for initial/fallback REST
   - WebSocket connection with subscribe handshake
   - Event parsing with `type: 'snapshot' | 'agent_update' | 'heartbeat'`
   - Reconnect with exponential backoff + jitter
   - Fallback polling when WebSocket is unavailable

2. Create a new store in `main.ts`:
```typescript
const yourStore = createStore<YourState>(createEmptyYourState());
```

3. Wire the client to the store:
```typescript
const yourClient = createYourClient({
  onSnapshot: (s) => yourStore.update(curr => applySnapshot(curr, s)),
  onAgentUpdate: (a) => yourStore.update(curr => applyUpdate(curr, a)),
});
yourClient.start();
```

### Adding a New Agent Activity Pattern

In `src/data/activity-mapper.ts`, add patterns to the agent's array:

```typescript
export const ACTIVITY_PATTERNS: Record<AgentId, ActivityPattern[]> = {
  your_agent: [
    p('your:action:match', /\byour_keyword\b/, ActivityType.YOUR_ACTIVITY),
  ],
};
```

Pattern rules:
- Keep regexes simple (no catastrophic backtracking)
- Order matters: earlier patterns win
- Input is capped to 200 chars and lowercased before matching

---

## Security Architecture

### Input Sanitization

All untrusted strings (from API, DB, user input) are sanitized before rendering:

- **DOMPurify** strips HTML tags/attributes (`src/utils/sanitize.ts`)
- Session labels capped at 200 chars before regex matching
- KPI text capped at 800 chars
- Unit labels sanitized via `sanitizePlainText()`

### Server-Side Security Layers

The dashboard server applies a middleware pipeline:

```
Request → Auth (Bearer token) → CORS (origin whitelist) → CSP → Rate Limiting → Route Handler
```

| Middleware | File | Policy |
|-----------|------|--------|
| **Auth** | `tactical-map-server/middleware/auth.ts` | Pre-shared API key, timing-safe comparison |
| **CORS** | `tactical-map-server/middleware/cors.ts` | Whitelist: `localhost:{8001,5174,5173}` |
| **CSP** | `tactical-map-server/middleware/csp.ts` | `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` |

### Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';  /* PIXI.js inline styles */
img-src 'self' data:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
```

---

## Key Source Files Reference

| File | Purpose |
|------|---------|
| `src/main.ts` | Bootstrap, layer composition, store wiring, render loop |
| `src/config.ts` | Single source of truth for all constants |
| `src/state/store.ts` | Generic reactive store implementation |
| `src/state/types.ts` | MapState, AgentNode, BuildingState types |
| `src/data/api-client.ts` | REST polling client for map state |
| `src/data/economy-client.ts` | WebSocket + REST client for economy |
| `src/data/health-client.ts` | WebSocket + REST client for health |
| `src/data/activity-mapper.ts` | Session label → activity type classifier |
| `src/renderer/terrain.ts` | Hex grid, vignette, crystals |
| `src/renderer/buildings.ts` | Agent buildings with crossfade |
| `src/renderer/venture_control.ts` | Central Nexus structure |
| `src/renderer/units.ts` | Orbiting session sprites |
| `src/renderer/particles.ts` | Object-pooled particle system |
| `src/renderer/affinity-network.ts` | Bond visualization with particles |
| `src/renderer/resource-economy.ts` | Budget rings, sparklines, heatmap |
| `src/renderer/health-indicators.ts` | Per-agent health rings |
| `src/renderer/health-dashboard.ts` | System health overlay panel |
| `src/renderer/alert-overlay.ts` | P0/P1 alert banners |
| `src/renderer/hud.ts` | Tab bar + KPI ticker |
| `src/economy/state.ts` | Economy state normalization (pure) |
| `src/economy/types.ts` | Economy type definitions |
| `src/economy/alerts.ts` | Budget alert manager |
| `src/health/state.ts` | Health state normalization (pure) |
| `src/health/types.ts` | Health type definitions |
| `src/health/alerts.ts` | Health alert manager |
| `src/health/metrics.ts` | Sparkline extraction, health scoring |
| `src/interaction/camera.ts` | Pan, zoom, reset controller |
| `src/affinity/affinity.ts` | Tier/color/speed mapping |
| `src/affinity/path.ts` | Bézier path + obstacle avoidance |
| `src/affinity/seed.ts` | 28-bond seed data |
| `src/missions/` | Mission tracking module (Phase 5.5) |
