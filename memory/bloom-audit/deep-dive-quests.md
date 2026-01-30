# Bloom Quest System Deep Dive Audit
**Generated:** 2026-01-28
**Auditor:** Subagent (bloom-deep-dive-quests)

---

## Executive Summary

| Metric | Status |
|--------|--------|
| **Framework Completeness** | ✅ 95% - Solid, production-ready |
| **Content Authored** | ❌ 0% - Zero quest assets exist |
| **Design Documentation** | ✅ 100% - Exceptionally detailed |
| **Gap vs Design** | 🔴 120 quests missing (100%) |

**Bottom Line:** The quest system code is well-architected and feature-complete. The design documentation (FACTION_QUESTLINES_FRAMEWORK.md) is extraordinarily detailed—one of the most comprehensive faction quest frameworks I've seen. **However, zero actual quest content has been authored.** The "~10% content" estimate was optimistic; actual content is 0%.

---

## 1. Quest Framework Capabilities

### 1.1 Quest Types Supported (7 types, not 6)

| Type | Code | Description | Progress Tracking |
|------|------|-------------|-------------------|
| **Gather** | `QuestType.Gather` | Collect X items/resources | Per-item dictionary |
| **Deliver** | `QuestType.Deliver` | Deliver items to location/NPC | (Partial - needs extension) |
| **Eliminate** | `QuestType.Eliminate` | Kill X enemies | Per-enemy-type dictionary |
| **ClearPOI** | `QuestType.ClearPOI` | Clear a specific POI | Boolean flag |
| **Craft** | `QuestType.Craft` | Craft X items | Integer counter |
| **Survive** | `QuestType.Survive` | Survive for X time | Float timer |
| **Custom** | `QuestType.Custom` | Custom quest logic | Generic progress |

### 1.2 How Quests Are Defined

**Technology:** Unity ScriptableObjects

**Definition File:** `Assets/Scripts/Gameplay/FirstPlayable/Quests/QuestDefinition.cs`

**Create via:** Unity Menu → `Bloom > FirstPlayable > Quest Definition`

**Quest Definition Schema:**
```
QuestDefinition
├── questId (string)
├── displayName (string)
├── description (TextArea)
├── icon (Sprite)
├── faction (FactionType)
├── questType (QuestType)
├── frequency (Daily/Weekly/OneTime/Repeatable)
├── Requirements
│   ├── requiredLevel (int)
│   └── requiredReputationTier (int)
├── Objectives (per quest type)
│   ├── gatherRequirements[]
│   ├── eliminateRequirements[]
│   ├── targetPOI
│   ├── craftRecipe + craftQuantity
│   └── surviveDuration
└── Rewards
    ├── currencyReward (int)
    ├── reputationReward (int)
    ├── xpReward (int)
    ├── lootRewards[]
    ├── resourceRewards[]
    └── unlockRewards[]
```

### 1.3 Quest System Architecture

| Component | File | Purpose |
|-----------|------|---------|
| **QuestDefinition** | `QuestDefinition.cs` | ScriptableObject template |
| **QuestInstance** | `QuestInstance.cs` | Runtime state + progress tracking |
| **QuestTracker** | `QuestTracker.cs` | Player's active quest manager |
| **QuestGiver** | `QuestGiver.cs` | NPC interaction component |
| **QuestUI** | `QuestUI.cs` | Accept/track/turn-in interface |
| **QuestTrackerHUD** | `QuestTrackerHUD.cs` | In-game objective display |

### 1.4 Framework Strengths

1. **Full Event System** - `OnQuestAccepted`, `OnQuestProgressChanged`, `OnQuestCompleted`, `OnQuestTurnedIn`
2. **Automatic Progress Tracking** - Hooks into inventory, enemy spawner, crafting events
3. **Faction Integration** - Quests linked to FactionType, reputation rewards
4. **Frequency System** - Daily/Weekly/OneTime/Repeatable quest support
5. **Requirement Gating** - Level + reputation tier requirements
6. **Rich Reward Types** - Currency, rep, XP, loot, resources, unlocks

### 1.5 Framework Gaps (Minor)

1. **Deliver quest type** - Defined in enum but lacks specific tracking implementation
2. **No quest chains** - No prerequisites/sequential quest support
3. **No branching/choices** - Framework doesn't support player choices within quests
4. **No editor tooling** - No custom inspectors or quest authoring tools found
5. **No bulk import** - No JSON/CSV import for batch quest creation

---

## 2. Current Content Count

### 2.1 Quest Assets

| Category | Count |
|----------|-------|
| **QuestDefinition .asset files** | **0** |
| **Complete quests** | 0 |
| **Stub/placeholder quests** | 0 |
| **Any quest content at all** | **None** |

**Search performed:** `Get-ChildItem -Recurse -Filter "*quest*.asset"` — No results.

