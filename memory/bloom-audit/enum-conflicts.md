# Bloom Enum & Type Conflicts Audit Report

**Date:** 2025-01-13
**Project:** C:\Users\Zachg\Development\Games\Bloom

---

## Executive Summary

Found **4 major type conflicts** requiring resolution:
1. **FactionType** - 3 conflicting definitions across namespaces
2. **EdgeDirection** - 2 conflicting definitions (Services vs WorldGeneration)
3. **UINotificationType** - 2 identical definitions (Narrative vs UI)
4. **Nested FactionType** - Divergent local enum in BiomeTerrainPreset

---

## 1. FactionType Enum Conflicts ⚠️ CRITICAL

### Conflicting Definitions

#### Definition A: `Bloom.Narrative.FactionType` (CANONICAL - Gameplay)
**File:** `Assets/Scripts/Narrative/FactionType.cs`

```csharp
public enum FactionType
{
    None = -1,       // No faction requirement
    Directorate = 0, // Sky Bastion Directorate (FCT_DIR)
    Vultures = 1,    // Iron Vultures (FCT_VUL)
    Wardens = 2,     // Truce Wardens (FCT_WAR)
    SeventySeven = 3,// The Seventy-Seven (FCT_F77)
    PactOfAsh = 4,   // Pact of Ash (FCT_ASH)
    Roadborn = 5,    // Roadborn Clans (FCT_NOM)
    Archive = 6      // Obsidian Archive (FCT_VAR)
}
```

**Purpose:** Player faction system, reputation, abilities
**Used by:** 50+ files in Gameplay, Networking, Crafting, Quests

---

#### Definition B: `Bloom.WorldGeneration.FactionType` (WORLD GEN)
**File:** `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`

```csharp
public enum FactionType
{
    SkyBastion,      // Different name for Directorate
    IronVultures,    // Different name for Vultures
    AegisCollective, // No equivalent in Narrative
    SeventySeven,    // Same
    HelixSyndicate,  // No equivalent in Narrative
    Wayfarers,       // No equivalent in Narrative
    ObsidianArchive, // Similar to Archive
    NorthGuard,      // No equivalent in Narrative
    PactOfAsh,       // Same
    ApexDynamics     // No equivalent in Narrative
}
```

**Purpose:** Terrain generation, faction hub placement
**Used by:** DetailZoneGeneratorUtility, FactionHubDetailZone, GreyreachDistrictDetailZone

---

#### Definition C: `Bloom.Terrain.BiomeTerrainPreset.FactionType` (NESTED)
**File:** `Assets/Scripts/Terrain/BiomeTerrainPreset.cs` (line 118)

```csharp
public enum FactionType
{
    None,
    Directorate,
    Free77,          // Different name for SeventySeven
    ApexDynamics,
    RedCollective,   // No equivalent anywhere
    NorthstarPMC,    // No equivalent anywhere
    ScavengerUnion,  // No equivalent anywhere
    GhostProtocol    // No equivalent anywhere
}
```

**Purpose:** Terrain overlay colors/materials per faction
**Used by:** BiomeTerrainPreset.FactionOverlaySettings

---

### Recommended Resolution

**Canonical:** `Bloom.Narrative.FactionType`

**Rationale:**
- Most comprehensive documentation
- Used by gameplay systems (player-facing)
- Explicit integer values for serialization stability
- Includes `None = -1` for optional requirements

**Migration Plan:**

1. **WorldGeneration.FactionType → Create mapping utility**
   ```csharp
   // In Assets/Scripts/WorldGeneration/Configuration/FactionTypeMapper.cs
   public static class FactionTypeMapper
   {
       public static Narrative.FactionType ToNarrative(WorldGeneration.FactionType wgFaction)
       {
           return wgFaction switch
           {
               WorldGeneration.FactionType.SkyBastion => Narrative.FactionType.Directorate,
               WorldGeneration.FactionType.IronVultures => Narrative.FactionType.Vultures,
               WorldGeneration.FactionType.AegisCollective => Narrative.FactionType.Wardens, // Map to closest
               WorldGeneration.FactionType.SeventySeven => Narrative.FactionType.SeventySeven,
               WorldGeneration.FactionType.ObsidianArchive => Narrative.FactionType.Archive,
               WorldGeneration.FactionType.PactOfAsh => Narrative.FactionType.PactOfAsh,
               _ => Narrative.FactionType.None
           };
       }
   }
   ```

2. **BiomeTerrainPreset.FactionType → Replace with Narrative.FactionType**
   - Add `using Bloom.Narrative;` 
   - Delete nested enum
   - Update `FactionOverlaySettings.faction` type

3. **Long-term:** Deprecate `WorldGeneration.FactionType`, unify on Narrative

---

## 2. EdgeDirection Enum Conflicts ⚠️ HIGH

### Conflicting Definitions

#### Definition A: `Bloom.WorldGeneration.EdgeDirection`
**File:** `Assets/Scripts/WorldGeneration/Edge/TileEdgeContract.cs` (line 7)

```csharp
public enum EdgeDirection
{
    North,  // +Z
    South,  // -Z
    East,   // +X
    West    // -X
}
```

**Used by:** TileEdgeContract, EdgeStitcher, EdgeConstraintGraph, and ~20 more files

---

#### Definition B: `Bloom.WorldGeneration.Services.EdgeDirection`
**File:** `Assets/Scripts/WorldGeneration/Services/IEdgeContractManager.cs` (line 8)

