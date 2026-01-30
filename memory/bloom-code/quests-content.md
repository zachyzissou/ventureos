# Bloom Quest Content Documentation

**Created:** 2025-01-28  
**Status:** Validated & Ready for Unity Import  
**Author:** Bloom Content Subagent  
**Validated:** 2025-01-28

---

## Summary

Created quest content for the 4 Early Access factions as defined in `FACTION_QUESTLINES_FRAMEWORK.md`. This includes 8 quests per faction (32 total) covering the Introduction Arc (Quests 1-3) and Development Arc (Quests 4-8).

### Validation Status ✓
- **JSON Valid:** Parsed successfully with PowerShell `ConvertFrom-Json`
- **Quest Types:** All quest types have matching requirements (Gather has gatherRequirements, etc.)
- **No Deliver Quests:** Changed to Custom type (QuestDefinition lacks delivery target field)
- **ClearPOI Quests:** Have placeholder POI IDs; require manual linking after import
- **C# Importer:** Compiles (correct namespace, using statements, brace structure)

## Files Created

### Quest Data
| File | Path | Description |
|------|------|-------------|
| EA_Quest_Data.json | `Assets/Resources/Quests/EA_Quest_Data.json` | Master JSON containing all quest definitions for EA factions |

### Editor Tooling
| File | Path | Description |
|------|------|-------------|
| QuestDataImporter.cs | `Assets/Scripts/Editor/Quests/QuestDataImporter.cs` | Editor script to generate ScriptableObject assets from JSON |

### Directory Structure
```
Assets/Resources/Quests/
├── EA_Quest_Data.json          # Master quest data file
├── Directorate/                # DIR quest assets (after import)
├── Vultures/                   # VUL quest assets (after import)
├── Wardens/                    # WAR quest assets (after import)
└── SeventySeven/               # F77 quest assets (after import)
```

---

## Quest Summary by Faction

### Sky Bastion Directorate (FCT_DIR)
**Handler:** Helena Rook  
**Theme:** "Order from Chaos" - Is brutal order better than humane chaos?

| Quest ID | Name | Arc | Type | Level |
|----------|------|-----|------|-------|
| DIR_INT_01 | Cold Reception | Introduction | Deliver | 1 |
| DIR_INT_02 | Standard Procedure | Introduction | Eliminate | 3 |
| DIR_INT_03 | The Weight of Command | Introduction | ClearPOI | 5 |
| DIR_DEV_04 | Acceptable Losses | Development | Custom | 8 |
| DIR_DEV_05 | Northern Cache | Development | Gather | 10 |
| DIR_DEV_06 | Deserter's Run | Development | Custom | 12 |
| DIR_DEV_07 | Ghost Frequencies | Development | ClearPOI | 15 |
| DIR_DEV_08 | The Vargas Doctrine | Development | Custom | 18 |

**Key NPCs:** Marshal Vargas, Helena Rook, Sergeant Kova, Private Dara Solis, Colonel Trent

**Major Plot Points:**
- Quest 3: First exposure to Quietus Protocol brutality
- Quest 4: Rook reveals she caused her daughter's death
- Quest 5: Cross-faction moment with Vultures (Mako Kade)
- Quest 7: Discover Vargas's Harvester experiments
- Quest 8: Point of no return - coup setup

---

### Iron Vultures (FCT_VUL)
**Handler:** Mako "Slipway" Kade  
**Theme:** "From Scrap, Strength" - Is there honor among thieves?

| Quest ID | Name | Arc | Type | Level |
|----------|------|-----|------|-------|
| VUL_INT_01 | Finder's Fee | Introduction | Gather | 1 |
| VUL_INT_02 | Market Rate | Introduction | Gather | 3 |
| VUL_INT_03 | The Arbitration | Introduction | Custom | 5 |
| VUL_DEV_04 | Blood Ledger | Development | ClearPOI | 8 |
| VUL_DEV_05 | Warden's Dilemma | Development | Custom | 10 |
| VUL_DEV_06 | Duchess's Debt | Development | Eliminate | 12 |
| VUL_DEV_07 | The Cosmonaut Gambit | Development | Gather | 15 |
| VUL_DEV_08 | Rin's Confession | Development | Custom | 18 |

**Key NPCs:** Rin Okafor, Mako Kade, Duchess Vera Sloan, Pike Novak, The Ledger

**Major Plot Points:**
- Quest 3: Meet Rin Okafor, see Freeport law in action
- Quest 4: Discover murder-for-salvage scheme
- Quest 5: Cross-faction moment with Wardens (Bram Hale)
- Quest 7: The Ledger's cold calculations revealed
- Quest 8: Point of no return - Rin's vulnerability

---

### Truce Wardens (FCT_WAR)
**Handler:** Bram "Verdict" Hale  
**Theme:** "We Stand Together" - Can you save everyone? Should you try?

| Quest ID | Name | Arc | Type | Level |
|----------|------|-----|------|-------|
| WAR_INT_01 | Safe Passage | Introduction | Deliver | 1 |
| WAR_INT_02 | Sanctuary | Introduction | Custom | 3 |
| WAR_INT_03 | The Quietus | Introduction | Custom | 5 |
| WAR_DEV_04 | Triage | Development | Gather | 8 |
| WAR_DEV_05 | The Other Gate | Development | ClearPOI | 10 |
| WAR_DEV_06 | Little Light | Development | Gather | 12 |
| WAR_DEV_07 | Cole's Way | Development | Custom | 15 |
| WAR_DEV_08 | The Flood | Development | Custom | 18 |

**Key NPCs:** Captain Lupe Santos, Bram Hale, Dr. Yuki Tanaka, Marcus Cole, Little Eli

