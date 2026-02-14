# Phase 5: StarCraft Tactical Command Center — Master Plan Update

**Synthesized:** 2026-02-14  
**Source:** 5 team reviews (Atlas, Sentinel, Verifier, Archivist, Synth) + original spec  
**Author:** Oracle (synthesis by Nexus)  
**Status:** 📋 PLAN UPDATED — Decisions Required Before Implementation

---

## 1. Phase 5 Overview

**Vision:** Transform the VentureOS monitoring experience into a living StarCraft-style tactical command center. Each of the 8 agents is represented as a Protoss building in a circular layout, with real-time activity animations, Khala Network bond visualizations, interactive panels, sound design, and historical replay.

**Original Estimate:** 48–64 hours (Oracle spec)  
**Revised Estimate:** 90–155 hours (full fidelity) / 55–80 hours (MVP)  
**Dependency:** Phase 4 conversation system (provides interaction data)

---

## 2. Team Review Summary

All 5 teams reviewed the spec. No team rated it RED; 4 of 5 rated YELLOW with specific concerns to address.

| Team | Rating | Key Finding | Effort Impact |
|------|--------|-------------|---------------|
| **Atlas** (Infrastructure) | 🟢 GREEN | Achievable. 40% of data layer exists. Two blockers: session bridge + empty missions table. Extend existing dashboard, don't create separate server. | +15–17h over spec (63–81h total) |
| **Sentinel** (Security) | 🟡 YELLOW | Spec assumes trusted environment throughout. 3 P0 security issues must be fixed before any deployment. No auth, session exposure, XSS vectors. | +20–30h security hardening across all phases |
| **Verifier** (Testing) | 🟡 YELLOW | Zero test tasks in spec. Testing strategy absent. ~495 tests needed. Quality gates required per phase. 6 spec ambiguities block testable code. | +46–62h testing effort |
| **Archivist** (Documentation) | 🟡 YELLOW | No user onboarding. Canvas accessibility gaps (WCAG). Missing error/empty states. Licensing concerns for SC2-style assets. Isometric decision blocks everything. | +10–16h docs/a11y/onboarding |
| **Synth** (Implementation) | 🟡 YELLOW | Spec estimates optimistic. Full fidelity = 90–140h. Replay is largest unknown (20–40h alone). Need Phase 5.0 for data contracts. Procedural sprites for MVP. | Reframes total: 90–140h full / 40–65h MVP |

### Cross-Team Consensus

All 5 teams independently recommended:
1. **Integrate into existing `openclaw-dashboard`** — don't create a separate server/process
2. **Procedural/geometric sprites for MVP** — decouple art pipeline from critical path
3. **Polling over WebSocket for v1** — simpler, sufficient for 10–15s update intervals
4. **Replay as v2/optional** — largest unknown, depends on data quality
5. **Phase 5.0 prerequisite** — data contracts and API plumbing before rendering

---

## 3. Critical Decisions Required

These **must be resolved before implementation begins**. Each affects architecture, assets, and timelines.

### Decision 1: Isometric 2.5D vs Flat 2D

| | Flat 2D | Isometric 2.5D |
|---|---------|-----------------|
| **Effort** | Baseline | +4h Phase 5.1, cascading to all sprites |
| **StarCraft feel** | Functional | Authentic |
| **Sprite complexity** | Simple top-down | Isometric perspective required |
| **Hit-testing** | Standard rectangles | Coordinate transforms needed |
| **Accessibility** | Simpler spatial reasoning | More complex |
| **Atlas** | No infra concern either way | No infra concern either way |
| **Synth** | Recommended for v1 | "Defer — doing iso right impacts asset style, hit areas, camera, z-sorting" |
| **Archivist** | — | "Resolve BEFORE Phase 5.1 — affects every sprite and layout decision" |

> **Recommendation:** Start with **flat 2D** for MVP. Revisit isometric as a Phase 5+ upgrade once the base map is stable and sprites exist.
>
> **Decision owner:** Oracle + Synth  
> **Deadline:** Before Phase 5.0 starts

### Decision 2: MVP Scope vs Full Vision

| | MVP (Ship Fast) | Full Spec Fidelity |
|---|-----------------|-------------------|
| **Effort** | 55–80h | 90–155h |
| **Timeline** | 2–3 weeks | 5–8 weeks |
| **Sprites** | Procedural (shapes + glow) | Custom pixel art (32 building states, 24 unit anims) |
| **Replay** | Excluded (v2) | Included (20–40h) |
| **Audio** | Deferred or minimal | Full atmosphere + voice lines |
| **Panels/Modals** | Minimal (tooltip + 1 panel) | Full UI framework (6 click targets, 5 hover targets) |
| **WebSocket** | Polling only | Hybrid polling + WS |
| **Testing** | Core unit + smoke E2E | Full 495-test suite |

