# POI Definition Expansion Summary

**Date**: 2026-01-28
**Task**: Expand POI definitions from 20 to 50 (30 new)
**Status**: ✅ COMPLETE

---

## Accomplished

Created **30 new POI definitions** with full environmental storytelling hooks:

| Biome | POIs Added | Threat Level | Theme Focus |
|-------|------------|--------------|-------------|
| Central Grasslands | 6 | H2-H3 | Phase anomalies, IEZ proximity |
| Eastern Plateaus | 6 | H1-H2 | Vulture trade, Combine tech |
| Forest Hills | 6 | H1 | Warden refuges, survival resources |
| Snow Peaks | 6 | H1-H2 | Frozen military, Directorate |
| Southwest Plains | 6 | H1-H2 | Roadborn routes, farmsteads |

---

## POI System Architecture

### POIDefinition Schema (Simple)
```csharp
public class POIDefinition : ScriptableObject
{
    public string poiId;              // Unique identifier
    public EncounterDefinition encounter;  // Enemy spawns + loot
    public LootTable lootTable;       // Optional additional loot
    public Vector3 placementOffset;   // Position adjustment
}
```

### Placement: Manual via POISpawner
- POISpawner component holds arrays of POIDefinitions + spawn points
- Server-only spawning (Netcode)
- Hybrid approach: manual points + procedural terrain fitting

---

## Existing Assets (3)
1. `POI_Harvest_Outpost`
2. `POI_Medcache_Wreck`
3. `POI_Supply_Skirmish`

## New Definitions (30)
Full definitions stored in:
`C:\Users\Zachg\Documents\VaultZap\🔧 Projects\Bloom\POI Definitions\`

### By Category
- **Civilian Ruins**: 6 (evacuation convoy, school shelter, clinic, rodeo, farms)
- **Military**: 4 (combine relay, testbed, frozen convoy, observatory)
- **Harvester Crashes**: 4 (skimmer tomb, impact crater, meteor field)
- **Underground**: 3 (metro entrance, ice bunker, smuggler tunnel)
- **Resource Nodes**: 4 (hunting, foraging, water, grain)
- **Wilderness Features**: 5 (phase garden, memorials, beacons, caches)
- **Faction Hubs**: 2 (Vulture outpost, Roadborn waystation)

---

## New Loot Tables Required

15 new LootTable assets needed:
1. `POI_Loot_PhaseStable` - Phase crystals
2. `POI_Loot_Electronics` - Data shards, circuits
3. `POI_Loot_ArchiveResearch` - Experimental equipment
4. `POI_Loot_AlienCore` - Intact Harvester components
5. `POI_Loot_PrototypeWeapon` - Experimental weapons
6. `POI_Loot_SmugglersStash` - Contraband
7. `POI_Loot_MilitaryGear` - Armor, tactical equipment
8. `POI_Loot_HuntingSupplies` - Skinning tools, traps
9. `POI_Loot_Herbs` - Medicinal plants
10. `POI_Loot_WaterPurification` - Filters
11. `POI_Loot_LoreItem` - Memory fragments
12. `POI_Loot_ConvoyGoods` - Trade supplies
13. `POI_Loot_FarmSupplies` - Seeds, tools
14. `POI_Loot_FoodStores` - Preserved food
15. `POI_Loot_AlienScatter` - Buried components

---

## Environmental Storytelling Elements

Each POI includes a **Narrative Hook** - an environmental detail that tells a story without dialogue:

**Examples**:
- Phase Garden: Family frozen mid-picnic, child 50m from father
- Frozen Convoy: Sergeant's hand still on transmit button, face showing dawning horror
- School Shelter: Cafeteria barricaded from outside, lunch trays still set
- Grain Silo: Layered graffiti showing 4 different factions claiming ownership

These align with Arc Raiders quality principles:
- Show, don't tell
- Frozen moments in time
- Environmental clues imply narrative

---

## Implementation Priority

### Phase 1 (Immediate)
Resource nodes for core survival loop:
- `POI_FOREST_HUNTING_CAMP`
- `POI_FOREST_HERBALIST_GROVE`
- `POI_FOREST_WATER_TREATMENT`
- `POI_PLAINS_WINDMILL_FARM`

### Phase 2 (Next Sprint)
Low-risk exploration POIs:
- All civilian ruins (6 POIs)
- Memorials (2 POIs)

### Phase 3 (Following)
Combat + loot POIs:
- Military installations (4 POIs)
- Crash sites with encounters (4 POIs)

### Phase 4 (Late)
Faction integration:
- Hub POIs with vendor systems
- Reputation-locked content

---

## Files Created

```
VaultZap/🔧 Projects/Bloom/POI Definitions/
├── POI_INDEX.md          # Master index
├── Central_Grasslands_POIs.md
├── Eastern_Plateaus_POIs.md
├── Forest_Hills_POIs.md
├── Snow_Peaks_POIs.md
└── Southwest_Plains_POIs.md
```

---

## Validation

- [x] Output files exist and are not empty
- [x] 30 POIs created (6 per biome)
- [x] Each POI has: name, type, spawn rules, loot reference, narrative hook
- [x] Mix of types: exploration, hazards, lore, resources
- [x] Aligned with existing POI taxonomy from design docs

---

**Confidence**: HIGH
**Self-check**: PASS
