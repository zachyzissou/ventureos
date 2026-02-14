# Phase 5 Review — Archivist (Documentation & Onboarding)

**Reviewer:** Archivist (📚)  
**Date:** 2026-02-14  
**Spec Reviewed:** `phase5-tactical-map-spec.md` v1.0  
**Feasibility Assessment:** 🟡 YELLOW — Spec is strong for implementation but has significant gaps in user-facing documentation, onboarding, accessibility, and maintainability.

---

## 1. Documentation Needs — What's Missing from the Spec

### 1.1 The Spec as an Implementation Doc: B+

Oracle wrote this primarily for Synth (the implementer). For that purpose it's solid:
- Building positions, colors, and animations are precisely specified
- API endpoints are named with methods and frequencies
- Activity mapping logic includes actual JavaScript
- SQL queries are provided for real-time state
- File structure is laid out directory-by-directory

**Where it falls short for implementation:**

| Gap | Section | Impact | Recommendation |
|-----|---------|--------|----------------|
| No error handling spec | §11, §12 | What happens when API returns 500? WebSocket disconnects? DB is empty? | Add §11.5 "Error States & Fallbacks" — loading skeleton, retry logic, stale data indicators |
| No state machine diagram | §4 (Building States) | Four states (IDLE/ACTIVE/OVERLOADED/ERROR) but no defined transitions or edge cases | Add a formal state diagram: what triggers each transition, what happens during transition, can states be skipped? |
| Activity mapper ambiguity | §12 | Regex patterns overlap: "review" matches both Oracle's "analyzing" and Verifier's "validating" | Add priority ordering docs and a "what if no match" decision tree |
| No data contract/schema | §11 (API Endpoints) | Endpoints listed but no JSON response shapes | Add OpenAPI-style request/response schemas for each endpoint, even informal ones |
| Sprite specification is vague | §4, Gap 1 | "Create/source 8 building sprites" — what art style? What animation frames? How many per state? | Need a sprite sheet specification: frame count per state, animation timing, naming convention, format (PNG sprite sheet vs individual frames) |
| No configuration documentation | §11 | Polling intervals, particle counts, color values are hardcoded in spec | Document which values should be configurable (config.js) vs hardcoded. Future devs need to know what's tunable |

### 1.2 Missing Documentation Artifacts

The spec itself isn't enough. We need these companion docs:

1. **`tactical-map/README.md`** — Setup instructions, dev server, build, deploy
2. **`tactical-map/docs/ARCHITECTURE.md`** — High-level architecture for new contributors (extract from §11, add diagrams)
3. **`tactical-map/docs/DATA-FLOW.md`** — How data moves from DB → API → state store → renderer (the spec has pieces scattered across §11, §12)
4. **`tactical-map/docs/SPRITE-GUIDE.md`** — Asset creation standards, naming conventions, animation frame specs
5. **`tactical-map/docs/API.md`** — Full API contract with example responses
6. **`tactical-map/CHANGELOG.md`** — Track changes per phase delivery

### 1.3 §5 Activity Mapping — Detailed Enough?

**Partially.** The table is comprehensive — every agent has 3-4 activity types mapped with detection sources, building/unit/particle animations. Good.

**But "Detection Sources" need work:**
- "sessions_list active research task" — what does this mean technically? Is it an OpenClaw API call? A database query? The `activity-mapper.js` in §12 uses `session.label` with regex, but §5 says "Detection Source" as if it's something different.
- "Memory file being created/edited" (Oracle/Writing) — how does the tactical map detect file creation? Filesystem watch? This isn't covered in the API endpoints.
- "Heartbeat/monitoring session" (Atlas/Monitoring) — is this a specific session kind? How does it differ from a regular session?
- "Escalation logged to DB" (Sentinel/Escalating) — does the API poll the escalations table separately, or does this come through the event WebSocket?

**Recommendation:** Add a "Detection Implementation" column to each table in §5 that maps directly to an API endpoint or polling mechanism. Don't leave the implementer guessing which plumbing to use.

### 1.4 §13 ASCII Mockups — Sufficient?