> **Recommendation:** Ship **MVP first** (Phases 5.0–5.3 + minimal 5.4), then iterate. Gets a "living map" visible in ~2–3 weeks. Full polish and replay follow.
>
> **Decision owner:** Zach (product priority)  
> **Deadline:** Before Phase 5.0 starts

### Decision 3: Security Architecture

Sentinel identified **3 P0 issues** that must be designed (not just patched) before deployment:

| P0 | Issue | Minimum Requirement |
|----|-------|-------------------|
| **P0-1** | No API authentication | Session-based auth or API key on all endpoints |
| **P0-2** | Isolated session exposure | Filter by visibility; aggregate, don't enumerate private sessions |
| **P0-3** | XSS via task descriptions | DOMPurify for all DOM-rendered text; CSP headers |

> **Recommendation:** Add **§11.5 Security Architecture** to the spec before any code. Design auth model in Phase 5.0 alongside data contracts.
>
> **Decision owner:** Sentinel + Atlas  
> **Deadline:** Phase 5.0 deliverable

---

## 4. Revised Implementation Plan

### Phase 5.0: Data Contracts & Prerequisites (NEW)
**Duration:** 8–14 hours  
**Goal:** Establish data foundations. Everything after this builds on stable APIs and schemas.

| Task | Owner | Effort | Notes |
|------|-------|--------|-------|
| Define `MapState` JSON contract (agents, bonds, events, missions) | Oracle + Synth | 2–3h | Single source of truth for all API responses |
| Session bridge script (poll `openclaw sessions` → SQLite) | Atlas | 4h | **Blocker** for activity detection (Phase 5.2+) |
| Mission recording pipeline (write to `missions` table) | Atlas | 4h | **Blocker** for progress bars and replay |
| Add missing API endpoints to dashboard server | Atlas | 3–4h | `/api/agents/status` composite, `/api/sessions/active` with `?agent=` filter |
| Security architecture design (auth model, CORS, CSP) | Sentinel | 2–3h | Document in §11.5; implement auth in Phase 5.1 |
| Resolve 6 spec ambiguities (see Verifier §9.7) | Oracle | 1–2h | Unblock testable implementation |

**Quality Gate:** MapState contract documented. Session bridge running. At least 1 mission recorded to `missions` table. Security architecture approved.

### Phase 5.1: Foundation
**Duration:** 14–22 hours (includes test infra + auth + a11y skeleton)  
**Goal:** Render interactive map with buildings, terrain, basic HUD, and security layer.

| Task | Effort | Notes |
|------|--------|-------|
| Project setup (directory, package.json, route in dashboard) | 2h | Serve as `/map` tab in existing dashboard |
| Test infrastructure (Vitest, Playwright, MSW, fixtures) | 4–6h | Per Verifier: must be first task |
| Terrain renderer (dark stone, hex grid, crystal clusters, pylon glow) | 2–3h | |
| Building sprites (procedural shapes + glow for MVP) | 2–3h | Swap to real sprites later without code changes |
| Nexus (96×96, core pulse) | 1h | |
| Basic HUD (tab nav, KPI ticker from live DB) | 2h | |
| API client + 15s polling loop | 2h | Atlas recommends 15s over 10s |
| Camera (zoom 0.5×–2.0×, pan, Home reset) | 2h | |
| Auth middleware on all API endpoints | 2–3h | P0-1 fix |
| CORS whitelist + CSP headers | 1h | P1-4, P1-5 fix |
| Hidden ARIA tree skeleton | 1–2h | Archivist: accessibility from day one |
| `prefers-reduced-motion` check | 0.5h | |
| config.js as living spec (all constants with JSDoc) | 1h | |
| Unit + integration + E2E tests for foundation | 3–4h | Per Verifier quality gates |

**Quality Gate (10 checks):**
1. All 8 buildings render at correct positions (screenshot baseline)
2. KPI ticker shows live data from DB
3. Camera zoom/pan/reset works
4. 15s polling loop fires correctly
5. Auth required on all API endpoints (401 without token)
6. CSP header present in responses
7. ARIA tree accessible via screen reader
8. FPS ≥ 60 on idle map
9. Initial load < 2s
10. Unit test coverage ≥ 75%

### Phase 5.2: Activity & Animation
**Duration:** 16–26 hours  
**Goal:** Buildings and units animate based on real agent activity.

