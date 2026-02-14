# Phase 5 Tactical Map — Implementation Feasibility Review (Synth)

**Date:** 2026-02-14  
**Reviewer:** Synth  
**Overall feasibility:** **YELLOW** (very shippable as an MVP, but the current 48–64h estimate assumes placeholder art + reduced scope; “full spec fidelity” is closer to ~2×).

---

## 1) Effort reality check (adjusted estimates)

### Bottom line
- **Spec total (48–64h)** is **optimistic** unless:
  - sprites are mostly **procedural placeholders** or already exist,
  - WebSocket + replay are **de-scoped** or simplified,
  - UI panels/modals are kept **minimal**.
- **Full fidelity** (custom sprites, particles, modals, replay, performance polish) is more like **90–140 hours**.

### Per-phase adjustments
> Estimates below assume one implementer, integrating into the existing OpenClaw Dashboard codebase (see §6), with “good enough” polish and some time for integration/debug.

#### Phase 5.1 — Foundation
**Spec:** 8–12h  
**Reality:** **12–20h** (MVP) / **16–24h** (if we also do decent terrain + HUD + responsive camera + clean integration)
- The **camera + layering + scaling** + a clean route integration usually eats time.
- If **real sprites** are required in 5.1 (not placeholders), add **+4–12h** (and it’s blocked by art).

#### Phase 5.2 — Activity & Animation
**Spec:** 10–14h  
**Reality:** **18–30h** (code) + **(asset-dependent)**
- “**32 building animation states**” is a code problem *and* an asset pipeline problem.
- Unit sprites + pathing + progress bars + particles + health bars = many moving parts.
- If animation is sprite-sheet driven and we don’t already have sheets: add **+10–25h** just for producing/cleaning/exporting assets.

#### Phase 5.3 — Khala Network
**Spec:** 6–8h  
**Reality:** **10–16h**
- Bezier rendering is easy; **tier styling** is easy.
- The time sinks are:
  - dashed/dotted styling on curves,
  - glow/pulse without killing FPS,
  - **hit-testing** curved lines reliably,
  - collaboration particles along curves.

#### Phase 5.4 — Interactivity
**Spec:** 8–10h  
**Reality:** **16–24h**
- Panels/modals/overlays are basically building a small UI framework.
- Doing tooltips well (delay, smart edge positioning), keyboard shortcuts, and panel state management is non-trivial.

#### Phase 5.5 — Polish & Sound
**Spec:** 6–8h  
**Reality:** **8–14h** (assuming audio files exist)
- Browser audio has practical hurdles:
  - autoplay restrictions (must start on user gesture),
  - mixing/ducking, cooldown logic, volume persistence.
- If we also need to *generate/source* audio, add **+4–10h**.

#### Phase 5.6 — Replay Mode
**Spec:** 10–12h  
**Reality:** **20–40h** (largest unknown)
- Timeline UI + event markers + caching + reconstruction endpoints + interpolation is a full feature.
- Replay will also expose data-quality gaps (missing timestamps, inconsistent mission statuses, “what is activity at time T?” definitions).

### Recommended revised plan totals
- **MVP Tactical Map (no replay, minimal assets):** **40–65h**
- **Spec-fidelity (with replay + custom sprites + audio polish):** **90–140h**

---

## 2) Technical dependencies (§11) — approve/challenge

### PixiJS v7+
**Approve.** Correct choice for 2D sprites, hit testing, and reasonable performance.
- Practical notes:
  - Strongly consider using **Pixi Filters** (e.g., glow) rather than custom shaders initially.
  - Particles: either keep it simple with `ParticleContainer` + manual sprites, or adopt a known emitter library (e.g. `@pixi/particle-emitter`) if we want high particle counts.

### better-sqlite3
**Approve (server-side only).** Already used in `ventureos` and `ventureos-rpg`.
- The browser should **not** touch SQLite directly; it should call HTTP endpoints.

### WebSocket
**Challenge (not required for v1).**
- The existing `openclaw-dashboard/server.js` already has an **SSE live feed** implementation pattern; SSE is simpler, works well on LAN, and fits “event stream” needs.
- For the tactical map:
  - **Polling** (5–10s) is fine for most state.
  - Use **SSE** for “recent events / alert feed” if we want push.
  - Only add WebSocket if we later need bidirectional commands.

