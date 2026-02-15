# Phase 5 Spec Ambiguities — Resolved

**Date:** 2026-02-14  
**Author:** Oracle  
**Status:** ✅ RESOLVED — All 6 ambiguities decided with testable rules  
**Source:** Verifier's review (§9.7) identified these as blocking testable implementation  
**Companion:** `~/clawd/ventureos/docs/API_CONTRACTS.md` (canonical data shapes)

---

> Each ambiguity is resolved with a **concrete decision**, **rationale**, **testable assertion**, and **implementation notes**. Synth should be able to implement from this doc without asking questions.

---

## 1. Building State Transitions

**Ambiguity:** Spec defines IDLE/ACTIVE/OVERLOADED/ERROR states for buildings but doesn't define when transitions occur.

### Decision

```
State Machine:

                    ┌──────────────────────────────────┐
                    │                                  │
                    ▼                                  │
    ┌──────┐   ≥1 session   ┌────────┐  cap ≥80%  ┌────────────┐
    │ IDLE │ ──────────────► │ ACTIVE │ ──────────► │ OVERLOADED │
    └──────┘                 └────────┘             └────────────┘
        ▲                        │  ▲                    │
        │                        │  │  cap <70%          │
        │  0 sessions            │  └────────────────────┘
        │  for ≥30s              │
        │                        │  session error within 5min
        │                        ▼
        │                    ┌───────┐
        └────────────────────│ ERROR │
          5min timeout       └───────┘
          OR next success
```

### Transition Rules

| Transition | Condition | Timing |
|-----------|-----------|--------|
| `idle` → `active` | Agent has ≥1 active session (mission with `status = 'in_progress'`) | **Instant** — on next poll cycle (15s) |
| `active` → `idle` | Agent has 0 active sessions for ≥30 consecutive seconds | **Debounced (30s)** — prevents flapping during rapid task handoffs |
| `active` → `overloaded` | Agent capacity ≥ 80% | **Instant** — on next poll cycle |
| `overloaded` → `active` | Agent capacity drops below **70%** (not 80%) | **Instant** — 10% hysteresis band prevents oscillation |
| `active` → `error` | Agent's most recent session ended with `status = 'failed'` within last 5 minutes | **Instant** — on next poll cycle |
| `error` → `idle` | 5 minutes elapsed since the error AND 0 active sessions | **Timed (5 min)** — error state persists to ensure visibility |
| `error` → `active` | Agent starts a new successful session (mission created with `status = 'in_progress'`) | **Instant** — recovery clears error |
| `overloaded` → `error` | Same as `active` → `error` | **Instant** |
| `idle` → `error` | ❌ Not possible — errors require an active session to fail |  |

### Capacity Calculation

```
capacity = floor((activeSessions / maxSessions) * 100)
```