| Task | Effort | Notes |
|------|--------|-------|
| `activity-mapper.js` (session label → activity type, all 8 agents) | 3–4h | Highest-coverage-value unit test target |
| Server-side activity classification (Sentinel P2-3) | 1h | Move regex to API, send classified activity to client |
| Building state system (IDLE/ACTIVE/OVERLOADED/ERROR) | 3–4h | 32 agent×state combinations |
| Building animations (per-state, crossfade transitions) | 3–4h | Procedural for MVP |
| Unit sprites + positioning (32×32 or simple dots) | 2–3h | Synth: "orbiting dot" sufficient for MVP |
| Particle system (ambient, activity-specific) | 3–4h | Cap at 500 simultaneous |
| Health bars (capacity calculation, color gradient) | 1–2h | |
| Progress bars (over units, time ratio coloring) | 1–2h | Depends on missions table having data |
| Input sanitization on all DB-sourced text (DOMPurify) | 1–2h | P0-3 fix |
| Session label length cap (200 chars before regex) | 0.5h | P2-3 fix |
| Tests: activity mapper (80+ tests), 32 state combos, visual regression | 4–6h | |

**Quality Gate:**
1. All 25 activity patterns match correctly
2. All 32 agent×state combinations render
3. State transitions animate smoothly (0.5s crossfade)
4. Health bar colors correct for all thresholds
5. All DB-sourced text sanitized (no raw innerHTML)
6. FPS ≥ 55 with all agents active
7. Unit test coverage ≥ 80%

### Phase 5.3: Khala Network
**Duration:** 8–14 hours  
**Goal:** Render bond lines between buildings with affinity-based visuals.

| Task | Effort | Notes |
|------|--------|-------|
| Bond line rendering (28 bezier curves, affinity-based width) | 2–3h | Bond data already served by existing API |
| 5-tier color system (red → orange → blue → bright blue → gold) | 1–2h | Add non-color indicators per Archivist (dash/dot patterns) |
| Bond animations (pulse, crackling, glow per tier) | 2–3h | Glow without killing FPS is the challenge |
| Collaboration particles (detect shared sessions, data packets along bezier) | 2–3h | |
| Drift event animations (positive/negative/tier-change) | 1–2h | |
| Bond hover tooltip + click modal (basic) | 1–2h | Synth: hit-testing curved lines is "surprisingly fiddly" |
| Tests: tier boundaries, all 28 bonds render, visual regression | 2–3h | |

**Quality Gate:**
1. All 28 bonds render
2. All 5 color tiers visually distinct (including non-color indicators)
3. Tier boundary classification exact (0.40, 0.60, 0.75, 0.85)
4. Collaboration particles appear during shared sessions
5. Drift animations trigger on events
6. FPS ≥ 55 with all bonds + collaborations

### Phase 5.4: Interactivity
**Duration:** 14–22 hours  
**Goal:** Full click/hover/keyboard interaction with detail panels.

| Task | Effort | Notes |
|------|--------|-------|
| Click handlers (building, unit, bond, nexus, terrain) | 2–3h | PixiJS hit-testing |
| Building detail panel (right slide-in, 400px) | 3–4h | Agent status, tasks, KPIs, bonds |
| Bond detail modal (affinity, drift chart, history) | 2–3h | |
| Nexus overlay (all agents, system health, strongest/weakest bonds) | 2–3h | |
| Alert feed panel (bottom-left, last 10 events, color-coded) | 2–3h | |
| Missions sidebar (right, collapsible, progress bars) | 2h | |
| Keyboard shortcuts (1–8, Tab, Space, E, R, Esc, F) | 1–2h | Only capture when canvas focused (P2-2) |
| Tooltip system (hover, 200ms delay, smart positioning) | 1–2h | |
| Privacy filtering: no message content on map (P1-3) | 1h | Show "Agent is active on N sessions" only |
| Focus trap for modals + visible focus indicators | 1h | Archivist accessibility requirement |
| Tests: all click targets, panel content, keyboard shortcuts | 3–4h | |

**Quality Gate:**
1. Every click target produces correct response
2. Panel content matches DB data
3. All keyboard shortcuts work (only when canvas focused)
4. No message content exposed on map surface
5. Focus trapped in modals; Esc returns focus correctly
6. Tooltip positioning avoids viewport edges

### Phase 5.5: Polish & Sound
**Duration:** 10–16 hours  
**Goal:** Audio atmosphere, visual polish, smooth transitions.

