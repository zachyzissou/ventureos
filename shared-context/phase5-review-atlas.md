# Phase 5 Review — Atlas (Infrastructure & Performance)

**Reviewer:** Atlas (Infrastructure Fabricator)  
**Date:** 2026-02-14  
**Spec:** `phase5-tactical-map-spec.md` v1.0  
**Overall Feasibility:** 🟢 GREEN — achievable with caveats on API server effort

---

## 1. Approved Items ✅

### 1.1 PixiJS Rendering Stack
**Verdict: Correct choice.** The comparison table in §11 is accurate. For a 2D tactical map with sprites, particles, and hit-testing, PixiJS is the optimal pick. Three.js is overkill for 2D. Raw Canvas2D would require reimplementing particle systems and interaction layers. PixiJS v7+ with WebGPU fallback to WebGL gives us the best performance headroom.

The rendering budget is generous for what we're actually drawing:
- 8 building sprites (64×64) + 1 Nexus (96×96) = 9 sprites
- 8 unit sprites (32×32) = 8 sprites  
- 28 bezier bond lines
- <500 particles
- HUD elements (DOM overlay, not canvas)

This is trivial for PixiJS. Even a mid-range integrated GPU handles thousands of sprites at 60 FPS. We're rendering maybe 50 interactive objects total. **60 FPS is not a risk.**

### 1.2 Performance Budget (§12)
**All targets are realistic and conservative:**

| Metric | Target | Atlas Assessment |
|--------|--------|-----------------|
| 60 FPS | ✅ Easily achievable | ~50 sprites + 500 particles is nothing for WebGL |
| <2s initial load | ✅ Achievable | 5MB asset budget is generous; sprite sheets + audio sprites will compress well |
| <100MB memory | ✅ No concern | PixiJS texture atlas + Howler audio pool will stay under 40MB |
| <5% CPU idle | ✅ Fine | Reduce idle frame rate to 15 FPS (no visual difference for glow pulses) |
| <100ms API latency | ✅ Local network | DB is on same machine, queries take <5ms |

### 1.3 Data Integration Design (§12)
The SQL queries are well-structured and correctly reference existing tables. The `activity-mapper.js` regex approach is pragmatic for MVP.

### 1.4 Phased Delivery
The 6-phase breakdown is solid. Each phase produces usable output. Dependency chain is correct.

### 1.5 Existing Infrastructure Reuse
I confirmed the following are already live and available:
- **`/api/rpg/stats`** — Returns all agent psionic attributes, ranks, XP ✅
- **`/api/rpg/khala-network`** — Returns all 28 bonds with affinity, seed, drift ✅
- **`/api/rpg/tactical-overlay/:agent`** — Per-agent tactical data ✅
- **`/api/rpg/escalations/:agent`** — Escalation history ✅
- **`/api/sessions`** — Returns OpenClaw session list ✅
- **`ventureos-rpg/components/`** — Already has `agent-sprites.js`, `khala-network-graph.js`, `tactical-overlay-panel.js` ✅

This is significant — roughly 40% of the data layer already exists.

---

## 2. Concerns ⚠️

### 2.1 CRITICAL: The Sessions Data Gap

**The spec assumes per-agent session data, but the current `/api/sessions` endpoint returns all sessions under `agent:main:*`.** 

Current output (53 sessions, all keyed as `agent:main:...`):
```
agent:main:main
agent:main:discord:channel:956203522624462918
agent:main:cron:0d214337-...
```

The tactical map needs sessions like:
```
agent:oracle:subagent:...  → Oracle is ACTIVE (researching)
agent:atlas:main           → Atlas is ACTIVE (deploying)
agent:sentinel:cron:...    → Sentinel is ACTIVE (scanning)
```

**Impact:** Without per-agent session data, we can't determine which agents are active or what they're doing. The entire activity detection system (§5, §12) depends on this.

**Root cause:** The multi-agent architecture routes most work through `agent:main`, with subagents spawned transiently. Individual agent sessions may not appear in `sessions_list` at the frequency needed.

