# Bloom Deep Dive: Missing Systems Analysis

**Date**: 2025-01-13  
**Scope**: Quietus System, Memory Economy, Territory Control  
**Finding**: All three systems are **DESIGN-ONLY** — no meaningful code implementation exists.

---

## Executive Summary

| System | Code State | Design Complexity | EA Necessity | Implementation Estimate |
|--------|------------|-------------------|--------------|------------------------|
| **Quietus System** | ❌ None | Medium-High | Nice-to-have | 2-3 weeks |
| **Memory Economy** | ❌ None | High | Post-launch OK | 4-6 weeks |
| **Territory Control** | ❌ None | Very High | Post-launch OK | 8-12 weeks |

**Bottom Line**: None of these systems are required for EA launch. Ship with simplified alternatives and add them as post-launch content updates.

---

## 1. QUIETUS SYSTEM (Q0-Q4 Penalty Marks)

### Current State: ❌ NO IMPLEMENTATION

**Code Search Results**:
- `FHQ01B_Trigger.cs` - Audio log trigger (mentions Q tiers in comments only)
- `BaseHeightmapGenerationJob.cs` - False positive (terrain noise parameters like Q0, Q1)
- `EnvironmentalNoteDatabase.cs` - False positive (lore content)

**No actual implementation of**:
- `QuietusLevel` enum
- `QuietusManager` or tracking service
- Gate zone violation detection
- Penalty application/decay logic
- Redemption contract system

### Design Doc Analysis

**Source**: `docs/Design/Systems/QUIETUS_MARKS_AND_FAILURES.md` (70 lines)  
**Status**: Draft / Experimental

**Key Mechanics**:
```
Q0 (Clean)    → Normal services
Q1 (Noted)    → Extra scans, minor toll increase, handler warnings
Q2 (Marked)   → Vendor tier −1, patrol density +1, 300m bounty pings
Q3 (Hunted)   → Neutral services locked, convoy costs +20%, bounty squads
Q4 (Exiled)   → Gates deny passage (except Mercy windows), black vendors only
```

**Decay**: −1 tier per redemption contract OR per 48h real-time without violations

**Redemption Paths**:
1. Reparations: Deliver aid crates to settlements
2. Escort: Guard med/evac convoys
3. Arbitration: Pay fines at Gates (credits sink)

### Dependencies Analysis

| Dependency | Status | Notes |
|------------|--------|-------|
| FactionType enum | ✅ Exists | 7 factions defined |
| PlayerFactionService | ✅ Exists | Reputation (0-100), persistence via PlayerPrefs |
| Gate System | ❌ Missing | No Truce Gate prefabs or zone detection |
| Patrol Spawning | ❌ Missing | No density-based spawn system |
| Bounty System | ❌ Missing | No bounty tracking or hunter squads |
| Vendor Tier System | ⚠️ Partial | VendorDefinition exists but no tier restriction |

### EA Necessity Assessment

**Verdict**: 🟡 **NICE-TO-HAVE** (Ship without it)

**Rationale**:
- Core extraction loop functions without penalty tiers
- PvP consequences can be learned organically (reputation loss)
- Existing `PlayerFactionService` handles basic reputation penalties
- Adding Q-marks is a post-launch "Crime & Punishment" update

**Player Impact of Shipping Without**:
- No persistent "wanted" status across sessions
- No Gate bans or escalating patrol response
- Simpler "you hurt factions, they like you less" model
- **Acceptable for EA** — most extraction games launch without this depth

### Simplified EA Alternative

```csharp
// Instead of full Quietus system, use existing reputation:
// - Kill Warden NPC → PlayerFactionService.ModifyFactionReputation(Wardens, -10)
// - Drop below 10 rep → Warden vendors refuse service (already supported)
// - No persistent Q-marks, no 48h decay, no bounty squads
```

### Implementation Estimate (If Built)

**Scope**: 2-3 weeks (1 developer)

| Task | Hours |
|------|-------|
| `QuietusService` (state machine, decay timer, persistence) | 24h |
| Gate zone detection (trigger colliders, violation events) | 16h |
| Vendor tier restriction integration | 8h |
| Patrol density modifier hooks | 16h |
| Redemption contract UI + quest hooks | 24h |
| Testing + balancing | 16h |
| **Total** | **~104h (2.5 weeks)** |