| Task | Effort | Notes |
|------|--------|-------|
| Howler.js integration + audio sprite packing | 2h | Plan around autoplay restrictions |
| 8 unit voice lines (TTS generated) | 2–3h | Original text, not SC2 quotes. Verify no IP issues. |
| Event sounds (task complete, error, collaboration, drift) | 1–2h | Original sound design, not SC2 assets |
| Volume controls (master + per-category, localStorage persistence) | 1h | |
| Ambient audio (background music, building hum, crystal) | 1–2h | Distance-based volume |
| Visual polish (panel transitions, modal blur, particle fade-in/out) | 2–3h | |
| Performance optimization (particle pooling, off-screen culling, texture atlas) | 2–3h | |
| Asset directory read-only permissions | 0.5h | P2-4 |
| Guided tour / onboarding (first-time experience) | 4–6h | Archivist: "single biggest gap in the spec" |
| Color legend widget + `?` help overlay | 2h | |
| Tests: audio logic, performance benchmarks, asset payload | 2–3h | |

**Quality Gate:**
1. All 8 voice lines play on click (30s cooldown works)
2. Volume persists across reload
3. Mute shortcut works
4. Panel transitions smooth (300ms)
5. No particle pop-in (fade-in/out)
6. FPS ≥ 55 with full audio + effects
7. Asset payload < 5MB
8. Memory < 100MB after 5min use
9. Onboarding tour completes without errors
10. ASSETS-LICENSING.md documents all asset sources

### Phase 5.6: Replay Mode (OPTIONAL v2)
**Duration:** 18–36 hours  
**Goal:** Historical playback with timeline scrubber.

| Task | Effort | Notes |
|------|--------|-------|
| Replay API endpoints (`/api/replay/:timestamp`, `/api/replay/events`) | 6–8h | State reconstruction is non-trivial |
| Timeline scrubber UI (full-width, draggable, event markers) | 3–4h | |
| Playback engine (state reconstruction, interpolation, speed control) | 4–6h | Largest unknown — depends on data quality |
| Visual replay (historical buildings, bonds, units, KPIs, watermark) | 3–4h | |
| Timelapse mode (auto-skip idle >30min, highlight events) | 2–3h | |
| Auth on replay endpoints + audit logging (P1-2) | 2–3h | Log who accessed what historical data |
| Data scoping: apply session visibility filters to historical data | 1–2h | |
| Parameterized queries (no SQL injection) + rate limiting | 1–2h | P2-5 |
| Tests: state reconstruction fixtures, interpolation, memory during scrubbing | 4–6h | |

**Quality Gate:**
1. State reconstruction matches 5+ known snapshot fixtures
2. Timeline scrubber responsive to drag
3. All playback speeds work (1×, 2×, 5×, 10×)
4. "REPLAY" watermark visible
5. Exit replay → live data resumes within 10s
6. Auth required on all replay endpoints
7. Audit log records all replay access
8. No memory leak during 5min replay scrubbing

---

## 5. Effort Estimates — Consolidated

### By Phase

| Phase | Spec Estimate | Revised (MVP) | Revised (Full) | Key Drivers |
|-------|--------------|---------------|----------------|-------------|
| **5.0** (NEW) | — | 8–14h | 8–14h | Session bridge, missions pipeline, API plumbing, security design |
| **5.1** Foundation | 8–12h | 14–22h | 14–22h | Test infra (+4–6h), auth (+3h), a11y (+2h) |
| **5.2** Activity | 10–14h | 16–26h | 16–26h | 32 state combos, sanitization, testing |
| **5.3** Khala | 6–8h | 8–14h | 8–14h | Hit-testing curves, non-color indicators |
| **5.4** Interactivity | 8–10h | 14–22h | 14–22h | Panels = small UI framework. Privacy filtering. |
| **5.5** Polish & Sound | 6–8h | 10–16h | 10–16h | Onboarding tour (+4–6h), audio sourcing |
| **5.6** Replay | 10–12h | — (deferred) | 18–36h | State reconstruction, data quality, security |
| **Total** | **48–64h** | **70–114h** | **88–150h** | |

### By Category (Where the Time Goes)

| Category | MVP Hours | Full Hours | Notes |
|----------|-----------|------------|-------|
| Core rendering + logic | 35–50h | 45–65h | Building, bonds, animations, particles |
| API + data plumbing | 10–14h | 16–22h | Phase 5.0 + replay endpoints |
| Security hardening | 8–12h | 14–20h | Auth, sanitization, CORS, CSP, audit |
| Testing | 12–20h | 30–45h | 495 tests at full suite |
| Documentation + onboarding | 5–8h | 8–14h | Tour, help overlay, README, ARCHITECTURE |
| Art/audio assets | 0–4h | 8–20h | Procedural MVP vs custom pixel art |
| **Total** | **70–114h** | **121–186h** | |

> **Note:** The upper bound of the full estimate (186h) accounts for worst-case art pipeline delays and replay data quality issues. Realistic center-point: **~100h MVP, ~140h full**.