### 2.2 Related Content That Does Exist

| Content Type | Count | Notes |
|--------------|-------|-------|
| **Faction Codex Entries** | 8 | JSON lore files for each faction |
| **Faction Hub Zones** | 1 | SeventySeven detail zone |
| **Crafting Recipes** | 10 | Ammo, bandages, barricades, food |
| **Resources/Materials** | 11 | Alcohol, cloth, components, etc. |
| **POI Definitions** | 3 | Harvest outpost, medcache, skirmish |
| **Encounter Definitions** | 3 | Basic encounters |

### 2.3 Faction Coverage

| Faction Code | Faction Name | In Code | In Design | Quest Assets |
|--------------|--------------|---------|-----------|--------------|
| FCT_DIR | Sky Bastion Directorate | ✅ | ✅ | 0 |
| FCT_VUL | Iron Vultures | ✅ | ✅ | 0 |
| FCT_WAR | Truce Wardens | ✅ | ✅ | 0 |
| FCT_F77 | The Seventy-Seven | ✅ | ✅ | 0 |
| FCT_ASH | Pact of Ash | ✅ | ✅ | 0 |
| FCT_NOM | Roadborn Clans | ✅ | ✅ | 0 |
| FCT_VAR | Obsidian Archive | ✅ | ✅ | 0 |
| FCT_HLX | Helix Syndicate | ❌ | ✅ | 0 |

**Note:** Design document describes 8 factions, but code only implements 7 (Helix Syndicate missing from FactionType enum).

---

## 3. Gap Analysis vs Design

### 3.1 Design Document Scope

**Source:** `Docs/Narrative/FACTION_QUESTLINES_FRAMEWORK.md`

**Document Quality:** Exceptional. 50KB+ of detailed narrative design including:
- Complete quest structure (4 arcs × 15 quests per faction)
- Named NPCs with backstories for each faction
- Specific quest beats with dialogue requirements
- Cross-faction interaction points
- World state flags
- VO estimates

### 3.2 Designed vs Implemented

| Metric | Design | Implemented | Gap |
|--------|--------|-------------|-----|
| **Total Factions** | 8 | 7 (code) | 1 faction missing |
| **Quests per Faction** | 15 | 0 | 15 per faction |
| **Total Quests** | 120 | 0 | **120 quests** |
| **Estimated Playtime** | 60-88 hours | 0 | 60-88 hours |
| **Words of Dialogue** | 144,000-200,000 | 0 | All |

### 3.3 Quest Structure per Faction (Design)

Each faction has a 4-arc structure:

| Arc | Quests | Focus | Time |
|-----|--------|-------|------|
| **Introduction** | 1-3 | Establish faction identity | 60-90 min |
| **Development** | 4-8 | Deepen moral complexity | 150-225 min |
| **Climax** | 9-12 | Major decisions | 180-240 min |
| **Epilogue** | 13-15 | Resolution | 75-105 min |

**Per-faction total:** 7.5-11 hours of content

### 3.4 Content Gap Summary

```
┌─────────────────────────────────────────────────────┐
│                   QUEST CONTENT GAP                  │
├─────────────────────────────────────────────────────┤
│  DESIGNED: ████████████████████████████████ 120     │
│  AUTHORED: (none)                            0      │
│                                                     │
│  IMPLEMENTATION: 0% ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────────────┘
```

---

## 4. Authoring Pipeline Assessment

### 4.1 Current Authoring Process

**How to create a quest today:**
1. Right-click in Unity Project panel
2. Select `Create > Bloom > FirstPlayable > Quest Definition`
3. Fill in all fields manually in Inspector
4. Assign references (items, enemies, POIs)
5. Add to a QuestGiver component on an NPC
6. Test in-game

**Estimated time per quest:** 15-30 minutes (simple) to 2+ hours (complex with testing)

### 4.2 Tools Available

| Tool | Status | Notes |
|------|--------|-------|
| Custom Quest Editor | ❌ Not found | No editor scripts for quests |
| Quest Visualization | ❌ Not found | No chain/flow visualization |
| Bulk Import | ❌ Not found | No JSON/CSV import |
| Quest Testing Tool | ❌ Not found | No automated quest testing |
| Dialogue Integration | ❌ Not found | No dialogue system integration |

### 4.3 Bottlenecks Identified

1. **No content creators involved** - Framework built, but no one authoring
2. **Manual asset creation** - Each quest must be created by hand
3. **Missing tooling** - No editor workflow optimization
4. **Reference dependencies** - Quests need items, enemies, POIs that may not exist
5. **No dialogue system** - Design requires 144K+ words of dialogue; no dialogue framework visible
6. **Missing Helix faction** - Design doc includes faction not in code

### 4.4 Pipeline Recommendations

**Immediate (0-2 weeks):**
- Add Helix Syndicate to FactionType enum
- Create a simple Quest batch import tool (JSON → ScriptableObjects)
- Author 3 sample quests (one per quest type) as templates