**For layout and structure: yes.** The mockups clearly convey panel placement, information hierarchy, and relative sizing. They're better than no wireframes.

**For visual design: no.** ASCII can't convey:
- Color relationships (critical for bond affinity tiers)
- Animation feel (particle density, motion speed)
- Hover/focus state transitions
- Spacing and typography hierarchy
- The actual StarCraft aesthetic

**Recommendation:** Don't block implementation on wireframes — the ASCII is good enough for Synth to start. But Oracle should produce 2-3 key reference screenshots/mockups during Phase 5.1 (even rough Figma sketches or annotated SC2 screenshots) for:
1. The full map view with bonds visible
2. A building detail panel
3. The color palette in context (not just hex values)

### 1.5 §14 Phased Checklist — Enough for Estimation?

**Close, but missing sizing signals.** The checklist is well-structured with clear deliverables per phase. However:

- Tasks are listed as binary checkboxes with no relative complexity indicators. "Create index.html entry point" and "Implement activity-mapper.js with regex matching for 8 agents" are wildly different efforts but look the same.
- No dependency callouts within phases. In Phase 5.1, does "Data connection" block "Basic HUD" or are they parallel?
- No "Definition of Done" per task. When is "Building sprites" done — placeholder rectangles? Animated sprite sheets? Polished art?

**Recommendation:** Add t-shirt sizing (S/M/L/XL) to each task and explicit intra-phase dependency notes. This is the difference between "6-8 hours" being accurate and being a wild guess.

---

## 2. User Onboarding Plan — First-Time Experience

### 2.1 Current State: Nothing

The spec has **zero** onboarding design. A user loads the tactical map and sees: 8 buildings in a circle, colored lines between them, a KPI ticker, and particle effects. Unless they've read a 1500-line spec document, they have no idea what any of it means.

This is the single biggest gap in the spec.

### 2.2 What Users Need to Understand

| Concept | Why It's Not Obvious | Consequence of Not Understanding |
|---------|---------------------|----------------------------------|
| Buildings = Agents | No labels visible at default zoom; building names are 10px | User doesn't know who is who |
| Colors = Bond strength | 5-tier color system is arbitrary without context | User sees colored lines with no meaning |
| Health bars = Capacity | Small (48×6px), no label by default | User might think it's decorative |
| Particles = Activity type | Multiple particle types with no legend | Visual noise, not information |
| Click/hover interactions | Nothing signals clickability | User treats it as a screensaver |
| HUD panels | Collapsed by default | User doesn't know they exist |
| Keyboard shortcuts | No visible cue anywhere | Power features remain hidden |
| Replay mode | Hidden, toggled by `R` key | Most users will never discover it |

### 2.3 Proposed Onboarding Flow

**First Visit — Guided Tour (skippable, ~45 seconds)**

```
Step 1: "Welcome to the Tactical Command Center"
  → Camera zooms from overview to Nexus
  → "This is your Nexus — the heart of your agent team."
  → Highlight: Nexus glows brighter, pulsing arrow points to it

Step 2: "Your Agents"
  → Camera pans to Oracle building
  → "Each building represents an agent. This is Oracle's Observatory."
  → Highlight: Building label enlarges, agent name tooltip appears
  → "Click any building to see its details."

Step 3: "The Khala Network"  
  → Camera zooms out, bonds become prominent
  → "These lines show how your agents relate to each other."
  → Highlight: Gold bond pulses brighter, tooltip shows "0.95 — Strong bond"
  → Color legend appears briefly: Red → Orange → Blue → Gold

Step 4: "Activity & Status"
  → One agent animates (if any are active)
  → "When agents are working, their buildings come alive."
  → Highlight: Health bar with label, progress bar with label

Step 5: "Your Controls"
  → Keyboard shortcut overlay flashes briefly
  → "Press ? at any time for help. Press M to mute. Scroll to zoom."
  → Tour ends, map returns to normal

Step 6: "Explore!"
  → Dismiss toast: "Click buildings, hover bonds, press ? for help"
```

**Implementation cost:** ~4-6 hours. Use a lightweight tour library (e.g., Shepherd.js, ~15KB) or build simple overlay system with PixiJS.