---

## 6. Prerequisites — Must Complete Before Phase 5.1

| # | Prerequisite | Owner | Effort | Status | Blocks |
|---|-------------|-------|--------|--------|--------|
| 1 | **Session bridge script** — Poll `openclaw sessions` every 10–15s, parse agent keys, write to SQLite | Atlas | 4h | ❌ Not started | Phase 5.2 (activity detection) |
| 2 | **Mission recording pipeline** — Hook agent framework to write to `missions` table on task start/complete | Atlas | 4h | ❌ Not started | Phase 5.2 (progress bars), 5.4 (missions sidebar), 5.6 (replay) |
| 3 | **Security architecture document** — Auth model, CORS policy, CSP headers, data classification | Sentinel | 2–3h | ❌ Not started | Phase 5.1 (auth implementation) |
| 4 | **MapState JSON contract** — Single canonical shape for all tactical map data | Oracle + Synth | 2–3h | ❌ Not started | Phase 5.1 (API client) |
| 5 | **Resolve 6 spec ambiguities** — Clarify building state transitions, task duration metadata, event priority, hit area z-order, idle skip animation, per-agent max sessions | Oracle | 1–2h | ❌ Not started | All phases (testability) |
| 6 | **Isometric vs flat decision** — Documented ADR with rationale | Oracle + Synth | 0.5h | ❌ Not started | Phase 5.1 (every sprite and coordinate) |
| 7 | **MVP scope decision** — Confirm which phases ship first | Zach | 0.5h | ❌ Not started | Timeline and resource allocation |
| 8 | **ASSETS-LICENSING.md** — Policy: no copyrighted Blizzard assets, document all sources | Archivist | 1h | ❌ Not started | Phase 5.5 (audio/sprites) |

---

## 7. Quality Gates — Testing Checkpoints

Per Verifier's comprehensive testing plan, each phase has mandatory quality gates. **No phase ships without passing its gate.**

### Test Infrastructure (Phase 5.1 — First Task)

```
Framework:    Vitest (unit/integration) + Playwright (E2E)
Mocking:      MSW (API mocks) + custom PixiJS/Howler mocks
Visual:       Playwright screenshot comparison (1% pixel tolerance)
Performance:  Playwright + Performance Observer API
Coverage:     c8 (Vitest built-in)
CI:           Coverage below phase target blocks merge
```

### Coverage Targets

| Layer | Target | Rationale |
|-------|--------|-----------|
| State management (`state/*`) | 95% | Core logic; bugs cascade everywhere |
| Data layer (`data/*`) | 90% | API parsing, activity mapping — high bug risk |
| Utils (`utils/*`) | 95% | Pure functions, easy to test, high reuse |
| Interaction (`interaction/*`) | 80% | Event handlers, some browser-dependent |
| Renderer (`renderer/*`) | 60% | Setup/config testable; draw calls not |
| Audio (`audio/*`) | 70% | Config and logic testable; playback mocked |

### Test Counts (Full Suite)

| Category | Count | Hours to Write |
|----------|-------|---------------|
| Unit tests | ~300–350 | 12–16h |
| Integration tests | ~120–155 | 10–14h |
| E2E tests | ~25–35 | 8–10h |
| Visual regression screenshots | ~25–30 | 4–6h |
| Performance tests | ~10 | 4–6h |
| Manual QA sessions (6 phases) | 6 sessions | ~4h total |
| **Total** | **~495** | **46–62h** |

### Manual QA Required Per Phase

| Phase Gate | Focus | Duration | Participants |
|-----------|-------|----------|-------------|
| Post-5.1 | Layout, camera feel, KPI ticker | 30 min | Verifier + 1 teammate |
| Post-5.2 | Animation feel, state transitions, particles | 45 min | Verifier + Oracle |
| Post-5.3 | Bond curves, color tiers, collaboration | 30 min | Verifier + Archivist |
| Post-5.4 | Click targets, panels, keyboard shortcuts | 45 min | Verifier + Echo |
| Post-5.5 | Audio atmosphere, polish, onboarding | 30 min | Full team demo |
| Post-5.6 | Replay accuracy, timeline scrubber | 45 min | Verifier + Oracle |

---

## 8. Security Requirements

Per Sentinel's review. Organized by implementation phase.

### Phase 5.0 (Design)

| Requirement | Priority | Action |
|-------------|----------|--------|
| Authentication model | P0 | Design session-based auth or API key for all endpoints |
| Data classification layer | P1 | Define Public / Internal / Confidential data tiers |
| CORS policy | P1 | Whitelist tactical map origin only; no wildcard |
| Privacy-preserving activity display | P0 | "Oracle — Active (1 task)" not "Oracle — Researching: Phase 5 Spec" |