Where `maxSessions` is per-agent (see Ambiguity #6 below).

### Hysteresis Details

The 10% hysteresis band between `overloaded` (≥80%) and back to `active` (<70%) prevents visual flickering:

```
Example: Agent with maxSessions = 5

Sessions: 0  → capacity: 0%   → IDLE
Sessions: 1  → capacity: 20%  → ACTIVE
Sessions: 4  → capacity: 80%  → OVERLOADED
Sessions: 3  → capacity: 60%  → still OVERLOADED (hasn't dropped below 70%)
Sessions: 3  → capacity: 60%  → ACTIVE (60% < 70% threshold)
Sessions: 4  → capacity: 80%  → OVERLOADED again
```

### The 30-Second Idle Debounce

When an agent goes from ≥1 sessions to 0 sessions, the server records the "zero sessions since" timestamp. If the agent stays at 0 sessions for 30 consecutive seconds, it transitions to `idle`. If a new session starts within 30s, the agent stays `active`.

**Rationale:** Agents frequently finish one task and immediately start another. Without debouncing, the building would flash idle→active rapidly, which looks broken.

**Implementation:** The server tracks `zeroSince` timestamps per agent in memory (not persisted to DB). On each state calculation:

```javascript
if (activeSessions === 0) {
  if (!zeroSince[agentId]) {
    zeroSince[agentId] = Date.now();
  }
  if (Date.now() - zeroSince[agentId] >= 30_000) {
    state = 'idle';
  }
  // else: keep previous state (active/overloaded)
} else {
  delete zeroSince[agentId];
  // Calculate state based on capacity
}
```

### Testable Assertions

```javascript
// Unit tests for state machine
test('idle → active when session count goes from 0 to 1', ...)
test('active → idle requires 30s debounce with 0 sessions', ...)
test('active → idle resets debounce if session appears within 30s', ...)
test('active → overloaded at exactly 80% capacity', ...)
test('overloaded → active requires dropping below 70% (not 80%)', ...)
test('overloaded stays overloaded at 75% capacity (hysteresis)', ...)
test('active → error when most recent session failed within 5min', ...)
test('error → active when new session starts successfully', ...)
test('error → idle after 5min timeout with no sessions', ...)
test('idle → error is impossible (returns idle)', ...)
```

---

## 2. Task Duration Metadata

**Ambiguity:** Progress bars require estimated duration, but `sessions_list` doesn't include this metadata.

### Decision

**Three-tier duration estimation strategy:**

| Priority | Source | When Used | Accuracy |
|----------|--------|-----------|----------|
| 1 (best) | Explicit `estimated_duration` in `missions` row | When mission was created with an estimate via `sessions_spawn` param or API | High |
| 2 | Mission type default from config | When no explicit estimate exists but mission type is known | Medium |
| 3 (fallback) | Universal default: **1800 seconds (30 minutes)** | When neither explicit estimate nor type default applies | Low |

### Mission Type Defaults

Stored in `config.js` (living spec, easily tunable without code changes):

```javascript
const MISSION_DURATION_DEFAULTS = {
  // Research & Analysis
  research:       3600,   // 60 min — research is typically long
  analysis:       2400,   // 40 min
  investigation:  1800,   // 30 min

  // Operations
  deployment:     1800,   // 30 min
  monitoring:     900,    // 15 min — short check-ins
  fixing:         2400,   // 40 min — varies widely but 40m is reasonable

  // Security
  scanning:       1200,   // 20 min
  escalation:     600,    // 10 min — quick by nature

  // Verification
  testing:        1800,   // 30 min
  validation:     1200,   // 20 min

  // Documentation
  documentation:  2400,   // 40 min
  organizing:     1800,   // 30 min

  // Implementation
  coding:         3600,   // 60 min
  prototyping:    2400,   // 40 min
  iterating:      1800,   // 30 min

  // Orchestration
  orchestrating:  1200,   // 20 min
  deciding:       900,    // 15 min

  // Fallback
  _default:       1800,   // 30 min
};
```

### When Estimate is Missing (All Tiers Fail)

If no duration estimate exists at all (mission has no type, no explicit duration):

- **Progress bar behavior:** Show **indeterminate pulsing bar** (no percentage, animated left-to-right pulse)
- **Tooltip text:** `"Task Name — In progress (duration unknown)"`
- **No fake percentage** — never show "50%" when we don't know

### Progress Calculation (Server-Side)

The server computes progress at response time and includes it in `MissionState.progress`:

```javascript
function calculateProgress(mission) {
  if (mission.status !== 'active') {
    return mission.status === 'complete' ? 100 : null;
  }

  const elapsed = Math.floor(Date.now() / 1000) - mission.startTime;
  const estimated = mission.estimatedDuration
    || MISSION_DURATION_DEFAULTS[mission.missionType]
    || MISSION_DURATION_DEFAULTS._default;

  if (!estimated) return null;  // Truly unknown → indeterminate

  // Cap at 150% — beyond this, something is clearly wrong
  return Math.min(Math.floor((elapsed / estimated) * 100), 150);
}
```

### Progress Color Coding (Client-Side)

| Progress Value | Color | Meaning |
|---------------|-------|---------|
| `null` | Pulsing blue `#00a8ff` | Indeterminate (unknown duration) |
| 0–99 | Green `#33ff88` | On track |
| 100–149 | Yellow `#f6c445` | Over estimated time |
| 150 (capped) | Red `#ff3333` | Significantly overdue |

### Testable Assertions

```javascript
test('progress uses explicit estimated_duration when present', ...)
test('progress falls back to mission type default', ...)
test('progress falls back to 30min universal default', ...)
test('progress returns null when duration truly unknown', ...)
test('progress caps at 150', ...)
test('progress is 0 at mission start', ...)
test('progress is 100 when elapsed equals estimated', ...)
test('completed missions always return 100', ...)
test('failed missions return null (not calculable)', ...)
```

---

## 3. Event Priority / Filtering

**Ambiguity:** Alert feed shows "last 10 events" but doesn't define what qualifies as an event, how they're prioritized, or if low-severity events are excluded.

### Decision

### What Qualifies as an Event

Events are generated server-side when specific conditions occur. The server maintains an event buffer (in-memory, backed by a union query across DB tables).

| Source | Generates Event | Type | Severity | Rationale |
|--------|----------------|------|----------|-----------|
| Mission completed successfully | ✅ | `task_complete` | `info` | Notable achievement |
| Mission failed | ✅ | `task_failed` | `error` | Needs attention |
| Bond drift with `|delta| ≥ 0.03` | ✅ | `drift_positive` / `drift_negative` | `info` | Meaningful change |
| Bond crosses tier boundary | ✅ | `drift_tier_change` | `warning` | Notable shift |
| Agent enters `overloaded` state | ✅ | `overloaded` | `warning` | Capacity concern |
| Agent enters `error` state | ✅ | `error` | `error` | Needs attention |
| Sentinel escalation created | ✅ | `escalation` | `error` | Always critical |
| Collaboration detected (shared session) | ✅ | `collaboration` | `info` | Interesting |
| Agent `idle` ↔ `active` | ❌ | — | — | Too frequent, would flood |
| Small drift (`|delta| < 0.03`) | ❌ | — | — | Noise |
| Heartbeat/polling internals | ❌ | — | — | Infrastructure, not user-facing |
| Stats snapshot calculated | ❌ | — | — | Background job |

### Ordering & Priority

Events are sorted by a composite key: **primary = timestamp (newest first), secondary = severity weight (highest first)**.

Severity weights for tie-breaking:
```
error   = 3
warning = 2
info    = 1
```

When two events share the same second-resolution timestamp, the higher-severity event appears first. If severity also matches, sort alphabetically by `type`.

### Filtering Rules for Alert Feed

The **collapsed** alert feed (default state) shows the **1 most recent event** plus a count badge.

The **expanded** alert feed shows the **last 10 events**, with **no severity filtering** — all qualifying events appear. Rationale: with the restrictive event generation rules above, even `info` events are worth showing (we already exclude noise like idle↔active transitions).

The **API endpoint** (`GET /api/tactical-map/events`) returns up to 20 events by default, supports filtering by `severity`, `agentId`, and `type` via query params, and supports `since` for incremental polling.

### Event Deduplication

To prevent duplicate events from rapid polling, the server deduplicates by `(type, agentId, bondId)` within a 60-second window. If the same event type fires for the same entity within 60s, only the first is kept.

**Exception:** `task_complete` and `task_failed` are never deduplicated (each represents a distinct mission).

### Testable Assertions

```javascript
test('completed mission generates task_complete event with severity info', ...)
test('failed mission generates task_failed event with severity error', ...)
test('drift with delta 0.03 generates event', ...)
test('drift with delta 0.02 does NOT generate event', ...)
test('agent idle→active does NOT generate event', ...)
test('events sorted by timestamp desc then severity desc', ...)
test('two events same timestamp: error appears before info', ...)
test('alert feed shows max 10 events when expanded', ...)
test('duplicate event within 60s is suppressed', ...)
test('task_complete events are never deduplicated', ...)
test('event filtering by severity param works', ...)
test('event filtering by agentId param works', ...)
```

---

## 4. Hit Area Z-Order

**Ambiguity:** Buildings, units, and bonds are all clickable — which takes precedence if they overlap?

### Decision

### Z-Order (Top to Bottom)

```
Layer 7 (top):  Tooltips, Modals, Overlays        ← Always on top
Layer 6:        HUD elements (KPI ticker, alerts)  ← Above map, non-interactive passthrough
Layer 5:        Units (32×32 sprites)              ← Highest map-layer priority
Layer 4:        Buildings (64×64 or 96×96 sprites) ← Second priority
Layer 3:        Health bars, progress bars          ← Attached to buildings/units
Layer 2:        Bond lines (bezier curves)          ← Third priority
Layer 1:        Terrain (background tiles, grid)    ← Lowest priority
Layer 0 (bot):  Background color                   ← Click = deselect all
```

**Rule: Highest visible layer wins the click.** If a unit overlaps a building, the unit gets the click. If a bond line passes under a building, clicking that area hits the building, not the bond.

### Hit Area Sizes (Tolerance Radii)

Not pixel-perfect — each entity has a generous click target to prevent frustration:

| Entity | Hit Area Shape | Size | Notes |
|--------|---------------|------|-------|
| **Unit** (32×32 sprite) | Circle | **24px radius** from sprite center | Generous — units are small |
| **Building** (64×64 sprite) | Circle | **40px radius** from sprite center | Includes glow zone |
| **Nexus** (96×96 sprite) | Circle | **56px radius** from sprite center | Larger building, larger target |
| **Bond line** | Capsule (line + padding) | **8px perpendicular distance** from nearest point on bezier | Thin but not impossible |
| **Terrain** (everything else) | Infinite | Entire canvas minus above | Click = deselect |

### Overlap Resolution Algorithm

```javascript
function resolveClick(mouseX, mouseY) {
  // 1. Check units first (highest priority)
  for (const unit of units) {
    if (distance(mouseX, mouseY, unit.center) <= 24) {
      return { type: 'unit', entity: unit };
    }
  }

  // 2. Check buildings
  for (const building of buildings) {
    const radius = building.id === 'nexus' ? 56 : 40;
    if (distance(mouseX, mouseY, building.center) <= radius) {
      return { type: 'building', entity: building };
    }
  }

  // 3. Check bond lines
  for (const bond of bonds) {
    if (distanceToBezier(mouseX, mouseY, bond.curve) <= 8) {
      return { type: 'bond', entity: bond };
    }
  }

  // 4. Terrain (deselect)
  return { type: 'terrain', entity: null };
}
```

**When multiple entities of the same layer overlap** (e.g., two bond lines crossing), the one with the **smaller bounding box** (i.e., shorter bond line) wins. For units/buildings, the one **closest to the click point** wins.

### Special Cases

- **Unit on top of its own building:** The unit wins (Layer 5 > Layer 4). This is the expected interaction — clicking the unit gives a quick popup, clicking the building (slightly off-center from the unit) gives the full panel.
- **Bond passing behind a building:** The building wins. Users can click the bond at any other point along its curve.
- **Two bonds crossing:** The bond with higher affinity (more visually prominent) wins. Rationale: it's the one the user is more likely trying to click.

### Hover Follows Same Rules

Hover tooltips use the same z-order and hit detection. Only the topmost entity shows its tooltip.

### Testable Assertions

```javascript
test('click on unit center hits unit, not underlying building', ...)
test('click on building edge (outside unit radius) hits building', ...)
test('click on bond line (away from buildings) hits bond', ...)
test('click on empty terrain returns null (deselect)', ...)
test('click within 24px of unit center hits unit', ...)
test('click at 25px from unit center does NOT hit unit', ...)
test('click within 8px of bond bezier hits bond', ...)
test('click at 9px from bond bezier does NOT hit bond', ...)
test('overlapping bonds: higher affinity wins', ...)
test('overlapping buildings: closer to click point wins', ...)
```

---

## 5. Idle Skip in Animation (Replay Mode)

**Ambiguity:** Spec mentions "skip long idle periods" in replay timelapse but doesn't define "long" or the skip behavior.

### Decision

### Definition of "Long Idle"

A period qualifies as "long idle" when **no qualifying events occur for ≥ 30 minutes**.

"Qualifying events" are the same events that appear in the alert feed (see Ambiguity #3). Internal polling, heartbeats, and micro-drift don't count.

| Idle Duration | Behavior |
|--------------|----------|
| < 30 minutes | Normal playback (1×, 2×, 5×, or 10× as selected) |
| 30 min – 4 hours | **Fast-forward at 60× speed** (30 min real time → 30 seconds playback) |
| > 4 hours | **Jump** with transition (skip entirely, show time-skip indicator) |

### Skip Visual Indicator

When a time skip occurs, the client displays:

```
┌─────────────────────────────┐
│  ⏩ Skipping 2h 15m idle    │
│     14:30 → 16:45           │
└─────────────────────────────┘
```

- **Position:** Center of screen, semi-transparent overlay
- **Duration:** Visible for 2 seconds during the skip
- **Animation:** Buildings dim to 30% opacity during skip, then fade back in
- **Timeline scrubber:** A hatched/striped section marks the skipped region on the timeline bar

### Fast-Forward vs Jump Details

**Fast-forward (30 min – 4h):**
- Playback continues at 60× base speed (regardless of user's selected speed)
- Ambient animations continue at reduced framerate (2 FPS)
- Bond lines remain visible but static
- Timeline scrubber moves visibly through the period
- User can click/drag the scrubber to stop fast-forward and inspect any moment

**Jump (>4h):**
- Playback pauses briefly (500ms)
- Time-skip overlay appears (2s)
- State snaps to the next qualifying event
- Playback resumes at user's selected speed
- The skipped region is shown as a striped/hatched zone on the timeline

### Timelapse Mode (Auto-Play)

In the "timelapse" feature (condense 24h into ~60s), the engine:

1. Identifies all qualifying events in the time range
2. Allocates playback time proportionally to event density
3. Skips/fast-forwards through idle gaps
4. Targets a total playback duration of 60 seconds ± 10s

```
Example for a 24h period with events clustered 9-12am and 2-5pm:

00:00–09:00 (9h idle)  → Jump (2s visual)
09:00–12:00 (busy)     → Play at ~10× (18s of playback)
12:00–14:00 (2h idle)  → Fast-forward at 60× (2s of playback)
14:00–17:00 (busy)     → Play at ~10× (18s of playback)
17:00–00:00 (7h idle)  → Jump (2s visual)
                         Total: ~42s playback
```

### Testable Assertions

```javascript
test('idle period < 30min plays at user-selected speed', ...)
test('idle period 30min-4h fast-forwards at 60×', ...)
test('idle period > 4h jumps with skip indicator', ...)
test('skip indicator shows correct time range', ...)
test('skip indicator visible for exactly 2 seconds', ...)
test('fast-forward allows scrubber interaction to pause', ...)
test('jumped region marked as hatched on timeline', ...)
test('timelapse targets 60s total playback ± 10s', ...)
test('timelapse allocates time proportionally to event density', ...)
```

---

## 6. Per-Agent Max Sessions

**Ambiguity:** Capacity calculation needs to know "how many sessions is normal vs overloaded" per agent, but no values are defined.

### Decision

### Per-Agent Max Sessions Table

Each agent has a different `maxSessions` threshold based on their operational role and typical workload patterns:

| Agent | `maxSessions` | Rationale |
|-------|--------------|-----------|
| **Oracle** | 3 | Research tasks are deep-focus; more than 3 concurrent = context switching hell |
| **Atlas** | 5 | Ops tasks are often monitoring/lightweight; handles more parallelism |
| **Sentinel** | 3 | Security scans need focused attention; 3 is plenty |
| **Verifier** | 4 | Validation tasks are medium-weight; can handle several in parallel |
| **Archivist** | 3 | Documentation requires sustained attention |
| **Synth** | 3 | Coding tasks are deep-focus; more than 3 = quality drops |
| **Echo** | 5 | Orchestration involves lightweight coordination of others |
| **Nexus** | 5 | Routing/dispatch is lightweight; high parallelism expected |

### Configuration Location

These values live in the **tactical map `config.js`** file as a tunable constant. Not hardcoded deep in logic — easily adjustable without diving into business logic.

```javascript
// config.js
export const AGENT_MAX_SESSIONS = {
  oracle:    3,
  atlas:     5,
  sentinel:  3,
  verifier:  4,
  archivist: 3,
  synth:     3,
  echo:      5,
  nexus:     5,
};

// Default for any unknown agent (shouldn't happen, but defensive)
export const DEFAULT_MAX_SESSIONS = 3;
```

### Capacity Examples

| Agent | Active Sessions | maxSessions | Capacity | State |
|-------|----------------|-------------|----------|-------|
| Oracle | 0 | 3 | 0% | `idle` |
| Oracle | 1 | 3 | 33% | `active` |
| Oracle | 2 | 3 | 67% | `active` |
| Oracle | 3 | 3 | 100% | `overloaded` (≥80%) |
| Atlas | 2 | 5 | 40% | `active` |
| Atlas | 4 | 5 | 80% | `overloaded` (exactly 80%) |
| Atlas | 3 | 5 | 60% | `active` (if was overloaded, hysteresis: stays overloaded until <70%) |
| Echo | 5 | 5 | 100% | `overloaded` |
| Echo | 3 | 5 | 60% | `active` (below 70% hysteresis threshold) |

### Health Bar Color Thresholds

These apply universally regardless of per-agent maxSessions:

| Capacity % | Health Bar Color | Hex |
|-----------|-----------------|-----|
| 0% | Empty (no fill) | — |
| 1–49% | Green | `#33ff88` |
| 50–79% | Yellow | `#f6c445` |
| 80–99% | Orange-red | `#ff6633` |
| 100% | Red, flashing | `#ff3333` |
| Error state | Gray, depleted | `#666666` |

### Future: Dynamic Tuning

If we later want to make these dynamic (e.g., auto-adjust based on historical performance), the config structure supports it. But for Phase 5, **static values in config.js are sufficient**. Don't over-engineer.

### API Response

The `maxSessions` value is **not exposed in the API response**. The server uses it internally to calculate `capacity` (0-100) and `state.status`. The client receives the already-computed values.

**Rationale:** The client doesn't need to know the formula — it just renders the health bar at the capacity percentage and the building in the given state. Keeping the calculation server-side means we can tune thresholds without client updates.

### Testable Assertions

```javascript
test('oracle at 3/3 sessions = 100% capacity', ...)
test('atlas at 4/5 sessions = 80% capacity', ...)
test('echo at 3/5 sessions = 60% capacity', ...)
test('oracle at 2/3 sessions = 67% capacity (floor)', ...)
test('unknown agent uses default maxSessions of 3', ...)
test('capacity is clamped to 0-100 range', ...)
test('capacity 80+ triggers overloaded state', ...)
test('capacity 70+ but previously overloaded stays overloaded (hysteresis)', ...)
test('capacity 69 after overloaded transitions to active', ...)
test('health bar green at 49%', ...)
test('health bar yellow at 50%', ...)
test('health bar orange-red at 80%', ...)
test('health bar red flashing at 100%', ...)
test('health bar gray in error state regardless of capacity', ...)
```

---

## Summary of All Decisions

| # | Ambiguity | Decision | Key Rule |
|---|-----------|----------|----------|
| 1 | Building State Transitions | State machine with hysteresis + debounce | `idle↔active` debounced 30s; `overloaded` at ≥80%, clears at <70% |
| 2 | Task Duration Metadata | Three-tier estimation: explicit → type default → 30min | Missing = indeterminate pulsing bar, never fake percentage |
| 3 | Event Priority / Filtering | Defined inclusion rules + severity ordering | No filtering by severity in feed; noise excluded at generation |
| 4 | Hit Area Z-Order | Layer priority: Units > Buildings > Bonds > Terrain | Generous radii (24px/40px/8px); closest wins within same layer |
| 5 | Idle Skip in Animation | 30min = fast-forward at 60×; 4h+ = jump with indicator | Visual indicator during skips; hatched timeline regions |
| 6 | Per-Agent Max Sessions | Per-agent thresholds in config.js (3-5 range) | Oracle/Sentinel/Archivist/Synth: 3; Verifier: 4; Atlas/Echo/Nexus: 5 |

All 6 ambiguities are now resolved with:
- ✅ Concrete, unambiguous rules
- ✅ Testable assertions (copy-pasteable test descriptions)
- ✅ Implementation notes with code examples
- ✅ Edge cases addressed

---

*These decisions are final for Phase 5.1 implementation. If experience during development reveals issues, update this doc with the revision and rationale.*