### Build tooling (Vite/esbuild)
**Challenge for early phases.**
- The existing dashboard is plain Node HTTP + static files.
- Adding Vite is doable but adds complexity (dev server, build output, deployment steps).
- Recommendation: start with **no bundler** (ES modules + CDN imports), and only introduce bundling if/when needed.

### Howler.js
**Approve.** Good for browser audio; supports sprites/mixing. Just plan around autoplay policies.

---

## 3) Implementation order — what’s out of order / missing

### What the spec gets right
- The general progression (foundation → activity → bonds → interactivity → polish → replay) is sensible.

### What I would reorder
1. **(New) Phase 5.0 — Data/API contract (4–10h)**
   - Decide: “source of truth” for active work = **OpenClaw sessions** vs **ventureos-rpg missions**.
   - Lock a single `MapState` JSON shape (agents, bonds, events, missions).
   - Add endpoints (or adapt existing `/api/rpg/*`).

2. **Khala Network can start earlier**
   - Bonds rendering does not depend on unit sprites.
   - Doing bonds early helps validate performance + interaction design.

3. **Replay should be explicitly “v2” unless we commit to DB + endpoints**
   - Replay depends on good historical data (missions/events/bond drift snapshots). If the underlying data isn’t clean, replay will balloon.

---

## 4) Complexity hotspots (what will blow up)

### Biggest underestimates
1. **Sprite asset production + iteration loop**
   - Exporting sheets, aligning anchors, naming, dealing with transparency, packing atlases, and making everything visually consistent is time-consuming.

2. **Bezier bond styling + hit-testing**
   - “Dashed/dotted bezier lines” and “click a bond reliably” are surprisingly fiddly.

3. **Replay reconstruction**
   - Defining deterministic state-at-time-T for:
     - missions active,
     - session-derived activities,
     - bond affinity history,
     - “unit positions derived from activity”
   - Interpolation + timelapse skip logic adds edge cases.

4. **Audio polish**
   - Autoplay restrictions + spatial-ish mixing + cooldowns = lots of small buglets.

5. **Progress estimation**
   - “estimated duration default 30m” is fine, but will produce misleading UI unless tasks include metadata.

---

## 5) Gap #1 — Sprite pipeline (who does it?)

### Current gap
The spec assumes:
- 8 buildings × 4 states = **32 building state animations**
- 8 units × (idle/walk/action) = **24+ unit animations**
- particles + terrain textures

That’s an **art pipeline**, not just code.

### Recommendation (pragmatic)
- **Ship v1 with procedural sprites**:
  - Buildings: Pixi `Graphics` shapes + glow filters + state tint overlays.
  - Units: small triangles/dots + simple “walk” bobbing.
  - Particles: circles/sprites generated in code.
- In parallel, assign sprite creation to a specific owner.

### If we want real pixel art anyway
- We need an explicit owner and workflow:
  - Tooling: **Aseprite** (or similar) + a single export script.
  - Output: PNG sprite sheets + a JSON atlas (TexturePacker).
  - Naming conventions: `assets/sprites/buildings/{agent}/{state}.png` or atlas frames.

**Who should own it?** Not the main implementer by default.
- If no artist is available, **we must budget extra time** (10–30h) and accept that visuals will iterate slowly.

---

## 6) Integration with existing VentureOS / OpenClaw codebase

### Key discovery
We already have a running UI server: **`/Users/zachgonser/clawd/openclaw-dashboard/server.js`**.
- It already mounts:
  - **VentureOS RPG APIs** (`rpg-http.js`) under `/api/rpg/*`
  - **Conversation APIs** under `/api/rpg/conversations/*`
  - An SSE-style live feed pattern
  - Static serving under `/rpg/`

### Strong recommendation
**Implement the tactical map as a new page inside openclaw-dashboard**, not a separate standalone app.
- Pros:
  - One server/process to run
  - Easy access to existing APIs + config
  - Shared navigation tabs already exist conceptually
  - Less deployment/build tooling overhead

### Suggested integration approach
1. Add static serving for a new prefix, e.g.
   - `/map/` → `openclaw-dashboard/public/map/` (new folder)
2. Add a “Tactical Map” nav link in dashboard `index.html`.
3. Use existing RPG endpoints:
   - Bonds: `GET /api/rpg/khala-network`
   - Agent stats: `GET /api/rpg/stats`
   - Conversation activity: `GET /api/rpg/conversations/active`