**Persistence:** `localStorage.tacticalMapTourComplete = true` — don't show again, but make it re-triggerable from a `?` menu.

### 2.4 Persistent Help Elements

Beyond the one-time tour, the map needs ongoing discoverability aids:

1. **Help button (`?` icon, top-right)** — Opens overlay with:
   - Keyboard shortcut reference
   - Color legend (bond tiers + status colors)
   - HUD element descriptions
   - "Restart tour" link

2. **Color legend (toggle, bottom-right)** — Small persistent widget:
   ```
   ═══ Gold (0.85+)  Strong bond
   ─── Blue (0.60+)  Healthy bond  
   ··· Orange (0.40+) Developing bond
   ┄┄┄ Red (<0.40)   Weak bond
   ```

3. **Contextual tooltips on first interaction** — First time a user hovers a bond, add a slightly more verbose tooltip: "Oracle ↔ Archivist: 0.95 (Gold Bond) — Click for details". After first interaction, shorten to standard tooltip.

4. **Empty state handling** — If all agents are idle, show a subtle message: "All agents idle. Activity will appear here when agents are working." Don't leave users staring at a static map wondering if it's broken.

---

## 3. Accessibility Concerns

### 3.1 Canvas Rendering = Accessibility Nightmare (Unless Addressed)

PixiJS renders to `<canvas>`, which is **opaque to screen readers by default**. Every visual element — buildings, bonds, labels, health bars — is just pixels. This is a critical problem.

### 3.2 Specific Concerns

| Issue | Severity | WCAG Criterion | Current Spec Status |
|-------|----------|----------------|-------------------|
| **Screen reader access** | 🔴 Critical | 1.1.1 Non-text Content | Not addressed at all |
| **Keyboard navigation** | 🟡 Partial | 2.1.1 Keyboard | §8 has shortcuts, but no focus indicators or tab order |
| **Color-only information** | 🔴 Critical | 1.4.1 Use of Color | Bond tiers rely entirely on color; health bars use green→red |
| **Contrast ratios** | 🟡 Unchecked | 1.4.3 Contrast (Minimum) | Text is #e0e0e0 on dark backgrounds — probably fine, but not verified |
| **Animation sensitivity** | 🟡 Missing | 2.3.1 Three Flashes | Particles, flickering bonds, state transitions — no `prefers-reduced-motion` check |
| **Focus management** | 🔴 Missing | 2.4.3 Focus Order | Panels/modals don't specify focus trapping or return-focus behavior |
| **Text alternatives** | 🔴 Missing | 1.1.1 Non-text Content | No alt text for buildings, no ARIA labels for HUD panels |
| **Audio-only information** | 🟡 Missing | 1.2.1 Audio-only | Event sounds convey info (task complete, error) with no visual equivalent... wait, there ARE visual equivalents. But voice lines convey character with no text |

### 3.3 Recommended Accessibility Layer

**Priority 1 (Must-Have for Launch):**

1. **Hidden ARIA tree** — Render an invisible DOM structure mirroring the canvas:
   ```html
   <div role="application" aria-label="Tactical Command Center">
     <div role="group" aria-label="Agent Buildings">
       <button role="button" aria-label="Oracle Observatory — Active, Researching Phase 5 Spec, 75% complete, Capacity 45%">
       <!-- One per building, updated with live state -->
     </div>
     <div role="group" aria-label="Khala Network Bonds">
       <div role="status" aria-label="Oracle to Archivist bond: 0.95, Gold tier, Strong">
       <!-- Key bonds, updated on drift -->
     </div>
     <div role="log" aria-label="Recent Events">
       <!-- Alert feed items -->
     </div>
   </div>
   ```

2. **Focus ring on canvas** — When a building is selected via keyboard (1-8 or Tab), draw a visible focus indicator (bright white outline, 2px, high contrast).

3. **`prefers-reduced-motion` support** — Check media query on load:
   - Reduced motion: disable particles, use simple opacity transitions instead of animations, stop unit movement, static bond lines
   - Standard: full animations as designed

