# Phase 5 Review: Verifier (Testing & Quality Assurance)

**Reviewer:** Verifier (Sensor Tower)  
**Date:** 2026-02-14  
**Spec Reviewed:** `phase5-tactical-map-spec.md` v1.0  
**Feasibility Assessment:** 🟡 YELLOW — Implementable, but testing strategy has significant gaps that need filling before development begins.

---

> *"Sensors operational. I have scanned every subsystem. Here is what the sweep reveals."*

---

## 1. Executive Testing Assessment

The spec is **visually rich and well-structured** but **testing-thin**. Section 14's phased checklist defines *what* to build, not *how to verify it works*. There are zero test tasks in any phase. No quality gates between phases. No coverage targets. No test infrastructure mentioned.

**The core risk:** This is a highly visual, interactive, real-time system — exactly the kind where bugs are subtle (animation glitches, performance regressions, stale state, race conditions) and hard to catch without deliberate test infrastructure. Bolting tests on after Phase 5.5 is too late. Testing must be baked into every phase.

**Overall verdict:** The spec needs a parallel testing track that runs alongside each implementation phase. This review provides that track.

---

## 2. Testing Plan — Unit / Integration / E2E / Manual QA Breakdown

### 2.1 Unit Tests

Unit tests cover isolated modules. The spec's file structure (§11) maps well to testable units.

| Module | What to Test | Framework | Est. Test Count |
|--------|-------------|-----------|-----------------|
| `config.js` | Building positions, color palette values, constants | Vitest | 15-20 |
| `state/store.js` | State mutations, subscriptions, reset | Vitest | 20-30 |
| `state/agent-state.js` | Activity state derivation, capacity calculation, state transitions (IDLE→ACTIVE→OVERLOADED→ERROR) | Vitest | 40-50 |
| `state/bond-state.js` | Affinity tier classification, drift application, tier boundary transitions | Vitest | 30-40 |
| `data/activity-mapper.js` | Session label → activity mapping for all 8 agents, regex matching, fallback to idle | Vitest | 80+ |
| `data/api-client.js` | API response parsing, error handling, polling lifecycle, retry logic | Vitest + MSW | 25-30 |
| `data/replay-engine.js` | State reconstruction at timestamp, interpolation, speed control | Vitest | 30-40 |
| `utils/math.js` | Bezier curve calculation, interpolation, coordinate transforms | Vitest | 15-20 |
| `utils/color.js` | Color blending, gradient calculation, tier color mapping | Vitest | 10-15 |
| `utils/easing.js` | Easing function outputs (ease-in, ease-out, spring) | Vitest | 10-15 |
| `audio/audio-config.js` | Sound definitions, cooldown logic, volume calculations | Vitest | 10-15 |
| `interaction/keyboard.js` | Key mapping, shortcut dispatch, modifier handling | Vitest + jsdom | 15-20 |

**Total estimated unit tests: ~300-350**

#### Critical Unit Test: `activity-mapper.js`

This is the brain of the visualization. The spec provides regex patterns for 8 agents × 3-4 activities = ~25 activity patterns. Each pattern needs:

```javascript
// Example test structure
describe('activity-mapper', () => {
  describe('oracle', () => {
    test.each([
      ['Research phase 5 design', 'researching'],
      ['Investigating network issue', 'researching'],
      ['Analyze deployment metrics', 'analyzing'],
      ['Review security audit results', 'analyzing'],
      ['Writing spec document', 'writing'],
      ['Document API changes', 'writing'],
      ['random unmatched task', 'idle'],        // fallback
      ['', 'idle'],                              // empty label
      [null, 'idle'],                            // null label
      [undefined, 'idle'],                       // undefined label
    ])('maps "%s" → %s', (label, expected) => {
      expect(mapSessionToActivity({ label }, 'oracle')).toBe(expected);
    });
  });
  // ... repeat for all 8 agents
});
```

**Why this matters:** A bad regex match means an agent animates incorrectly — wrong building state, wrong particle effects, wrong unit position. This is the single highest-coverage-value unit test in the project.

**Missing from spec:** What happens when a session label matches multiple patterns? (e.g., "Review and fix deployment" matches both "review" for analyzing and "fix" for fixing on Atlas). The first-match-wins approach in the spec code should be tested explicitly with ambiguous inputs.

### 2.2 Integration Tests

Integration tests verify modules working together. These require a test environment with mocked APIs but real rendering logic.

| Integration Scope | What to Test | Framework | Est. Test Count |
|-------------------|-------------|-----------|-----------------|
| **API → State** | Polling fetches data, state store updates correctly, re-renders trigger | Vitest + MSW | 15-20 |
| **State → Renderer** | State change triggers correct building animation state | Vitest + PixiJS headless | 20-25 |
| **State → Bond Renderer** | Affinity changes update bond colors, widths, animations | Vitest + PixiJS headless | 15-20 |
| **Click → Panel** | Click event on building → correct panel opens with correct data | Vitest + PixiJS headless | 20-25 |
| **Keyboard → Action** | Keyboard shortcut → correct state mutation + UI update | Vitest + jsdom | 15 |
| **Replay Engine → Renderer** | Timestamp change → all renderers update to historical state | Vitest + PixiJS headless | 15-20 |
| **WebSocket → Event Feed** | Event arrives → alert feed updates, sound triggers, animation fires | Vitest + MSW | 10-15 |
| **Session Bridge → API** | Bridge script output → API parses correctly → state updates | Vitest | 10-15 |

**Total estimated integration tests: ~120-155**

#### Critical Integration: Canvas → API → DB Stack Test

The full stack flow is:

```
ventureos-rpg.db → API Server (Express) → REST/WebSocket → api-client.js → state/store.js → renderer/*.js → PixiJS Canvas
```

We need an integration test that:
1. Seeds a test SQLite DB with known state
2. Starts the API server against that DB
3. Lets the client poll
4. Verifies the canvas state matches expectations

```javascript
// integration/full-stack.test.js
describe('full stack integration', () => {
  let server, db, app;
  
  beforeEach(async () => {
    db = await createTestDB(TEST_FIXTURES.threeAgentsActive);
    server = await startAPIServer({ db, port: 0 });
    app = await createTacticalMap({ apiUrl: server.url });
  });
  
  afterEach(async () => {
    await app.destroy();
    await server.close();
    await db.close();
  });
  
  test('active agents show ACTIVE building state', async () => {
    await app.waitForFirstPoll();
    
    const oracleBuilding = app.getBuilding('oracle');
    expect(oracleBuilding.state).toBe('ACTIVE');
    expect(oracleBuilding.animation).toBe('researching');
    
    const verifierBuilding = app.getBuilding('verifier');
    expect(verifierBuilding.state).toBe('IDLE');
  });
});
```

### 2.3 End-to-End Tests

E2E tests run the full application in a real browser. These are expensive but catch rendering bugs that headless tests miss.

