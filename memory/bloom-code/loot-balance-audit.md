# Bloom Loot Table Balancing Audit

**Date:** 2026-01-28  
**Status:** ⚠️ Critical Gaps Found  
**Severity:** HIGH - No loot tables implemented despite system being ready

---

## Executive Summary

The loot system architecture is **well-designed and complete**, but **zero loot tables have been created**. All enemies have null loot table references. This means players cannot receive loot from combat encounters - a core extraction shooter loop is broken.

### Critical Findings

| Issue | Severity | Impact |
|-------|----------|--------|
| No LootTable assets exist | 🔴 Critical | Enemies drop nothing |
| Enemy loot references null | 🔴 Critical | Combat has no reward |
| No rarity system | 🟡 Medium | Progression lacks excitement |
| No faction drops | 🟡 Medium | Faction identity underutilized |
| No zone-based tables | 🟡 Medium | Risk/reward curve flat |

---

## Current System Architecture

### Code Components (All Functional ✅)

```
LootTable.cs          - ScriptableObject with Drop[] array
├── Drop.loot         - LootDefinition reference
├── Drop.resource     - ResourceMaterial reference  
├── Drop.quantity     - Stack size
├── Drop.dropChance   - 0-1 probability
└── Drop.weight       - Relative selection weight

LootDefinition.cs     - Individual loot item definition
├── displayName, icon, color
├── baseValue         - Credit worth
└── isBlueprint       - Unlocks recipes

ResourceMaterial.cs   - Crafting material definition
├── materialId        - String key
├── displayName
├── weight            - Carry weight
└── baseValue         - Sell price

EncounterDefinition.cs - Supports tiered loot
├── LootEntry.requiredTier - Tier-gated drops
└── bossGuaranteedLoot     - Boss rewards

EnemyDefinition.cs    - Has lootTable field (unused!)
```

### Existing Assets

#### LootDefinitions (3 total - POI only)
| Asset | baseValue | Purpose |
|-------|-----------|---------|
| POI_Loot_AmmoCache | 30 | Yellow, ammo themed |
| POI_Loot_MedSupplies | 40 | Green, medical |
| POI_Loot_Salvage | 50 | Cyan, generic salvage |

#### ResourceMaterials (11 total)
| Material | ID | Base Value | Tier |
|----------|----|-----------:|------|
| Contaminated Water | dirty_water | 1 | Common |
| Nutrient Slurry | food_scraps | 2 | Common |
| Metal Scrap | metal_scrap | 3 | Common |
| Wood Planks | wood | 3 | Common |
| Sterile Cloth | cloth | 4 | Common |
| Medical Plastics | plastic | 4 | Common |
| Stabilized Gunpowder | gunpowder | 5 | Uncommon |
| Resin Binder | resin | 5 | Uncommon |
| Antiseptic Alcohol | alcohol | 6 | Uncommon |
| Micro Components | components | 8 | Rare |
| Filter Media | filter_media | 10 | Rare |

#### Enemies (5 defined)
| Enemy | Tier | HP | XP | lootTable |
|-------|------|---:|---:|-----------|
| Grunt | 1 | 50 | 10 | ❌ null |
| Rusher | 1 | 40 | 15 | ❌ null |
| Marksman | 1 | 45 | 15 | ❌ null |
| Brute | 2 | 120 | 30 | ❌ null |
| Stalker | 2 | 60 | 40 | ❌ null |

#### LootTables
**⚠️ ZERO ASSETS EXIST**

---

## Rarity Distribution Analysis

### Current State
No rarity enum implemented. The `LootRarity` in CalloutSystemExample.cs is **example-only placeholder code**.

### Recommended Rarity System
```csharp
public enum ItemRarity
{
    Common = 0,     // 60% of drops, gray/white
    Uncommon = 1,   // 25% of drops, green
    Rare = 2,       // 12% of drops, blue
    Epic = 3,       // 2.5% of drops, purple
    Legendary = 4   // 0.5% of drops, orange/gold
}
```

### Value Multipliers by Rarity
| Rarity | Drop Rate | Value Mult | Suggested Color |
|--------|-----------|------------|-----------------|
| Common | 60% | 1.0x | White |
| Uncommon | 25% | 2.0x | Green |
| Rare | 12% | 5.0x | Blue |
| Epic | 2.5% | 15.0x | Purple |
| Legendary | 0.5% | 50.0x | Orange |

---

## Faction-Specific Drops

### Current State
No faction-specific loot exists. Factions are defined but not tied to drops.

### Recommended Faction Loot

| Faction | Signature Material | Specialty Drops |
|---------|-------------------|-----------------|
| Directorate | MRE_Directive, Executive_Meds | High-tech components, military gear |
| Vultures | Salvage_Prime, Scrap_Refined | Extra materials from corpses, junk valuable |
| Wardens | Purified_Supplies, Barricade_Kit | Medical++, defensive items |
| SeventySeven | Universal_Parts | Cross-faction tradeable goods |
| PactOfAsh | Ashway_Spice, Victory_Jerky | Food buffs, fire-themed |
| Roadborn | Trail_Cache, Weather_Wrap | Portable crafting, survival gear |
| Archive | Data_Shard, Synth_Formula | Blueprints, tech recipes |

---

## Progression Balance Analysis

### Zone Tier Structure (Recommended)

| Zone Tier | Risk Level | Enemy Tiers | Loot Quality | Material Tier |
|-----------|------------|-------------|--------------|---------------|
| Tier 1 (Starter) | Low | T1 only | Common, 10% Uncommon | Common materials |
| Tier 2 (Mid) | Medium | T1+T2 mix | 50% Uncommon, 5% Rare | Uncommon materials |
| Tier 3 (Dangerous) | High | T2+Bosses | 30% Rare, 3% Epic | Rare materials |
| Boss Events | Extreme | T3 Bosses | Epic++, Guaranteed Legendaries | Unique drops |