```csharp
public enum EdgeDirection
{
    North,
    South,
    East,
    West
}
```

**Used by:** IEdgeContractManager, EdgeContractManager, PredictiveTileContext

---

#### Additional Local Definitions (Private)
- `EdgeValidationTool.EdgeDirection` (Editor)
- `TerrainValidationSuite.EdgeDirection` (Editor)
- `NavMeshContinuityValidator.EdgeDirection` (Validation)

These are private/internal and acceptable.

---

### Current Workarounds (Technical Debt)
Multiple files use type aliases to manage the conflict:

```csharp
// BatchTerrainGenerator.cs
using TileEdgeDirection = Bloom.WorldGeneration.EdgeDirection;
using ServicesEdgeDirection = Bloom.WorldGeneration.Services.EdgeDirection;

// TerrainEdgeDatabase.cs
using TileEdgeDirection = Bloom.WorldGeneration.EdgeDirection;
using PersistenceEdgeDirection = Bloom.WorldGeneration.Services.EdgeDirection;
```

---

### Recommended Resolution

**Canonical:** `Bloom.WorldGeneration.EdgeDirection`

**Rationale:**
- More widely used (20+ files vs 5 files)
- Has directional comments (+Z, -Z, etc.)
- Located in dedicated Edge folder

**Migration Plan:**

1. **Remove Services.EdgeDirection**
   - Update `IEdgeContractManager.cs` to use `Bloom.WorldGeneration.EdgeDirection`
   - Update `EdgeContractManager.cs` to use same
   - Remove `using` aliases from all files

2. **Files to update:**
   - `IEdgeContractManager.cs` - Change namespace reference
   - `EdgeContractManager.cs` - Remove duplicate enum
   - `PredictiveTileContext.cs` - Update using statements
   - `BatchTerrainGenerator.cs` - Remove aliases
   - `TerrainEdgeDatabase.cs` - Remove aliases
   - `EdgeContractTools.cs` - Remove aliases
   - `MultiPassEdgeRefiner.cs` - Remove aliases

---

## 3. UINotificationType Enum Duplication ⚠️ MEDIUM

### Conflicting Definitions

#### Definition A: `Bloom.Narrative.UINotificationType`
**File:** `Assets/Scripts/Narrative/IUINotificationService.cs` (line 32)

```csharp
public enum UINotificationType
{
    Info = 0,
    Success = 1,
    Warning = 2,
    Error = 3,
    Locked = 4,
    Quest = 5
}
```

---

#### Definition B: `Bloom.UI.UINotificationType`
**File:** `Assets/Scripts/UI/UINotificationType.cs`

```csharp
public enum UINotificationType
{
    Info = 0,
    Success = 1,
    Warning = 2,
    Error = 3,
    Locked = 4,
    Quest = 5
}
```

**These are IDENTICAL** - pure duplication.

---

### Recommended Resolution

**Canonical:** `Bloom.UI.UINotificationType`

**Rationale:**
- UI-related enum belongs in UI namespace
- Dedicated file (better discoverability)
- More detailed documentation

**Migration Plan:**

1. **Update IUINotificationService.cs:**
   - Add `using Bloom.UI;`
   - Remove inline enum definition

2. **Add comment in Narrative namespace:**
   ```csharp
   // UINotificationType moved to Bloom.UI.UINotificationType
   // Use: using Bloom.UI;
   ```

---

## 4. Other Potential Conflicts

### BiomeType - RESOLVED ✅
Comment in `Assets/Scripts/Terrain/BiomeTypes.cs` indicates:
> "NOTE: BiomeType enum has been consolidated to Bloom.WorldGeneration.BiomeType."

BiomeTypeUtility provides pass-through compatibility.

### CalloutType - Single Definition ✅
Only in `PlayerCalloutSystem.cs` - no conflict.

### MacroFeatureType - Single Definition ✅
Only in `Assets/Scripts/Terrain/MacroFeatures/MacroFeatureType.cs` - no conflict.

---

## Migration Priority

| Priority | Conflict | Impact | Effort | Files Affected |
|----------|----------|--------|--------|----------------|
| P0 | EdgeDirection | High (compile) | Medium | ~15 files |
| P1 | FactionType | High (runtime) | High | ~50 files |
| P2 | UINotificationType | Low (identical) | Low | 2 files |
| P3 | BiomeTerrainPreset.FactionType | Medium | Low | 1 file |

---

## Action Items

### Immediate (P0)
- [ ] Create `FactionTypeMapper.cs` utility class
- [ ] Consolidate EdgeDirection to single definition
- [ ] Remove type aliases from edge-related files

### Short-term (P1)
- [ ] Migrate BiomeTerrainPreset to use Narrative.FactionType
- [ ] Remove Bloom.UI.UINotificationType duplicate
- [ ] Update IUINotificationService to reference UI namespace

### Long-term (P2)
- [ ] Deprecate WorldGeneration.FactionType
- [ ] Add [Obsolete] attributes during transition
- [ ] Document canonical type locations in TYPES.md

---

## Appendix: Files Using Multiple FactionType Definitions

Files that import both namespaces (potential runtime confusion):
- `DetailZoneGeneratorUtility.cs` - Uses WorldGeneration.FactionType
- `FactionAbilitySystem.cs` - Uses Narrative.FactionType
- `CraftingRecipe.cs` - Uses Narrative.FactionType
- `NetworkPlayerSpawner.cs` - Uses Narrative.FactionType

No files currently import BOTH definitions simultaneously, but the risk exists.
