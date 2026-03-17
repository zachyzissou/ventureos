# Phase 5.5 — Mission Tracking & Workflows Dashboard Integration

Mission cards, dependency arrows, and history timelines now illuminate
the tactical interface with real-time mission intelligence.

## Overview

Phase 5.5 adds mission tracking visualization to the tactical map dashboard.
Active missions appear as floating cards above agent sprites, with task queue
depth indicators, dependency arrows, and completion celebration animations.

## Architecture

```
src/missions/
├── types.ts                  # Core type definitions, constants, config
├── mission-data-provider.ts  # Data abstraction (mock + API providers)
├── mission-card.ts           # Card layout calculator & Canvas2D renderer
├── task-queue-viz.ts         # Queue depth bars & summary panel
├── progress-indicator.ts     # Linear, circular, step, and badge progress
├── dependency-arrows.ts      # Bézier curve arrows with flowing particles
├── completion-animations.ts  # Particle system, easing, animation manager
├── mission-timeline.ts       # Chronological history timeline
├── mission-tracker.ts        # Integration controller (main entry point)
└── index.ts                  # Public API exports
```

## Quick Start

```typescript
import { MissionTracker } from './missions';

// Create tracker (uses MockMissionDataProvider by default)
const tracker = new MissionTracker();
tracker.connect();

// In your render loop:
function renderFrame(ctx: CanvasRenderingContext2D) {
  const agentPositions = new Map([
    ['venture_research', { x: 200, y: 300 }],
    ['venture_infrastructure', { x: 400, y: 300 }],
  ]);

  tracker.render(ctx, agentPositions, Date.now());
}

// Cleanup:
tracker.disconnect();
```

## Components

### Mission Cards (`mission-card.ts`)

Floating cards rendered above agent sprites. Each card shows:
- Phase badge (colored pill with phase name)
- Mission title (auto-truncated)
- Progress bar (0-100% with gradient fill)
- Queue depth indicator (colored circle)
- Assigned roles (agent display names)
- Error overlay (red tint + error message)

Cards expand to show a task list when only one mission is assigned
to an agent in the `execute` phase.

### Task Queue Visualization (`task-queue-viz.ts`)

Vertical depth bars next to agents showing backlog pressure:
- Color-coded urgency (green → yellow → red)
- Tier segments (P0-P3 overlays)
- Animated pulse for active processing
- Queue summary panel for dashboard sidebar

### Progress Indicators (`progress-indicator.ts`)

Multiple visualization styles:
- **Linear bar**: Horizontal with gradient, animated shimmer
- **Circular gauge**: Radial arc with center percentage
- **Phase steps**: Dot sequence showing mission lifecycle
- **Compact badge**: Tiny inline chip for lists

### Dependency Arrows (`dependency-arrows.ts`)

Curved Bézier arrows between related mission cards:
- **blocks** (solid, orange): Critical path blocking dependency
- **informs** (dashed, blue): Information flow
- **feeds** (dotted, green): Data pipeline

Features flowing particles along paths to show direction.

### Completion Animations (`completion-animations.ts`)

- **AnimationManager**: Manages concurrent animations with capacity limits
- **Particle system**: Burst explosions for mission completion
- **Easing functions**: Cubic, elastic, bounce curves
- **Animation types**: appear, disappear, phase transition, error shake, bob

### Mission Timeline (`mission-timeline.ts`)

Vertical chronological timeline of phase transitions:
- Color-coded phase dots on a rail
- Timestamps and duration labels
- Notes from history entries
- Compact and full modes
- Aggregated panel across all missions

## Data Providers

### MockMissionDataProvider

For development and testing. Generates realistic mission data and
optionally simulates phase transitions on a timer.

```typescript
const provider = new MockMissionDataProvider({
  updateInterval: 3000,    // ms between updates
  initialMissions: 5,      // starting mission count
  simulateTransitions: true // auto-advance phases
});
```

### ApiMissionDataProvider

For production. Polls the tactical-map REST API:

```typescript
const provider = new ApiMissionDataProvider({
  baseUrl: 'http://192.168.225.149:7001',
  token: 'your-bearer-token',
  pollInterval: 5000
});
```

**API endpoint**: `GET /api/tactical-map/missions`
Returns `{ missions: MissionData[], dependencies: MissionDependency[] }`

## Configuration

```typescript
import { DEFAULT_CONFIG } from './missions';

// All values in DEFAULT_CONFIG:
{
  maxVisibleMissions: 50,     // Performance cap
  cardWidth: 220,             // Card dimensions (px)
  cardHeight: 80,
  expandedCardHeight: 200,    // With task list
  floatHeight: 60,            // Height above agent sprite
  bobAmplitude: 3,            // Floating bob (px)
  bobPeriod: 2000,            // Bob cycle (ms)
  showDependencies: true,     // Render arrows
  showQueueDepth: true,       // Render depth bars
  animationThreshold: 30,     // Skip animations above this count
  timelineMaxEntries: 50      // History cap
}
```

## Performance

Targets:
- **<500ms render** for 50 active missions (verified in tests)
- **60fps** animation target
- **Capacity limit** on AnimationManager (auto-prunes oldest)
- **Particle pool** with automatic cleanup
- **Frame timing** tracked via `getPerformanceMetrics()`

## Testing

```bash
# Run mission tracking tests
cd tactical-map
npx vitest run tests/unit/missions/

# With coverage
npx vitest run tests/unit/missions/ --coverage
```

**Results:** 209 tests, 92.85% statement coverage

Test files:
- `types.test.ts` — Constants and config validation
- `mission-data-provider.test.ts` — Provider lifecycle and data generation
- `mission-card.test.ts` — Layout calculation and text truncation
- `task-queue-viz.test.ts` — Queue stat aggregation
- `dependency-arrows.test.ts` — Path calculation and Bézier math
- `completion-animations.test.ts` — AnimationManager, particles, easing
- `mission-timeline.test.ts` — Duration formatting and entry processing
- `mission-tracker.test.ts` — Integration controller and performance
- `progress-indicator.test.ts` — Config validation
- `index-exports.test.ts` — Public API surface verification
- `rendering-integration.test.ts` — Canvas rendering code paths

## Integration with Phase 5.1-5.4

This module integrates with the existing tactical map pipeline:

1. **Phase 5.1 (Security)**: ApiMissionDataProvider uses Bearer token auth
2. **Phase 5.2 (Activity)**: Cards render above unit sprites from Phase 5.2
3. **Phase 5.3 (Affinity Network)**: Dependency arrows complement bond lines
4. **Phase 5.4 (Real-time)**: WebSocket/SSE updates feed the data provider

The `MissionTracker.render()` method is designed to be called within the
existing render loop, after terrain and units, before HUD overlay.

## Dependencies Note

The task queue visualization connects to the task queue system
(issues #51, #52). Currently using `MockMissionDataProvider` for data.
Wire `ApiMissionDataProvider` when the queue API endpoints are available.

## Color Palette

| Phase   | Primary   | Description              |
|---------|-----------|--------------------------|
| brief   | `#4FC3F7` | Light blue               |
| plan    | `#81C784` | Green (growth)           |
| execute | `#FFB74D` | Orange (energy)          |
| verify  | `#BA68C8` | Purple (analysis)        |
| deliver | `#4DB6AC` | Teal (completion)        |
| closed  | `#AED581` | Lime (success)           |
| error   | `#E57373` | Red (alert)              |
