# Bloom Asset Faction Audit Report

**Date:** 2025-07-13
**Auditor:** Clawd (Subagent: bloom-asset-faction-audit)
**Project:** C:\Users\Zachg\Development\Games\Bloom

## Summary

| Metric | Count |
|--------|-------|
| **Total .asset files scanned** | 235 |
| **Assets with faction references** | 8 |
| **Clean assets** | 8 |
| **Flagged assets (deprecated names)** | 0 |

✅ **STATUS: PASS** - No deprecated faction names found in any asset files.

---

## Assets with Faction References

### 1. Biome Presets (6 files)
These contain `supportsFactionOverlays` and `factionOverlays` fields (all empty arrays).

| File | Faction Reference | Status |
|------|-------------------|--------|
| `Assets/Environment/Biome Presets/BiomePreset_CentralGrasslands.asset` | `supportsFactionOverlays: 1`, `factionOverlays: []` | ✅ Clean |
| `Assets/Environment/Biome Presets/BiomePreset_EasternPlateaus.asset` | `supportsFactionOverlays: 1`, `factionOverlays: []` | ✅ Clean |
| `Assets/Environment/Biome Presets/BiomePreset_ForestHills.asset` | `supportsFactionOverlays: 1`, `factionOverlays: []` | ✅ Clean |
| `Assets/Environment/Biome Presets/BiomePreset_SnowPeaks.asset` | `supportsFactionOverlays: 1`, `factionOverlays: []` | ✅ Clean |
| `Assets/Environment/Biome Presets/BiomePreset_SouthwestPlains.asset` | `supportsFactionOverlays: 1`, `factionOverlays: []` | ✅ Clean |
| `Assets/Environment/Biome Presets/BiomePreset_WesternMountains.asset` | `supportsFactionOverlays: 1`, `factionOverlays: []` | ✅ Clean |

### 2. Detail Zone Profiles (2 files)
These contain serialized FactionType enum values (numeric).

| File | Faction Reference | Enum Value | Resolved Name | Status |
|------|-------------------|------------|---------------|--------|
| `Assets/Resources/WorldGeneration/DetailZones/FactionHub_SeventySeven_Profile.asset` | `faction: 3` | 3 | SeventySeven | ✅ Clean |
| `Assets/Resources/WorldGeneration/DetailZones/GreyreachDetailZone_Profile.asset` | `westernFaction: 0` | 0 | SkyBastion | ✅ Clean |
| `Assets/Resources/WorldGeneration/DetailZones/GreyreachDetailZone_Profile.asset` | `easternFaction: 1` | 1 | IronVultures | ✅ Clean |

---

## Deprecated Name Search Results

Searched for all deprecated faction names:

| Deprecated Name | Should Be | Found in Assets? |
|-----------------|-----------|------------------|
| ApexDynamics | *(context needed)* | ❌ Not found |
| RedCollective | *(unknown)* | ❌ Not found |
| NorthstarPMC | *(unknown)* | ❌ Not found |
| ScavengerUnion | *(unknown)* | ❌ Not found |
| GhostProtocol | *(unknown)* | ❌ Not found |
| "Vault Lexicon" | "Obsidian Archive" | ❌ Not found |
| "Corporate Combine" | "Trivector Combine" | ❌ Not found |

---

## Enum Mismatch Warning ⚠️

**Note:** Found two different `FactionType` enums in the codebase with different faction lists:

### Bloom.Narrative.FactionType (7 factions)
```
None = -1, Directorate = 0, Vultures = 1, Wardens = 2, 
SeventySeven = 3, PactOfAsh = 4, Roadborn = 5, Archive = 6
```

### Bloom.WorldGeneration.FactionType (10 factions)
```
SkyBastion = 0, IronVultures = 1, AegisCollective = 2, SeventySeven = 3,
HelixSyndicate = 4, Wayfarers = 5, ObsidianArchive = 6, NorthGuard = 7,
PactOfAsh = 8, ApexDynamics = 9
```

**Potential Issue:** The WorldGeneration enum includes `ApexDynamics` (listed as deprecated). This exists in **code** but NOT in any **asset files**.

---

## Directories Scanned

- `Assets/` (all .asset files)
- `Assets/Resources/` (99 assets)
- `Assets/Settings/` (11 assets)
- `Assets/Prefabs/` (0 .asset files found)

---

## Recommendations

1. **No asset fixes needed** - All asset files use valid faction references.

2. **Code review recommended** - Consider auditing the `Bloom.WorldGeneration.FactionType` enum which contains `ApexDynamics` if that name is truly deprecated.

3. **Enum consolidation** - The two `FactionType` enums have different faction lists and naming conventions (e.g., `Directorate` vs `SkyBastion`, `Vultures` vs `IronVultures`). This may cause confusion.

---

*Audit complete. No action required for asset files.*