### Recommendation

**For EA**: Skip Quietus. Use basic reputation system.  
**Post-Launch** (Month 2-3): Add as "Crime & Punishment" update with marketing.

---

## 2. MEMORY ECONOMY (Coherence, Debt, Persistence)

### Current State: ❌ NO IMPLEMENTATION

**Code Search Results**:
- `FeatureGraph.cs`, `BiomeGenerationPhase.cs` — "Coherence" refers to **terrain feature coherence** (world generation continuity), NOT player memory coherence
- `ProceduralNarrativeSystem.cs` — Environmental storytelling, not memory persistence
- `CodexService.cs` — Basic codex exists but no memory-anchoring or coherence meter

**No actual implementation of**:
- `CoherenceLevel` enum (C0-C3)
- `MnemonicDebt` tracking
- Memory-anchored item tags
- Coherence degradation on damage
- "Memory core" squad carry mechanic
- Persona shedding (trait trading)

### Design Doc Analysis

**Source**: `docs/Design/Systems/MEMORY_ECONOMY_SPEC.md` (50 lines)  
**Status**: Experimental / Draft

**Key Mechanics**:
```
C3 (Intact)    → Codex unlocks persist, map variance toggles allowed
C2 (Frayed)    → Partial unlocks, reduced vendor trust for intel
C1 (Shattered) → No persistence, mnemonic debt +1
C0 (Lost)      → Negative flag, next run has UI glitches/comms hiss
```

**Mnemonic Debt Effects**:
- Handler availability −1 slot
- VO changes (character sounds different)
- Auction bid caps −10%

**Memory Core Mechanic**: Squadmates can carry your "memory core" to evac — betrayals possible

### Dependencies Analysis

| Dependency | Status | Notes |
|------------|--------|-------|
| Codex System | ⚠️ Partial | `CodexService.cs` exists but basic |
| Extraction System | ❌ Missing | No extraction zone implementation |
| Handler System | ❌ Missing | No handler NPCs or availability slots |
| Auction System | ❌ Missing | No black auction implementation |
| Item Tagging | ⚠️ Partial | Items exist but no MEM_ANCHORED tags |

### EA Necessity Assessment

**Verdict**: 🟢 **POST-LAUNCH OK** (Ship without it)

**Rationale**:
- Core extraction loop works with simple "die = lose inventory"
- Knowledge persistence is advanced metagame depth
- Codex unlocks can persist normally (no coherence gating)
- Memory Economy adds existential stakes — not needed for fun loop

**Player Impact of Shipping Without**:
- Death = lose gear (standard extraction penalty)
- Codex unlocks persist always (no coherence decay)
- No "memory core" rescue mechanic (simpler squad dynamics)
- **Acceptable for EA** — Tarkov launched without this, Hunt: Showdown doesn't have it

### Simplified EA Alternative

```csharp
// Instead of full Memory Economy:
// - Death = lose all non-insured items (standard extraction shooter)
// - Codex entries persist via CodexService (already works)
// - No coherence meter, no debt, no persona shedding
// - Insurance system already designed for recovery
```

### Implementation Estimate (If Built)

**Scope**: 4-6 weeks (1-2 developers)

| Task | Hours |
|------|-------|
| `CoherenceService` (meter, degradation, persistence) | 32h |
| Memory-anchored item system (tags, special handling) | 24h |
| "Memory core" drop/carry mechanic (multiplayer sync) | 40h |
| Mnemonic Debt tracking + effects | 24h |
| Persona Shedding UI + trait system | 32h |
| Handler availability integration | 16h |
| Auction bid cap integration | 8h |
| Testing + balancing | 24h |
| **Total** | **~200h (5 weeks)** |

### Recommendation

**For EA**: Skip Memory Economy. Use standard death penalty.  
**Post-Launch** (Month 4-6): Add as "Consciousness Update" with narrative framing.

---

## 3. TERRITORY CONTROL (Faction Influence Over Regions)

### Current State: ❌ NO IMPLEMENTATION

**Code Search Results**:
- `HydrologyCoverageUtility.cs`, `RiverSystem.cs` — "ControlPoint" refers to **water flow control points**, NOT faction territory
- `GreyreachDistrictDetailZone.cs` — "District" is a **world generation zone**, NOT a faction-controlled district
- `WorldMapOverlay.cs`, `FullScreenMapController.cs` — Map UI exists but no faction territory display

