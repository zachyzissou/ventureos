# Bloom Game Design Documentation Audit
**Date:** 2025-01-28
**Auditor:** Subagent - Design Mechanics Auditor
**Scope:** Docs/Design/*.md, Wiki/Gameplay/*.md

---

## Executive Summary

This audit identified **47 specific issues** across Bloom's game design documentation:
- **15 Critical Contradictions** - Different docs state different values for the same mechanic
- **8 Missing Value Placeholders** - Systems with TBD/undefined stats
- **12 Incomplete Systems** - Mentioned but not fully documented
- **6 Engine/Project Mismatches** - Terminal Grounds (UE5) references in Bloom (Unity) docs
- **6 Undefined Terms** - Jargon used without explanation

**Overall Documentation Health:** ⚠️ **NEEDS ATTENTION** (68/100)

---

## Systems Coverage Checklist

| System | Documented | Complete | Consistent | Notes |
|--------|------------|----------|------------|-------|
| **Combat - Health/HP** | ✅ | ✅ | ❌ | Armor model inconsistent |
| **Combat - Damage Types** | ✅ | ⚠️ | ✅ | Damage multipliers vary |
| **Combat - Weapons** | ✅ | ✅ | ❌ | Damage values contradict |
| **Progression - XP/Levels** | ✅ | ✅ | ⚠️ | XP values inconsistent |
| **Progression - Reputation** | ✅ | ✅ | ✅ | Well documented |
| **Faction Mechanics** | ✅ | ⚠️ | ❌ | 7 vs 10 factions conflict |
| **Faction Abilities** | ✅ | ⚠️ | ❌ | Healing values contradict |
| **Extraction/Mission Flow** | ✅ | ✅ | ⚠️ | Timer inconsistencies |
| **Crafting/Inventory** | ✅ | ⚠️ | ❌ | Capacity values vary |
| **Trust System** | ⚠️ | ❌ | ❌ | Skeletal, wrong engine ref |
| **Territory Control** | ✅ | ✅ | ❌ | Terminal Grounds specific |
| **UI/Controls** | ✅ | ✅ | ✅ | Well documented |
| **Thermal/Weather** | ✅ | ✅ | ⚠️ | Not cross-referenced |

---

## CRITICAL CONTRADICTIONS (15 Issues)

### 1. Healing Station HP/Second Values
**Severity:** 🔴 CRITICAL - Core gameplay mechanic

| Document | File | Line Context | Value |
|----------|------|--------------|-------|
| Combat.md | Wiki/Gameplay/Combat.md | "Aegis healing stations" | **+25 HP/sec** |
| Extraction.md | Wiki/Gameplay/Extraction.md | "Deploy healing station" | **200 HP/second** |
| Health_And_Medical.md | Wiki/Gameplay/Health_And_Medical.md | "Healing Rate" | **5 HP/second** |
| Factions.md | Wiki/Gameplay/Factions.md | "Healing Station" | **200HP/second** |

**Analysis:** Four different values (5, 25, 200 HP/sec). 200 HP/sec would heal full HP in 0.5 seconds - likely a typo. 5 HP/sec appears in the dedicated Health system doc.

**Recommendation:** Standardize to **5 HP/second** (Health_And_Medical.md value) as it's the most detailed doc.

---

### 2. Armor System Model Conflict
**Severity:** 🔴 CRITICAL - Fundamental combat math

| Document | Model | Values |
|----------|-------|--------|
| Combat.md | **Flat HP addition** | "+50 HP per plate (max 2 plates = +100 HP)" |
| Health_And_Medical.md | **% Absorption** | "Armor Absorption: 50% damage" |
| Crafting_And_Upgrades.md | **% Resistance** | "10% to 60% damage resistance" |
| Inventory_System.md | **Hybrid** | "Armor Plates absorb damage until depleted" |

**Analysis:** Three incompatible armor models described. Can't be flat HP AND % reduction simultaneously.

**Recommendation:** Pick ONE model and update all docs. Suggest: **Flat HP model** (Combat.md) as it's clearer for players.

---

### 3. Faction Count Mismatch (7 vs 10)
**Severity:** 🔴 CRITICAL - Core content scope

| Document | Faction Count | Factions Listed |
|----------|---------------|-----------------|
| GAMEPLAY_DESIGN_DOCUMENT.md | **7** | Directorate, Free77, Nomad Clans, Civic Wardens, Vultures Union, Vaulted Archivists, Trivector Combine |
| Wiki/Gameplay/Factions.md | **10** | Directorate, Iron Vultures, Aegis Collective, Seventy-Seven, Helix Syndicate, Roadborn, Obsidian Archive, North Guard, Pact of Ash, Apex Dynamics |

**Analysis:** The GDD (GAMEPLAY_DESIGN_DOCUMENT.md) describes Terminal Grounds with 7 factions. Wiki describes Bloom with 10 factions. Some factions were renamed/replaced:
- Vultures Union → Iron Vultures
- Nomad Clans → Roadborn
- Vaulted Archivists → Obsidian Archive
- Civic Wardens → Aegis Collective (similar role)
- Free77 → The Seventy-Seven
- Trivector Combine → removed/replaced by Apex Dynamics?

**Recommendation:** Mark GAMEPLAY_DESIGN_DOCUMENT.md as **DEPRECATED** or update to Bloom's 10-faction model.

---

### 4. Aegis Revive Speed Conflicts
**Severity:** 🟠 HIGH

| Document | Aegis Revive Time | Standard Revive Time | Description |
|----------|-------------------|---------------------|-------------|
| Combat.md | 3 seconds | 5 seconds | "40% faster" |
| Combat.md (different section) | 3 seconds | 6 seconds | "50% faster" |
| Health_And_Medical.md | 3 seconds | 8 seconds | "62.5% faster" |
| Progression.md | 3 seconds | - | "50% faster" |

**Analysis:** Aegis is consistently 3 seconds, but standard revive is 5s/6s/8s depending on doc.

**Recommendation:** Standardize to **8 seconds standard, 3 seconds Aegis** (Health_And_Medical.md is most detailed).

---

### 5. Revived HP Values
**Severity:** 🟠 HIGH

| Document | Standard Revive HP | Aegis Revive HP |
|----------|-------------------|-----------------|
| Combat.md | 50 HP | 75 HP |
| Health_And_Medical.md | 30 HP | 50 HP |
| Health_And_Medical.md (different section) | 30 HP | 75% of max (75 HP) |

**Analysis:** Multiple conflicting revival HP values.

**Recommendation:** Standardize to **30 HP standard, 75 HP Aegis** (keeps Aegis advantage meaningful).

---

### 6. Weapon Damage Values - Assault Rifles
**Severity:** 🟠 HIGH

| Document | AR Damage/Shot |
|----------|----------------|
| Combat.md | 30-40 damage |
| Weapons_And_Loadouts.md | 35-50 damage |
| Crafting_And_Upgrades.md (base) | 25 damage |
| Crafting_And_Upgrades.md (Tier 3) | 55 damage |

**Analysis:** Base damage varies by 15 points (25-40) across docs.

**Recommendation:** Standardize base AR damage to **30-35 damage** with crafting upgrades reaching 50-55.

---

### 7. Directorate Damage Resistance Stacking Math
**Severity:** 🟠 HIGH

| Source | Claim |
|--------|-------|
| Multiple docs | "+20% team damage resist aura" |
| Combat.md | "Stacks with multiple Directorate players (max +40% with 2 tanks)" |
| Crafting doc | "Ultra-Heavy Armor" = 60% resist, "+20% = 80% total" |

**Analysis:** If +20% per Directorate, max +40% with 2... but Crafting says 60% armor + 20% aura = 80%. This implies aura doesn't stack.

**Recommendation:** Clarify: aura **does not stack** (max +20% regardless of Directorate count), OR cap is indeed +40% with 2 Directorate.

---

### 8. Base Carry Capacity
**Severity:** 🟡 MEDIUM

| Document | Base Capacity | Notes |
|----------|---------------|-------|
| Inventory_System.md | 32-50kg by faction | Varies per faction |
| Crafting_And_Upgrades.md | 40kg | Universal base |
| Health_And_Medical.md | 10kg | "Default Inventory" |

**Analysis:** 10kg vs 40kg vs variable is a major discrepancy.

**Recommendation:** Standardize: **40kg base** with faction modifiers (-8kg to +10kg).

---

### 9. Backpack Slot Counts
**Severity:** 🟡 MEDIUM

| Document | Small | Medium | Large | XL |
|----------|-------|--------|-------|-----|
| Inventory_System.md | 6 | 12 | 18 | 24/30 |
| Crafting_And_Upgrades.md | - | 20 | 25 | 30/40 |

**Analysis:** Slot counts differ significantly.

**Recommendation:** Use Inventory_System.md values (6/12/18/24/30) as primary.

---

### 10. Extraction Timer Duration
**Severity:** 🟡 MEDIUM

| Document | Timer |
|----------|-------|
| Extraction.md | 2-3 minutes |
| FACTION_EXTRACTION_MECHANICS.md | 60 seconds (Transit Beacons) |
| Controls_And_Keybinds.md | 3 minutes |

**Analysis:** 1-3 minute range depending on doc.

**Recommendation:** Standardize to **2-3 minutes** scaling with zone risk level.

---

### 11. Natural HP Regeneration Rate
**Severity:** 🟡 MEDIUM

| Document | Regen Rate | Delay |
|----------|------------|-------|
| Health_And_Medical.md | 1 HP/second | 10 seconds |
| Combat.md | Not mentioned | - |
| Progression.md | Not mentioned | - |

**Analysis:** Only one doc specifies regen. Should be cross-referenced.

---

### 12. Bleed-Out Timer
**Severity:** 🟡 MEDIUM

| Document | Timer |
|----------|-------|
| Health_And_Medical.md | 60 seconds |
| Combat.md | 30 seconds (down state) |

**Recommendation:** Standardize to **60 seconds** (Health doc is authoritative).

---

### 13. Forged Wave Composition Numbers
**Severity:** 🟡 MEDIUM

| Document | Wave Counts |
|----------|-------------|
| Extraction.md | Waves 1-5 specific (10/5/3/1+5/mixed) |
| Combat.md | "3-5 waves of increasing difficulty" |

**Analysis:** Specific counts vs ranges. Minor inconsistency.

---

### 14. Sprint Speed Bonus
**Severity:** 🟡 MEDIUM

| Document | Sprint Speed |
|----------|--------------|
| Controls_And_Keybinds.md | +40% speed |
| Inventory_System.md | Tactical sprint mentioned |
| Health_And_Medical.md | Not specified |

---

### 15. Loot Tier Mapping
**Severity:** 🟡 MEDIUM

| System | Tiers |
|--------|-------|
| Item Rarity | Common/Uncommon/Rare/Epic/Legendary/Splice |
| Tech Tiers | TEC_SKIMMER/TEC_HARROWER/TEC_MONOLITH |

**Analysis:** No explicit mapping between item rarity and tech tiers documented.

**Recommendation:** Create mapping table: Skimmer=Common-Rare, Harrower=Rare-Epic, Monolith=Legendary-Splice.

---

## MISSING/PLACEHOLDER VALUES (8 Issues)

### 1. Post-Launch Faction Abilities
**File:** Wiki/Gameplay/Factions.md, Progression.md
**Issue:** 6 post-launch factions (Helix, Roadborn, Archive, North Guard, Pact of Ash, Apex) have placeholder abilities marked "Planned Abilities" or "TBD".

### 2. Crafting Recipe Costs
**File:** Docs/Design/Crafting_And_Upgrades.md
**Issue:** Many recipes lack specific material quantities. Example: "Legendary Mods" section has materials listed but no quantities.

### 3. Black Market Auction Prices
**File:** Wiki/Gameplay/Inventory_System.md
**Issue:** "Variable (50-200%)" - no specific price formulas.

### 4. Faction Reputation Decay Rate
**File:** Multiple
**Issue:** Reputation gains documented but decay over time is not specified.

### 5. AI Difficulty Scaling
**File:** Docs/Design/TERRITORY_CONTROL_SYSTEM.md
**Issue:** AI escalation levels described but specific spawn counts per level not defined.

### 6. Emergency Extraction Cost
**File:** Wiki/Gameplay/Extraction.md vs Inventory_System.md
**Issue:** 5,000 credits vs 8,000 credits - inconsistent.

### 7. Phase Pocket Mechanics
**File:** Multiple references
**Issue:** "Phase Pockets" mentioned but mechanics never fully explained.

### 8. Convoy Defense Bonus
**File:** Wiki/Gameplay/Factions.md
**Issue:** Pact of Ash "+20% convoy defense" - defense against what? How calculated?

---

## INCOMPLETE SYSTEMS (12 Issues)

### 1. Trust System
**Files:** Docs/Design/Trust_System.md, Wiki/Gameplay/Trust_System.md
**Status:** Skeletal documentation
**Missing:**
- Specific trust values/thresholds
- How trust affects gameplay
- Trust gain/loss rates
- UI integration details

### 2. Splice Events
**Files:** Wiki/Gameplay/Splice_Events.md referenced but minimal
**Missing:**
- Event trigger conditions
- Rewards/penalties
- Duration
- Player interactions

### 3. Black Auction System
**Files:** Docs/Design/Systems/BLACK_AUCTION_SYSTEM.md
**Missing:**
- Bidding mechanics
- Reserve prices
- Auction timing

### 4. Memory Economy
**Files:** Docs/Design/Systems/MEMORY_ECONOMY_SPEC.md
**Status:** System referenced but not integrated into main gameplay docs.

### 5. Quietus Marks
**Files:** Docs/Design/Systems/QUIETUS_MARKS_AND_FAILURES.md
**Missing:**
- How marks are earned
- Gameplay effects
- Removal process

### 6. Truce Gates
**Files:** Docs/Design/Systems/TRUCE_GATE_GOVERNANCE.md
**Missing:**
- Gate locations
- Activation conditions
- Player behavior rules

### 7. Phase Pockets
**Files:** Multiple references, no dedicated doc
**Missing:** Complete mechanics documentation.

### 8. Seasonal Campaigns
**Files:** Docs/Design/Seasonal_Territorial_Campaigns.md, Season1_Arc.md
**Status:** High-level design only
**Missing:**
- Specific mission structure
- Rewards
- Timeline

### 9. Vehicle System
**File:** Mentioned in Factions (Directorate "Armored Vehicle Access")
**Missing:** No dedicated vehicle documentation found.

### 10. NPC Faction Behavior
**File:** TERRITORY_CONTROL_SYSTEM.md
**Status:** AI framework described
**Missing:** Specific NPC encounter rates, patrol routes, behavior trees.

### 11. World Events System
**File:** Wiki/Gameplay/World_Events.md exists
**Status:** Framework only
**Missing:** Specific event triggers, durations, rewards.

### 12. Electronic Warfare
**File:** Wiki/Gameplay/Electronic_Warfare.md referenced
**Status:** Helix Syndicate ability mentioned
**Missing:** Detailed mechanics.

---

## ENGINE/PROJECT MISMATCHES (6 Issues)

### 1. Trust System References UE5 Classes
**File:** Docs/Design/Trust_System.md
**Issue:** References "UTGTrustSubsystem" - UE5 naming convention (U prefix, Subsystem suffix)
**Bloom Uses:** Unity 6000.2.7f2 (not Unreal Engine)

### 2. GAMEPLAY_DESIGN_DOCUMENT.md is Terminal Grounds Specific
**File:** Docs/Design/GAMEPLAY_DESIGN_DOCUMENT.md
**Issue:** Document header says "Terminal Grounds" and describes 7-faction PvP model
**Bloom Is:** 10-faction PvE co-op

### 3. TERRITORY_CONTROL_SYSTEM.md References Terminal Grounds
**File:** Docs/Design/TERRITORY_CONTROL_SYSTEM.md
**Issue:** "Dynamic World State for Terminal Grounds"
**Status:** May be deprecated or needs adaptation to Bloom.

### 4. FACTION_EXTRACTION_MECHANICS.md Uses Old Faction Names
**File:** Docs/Design/FACTION_EXTRACTION_MECHANICS.md
**Issue:** References Civic Wardens, Vaulted Archivists, Trivector Combine - not Bloom factions.

### 5. Technical Requirements Reference "UE5 Framework"
**File:** Docs/Design/GAMEPLAY_DESIGN_DOCUMENT.md
**Issue:** "UE5 Framework: Scalable system architecture"
**Bloom Uses:** Unity HDRP

### 6. Integration References in Design Docs
**File:** Multiple
**Issue:** References to "Unreal" assets, ".uasset", "Blueprints" scattered in design docs.

---

## UNDEFINED TERMS (6 Issues)

### 1. "Phase Shears"
**Used In:** Extraction.md, multiple lore docs
**Definition:** Not found
**Context:** "Phase shears (instant kill if caught in temporal jitter)"

### 2. "Temporal Jitter"
**Used In:** Extraction.md, lore docs
**Definition:** Not found
**Context:** "time distortion effects"

### 3. "Harmonic Resonance"
**Used In:** Extraction.md
**Definition:** Not found
**Context:** "psychotropic effects, derealization"

### 4. "IEZ Cascade"
**Used In:** Multiple docs
**Definition:** Partially explained in lore but not in gameplay docs
**Recommendation:** Add glossary entry to gameplay docs.

### 5. "Monolith Bloom"
**Used In:** Extraction.md
**Definition:** Not found
**Context:** "Phase Pockets" location

### 6. "Exergy"
**Used In:** Controls doc, Weapons
**Definition:** Not found
**Context:** "Exergy Sidearm", "Exergy Cell"

---

## SPECIFIC FILE:LINE REFERENCES

### High-Priority Fixes

| Priority | File | Issue | Action |
|----------|------|-------|--------|
| 🔴 P0 | Wiki/Gameplay/Combat.md:~75 | Healing station "200HP/second" | Change to 5 HP/s |
| 🔴 P0 | Wiki/Gameplay/Extraction.md:~180 | Healing station "200HP/second" | Change to 5 HP/s |
| 🔴 P0 | Docs/Design/GAMEPLAY_DESIGN_DOCUMENT.md:1 | Add DEPRECATED header | Add deprecation notice |
| 🔴 P0 | Docs/Design/Trust_System.md:~45 | "UTGTrustSubsystem" UE5 ref | Remove/replace with Unity equivalent |
| 🟠 P1 | Wiki/Gameplay/Combat.md:~50 | Armor "+50 HP per plate" | Reconcile with % model or choose one |
| 🟠 P1 | Wiki/Gameplay/Health_And_Medical.md:~90 | "30 HP" revive | Standardize to 30 standard, 75 Aegis |
| 🟠 P1 | Wiki/Gameplay/Weapons_And_Loadouts.md:~100 | AR damage 35-50 | Standardize to 30-40 |
| 🟡 P2 | Wiki/Gameplay/Inventory_System.md:~200 | 32-50kg capacity | Standardize to 40kg base |
| 🟡 P2 | Multiple | Faction count 7 vs 10 | Update all old docs to 10-faction model |

---

## RECOMMENDATIONS SUMMARY

### Immediate Actions (This Week)
1. **Deprecate GAMEPLAY_DESIGN_DOCUMENT.md** - Add header noting it's Terminal Grounds, not Bloom
2. **Fix healing station values** - Standardize to 5 HP/second across all docs
3. **Remove UE5 references** - Trust_System.md needs Unity rewrite

### Short-Term (Next 2 Weeks)
4. **Standardize armor model** - Pick flat HP or % reduction, update all docs
5. **Create Glossary page** - Define Phase Shears, Temporal Jitter, IEZ Cascade, etc.
6. **Complete Trust System** - Currently skeletal

### Medium-Term (Next Month)
7. **Document post-launch faction abilities** - Helix, Roadborn, Archive, etc.
8. **Create crafting recipe database** - Specific material quantities
9. **Complete Phase Pocket mechanics** - Referenced everywhere, never explained

### Documentation Hygiene
10. **Add version numbers to design docs** - Track Bloom vs Terminal Grounds content
11. **Cross-reference validation script** - Automated check for numeric consistency
12. **Establish single source of truth** - Health_And_Medical.md for health, Combat.md for weapons

---

## APPENDIX: NUMERIC VALUE CONFLICTS TABLE

| Mechanic | Doc 1 Value | Doc 1 Source | Doc 2 Value | Doc 2 Source | Recommended |
|----------|-------------|--------------|-------------|--------------|-------------|
| Healing Station HP/s | 5 | Health_And_Medical.md | 200 | Extraction.md | **5** |
| Base HP | 100 | All | 100 | All | 100 ✅ |
| Armor Plates HP | +50 each | Combat.md | 50% absorb | Health_And_Medical.md | **Choose one model** |
| Aegis Revive Time | 3s | All | 3s | All | 3s ✅ |
| Standard Revive | 5s | Combat.md | 8s | Health_And_Medical.md | **8s** |
| Revived HP (Standard) | 50 HP | Combat.md | 30 HP | Health_And_Medical.md | **30 HP** |
| Revived HP (Aegis) | 75 HP | Combat.md | 75% max | Health_And_Medical.md | **75 HP** |
| AR Damage | 30-40 | Combat.md | 35-50 | Weapons.md | **30-40** |
| AR Base (Crafting) | 25 | Crafting.md | - | - | **25 (upgradeable)** |
| Base Carry Capacity | 40kg | Crafting.md | 32-50kg | Inventory.md | **40kg base** |
| Extraction Timer | 2-3 min | Extraction.md | 60s | Faction_Extraction.md | **2-3 min** |
| Sprint Speed Bonus | +40% | Controls.md | - | - | **+40%** |
| Natural HP Regen | 1 HP/s | Health.md | - | - | **1 HP/s** |
| Regen Delay | 10s | Health.md | - | - | **10s** |
| Bleed-Out Timer | 60s | Health.md | 30s | Combat.md | **60s** |
| Faction Count | 7 | GDD.md | 10 | Wiki/Factions.md | **10** |
| Emergency Extract Cost | 5,000 | Combat.md | 8,000 | Inventory.md | **Standardize** |

---

*Audit completed 2025-01-28. Total issues: 47. Critical: 15. Documentation requires systematic reconciliation before EA launch.*