| E2E Scenario | What to Validate | Framework | Priority |
|-------------|-----------------|-----------|----------|
| **Initial load** | Map renders, all 8 buildings visible, KPI ticker populated | Playwright | P0 |
| **Building click → panel** | Click Oracle → panel slides in with correct data | Playwright | P0 |
| **Bond visualization** | All 28 bonds render, gold bonds visually distinct from red | Playwright + screenshot | P1 |
| **Keyboard navigation** | Press 1-8, Tab, Space, E, Esc — correct UI responses | Playwright | P1 |
| **Camera controls** | Zoom in/out, pan, Home reset — canvas transforms correctly | Playwright | P1 |
| **Live data update** | Change DB state → map updates within polling interval | Playwright | P1 |
| **Replay mode** | Toggle replay, scrub timeline, verify historical state | Playwright | P2 |
| **Audio controls** | Mute/unmute, volume slider, per-category toggles | Playwright | P2 |
| **Responsive scaling** | Resize viewport → canvas scales, HUD remains usable | Playwright | P2 |
| **Performance baseline** | 60 FPS sustained for 60 seconds with all animations | Playwright + perf API | P0 |

**Total estimated E2E tests: 25-35**

**Note on PixiJS E2E testing:** Playwright can interact with WebGL canvas, but element-level assertions require either:
- Accessibility annotations on PixiJS containers (recommended — also helps keyboard nav)
- Coordinate-based click targets (brittle, avoid)
- Screenshot comparison (for visual correctness)

**Recommendation:** Add `aria-label` attributes to PixiJS containers for each building, bond, and HUD element. This serves dual purpose: testability AND accessibility.

### 2.4 Manual QA Checkpoints

Automated tests cannot catch everything in a visual system. These are **mandatory manual QA sessions** between phases.

| Phase Gate | Manual QA Focus | Duration | Who |
|-----------|----------------|----------|-----|
| **Post-5.1** | Buildings positioned correctly, terrain looks right, camera feels smooth, KPI ticker readable | 30 min | Verifier + 1 teammate |
| **Post-5.2** | Animations feel alive (not janky), state transitions are smooth, particle effects look good, health bars accurate | 45 min | Verifier + Oracle (design intent) |
| **Post-5.3** | Bond curves look natural, color tiers distinguishable, collaboration animation visible, drift events fire | 30 min | Verifier + Archivist (bond data expert) |
| **Post-5.4** | All click targets work, panels contain correct data, keyboard shortcuts responsive, tooltips positioned correctly | 45 min | Verifier + Echo (UX perspective) |
| **Post-5.5** | Audio atmosphere feels right, sound cooldowns work, transitions polished, no visual glitches | 30 min | Full team demo |
| **Post-5.6** | Replay accuracy spot-checked against known events, timeline scrubber responsive, exit replay smooth | 45 min | Verifier + Oracle |

**Total manual QA: ~3.75 hours across all phases**

---

## 3. Coverage Targets — Per-Phase Minimum Goals

### Coverage Philosophy

Not all code benefits equally from coverage metrics. The rendering layer is hard to cover with line-based metrics (PixiJS draw calls). The logic layer (state, data, utils) should be heavily covered.

| Layer | Target Coverage | Rationale |
|-------|----------------|-----------|
| **State management** (`state/*`) | **95%** | Core logic, bugs here cascade everywhere |
| **Data layer** (`data/*`) | **90%** | API parsing, activity mapping — high bug risk |
| **Utils** (`utils/*`) | **95%** | Pure functions, easy to test, high reuse |
| **Interaction** (`interaction/*`) | **80%** | Event handlers, some browser-dependent paths |
| **Renderer** (`renderer/*`) | **60%** | Setup/config logic testable, draw calls not |
| **Audio** (`audio/*`) | **70%** | Config and logic testable, playback mocked |

### Per-Phase Coverage Milestones