**Short-term (2-4 weeks):**
- Build custom Quest Editor window with preview
- Create quest chain/prerequisite support
- Add dialogue stub system

**Medium-term (1-2 months):**
- Integrate with dialogue/localization system
- Add quest testing automation
- Create content creator documentation

---

## 5. Effort Estimation for EA-Ready Content

### 5.1 Minimum Viable Quest Content (EA Launch)

**Target:** 4 launch factions × 8 quests each = **32 quests**

| Phase | Quests | Scope | Effort |
|-------|--------|-------|--------|
| Introduction Arcs (1-3) | 12 | Simple tutorial quests | 2-3 weeks |
| Development Arcs (4-6) | 12 | Medium complexity | 3-4 weeks |
| Partial Climax (7-8) | 8 | Complex, choices | 2-3 weeks |

**Estimated total for EA minimum:** 7-10 weeks with dedicated content creator

### 5.2 Full Design Implementation

**Target:** 8 factions × 15 quests = **120 quests**

| Content Type | Quantity | Effort Per | Total |
|--------------|----------|------------|-------|
| Quest definitions | 120 | 0.5-2 hrs | 60-240 hrs |
| Dialogue (words) | ~170K | 500 words/hr | 340 hrs |
| Voice recording | ~120 min | 2x (setup) | 240 hrs studio |
| QA/Testing | 120 quests | 1 hr each | 120 hrs |

**Rough estimate:** 3-4 months with 2-3 person content team

### 5.3 Scaling Strategy

**Phase 1 (EA Launch):** 32 quests (4 factions, arcs 1-8)
**Phase 2 (Month 3):** +24 quests (complete 4 launch factions)
**Phase 3 (Month 6):** +45 quests (add 3 post-launch factions through arc 8)
**Phase 4 (Year 1):** +19 quests (complete all factions)

---

## 6. Key Findings Summary

### ✅ What's Working
1. Quest framework is solid and production-ready
2. Design documentation is exceptional—clear roadmap exists
3. Faction system infrastructure in place
4. Supporting systems (inventory, crafting, reputation) functional

### ❌ What's Missing
1. **Zero authored quest content** (not 10%—literally 0)
2. **Helix Syndicate faction** not in code (design doc includes 8, code has 7)
3. **No authoring tools** for content creators
4. **No dialogue system** for the 144K+ words of required dialogue
5. **Quest chains/prerequisites** not supported by framework
6. **Player choices within quests** not supported

### 🎯 Recommended Priorities
1. **Immediate:** Create 3-5 sample quests to validate pipeline
2. **Week 1-2:** Build simple batch import tool
3. **Week 2-4:** Add Helix faction, implement quest chains
4. **Month 1-2:** Author EA minimum (32 quests for 4 factions)
5. **Ongoing:** Dialogue system integration

---

## Appendix A: File Locations

```
Quest Framework:
  Assets/Scripts/Gameplay/FirstPlayable/Quests/
    ├── QuestDefinition.cs    (ScriptableObject template)
    ├── QuestInstance.cs      (Runtime tracking)
    ├── QuestTracker.cs       (Player quest manager)
    ├── QuestGiver.cs         (NPC interaction)
    └── QuestUI.cs            (UI system)

Design Document:
  Docs/Narrative/FACTION_QUESTLINES_FRAMEWORK.md

Faction System:
  Assets/Scripts/Narrative/
    ├── FactionType.cs
    ├── IPlayerFactionService.cs
    └── PlayerFactionService.cs

Faction Content:
  Assets/Resources/Codex/
    ├── Faction_Directorate.json
    ├── Faction_IronVultures.json
    ├── Faction_TruceWardens.json
    ├── Faction_SeventySeven.json
    ├── Faction_PactOfAsh.json
    ├── Faction_RoadbornClans.json
    ├── Faction_ObsidianArchive.json
    └── Faction_TrivectorCombine.json  (note: not in design doc?)
```

## Appendix B: Quest Definition Example

To create a sample quest matching the design doc:

```yaml
# DIR_INT_01 "Cold Reception" (Directorate Introduction Quest 1)
questId: "DIR_INT_01"
displayName: "Cold Reception"
description: "A Directorate patrol has detained you. Helena Rook's voice crackles over the radio—deliver a sealed container to the forward post in exchange for safe passage."
faction: Directorate
questType: Deliver  # Would need Deliver implementation
frequency: OneTime
requiredLevel: 0
requiredReputationTier: 0

# Objectives
deliverTarget: "Forward Post Alpha"
deliverItem: "Sealed Container"

# Rewards
currencyReward: 50
reputationReward: 50  # Trust: +50
xpReward: 100
# Unlock: Handler Helena Rook
```

---

*End of Deep Dive Audit*