**No actual implementation of**:
- `TerritoryRegion`, `TerritoryDistrict`, `TerritoryControlPoint` classes
- `FactionInfluence` tracking (0-100 scale per territory)
- Influence gain/decay mechanics
- Faction AI territorial behavior
- Dynamic territorial events
- Control point capture mechanics

### Design Doc Analysis

**Source**: `docs/Design/TERRITORY_CONTROL_SYSTEM.md` (500+ lines)  
**Status**: Approved / Detailed Spec

**Territorial Hierarchy**:
```
Level 1: REGIONS (Strategic) — 8 major regions, 5-10 km² each
Level 2: DISTRICTS (Operational) — 3-8 per region, 500-1000m areas
Level 3: CONTROL POINTS (Tactical) — 2-6 per district, 50-200m objectives
Total: ~48-384 control points across the world
```

**Influence Mechanics**:
```
0-20   → No Influence (neutral territory)
21-40  → Minor Influence (contested status)
41-60  → Moderate Influence (shared control possible)
61-80  → Major Influence (dominant presence)
81-100 → Total Control (exclusive control, max benefits)
```

**Influence Gain**:
- Objective completion: +5-15
- Control point capture: +10-25
- Defensive success: +5-10
- Resource extraction: +2-8
- Civilian protection: +5-20

**Influence Decay**:
- Natural decay: -1 per day without activity
- Combat losses: -5-15 for failed operations
- Rival operations: -3-10 when competitors succeed

**AI Behaviors**:
- Strategic AI (weekly): Long-term expansion planning
- Operational AI (daily): District control maintenance
- Tactical AI (hourly): Control point defense

**Event Types**:
- Faction Offensive Operations (24-72 hour campaigns)
- Environmental Crisis Events (alien incursions, toxic storms)
- Market Fluctuation Events (resource booms, shortages)

### Dependencies Analysis

| Dependency | Status | Notes |
|------------|--------|-------|
| FactionType enum | ✅ Exists | 7 factions defined |
| Region/Biome System | ✅ Exists | 9 biomes, tile-based world gen |
| Map UI | ⚠️ Partial | `WorldMapOverlay.cs` exists, no territory colors |
| Faction AI | ❌ Missing | No AI decision-making framework |
| Event System | ❌ Missing | No dynamic world events |
| Database/Persistence | ❌ Missing | Design specifies SQL, no implementation |
| Multiplayer Sync | ⚠️ Partial | NetworkVariables exist, need territory state |

### EA Necessity Assessment

**Verdict**: 🟢 **POST-LAUNCH OK** (Ship with static territories)

**Rationale**:
- Core extraction loop doesn't require dynamic territory shifts
- Players need to know "this is Warden turf" for flavor — can be STATIC
- Dynamic territory control is advanced metagame (seasons, live ops)
- 400+ control points is massive scope (8-12 weeks minimum)

**Player Impact of Shipping Without**:
- Factions control fixed zones (hardcoded in world gen)
- No "capture the point" mechanics (extraction-only gameplay)
- No territorial campaigns or faction wars
- **Acceptable for EA** — Hunt: Showdown has no territory, Tarkov territories are static

### Simplified EA Alternative

```csharp
// Instead of full Territory Control:
// 1. Hardcode faction zones in BiomeType or DetailZone configs
// 2. Static map coloring (ForestHills = Warden, TechWastes = Directorate)
// 3. POI faction affiliation is fixed at world gen time
// 4. No influence tracking, no capture mechanics, no AI behavior

// Example: Add to DetailZoneConfig.cs
public FactionType controllingFaction = FactionType.Wardens;
public bool isContested = false; // For flavor, no mechanics
```

### Implementation Estimate (If Built)

**Scope**: 8-12 weeks (2-3 developers)