4. **Non-color bond indicators** — Add secondary visual encoding:
   - Gold bonds: solid thick line + shimmer
   - Blue bonds: solid medium line (already distinct)
   - Orange bonds: dotted line (already specified ✅)
   - Red bonds: dashed line + crackling (already specified ✅)
   - Also add small icons/symbols at bond midpoints for critical tier boundaries

5. **Focus trap for modals** — When building detail panel or bond modal opens, trap Tab within the panel. Esc closes and returns focus to the triggering element.

**Priority 2 (Should-Have, Phase 5.5+):**

6. **High contrast mode** — Increase all text to #ffffff, increase bond line widths, add outlines to buildings against terrain
7. **Text-only mode** — An alternative view that renders agent status as a structured HTML table (same data, accessible format)
8. **Audio descriptions** — Optional screen reader narration of state changes ("Oracle is now active, researching Phase 5 spec")

### 3.4 Color Contrast Verification

Quick check on key combinations:

| Text/Element | Foreground | Background | Ratio | WCAG AA (4.5:1) |
|-------------|-----------|------------|-------|-----------------|
| Primary text | #e0e0e0 | #0d0d1a | ~14:1 | ✅ Pass |
| Muted text | #888888 | #0d0d1a | ~5.5:1 | ✅ Pass (barely) |
| Building labels (10px) | #e0e0e0 | #1a1a2e | ~11:1 | ✅ Pass |
| Health bar green | #33ff88 | #1a1a2e | ~10:1 | ✅ Pass |
| Health bar red | #ff3333 | #1a1a2e | ~4.8:1 | ✅ Pass (barely) |
| Gold bond on void | #f6c445 | #0d0d1a | ~9:1 | ✅ Pass |
| Red bond on void | #ff4444 | #0d0d1a | ~4.5:1 | ⚠️ Borderline |
| Muted text on stone | #888888 | #1a1a2e | ~4.2:1 | ❌ Fail |

**Action:** Bump muted text to #999999 or #9a9a9a on darker backgrounds. Red bonds borderline — consider #ff5555.

---

## 4. Maintenance Strategy — Keeping Docs + Code in Sync

### 4.1 The Problem

This spec is 1500+ lines. The moment code diverges from spec (and it will — implementation always reveals design flaws), the spec becomes a historical artifact, not a living document. Future contributors will read the spec, believe it, and be wrong.

### 4.2 Documentation Architecture

```
tactical-map/
├── README.md                     # Setup, build, deploy, contributing
├── CHANGELOG.md                  # What changed per release
├── docs/
│   ├── ARCHITECTURE.md           # System overview (extracted from spec §11)
│   ├── DATA-FLOW.md              # DB → API → State → Renderer pipeline
│   ├── API.md                    # Endpoint contracts with examples
│   ├── SPRITE-GUIDE.md           # Asset standards and creation process
│   ├── ACCESSIBILITY.md          # A11y implementation details
│   ├── KEYBOARD-SHORTCUTS.md     # User-facing shortcut reference
│   └── ONBOARDING.md             # Tour system implementation
├── src/
│   ├── config.js                 # ← SINGLE SOURCE OF TRUTH for positions, colors, timings
│   └── ... (code with inline JSDoc comments)
```

### 4.3 Keeping Docs Alive

1. **Config as Documentation** — Move all magic numbers (colors, positions, timing, thresholds) into `config.js` with JSDoc comments. The config file IS the living spec for visual parameters. If someone changes a color, they change it in one place.

2. **JSDoc on Public Functions** — Every exported function gets a one-liner. Not a novel — just enough that `grep` and IDE hover give context.

3. **PR Template** — Add a checkbox: "☐ Updated docs if behavior changed". Cheap enforcement.

4. **Architecture Decision Records (ADRs)** — For non-obvious decisions (why PixiJS? why polling at 10s? why bezier curves instead of straight lines?), create short ADR files:
   ```
   docs/decisions/
   ├── 001-pixijs-over-canvas2d.md
   ├── 002-polling-over-websocket-initial.md
   └── 003-isometric-vs-flat.md
   ```
   These answer the "why" that code comments can't.

