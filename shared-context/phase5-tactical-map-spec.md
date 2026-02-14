# Phase 5: StarCraft Tactical Command Center — Full Design Specification

**Date:** 2026-02-14  
**Author:** Oracle (Zeratul, Dark Templar Prelate)  
**Status:** 📋 DESIGN COMPLETE — Awaiting Team Review  
**Implementation:** Phase 5 (post-Phase 4 conversation system)  
**Estimated Effort:** 48-64 hours (6 phases, ~3-4 weeks parallel)

---

> *"From the shadows, I have watched. From the observatory, I now reveal the full topology of our forces."*  
> — Zeratul, reviewing the tactical map design

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Dual View System](#2-dual-view-system)
3. [Tactical Map Layout](#3-tactical-map-layout)
4. [Agent Buildings Reference](#4-agent-buildings-reference)
5. [Activity Mapping Reference](#5-activity-mapping-reference)
6. [Khala Network Visualization](#6-khala-network-visualization)
7. [Progress & Status Indicators](#7-progress--status-indicators)
8. [Interactive Features](#8-interactive-features)
9. [Sound & Atmosphere](#9-sound--atmosphere)
10. [Historical Replay Mode](#10-historical-replay-mode)
11. [Technical Architecture](#11-technical-architecture)
12. [Data Integration Reference](#12-data-integration-reference)
13. [ASCII Mockups](#13-ascii-mockups)
14. [Phased Implementation Checklist](#14-phased-implementation-checklist)
15. [Oracle Design Review & Recommendations](#15-oracle-design-review--recommendations)
16. [Open Questions](#16-open-questions)
17. [Team Review Assignments](#17-team-review-assignments)
18. [Success Metrics](#18-success-metrics)

---

## 1. Executive Summary

### Vision

Transform the VentureOS monitoring experience from static data tables into a **living StarCraft-style tactical command center** where each agent is a Protoss building/unit working in real-time on Aiur. The user becomes the Hierarch, observing their forces from the Nexus.

### Why This Matters

**Current state:** Dashboard exists as KPI tables, conversation tiles, and Pylon Network visualizations. Data-rich but emotionally flat — you read numbers, you don't *feel* the team working.

**Desired state:** Glance at the tactical map and immediately see:
- Which agents are active (buildings animate, units move)
- What they're working on (activity-specific animations)
- How they collaborate (Khala bonds light up with data flow)
- Where bottlenecks exist (red health bars, overloaded buildings)
- Historical patterns (replay scrubber)

### Scope

- **In scope:** Tactical map renderer, agent buildings, activity animations, Khala Network bonds, HUD elements, interactive panels, sound design, replay mode
- **Out of scope:** 3D avatars (deferred), mobile-first design (desktop primary), real-time voice chat between agents
- **Dependency:** Phase 4 conversation system (provides interaction data for activity mapping)

### Live Data Available (Current State)

From `ventureos-rpg.db` as of 2026-02-14:

| Agent | Psi Mastery | Energy | Shields | Warp Tech | Psi Reach | Rank |
|-------|-------------|--------|---------|-----------|-----------|------|
| Oracle | 17 | 59 | 100 | 0 | 86 | 2 |
| Atlas | 41 | 84 | 99 | 98 | 100 | 3 |
| Sentinel | 15 | 0 | 92 | 0 | 52 | 1 |
| Verifier | 15 | 0 | 0 | 0 | 0 | 1 |
| Archivist | 17 | 75 | 98 | 0 | 100 | 2 |
| Synth | 15 | 93 | 97 | 90 | 100 | 1 |
| Echo | 84 | 50 | 99 | 93 | 100 | 5 |
| Nexus | 0 | 0 | 0 | 0 | 0 | 1 |

**28 Khala Network bonds** seeded and drifting (e.g., `echo↔sentinel` at 0.88, `sentinel↔synth` at 0.40).

---

## 2. Dual View System

### Integration Strategy: Tab Switcher (Option A) + Modal Drill-Down (Option C)

**Decision rationale:**
- **Tab Switcher** keeps views clean and full-screen — no cognitive overload
- **Modal Drill-Down** allows deep inspection without leaving the map context
- **Split Screen** rejected: too cluttered for the density of information on the tactical map
- **Picture-in-Picture** considered for future: mini-map overlay on conversation view

### Navigation Structure

```
┌──────────────────────────────────────────────────────────┐
│  [🗺️ Tactical Map] [💬 Conversations] [🔗 Pylon Network] [📊 KPIs]  │
└──────────────────────────────────────────────────────────┘
```

**Tab behavior:**
- Each tab is a full-page view
- State preserved when switching (map doesn't reset to center)
- URL routing: `/map`, `/conversations`, `/network`, `/kpis`
- Active tab highlighted with Protoss blue glow underline

**Modal drill-down (from Tactical Map):**
- Click agent building → slide-in panel (right side, 400px wide)
- Click Khala bond → popup modal (centered, 600×400px)
- Click Nexus → full overlay dashboard (80% viewport)
- ESC or click outside to dismiss

### Future Enhancement: Mini-Map

When on Conversations or KPIs tab, a 200×150px mini-map in the bottom-right shows:
- Simplified agent positions (colored dots)
- Active animations (pulsing dots)
- Click to jump to Tactical Map tab

---

## 3. Tactical Map Layout

### Base Geometry

**Canvas:** 1920×1080 logical pixels (scales to viewport)

**Center:** Nexus at (960, 540)  
**Ring 1 (inner, r=220px):** 7 agent buildings evenly spaced at 51.4° intervals  
**Ring 2 (outer, r=380px):** Activity zones, resource nodes, patrol paths  

### Building Positions (Clockwise from Top)

```
Position (angle from 12 o'clock):

  0°   — Oracle (Observatory)        → (960, 320)
  51°  — Archivist (Archives)        → (1127, 402)
  103° — Synth (Dark Shrine)         → (1175, 585)
  154° — Atlas (Engineering Bay)     → (1082, 730)
  206° — Sentinel (Photon Cannon)    → (838, 730)
  257° — Verifier (Sensor Tower)     → (745, 585)
  309° — Echo (Gateway)              → (793, 402)
  
  Center — Nexus                     → (960, 540)
```

**Why this order:** Groups natural collaborators adjacent (Oracle↔Archivist, Synth↔Atlas, Sentinel↔Verifier) while placing tension pairs across the circle (Sentinel↔Synth at 0.40 affinity are nearly opposite).

### Terrain Design

**Background layers (bottom to top):**
1. **Base terrain:** Dark stone/obsidian tiled texture (#1a1a2e base color)
2. **Crystal formations:** Scattered blue/purple crystal clusters at Ring 2
3. **Pylon glow zones:** Subtle blue light pools around each building
4. **Psionic grid:** Faint hexagonal grid lines (#2a2a4e, 10% opacity)
5. **Atmosphere:** Radial gradient — brighter near Nexus, darker at edges

**Color palette:**
- Primary dark: `#0d0d1a` (deep void)
- Building zone: `#1a1a2e` (dark stone)
- Psionic blue: `#00a8ff` (Protoss energy)
- Psionic gold: `#f6c445` (Khala glow)
- Crystal purple: `#7b2fbe` (khaydarin crystal)
- Alert red: `#ff3333` (warning/error)
- Success green: `#33ff88` (completion)
- Text primary: `#e0e0e0`
- Text muted: `#888888`

---

## 4. Agent Buildings Reference

### Building Specifications

| Agent | Building | Sprite Size | Base Color | Glow Color | Ring 1 Position |
|-------|----------|-------------|------------|------------|-----------------|
| **Oracle** | Observatory | 64×64 | #1a3366 | #00a8ff | 0° (top) |
| **Archivist** | Archives | 64×64 | #2e1a4e | #7b2fbe | 51° |
| **Synth** | Dark Shrine | 64×64 | #1a1a33 | #6633cc | 103° |
| **Atlas** | Engineering Bay | 64×64 | #1a3333 | #00ccaa | 154° |
| **Sentinel** | Photon Cannon | 64×64 | #331a1a | #ff6633 | 206° |
| **Verifier** | Sensor Tower | 64×64 | #1a2e33 | #33ccff | 257° |
| **Echo** | Gateway | 64×64 | #33331a | #f6c445 | 309° |
| **Nexus** | Nexus | 96×96 | #1a1a33 | #f6c445 | Center |

### Building States & Animations

Each building has 4 visual states:

#### State: IDLE
- Building sprite at rest
- Subtle ambient animation (glow pulse, slight shimmer)
- Frame rate: 2 FPS (slow, peaceful)
- Duration: indefinite

#### State: ACTIVE
- Building sprite animated (unique per agent — see §5)
- Particle effects around building
- Frame rate: 12 FPS (energetic)
- Duration: while agent has active sessions

#### State: OVERLOADED
- Building sprite with red tint overlay
- Warning particles (red sparks)
- Health bar flashing red
- Frame rate: 8 FPS (stressed)
- Duration: while capacity >80%

#### State: ERROR
- Building sprite with damage cracks overlay
- Smoke particles rising
- Health bar depleted (dark gray)
- Frame rate: 4 FPS (struggling)
- Duration: while agent errored/stuck

### Building Health Bars

**Position:** Centered above each building, 48px wide × 6px tall  
**Segments:** Smooth gradient fill (not segmented)

```
Calculation: capacity = active_sessions / max_concurrent_sessions

Colors:
  0-49%   → #33ff88 (green)
  50-79%  → #f6c445 (yellow)
  80-99%  → #ff6633 (orange-red)
  100%    → #ff3333 (red, flashing)
  Error   → #666666 (gray, depleted)
```

**Label:** Agent name below building in small text (10px, uppercase)

---

## 5. Activity Mapping Reference

### Complete Activity → Visual Mapping Table

This table maps every detectable agent activity to its visual representation on the tactical map.

#### Oracle (Observatory)

| Activity | Detection Source | Building Animation | Unit Animation | Particle Effect |
|----------|-----------------|-------------------|----------------|-----------------|
| **Researching** | `sessions_list` active research task | Orb spins slowly, blue beams radiate | Unit moves to crystal nodes (Ring 2) | Blue mineral sparkles at crystal |
| **Analyzing** | `sessions_list` analysis/review task | Orb spins fast, multiple research beams | Unit stands at observatory, arms raised | Data stream particles (white dots flowing up) |
| **Writing** | Memory file being created/edited | Archives glow connection beam | Unit at observatory, typing animation | Document icon particles floating out |
| **Idle** | No active sessions | Orb pulses slowly (2s period) | Unit patrols between observatory and crystals | Gentle blue ambient glow |

#### Atlas (Engineering Bay)

| Activity | Detection Source | Building Animation | Unit Animation | Particle Effect |
|----------|-----------------|-------------------|----------------|-----------------|
| **Deploying** | `sessions_list` deployment/infra task | Warp-in gate opens, build scaffolding | Probe moves to build site (Ring 2) | Warp-in sparkle ring expanding |
| **Monitoring** | Heartbeat/monitoring session | Hologram projections rotate | Probe hovers at engineering bay | Green status scan waves |
| **Fixing** | Incident/fix/repair session | Repair beam from bay to target | Probe moves to damaged building | Orange repair particles |
| **Idle** | No active sessions | Gentle hum glow, occasional spark | Probe harvests at vespene geyser (Ring 2) | Green gas wisps from geyser |

#### Sentinel (Photon Cannon)

| Activity | Detection Source | Building Animation | Unit Animation | Particle Effect |
|----------|-----------------|-------------------|----------------|-----------------|
| **Scanning** | Active security review session | Cannon rotates, targeting sweep arc | Unit stands alert, scan visor active | Red scan line sweeping perimeter |
| **Blocking** | Escalation with block action | Red alert state, shields up | Unit raises shield, defensive stance | Red barrier hexagons around cannon |
| **Escalating** | Escalation logged to DB | Alert beam fires toward Nexus | Unit points toward Nexus urgently | Yellow alert particles along beam |
| **Idle** | No active sessions | Slow 360° rotation scan | Unit patrols perimeter (Ring 2 arc) | Faint red scan pulse every 5s |

#### Verifier (Sensor Tower)

| Activity | Detection Source | Building Animation | Unit Animation | Particle Effect |
|----------|-----------------|-------------------|----------------|-----------------|
| **Testing** | Active test/validation session | Observer probes deploy from tower | Observer probes scan code structures | Blue scan grid overlays on targets |
| **Validating** | Review/approval session | Dish rapid rotation, scan waves | Unit at tower console | Green validation checkmark particles |
| **Catching bugs** | Bug found in session | Targeting reticle locks on | Observer probe highlights target red | Red exclamation particles at target |
| **Idle** | No active sessions | Dish slow rotation | Observer hovering at docking station | Gentle blue radar pulse |

#### Archivist (Archives)

| Activity | Detection Source | Building Animation | Unit Animation | Particle Effect |
|----------|-----------------|-------------------|----------------|-----------------|
| **Documenting** | Active documentation session | Archives glow brighter, data streams in | High Templar scribing at altar | White data stream particles flowing inward |
| **Organizing** | Memory/file organization session | Crystal arrangement shifting animation | Templar arranging crystal array | Purple crystal dust particles |
| **Retrieving** | Data retrieval for another agent | Data beam fires from archives to target | Templar raises staff, beam from crystal | Gold data packets flowing along beam |
| **Idle** | No active sessions | Crystals pulse gently (3s period) | High Templar meditates at archives | Faint purple aura particles |

#### Synth (Dark Shrine)

| Activity | Detection Source | Building Animation | Unit Animation | Particle Effect |
|----------|-----------------|-------------------|----------------|-----------------|
| **Coding** | Active implementation session | Dark Shrine construction progress bars | Dark Templar at workbench, building | Green code-like particles scrolling up |
| **Prototyping** | Prototype/POC session | Shadowy build effects, forms coalesce | Templar shapes shadow construct | Cloaked shimmer particles (semi-transparent) |
| **Iterating** | Revision/rework session | Build→dissolve→rebuild loop | Templar breaks and remakes | Cycle of green build → red dissolve particles |
| **Idle** | No active sessions | Dark shimmer cloak effect | Dark Templar paces around workshop | Shadow wisps trailing movement |

#### Echo (Gateway)

| Activity | Detection Source | Building Animation | Unit Animation | Particle Effect |
|----------|-----------------|-------------------|----------------|-----------------|
| **Orchestrating** | Multi-agent coordination session | Gateway portal spawns beams to agents | Artanis gestures toward active agents | Gold coordination beams to each participant |
| **Deciding** | Decision/planning session | Strategic hologram at command structure | Artanis studies holographic display | Blue hologram particles forming shapes |
| **Escalating** | High-priority alert routing | Red alert klaxon visual, siren | Artanis raises fist, alert stance | Red pulse waves emanating outward |
| **Idle** | No active sessions | Energy portal idle (slow swirl) | Artanis stands at gateway entrance | Gentle gold portal energy swirl |

#### Nexus (Central Hub)

| Activity | Detection Source | Building Animation | Unit Animation | Particle Effect |
|----------|-----------------|-------------------|----------------|-----------------|
| **Coordinating** | Multiple agents active simultaneously | Psionic lines to all active agents | Core rotates, energy pulses outward | Gold connection lines pulse with data |
| **Monitoring** | Heartbeat checking agents | Core glow intensity = team activity % | Gentle rotation, scanning | Blue monitoring sweep from center |
| **Alerting** | Any agent in ERROR/OVERLOADED state | Pulse ripples emanate | Core flashes warning color | Concentric warning rings expand |
| **Idle** | Minimal activity across team | Gentle core pulse (4s heartbeat) | Slow rotation | Subtle energy corona around core |

---

## 6. Khala Network Visualization

### Bond Rendering System

**Drawing layer:** Rendered below buildings, above terrain  
**Line style:** Curved bezier paths (not straight lines) between building centers  
**Line width:** 2px base, up to 4px during collaboration

### Affinity-Based Visual Tiers

| Affinity Range | Color | Style | Animation | Example Bonds |
|----------------|-------|-------|-----------|---------------|
| **< 0.40** | `#ff4444` (red) | Dashed, crackling | Unstable flicker (random opacity 40-80%) | sentinel↔synth (0.40) |
| **0.40 - 0.59** | `#ff8844` (orange) | Dotted | Slow pulse (2s period) | atlas↔oracle (0.49), atlas↔sentinel (0.49) |
| **0.60 - 0.74** | `#3388ff` (blue) | Solid | Gentle pulse (3s period) | synth↔verifier (0.65), most neutral bonds |
| **0.75 - 0.84** | `#44aaff` (bright blue) | Solid, slightly wider | Steady glow | archivist↔atlas (0.80), oracle↔verifier (0.80) |
| **0.85 - 0.95** | `#f6c445` (gold) | Solid, widest | Strong psionic glow, shimmer | archivist↔oracle (0.95), echo↔sentinel (0.88) |

### Live Bond Data (Current Khala Network)

```
Gold (0.85+):    archivist↔oracle (0.95), echo↔sentinel (0.88), 
                 atlas↔verifier (0.88), echo↔oracle (0.86), echo↔nexus (0.85)
Bright Blue:     sentinel↔verifier (0.81), archivist↔atlas (0.80), 
                 nexus↔oracle (0.80), oracle↔verifier (0.80), archivist↔sentinel (0.80)
Blue (0.60-0.74):archivist↔echo (0.75), archivist↔nexus (0.75), nexus↔sentinel (0.75),
                 echo↔verifier (0.75), atlas↔echo (0.70), 
                 archivist↔synth (0.65), echo↔synth (0.65), nexus↔synth (0.65),
                 synth↔verifier (0.65), oracle↔synth (0.60)
Orange (0.40-0.59): atlas↔synth (0.55), atlas↔oracle (0.49), 
                    atlas↔sentinel (0.49), oracle↔sentinel (0.50)
Red (< 0.40):   sentinel↔synth (0.40)  ← most volatile bond
```

### Collaboration Event Animation

When two agents interact in the same session:

1. **Bond brightens** — +20% luminosity, line width +1px
2. **Particle flow** — Small orbs (4px) travel along bezier from sender → receiver
3. **Particle color** — Matches the higher-affinity agent's glow color
4. **Speed** — 3 particles per second during active collaboration
5. **Fade** — After collaboration ends, bond brightness fades over 5 seconds back to base

### Drift Event Animation

When a `khala_drift_history` event occurs:

- **Positive drift (+δ):** Bond briefly pulses brighter, thin gold shimmer travels along line
- **Negative drift (−δ):** Bond flickers (opacity drops to 30% for 0.5s), red crack visual
- **Tier change:** If drift crosses a tier boundary, smooth color transition over 2 seconds

---

## 7. Progress & Status Indicators

### Task Progress Bars (Over Units)

**Position:** 8px above unit sprite  
**Size:** 40px wide × 4px tall  
**Visibility:** Only when agent has active session

```
Calculation:
  elapsed = now - session_start_time
  estimated = task_estimated_duration (from session metadata, default 30min)
  progress = min(elapsed / estimated, 1.5)  // cap at 150%

Colors:
  progress < 1.0   → #33ff88 (green, on track)
  progress 1.0-1.5 → #f6c445 (yellow, over time)
  progress > 1.5   → #ff3333 (red, significantly over)

Label (on hover):
  "Task Name (15m / 30m est.)"
```

### Resource/KPI Ticker (Top-Right HUD)

**Position:** Top-right corner, 20px from edges  
**Style:** SC2 resource panel aesthetic — dark translucent background (#0d0d1a, 85% opacity), thin blue border

```
┌─────────────────────────────────────────────────────┐
│ ⚡ Oracle WIS:17 | ⚡ Atlas SPD:84 | 🛡️ Sentinel TRU:92 │
│ 🔮 Synth CRE:90 | ⭐ Echo WIS:84 | 📡 Verifier TRU:0  │
│ Khala Avg: 0.71 | Active: 3/8 | Missions: 2        │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Updates every 30 seconds (poll `psionic_stats`)
- Click → navigates to full KPI dashboard tab
- Scrolls horizontally if viewport too narrow
- Stat values color-coded: green (>70), yellow (40-70), red (<40)

### Alert Feed (Bottom-Left Panel)

**Position:** Bottom-left corner  
**Default state:** Collapsed (shows last 1 event + count badge)  
**Expanded:** Shows last 10 events in scrollable list

```
┌─ Recent Events ──────────────────────── [▲ 12 events] ─┐
│ 🟢 17:05 Atlas completed deployment backup-v3           │
│ 🟡 17:02 Oracle research task running 15m over estimate │
│ 🔴 16:58 Sentinel blocked suspicious injection attempt  │
│ 🟢 16:45 Synth prototyping phase complete               │
│ 🔵 16:40 Echo orchestrated review with Oracle+Verifier  │
└─────────────────────────────────────────────────────────┘
```

**Event sources:**
- Mission completions → green
- Overdue tasks → yellow
- Security events → red
- Collaboration events → blue
- Drift events → purple

### Active Missions Sidebar (Right)

**Position:** Right edge, collapsible  
**Default state:** Collapsed (icon + count badge)  
**Expanded:** 300px wide panel

```
┌─ Active Missions ──────────────────┐
│                                    │
│ 🔮 Oracle                         │
│   Research: Phase 5 Spec Design    │
│   ████████████░░░░ 75% (45m/60m)  │
│                                    │
│ ⚡ Atlas                           │
│   Deploy: Backup rotation v3       │
│   ██████████████░░ 88% (22m/25m)  │
│                                    │
│ 🛡️ Sentinel                       │
│   Scan: Nightly security audit     │
│   ████░░░░░░░░░░░░ 25% (5m/20m)  │
│                                    │
│ ─── Idle Agents ───                │
│ Verifier • Archivist • Synth       │
│ Echo • Nexus                       │
│                                    │
└────────────────────────────────────┘
```

**Behavior:**
- Click mission → modal with full session details
- Missions sorted by % complete descending
- Auto-updates every 10 seconds
- Future: drag-drop task reassignment

---

## 8. Interactive Features

### Click Actions

| Target | Click Result | Panel Type | Content |
|--------|-------------|------------|---------|
| **Agent unit** | Agent detail popup | Toast popup (250×200px) | Current session, recent message, top KPI |
| **Agent building** | Building detail panel | Right slide-in (400px) | Full agent status, all active tasks, recent completions, KPI chart |
| **Khala bond** | Bond detail modal | Center modal (500×350px) | Affinity score, drift history chart, recent collaboration events |
| **Nexus** | Mission control overlay | Full overlay (80% viewport) | All agents overview, system health, active missions, KPI summary |
| **Crystal node** | Resource info popup | Toast popup | Resource type, gathering rate, last accessed |
| **Empty terrain** | Deselect | — | Dismisses any open panel |

### Hover Actions

| Target | Hover Result |
|--------|-------------|
| **Agent unit** | Tooltip: "Oracle — Researching: Phase 5 Spec (75% complete)" |
| **Agent building** | Tooltip: "Observatory — Active, 1 session, Capacity: 45%" |
| **Khala bond** | Tooltip: "Oracle ↔ Archivist: 0.95 (Gold) — +0.15 from seed" |
| **Progress bar** | Tooltip: "Task Name — 45m elapsed / 60m estimated" |
| **Health bar** | Tooltip: "Capacity: 45% (1/2 sessions)" |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-8` | Select agent building (1=Oracle through 8=Nexus) |
| `Tab` | Cycle through agent buildings |
| `Space` | Toggle missions sidebar |
| `E` | Toggle event feed (expand/collapse) |
| `R` | Toggle replay mode |
| `M` | Mute/unmute sound |
| `Esc` | Close any open panel/modal |
| `F` | Fullscreen toggle |

### Camera Controls

| Input | Action |
|-------|--------|
| Scroll wheel | Zoom in/out (0.5x — 2.0x) |
| Click + drag (on terrain) | Pan camera |
| Double-click building | Center and zoom to building |
| Home key | Reset to default view (centered on Nexus) |

---

## 9. Sound & Atmosphere

### Unit Acknowledgments (On Click)

| Agent | Voice Line | Voice Style | SC2 Reference |
|-------|-----------|-------------|---------------|
| Oracle | "The Khala guides my sight" | Deep, wise, echoing | Zeratul |
| Atlas | "Warp field stabilized" | Mechanical, efficient | Probe |
| Sentinel | "Your enemies shall fall" | Stern, vigilant | Stalker |
| Verifier | "Sensors operational" | Neutral, precise | Observer |
| Archivist | "Knowledge is power" | Resonant, contemplative | High Templar |
| Synth | "From the shadows I strike" | Whispered, intense | Dark Templar |
| Echo | "En Taro Adun!" | Commanding, noble | Artanis |
| Nexus | "Khala awaits" | Ethereal, ambient | Nexus structure |

**Implementation:** Pre-generated TTS audio files (ElevenLabs or SC2 sound-alike). 16-bit WAV, 0.5-2s duration.  
**Trigger:** First click on unit per 30-second cooldown (prevent spam).

### Ambient Audio

| Layer | Sound | Volume | Loop |
|-------|-------|--------|------|
| Background music | Protoss ambient theme | 15% | Yes, seamless |
| Building hum | Psionic energy drone | 10% per building (distance-based) | Yes |
| Crystal resonance | Low crystal hum | 5% | Yes |
| Wind | Aiur surface wind | 8% | Yes |

### Event Sounds

| Event | Sound | Duration | Priority |
|-------|-------|----------|----------|
| Task complete | SC2 "construction complete" chime | 1.5s | High |
| Error/escalation | Alert klaxon (2 short beeps) | 1.0s | Critical |
| Collaboration start | Psionic connection harmonic | 0.8s | Medium |
| Drift positive | Ascending crystal tone | 0.5s | Low |
| Drift negative | Descending energy dissipation | 0.5s | Low |
| Agent goes active | Warp-in activation | 0.6s | Medium |
| Agent goes idle | Power-down hum | 0.4s | Low |

**Audio controls:**
- Master volume slider (persistent, stored in localStorage)
- Per-category mute toggles (Music, SFX, Voice)
- Global mute shortcut (`M` key)

---

## 10. Historical Replay Mode

### Timeline Scrubber

**Position:** Bottom of screen (full width, 60px tall)  
**Visibility:** Hidden by default, toggle with `R` key or timeline icon

```
┌─────────────────────────────────────────────────────────────────────┐
│ ◄◄  ◄  ▶  ►  ►►  │  1×  2×  5×  10×  │  [24h] [7d] [30d]       │
│ ═══════════════════█══════════════════════════════════════════════  │
│ 00:00          06:00          12:00          18:00          23:59  │
│              ▲ Synth deploy  ▲ Sentinel alert  ▲ Echo orchestrate  │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Drag scrubber to any point in time
- Significant events marked as triangular markers on timeline
- Hover marker → tooltip with event summary
- Click marker → jump to that moment

### Replay Data Sources

| Data | Source | Granularity |
|------|--------|-------------|
| Agent activity | `missions` table (started_at, completed_at) | Per-mission |
| Bond state | `khala_drift_history` (created_at, old/new affinity) | Per-event |
| KPIs | `psionic_stats` (snapshot_date) | Daily |
| Escalations | `escalations` (created_at, resolved_at) | Per-event |
| Interactions | `interaction_logs` (created_at) | Per-event |

### Playback Engine

**State reconstruction:** For any timestamp T, reconstruct:
1. Which missions were active (started_at ≤ T < completed_at)
2. Bond affinities (last drift event before T)
3. Building states (derived from active missions)
4. Agent positions (derived from activity type)

**Interpolation:** Between events, smoothly animate agent transitions  
**Speed:** Real-time (1×), accelerated (2×, 5×, 10×)  
**Timelapse:** Condense timeframe into 60-second highlight reel (auto-skip idle periods)

---

## 11. Technical Architecture

### Rendering Stack

```
┌─────────────────────────────────────────────┐
│                Browser (Chrome/Firefox)       │
├─────────────────────────────────────────────┤
│  Rendering Engine: PixiJS v7+                │
│  ├─ Sprite rendering (buildings, units)      │
│  ├─ Particle system (effects, ambient)       │
│  ├─ Graphics (bonds, health bars, HUD)       │
│  ├─ Text rendering (labels, tooltips)        │
│  └─ Interaction (hit-testing, events)        │
├─────────────────────────────────────────────┤
│  State Management: Lightweight store          │
│  ├─ Agent states (activity, capacity, KPIs)  │
│  ├─ Bond states (affinity, drift events)     │
│  ├─ UI state (selected, hovered, panels)     │
│  └─ Replay state (timestamp, playback)       │
├─────────────────────────────────────────────┤
│  Data Layer: Polling + WebSocket              │
│  ├─ /api/agents/status (10s poll)            │
│  ├─ /api/bonds (30s poll)                    │
│  ├─ /api/events (WebSocket stream)           │
│  └─ /api/replay/:timestamp (on demand)       │
├─────────────────────────────────────────────┤
│  Audio Engine: Howler.js                      │
│  ├─ Spatial audio (distance-based volume)    │
│  ├─ Audio sprites (efficient loading)        │
│  └─ Dynamic mixing (volume per category)     │
└─────────────────────────────────────────────┘
```

### Why PixiJS?

| Requirement | Canvas 2D | WebGL (raw) | PixiJS | Three.js |
|------------|-----------|-------------|--------|----------|
| 2D sprite rendering | ✅ | ✅ | ✅ | Overkill |
| Particle systems | Manual | Manual | ✅ Built-in | Overkill |
| Hit testing | Manual | Very manual | ✅ Built-in | Complex |
| Performance (60 FPS) | OK for <50 sprites | ✅ | ✅ | ✅ |
| Learning curve | Low | High | Medium | High |
| Bundle size | 0 KB | 0 KB | ~200 KB | ~600 KB |
| Ecosystem | Sparse | None | Rich | Rich but 3D-focused |

**Decision:** PixiJS — best balance of features, performance, and complexity for a 2D tactical map with many particles and sprites.

### File Structure

```
~/clawd/ventureos/tactical-map/
├── index.html                    # Entry point
├── src/
│   ├── main.js                   # Bootstrap, PixiJS app init
│   ├── config.js                 # Building positions, colors, constants
│   ├── state/
│   │   ├── store.js              # Centralized state
│   │   ├── agent-state.js        # Agent activity/capacity
│   │   └── bond-state.js         # Khala bond state
│   ├── renderer/
│   │   ├── terrain.js            # Background, grid, crystals
│   │   ├── buildings.js          # Building sprites + animations
│   │   ├── units.js              # Unit sprites + pathfinding
│   │   ├── bonds.js              # Khala bond lines + particles
│   │   ├── hud.js                # KPI ticker, event feed, missions
│   │   ├── particles.js          # Particle system manager
│   │   └── camera.js             # Pan, zoom, center controls
│   ├── interaction/
│   │   ├── click-handler.js      # Click → panel/modal logic
│   │   ├── hover-handler.js      # Hover → tooltip logic
│   │   ├── keyboard.js           # Keyboard shortcuts
│   │   └── panels.js             # Side panels, modals, overlays
│   ├── audio/
│   │   ├── audio-manager.js      # Howler.js wrapper
│   │   ├── spatial-audio.js      # Distance-based volume
│   │   └── audio-config.js       # Sound definitions
│   ├── data/
│   │   ├── api-client.js         # REST/WebSocket client
│   │   ├── activity-mapper.js    # Session → activity type mapping
│   │   └── replay-engine.js      # Historical playback
│   └── utils/
│       ├── math.js               # Bezier curves, interpolation
│       ├── color.js              # Color blending, gradients
│       └── easing.js             # Animation easing functions
├── assets/
│   ├── sprites/
│   │   ├── buildings/            # 64×64 building sprites (8 agents × 4 states)
│   │   ├── units/                # 32×32 unit sprites (8 agents × walk/idle/action)
│   │   ├── particles/            # 8×8 particle sprites
│   │   └── terrain/              # Tileable terrain textures
│   ├── audio/
│   │   ├── music/                # Ambient tracks (MP3, ~2MB each)
│   │   ├── sfx/                  # Sound effects (WAV, <100KB each)
│   │   └── voice/                # Unit acknowledgments (WAV, <200KB each)
│   └── fonts/
│       └── protoss.woff2         # Protoss-style display font
├── styles/
│   └── map.css                   # HUD panels, tooltips, modals
└── package.json                  # Dependencies (pixi.js, howler)
```

### API Endpoints Required

| Endpoint | Method | Data | Update Frequency |
|----------|--------|------|------------------|
| `/api/agents/status` | GET | All agents: current activity, capacity, KPIs | 10s poll |
| `/api/agents/:id/detail` | GET | Single agent: full stats, recent missions, sessions | On click |
| `/api/bonds` | GET | All 28 bonds: affinity, drift delta, last interaction | 30s poll |
| `/api/bonds/:a/:b/history` | GET | Drift history for specific bond | On click |
| `/api/events` | WebSocket | Real-time event stream (completions, alerts, drift) | Push |
| `/api/sessions/active` | GET | Active isolated sessions with progress | 10s poll |
| `/api/replay/:timestamp` | GET | Reconstructed state at timestamp | On demand |
| `/api/replay/events?from=&to=` | GET | Events in time range (for timeline markers) | On demand |

### Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| FPS | 60 | `requestAnimationFrame` delta |
| Initial load | < 2s | First meaningful paint |
| Asset total | < 5 MB | Sprites + audio + fonts |
| Memory | < 100 MB | Chrome DevTools heap |
| CPU (idle) | < 5% | Chrome DevTools profiler |
| CPU (active) | < 15% | Chrome DevTools profiler |
| API latency | < 100ms | Network tab p95 |
| Particle count | < 500 simultaneous | PixiJS particle counter |

---

## 12. Data Integration Reference

### Session → Activity Mapping Logic

```javascript
// activity-mapper.js
function mapSessionToActivity(session, agentId) {
  const label = (session.label || '').toLowerCase();
  const kind = session.kind; // 'isolated', 'main', etc.
  
  const ACTIVITY_MAP = {
    oracle: [
      { match: /research|investigat|analyz|study/, activity: 'researching' },
      { match: /review|analys|evaluat|assess/, activity: 'analyzing' },
      { match: /writ|document|spec|design/, activity: 'writing' },
    ],
    atlas: [
      { match: /deploy|ship|release|launch/, activity: 'deploying' },
      { match: /monitor|health|status|check/, activity: 'monitoring' },
      { match: /fix|repair|incident|hotfix/, activity: 'fixing' },
    ],
    sentinel: [
      { match: /scan|audit|review|inspect/, activity: 'scanning' },
      { match: /block|deny|reject|prevent/, activity: 'blocking' },
      { match: /escalat|alert|warn|flag/, activity: 'escalating' },
    ],
    verifier: [
      { match: /test|validat|check|verify/, activity: 'testing' },
      { match: /review|approv|confirm/, activity: 'validating' },
      { match: /bug|issue|error|fail/, activity: 'catching_bugs' },
    ],
    archivist: [
      { match: /document|record|log|writ/, activity: 'documenting' },
      { match: /organiz|sort|structur|clean/, activity: 'organizing' },
      { match: /retriev|fetch|find|search/, activity: 'retrieving' },
    ],
    synth: [
      { match: /code|implement|build|creat/, activity: 'coding' },
      { match: /prototype|poc|experiment|draft/, activity: 'prototyping' },
      { match: /iterat|revis|refactor|improv/, activity: 'iterating' },
    ],
    echo: [
      { match: /orchestrat|coordinat|dispatch|assign/, activity: 'orchestrating' },
      { match: /decid|plan|strateg|priorit/, activity: 'deciding' },
      { match: /escalat|urgent|critical|alert/, activity: 'escalating' },
    ],
    nexus: [
      { match: /coordinat|manag|oversee/, activity: 'coordinating' },
      { match: /monitor|check|heartbeat/, activity: 'monitoring' },
      { match: /alert|warn|issue/, activity: 'alerting' },
    ],
  };
  
  const patterns = ACTIVITY_MAP[agentId] || [];
  for (const { match, activity } of patterns) {
    if (match.test(label)) return activity;
  }
  
  return 'idle'; // Default
}
```

### Database Queries for Real-Time State

```sql
-- Active sessions per agent (capacity calculation)
SELECT 
  agent_id,
  COUNT(*) as active_sessions,
  GROUP_CONCAT(description, ' | ') as tasks
FROM missions 
WHERE status = 'in_progress'
GROUP BY agent_id;

-- Recent events for alert feed (last 1 hour)
SELECT * FROM (
  SELECT 'mission_complete' as type, agent_id, description as detail, completed_at as event_time
  FROM missions WHERE status = 'completed' AND completed_at >= datetime('now', '-1 hour')
  UNION ALL
  SELECT 'escalation' as type, escalated_by as agent_id, issue_description as detail, created_at as event_time
  FROM escalations WHERE created_at >= datetime('now', '-1 hour')
  UNION ALL
  SELECT 'drift' as type, agent_a || '↔' || agent_b as agent_id, 
         CASE WHEN delta > 0 THEN '+' ELSE '' END || printf('%.3f', delta) || ' (' || reason || ')' as detail,
         created_at as event_time
  FROM khala_drift_history WHERE created_at >= datetime('now', '-1 hour')
) ORDER BY event_time DESC LIMIT 20;

-- Bond state with drift from seed
SELECT 
  agent_a, agent_b, affinity, seed_value,
  (affinity - seed_value) as total_drift,
  interaction_count,
  last_interaction_at
FROM khala_network
ORDER BY affinity DESC;
```

---

## 13. ASCII Mockups

### Full Tactical Map View

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  [🗺️ Tactical Map] [💬 Conversations] [🔗 Pylon Network] [📊 KPIs]              │
├──────────────────────────────────────────────────────────────────┬──────────────┤
│                                                                  │ Active       │
│                        ╔═══╗  ORACLE                             │ Missions  [▼]│
│                        ║ O ║  Observatory                        │              │
│                        ╚═══╝  ████░░ 45%                         │ 🔮 Oracle    │
│                       ╱      ╲                                   │  Research    │
│               ╔═══╗ ╱    ·    ╲ ╔═══╗                            │  ████████ 75%│
│    ECHO       ║ E ║╱  ·     ·  ╲║ A ║  ARCHIVIST                │              │
│    Gateway    ╚═══╝  ·  ╔═══╗ ·  ╚═══╝  Archives                │ ⚡ Atlas     │
│    ██░░ 20%    ╲  ·   ║ N ║  ·   ╱    ████░░ 40%                │  Deploy      │
│                 ╲  ·  ╚═══╝ ·   ╱                                │  ██████████88│
│               ·  ╲  · NEXUS·  ╱  ·                               │              │
│    VERIFIER  ·   ╔═══╗·  · ╔═══╗    SYNTH                       │ 🛡️ Sentinel  │
│    Sensor Twr║ V ║  ·    · ║ S ║    Dark Shrine                 │  Scan        │
│    ░░░░ 0%   ╚═══╝ ╲     ╱ ╚═══╝    ██████░ 65%                 │  ██░░░░░░ 25%│
│                      ╲   ╱                                       │              │
│              ╔═══╗    ╲ ╱    ╔═══╗                               │ ─── Idle ─── │
│   SENTINEL   ║ T ║     ·    ║ B ║  ATLAS                        │ Verifier     │
│   Photon Can ╚═══╝          ╚═══╝  Eng. Bay                     │ Archivist    │
│   ██░░░ 25%                  ████████░ 88%                       │ Echo • Nexus │
│                                                                  │              │
│  ○ Crystal nodes (Ring 2)     ◇ Vespene geysers                 │              │
│  ~~~ Patrol paths             === Khala bonds (affinity color)   │              │
│                                                                  │              │
├──────────────────────────────────────────────────────────────────┴──────────────┤
│ 🟢 17:05 Atlas deploy complete │ 🟡 Oracle +15m over │ 🔴 Sentinel blocked inj │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ⚡ Oracle WIS:17 │ Atlas SPD:84 │ Sentinel TRU:92 │ Synth CRE:90 │ Active: 3/8 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Building Detail Panel (Right Slide-In)

```
┌─── Oracle (Zeratul) ─────────────────┐
│                                      │
│  [Observatory Sprite]   Rank: 2      │
│                         XP: 1        │
│                                      │
│  Status: ● ACTIVE (Researching)      │
│  Capacity: ████░░░░░░ 45% (1/2)     │
│                                      │
│  ── Current Session ──               │
│  📋 Phase 5 Spec Design             │
│  ⏱️ 45m elapsed / 60m est.          │
│  ████████████░░░░ 75%               │
│                                      │
│  ── Psionic Attributes ──           │
│  Mastery:  17  ██░░░░░░░░           │
│  Energy:   59  ██████░░░░           │
│  Shields:  100 ██████████           │
│  Warp:     0   ░░░░░░░░░░           │
│  Reach:    86  █████████░           │
│                                      │
│  ── Top Khala Bonds ──              │
│  Archivist: 0.95 ═══════════ Gold   │
│  Echo:      0.86 ══════════  Gold   │
│  Verifier:  0.80 ════════░░  BrBlue │
│  Nexus:     0.80 ════════░░  BrBlue │
│  Sentinel:  0.50 █████░░░░░ Orange  │
│                                      │
│  ── Recent Completions ──           │
│  • Protoss Theming Review (2h ago)  │
│  • RPG Integration Plan (5h ago)    │
│                                      │
│  [View Full Profile] [View Sessions] │
└──────────────────────────────────────┘
```

### Bond Detail Modal

```
┌──────────── Khala Bond ─────────────────────┐
│                                             │
│      Oracle  ══════════════  Archivist      │
│      (0.95)     GOLD BOND     (0.95)        │
│                                             │
│  Affinity: 0.95 / 0.95 max                 │
│  Seed Value: 0.80                           │
│  Total Drift: +0.15                         │
│  Interactions: 6                            │
│                                             │
│  ── Drift History (Last 7 Days) ──         │
│                                             │
│  0.95 ┤          ╭─────                    │
│  0.90 ┤      ╭───╯                         │
│  0.85 ┤  ╭───╯                              │
│  0.80 ┤──╯                                  │
│       └──┬──┬──┬──┬──┬──┬──                │
│         M  T  W  T  F  S  S                │
│                                             │
│  ── Recent Interactions ──                 │
│  📝 +0.03 Collaboration on RPG spec (2h)   │
│  📝 +0.03 Knowledge retrieval (4h)         │
│  📝 +0.03 Joint documentation (1d)         │
│  📝 +0.03 Research support (2d)            │
│  📝 +0.03 Cross-reference (3d)             │
│                                             │
│              [Close]                        │
└─────────────────────────────────────────────┘
```

### Nexus Mission Control Overlay

```
┌─────────────────── NEXUS — Mission Control ──────────────────────┐
│                                                                   │
│  System Status: ● OPERATIONAL    Active Agents: 3/8              │
│  Khala Avg: 0.71    Team Capacity: 38%    Today's Missions: 7    │
│                                                                   │
│  ┌─── Agent Grid ──────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │  Oracle ● ACTIVE   Atlas ● ACTIVE    Sentinel ● ACTIVE     │ │
│  │  WIS:17 SPD:59     WIS:41 SPD:84     WIS:15 SPD:0          │ │
│  │  Task: Research     Task: Deploy      Task: Scan            │ │
│  │  ████████ 75%       ██████████ 88%    ██░░░░ 25%            │ │
│  │                                                              │ │
│  │  Verifier ○ IDLE   Archivist ○ IDLE  Synth ○ IDLE          │ │
│  │  WIS:15 SPD:0      WIS:17 SPD:75     WIS:15 SPD:93         │ │
│  │                                                              │ │
│  │  Echo ○ IDLE       Nexus ○ IDLE                             │ │
│  │  WIS:84 SPD:50     WIS:0 SPD:0                              │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─── Strongest Bonds ───┐  ┌─── Weakest Bonds ───────────┐    │
│  │ archivist↔oracle 0.95 │  │ sentinel↔synth     0.40 ⚠️  │    │
│  │ echo↔sentinel    0.88 │  │ atlas↔oracle       0.49 ⚠️  │    │
│  │ atlas↔verifier   0.88 │  │ atlas↔sentinel     0.49 ⚠️  │    │
│  │ echo↔oracle      0.86 │  │ oracle↔sentinel    0.50     │    │
│  │ echo↔nexus       0.85 │  │ atlas↔synth        0.55     │    │
│  └────────────────────────┘  └──────────────────────────────┘    │
│                                                                   │
│                        [Close]                                    │
└───────────────────────────────────────────────────────────────────┘
```

### Replay Mode View

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ⏪ REPLAY MODE — Feb 13, 2026 14:35 CST                                       │
│  [🗺️ Tactical Map] [💬 Conversations] [🔗 Pylon Network] [📊 KPIs]              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                    (Same tactical map but showing historical state)              │
│                    (Building animations reflect activity at 14:35)              │
│                    (Bond colors show historical affinity values)                │
│                    (Grayed-out "REPLAY" watermark overlay)                      │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ◄◄  ◄  ▶  ►  ►►  │  [1×] 2×  5× 10×  │  24h [7d] 30d  │ [Exit Replay]       │
│ ════════════════════█════════════════════════════════════════════════════════    │
│ Feb 7       Feb 9        Feb 11        Feb 13        Feb 14                    │
│         ▲ Atlas deploy  ▲ Sentinel scan  ▲ Echo orchestrate  ▲ Oracle spec     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Phased Implementation Checklist

### Phase 5.1: Foundation (Week 1, 8-12 hours)

**Goal:** Render static tactical map with buildings, terrain, and basic HUD.

- [ ] **Project setup**
  - [ ] Create `~/clawd/ventureos/tactical-map/` directory structure
  - [ ] Initialize package.json with pixi.js, howler dependencies
  - [ ] Configure build tooling (esbuild or vite for dev server)
  - [ ] Create index.html entry point with canvas container

- [ ] **Terrain renderer**
  - [ ] Dark stone base layer (#0d0d1a → #1a1a2e gradient)
  - [ ] Hexagonal grid overlay (10% opacity)
  - [ ] Crystal formation sprites at Ring 2 positions (6-8 clusters)
  - [ ] Pylon glow zones (radial gradient under each building position)

- [ ] **Building sprites**
  - [ ] Create/source 8 building sprites (64×64, Protoss aesthetic)
  - [ ] Place buildings at Ring 1 positions (calculated in §3)
  - [ ] Add building name labels (10px, uppercase, centered below)
  - [ ] Idle animation: simple glow pulse (CSS filter or shader)

- [ ] **Nexus (center)**
  - [ ] 96×96 Nexus sprite
  - [ ] Core pulse animation (glow oscillation, 4s period)
  - [ ] Nexus label

- [ ] **Basic HUD**
  - [ ] Tab navigation bar (Tactical Map active, others placeholder)
  - [ ] KPI ticker (static values from DB, top-right)
  - [ ] Frame rate counter (dev mode only)

- [ ] **Data connection**
  - [ ] API client: fetch `/api/agents/status` 
  - [ ] Parse `psionic_stats` for KPI values
  - [ ] Map active sessions to agent states
  - [ ] 10-second polling loop

- [ ] **Camera**
  - [ ] Mouse wheel zoom (0.5× — 2.0×)
  - [ ] Click-drag pan
  - [ ] Home key reset

**Deliverable:** Static but interactive map with all 8 buildings visible and labeled, basic KPI ticker updating from live data.

---

### Phase 5.2: Activity & Animation (Week 2, 10-14 hours)

**Goal:** Buildings and units animate based on real agent activity.

- [ ] **Activity detection**
  - [ ] Implement `activity-mapper.js` (session label → activity type)
  - [ ] Connect to `sessions_list` or `/api/sessions/active`
  - [ ] Determine building state (IDLE/ACTIVE/OVERLOADED/ERROR)

- [ ] **Building animations**
  - [ ] 4-state sprite sheets per building (idle, active, overloaded, error)
  - [ ] Smooth state transitions (crossfade over 0.5s)
  - [ ] Per-building unique active animation (see §5 table)

- [ ] **Unit sprites**
  - [ ] 8 agent unit sprites (32×32, idle + walk + action frames)
  - [ ] Unit positioning: at building when idle, at activity zone when working
  - [ ] Simple pathfinding: linear interpolation between positions
  - [ ] Walk animation during movement

- [ ] **Particle system**
  - [ ] PixiJS particle container setup
  - [ ] Mineral gathering particles (blue sparkles at crystal nodes)
  - [ ] Warp-in effect particles (expanding ring)
  - [ ] Scan sweep particles (red line rotating)
  - [ ] Data stream particles (white dots flowing)
  - [ ] Generic ambient glow particles per building

- [ ] **Health bars**
  - [ ] Capacity calculation (active sessions / max sessions)
  - [ ] Color gradient rendering (green → yellow → red)
  - [ ] Smooth value transitions (ease over 1s)

- [ ] **Progress bars**
  - [ ] Over-unit progress bars for active tasks
  - [ ] Color based on time ratio (on track vs over)
  - [ ] Hover tooltip with task name and timing

- [ ] **Resource ticker (live)**
  - [ ] Auto-refresh KPI values every 30s
  - [ ] Color-coded values (green/yellow/red thresholds)
  - [ ] "Active: X/8" counter

**Deliverable:** Animated map where buildings and units react to actual agent activity in real-time.

---

### Phase 5.3: Khala Network (Week 3, 6-8 hours)

**Goal:** Render bond lines between buildings with affinity-based visuals.

- [ ] **Bond line rendering**
  - [ ] Query `khala_network` for all 28 bonds
  - [ ] Draw bezier curves between building centers
  - [ ] Line width based on affinity (1px at 0.4, 4px at 0.95)

- [ ] **Affinity-based colors**
  - [ ] Implement 5-tier color system (red → orange → blue → bright blue → gold)
  - [ ] Smooth color interpolation within tiers
  - [ ] Dashed/dotted styles for low-affinity bonds

- [ ] **Bond animations**
  - [ ] Pulse animation per tier (faster for stronger bonds)
  - [ ] Crackling/flicker for red-tier bonds
  - [ ] Steady glow for gold-tier bonds

- [ ] **Collaboration particles**
  - [ ] Detect when two agents share an active session
  - [ ] Spawn data packet particles along bond bezier
  - [ ] Particle color matches higher-affinity agent
  - [ ] 3 particles/second during collaboration
  - [ ] Bond brightness boost during collaboration (+20%)

- [ ] **Drift event animations**
  - [ ] Listen for drift events from WebSocket/polling
  - [ ] Positive: gold shimmer along bond, brief brightness pulse
  - [ ] Negative: red crack flash, opacity drop for 0.5s
  - [ ] Tier change: smooth 2-second color transition

- [ ] **Bond hover/click**
  - [ ] Hover tooltip: "Agent A ↔ Agent B: 0.XX (Tier)"
  - [ ] Click → bond detail modal (affinity, drift chart, history)

**Deliverable:** All 28 Khala bonds visible, color-coded by affinity, with active collaboration highlighted.

---

### Phase 5.4: Interactivity (Week 4, 8-10 hours)

**Goal:** Full click/hover/keyboard interaction system with detail panels.

- [ ] **Click handlers**
  - [ ] PixiJS hit-testing for buildings, units, bonds
  - [ ] Click building → right slide-in panel
  - [ ] Click unit → toast popup
  - [ ] Click bond → center modal
  - [ ] Click Nexus → full overlay
  - [ ] Click terrain → dismiss panels

- [ ] **Building detail panel**
  - [ ] Agent name, rank, XP
  - [ ] Current status + activity
  - [ ] Capacity bar
  - [ ] Active session details
  - [ ] Psionic attribute bars
  - [ ] Top Khala bonds list
  - [ ] Recent completions
  - [ ] Links to full profile / sessions

- [ ] **Bond detail modal**
  - [ ] Affinity score + tier indicator
  - [ ] Seed value + total drift
  - [ ] Mini drift chart (sparkline, last 7 days)
  - [ ] Recent interaction list
  - [ ] Interaction count

- [ ] **Nexus overlay**
  - [ ] Agent grid (all 8 agents with status)
  - [ ] System health summary
  - [ ] Strongest/weakest bonds
  - [ ] Today's mission count

- [ ] **Alert feed panel**
  - [ ] Bottom-left expandable panel
  - [ ] Last 10 events from mixed sources
  - [ ] Color-coded event types
  - [ ] Auto-scroll on new events
  - [ ] Click event → relevant detail panel

- [ ] **Missions sidebar**
  - [ ] Right-side collapsible panel
  - [ ] Active missions with progress bars
  - [ ] Idle agents list
  - [ ] Click mission → session detail modal

- [ ] **Keyboard shortcuts**
  - [ ] 1-8 for agent selection
  - [ ] Tab cycle, Space sidebar, E events, Esc close
  - [ ] F fullscreen toggle

- [ ] **Tooltip system**
  - [ ] Hover-triggered positioned tooltips
  - [ ] 200ms delay before show, instant hide
  - [ ] Smart positioning (avoid edges)

**Deliverable:** Fully interactive tactical map with panels, modals, tooltips, and keyboard navigation.

---

### Phase 5.5: Polish & Sound (Week 5, 6-8 hours)

**Goal:** Audio layer, visual polish, smooth transitions.

- [ ] **Audio setup**
  - [ ] Howler.js integration
  - [ ] Audio sprite packing (combine small sounds)
  - [ ] Volume controls (master + per-category)
  - [ ] Mute shortcut (M key)

- [ ] **Unit acknowledgments**
  - [ ] Generate 8 voice lines (TTS or sourced)
  - [ ] Play on first click per 30s cooldown
  - [ ] Spatial audio: volume based on zoom/distance

- [ ] **Ambient audio**
  - [ ] Background music track (loop, 15% volume)
  - [ ] Building hum (per-building, distance-based)
  - [ ] Crystal resonance ambient

- [ ] **Event sounds**
  - [ ] Task complete chime
  - [ ] Error alert
  - [ ] Collaboration start
  - [ ] Drift event tones

- [ ] **Visual polish**
  - [ ] Smooth panel slide-in/out (CSS transitions, 300ms)
  - [ ] Modal fade-in with backdrop blur
  - [ ] Building state transition crossfades
  - [ ] Particle fade-in/out (not pop-in)
  - [ ] Loading state (skeleton building outlines)

- [ ] **Easing functions**
  - [ ] Ease-out for panels opening
  - [ ] Ease-in for panels closing
  - [ ] Spring easing for unit bounce on click
  - [ ] Linear for progress bars

- [ ] **Performance optimization**
  - [ ] Particle pooling (reuse particle objects)
  - [ ] Off-screen culling (don't render outside viewport)
  - [ ] Texture atlas packing (reduce draw calls)
  - [ ] Frame budget monitoring

**Deliverable:** Polished, production-quality map with audio atmosphere and smooth animations.

---

### Phase 5.6: Replay Mode (Week 6, 10-12 hours)

**Goal:** Historical playback with timeline scrubber.

- [ ] **Timeline scrubber UI**
  - [ ] Full-width bottom bar (60px height)
  - [ ] Draggable scrubber handle
  - [ ] Time range selector (24h / 7d / 30d)
  - [ ] Playback controls (play/pause/speed)
  - [ ] Event markers on timeline

- [ ] **Data fetching**
  - [ ] `/api/replay/:timestamp` endpoint for state reconstruction
  - [ ] `/api/replay/events?from=&to=` for timeline markers
  - [ ] Efficient batch loading (pre-fetch 1-hour chunks)
  - [ ] Cache reconstructed states

- [ ] **Playback engine**
  - [ ] State reconstruction for arbitrary timestamp
  - [ ] Smooth interpolation between states
  - [ ] Animation speed multiplier (1×, 2×, 5×, 10×)
  - [ ] Event-driven: jump between significant moments

- [ ] **Visual replay**
  - [ ] Building states reflect historical activity
  - [ ] Bond colors show historical affinity
  - [ ] Unit positions reflect historical sessions
  - [ ] KPI ticker shows historical values
  - [ ] "REPLAY" watermark overlay
  - [ ] Current replay time displayed prominently

- [ ] **Timelapse mode**
  - [ ] Auto-skip idle periods (>30min no events)
  - [ ] Highlight significant events (pause briefly)
  - [ ] Smooth fast-forward through routine periods
  - [ ] Generate 60-second summary of selected timeframe

- [ ] **Replay interaction**
  - [ ] Click event marker → pause at that moment
  - [ ] Click building during replay → show historical state
  - [ ] Exit replay → smooth transition back to live view

**Deliverable:** Complete replay system allowing users to scrub through agent history like a video timeline.

---

## 15. Oracle Design Review & Recommendations

As Oracle (Zeratul), reviewing this spec for design coherence and identifying gaps:

### ✅ Strengths

1. **Visual metaphor is strong.** Protoss buildings ↔ agents is intuitive. Users familiar with StarCraft will immediately understand the idiom; those unfamiliar will still grok "buildings with status indicators."

2. **Data integration is well-grounded.** The spec maps directly to existing `ventureos-rpg.db` tables. No phantom data sources — everything referenced (psionic_stats, khala_network, missions) exists and has live data.

3. **Progressive disclosure.** Default view is clean (buildings + bonds). Detail only appears on interaction. This prevents information overload.

4. **Phased delivery.** Each phase produces a usable increment. Phase 5.1 alone gives value (static map with live KPIs). Each subsequent phase adds a layer.

### ⚠️ Gaps Identified & Recommendations

#### Gap 1: Sprite Asset Pipeline
**Issue:** The spec assumes sprites exist but doesn't address creation.  
**Recommendation:** Budget 4-6 hours for pixel art creation (or AI-assisted generation). Consider:
- AI image generation (Midjourney/DALL-E) for base building designs, then pixel-art downscale
- Open-source SC2 fan art (with license verification)
- Procedural generation (geometric shapes with shader effects) as MVP fallback
- **Priority:** Start sprite creation in parallel with Phase 5.1 code, not after

#### Gap 2: API Server Requirement
**Issue:** The spec references REST endpoints and WebSocket that don't exist yet.  
**Recommendation:** Phase 5.1 should include a minimal API server (Express.js, ~200 lines) that:
- Serves the tactical map static files
- Provides `/api/agents/status` (reads from `ventureos-rpg.db`)
- Provides `/api/bonds` (reads from `khala_network` table)
- Provides `/api/sessions/active` (reads from `missions` table)
- WebSocket can be deferred to Phase 5.4 (polling is fine for 10s refresh)

#### Gap 3: Session Detection
**Issue:** Mapping active sessions to activities requires access to `sessions_list` which is an OpenClaw internal API.  
**Recommendation:** Create a lightweight bridge script that:
- Runs every 10 seconds via cron or daemon
- Calls `openclaw sessions` (or equivalent)
- Writes results to a JSON file or SQLite table
- Tactical map reads from this stable intermediate format
- This decouples the map from OpenClaw internals

#### Gap 4: Mobile/Responsive Consideration
**Issue:** PixiJS canvas at 1920×1080 logical pixels won't work well on mobile.  
**Recommendation:** Desktop-primary is correct, but add:
- Responsive canvas scaling (maintain aspect ratio, fit viewport)
- Touch event support (tap = click, pinch = zoom, drag = pan)
- Mobile: hide sidebar/panels, show simplified overlay on tap
- Minimum viewport: 1024×768

#### Gap 5: Conversation System Integration
**Issue:** Phase 4 conversation system (in progress) will generate rich interaction data that should flow into the tactical map.  
**Recommendation:** When Phase 4 Track 5 (Conversation Orchestration) ships:
- Conversations should be visible as "collaborative missions" on the map
- Active conversation = both participating agents show coordination beams
- Conversation messages could briefly flash as text particles near the bond
- Add `/api/conversations/active` endpoint

#### Gap 6: State Persistence Across Refreshes
**Issue:** Spec doesn't address what happens on page reload.  
**Recommendation:** Store in localStorage:
- Camera position (pan offset, zoom level)
- Panel states (sidebar open/closed, which panels visible)
- Audio preferences (volume levels, mute state)
- Last viewed tab

### 🔮 Oracle's Design Opinions (Not Gaps, Just Preferences)

1. **Isometric 2.5D > Flat 2D.** A slight isometric tilt (30°) would massively improve the StarCraft feel with minimal extra complexity. PixiJS handles isometric sprite sorting well. The buildings already have defined positions — just transform the coordinate system. **Effort: +4 hours in Phase 5.1, pay off in all subsequent phases.**

2. **Building "level up" visuals.** As agents gain Psionic Ranks, their buildings should visually evolve (more detailed sprites, stronger glow, larger footprint). This connects the deep progression system (Phase 4.5+) to the tactical map. **Effort: +2 hours per rank tier, deferred to Phase 5.5+.**

3. **Day/night cycle.** Subtle ambient lighting changes based on real clock time. Darker at night, brighter during work hours. Adds atmosphere with minimal effort. **Effort: +2 hours in Phase 5.5.**

4. **Fog of war for idle agents.** Agents that have been idle >1 hour could have their building zone partially obscured by fog/shadow, making active areas pop. **Effort: +3 hours in Phase 5.2.**

---

## 16. Open Questions

| # | Question | Options | Oracle's Recommendation |
|---|----------|---------|------------------------|
| 1 | **Map vs tiles integration** | Tabs / Split screen | **Tabs** — cleaner, less cognitive load |
| 2 | **Building positions** | Fixed / Draggable | **Fixed** for v1, draggable as Phase 5.5+ feature |
| 3 | **Activity zones** | Agents move to zones / Zones at buildings | **Agents move** — more visual dynamism |
| 4 | **Sound** | Essential / Optional | **Optional but default-on** — mute button prominent |
| 5 | **Replay** | v1 must-have / v2 defer | **Defer** — Phase 5.6 is right, ship 5.1-5.5 first |
| 6 | **3D depth** | Flat 2D / Isometric 2.5D | **Isometric 2.5D** — worth the extra effort |
| 7 | **Mobile** | Responsive / Desktop-only | **Desktop-primary, responsive-aware** |
| 8 | **Sprite source** | Pixel art / AI-generated / Procedural | **AI-generated base → pixel art cleanup** |
| 9 | **Rendering engine** | PixiJS / Canvas 2D / Three.js | **PixiJS** — optimal for 2D sprites + particles |
| 10 | **Update frequency** | 5s / 10s / 30s | **10s** — balance between freshness and API load |

---

## 17. Team Review Assignments

| Agent | Review Focus | Deadline | Status |
|-------|-------------|----------|--------|
| **Atlas** | Technical feasibility, rendering engine choice, API server design, performance budget validation | 2 days | ⏳ Pending |
| **Sentinel** | Security concerns: WebSocket exposure, data leak vectors, asset hosting, CORS policy | 2 days | ⏳ Pending |
| **Verifier** | Testing strategy: PixiJS rendering tests, visual regression, performance benchmarks | 2 days | ⏳ Pending |
| **Archivist** | Documentation plan: user guide, keyboard shortcut reference, configuration docs | 2 days | ⏳ Pending |
| **Synth** | Implementation feasibility: effort estimates validation, sprite pipeline, build tooling | 2 days | ⏳ Pending |
| **Echo** | Strategic alignment: priority vs other work, resource allocation, timeline fit | 2 days | ⏳ Pending |

### Review Deliverable Format

Each reviewer should produce a document at:
`~/clawd/shared-context/phase5-review-{agent}.md`

Containing:
1. **Feasibility assessment** (green/yellow/red)
2. **Risks identified** (with severity)
3. **Effort estimate adjustment** (if different from spec)
4. **Open questions or concerns**
5. **Specific recommendations**

---

## 18. Success Metrics

### Engagement (Measured After 2 Weeks Live)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Session duration on tactical map | >5 min avg | Page analytics |
| Click-through on buildings/bonds | >20% of sessions | Click event tracking |
| Return visits (next day) | >50% | User session tracking |
| Replay mode usage | >10% of sessions | Feature usage tracking |

### Usefulness (Measured After 1 Month)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Bottleneck identification | Users find overloaded agents | User feedback survey |
| Bond quality at-a-glance | Users correctly identify weak bonds | User testing |
| Task discovery | Users find active work without logs | User testing |
| KPI awareness | Users check KPI ticker regularly | Usage analytics |

### Performance (Measured Continuously)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Frame rate | 60 FPS sustained | `requestAnimationFrame` monitoring |
| Update latency | <100ms p95 | Network timing |
| Initial load | <2s to first meaningful paint | Performance API |
| Memory usage | <100MB heap | Chrome DevTools |
| Asset payload | <5MB total | Network transfer size |

---

## Appendix A: Color Reference

```
Background:
  Void:          #0d0d1a
  Stone:         #1a1a2e
  Grid:          #2a2a4e (10% opacity)

Protoss Energy:
  Psionic Blue:  #00a8ff
  Psionic Gold:  #f6c445
  Crystal Purple: #7b2fbe

Status:
  Success Green: #33ff88
  Warning Yellow:#f6c445
  Alert Orange:  #ff6633
  Error Red:     #ff3333
  Inactive Gray: #666666

Bond Tiers:
  Red (<0.40):       #ff4444
  Orange (0.40-0.59):#ff8844
  Blue (0.60-0.74):  #3388ff
  Bright Blue (0.75):#44aaff
  Gold (0.85+):      #f6c445

Text:
  Primary:       #e0e0e0
  Muted:         #888888
  Accent:        #00a8ff
```

## Appendix B: Agent Position Coordinates

```javascript
// config.js
const MAP_CENTER = { x: 960, y: 540 };
const RING1_RADIUS = 220;
const RING2_RADIUS = 380;

const BUILDINGS = {
  oracle:    { angle: 0,   x: 960,  y: 320,  sprite: 'observatory' },
  archivist: { angle: 51,  x: 1127, y: 402,  sprite: 'archives' },
  synth:     { angle: 103, x: 1175, y: 585,  sprite: 'dark_shrine' },
  atlas:     { angle: 154, x: 1082, y: 730,  sprite: 'engineering_bay' },
  sentinel:  { angle: 206, x: 838,  y: 730,  sprite: 'photon_cannon' },
  verifier:  { angle: 257, x: 745,  y: 585,  sprite: 'sensor_tower' },
  echo:      { angle: 309, x: 793,  y: 402,  sprite: 'gateway' },
  nexus:     { angle: null, x: 960,  y: 540,  sprite: 'nexus', size: 96 },
};

// Activity zones (Ring 2)
const ACTIVITY_ZONES = {
  crystal_field:   { x: 960,  y: 160, type: 'mineral' },   // North
  vespene_geyser:  { x: 1300, y: 730, type: 'gas' },        // Southeast
  patrol_north:    { x: 700,  y: 200, type: 'patrol' },     // Northwest
  patrol_south:    { x: 1200, y: 800, type: 'patrol' },     // Southeast
  build_site_a:    { x: 600,  y: 600, type: 'build' },      // West
  build_site_b:    { x: 1300, y: 400, type: 'build' },      // East
};
```

## Appendix C: Dependency Graph

```
Phase 4 (Conversations)
    │
    ▼
Phase 5.1 (Foundation) ─────── Sprite Asset Creation (parallel)
    │
    ▼
Phase 5.2 (Activity & Animation)
    │
    ▼
Phase 5.3 (Khala Network)
    │
    ▼
Phase 5.4 (Interactivity)
    │
    ▼
Phase 5.5 (Polish & Sound) ──── Audio Asset Creation (parallel)
    │
    ▼
Phase 5.6 (Replay Mode)
    │
    ▼
Phase 5+ (Building evolution, drag-drop, mini-map PIP)
```

---

**En Taro Adun! The observatory reveals all. Through the Khala, our forces shall be made visible.**

— Oracle (Zeratul), Dark Templar Prelate  
Design Specification v1.0, 2026-02-14