**Mitigation options:**
1. **Bridge script** (Oracle's Gap 3) — Poll `openclaw sessions` every 10s, parse agent keys, write to SQLite. ~4 hours.
2. **Infer from missions table** — Use `missions` table `status='in_progress'` as activity source. But **missions table currently has 0 rows**, so this needs the mission-logging pipeline to exist first.
3. **Synthetic activity** — For MVP, generate activity state from session labels + last heartbeat time. Less accurate but ships faster.

**Recommendation:** Option 1 (bridge script) is the right approach. But acknowledge this is a **prerequisite** before Phase 5.2 can work properly. Phase 5.1 can proceed with static/mock data.

### 2.2 MEDIUM: Missions Table is Empty

```
missions: 0 rows
```

The spec's capacity calculation, progress bars, task timelines, and replay mode all depend on populated missions data. The `missions` table exists with the right schema but has no data flowing into it.

**Impact:** Phase 5.2 (progress bars), 5.4 (missions sidebar), and 5.6 (replay) are blocked until missions are being recorded.

**Recommendation:** Add a mission-recording hook to the agent framework. When an agent starts/completes a task, write to `missions`. This is a VentureOS core concern, not a tactical map concern — but it's a dependency.

### 2.3 MEDIUM: Dashboard Server Architecture

The existing dashboard runs as a single `server.js` (94KB monolith) on port 7001. It already serves:
- Static HTML (198KB single-page dashboard)
- 30+ API endpoints
- RPG API routes (via `ventureos-rpg/api/rpg-http.js`)
- Conversation API (via `conversation-http.js`)

**Concern:** Adding PixiJS tactical map + WebSocket + replay endpoints to this monolith will make it harder to maintain and deploy independently.

**My recommendation differs from the spec's:** Don't create a separate tactical map server. Instead:
- Serve tactical map as a new tab/route in the existing dashboard
- Add new API endpoints to the existing server (it already has the pattern)
- WebSocket can be added to the existing `http.createServer` instance
- This avoids CORS issues, port management, and deployment complexity

The server already handles RPG data + session data + component serving. Adding `/map` as a route and 5-6 new API endpoints is cleaner than running a second service.

### 2.4 LOW: WebSocket vs Polling

The spec proposes a hybrid: polling for status (10s) + WebSocket for events. This is correct architecturally, but:

**Polling is sufficient for MVP.** With 10s intervals and <5ms query times on a local SQLite DB, there's no meaningful latency improvement from WebSocket. The data sources themselves (session state, missions, drift events) don't change more frequently than every few seconds.

**Defer WebSocket to Phase 5.4 or 5.5.** It adds complexity (connection management, reconnection logic, heartbeat) for marginal benefit when your data source is a polled SQLite DB, not a push-based event stream.

If we do add WebSocket later, use it for:
- Drift events (want instant bond animation triggers)
- Alert/escalation events (want instant notification)
- NOT for routine status polling (polling is fine)

### 2.5 LOW: Isometric 2.5D Suggestion

Oracle recommends isometric projection (+4 hours). From an infrastructure perspective: **it's a rendering concern, not an infra concern.** PixiJS handles isometric fine. No additional infrastructure needed. The performance impact is negligible (just coordinate transforms). Let the design team decide.

---

## 3. Recommendations

### 3.1 API Server Strategy (Gap #2 Answer)

**Don't build a separate API server. Extend the existing dashboard server.**

Here's the minimal API surface needed beyond what already exists:

| Endpoint | Exists? | Effort |
|----------|---------|--------|
| `/api/rpg/stats` | ✅ Yes | 0h |
| `/api/rpg/khala-network` | ✅ Yes | 0h |
| `/api/rpg/tactical-overlay/:agent` | ✅ Yes | 0h |
| `/api/sessions` | ✅ Yes (but needs filtering) | 1h — add `?agent=` filter param |
| `/api/agents/status` (composite) | ❌ New | 3h — combine stats + sessions + missions into single response |
| `/api/bonds` (alias) | ⚠️ Exists as `/api/rpg/khala-network` | 0.5h — alias or use existing |
| `/api/events` (WebSocket) | ❌ New | 4h — deferred to Phase 5.4 |
| `/api/sessions/active` | ❌ New | 2h — filter active sessions with activity mapping |
| `/api/replay/:timestamp` | ❌ New | 6h — state reconstruction from historical data |
| `/api/replay/events` | ❌ New | 2h — time-range query on drift + missions + escalations |
| Static file serving for `/map/*` | ❌ New | 1h — add route to serve tactical map assets |

**Total new API work: ~14 hours** (but only ~7h needed for Phase 5.1-5.3; replay endpoints deferred to 5.6).

The spec's estimate of "API server = ???" is answered: **~7 hours for Phase 5.1-5.3 endpoints, ~14 hours total including replay.**

### 3.2 Data Source Polling Strategy

| Data Source | Proposed Interval | Atlas Recommendation | Rationale |
|-------------|-------------------|---------------------|-----------|
| Agent status (stats + sessions) | 10s | **15s** | Stats change daily; sessions change every few minutes. 10s is aggressive for no benefit. |
| Khala bonds | 30s | **60s** | Bonds drift on interaction events, not continuously. 60s is plenty. |
| Events feed | Real-time (WS) | **15s poll for MVP** | WebSocket adds complexity. Poll drift_history + missions + escalations with `created_at > last_check`. |
| KPI ticker | 30s | **60s** | KPIs are daily snapshots. Polling every 30s for daily data is wasteful. |

**Net effect:** Reduces API calls from ~10/min to ~5/min with no perceptible difference. The map animates at 60 FPS regardless — data freshness and frame rate are independent.

### 3.3 Asset Pipeline

The spec correctly identifies this as a gap. For the sprite pipeline:

1. **Phase 5.1 MVP:** Use colored geometric shapes (hexagons for buildings, circles for units) with PixiJS Graphics. Zero asset creation needed. This lets us validate layout, interaction, and data flow immediately.
2. **Phase 5.2+:** Swap in proper sprites. AI-generated → pixel cleanup is the right approach.
3. **Audio:** Defer entirely to Phase 5.5. The map works fine silent.

This de-risks the art pipeline from the critical path entirely.

### 3.4 Deployment Integration

**Serve as a new tab in the existing dashboard.** The dashboard at `:7001` already has a tab navigation structure. Integration plan:

1. Add `/map` route to `server.js` — serves tactical map HTML/JS/CSS
2. Add `[🗺️ Tactical Map]` tab to existing dashboard navigation
3. Tactical map assets go in `~/clawd/openclaw-dashboard/tactical-map/` or `~/clawd/ventureos-rpg/components/tactical-map/`
4. New API endpoints added to the existing server's request handler
5. PixiJS + Howler loaded via CDN `<script>` tags or bundled with esbuild

**No new ports. No new processes. No CORS. No deployment changes.**

### 3.5 SQLite Concurrency

The dashboard server reads `ventureos-rpg.db` via `rpg-service.js` (using `sqlite-cli.js` which shells out to `sqlite3`). The tactical map will increase read frequency.

**No concern.** SQLite handles concurrent reads fine. The DB is tiny (28 bonds, 8 stat rows, 68 drift events). Even shelling out to `sqlite3` CLI for each query (current approach) is fast enough at 4 queries/minute.

**Future optimization (not needed now):** Switch from `sqlite-cli.js` (shells out to `sqlite3` binary) to `better-sqlite3` (already in `ventureos/package.json` dependencies) for in-process queries. This eliminates ~50ms of process spawn overhead per query.

---

## 4. Effort Adjustments

### Spec Estimates vs Atlas Assessment

| Phase | Spec Estimate | Atlas Estimate | Delta | Notes |
|-------|--------------|----------------|-------|-------|
| 5.1 Foundation | 8-12h | **10-14h** | +2h | Add API endpoint work (composite `/api/agents/status`), session bridge script |
| 5.2 Activity | 10-14h | **10-14h** | 0 | Accurate, assuming geometric shapes for MVP sprites |
| 5.3 Khala Network | 6-8h | **5-7h** | -1h | Bond data already served by existing API; less new code needed |
| 5.4 Interactivity | 8-10h | **8-10h** | 0 | Accurate |
| 5.5 Polish & Sound | 6-8h | **8-10h** | +2h | Audio asset creation/sourcing consistently underestimated |
| 5.6 Replay | 10-12h | **12-16h** | +4h | State reconstruction is tricky; replay API endpoints are non-trivial; missions table needs data first |
| **Total** | **48-64h** | **53-71h** | +5-7h | Mostly from API server work and replay complexity |

### Additional Work Not in Spec

| Task | Effort | Phase | Notes |
|------|--------|-------|-------|
| Session bridge script (Gap 3) | 4h | Pre-5.2 | Required for activity detection |
| Mission recording pipeline | 4h | Pre-5.2 | Required for progress bars and replay |
| Dashboard integration (tab + routing) | 2h | 5.1 | Wiring into existing dashboard |
| **Subtotal** | **10h** | — | These are prerequisites, not map work |

**Revised total including prerequisites: 63-81 hours** (vs spec's 48-64h).

The gap is mostly in infrastructure plumbing that the spec assumed existed. The rendering/interaction work estimates are accurate.

---

## 5. Risk Summary

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| No per-agent session data in API | 🔴 High | Certain | Build session bridge script before Phase 5.2 |
| Missions table empty | 🟡 Medium | Certain | Build mission recording pipeline |
| Sprite creation delays | 🟡 Medium | Likely | Use geometric shapes for MVP |
| Dashboard monolith growing | 🟢 Low | Gradual | Acceptable for now; refactor later if needed |
| SQLite contention | 🟢 Low | Unlikely | Tiny DB, read-only from map |
| WebSocket complexity | 🟢 Low | Avoidable | Defer to Phase 5.4+; polling works fine |

---

## 6. Quick Wins

1. **Existing RPG API covers ~60% of data needs.** `/api/rpg/stats` + `/api/rpg/khala-network` already serve most of what the tactical map needs. Don't rebuild; extend.
2. **Existing components (`agent-sprites.js`, `khala-network-graph.js`) can be studied for patterns** — they show how the current dashboard integrates with RPG data.
3. **The hardest rendering problem (bezier bonds between buildings) is well-specified** — positions, colors, tiers, animations are all defined. Implementation is straightforward.
4. **Geometric MVP for Phase 5.1** eliminates the art asset blocker entirely.

---

## 7. Architecture Decision Record

**Decision: Extend existing dashboard, don't create separate service.**

- ✅ Single deployment unit
- ✅ No CORS configuration
- ✅ Shared DB connection pattern
- ✅ Existing session/RPG APIs reusable
- ✅ Tab integration is natural
- ❌ Monolith grows larger (acceptable trade-off)
- ❌ Can't scale map independently (not needed at this scale)

**Decision: Polling over WebSocket for MVP.**

- ✅ Simpler implementation
- ✅ No connection management
- ✅ Works with existing HTTP server
- ✅ Data sources are polled anyway (SQLite, not event-driven)
- ❌ 10-15s data staleness (imperceptible given animation smoothing)

**Decision: Geometric shapes for Phase 5.1 sprites.**

- ✅ Zero art pipeline dependency
- ✅ Validates layout, interaction, data flow immediately
- ✅ Swap to real sprites later without code changes
- ❌ Less visually impressive initially

---

*Infrastructure can support the vision. The two blockers are (1) session bridge for per-agent activity detection and (2) missions pipeline for progress tracking. Everything else is straightforward rendering work on a solid data foundation.*

— Atlas, Infrastructure Fabricator  
2026-02-14