4. Add only the missing endpoints needed for missions/sessions/progress, either:
   - extend `ventureos-rpg/api/rpg-http.js` with `missions/active`, `events/recent`, etc.
   - or add dashboard-local endpoints that query `ventureos-rpg.db`.

### Note on “sessions_list” (OpenClaw internals)
The dashboard already reads OpenClaw session registry JSONL/JSON.
- That’s a better bridge than calling OpenClaw internals directly from the browser.
- If we need per-agent live sessions, create an endpoint like `/api/agents/live` built from the dashboard’s existing session parsing.

---

## 7) Gap analysis (from spec) — my take

### Gap #2: API server
**Partially already solved.**
- The openclaw-dashboard server + `ventureos-rpg/api/rpg-http.js` already provide key data.
- Remaining work: add endpoints for:
  - active missions/tasks + progress metadata,
  - event feed aggregation in the format the map wants,
  - replay reconstruction (if we do replay).

### Gap #3: Session detection bridge
**Still real, but easier than described.**
- We can avoid OpenClaw-internal APIs by using:
  - dashboard’s existing session parsing, or
  - a small “bridge” that writes active session summaries into SQLite.

Estimate if done cleanly: **4–12h** depending on how much accuracy we want.

### Gap #6: State persistence (localStorage)
**Do it in Phase 5.1** (cheap, improves dev UX).
- Persist zoom/pan, selected agent, open panels, audio settings.
- This is ~**1–3h** and prevents a lot of annoyance.

---

## 8) Simplification options (to ship faster)

### “Ship in 1–2 weeks” MVP cuts
- **No unit sprites** initially; represent activity with building glow + a small orbiting dot.
- **No particles** except 1–2 generic effects.
- **No WebSocket**; polling only.
- **No bond click modal**; hover tooltip only.
- **No replay** (or replay = “last 60 minutes” only, discrete snapshots).
- **No per-activity unique animation**; just ACTIVE vs IDLE vs ERROR.

### High-leverage visuals without sprite work
- Glow + tint overlays + simple animated masks.
- A single “warp ring” particle effect reused everywhere.

---

## 9) Oracle’s design opinions (§15) — implementation view

### Isometric 2.5D (+4h)
**Recommendation:** defer.
- If we don’t have iso-specific sprites/tiles, coordinate transforms alone can look “off.”
- Doing iso *right* impacts:
  - asset style,
  - hit areas,
  - camera feel,
  - z-sorting.
- This is a great **Phase 5+** upgrade once base 2D is stable.

### Building “level up” visuals
**Recommendation:** do procedurally first.
- Easiest: add **rank ring**, stronger glow, extra “pylon prongs” overlay.
- Avoid “new sprite per rank” until we have an art pipeline.

### Day/night cycle
**Recommendation:** yes, cheap win.
- A single full-screen multiply/gradient overlay keyed to local time is ~**1–2h**.

### Fog of war for idle agents
**Recommendation:** defer.
- It complicates readability and interaction.
- Do it only if the map becomes visually noisy and we need focus cues.

---

## 10) Prerequisites before Phase 5.1

1. **Decide hosting target**: integrate into `openclaw-dashboard` (recommended).
2. **Confirm data sources**:
   - bonds + ranks from `ventureos-rpg.db` (already available),
   - live activity from sessions registry or missions table.
3. **Define a minimal `MapState` contract** (even if delivered via multiple endpoints initially).
4. **Decide sprite strategy**:
   - procedural MVP vs pixel-art pipeline.

---

## 11) Recommendations (actionable)

1. **Treat replay as optional (v2) unless explicitly prioritized.**
2. **Start with procedural art**; parallelize sprite/audio creation if we want it later.
3. **Use SSE or polling first**; avoid WebSocket until needed.
4. **Integrate into openclaw-dashboard** to leverage existing API plumbing and reduce build tooling overhead.
5. **Add Phase 5.0 (data contract + endpoints)** so phases 5.1+ aren’t blocked by missing server APIs.

---

### Quick proposed MVP scope (if we want a real ship date)
- Phase 5.1 + subset of 5.3 + minimal 5.4:
  - buildings + bonds + basic hover tooltips + click building panel (minimal)
  - no unit sprites, no replay

This gets us a compelling “living map” feel without blocking on assets or replay complexity.