### Phase 5.1 (Implementation)

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| API authentication on all endpoints | P0 | 2–3h | Session token or API key required; 401 on failure |
| Isolated session filtering | P0 | 2h | Never surface `kind=isolated` session details; aggregate only |
| CSP headers | P1 | 1h | `script-src 'self'; object-src 'none'; frame-ancestors 'none'` |
| CORS whitelist | P1 | 0.5h | Explicit origin, no `*`, credentials mode if cookies |
| localStorage whitelist | P2 | 0.5h | Only 4 UI preference keys; no sensitive data |
| HTTPS only | P1 | 0.5h | `Strict-Transport-Security` header |

### Phase 5.2

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| XSS sanitization (DOMPurify) | P0 | 2h | All DB-sourced text sanitized before DOM rendering |
| Server-side activity classification | P2 | 1h | Client receives `activity: "researching"`, not raw label + regex |
| Input length cap | P2 | 0.5h | Session labels capped at 200 chars before processing |

### Phase 5.4

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| No message content on map | P1 | 1h | Show session count, not message text |
| Keyboard shortcuts canvas-scoped | P2 | 0.5h | Don't capture global events; preserve Tab for accessibility |
| WebSocket auth (if added) | P1 | 3h | Auth token in upgrade handshake; origin whitelist; connection limit 5/user |

### Phase 5.5

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| Asset directory read-only | P2 | 0.5h | `r-xr-xr-x` permissions on asset directory |
| Audio user gesture requirement | P2 | 0h | Already handled by click-to-play design |

### Phase 5.6

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| Replay endpoint auth | P1 | 1h | Same auth as other endpoints |
| Replay audit logging | P1 | 2h | Log who, when, what timestamp range |
| Parameterized SQL queries | P2 | 1h | `?` placeholders, never string interpolation |
| Replay rate limiting | P2 | 1h | 10 req/min per user |
| Historical data scoping | P1 | 1h | Apply same visibility filters as live data |

### Feature Flags (Sentinel R7)

Gate sensitive features behind toggles:
- `REPLAY_ENABLED` — Replay mode (high data exposure)
- `MESSAGE_PREVIEW` — Message content in click panels (default: off)
- `WEBSOCKET_EVENTS` — Real-time WebSocket stream
- `DETAILED_KPIS` — Specific KPI values vs tier indicators

---

## 9. Documentation Requirements

Per Archivist's review. Documentation is a deliverable, not an afterthought.

### Before Implementation

| Document | Owner | Purpose |
|----------|-------|---------|
| `ASSETS-LICENSING.md` | Archivist | No copyrighted Blizzard assets; all sources documented |
| `docs/decisions/001-flat-vs-isometric.md` | Oracle + Synth | ADR: isometric decision with pros/cons |
| `docs/decisions/002-polling-vs-websocket.md` | Atlas | ADR: why polling for v1 |
| `docs/decisions/003-pixijs-choice.md` | Synth | ADR: why PixiJS over alternatives |
| API response schemas (MapState contract) | Oracle + Synth | OpenAPI-style request/response shapes |

### During Phase 5.1

| Document | Owner | Purpose |
|----------|-------|---------|
| `tactical-map/README.md` | Synth | Setup, build, deploy, contributing |
| `config.js` with JSDoc | Synth | Living spec for all visual constants |
| `§11.5 Security Architecture` | Sentinel | Auth, CORS, CSP, data classification |

### During Phase 5.4+

| Document | Owner | Purpose |
|----------|-------|---------|
| `docs/ARCHITECTURE.md` | Synth + Archivist | High-level architecture for new contributors |
| `docs/DATA-FLOW.md` | Atlas | DB → API → State → Renderer pipeline |
| `docs/KEYBOARD-SHORTCUTS.md` | Archivist | User-facing reference |
| `docs/ACCESSIBILITY.md` | Archivist | A11y implementation details |
| `CHANGELOG.md` | All | Per-phase changes |

### User-Facing (Phase 5.5)

| Feature | Owner | Effort | Purpose |
|---------|-------|--------|---------|
| **Guided tour** (first-visit, ~45s, skippable) | Synth + Oracle | 4–6h | Users don't know what anything means without it |
| **Color legend widget** (toggle, bottom-right) | Synth | 1h | 5-tier bond color system needs explanation |
| **Help overlay** (`?` key) | Synth | 1h | Keyboard shortcuts + interaction summary |
| **Empty state handling** | Synth | 1h | "All agents idle" message when nothing is happening |
| **Error state handling** | Synth | 1h | "Unable to connect. Retrying..." with grayed last-known state |