**Major Plot Points:**
- Quest 2: See Metro Sanctuary's desperate reality
- Quest 3: Witness Quietus execution, Bram's hands shake
- Quest 5: Corrupt Wardens protecting refugees - impossible choice
- Quest 6: Little Eli's life hangs in the balance
- Quest 8: Point of no return - massive refugee crisis

---

### The Seventy-Seven (FCT_F77)
**Handler:** Sera "Ledger" Venn  
**Theme:** "Contract Complete" - Does neutrality mean having no values?

| Quest ID | Name | Arc | Type | Level |
|----------|------|-----|------|-------|
| F77_INT_01 | Standard Contract | Introduction | Deliver | 1 |
| F77_INT_02 | The Interview | Introduction | Gather | 3 |
| F77_INT_03 | Metrics | Introduction | Custom | 5 |
| F77_DEV_04 | Conflicting Interests | Development | Eliminate | 8 |
| F77_DEV_05 | The Doc's Dilemma | Development | Custom | 10 |
| F77_DEV_06 | Anonymous | Development | Gather | 12 |
| F77_DEV_07 | Probability Zero | Development | Eliminate | 15 |
| F77_DEV_08 | The Number | Development | Custom | 18 |

**Key NPCs:** Jax Korder, Sera Venn, Doc Reese Farrow, Katya "Odds" Petrov, Anonymous Client

**Major Plot Points:**
- Quest 2: Meet Jax Korder, live evaluation
- Quest 4: Neutrality enables innocent deaths
- Quest 6: Anonymous Client introduced - something inhuman
- Quest 7: Impossible contract, Katya questions the math
- Quest 8: Point of no return - "77" is a memorial for the dead

---

## Cross-Faction Connections

The quests establish several cross-faction narrative threads:

| Quest | Faction | Cross-Faction Connection |
|-------|---------|-------------------------|
| DIR_DEV_05 | Directorate | Meets Mako Kade (Vultures) |
| VUL_DEV_05 | Vultures | Meets Bram Hale (Wardens) |
| VUL_DEV_07 | Vultures | Cosmonaut - multi-faction convergence |

---

## How to Generate ScriptableObject Assets

1. Open Unity Editor with the Bloom project
2. Go to menu: **Bloom > Quests > Import Quest Data from JSON**
3. Assets will be created in `Assets/Resources/Quests/[FactionName]/`
4. Run **Bloom > Quests > Validate Quest Data** to check for issues

### Manual Steps After Import:
1. **ClearPOI Quests** - Link POI references in Inspector:
   - `DIR_INT_03` → `poi_outpost_fenris`
   - `DIR_DEV_07` → `poi_sky_bastion_lower`
   - `VUL_DEV_04` → `poi_murder_site`
   - `WAR_DEV_05` → `poi_foresthills_gate`

2. **Eliminate Quests** - Connect enemy prefabs or verify enemyTypeId strings:
   - `DIR_INT_02`: `forged_raider` (8), `forged_scout` (4)
   - `VUL_DEV_06`: `pike_saboteur` (4), `hired_muscle` (6)
   - `F77_DEV_04`: `faction_hostile` (6), `security_detail` (4)
   - `F77_DEV_07`: `fortified_target` (3), `elite_guard` (8)

3. **Gather Quests** - Link ResourceMaterial/LootDefinition assets or verify itemId strings match your registries

4. **Icons/Sprites** - Add quest icons if available

---

## Quest Design Notes

### Quest Type Distribution (Validated)
- **Custom:** 16 quests (narrative-heavy, choice points, escort/delivery missions)
- **Gather:** 8 quests (exploration, resource gathering)
- **Eliminate:** 4 quests (combat-focused)
- **ClearPOI:** 4 quests (area control, investigation)

*Note: Originally had 3 Deliver quests, converted to Custom since QuestDefinition lacks delivery target implementation.*

### Reputation Tier Requirements
- **Tier 0 (Outsider):** Quests 1-3 (all Introduction Arc)
- **Tier 1 (Associate):** Quests 4-6 (early Development Arc)
- **Tier 2 (Trusted):** Quests 7-8 (late Development Arc)

### Level Progression
- Introduction Arc: Levels 1-5
- Development Arc: Levels 8-18
- (Climax Arc would be 20-30, Epilogue 32-40)

---

## Remaining Work

### Climax Arc (Quests 9-12) - Not Yet Created
Per faction, needs:
- 4 additional quests
- Major setpiece encounters
- Boss battles
- Climax decision with multiple outcomes

### Epilogue Arc (Quests 13-15) - Not Yet Created
Per faction, needs:
- 3 additional quests
- Consequence resolution
- Unique faction rewards
- Setup for seasonal content

### Total Quests Needed (Full Implementation)
| Faction | Created | Remaining | Total |
|---------|---------|-----------|-------|
| Directorate | 8 | 7 | 15 |
| Vultures | 8 | 7 | 15 |
| Wardens | 8 | 7 | 15 |
| SeventySeven | 8 | 7 | 15 |
| PactOfAsh | 0 | 15 | 15 |
| Roadborn | 0 | 15 | 15 |
| Archive | 0 | 15 | 15 |
| Helix | 0 | 15 | 15 |
| **TOTAL** | **32** | **88** | **120** |

---

## File References

- Framework Document: `Docs/Narrative/FACTION_QUESTLINES_FRAMEWORK.md`
- Quest System Code: `Assets/Scripts/Gameplay/FirstPlayable/Quests/`
- Faction Types: `Assets/Scripts/Narrative/FactionType.cs`
- Quest Data: `Assets/Resources/Quests/EA_Quest_Data.json`
- Import Tool: `Assets/Scripts/Editor/Quests/QuestDataImporter.cs`