### Risk/Reward Curve

```
Value per Run (Expected)
│
│                    ╭─── Boss Zone (High Risk)
│                   ╱
│              ╭───╯  ← Tier 3 (Dangerous)
│             ╱
│        ╭───╯  ← Tier 2 (Mid)
│       ╱
│  ╭───╯  ← Tier 1 (Starter)
│ ╱
└─────────────────────────────────────────
  Low Risk                     High Risk
```

### Current Gaps
1. **No zone difficulty system** - Maps don't scale loot by area
2. **No extraction multiplier** - Escaping with loot should bonus value
3. **No kill streak bonus** - Sustained combat unrewarded
4. **No time pressure** - Staying longer should increase risk AND reward

---

## Recommendations

### Priority 1: Create Core Loot Tables (CRITICAL)

1. **Create LootTable assets:**
   - `LootTable_Grunt.asset` (Tier 1 enemies)
   - `LootTable_Elite.asset` (Tier 2 enemies)
   - `LootTable_Boss.asset` (Tier 3 enemies)
   - `LootTable_POI_Tier1.asset` (Starter zone POIs)
   - `LootTable_POI_Tier2.asset` (Mid zone POIs)
   - `LootTable_POI_Tier3.asset` (Dangerous zone POIs)

2. **Assign to enemies:**
   - Grunt, Rusher, Marksman → LootTable_Grunt
   - Brute, Stalker → LootTable_Elite
   - (Future bosses) → LootTable_Boss

### Priority 2: Implement Rarity System

1. Add `ItemRarity` enum to LootDefinition
2. Add rarity-based visual effects (glow, particles)
3. Implement rarity-weighted drop tables

### Priority 3: Zone-Based Loot Scaling

1. Add `ZoneTier` to POIDefinition or create ZoneData ScriptableObject
2. Scale drop rates by zone tier
3. Gate high-tier materials to dangerous zones

### Priority 4: Faction Drops

1. Add faction-specific LootDefinitions
2. Create faction loot tables that override/augment base drops
3. Tie to reputation rewards

---

## Loot Table Specifications

### Tier 1 Enemy Loot (Grunts)
```yaml
LootTable_Grunt:
  drops:
    - resource: metal_scrap, qty: 1-2, chance: 80%, weight: 3
    - resource: cloth, qty: 1, chance: 50%, weight: 2
    - resource: dirty_water, qty: 1, chance: 40%, weight: 2
    - resource: food_scraps, qty: 1, chance: 30%, weight: 1
    - resource: gunpowder, qty: 1, chance: 10%, weight: 1
```

### Tier 2 Enemy Loot (Elites)
```yaml
LootTable_Elite:
  drops:
    - resource: metal_scrap, qty: 2-4, chance: 90%, weight: 2
    - resource: components, qty: 1, chance: 40%, weight: 2
    - resource: gunpowder, qty: 1-2, chance: 60%, weight: 2
    - resource: resin, qty: 1-2, chance: 50%, weight: 2
    - resource: alcohol, qty: 1, chance: 30%, weight: 1
    - resource: filter_media, qty: 1, chance: 5%, weight: 1
```

### Tier 3 Boss Loot
```yaml
LootTable_Boss:
  guaranteed:
    - resource: components, qty: 3-5
    - resource: filter_media, qty: 1-2
  drops:
    - loot: Blueprint_Rare (new), chance: 25%, weight: 1
    - loot: LegendaryWeaponMod (new), chance: 5%, weight: 1
    - resource: (all uncommon+), qty: 2-5, chance: 100%, weight: 3
```

---

## Missing LootDefinitions Needed

### Core Items (Create These)
| Item | Type | Base Value | Purpose |
|------|------|------------|---------|
| Ammo_Rifle_Dropped | Consumable | 15 | Found ammo stacks |
| Medkit_Field | Consumable | 35 | Mid-tier healing |
| Blueprint_Common | Blueprint | 100 | Unlocks T1 recipes |
| Blueprint_Rare | Blueprint | 500 | Unlocks T2 recipes |
| Blueprint_Epic | Blueprint | 2000 | Unlocks T3 recipes |
| Harvester_Tech | Special | 1000 | Faction-neutral rare |
| Data_Core | Special | 250 | Intel/quest item |

### Faction-Specific (Future)
- Directorate_Ration, Vulture_Scrap, Warden_Kit, etc.

---

## File Locations

### ScriptableObject Paths
```
Assets/Content/Data/FirstPlayable/
├── Loot/
│   ├── Materials/     ← 11 ResourceMaterial assets
│   ├── Definitions/   ← CREATE: LootDefinition assets
│   └── Tables/        ← CREATE: LootTable assets
├── Enemies/           ← 5 EnemyDefinition assets (need loot assigned)
└── Crafting/Recipes/  ← 10 recipe assets
```

---

## Validation Checklist

- [ ] LootTable_Grunt created and assigned to T1 enemies
- [ ] LootTable_Elite created and assigned to T2 enemies
- [ ] LootTable_Boss created for future T3
- [ ] Zone-based POI loot tables created
- [ ] ItemRarity enum added to LootDefinition
- [ ] At least 10 new LootDefinition assets created
- [ ] All enemies have non-null lootTable references
- [ ] Playtest confirms loot drops on kill

---

## Self-Validation

```
VALIDATION:
- Output file: C:\Users\Zachg\clawd\memory\bloom-code\loot-balance-audit.md ✓ exists
- Completeness: complete
- Self-check: PASS - All sections filled, analysis verified against source files
- Confidence: high
```