| Phase | New Code | Cumulative Target | Key Coverage Requirements |
|-------|----------|-------------------|--------------------------|
| **5.1** | config, state/store, data/api-client, renderer/terrain+buildings+camera, basic HUD | **75%** overall, **95%** on state + config | API client 90%, building positions 100% |
| **5.2** | activity-mapper, agent-state, renderer/units+particles, health bars, progress bars | **80%** overall, **95%** on activity-mapper | All 25 activity patterns tested, all 4 building states tested per agent |
| **5.3** | bond-state, renderer/bonds, collaboration particles, drift animations | **80%** overall, **95%** on bond-state | All 5 affinity tiers, tier boundary transitions, all 28 bonds render |
| **5.4** | interaction/*, panels, modals, overlays, keyboard, tooltips | **80%** overall, **80%** on interaction | Every click target, every keyboard shortcut, panel content correctness |
| **5.5** | audio/*, visual polish, easing | **80%** overall, **70%** on audio | Cooldown logic, volume calculations, spatial audio distance formula |
| **5.6** | replay-engine, timeline UI, playback controls | **80%** overall, **90%** on replay-engine | State reconstruction accuracy, interpolation correctness, speed multiplier |

### Coverage Enforcement

- **CI gate:** Coverage below phase target blocks merge
- **Tool:** Vitest with `c8` or `istanbul` coverage provider
- **Report:** HTML coverage report generated on every PR
- **Exclusions:** PixiJS rendering internals, third-party library wrappers, asset loading boilerplate

---

## 4. Test Infrastructure Needed

### 4.1 Test Framework Stack

```
Testing Framework:    Vitest (fast, ESM-native, compatible with Vite build)
Mocking:              Vitest built-in mocking + MSW (Mock Service Worker) for API
Browser Testing:      Playwright (E2E, screenshot comparison)
Visual Regression:    Playwright screenshot + pixelmatch or Percy
Performance:          Playwright + Performance Observer API
Coverage:             c8 (Vitest built-in)
CI Runner:            GitHub Actions or local script
```

### 4.2 Mock Infrastructure

#### API Mocks (MSW)

```javascript
// test/mocks/handlers.js
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/agents/status', () => {
    return HttpResponse.json(TEST_FIXTURES.agentStatus.allIdle);
  }),
  
  http.get('/api/bonds', () => {
    return HttpResponse.json(TEST_FIXTURES.bonds.seeded);
  }),
  
  http.get('/api/sessions/active', () => {
    return HttpResponse.json(TEST_FIXTURES.sessions.threeActive);
  }),
  
  http.get('/api/replay/:timestamp', ({ params }) => {
    const state = TEST_FIXTURES.replay[params.timestamp];
    return HttpResponse.json(state || TEST_FIXTURES.replay.default);
  }),
];
```

#### PixiJS Headless Rendering

PixiJS requires a WebGL context. Options:
1. **`@pixi/node`** — Server-side PixiJS with headless-gl (preferred)
2. **`jsdom` + canvas shim** — Limited, no WebGL
3. **Playwright** — Full browser, slow but accurate

**Recommendation:** Use `@pixi/node` for integration tests (fast, no browser), Playwright for E2E visual tests (slow, accurate).

#### Time Mocking

Critical for testing drift visualizations and replay without waiting days:

```javascript
// test/helpers/time-mock.js
import { vi } from 'vitest';

export function mockTime(isoString) {
  const mockDate = new Date(isoString);
  vi.setSystemTime(mockDate);
}

export function advanceTime(ms) {
  vi.advanceTimersByTime(ms);
}

// Usage: Test drift over "3 days" in milliseconds
test('bond color transitions on drift over time', async () => {
  vi.useFakeTimers();
  mockTime('2026-02-12T00:00:00Z');
  
  const bondState = createBondState('oracle', 'archivist', 0.70);  // Blue tier
  
  // Simulate drift events over 3 days
  advanceTime(DAY_MS);
  bondState.applyDrift(+0.05, 'collaboration');
  advanceTime(DAY_MS);
  bondState.applyDrift(+0.05, 'collaboration');
  advanceTime(DAY_MS);
  bondState.applyDrift(+0.06, 'collaboration');
  
  // Should have crossed from Blue (0.70) → Bright Blue (0.75) → Gold (0.86)
  expect(bondState.affinity).toBeCloseTo(0.86);
  expect(bondState.tier).toBe('gold');
  expect(bondState.color).toBe('#f6c445');
  
  vi.useRealTimers();
});
```

#### Audio Mocking

For testing audio without human ears:

```javascript
// test/mocks/audio-mock.js
export class MockHowl {
  constructor(config) {
    this.config = config;
    this.playHistory = [];
    this.volume = config.volume || 1;
    this.playing = false;
  }
  
  play(spriteId) {
    this.playHistory.push({ spriteId, timestamp: Date.now(), volume: this.volume });
    this.playing = true;
    return this.playHistory.length;
  }
  
  stop() { this.playing = false; }
  volume(v) { if (v !== undefined) this.volume = v; return this.volume; }
  
  // Test helpers
  wasPlayed(spriteId) { return this.playHistory.some(p => p.spriteId === spriteId); }
  playCount(spriteId) { return this.playHistory.filter(p => p.spriteId === spriteId).length; }
  lastPlayedAt() { return this.playHistory[this.playHistory.length - 1]?.timestamp; }
}
```

**What we can test without human ears:**
- ✅ Correct sound triggered for correct event
- ✅ Cooldown logic (30s per unit click) 
- ✅ Volume calculation (spatial audio distance formula)
- ✅ Mute state persists across interactions
- ✅ Per-category muting works
- ✅ Sound priority (critical overrides low)
- ✅ Audio sprite IDs match config
- ❌ Does it *sound good* — manual QA only

### 4.3 Test Data Fixtures

```
test/
├── fixtures/
│   ├── agent-status/
│   │   ├── all-idle.json              # 8 agents, all idle
│   │   ├── three-active.json          # Oracle, Atlas, Sentinel active
│   │   ├── one-overloaded.json        # Atlas at 100% capacity
│   │   ├── one-errored.json           # Sentinel in ERROR state
│   │   ├── all-active.json            # All 8 agents working
│   │   └── mixed-states.json          # Mix of IDLE, ACTIVE, OVERLOADED, ERROR
│   ├── bonds/
│   │   ├── seeded.json                # 28 bonds at seed values
│   │   ├── evolved.json               # 28 bonds after drift events
│   │   ├── extreme-high.json          # All bonds at 0.95 (stress test)
│   │   ├── extreme-low.json           # All bonds at 0.30 (all red)
│   │   └── tier-boundaries.json       # Bonds at exact tier boundaries (0.40, 0.60, 0.75, 0.85)
│   ├── sessions/
│   │   ├── empty.json                 # No active sessions
│   │   ├── oracle-researching.json    # Oracle with research session
│   │   ├── multi-agent-collab.json    # Oracle + Archivist in shared session
│   │   ├── ambiguous-labels.json      # Session labels that match multiple patterns
│   │   └── malformed.json             # Missing fields, null values, empty strings
│   ├── replay/
│   │   ├── snapshot-feb12.json        # Known state at Feb 12 00:00
│   │   ├── snapshot-feb13.json        # Known state at Feb 13 00:00
│   │   ├── events-feb12-feb14.json    # All events in range
│   │   └── empty-period.json          # Long idle period (no events for 6h)
│   └── db/
│       ├── seed.sql                   # Minimal DB seed for integration tests
│       └── rich.sql                   # Full dataset for E2E tests
├── mocks/
│   ├── handlers.js                    # MSW API handlers
│   ├── audio-mock.js                  # Howler.js mock
│   └── pixi-mock.js                   # Minimal PixiJS mock for unit tests
├── helpers/
│   ├── time-mock.js                   # Fake timers
│   ├── canvas-assertions.js           # Custom matchers for PixiJS state
│   └── performance-harness.js         # FPS measurement utilities
└── screenshots/
    ├── baseline/                      # Golden screenshots per phase
    └── current/                       # Current test run screenshots
```

### 4.4 Test Database

For integration and E2E tests, we need an isolated SQLite database:

```javascript
// test/helpers/test-db.js
import Database from 'better-sqlite3';
import fs from 'fs';

export async function createTestDB(fixture = 'seed') {
  const db = new Database(':memory:');
  const schema = fs.readFileSync('test/fixtures/db/schema.sql', 'utf8');
  const seed = fs.readFileSync(`test/fixtures/db/${fixture}.sql`, 'utf8');
  db.exec(schema);
  db.exec(seed);
  return db;
}
```

**This directly addresses Gap #3 (Oracle):** The session detection bridge script must be tested against a mock data source, NOT against live OpenClaw internals. The bridge should read from a well-defined interface (JSON file or SQLite table) — tests seed that interface with known data.

---

## 5. Addressing Specific Concerns

### 5.1 Activity Detection: 8 Agents × 4 States = 32 Combinations

**Problem:** Testing all 32 agent-state combinations manually is tedious and error-prone.

**Solution:** Parameterized test matrix.

```javascript
const AGENTS = ['oracle', 'archivist', 'synth', 'atlas', 'sentinel', 'verifier', 'echo', 'nexus'];
const STATES = ['IDLE', 'ACTIVE', 'OVERLOADED', 'ERROR'];

describe('building state rendering', () => {
  for (const agent of AGENTS) {
    for (const state of STATES) {
      test(`${agent} in ${state} state renders correctly`, async () => {
        const fixture = createAgentFixture(agent, state);
        const building = renderBuilding(agent, fixture);
        
        expect(building.animationState).toBe(state.toLowerCase());
        expect(building.glowColor).toBe(EXPECTED_COLORS[agent][state]);
        expect(building.frameRate).toBe(EXPECTED_FPS[state]);
        expect(building.particleEffect).toBe(EXPECTED_PARTICLES[agent][state]);
      });
    }
  }
});
```

**Expected values table (derived from §4-5):**

| State | Frame Rate | Glow Behavior | Particle Type |
|-------|-----------|---------------|---------------|
| IDLE | 2 FPS | Slow pulse | Ambient |
| ACTIVE | 12 FPS | Energetic, activity-specific | Activity-specific |
| OVERLOADED | 8 FPS | Red tint overlay | Red sparks |
| ERROR | 4 FPS | Damage cracks | Smoke |

**Additionally:** Each agent has 3-4 unique ACTIVE sub-states (e.g., Oracle: researching/analyzing/writing/idle). That's another ~25 sub-state tests covering the unique animations per activity.

**Total for this concern: 32 state tests + ~25 activity sub-state tests = ~57 tests**

### 5.2 Khala Network Drift: Testing Without Waiting Days

**Problem:** Bonds drift over time. The drift visualization involves color transitions, shimmer effects, and tier changes that evolve over days/weeks.

**Solution:** Three-layer approach:

**Layer 1 — Unit test with fake timers (instant):**
```javascript
test('bond transitions from blue to gold over simulated drift events', () => {
  vi.useFakeTimers();
  const bond = new BondState('oracle', 'archivist', 0.65); // Blue tier
  
  // Simulate 6 drift events over "2 weeks"
  for (let i = 0; i < 6; i++) {
    vi.advanceTimersByTime(2 * DAY_MS);
    bond.applyDrift(+0.05, 'collaboration');
  }
  
  expect(bond.affinity).toBeCloseTo(0.95);
  expect(bond.tier).toBe('gold');
  expect(bond.tierTransitions).toEqual([
    { from: 'blue', to: 'bright_blue', at: expect.any(Number) },
    { from: 'bright_blue', to: 'gold', at: expect.any(Number) },
  ]);
  
  vi.useRealTimers();
});
```

**Layer 2 — Snapshot-based visual regression (fast, CI-safe):**
- Create fixture with bonds at exact tier boundaries (0.39, 0.40, 0.59, 0.60, 0.74, 0.75, 0.84, 0.85)
- Render each, screenshot, compare to golden baseline
- This catches off-by-one errors in tier classification

**Layer 3 — Accelerated simulation E2E (slow, nightly):**
- Run the full app against a test DB
- Script that injects drift events every 100ms (simulating weeks in seconds)
- Record a video of the canvas
- Verify tier color transitions are smooth (no jumps)
- Run nightly, not on every PR

### 5.3 Replay Mode: Testing Historical Data Accuracy

**Problem:** The replay engine must reconstruct state at arbitrary timestamps. How do we know it's correct?

**Solution:** Known-state snapshot testing.

```javascript
describe('replay engine state reconstruction', () => {
  const KNOWN_STATES = [
    {
      timestamp: '2026-02-12T14:00:00Z',
      expectedActive: ['oracle', 'atlas'],
      expectedBonds: { 'oracle↔archivist': 0.85, 'sentinel↔synth': 0.42 },
      expectedMissions: 2,
    },
    {
      timestamp: '2026-02-13T03:00:00Z',  // 3 AM, expect all idle
      expectedActive: [],
      expectedBonds: { 'oracle↔archivist': 0.88 },  // drifted since yesterday
      expectedMissions: 0,
    },
  ];
  
  for (const snapshot of KNOWN_STATES) {
    test(`reconstructs correct state at ${snapshot.timestamp}`, async () => {
      const state = await replayEngine.reconstructState(snapshot.timestamp);
      
      expect(state.activeAgents.map(a => a.id).sort())
        .toEqual(snapshot.expectedActive.sort());
      
      for (const [bondKey, expectedAffinity] of Object.entries(snapshot.expectedBonds)) {
        expect(state.bonds[bondKey].affinity).toBeCloseTo(expectedAffinity, 2);
      }
      
      expect(state.activeMissions.length).toBe(snapshot.expectedMissions);
    });
  }
});
```

**Edge cases to test:**
- Timestamp before any data exists → graceful empty state
- Timestamp in the future → returns current live state
- Timestamp during a mission (started but not completed) → mission shows as active
- Exact timestamp of a drift event → uses the new value (not the old)
- Rapid scrubbing (100+ state reconstructions per second) → no memory leak

**Interpolation accuracy:**
```javascript
test('interpolates agent position between activity zones', () => {
  // Oracle moves from Observatory to Crystal Field
  const t0 = new Date('2026-02-12T14:00:00Z').getTime(); // At building
  const t1 = new Date('2026-02-12T14:00:10Z').getTime(); // At crystal
  const tMid = t0 + 5000; // Halfway
  
  const pos = replayEngine.interpolatePosition('oracle', tMid, t0, t1);
  
  // Should be halfway between Observatory(960,320) and Crystal(960,160)
  expect(pos.x).toBeCloseTo(960);
  expect(pos.y).toBeCloseTo(240);
});
```

### 5.4 Sound Acknowledgments: Testing Without Human Ears

**Problem:** 8 unit voice lines, ambient layers, event sounds — how to validate audio behavior programmatically?

**Solution:** Test the *logic*, not the *sound*.

**What automated tests cover:**

| Test | Assertion |
|------|-----------|
| Click Oracle → voice line plays | `mockHowl.wasPlayed('oracle_ack')` === true |
| Click Oracle twice quickly → only one play | `mockHowl.playCount('oracle_ack')` === 1 |
| Click Oracle, wait 31s, click again → two plays | `mockHowl.playCount('oracle_ack')` === 2 |
| Mute pressed → no sounds play | `mockHowl.playCount('*')` === 0 |
| Task complete event → chime plays | `mockHowl.wasPlayed('task_complete')` === true |
| Error event → alert plays with critical priority | `mockHowl.lastPlayed().priority` === 'critical' |
| Spatial audio: zoomed out → lower volume | `mockHowl.volume() < 0.5` |
| Spatial audio: zoomed in on Oracle → full volume | `mockHowl.volume()` ≈ 1.0 |
| Mute SFX category → voice still works | Voice plays, SFX doesn't |
| localStorage persists volume | Reload → volume same as before |

**What requires manual QA:**
- Do the voice lines *sound like* StarCraft? (subjective)
- Is the ambient mix pleasant? (subjective)
- Are event sounds distinguishable from each other? (subjective)
- Does spatial audio *feel* right? (subjective)

**Recommendation:** Create an **audio test page** (`/test/audio.html`) that plays all sounds in sequence with labels. QA tester clicks through, marks each pass/fail. Takes 5 minutes.

### 5.5 Session Detection Bridge (Gap #3)

**Problem:** The bridge script interfaces with OpenClaw internals (`openclaw sessions` or equivalent). Tests must not depend on OpenClaw being installed/running.

**Solution: Contract-based testing with interface isolation.**

```
┌───────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  OpenClaw Sessions │ ──► │  Bridge Script   │ ──► │ sessions.json or │
│  (real CLI output) │     │  (parser/writer) │     │ SQLite table     │
└───────────────────┘     └─────────────────┘     └──────────────────┘
                                                          │
                                                          ▼
                                                   ┌──────────────────┐
                                                   │  API Server      │
                                                   │  /api/sessions   │
                                                   └──────────────────┘
```

**Test the bridge in isolation:**

```javascript
describe('session bridge', () => {
  test('parses openclaw sessions output format', () => {
    const rawOutput = fs.readFileSync('test/fixtures/openclaw-sessions-output.txt', 'utf8');
    const parsed = parseSessions(rawOutput);
    
    expect(parsed).toEqual([
      { agent: 'oracle', label: 'Research phase 5', kind: 'isolated', startedAt: expect.any(Date) },
      { agent: 'atlas', label: 'Deploy backup v3', kind: 'isolated', startedAt: expect.any(Date) },
    ]);
  });
  
  test('handles empty sessions list', () => {
    const parsed = parseSessions('No active sessions\n');
    expect(parsed).toEqual([]);
  });
  
  test('handles malformed output gracefully', () => {
    const parsed = parseSessions('ERROR: connection refused\n');
    expect(parsed).toEqual([]);
    // Should log warning, not throw
  });
  
  test('writes valid JSON output', () => {
    const sessions = [{ agent: 'oracle', label: 'test' }];
    writeSessions(sessions, '/tmp/test-sessions.json');
    const written = JSON.parse(fs.readFileSync('/tmp/test-sessions.json', 'utf8'));
    expect(written).toEqual(sessions);
  });
});
```

**Key principle:** The bridge's *output format* is the contract. Tests verify the bridge produces correct output from known input. Neither side needs the other to be running.

**The fixture `test/fixtures/openclaw-sessions-output.txt`** should be captured once from a real `openclaw sessions` call and committed to the repo. If OpenClaw's output format changes, the fixture updates (and the bridge parser adapts).

---

## 6. Performance Validation (§12 Budget)

### 6.1 How to Verify 60 FPS

```javascript
// test/helpers/performance-harness.js
export async function measureFPS(page, durationMs = 10000) {
  return page.evaluate((duration) => {
    return new Promise((resolve) => {
      const frames = [];
      let startTime;
      
      function frame(timestamp) {
        if (!startTime) startTime = timestamp;
        frames.push(timestamp);
        
        if (timestamp - startTime < duration) {
          requestAnimationFrame(frame);
        } else {
          const deltas = frames.slice(1).map((t, i) => t - frames[i]);
          const avgFPS = 1000 / (deltas.reduce((a, b) => a + b) / deltas.length);
          const minFPS = 1000 / Math.max(...deltas);
          const p95FPS = 1000 / deltas.sort((a, b) => b - a)[Math.floor(deltas.length * 0.05)];
          
          resolve({ avgFPS, minFPS, p95FPS, frameCount: frames.length, droppedFrames: deltas.filter(d => d > 33).length });
        }
      }
      
      requestAnimationFrame(frame);
    });
  }, durationMs);
}
```

**Performance test scenarios:**

| Scenario | Expected FPS | Test Duration |
|----------|-------------|---------------|
| Idle map (all buildings idle, no particles) | ≥ 60 | 10s |
| All 8 agents active (max particles) | ≥ 55 | 10s |
| All 28 bonds visible + 3 collaborations | ≥ 55 | 10s |
| Full load: all active + all bonds + event feed updating | ≥ 50 | 30s |
| Zoom in → zoom out → pan across map | ≥ 50 | 15s |
| Replay mode at 10× speed | ≥ 50 | 10s |

**Dropped frame budget:** < 5% of frames over 33ms (= below 30 FPS for that frame).

**CI enforcement:** Run perf tests nightly on a consistent machine. Alert if avg FPS drops below 55 (warning) or 50 (failure).

### 6.2 How to Verify < 2s Initial Load

```javascript
test('initial load under 2 seconds', async ({ page }) => {
  const metrics = await page.evaluate(() => {
    return {
      navigationStart: performance.timing.navigationStart,
      firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      firstMeaningfulPaint: performance.mark('map-buildings-rendered')?.startTime,
    };
  });
  
  expect(metrics.firstContentfulPaint).toBeLessThan(1000);  // FCP < 1s
  expect(metrics.firstMeaningfulPaint).toBeLessThan(2000);   // FMP < 2s
});
```

**Requirement:** The app code must call `performance.mark('map-buildings-rendered')` when all 8 buildings are placed on canvas. This is a testability requirement for Synth/implementer.

### 6.3 How to Verify < 100ms API Latency

```javascript
test('API responses under 100ms p95', async () => {
  const latencies = [];
  
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await fetch('/api/agents/status');
    latencies.push(performance.now() - start);
  }
  
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  
  expect(p95).toBeLessThan(100);
});
```

### 6.4 How to Verify < 5MB Asset Payload

```javascript
test('total asset payload under 5MB', async ({ page }) => {
  const entries = await page.evaluate(() => 
    performance.getEntriesByType('resource')
      .map(r => ({ name: r.name, size: r.transferSize }))
  );
  
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  const totalMB = totalBytes / (1024 * 1024);
  
  expect(totalMB).toBeLessThan(5);
  
  // Also check individual large files
  const largeFiles = entries.filter(e => e.size > 500 * 1024);
  console.log('Large files:', largeFiles); // Alert for investigation
});
```

### 6.5 Memory Leak Detection

```javascript
test('no memory leak over 5 minutes', async ({ page }) => {
  const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize);
  
  // Simulate heavy usage: open panels, switch tabs, zoom, scrub
  for (let i = 0; i < 30; i++) {
    await page.click(`[data-agent="${AGENTS[i % 8]}"]`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  
  // Force GC if available
  await page.evaluate(() => window.gc?.());
  
  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize);
  const heapGrowthMB = (heapAfter - heapBefore) / (1024 * 1024);
  
  expect(heapGrowthMB).toBeLessThan(20); // Allow 20MB growth max
  expect(heapAfter / (1024 * 1024)).toBeLessThan(100); // Total under 100MB
});
```

---

## 7. Visual Regression Testing

### 7.1 Strategy

Visual regression is critical for a rendering-heavy project. Small changes to particle positions, color calculations, or sprite positioning can break the aesthetic without failing any logic test.

**Approach: Screenshot comparison with tolerance.**

```javascript
// test/visual/map-regression.test.js
import { expect, test } from '@playwright/test';

test('full map visual matches baseline', async ({ page }) => {
  await page.goto('/map');
  await page.waitForSelector('[data-map-ready="true"]');
  
  // Wait for animations to settle to a deterministic frame
  await page.evaluate(() => window.tacticalMap.pauseAnimations());
  
  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot).toMatchSnapshot('full-map.png', {
    maxDiffPixelRatio: 0.01,  // 1% tolerance for anti-aliasing
  });
});

test('oracle active state visual', async ({ page }) => {
  await page.goto('/map?fixture=oracle-active&pauseAnimations=true');
  
  const building = await page.locator('[data-agent="oracle"]').boundingBox();
  const screenshot = await page.screenshot({
    clip: { x: building.x - 50, y: building.y - 50, width: 164, height: 164 },
  });
  expect(screenshot).toMatchSnapshot('oracle-active.png', { maxDiffPixelRatio: 0.02 });
});
```

**Key requirement for visual regression:** The app MUST expose a `pauseAnimations()` method that freezes all animations to a deterministic frame (frame 0). Without this, screenshots will always differ because particles and pulses are at random positions.

### 7.2 Visual Test Inventory

| Screenshot | Fixture | What it Catches |
|-----------|---------|-----------------|
| `full-map-idle.png` | All agents idle | Layout regressions, terrain changes |
| `full-map-active.png` | All agents active | Particle density, animation states |
| `oracle-{idle,active,overloaded,error}.png` | Each Oracle state | Per-state visual correctness |
| `bond-gold.png` | Gold-tier bond focused | Bond color, width, glow |
| `bond-red.png` | Red-tier bond focused | Dash pattern, crackling |
| `hud-ticker.png` | KPI ticker region | Text rendering, color coding |
| `panel-building.png` | Building detail panel open | Panel layout, data display |
| `panel-bond.png` | Bond detail modal | Chart rendering, layout |
| `nexus-overlay.png` | Nexus overlay open | Full overlay layout |
| `replay-timeline.png` | Replay mode active | Scrubber, markers, controls |

**Total: ~25-30 visual regression screenshots**

### 7.3 CI Integration

```yaml
# .github/workflows/visual-regression.yml
visual-regression:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npx playwright install chromium
    - run: npm run test:visual
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: visual-diff
        path: test/screenshots/current/
```

**Baseline update process:**
1. Developer runs `npm run test:visual:update` to capture new baselines
2. Baselines committed to repo
3. PR reviewers check baseline diffs (GitHub shows image diffs)
4. Merge only if visual changes are intentional

---

## 8. Quality Gates — What Must Pass Before Each Phase Ships

### Phase 5.1 Gate: Foundation

| # | Gate | Type | Pass Criteria |
|---|------|------|---------------|
| 1 | All 8 buildings render at correct positions | E2E | Screenshot matches baseline ±1% |
| 2 | Nexus renders at center (960, 540) | Unit | Position assertion |
| 3 | KPI ticker shows live data from DB | Integration | Values match DB query results |
| 4 | Camera zoom works (0.5× - 2.0×) | E2E | Zoom in/out, verify transform |
| 5 | Camera pan works | E2E | Drag, verify offset changed |
| 6 | Home key resets camera | E2E | After pan+zoom, Home → default view |
| 7 | 10s polling loop fires | Integration | Mock API called ≥ 5 times in 60s |
| 8 | FPS ≥ 60 on idle map | Performance | FPS harness, 10s measurement |
| 9 | Initial load < 2s | Performance | FMP measurement |
| 10 | Unit test coverage ≥ 75% | Coverage | CI coverage report |
| 11 | **Manual QA passed** | Manual | Sign-off from Verifier |

### Phase 5.2 Gate: Activity & Animation

| # | Gate | Type | Pass Criteria |
|---|------|------|---------------|
| 1 | Activity mapper: all 25 patterns match correctly | Unit | Parameterized tests pass |
| 2 | Activity mapper: edge cases (null, empty, ambiguous) | Unit | All edge cases handled |
| 3 | All 32 agent×state combinations render | Unit/Visual | Parameterized tests + screenshots |
| 4 | State transitions animate smoothly (0.5s crossfade) | E2E | No pop-in visible in recording |
| 5 | Health bars: color gradient correct for all thresholds | Unit | Color calculation tests |
| 6 | Progress bars: on-track vs over-time colors | Unit | Time ratio → color tests |
| 7 | Particle system: < 500 simultaneous particles | Performance | Particle counter check |
| 8 | FPS ≥ 55 with all agents active | Performance | FPS harness |
| 9 | Unit test coverage ≥ 80% | Coverage | CI report |
| 10 | **Manual QA passed** | Manual | Sign-off from Verifier + Oracle |

### Phase 5.3 Gate: Khala Network

| # | Gate | Type | Pass Criteria |
|---|------|------|---------------|
| 1 | All 28 bonds render | E2E | Count bond elements on canvas |
| 2 | Bond color tiers: all 5 tiers visually distinct | Visual | Screenshot comparison per tier |
| 3 | Tier boundary classification: exact boundary values | Unit | 0.40, 0.60, 0.75, 0.85 → correct tier |
| 4 | Collaboration particles: appear during shared session | Integration | Particle spawned on collaboration event |
| 5 | Drift animation: positive → gold shimmer | Integration | Animation triggered on +δ event |
| 6 | Drift animation: negative → red crack | Integration | Animation triggered on −δ event |
| 7 | Bond tooltip: correct format "A ↔ B: 0.XX (Tier)" | E2E | Hover → verify tooltip text |
| 8 | Bond click → modal with correct data | E2E | Click → verify modal content |
| 9 | FPS ≥ 55 with all bonds + collaborations | Performance | FPS harness |
| 10 | **Manual QA passed** | Manual | Sign-off from Verifier + Archivist |

### Phase 5.4 Gate: Interactivity

| # | Gate | Type | Pass Criteria |
|---|------|------|---------------|
| 1 | Every click target works (building, unit, bond, nexus, terrain) | E2E | Click each → correct response |
| 2 | Building panel: all data fields populated correctly | E2E | Panel content matches DB |
| 3 | Bond modal: drift chart renders | E2E | Chart element present, data points visible |
| 4 | Nexus overlay: all 8 agents listed | E2E | Overlay content verification |
| 5 | Alert feed: events appear with correct colors | E2E | Inject event → verify in feed |
| 6 | Missions sidebar: progress bars accurate | E2E | Compare to DB mission data |
| 7 | All keyboard shortcuts work | E2E | Each shortcut tested individually |
| 8 | Tooltip positioning: no edge overflow | E2E | Hover near edges → tooltip stays in viewport |
| 9 | Panel dismiss: ESC, click outside, click another target | E2E | Each dismiss method tested |
| 10 | **Manual QA passed** | Manual | Sign-off from Verifier + Echo |

### Phase 5.5 Gate: Polish & Sound

| # | Gate | Type | Pass Criteria |
|---|------|------|---------------|
| 1 | All 8 voice lines play on click | Integration | Mock audio asserts correct sprite ID |
| 2 | 30s cooldown per unit click | Unit | Fake timers + mock audio |
| 3 | Volume controls persist in localStorage | E2E | Set volume, reload, verify |
| 4 | Mute shortcut works (M key) | E2E | Press M → no audio plays |
| 5 | Panel transitions smooth (300ms) | E2E | Record transition, verify duration |
| 6 | No particle pop-in (fade-in/out) | Visual | Screenshot at particle spawn, verify alpha < 1 |
| 7 | FPS ≥ 55 with full audio + effects | Performance | FPS harness |
| 8 | Asset payload < 5MB | Performance | Transfer size measurement |
| 9 | Memory < 100MB after 5min use | Performance | Heap measurement |
| 10 | **Manual QA passed** | Manual | Full team demo + sign-off |

### Phase 5.6 Gate: Replay Mode

| # | Gate | Type | Pass Criteria |
|---|------|------|---------------|
| 1 | State reconstruction: matches known snapshots | Unit | 5+ snapshot fixtures verified |
| 2 | Timeline scrubber: draggable, responsive | E2E | Drag → time updates, map reflects |
| 3 | Playback speeds: 1×, 2×, 5×, 10× all work | E2E | Each speed tested, events advance correctly |
| 4 | Event markers: appear at correct timeline positions | E2E | Known events at known times → markers present |
| 5 | Exit replay: smooth return to live view | E2E | Exit → live data resumes within 10s |
| 6 | Empty period handling: no crash on 6h idle gap | Integration | Fixture with no events → graceful skip |
| 7 | "REPLAY" watermark visible | E2E | Element present when in replay mode |
| 8 | Bond colors reflect historical affinity | Integration | Replay to known state → bonds correct color |
| 9 | No memory leak during 5min replay scrubbing | Performance | Heap growth < 20MB |
| 10 | **Manual QA passed** | Manual | Sign-off from Verifier + Oracle |

---

## 9. Recommendations — Missing Test Scenarios & Gaps

### 9.1 Missing from Spec: Error Handling & Resilience

The spec describes the happy path extensively but says nothing about:

| Failure Mode | What Happens? | Test Needed |
|-------------|---------------|-------------|
| API server down | Map should show last-known state + "Offline" indicator | Integration |
| API returns 500 | Retry with backoff, don't crash | Unit + Integration |
| API returns malformed JSON | Graceful degradation, log error | Unit |
| WebSocket disconnects | Fall back to polling, reconnect | Integration |
| Browser tab hidden (page visibility) | Pause animations (save CPU), resume on focus | E2E |
| Agent missing from API response | Show as offline/gray, don't remove building | Integration |
| Bond affinity > 1.0 or < 0.0 | Clamp to [0, 1], don't crash renderer | Unit |
| Asset fails to load (404 sprite) | Show placeholder, don't break layout | E2E |
| localStorage full | Degrade gracefully, no crash | Unit |
| Concurrent panel opens | Only one panel at a time? Spec unclear | E2E |

**Recommendation:** Add a "§ Error Handling" section to the spec defining expected behavior for each failure mode. This is testable only if expected behavior is defined.

### 9.2 Missing: Accessibility Testing

The spec mentions no accessibility considerations. At minimum:

- **Color contrast:** Bond tier colors against dark background (WCAG AA)
- **Keyboard navigation:** Tab order through buildings (spec has shortcuts, but no focus indicators)
- **Screen reader:** PixiJS canvas is invisible to screen readers without ARIA annotations
- **Reduced motion:** Users with `prefers-reduced-motion` should get no particles, minimal animation

**Test:** Use `axe-core` in Playwright for automated a11y scanning.

### 9.3 Missing: Cross-Browser Testing

Spec targets Chrome/Firefox (§11). Need to verify:

| Browser | Concern | Test |
|---------|---------|------|
| Chrome | Primary target | Full E2E suite |
| Firefox | WebGL differences | Smoke E2E (load + click) |
| Safari | WebGL quirks, Howler.js audio policy | Smoke E2E (load + audio) |
| Edge | Should match Chrome (Chromium-based) | Visual regression only |

**Recommendation:** Run full suite on Chrome, smoke suite on Firefox/Safari. Not every PR — weekly or before releases.

### 9.4 Missing: Data Integrity Tests

The SQL queries in §12 are presented but never validated:

```javascript
test('active sessions query returns correct agents', async () => {
  const db = await createTestDB('three-active');
  const result = db.prepare(`
    SELECT agent_id, COUNT(*) as active_sessions
    FROM missions WHERE status = 'in_progress'
    GROUP BY agent_id
  `).all();
  
  expect(result).toContainEqual({ agent_id: 'oracle', active_sessions: 1 });
  expect(result).toContainEqual({ agent_id: 'atlas', active_sessions: 1 });
  expect(result).toContainEqual({ agent_id: 'sentinel', active_sessions: 1 });
  expect(result).toHaveLength(3);
});
```

**Test all SQL queries from §12** against known test data. SQL bugs are silent and dangerous.

### 9.5 Missing: Concurrency & Race Condition Tests

The app has multiple async data sources (10s agent poll, 30s bond poll, WebSocket events). These can race:

| Race Condition | Risk | Test |
|----------------|------|------|
| Two polls return out of order | Stale data overwrites fresh | Sequence mock responses with controlled timing |
| WebSocket event arrives during poll processing | Partial state update | Send event mid-poll, verify final state |
| User clicks building while state is updating | Panel shows stale data | Inject click during state transition |
| Replay mode toggled during live poll | Live data contaminates replay | Toggle replay, verify live data ignored |

**Recommendation:** Use `Promise.race` and controlled delays in integration tests to simulate concurrent updates.

### 9.6 Missing: State Persistence Tests

Spec mentions localStorage for audio preferences (§9) but Oracle's Gap 6 suggests storing camera position, panel states, and tab state too.

```javascript
test('camera position persists across reload', async ({ page }) => {
  await page.goto('/map');
  
  // Pan and zoom
  await page.mouse.wheel(0, -300); // Zoom in
  // ... drag to pan ...
  
  const stateBefore = await page.evaluate(() => ({
    zoom: window.tacticalMap.camera.zoom,
    pan: window.tacticalMap.camera.pan,
  }));
  
  // Reload
  await page.reload();
  await page.waitForSelector('[data-map-ready="true"]');
  
  const stateAfter = await page.evaluate(() => ({
    zoom: window.tacticalMap.camera.zoom,
    pan: window.tacticalMap.camera.pan,
  }));
  
  expect(stateAfter.zoom).toBeCloseTo(stateBefore.zoom);
  expect(stateAfter.pan.x).toBeCloseTo(stateBefore.pan.x);
  expect(stateAfter.pan.y).toBeCloseTo(stateBefore.pan.y);
});
```

### 9.7 Spec Ambiguity: Testability Blockers

These items in the spec are **not testable as written** because the expected behavior is ambiguous:

| Section | Ambiguity | Needed Clarification |
|---------|-----------|---------------------|
| §5 | "Unique per agent" active animation — what exactly? | Define frame counts, specific visual output per agent |
| §7 | Task progress: `task_estimated_duration (from session metadata, default 30min)` — where does this metadata come from? | Define the session metadata schema |
| §7 | Alert feed: "mixed sources" — priority order when multiple events at same second? | Define event ordering/priority rules |
| §8 | Click agent unit vs click agent building — overlapping hit areas? | Define z-order / priority for overlapping elements |
| §10 | "Auto-skip idle periods (>30min no events)" — what does the user see during skip? | Define skip animation/transition |
| §4 | `max_concurrent_sessions` per agent — what are the actual values? | Define per-agent max values |

**Recommendation:** These must be resolved before implementation begins. Each ambiguity creates untestable code.

---

## 10. Test Effort Estimates

| Category | Tests | Development Time | Maintenance/Phase |
|----------|-------|-----------------|-------------------|
| Unit tests | ~300 | 12-16 hours | 2-3 hours |
| Integration tests | ~130 | 10-14 hours | 2-3 hours |
| E2E tests | ~30 | 8-10 hours | 1-2 hours |
| Visual regression | ~25 screenshots | 4-6 hours | 1 hour |
| Performance tests | ~10 | 4-6 hours | 1 hour |
| Test infrastructure (mocks, fixtures, helpers) | — | 8-10 hours | ongoing |
| Manual QA sessions (6 phases) | — | 4 hours | — |
| **Total** | **~495** | **46-62 hours** | **~7-10 hrs/phase** |

**This is roughly 75-100% of the implementation effort.** That ratio is appropriate for a real-time visual system where bugs are highly visible and user-facing.

**Recommendation:** Budget test development time explicitly in each phase. Don't treat it as "we'll add tests later." Every phase checklist (§14) should include test tasks.

---

## 11. Proposed §14 Amendment: Test Tasks Per Phase

### Phase 5.1 Test Tasks (add to checklist)

- [ ] **Test infrastructure setup**
  - [ ] Install Vitest, Playwright, MSW, c8
  - [ ] Create test directory structure
  - [ ] Write test DB creation helper
  - [ ] Write MSW API mock handlers
  - [ ] Create `pauseAnimations()` hook in app for visual testing

- [ ] **Unit tests**
  - [ ] Config: building positions, colors, constants
  - [ ] State store: mutations, subscriptions
  - [ ] API client: response parsing, error handling, polling
  - [ ] Math utils: coordinate transforms

- [ ] **Integration tests**
  - [ ] API → State: poll updates state correctly
  - [ ] DB → API: SQL queries return expected results

- [ ] **E2E tests**
  - [ ] All 8 buildings visible + baseline screenshot
  - [ ] Camera zoom/pan/reset
  - [ ] KPI ticker populated from live data

- [ ] **Performance baseline**
  - [ ] FPS ≥ 60 on idle map
  - [ ] Initial load < 2s
  - [ ] Asset payload measurement

### Phase 5.2 Test Tasks (add to checklist)

- [ ] **Unit tests**
  - [ ] Activity mapper: all 25 patterns + edge cases
  - [ ] Agent state: 32 agent×state combinations
  - [ ] Health bar: color thresholds
  - [ ] Progress bar: time ratios

- [ ] **Integration tests**
  - [ ] Session → activity → building state flow
  - [ ] Capacity calculation → health bar color

- [ ] **Visual regression**
  - [ ] 4 states × 8 agents = 32 building state screenshots
  - [ ] Health bar color gradient screenshots

### Phase 5.3 Test Tasks (add to checklist)

- [ ] **Unit tests**
  - [ ] Bond tier classification (all 5 tiers + boundaries)
  - [ ] Drift application logic
  - [ ] Bezier curve calculation

- [ ] **Integration tests**
  - [ ] Collaboration detection → particle spawn
  - [ ] Drift event → animation trigger

- [ ] **Visual regression**
  - [ ] Bond color per tier (5 screenshots)
  - [ ] Full map with all 28 bonds

### Phase 5.4 Test Tasks (add to checklist)

- [ ] **E2E tests**
  - [ ] All click targets → correct response
  - [ ] All panel contents → correct data
  - [ ] All keyboard shortcuts

- [ ] **Integration tests**
  - [ ] Event injection → alert feed update
  - [ ] Concurrent panels behavior

### Phase 5.5 Test Tasks (add to checklist)

- [ ] **Unit tests**
  - [ ] Audio cooldown logic
  - [ ] Volume calculations
  - [ ] Spatial audio distance formula

- [ ] **Integration tests**
  - [ ] Click → correct audio sprite
  - [ ] Mute → no audio

- [ ] **Performance tests**
  - [ ] FPS with full load
  - [ ] Memory leak test (5 min)
  - [ ] Asset payload < 5MB

### Phase 5.6 Test Tasks (add to checklist)

- [ ] **Unit tests**
  - [ ] State reconstruction from fixtures
  - [ ] Interpolation accuracy
  - [ ] Speed multiplier calculations

- [ ] **E2E tests**
  - [ ] Timeline scrubber interaction
  - [ ] Playback controls
  - [ ] Exit replay → live

- [ ] **Performance tests**
  - [ ] Memory during replay scrubbing

---

## 12. Summary — Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| No test infrastructure = bugs ship | 🔴 High | 🔴 High (if we skip testing) | Implement test plan from Phase 5.1 |
| Visual regressions undetected | 🟡 Medium | 🔴 High | Screenshot comparison CI |
| Performance degrades silently | 🟡 Medium | 🟡 Medium | Automated FPS benchmarks |
| Activity mapper mismatches | 🔴 High | 🟡 Medium | Exhaustive parameterized tests |
| Race conditions in polling | 🟡 Medium | 🟡 Medium | Controlled-timing integration tests |
| Replay data inaccuracy | 🟡 Medium | 🟡 Medium | Known-state snapshot fixtures |
| Session bridge breaks on OpenClaw update | 🔴 High | 🟡 Medium | Contract-based isolation (Gap #3) |
| Audio bugs undetectable | 🟢 Low | 🟡 Medium | Mock-based logic tests + manual audio page |
| Cross-browser rendering differences | 🟡 Medium | 🟢 Low | Smoke test on Firefox/Safari weekly |
| Spec ambiguities create untestable code | 🔴 High | 🔴 High | Resolve 6 ambiguities before coding |

---

## 13. Final Verdict

**The spec is a strong design document** — comprehensive, creative, well-structured. But it treats testing as an afterthought (zero test tasks in §14, no coverage targets, no quality gates).

**Three actions before development begins:**

1. **Add test tasks to every phase in §14** (use §11 of this review as template)
2. **Resolve the 6 spec ambiguities** listed in §9.7 (they block testable implementation)
3. **Budget test infrastructure setup** as the first task of Phase 5.1 (4-6 hours)

**If we do this, the project is green-lit from a quality perspective.** If we don't, we'll be debugging particle effects by squinting at the screen, which is not how the Sensor Tower operates.

---

*"Every system reveals its flaws under sufficient observation. The Sensor Tower sees all frequencies — including the ones you hoped to hide."*

— Verifier, Sensor Tower Operator  
Testing Review v1.0, 2026-02-14