| Task | Hours |
|------|-------|
| `TerritoryService` (data model, CRUD, persistence) | 40h |
| Influence calculation system (gain/decay/resolution) | 32h |
| Control point capture mechanics (timers, multiplayer sync) | 48h |
| Map UI integration (territory colors, contested markers) | 32h |
| Faction AI framework (strategic/operational/tactical) | 80h |
| Dynamic event system (offensives, crises, markets) | 64h |
| Database layer OR NetworkVariable storage | 40h |
| Player benefit system (spawn security, vendor access) | 24h |
| Integration testing (8-10 players, territory sync) | 40h |
| Balancing + tuning | 40h |
| **Total** | **~440h (11 weeks)** |

### Recommendation

**For EA**: Use static faction territories. Hardcode in world gen.  
**Post-Launch** (Month 6-9): Add as "War for the IEZ" seasonal update.

---

## 4. EXISTING INFRASTRUCTURE TO LEVERAGE

### What Already Works

| Component | File | Status | Can Leverage For |
|-----------|------|--------|------------------|
| FactionType enum | `FactionType.cs` | ✅ Complete | All 3 systems |
| PlayerFactionService | `PlayerFactionService.cs` | ✅ Complete | Quietus (use rep for penalties) |
| ReputationWallet | `ReputationWallet.cs` | ✅ Complete | Multiplayer reputation sync |
| CodexService | `CodexService.cs` | ⚠️ Basic | Memory Economy (extend) |
| BiomeType | `BiomeType.cs` | ✅ Complete | Static territory zones |
| DetailZoneConfig | `DetailZoneConfig.cs` | ✅ Complete | Static faction assignments |
| World Map UI | `WorldMapOverlay.cs` | ⚠️ Basic | Territory visualization |

### Reputation System Analysis

The existing `PlayerFactionService` is well-designed:

```csharp
// Current capabilities:
- 0-100 reputation scale per faction ✅
- Persistence via PlayerPrefs ✅
- Events for UI integration ✅
- Tier system (Hostile → Exalted) ✅
- Spend/modify reputation methods ✅

// Missing for Quietus:
- Separate "mark" state (rep != mark)
- 48h real-time decay timer
- Gate zone integration
- Bounty/patrol hooks
```

**Recommendation**: Extend `PlayerFactionService` with a `QuietusService` that tracks marks separately from reputation. Marks trigger rep consequences, not vice versa.

---

## 5. EA LAUNCH RECOMMENDATIONS

### What to Ship

| System | EA Implementation | Post-Launch Plan |
|--------|-------------------|------------------|
| **Quietus** | Use reputation loss only | Month 2-3: Full Q0-Q4 system |
| **Memory Economy** | Standard death = lose gear | Month 4-6: Coherence update |
| **Territory Control** | Static faction zones | Month 6-9: Dynamic control |

### Simplified EA Feature Set

1. **Factions have fixed territories** (hardcoded in world gen)
2. **Kill faction NPCs → lose reputation** (existing system)
3. **Low reputation → vendors refuse service** (existing system)
4. **Death → lose non-insured items** (standard extraction)
5. **Codex entries persist normally** (existing CodexService)

### Post-Launch Content Roadmap

| Update | Month | Systems Added |
|--------|-------|---------------|
| "Crime & Punishment" | 2-3 | Quietus marks, Gate bans, Bounty system |
| "Consciousness" | 4-6 | Memory Economy, Coherence meter, Memory cores |
| "War for the IEZ" | 6-9 | Dynamic territory, Capture points, Faction campaigns |

---

## 6. FINAL SUMMARY

### Key Findings

1. **All three systems are DESIGN-ONLY** — detailed docs exist but zero code implementation
2. **None are blockers for EA launch** — core extraction loop functions without them
3. **Existing infrastructure can support simplified versions** — leverage `PlayerFactionService`, static zones
4. **Combined implementation effort: ~750 hours** (18+ weeks of 1-developer work)

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Players expect territory control | Medium | Low | Static territories provide flavor |
| Death feels too punishing | Low | Medium | Insurance system already designed |
| PvP has no consequences | Medium | Medium | Reputation loss + vendor lockout |
| Game feels shallow without systems | Low | Low | Core extraction loop is engaging |

### Bottom Line

**Ship EA without these systems.** They add strategic depth but are not required for a fun extraction experience. The existing reputation system provides adequate faction consequences. Add Quietus, Memory Economy, and Territory Control as post-launch seasonal updates to drive retention and marketing moments.

---

*Report generated by deep-dive analysis of Bloom codebase and design documentation.*