### Post-Launch

| Action | Owner | Purpose |
|--------|-------|---------|
| Retire original spec → `docs/archive/original-spec-v1.md` | Archivist | Living docs replace static spec |
| "Hit by a bus" test | Archivist | Can a new dev add a building from docs alone? |
| User testing (3 people who haven't seen spec) | Oracle | Watch what they click, fix what confuses them |

### Accessibility Requirements (Archivist)

| Requirement | Priority | Phase | Effort |
|-------------|----------|-------|--------|
| Hidden ARIA tree mirroring canvas elements | P0 | 5.1 | 1–2h |
| `prefers-reduced-motion` support | P0 | 5.1 | 0.5h |
| Visible focus indicators on canvas | P1 | 5.4 | 1h |
| Non-color bond indicators (dash/dot + icon) | P1 | 5.3 | 1h |
| Focus trap for modals | P1 | 5.4 | 1h |
| Keyboard nav without overriding Tab | P1 | 5.4 | 0.5h |
| Color contrast verification (red bond borderline) | P2 | 5.3 | 0.5h |
| High contrast mode | P2 | 5.5+ | 2h |

---

## 10. Success Metrics

### Engagement (Measured 2 Weeks Post-Launch)

| Metric | Target | Method |
|--------|--------|--------|
| Session duration on tactical map | > 5 min avg | Page analytics |
| Click-through on buildings/bonds | > 20% of sessions | Click event tracking |
| Return visits (next day) | > 50% | User session tracking |
| Replay mode usage | > 10% of sessions | Feature usage tracking |

### Usefulness (Measured 1 Month Post-Launch)

| Metric | Target | Method |
|--------|--------|--------|
| Users identify overloaded agents at a glance | Yes | User feedback |
| Users correctly identify weak bonds | Yes | User testing |
| Users discover active work without reading logs | Yes | User testing |
| Onboarding tour completion rate | > 80% | Tour analytics |

### Technical Performance (Measured Continuously)

| Metric | Target | Method |
|--------|--------|--------|
| Frame rate | 60 FPS sustained | `requestAnimationFrame` monitoring |
| Update latency | < 100ms p95 | Network timing |
| Initial load | < 2s to first meaningful paint | Performance API |
| Memory usage | < 100MB heap | Chrome DevTools |
| Asset payload | < 5MB total | Network transfer size |
| API response | < 100ms p95 | Server-side timing |

### Quality (Measured Per Phase)

| Metric | Target | Method |
|--------|--------|--------|
| Unit test coverage (logic layers) | ≥ 80% cumulative | CI coverage report |
| Zero P0 security issues open | 0 | Sentinel audit |
| Visual regression pass rate | 100% | Playwright screenshot CI |
| Manual QA sign-off | All phases | Verifier + reviewer sign-off |

---

## 11. Risk Register

| # | Risk | Severity | Likelihood | Owner | Mitigation |
|---|------|----------|------------|-------|------------|
| 1 | No per-agent session data in API | 🔴 High | Certain | Atlas | Build session bridge in Phase 5.0 |
| 2 | Missions table empty (0 rows) | 🔴 High | Certain | Atlas | Build mission recording pipeline in Phase 5.0 |
| 3 | Unauthenticated API endpoints | 🔴 Critical | Certain (current state) | Sentinel | Design + implement auth in Phase 5.0/5.1 |
| 4 | XSS via task descriptions | 🔴 Critical | Likely | Synth | DOMPurify + CSP in Phase 5.1/5.2 |
| 5 | Sprite creation delays art pipeline | 🟡 Medium | Likely | Oracle | Procedural shapes for MVP; decouple art from code |
| 6 | Replay data quality insufficient | 🟡 Medium | Likely | Atlas | Defer replay to v2; validate data before building |
| 7 | Spec ambiguities create untestable code | 🟡 Medium | High | Oracle | Resolve 6 ambiguities before Phase 5.1 |
| 8 | No onboarding → users don't understand map | 🟡 Medium | High | Oracle + Synth | Guided tour in Phase 5.5 |
| 9 | Audio asset IP/licensing issues | 🟡 Medium | Medium | Archivist | ASSETS-LICENSING.md; original sound design only |
| 10 | Dashboard monolith grows unwieldy | 🟢 Low | Gradual | Atlas | Acceptable for now; refactor later |
| 11 | Cross-browser rendering differences | 🟢 Low | Low | Verifier | Smoke test Firefox/Safari weekly |
| 12 | SQLite contention from increased reads | 🟢 Low | Unlikely | Atlas | Tiny DB, read-only from map; upgrade to better-sqlite3 if needed |

---

## 12. Architecture Decisions (Consensus)

These emerged from cross-team agreement and should be recorded as ADRs:

### ADR-001: Extend Existing Dashboard (Not Separate Server)
- **Decision:** Tactical map served as `/map` route in existing `openclaw-dashboard` on port 7001
- **Rationale:** Single deployment, no CORS, shared DB connection, existing RPG APIs reusable
- **Trade-off:** Monolith grows larger (acceptable at this scale)
- **Agreed by:** Atlas, Synth (independently recommended same approach)

### ADR-002: Polling Over WebSocket for v1
- **Decision:** 15s polling for agent status, 60s for bonds. No WebSocket in MVP.
- **Rationale:** Data sources are polled SQLite, not push-based. WebSocket adds complexity for marginal benefit.
- **Future:** Add WebSocket/SSE in Phase 5.4+ for drift events and alerts only
- **Agreed by:** Atlas, Synth, Sentinel

### ADR-003: Procedural Sprites for MVP
- **Decision:** Use PixiJS Graphics (colored shapes + glow filters) for buildings and units in v1
- **Rationale:** Decouples art pipeline from critical path. Validates layout, interaction, data flow immediately. Swap to real sprites later without code changes.
- **Agreed by:** Atlas, Synth, Archivist

### ADR-004: Replay as Optional v2
- **Decision:** Phase 5.6 (Replay) is explicitly optional and deferred
- **Rationale:** Largest unknown (20–40h). Depends on data quality (empty missions table). Ships value without it.
- **Agreed by:** Synth, Atlas (replay complexity warnings)

---

## 13. Action Items — Next Steps

| # | Action | Owner | Deadline | Priority |
|---|--------|-------|----------|----------|
| 1 | **Decide: MVP scope vs full vision** | Zach | Before Phase 5.0 | 🔴 Blocking |
| 2 | **Decide: Isometric vs flat 2D** | Oracle + Synth | Before Phase 5.0 | 🔴 Blocking |
| 3 | **Build session bridge script** | Atlas | Phase 5.0 | 🔴 Blocking |
| 4 | **Build mission recording pipeline** | Atlas | Phase 5.0 | 🔴 Blocking |
| 5 | **Design security architecture (§11.5)** | Sentinel | Phase 5.0 | 🔴 Blocking |
| 6 | **Define MapState JSON contract** | Oracle + Synth | Phase 5.0 | 🔴 Blocking |
| 7 | **Resolve 6 spec ambiguities** | Oracle | Phase 5.0 | 🟡 High |
| 8 | **Create ASSETS-LICENSING.md** | Archivist | Phase 5.0 | 🟡 High |
| 9 | **Set up test infrastructure** | Verifier + Synth | Phase 5.1 (first task) | 🟡 High |
| 10 | **Implement auth on API endpoints** | Sentinel + Atlas | Phase 5.1 | 🔴 Blocking |
| 11 | **Create ARIA accessibility skeleton** | Synth | Phase 5.1 | 🟡 High |
| 12 | **Start procedural sprite development** | Synth | Phase 5.1 | 🟡 High |
| 13 | **Begin parallel art exploration** (if custom sprites desired) | Oracle | Phase 5.1+ | 🟢 Can start anytime |

---

## 14. Recommended Timeline

### MVP Path (Phases 5.0–5.4 Minimal)

```
Week 1:     Phase 5.0 — Data contracts, prerequisites, security design
Week 2-3:   Phase 5.1 — Foundation (buildings, terrain, HUD, auth, test infra)
Week 3-4:   Phase 5.2 — Activity & Animation (states, particles, health bars)
Week 4-5:   Phase 5.3 — Khala Network (bonds, collaboration, drift)
Week 5-6:   Phase 5.4 — Interactivity (panels, keyboard, tooltips)
            ──── MVP SHIP ────
Week 7+:    Phase 5.5 — Polish & Sound (audio, onboarding, tour)
Week 8+:    Phase 5.6 — Replay Mode (if prioritized)
```

**MVP ships at Week 5–6** with a living, interactive tactical map showing real agent activity, bond visualization, and detail panels. Audio, onboarding tour, and replay follow as incremental improvements.

> **Total MVP effort:** ~70–114 hours across 5–6 weeks  
> **Total with polish + replay:** ~88–150 hours across 7–9 weeks

---

*This plan synthesizes the perspectives of all 5 review teams. It is realistic, not aspirational. The original 48–64h spec estimate was achievable only for rendering code in isolation. The revised estimates account for the full picture: security, testing, documentation, accessibility, data plumbing, and onboarding that a production-quality system requires.*

*En Taro Adun.*