5. **Spec Retirement** — After Phase 5.1 ships, the original spec (`phase5-tactical-map-spec.md`) should be moved to `docs/archive/original-spec-v1.md` and clearly marked as historical. Living documentation lives in `docs/`.

### 4.4 Code Maintainability Concerns

The file structure in §11 is reasonable but I'd flag:

- **No test directory mentioned** — Verifier's review should address this, but from a docs perspective, we need `tests/` in the structure and testing guidance in README
- **No TypeScript** — The spec assumes vanilla JS. Type annotations (even JSDoc @type) would massively help future contributors understand data shapes. Recommend at minimum a `types.d.ts` or `@typedef` comments.
- **State management is vague** — "Lightweight store" isn't a decision. Is it a class? A pub/sub? A reactive store? This needs a concrete choice documented in ARCHITECTURE.md.

---

## 5. Knowledge Transfer — Bus Factor

### 5.1 Current Risk

| Scenario | Impact | Mitigation |
|----------|--------|-----------|
| Synth leaves mid-Phase 5.3 | 🔴 High — PixiJS renderer knowledge, particle system tuning, all in Synth's head | Pair programming sessions in Phase 5.1, recorded or documented. Code review by Atlas on each phase. |
| Oracle leaves mid-implementation | 🟡 Medium — Design rationale lost, aesthetic decisions become cargo cult | Capture Oracle's design opinions as ADRs NOW (§15 has good ones but they need to be formalized) |
| Both leave | 🔴 Critical — Project stalls | Ensure README + ARCHITECTURE.md are complete enough that a new developer can run, understand, and modify the project within 1 day |

### 5.2 Knowledge Transfer Checklist

- [ ] **Phase 5.1 kickoff:** Synth records a 10-min video walkthrough of the initial architecture (screen recording, stored in shared drive)
- [ ] **Per-phase completion:** Update ARCHITECTURE.md with any deviations from spec
- [ ] **Code reviews:** Every PR reviewed by at least one non-implementer (Atlas or Archivist)
- [ ] **Asset pipeline:** Document the exact process for creating/modifying sprites (tools used, dimensions, export settings)
- [ ] **"Hit by a bus" test:** At Phase 5.3, have someone other than Synth try to add a new building. If they can't do it from docs alone, the docs are insufficient.

---

## 6. Specific Concern Responses

### §7 Interactive Features — Discoverability

The spec defines 6 click targets, 5 hover targets, 8 keyboard shortcuts, and 4 camera controls. That's ~23 interactions with zero discoverability cues.

**Recommendations:**
- Cursor changes: pointer on clickable elements, grab on terrain, zoom on scroll
- First-time contextual hints: "💡 Try clicking a building" (one-time, dismissable)
- Help overlay (`?` key): visual keyboard map + interaction summary
- Subtle visual affordances: buildings have a faint highlight on hover (already in spec as tooltip trigger — make the highlight more visible)

### §9 Sound — Licensing

"StarCraft unit acknowledgments" and "SC2 sound-alike" voice lines raise IP concerns:

- **Voice lines:** The spec says "Pre-generated TTS audio files (ElevenLabs or SC2 sound-alike)" — this is fine IF the lines are original text (which they are: "The Khala guides my sight" isn't a direct SC2 quote). But the voice STYLE mimicking specific SC2 characters (Zeratul, Artanis) could be problematic.
- **Sound effects:** "SC2 construction complete chime" — directly using Blizzard audio assets would be copyright infringement. Need original sound design.
- **Music:** "Protoss ambient theme" — must be original or licensed. Cannot use SC2 soundtrack.

**Recommendation:** Add a `docs/ASSETS-LICENSING.md` documenting:
- Each audio asset's source (original, licensed, or placeholder)
- Each sprite asset's source
- Font licensing (the "protoss.woff2" — is this a real font? Licensed?)
- A clear policy: "No copyrighted Blizzard assets. SC2-inspired, not SC2-copied."

### §15 Isometric 2.5D — Design Rationale

Oracle recommends isometric 2.5D but the rationale is "would massively improve the StarCraft feel." That's an aesthetic opinion, not a documented decision.

**Recommendation:** Create `docs/decisions/003-isometric-vs-flat.md`:
- Pros: StarCraft authenticity, visual depth, better building differentiation
- Cons: +4 hours Phase 5.1, sprite creation more complex (isometric perspective), coordinate math harder, accessibility implications (spatial reasoning)
- Decision: [TBD — needs team consensus]
- Decided by: [Oracle + Synth + Echo]

This question should be resolved BEFORE Phase 5.1 starts. It affects every sprite, every coordinate, and every layout decision.

### Gap #4 Mobile/Responsive — Document as Known Limitation

**Yes, absolutely document it.** Add to README.md:

```markdown
## Known Limitations

- **Mobile/tablet:** The tactical map is designed for desktop viewports (1024×768 minimum). 
  Touch interaction (tap, pinch-zoom) is partially supported. Small viewports will hide 
  sidebar panels. Full mobile optimization is deferred to a future phase.
```

Don't let users discover this by confusion. Don't let future devs wonder if mobile was "forgotten" or intentionally deferred.

---

## 7. User Experience Questions — Answers Needed

| Question | Current Spec Answer | Gap? | Recommendation |
|----------|-------------------|------|----------------|
| What happens when a user first loads the map? | Nothing specified | 🔴 Yes | Implement guided tour (see §2.3 above) |
| How do users know what colors mean? | Bond tiers defined in §6 but not user-facing | 🔴 Yes | Persistent color legend widget + onboarding step |
| Is there a legend/key for HUD elements? | No | 🔴 Yes | Help overlay with HUD element descriptions |
| Can users hide bonds? | Not specified | 🟡 Yes | Add view customization: toggle bonds, toggle particles, toggle labels |
| Can users mute sounds? | §8: M key mute, §9: per-category toggles | ✅ Covered | Just needs the `?` help to document it |
| Can users customize the view? | Camera controls only (zoom, pan) | 🟡 Partial | Add a settings gear: show/hide bonds, particles, labels, sound categories |
| What if all agents are idle? | Not specified | 🟡 Yes | Empty state message (see §2.4) |
| What if the API is down? | Not specified | 🔴 Yes | Error state: "Unable to connect. Retrying..." with last-known state grayed out |

---

## 8. Summary Recommendations

### Must-Do Before Implementation Starts
1. **Resolve isometric vs flat** — This is a blocking architectural decision
2. **Define error/empty states** — What the user sees when things go wrong
3. **Add API response schemas** — Synth needs to know the data shapes
4. **Create ASSETS-LICENSING.md** — Don't build on IP quicksand

### Must-Do During Phase 5.1
5. **Write README.md** — Setup, build, deploy, contributing guidelines
6. **Create config.js as living spec** — All visual constants with comments
7. **Implement hidden ARIA tree skeleton** — Accessibility from day one, not bolted on
8. **Add `prefers-reduced-motion` check** — One line of CSS/JS, huge accessibility win

### Must-Do Before User-Facing Release (Phase 5.4+)
9. **Implement guided tour** — 4-6 hours, non-negotiable for user comprehension
10. **Add color legend widget** — Users can't learn a 5-tier color system by osmosis
11. **Add `?` help overlay** — Keyboard shortcuts, interaction guide, legend
12. **Add view customization** — Toggle bonds/particles/labels/sound
13. **Add empty/error states** — Don't leave users staring at a broken canvas

### Should-Do Post-Launch
14. **Write ARCHITECTURE.md** — Extract from spec, keep living
15. **Create ADRs for key decisions** — PixiJS choice, polling intervals, coordinate system
16. **"Hit by a bus" test** — Can a new dev add a building from docs alone?
17. **Retire the original spec** — Archive it, point to living docs
18. **User testing** — 3 people who haven't seen the spec try to use the map. Watch what they click. Fix what confuses them.

---

## Artifacts Updated
- `~/clawd/shared-context/phase5-review-archivist.md` — This review (new file)

## Where to Find This Later
- Shared context: `~/clawd/shared-context/phase5-review-archivist.md`
- Referenced spec: `~/clawd/shared-context/phase5-tactical-map-spec.md`
