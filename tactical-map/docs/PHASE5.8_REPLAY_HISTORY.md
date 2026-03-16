# Phase 5.8 — Replay & History System

> **Issue #17** · VentureOS Tactical Map
> **Status:** Design Phase (Archivist implements from this spec)

## Summary

Phase 5.8 adds a full session replay and history system to the Tactical Map. Users can record live sessions, replay them with VCR-style controls (play/pause/rewind/fast-forward/scrub), view synchronized event logs, compare before/after snapshots, overlay historical metrics, and export sessions as video/GIF. The design preserves the existing current visual language and integrates into the Phase 5.1–5.6 renderer and store architecture.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Model](#2-data-model)
3. [Session Recording Pipeline](#3-session-recording-pipeline)
4. [Replay Engine Design](#4-replay-engine-design)
5. [Time Scrubber UI/UX](#5-time-scrubber-uiux)
6. [Event Log Synchronization](#6-event-log-synchronization)
7. [Snapshot Comparison](#7-snapshot-comparison)
8. [Metrics Overlay](#8-metrics-overlay)
9. [Export Pipeline](#9-export-pipeline)
10. [API Endpoints](#10-api-endpoints)
11. [Performance Strategy](#11-performance-strategy)
12. [Testing Approach](#12-testing-approach)
13. [Implementation Plan](#13-implementation-plan)
14. [Open Questions & Decisions](#14-open-questions--decisions)

---

## 1. Architecture Overview

### 1.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Browser (Client)                                  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        RECORDING PATH                                 │  │
│  │                                                                       │  │
│  │  Store Subscribers ──▶ SessionRecorder ──▶ EventBuffer ──▶ IndexedDB  │  │
│  │  (map/economy/health)    (captures)        (batches)       (persist)  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        REPLAY PATH                                    │  │
│  │                                                                       │  │
│  │  IndexedDB ──▶ ReplayEngine ──▶ Virtual Stores ──▶ Existing Renderer  │  │
│  │  (load)        (time control)   (injected state)   (unchanged layers) │  │
│  │                     │                                                 │  │
│  │                     ├──▶ EventLogPanel (synchronized event feed)      │  │
│  │                     ├──▶ MetricsOverlay (historical charts)           │  │
│  │                     └──▶ TimeScrubber (VCR controls + timeline)       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        EXPORT PATH                                    │  │
│  │                                                                       │  │
│  │  ReplayEngine ──▶ FrameCapturer ──▶ VideoEncoder (WebCodecs/WASM)    │  │
│  │  (step frames)     (canvas.toBlob)   (MP4/WebM/GIF output)           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────┐                                                   │
│  │  Server Sync (opt.)  │                                                   │
│  │  Upload/download     │                                                   │
│  │  session archives    │                                                   │
│  └──────────┬───────────┘                                                   │
└─────────────┼───────────────────────────────────────────────────────────────┘
              │ HTTP (optional)
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Dashboard Server (:8001)                                  │
│                                                                             │
│  GET  /api/tactical-map/sessions          (list stored sessions)            │
│  GET  /api/tactical-map/sessions/:id      (download session archive)        │
│  POST /api/tactical-map/sessions          (upload session archive)          │
│  DEL  /api/tactical-map/sessions/:id      (delete session archive)          │
│                                                                             │
│  Storage: filesystem (gzipped NDJSON) or SQLite                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Design Principles

1. **Non-invasive recording** — Recording hooks into existing store subscriptions. Zero changes to renderer layers, data clients, or the main render loop.
2. **Virtual store injection** — During replay, the replay engine writes to the same `mapStore`, `economyStore`, `healthStore` instances, but the live data clients are paused. Existing renderers work unchanged.
3. **Client-first storage** — Sessions are stored in IndexedDB by default. Server sync is optional and additive.
4. **Event-sourced model** — Sessions are stored as ordered event streams, not frame-by-frame screenshots. This gives 100x compression vs pixel capture and enables arbitrary seek speeds.
5. **Checkpoint-based seeking** — Periodic full-state snapshots (checkpoints) enable O(1) seek to any checkpoint, then linear replay of remaining events. Target: <100ms seek time.
6. **Progressive rendering** — Export runs the replay engine in headless-step mode at configurable FPS, capturing canvas frames without blocking the UI.

### 1.3 Component Responsibilities

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| **SessionRecorder** | `src/replay/recorder.ts` | Subscribe to stores, emit typed events, manage recording lifecycle |
| **EventBuffer** | `src/replay/event-buffer.ts` | Batch events, insert checkpoints, write to storage |
| **SessionStorage** | `src/replay/storage.ts` | IndexedDB CRUD for sessions and event chunks |
| **ReplayEngine** | `src/replay/engine.ts` | Time control (play/pause/seek/speed), event application, checkpoint management |
| **TimeScrubber** | `src/replay/time-scrubber.ts` | PIXI.js UI: timeline bar, playhead, VCR buttons, speed selector |
| **EventLogPanel** | `src/replay/event-log-panel.ts` | PIXI.js UI: scrolling event feed synced to playback time |
| **MetricsOverlay** | `src/replay/metrics-overlay.ts` | PIXI.js UI: sparklines/charts overlaid during playback |
| **SnapshotComparator** | `src/replay/snapshot-comparator.ts` | Diff two states, highlight changes in renderer |
| **FrameCapturer** | `src/replay/frame-capturer.ts` | Canvas-to-blob capture at configurable FPS |
| **VideoEncoder** | `src/replay/video-encoder.ts` | WebCodecs MP4/WebM encoding, fallback GIF encoder |
| **ReplayClient** | `src/data/replay-client.ts` | Optional server sync (upload/download session archives) |

---

## 2. Data Model

### 2.1 Session Metadata

```typescript
interface SessionMeta {
  /** Unique session ID (UUID v4). */
  id: string;
  /** Human-readable session name. */
  name: string;
  /** Optional description/notes. */
  description?: string;
  /** Recording start time (epoch ms). */
  startedAt: number;
  /** Recording end time (epoch ms). Null if still recording. */
  endedAt: number | null;
  /** Duration in ms (derived: endedAt - startedAt). */
  durationMs: number;
  /** Total event count. */
  eventCount: number;
  /** Total checkpoint count. */
  checkpointCount: number;
  /** Number of event chunks stored. */
  chunkCount: number;
  /** Compressed size in bytes (total across all chunks). */
  compressedBytes: number;
  /** Schema version for forward compatibility. */
  schemaVersion: number;
  /** Tags for filtering/organization. */
  tags: string[];
  /** Which stores were captured. */
  capturedStores: ('map' | 'economy' | 'health')[];
}
```

### 2.2 Event Types

All events share a common envelope:

```typescript
/** Discriminated union tag for all replay events. */
type ReplayEventType =
  | 'checkpoint'         // Full state snapshot (all stores)
  | 'map.full'           // Full MapState replacement
  | 'map.agent'          // Single agent update
  | 'economy.full'       // Full EconomyState replacement
  | 'economy.agent'      // Single agent economy update
  | 'economy.pool'       // Pool economy update
  | 'health.full'        // Full HealthState replacement
  | 'health.agent'       // Single agent health update
  | 'health.alert'       // Health alert added/resolved
  | 'health.system'      // System health summary change
  | 'user.camera'        // Camera position/zoom change
  | 'user.tab'           // HUD tab switch
  | 'user.annotation'    // User-added annotation/marker
  | 'marker.phase'       // Auto-detected phase transition
  | 'marker.incident';   // Auto-detected incident (error state)

interface ReplayEventBase {
  /** Monotonic sequence number within the session. */
  seq: number;
  /** Wall-clock timestamp (epoch ms). */
  ts: number;
  /** Event type discriminator. */
  type: ReplayEventType;
}
```

### 2.3 Concrete Event Types

```typescript
/** Full checkpoint — captures all store states for instant seek. */
interface CheckpointEvent extends ReplayEventBase {
  type: 'checkpoint';
  data: {
    map: MapState;
    economy: EconomyState;
    health: HealthState;
    camera: CameraState;
  };
}

/** MapState replacement (from API polling). */
interface MapFullEvent extends ReplayEventBase {
  type: 'map.full';
  data: MapState;
}

/** Single agent state change. */
interface MapAgentEvent extends ReplayEventBase {
  type: 'map.agent';
  data: {
    agentId: AgentId;
    state: BuildingState;
    sessions?: number;
    activeSessions?: AgentSession[];
  };
}

/** Full economy snapshot. */
interface EconomyFullEvent extends ReplayEventBase {
  type: 'economy.full';
  data: EconomyState;
}

/** Single agent economy update. */
interface EconomyAgentEvent extends ReplayEventBase {
  type: 'economy.agent';
  data: AgentEconomyState;
}

/** Pool economy update. */
interface EconomyPoolEvent extends ReplayEventBase {
  type: 'economy.pool';
  data: ResourcePoolState;
}

/** Full health snapshot. */
interface HealthFullEvent extends ReplayEventBase {
  type: 'health.full';
  data: HealthState;
}

/** Single agent health update. */
interface HealthAgentEvent extends ReplayEventBase {
  type: 'health.agent';
  data: AgentHealthState;
}

/** Health alert event. */
interface HealthAlertEvent extends ReplayEventBase {
  type: 'health.alert';
  data: HealthAlert;
}

/** System-wide health summary update. */
interface HealthSystemEvent extends ReplayEventBase {
  type: 'health.system';
  data: SystemHealthState;
}

/** Camera position change (for replay fidelity). */
interface CameraEvent extends ReplayEventBase {
  type: 'user.camera';
  data: CameraState;
}

/** HUD tab switch. */
interface TabEvent extends ReplayEventBase {
  type: 'user.tab';
  data: { tabId: string };
}

/** User-created annotation. */
interface AnnotationEvent extends ReplayEventBase {
  type: 'user.annotation';
  data: {
    id: string;
    text: string;
    position?: { x: number; y: number };
    agentId?: AgentId;
    color?: string;
  };
}

/** Auto-detected phase marker (state transition). */
interface PhaseMarkerEvent extends ReplayEventBase {
  type: 'marker.phase';
  data: {
    agentId: AgentId;
    fromState: BuildingState;
    toState: BuildingState;
  };
}

/** Auto-detected incident marker. */
interface IncidentMarkerEvent extends ReplayEventBase {
  type: 'marker.incident';
  data: {
    agentId: AgentId | 'system';
    severity: 'warning' | 'critical';
    message: string;
  };
}

/** Union of all replay event types. */
type ReplayEvent =
  | CheckpointEvent
  | MapFullEvent
  | MapAgentEvent
  | EconomyFullEvent
  | EconomyAgentEvent
  | EconomyPoolEvent
  | HealthFullEvent
  | HealthAgentEvent
  | HealthAlertEvent
  | HealthSystemEvent
  | CameraEvent
  | TabEvent
  | AnnotationEvent
  | PhaseMarkerEvent
  | IncidentMarkerEvent;
```

### 2.4 Storage Layout (IndexedDB)

```
Database: "ventureos-replay" (version 1)

Object Stores:
┌─────────────────────────────────────────────────────────────────┐
│ sessions                                                         │
│   Key: id (string)                                               │
│   Value: SessionMeta                                             │
│   Indexes: startedAt, tags                                       │
├─────────────────────────────────────────────────────────────────┤
│ chunks                                                           │
│   Key: [sessionId, chunkIndex] (compound)                        │
│   Value: {                                                       │
│     sessionId: string,                                           │
│     chunkIndex: number,                                          │
│     startSeq: number,     // first event seq in chunk            │
│     endSeq: number,       // last event seq in chunk             │
│     startTs: number,      // first event ts                      │
│     endTs: number,        // last event ts                       │
│     eventCount: number,                                          │
│     data: Uint8Array      // gzip-compressed NDJSON              │
│   }                                                              │
│   Indexes: sessionId, [sessionId, startTs]                       │
├─────────────────────────────────────────────────────────────────┤
│ checkpoints                                                      │
│   Key: [sessionId, seq] (compound)                               │
│   Value: {                                                       │
│     sessionId: string,                                           │
│     seq: number,                                                 │
│     ts: number,                                                  │
│     chunkIndex: number,   // which chunk contains this cp        │
│     offsetInChunk: number,// byte offset within decompressed     │
│     data: CheckpointEvent // full state for instant restore      │
│   }                                                              │
│   Indexes: sessionId, [sessionId, ts]                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.5 Chunk Sizing Strategy

- **Target chunk size:** 256KB compressed (~1–5 minutes of events depending on activity)
- **Checkpoint interval:** Every 30 seconds OR every 200 events (whichever comes first)
- **Max events per chunk:** 2000 (hard limit, forces new chunk)
- **Compression:** `CompressionStream('gzip')` (native browser API, no dependency)

Rationale: Smaller chunks enable faster random access (only decompress the chunk containing the target event). Checkpoints every 30s mean max 30s of linear replay after seeking to a checkpoint. Combined with typical event rates (5–20 events/sec from store updates), this keeps seek-to-playback under 100ms.

### 2.6 Schema Versioning

```typescript
const CURRENT_SCHEMA_VERSION = 1;

/** Migration registry. */
const MIGRATIONS: Record<number, (event: unknown) => ReplayEvent> = {
  // Version 1 is the baseline — no migration needed.
  // Future: { 2: migrateV1toV2 }
};
```

Sessions store their `schemaVersion`. On load, if the version is older than `CURRENT_SCHEMA_VERSION`, events are migrated through the chain. If the version is newer (created by a future client), the session is marked read-only and a warning is displayed.

---

## 3. Session Recording Pipeline

### 3.1 Recorder Lifecycle

```
              ┌──────┐    start()    ┌───────────┐   stop()   ┌─────────┐
              │ IDLE │──────────────▶│ RECORDING │───────────▶│ STOPPED │
              └──────┘               └───────────┘            └─────────┘
                                          │
                                     pause()/resume()
                                          │
                                     ┌────▼─────┐
                                     │  PAUSED  │
                                     └──────────┘
```

### 3.2 Recording Flow

1. **`start()`** — Creates a new `SessionMeta`, subscribes to `mapStore`, `economyStore`, `healthStore`. Captures an initial checkpoint.

2. **Store subscription callbacks** — On each store update, the recorder:
   - Creates a `ReplayEvent` with the current `seq` and `Date.now()` timestamp
   - For full store replacements: emits `*.full` events
   - For incremental updates (detected by diffing): emits granular `*.agent` events
   - Pushes event to the `EventBuffer`

3. **Automatic checkpoints** — The `EventBuffer` inserts a `CheckpointEvent` every `CHECKPOINT_INTERVAL_MS` (30s) or every `CHECKPOINT_INTERVAL_EVENTS` (200 events).

4. **Automatic markers** — The recorder detects:
   - Building state transitions → `marker.phase` events
   - ERROR state entries → `marker.incident` events
   - Health alerts → `marker.incident` events

5. **`stop()`** — Flushes the buffer, writes a final checkpoint, updates `SessionMeta.endedAt`, unsubscribes from stores.

### 3.3 Incremental Diffing

To minimize event size, the recorder maintains a shadow copy of the last-seen state for each store. On each subscription callback:

```typescript
function diffMapState(prev: MapState, next: MapState): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  
  // Check if updatedAt changed (API poll happened)
  if (prev.updatedAt !== next.updatedAt) {
    // Check individual agents
    for (const id of AGENT_ORDER) {
      const pa = prev.agents[id];
      const na = next.agents[id];
      if (pa.state !== na.state || pa.sessions !== na.sessions || 
          JSON.stringify(pa.activeSessions) !== JSON.stringify(na.activeSessions)) {
        events.push({ type: 'map.agent', data: { agentId: id, ...na } });
      }
    }
    // If many agents changed, fall back to full event
    if (events.length > 4) {
      return [{ type: 'map.full', data: next }];
    }
  }
  return events;
}
```

Similar diffing for economy and health stores. The threshold for falling back to a full event (>4 agent changes) is configurable.

### 3.4 EventBuffer Design

```typescript
interface EventBufferConfig {
  /** Max events before auto-flushing to storage. Default: 500. */
  flushThreshold: number;
  /** Max time between flushes in ms. Default: 10_000. */
  flushIntervalMs: number;
  /** Checkpoint interval in ms. Default: 30_000. */
  checkpointIntervalMs: number;
  /** Checkpoint interval in events. Default: 200. */
  checkpointIntervalEvents: number;
}

interface EventBuffer {
  /** Push a single event. May trigger flush or checkpoint. */
  push(event: ReplayEvent): void;
  /** Force flush all buffered events to storage. */
  flush(): Promise<void>;
  /** Force a checkpoint at the current position. */
  checkpoint(state: CheckpointEvent['data']): void;
  /** Total events buffered (not yet flushed). */
  readonly pendingCount: number;
  /** Destroy: flush + clear timers. */
  destroy(): Promise<void>;
}
```

The buffer maintains an in-memory array. When `flushThreshold` or `flushIntervalMs` is reached, it compresses events to NDJSON, writes a `chunks` record to IndexedDB, and optionally writes a `checkpoints` record if a checkpoint was included in the batch.

### 3.5 Compression

```typescript
async function compressEvents(events: ReplayEvent[]): Promise<Uint8Array> {
  const ndjson = events.map(e => JSON.stringify(e)).join('\n');
  const blob = new Blob([ndjson]);
  const cs = new CompressionStream('gzip');
  const compressed = blob.stream().pipeThrough(cs);
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

async function decompressChunk(data: Uint8Array): Promise<ReplayEvent[]> {
  const blob = new Blob([data]);
  const ds = new DecompressionStream('gzip');
  const text = await new Response(blob.stream().pipeThrough(ds)).text();
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
}
```

---

## 4. Replay Engine Design

### 4.1 Engine State Machine

```
                     ┌──────────┐
          load()     │          │    unload()
     ┌──────────────▶│  LOADED  │◀──────────────┐
     │               │          │               │
     │               └────┬─────┘               │
     │                    │ play()               │
┌────┴─────┐         ┌───▼──────┐          ┌────┴─────┐
│  EMPTY   │         │ PLAYING  │◀────────▶│  PAUSED  │
│          │         │          │ pause()  │          │
└──────────┘         └────┬─────┘ resume() └────┬─────┘
                          │                     │
                          │ seek()              │ seek()
                          ▼                     ▼
                     ┌──────────┐          ┌──────────┐
                     │ SEEKING  │          │ SEEKING  │
                     │          │──────────│          │
                     └──────────┘          └──────────┘
                          │ (seek complete)
                          ▼
                     (return to previous state: PLAYING or PAUSED)
```

### 4.2 Core Engine Interface

```typescript
interface ReplayEngineConfig {
  /** Stores to drive during replay. */
  mapStore: Store<MapState>;
  economyStore: Store<EconomyState>;
  healthStore: Store<HealthState>;
  /** Camera controller for replaying camera events. */
  camera: CameraController;
  /** Callback when playback time changes. */
  onTimeUpdate: (timeMs: number) => void;
  /** Callback when an event is applied. */
  onEvent: (event: ReplayEvent) => void;
  /** Callback when playback state changes. */
  onStateChange: (state: ReplayEngineState) => void;
  /** Callback when playback reaches the end. */
  onEnd: () => void;
}

type ReplayEngineState = 'empty' | 'loaded' | 'playing' | 'paused' | 'seeking';

interface ReplayEngine {
  /** Load a session by ID from storage. */
  load(sessionId: string): Promise<SessionMeta>;
  /** Unload the current session, freeing memory. */
  unload(): void;

  /** Start or resume playback. */
  play(): void;
  /** Pause playback. */
  pause(): void;
  /** Seek to a specific time (epoch ms). Returns actual landed time. */
  seek(timeMs: number): Promise<number>;

  /** Set playback speed multiplier (0.25x, 0.5x, 1x, 2x, 4x, 8x, 16x). */
  setSpeed(multiplier: number): void;
  /** Get current playback speed. */
  getSpeed(): number;

  /** Get current playback time (epoch ms). */
  getCurrentTime(): number;
  /** Get session start time. */
  getStartTime(): number;
  /** Get session end time. */
  getEndTime(): number;
  /** Get session duration in ms. */
  getDuration(): number;

  /** Get current engine state. */
  getState(): ReplayEngineState;
  /** Get the loaded session metadata. */
  getSessionMeta(): SessionMeta | null;

  /** Step forward by N events (for export mode). */
  stepForward(count: number): Promise<void>;
  /** Step to the next event's timestamp. Returns the event or null if at end. */
  stepToNextEvent(): Promise<ReplayEvent | null>;

  /** Get all events in a time range (for event log panel). */
  getEventsInRange(startMs: number, endMs: number): Promise<ReplayEvent[]>;

  /** Get checkpoint markers (for timeline decoration). */
  getCheckpoints(): Array<{ seq: number; ts: number }>;
  /** Get incident/phase markers (for timeline decoration). */
  getMarkers(): Array<{ seq: number; ts: number; type: string; data: unknown }>;

  /** Called from the PIXI ticker each frame. */
  update(elapsedMs: number): void;

  /** Destroy and release resources. */
  destroy(): void;
}
```

### 4.3 Playback Algorithm

The engine maintains:

```typescript
// Internal state
let currentTime: number;          // Current playback time (epoch ms)
let eventCursor: number;          // Index into the current chunk's event array
let currentChunkIndex: number;    // Which chunk is loaded in memory
let currentChunkEvents: ReplayEvent[]; // Decompressed events for current chunk
let speed: number;                // Playback multiplier
let state: ReplayEngineState;
```

**Per-frame `update(elapsedMs)`:**

```
1. If state !== 'playing', return early.
2. Advance currentTime by (elapsedMs * speed).
3. While eventCursor points to an event with ts <= currentTime:
   a. Apply the event to the appropriate store.
   b. Fire onEvent callback.
   c. Advance eventCursor.
   d. If eventCursor exceeds current chunk bounds:
      - Load next chunk (async, pre-fetched — see §4.5).
      - If no next chunk, fire onEnd(), transition to 'paused'.
4. Fire onTimeUpdate(currentTime).
```

**Event application** is straightforward — each event type maps to a store operation:

```typescript
function applyEvent(event: ReplayEvent): void {
  switch (event.type) {
    case 'checkpoint':
      mapStore.set(event.data.map);
      economyStore.set(event.data.economy);
      healthStore.set(event.data.health);
      camera.setState(event.data.camera);
      break;
    case 'map.full':
      mapStore.set(event.data);
      break;
    case 'map.agent':
      mapStore.update(s => ({
        ...s,
        agents: {
          ...s.agents,
          [event.data.agentId]: { ...s.agents[event.data.agentId], ...event.data }
        }
      }));
      break;
    case 'economy.full':
      economyStore.set(event.data);
      break;
    case 'economy.agent':
      economyStore.update(s => ({
        ...s,
        agents: { ...s.agents, [event.data.agentId]: event.data }
      }));
      break;
    case 'economy.pool':
      economyStore.update(s => ({ ...s, pool: event.data }));
      break;
    // ... similarly for health, camera, etc.
    case 'user.camera':
      camera.setState(event.data);
      break;
  }
}
```

### 4.4 Seek Algorithm

Seeking is the most performance-critical operation. Target: **<100ms** from user click to visual update.

**Algorithm:**

```
seek(targetMs):
  1. Find the nearest checkpoint BEFORE targetMs:
     - Binary search the checkpoints index (sorted by ts).
     - Result: checkpoint with ts <= targetMs.
  
  2. Apply the checkpoint (instant full-state restore):
     - mapStore.set(checkpoint.data.map)
     - economyStore.set(checkpoint.data.economy)
     - healthStore.set(checkpoint.data.health)
     - camera.setState(checkpoint.data.camera)
  
  3. Determine which chunk contains events between checkpoint.ts and targetMs:
     - Binary search chunks index by [sessionId, startTs].
  
  4. Decompress and load the target chunk (if not already cached).
  
  5. Linear replay from checkpoint.seq to the event just before targetMs:
     - Apply events silently (skip onEvent callbacks for speed).
     - This is at most ~30s worth of events (checkpoint interval).
  
  6. Set currentTime = targetMs, update cursor position.
  7. Fire onTimeUpdate(targetMs).
  8. Return to previous state (playing or paused).
```

**Why this is fast:**
- Step 1: O(log N) binary search over checkpoint count (~2 per minute = ~120 per hour).
- Step 2: O(1) — direct store set.
- Step 3: O(log N) binary search over chunk count.
- Step 4: Single IndexedDB read + gzip decompress (~5ms for 256KB).
- Step 5: Apply max ~600 events (30s × 20 events/s) — each is a shallow object merge.
- Total: ~10–50ms in practice.

### 4.5 Chunk Pre-fetching

The engine maintains a **2-chunk lookahead cache**:

```typescript
interface ChunkCache {
  /** Currently active chunk. */
  current: { index: number; events: ReplayEvent[] } | null;
  /** Next chunk, pre-fetched. */
  next: { index: number; events: ReplayEvent[] } | null;
  /** Previous chunk (for reverse). */
  prev: { index: number; events: ReplayEvent[] } | null;
}
```

When the cursor enters the last 20% of the current chunk, the next chunk is fetched asynchronously. This ensures seamless playback across chunk boundaries.

### 4.6 Reverse Playback

Reverse playback (negative speed) requires applying events in reverse order. Since events are state updates (not diffs), we can't truly "undo" them. Instead:

1. Seek to the target time using the seek algorithm (checkpoint + forward replay).
2. Step backward = seek to `(currentTime - stepSize)`.

This makes reverse playback slightly more expensive but avoids the complexity of inverse operations. At typical speeds (1x reverse), seeking every 16ms (60fps) to `currentTime - 16` is well within the 100ms budget since each seek typically hits the same checkpoint and only replays a few fewer events.

For fast reverse (>2x), we reduce the visual update rate to match the seek budget:
- 2x reverse: seek every 32ms
- 4x reverse: seek every 64ms (visual update at 15fps)
- 8x+: skip to checkpoint boundaries

---

## 5. Time Scrubber UI/UX

### 5.1 Visual Design

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          TIME SCRUBBER                                    │
│                                                                          │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐                          ┌──────────┐  │
│  │ ◀◀ ││ ◀  ││ ▶  ││ ▶▶ ││ ⏹  │  00:14:32 / 01:23:45   │ 1x  ▼    │  │
│  └────┘└────┘└────┘└────┘└────┘                          └──────────┘  │
│                                                                          │
│  ╔══════════════════════════════════════════════════════════════════════╗ │
│  ║░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓█|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░║ │
│  ║  ▲  ▲     ▲   ▲▲   ▲     ▲ │     ▲              ▲               ▲║ │
│  ║  C  I     C   PU   C     I │     C              C               C║ │
│  ╚══════════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│  Legend: C=Checkpoint  I=Incident  P=Phase  U=User annotation           │
│          █=Playhead    ▓=Played    ░=Unplayed                           │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Minimap: agent activity heatmap (color intensity = event density)  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Controls

| Control | Action | Keyboard |
|---------|--------|----------|
| ◀◀ | Jump to previous checkpoint/marker | `[` |
| ◀ | Step back 5 seconds | `←` |
| ▶ / ⏸ | Play/Pause toggle | `Space` |
| ▶▶ | Jump to next checkpoint/marker | `]` |
| ⏹ | Stop replay, return to live mode | `Escape` |
| Speed selector | Cycle: 0.25x, 0.5x, 1x, 2x, 4x, 8x | `+` / `-` |
| Timeline click | Seek to clicked position | Mouse |
| Timeline drag | Scrub through time | Mouse drag |

### 5.3 Timeline Rendering

The timeline is a PIXI.js Graphics+Container rendered in screen-space (child of `app.stage`, not `world`):

```typescript
interface TimeScrubberConfig {
  /** Height in pixels. */
  height: 80;
  /** Padding from bottom of screen. */
  bottomPadding: 8;
  /** Timeline bar height. */
  barHeight: 24;
  /** Marker height. */
  markerHeight: 16;
  /** Colors. */
  colors: {
    background: 0x0a0a1a;
    bar: 0x1a1a2e;
    played: 0x00d4ff;
    playhead: 0xffd700;
    checkpoint: 0x4a6fa5;
    incident: 0xff3366;
    phase: 0x00e1c3;
    annotation: 0xffd700;
    heatmapLow: 0x0a0a2e;
    heatmapHigh: 0x00d4ff;
  };
  /** Minimap: number of buckets for event density. */
  heatmapBuckets: 200;
}
```

**Heatmap minimap:** The timeline includes a thin heatmap strip (6px tall) showing event density over time. Events are bucketed into `heatmapBuckets` bins, and each bin's color intensity reflects its event count. This helps users identify busy/interesting periods at a glance.

### 5.4 Marker Tooltips

Hovering over a timeline marker shows a tooltip with event details:

```
┌──────────────────────────────────┐
│ 🔴 Incident: oracle → ERROR     │
│ 14:32:15  •  Health alert P0    │
│ CPU 95%, Latency 3200ms         │
└──────────────────────────────────┘
```

### 5.5 Responsive Layout

- **Full width:** scrubber spans the viewport width minus padding
- **Collapse at <768px:** VCR buttons become a single play/pause, speed/time shrink
- **Show/hide:** `Tab` key toggles the scrubber visibility during replay
- **Z-order:** scrubber renders at Z=13 (above health dashboard)

---

## 6. Event Log Synchronization

### 6.1 Event Log Panel

A scrollable panel on the right side of the screen showing events synchronized with playback:

```
┌──────────────────────────────────┐
│  EVENT LOG              [Filter] │
│──────────────────────────────────│
│  14:32:10  map.agent             │
│    oracle: IDLE → ACTIVE         │
│                                  │
│  14:32:11  economy.agent         │
│    oracle: +2,340 tokens         │
│                                  │
│▶ 14:32:15  marker.incident    ◀─┤─── Current playback position
│    🔴 oracle ERROR: CPU 95%     │
│                                  │
│  14:32:18  health.alert          │
│    P0: oracle latency 3200ms    │
│                                  │
│  14:32:22  map.agent             │
│    oracle: ERROR → ACTIVE        │
│──────────────────────────────────│
│  Showing 42 of 1,847 events     │
└──────────────────────────────────┘
```

### 6.2 Synchronization Algorithm

The event log panel maintains a **sliding window** of events around the current playback time:

```typescript
interface EventLogConfig {
  /** Max events to keep in the visible buffer. */
  maxVisible: 100;
  /** Events to pre-fetch ahead/behind current time. */
  lookAheadMs: 30_000;
  lookBehindMs: 30_000;
  /** Auto-scroll: keep current event centered. */
  autoScroll: true;
  /** Highlight duration for the current event (ms). */
  highlightMs: 2_000;
}
```

**On each `onTimeUpdate(timeMs)`:**
1. Find the event with `ts` closest to `timeMs` (binary search in the window).
2. If the current event is outside the visible window, request more events via `engine.getEventsInRange()`.
3. Scroll the panel to center the current event.
4. Apply a highlight (glow) to the current event row.

### 6.3 Filtering

Users can filter the event log by:
- **Event type:** checkboxes for map/economy/health/user/markers
- **Agent:** dropdown to filter by specific agent
- **Severity:** show only incidents/alerts
- **Text search:** fuzzy search on event descriptions

Filtering is applied client-side on the in-memory event window. It does not affect playback.

---

## 7. Snapshot Comparison

### 7.1 Compare Mode

Users can pin two points in time and compare the state side-by-side:

```
┌─────────────────────────────────────────────────────────────────┐
│  SNAPSHOT COMPARISON                                [Close ✕]   │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │  Before: 14:30:00    │  │  After: 14:35:00     │            │
│  │  ┌──────────────┐    │  │  ┌──────────────┐    │            │
│  │  │  Map Canvas  │    │  │  │  Map Canvas  │    │            │
│  │  │  (frozen)    │    │  │  │  (frozen)    │    │            │
│  │  └──────────────┘    │  │  └──────────────┘    │            │
│  └──────────────────────┘  └──────────────────────┘            │
│                                                                 │
│  Changes:                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  oracle:   IDLE → ERROR  │ CPU: 0.35 → 0.95 │ +$2.34     ││
│  │  sentinel: ACTIVE → IDLE │ sessions: 3 → 0   │             ││
│  │  pool:     68% → 52%    │ burn: $1.20/h → $0.45/h         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Diff Algorithm

```typescript
interface SnapshotDiff {
  timestamp: { before: number; after: number };
  map: {
    changed: Array<{
      agentId: AgentId;
      field: string;
      before: unknown;
      after: unknown;
    }>;
  };
  economy: {
    agents: Array<{
      agentId: AgentId;
      tokensDelta: number;
      costDelta: number;
      healthChange?: { from: BudgetHealth; to: BudgetHealth };
    }>;
    pool: {
      tokensDelta: number;
      costDelta: number;
    };
  };
  health: {
    agents: Array<{
      agentId: AgentId;
      statusChange?: { from: HealthStatus; to: HealthStatus };
      metricsDelta: Partial<PerformanceMetrics>;
    }>;
    alertsAdded: HealthAlert[];
    alertsResolved: HealthAlert[];
  };
}

function compareSnapshots(before: CheckpointEvent['data'], after: CheckpointEvent['data']): SnapshotDiff;
```

### 7.3 Visual Diff Overlay

When compare mode is active, the renderer highlights changes:
- **State changes:** Pulsing border on buildings that changed state (green=improved, red=degraded)
- **Metric changes:** Small delta labels (+15% CPU, −$2.34) floating above agents
- **New alerts:** Blinking alert icons

This is implemented as a separate renderer layer (`src/replay/diff-overlay.ts`) that reads from the `SnapshotDiff` and renders visual annotations.

---

## 8. Metrics Overlay

### 8.1 Historical Metrics During Playback

During replay, users can enable a metrics overlay that shows historical charts synchronized with the timeline:

```
┌──────────────────────────────────────────────────────┐
│  METRICS OVERLAY                           [Close ✕] │
│                                                      │
│  System CPU ──────────────────────────               │
│  100%│         ╱╲                                    │
│   75%│   ╱╲   ╱  ╲     ╱╲                           │
│   50%│  ╱  ╲─╱    ╲───╱  ╲                          │
│   25%│─╱                   ╲──                       │
│     0│──────────────────────────                     │
│      14:30    14:32    14:34    14:36                │
│                   ▲ (playhead)                       │
│                                                      │
│  Token Burn Rate ─────────────────                   │
│  $5/h│     ╱╲                                        │
│  $3/h│────╱  ╲╱╲──────                              │
│  $1/h│              ╲──                              │
│     0│──────────────────────────                     │
│      14:30    14:32    14:34    14:36                │
│                   ▲ (playhead)                       │
└──────────────────────────────────────────────────────┘
```

### 8.2 Metric Sources

Metrics are extracted from the event stream during replay:

```typescript
interface MetricSeries {
  label: string;
  unit: string;           // '%', 'ms', '$/h', 'tokens'
  color: number;          // PIXI color
  points: Array<{ ts: number; value: number }>;
}

/** Built-in metric extractors. */
const METRIC_EXTRACTORS: Record<string, (event: ReplayEvent) => number | null> = {
  'system.cpu': (e) => e.type === 'health.full' ? e.data.system.aggregateMetrics.cpuUsage : null,
  'system.memory': (e) => e.type === 'health.full' ? e.data.system.aggregateMetrics.memoryUsage : null,
  'system.latency': (e) => e.type === 'health.full' ? e.data.system.aggregateMetrics.latencyMs : null,
  'pool.tokenUsage': (e) => e.type === 'economy.pool' ? e.data.tokenQuotaUsed : null,
  'pool.burnRate': (e) => /* derive from economy.agent events */ null,
  // Per-agent metrics generated dynamically
};
```

### 8.3 Time-Series Interpolation

Since events arrive at irregular intervals, the overlay uses **linear interpolation** between known data points for smooth chart rendering:

```typescript
function interpolateValue(
  series: Array<{ ts: number; value: number }>,
  targetTs: number
): number {
  if (series.length === 0) return 0;
  if (series.length === 1) return series[0].value;
  
  // Binary search for the surrounding points
  let lo = 0, hi = series.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].ts <= targetTs) lo = mid;
    else hi = mid;
  }
  
  const a = series[lo];
  const b = series[hi];
  
  // Clamp to edges
  if (targetTs <= a.ts) return a.value;
  if (targetTs >= b.ts) return b.value;
  
  // Linear interpolation
  const t = (targetTs - a.ts) / (b.ts - a.ts);
  return a.value + (b.value - a.value) * t;
}
```

The playhead position on the chart updates each frame via `onTimeUpdate`, drawing a vertical line at the current playback time.

---

## 9. Export Pipeline

### 9.1 Export Formats

| Format | Method | Quality | Use Case |
|--------|--------|---------|----------|
| **WebM/VP9** | WebCodecs API | High, lossless-ish | Primary video export |
| **MP4/H.264** | WebCodecs API | High, wide compat | Sharing (if codec available) |
| **GIF** | gif.js (WASM) | Medium, large files | Quick shareable snippets |
| **PNG Sequence** | Canvas toBlob | Lossless | Post-production editing |

### 9.2 Frame Capture Mechanism

```typescript
interface ExportConfig {
  /** Output format. */
  format: 'webm' | 'mp4' | 'gif' | 'png-sequence';
  /** Frame rate. */
  fps: 30 | 60;
  /** Resolution (canvas pixels). */
  width: 1920;
  height: 1080;
  /** Time range to export. */
  startMs: number;
  endMs: number;
  /** Playback speed during export (1x = realtime, 2x = double speed). */
  speed: number;
  /** Include event log panel in export? */
  includeEventLog: boolean;
  /** Include metrics overlay in export? */
  includeMetrics: boolean;
  /** Include time scrubber in export? */
  includeTimeScrubber: boolean;
  /** Quality (0-1, for lossy formats). */
  quality: number;
}
```

**Capture flow:**

```
1. Pause live render loop.
2. Create an offscreen PIXI Application (same config, same layers).
3. Load the replay session into a headless ReplayEngine.
4. For each frame at target FPS:
   a. Calculate target time: startMs + (frameIndex / fps * 1000 * speed)
   b. Seek engine to target time (fast — reuses checkpoint cache).
   c. PIXI app.render() — force a single frame.
   d. Extract canvas pixels via app.canvas.toBlob() or app.renderer.extract.
   e. Push frame to encoder.
5. Finalize encoder, produce output file.
6. Resume live render loop.
```

### 9.3 WebCodecs Encoder

```typescript
interface FrameEncoder {
  /** Initialize the encoder with output config. */
  init(config: ExportConfig): Promise<void>;
  /** Push a single frame (as ImageBitmap or VideoFrame). */
  pushFrame(frame: VideoFrame, timestampUs: number): void;
  /** Finalize and return the encoded output. */
  finalize(): Promise<Blob>;
  /** Progress callback (0-1). */
  onProgress: (ratio: number) => void;
  /** Cancel encoding. */
  cancel(): void;
}
```

**WebCodecs availability check:**

```typescript
function canUseWebCodecs(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}
```

If WebCodecs is unavailable (older browsers), fall back to:
1. **MediaRecorder API** — capture the canvas as a MediaStream, record to WebM.
2. **GIF-only mode** — use a WASM-based GIF encoder (gif.js or gifenc).

### 9.4 GIF Encoder (Fallback)

For GIF export, we use frame quantization and dithering:

```typescript
interface GifEncoderConfig {
  width: number;
  height: number;
  fps: number;
  quality: number;     // 1 (best) - 30 (fastest)
  dither: boolean;
  workers: number;     // Web Worker count for parallel quantization
}
```

GIF files are large — a 1-minute 1920×1080 GIF at 15fps can be 50–200MB. Recommendations:
- Default to 960×540 for GIF export
- Cap at 30 seconds per GIF
- Show estimated size before export begins

### 9.5 Export Progress UI

```
┌──────────────────────────────────────────────────┐
│  EXPORTING SESSION                               │
│                                                  │
│  Format: WebM (VP9)  •  1920×1080  •  30fps      │
│  Range: 14:30:00 – 14:35:00 (5 minutes)         │
│                                                  │
│  ████████████████████░░░░░░░░░  68%              │
│  Frame 1,224 / 1,800                             │
│  Estimated time remaining: 42s                   │
│                                                  │
│  [Cancel]                                        │
└──────────────────────────────────────────────────┘
```

---

## 10. API Endpoints

### 10.1 Session Management (Server-Side — Optional)

These endpoints enable sharing sessions across devices/users. They are **optional** — the replay system works fully client-side with IndexedDB.

#### `GET /api/tactical-map/sessions`

List available sessions on the server.

```json
// Response 200
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Production Incident — Oracle Overload",
      "startedAt": 1708070400000,
      "endedAt": 1708074000000,
      "durationMs": 3600000,
      "eventCount": 12847,
      "compressedBytes": 524288,
      "tags": ["incident", "oracle", "production"],
      "schemaVersion": 1
    }
  ],
  "totalCount": 42,
  "pageSize": 20,
  "page": 1
}
```

Query parameters:
- `page` (default: 1)
- `pageSize` (default: 20, max: 100)
- `tags` (comma-separated filter)
- `startAfter` (epoch ms — sessions starting after this time)
- `startBefore` (epoch ms — sessions starting before this time)
- `sort` (field:direction — `startedAt:desc` default)

#### `GET /api/tactical-map/sessions/:id`

Download a session archive (gzipped NDJSON — metadata line + event lines).

```
Content-Type: application/x-ndjson
Content-Encoding: gzip

{"type":"meta","data":{"id":"...","name":"...","schemaVersion":1,...}}
{"type":"event","data":{"seq":0,"ts":1708070400000,"type":"checkpoint",...}}
{"type":"event","data":{"seq":1,"ts":1708070401000,"type":"map.agent",...}}
...
```

#### `POST /api/tactical-map/sessions`

Upload a session archive.

```
Content-Type: application/x-ndjson
Content-Encoding: gzip
Authorization: Bearer <token>

(body: same NDJSON format as download)
```

Response: `201 Created` with `{ id: "..." }`.

#### `DELETE /api/tactical-map/sessions/:id`

Delete a session from the server.

Response: `204 No Content`.

### 10.2 Authentication

All session endpoints use the same Bearer token authentication as existing `/api/tactical-map/*` endpoints (see `docs/API.md`).

---

## 11. Performance Strategy

### 11.1 Performance Targets

| Operation | Target | Approach |
|-----------|--------|----------|
| **Seek to any time** | <100ms | Checkpoint + chunk cache + binary search |
| **Recording overhead** | <5ms/frame | Shallow diff, batched writes, async compression |
| **Playback CPU** | <10% additional | Events applied only when changed, no redundant renders |
| **Memory (recording)** | <50MB | Bounded event buffer, flush to IndexedDB |
| **Memory (playback)** | <100MB | 3-chunk cache (current + prev + next), event window |
| **IndexedDB storage** | ~2MB/minute | NDJSON + gzip compression |
| **Session load time** | <500ms | Metadata + first chunk only; lazy chunk loading |
| **Export: 1 min video** | <60s | WebCodecs hardware acceleration |

### 11.2 Recording Performance

**Subscription overhead:**
- Store subscriptions fire on every `store.set()` call.
- The recorder performs a **shallow structural diff** (not deep equality) comparing agent states by reference. If the store was updated with a structurally identical object (same agent states), no event is emitted.
- Cost: ~0.5ms per subscription fire (8 agents × object comparison + optional event creation).

**Batched IndexedDB writes:**
- Events accumulate in-memory for up to `flushIntervalMs` (10s) or `flushThreshold` (500 events).
- A single IndexedDB transaction writes the compressed chunk.
- IndexedDB writes are async and non-blocking.

**Compression in a Worker:**
- gzip compression runs in a Web Worker to avoid blocking the main thread.
- `CompressionStream` is natively streamed, keeping memory flat.

### 11.3 Playback Performance

**Chunk cache management:**
- The 3-chunk cache (prev, current, next) keeps ~768KB of decompressed events in memory.
- On seek, the cache is invalidated if the target is outside the cached range.
- Cache hits (scrubbing within the same few minutes) are instant.

**Event application batching:**
- When catching up (speed > 1x or seek), events are applied in a tight loop without triggering per-event callbacks.
- Store subscribers are temporarily suspended during batch applies, then notified once at the end.

**Frame budget:**
- At 60fps, each frame has ~16ms budget.
- Replay engine `update()` applies events until `currentTime` is reached, then returns.
- If more events need applying than the frame budget allows (>100 events), the remainder is deferred to the next frame and the playback time is capped at the last applied event's timestamp (prevents dropped frames).

### 11.4 Memory Management

| Resource | Limit | Eviction |
|----------|-------|----------|
| Event buffer (recording) | 500 events | Flush to IndexedDB |
| Chunk cache (playback) | 3 chunks (~768KB) | LRU: evict when loading new chunk |
| Event log window | 100 visible + 200 prefetch | Sliding window around playback time |
| Metrics series (overlay) | 500 points per metric | Down-sample older points |
| Checkpoint index | All in memory (~10KB/hour) | Loaded on session open, small |
| Marker index | All in memory (~5KB/hour) | Loaded on session open, small |

### 11.5 IndexedDB Storage Estimates

Assumptions: 15 events/second average, 30s checkpoint interval, gzip ~85% compression.

| Session Length | Raw Events | Compressed Size | Checkpoints |
|---------------|-----------|-----------------|-------------|
| 5 minutes | 4,500 | ~1.5 MB | 10 |
| 30 minutes | 27,000 | ~9 MB | 60 |
| 1 hour | 54,000 | ~18 MB | 120 |
| 4 hours | 216,000 | ~72 MB | 480 |

**Storage quota:** IndexedDB typically has a generous quota (50% of disk on Chrome). We'll show a warning when stored sessions exceed 500MB total and offer cleanup tools.

---

## 12. Testing Approach

### 12.1 Unit Tests

| Module | Test File | Key Tests |
|--------|-----------|-----------|
| EventBuffer | `tests/unit/replay/event-buffer.test.ts` | Flush thresholds, checkpoint insertion, compression round-trip |
| SessionStorage | `tests/unit/replay/storage.test.ts` | IndexedDB CRUD, chunk retrieval, session listing (fake-indexeddb) |
| ReplayEngine | `tests/unit/replay/engine.test.ts` | Play/pause/seek state machine, event application, speed control |
| Seek algorithm | `tests/unit/replay/seek.test.ts` | Binary search correctness, checkpoint selection, cross-chunk seek |
| Diff logic | `tests/unit/replay/diff.test.ts` | Map/economy/health diffing, threshold for full vs granular |
| SnapshotComparator | `tests/unit/replay/snapshot-comparator.test.ts` | Diff calculation, edge cases (empty states, identical states) |
| TimeScrubber | `tests/unit/replay/time-scrubber.test.ts` | Time formatting, marker placement, click-to-seek mapping |
| VideoEncoder | `tests/unit/replay/video-encoder.test.ts` | Codec availability detection, frame queuing, output blob |

### 12.2 Integration Tests

| Scenario | Test File | Description |
|----------|-----------|-------------|
| Record + Replay | `tests/integration/replay-roundtrip.test.ts` | Record 60s of simulated events, replay, verify state matches |
| Seek accuracy | `tests/integration/replay-seek.test.ts` | Seek to 100 random timestamps, verify state matches linear replay |
| Chunk boundaries | `tests/integration/replay-chunks.test.ts` | Verify seamless playback across chunk boundaries |
| Export | `tests/integration/replay-export.test.ts` | Export 10s to WebM, verify output is valid video |

### 12.3 E2E Tests (Playwright)

| Test | File | Description |
|------|------|-------------|
| Record button | `tests/e2e/replay.spec.ts` | Click record, wait 10s, stop, verify session in list |
| Replay controls | `tests/e2e/replay.spec.ts` | Load session, play/pause/seek, verify time updates |
| Export download | `tests/e2e/replay.spec.ts` | Export 5s clip, verify download triggered |

### 12.4 Performance Tests

| Benchmark | Target | Method |
|-----------|--------|--------|
| Seek latency | <100ms p95 | `performance.now()` around `engine.seek()`, 1000 random seeks |
| Recording overhead | <5ms/frame | `performance.now()` around recorder subscription, 10K frames |
| Chunk decompress | <10ms | `performance.now()` around `decompressChunk()`, 100 chunks |
| Export throughput | >30 fps capture | Frame count / wall time during export |

### 12.5 Testing Utilities

```typescript
/** Generate synthetic replay events for testing. */
function generateTestSession(config: {
  durationMs: number;
  eventsPerSecond: number;
  agentCount: number;
  includeIncidents: boolean;
}): ReplayEvent[];

/** Create a fake IndexedDB for unit tests. */
function createMockStorage(): SessionStorage;

/** Deterministic timestamp generator for reproducible tests. */
function createTimestampGenerator(startMs: number, intervalMs: number): () => number;
```

---

## 13. Implementation Plan

### 13.1 Phase Ordering

The implementation is split into 4 sub-phases, each independently shippable:

#### Phase 5.8.1 — Core Recording + Storage (Est: 2–3 days)

Files to create:
- `src/replay/types.ts` — All type definitions
- `src/replay/event-buffer.ts` — Batched event buffer with checkpoints
- `src/replay/storage.ts` — IndexedDB session/chunk storage
- `src/replay/recorder.ts` — Store subscription + recording lifecycle
- `tests/unit/replay/event-buffer.test.ts`
- `tests/unit/replay/storage.test.ts`
- `tests/unit/replay/recorder.test.ts`

Acceptance: Can record a live session to IndexedDB, verify events are stored correctly.

#### Phase 5.8.2 — Replay Engine + Time Scrubber (Est: 3–4 days)

Files to create:
- `src/replay/engine.ts` — Playback state machine, seek, speed control
- `src/replay/time-scrubber.ts` — PIXI.js timeline UI
- `src/replay/event-log-panel.ts` — Synchronized event feed
- Updates to `src/main.ts` — Wire replay mode toggle
- `tests/unit/replay/engine.test.ts`
- `tests/unit/replay/seek.test.ts`
- `tests/unit/replay/time-scrubber.test.ts`
- `tests/integration/replay-roundtrip.test.ts`
- `tests/integration/replay-seek.test.ts`

Acceptance: Can load a recorded session, play/pause/seek with <100ms latency, see events in log panel.

#### Phase 5.8.3 — Comparison + Metrics Overlay (Est: 2–3 days)

Files to create:
- `src/replay/snapshot-comparator.ts` — Diff engine
- `src/replay/diff-overlay.ts` — Visual diff renderer layer
- `src/replay/metrics-overlay.ts` — Historical chart overlay
- `tests/unit/replay/snapshot-comparator.test.ts`
- `tests/unit/replay/metrics-overlay.test.ts`

Acceptance: Can pin two timestamps and see visual diff. Metrics overlay syncs with playhead.

#### Phase 5.8.4 — Export Pipeline (Est: 2–3 days)

Files to create:
- `src/replay/frame-capturer.ts` — Canvas frame extraction
- `src/replay/video-encoder.ts` — WebCodecs/GIF encoding
- `src/replay/export-ui.ts` — Progress dialog
- `tests/unit/replay/video-encoder.test.ts`
- `tests/integration/replay-export.test.ts`

Acceptance: Can export a session segment as WebM/GIF, file downloads correctly.

#### Phase 5.8.5 — Server Sync + Polish (Est: 1–2 days)

Files to create:
- `src/data/replay-client.ts` — Upload/download session archives
- E2E tests in `tests/e2e/replay.spec.ts`
- Session management UI (list, delete, rename, tag)

Acceptance: Sessions can be uploaded/downloaded, E2E tests pass.

### 13.2 Dependency Graph

```
Phase 5.8.1 (Recording + Storage)
    │
    ▼
Phase 5.8.2 (Engine + Scrubber) ───▶ Phase 5.8.3 (Compare + Metrics)
    │                                        │
    ▼                                        ▼
Phase 5.8.4 (Export Pipeline) ◀──────────────┘
    │
    ▼
Phase 5.8.5 (Server Sync + Polish)
```

### 13.3 Main.ts Integration Points

The replay system integrates into `src/main.ts` at these points:

1. **Recording toggle:** A "Record" button in the HUD starts/stops the `SessionRecorder`.
2. **Replay mode toggle:** Loading a session pauses live data clients (`api.stop()`, `economyClient.stop()`, `healthClient.stop()`) and hands control to the `ReplayEngine`.
3. **Exit replay:** Stopping replay resumes live data clients and removes replay UI layers.
4. **Render loop:** `replayEngine.update(elapsedMs)` is called in the ticker when in replay mode.
5. **Layer additions:** `timeScrubber`, `eventLogPanel`, `metricsOverlay`, `diffOverlay` are added to `app.stage` at Z=13–16.

```typescript
// Pseudocode for main.ts integration
let mode: 'live' | 'replay' = 'live';
let replayEngine: ReplayEngine | null = null;
let recorder: SessionRecorder | null = null;

function enterReplayMode(sessionId: string) {
  mode = 'replay';
  api.stop();
  economyClient.stop();
  healthClient.stop();
  
  replayEngine = createReplayEngine({
    mapStore, economyStore, healthStore, camera,
    onTimeUpdate: (t) => timeScrubber.setTime(t),
    onEvent: (e) => eventLogPanel.pushEvent(e),
    onStateChange: (s) => timeScrubber.setState(s),
    onEnd: () => replayEngine?.pause(),
  });
  
  replayEngine.load(sessionId).then(() => {
    app.stage.addChild(timeScrubber.container);
    app.stage.addChild(eventLogPanel.container);
  });
}

function exitReplayMode() {
  mode = 'live';
  replayEngine?.destroy();
  replayEngine = null;
  
  app.stage.removeChild(timeScrubber.container);
  app.stage.removeChild(eventLogPanel.container);
  
  api.start();
  economyClient.start();
  healthClient.start();
}

// In ticker:
app.ticker.add((ticker) => {
  if (mode === 'replay' && replayEngine) {
    replayEngine.update(ticker.deltaMS);
  }
  // ... existing layer updates (unchanged — they read from the same stores) ...
});
```

---

## 14. Open Questions & Decisions

### 14.1 Resolved Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Client vs server storage | Client-first (IndexedDB) | Faster, works offline, no server changes needed |
| Event format | NDJSON + gzip | Human-debuggable, streamable, good compression |
| Checkpoint strategy | Time-based (30s) + count-based (200 events) | Balances seek speed vs storage overhead |
| Reverse playback | Seek-based (not inverse events) | Much simpler, seek is fast enough |
| Export encoding | WebCodecs primary, GIF fallback | Hardware-accelerated, wide browser support |
| Store injection | Reuse existing stores | Zero renderer changes needed |

### 14.2 Open Questions (For Implementation Phase)

1. **Camera replay fidelity:** Should camera movements be replayed exactly, or should the user control the camera freely during replay? *Recommendation: Default to free camera, with a "follow recorded camera" toggle.*

2. **Real-time recording indicator:** Should there be a visible "REC" indicator (à la video cameras) during recording? *Recommendation: Yes — a pulsing red dot in the HUD corner.*

3. **Auto-recording:** Should sessions be automatically recorded, or only on explicit user action? *Recommendation: Start with explicit only. Auto-recording is a future enhancement with storage quota management.*

4. **Session naming:** Should sessions be auto-named (timestamp-based) or require user input? *Recommendation: Auto-name with optional rename. Auto-name format: `Session — YYYY-MM-DD HH:mm`.*

5. **Maximum session length:** Is there a hard cap? *Recommendation: Soft cap at 4 hours with a warning. IndexedDB quota is the real limit.*

6. **Web Worker usage:** Should the replay engine run in a Worker? *Recommendation: No — it needs direct store access. Only compression and export encoding should use Workers.*

---

## Appendix A: File Manifest

```
tactical-map/
├── src/
│   └── replay/
│       ├── types.ts                  # All replay type definitions
│       ├── recorder.ts               # Session recording (store subscriptions)
│       ├── event-buffer.ts           # Batched event buffer with checkpoints
│       ├── storage.ts                # IndexedDB session/chunk storage
│       ├── engine.ts                 # Replay engine (playback state machine)
│       ├── time-scrubber.ts          # PIXI.js timeline UI
│       ├── event-log-panel.ts        # Synchronized event feed panel
│       ├── metrics-overlay.ts        # Historical metrics chart overlay
│       ├── snapshot-comparator.ts    # State diff engine
│       ├── diff-overlay.ts           # Visual diff renderer layer
│       ├── frame-capturer.ts         # Canvas frame extraction
│       ├── video-encoder.ts          # WebCodecs/GIF encoding
│       └── export-ui.ts             # Export progress dialog
│   └── data/
│       └── replay-client.ts          # Server sync (upload/download)
├── tests/
│   ├── unit/
│   │   └── replay/
│   │       ├── event-buffer.test.ts
│   │       ├── storage.test.ts
│   │       ├── recorder.test.ts
│   │       ├── engine.test.ts
│   │       ├── seek.test.ts
│   │       ├── time-scrubber.test.ts
│   │       ├── snapshot-comparator.test.ts
│   │       ├── metrics-overlay.test.ts
│   │       └── video-encoder.test.ts
│   ├── integration/
│   │   ├── replay-roundtrip.test.ts
│   │   ├── replay-seek.test.ts
│   │   ├── replay-chunks.test.ts
│   │   └── replay-export.test.ts
│   └── e2e/
│       └── replay.spec.ts
└── docs/
    └── PHASE5.8_REPLAY_HISTORY.md    # This document
```

## Appendix B: Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `Space` | Play/Pause toggle | Replay mode |
| `←` | Step back 5 seconds | Replay mode |
| `→` | Step forward 5 seconds | Replay mode |
| `[` | Jump to previous marker | Replay mode |
| `]` | Jump to next marker | Replay mode |
| `+` / `=` | Increase speed | Replay mode |
| `-` | Decrease speed | Replay mode |
| `Home` | Jump to session start | Replay mode |
| `End` | Jump to session end | Replay mode |
| `Tab` | Toggle time scrubber visibility | Replay mode |
| `Escape` | Exit replay mode | Replay mode |
| `R` | Start/stop recording | Live mode |
| `C` | Set comparison point A/B | Replay mode |

## Appendix C: current Visual Theme for Replay UI

Consistent with the existing Tactical Map aesthetic:

| Element | Style |
|---------|-------|
| Scrubber background | Dark psi-field (`#0a0a1a` with `#1a1a2e` bar) |
| Playhead | Gold crystal (`#FFD700`) with subtle glow |
| Played region | command blue (`#00D4FF`) at 60% alpha |
| Checkpoint markers | Dim blue diamonds (`#4A6FA5`) |
| Incident markers | Red pulse circles (`#FF3366`) |
| Phase markers | Teal triangles (`#00E1C3`) |
| Event log background | Dark panel (`#0a0a12`) with blue border (`#1a3b7a`) |
| Record indicator | Pulsing red circle (`#FF3366`) top-right corner |
| Compare mode highlight | Gold border (`#FFD700`) on diffed buildings |
| Button hover | command blue glow effect |
