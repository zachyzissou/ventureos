# Duplicate Class Names Fixed - Issue #1067

**Date:** 2026-01-29
**Branch:** fix/duplicate-class-names-1067
**Status:** COMPLETE

## Summary

Fixed 20 duplicate class files in the WorldGeneration system that were causing namespace conflicts and potential compilation issues.

## Problem

The codebase had duplicate .cs files:
- 19 files in `Assets/Scripts/WorldGeneration/` root that duplicated files in organized subfolders
- 1 duplicate `GenerateSplatmapJob` struct in `Jobs/SplatmapGenerationJob.cs`

Root files and subfolder files had the **same namespace** (`Bloom.WorldGeneration`), causing:
- Compile-time ambiguity errors
- Confusion about which file to maintain
- Potential for divergent implementations

## Files Deleted (20 total)

### WorldGeneration Root Duplicates (19 files)
All these files had organized equivalents in subfolders:

| Deleted Root File | Kept Subfolder File |
|-------------------|---------------------|
| EdgeContractManager.cs | Edge/EdgeContractManager.cs |
| PeninsulaGridLayout.cs | Configuration/PeninsulaGridLayout.cs |
| RockyShoreGenerator.cs | Coastal/RockyShoreGenerator.cs |
| SeamHeatmapGenerator.cs | Utils/SeamHeatmapGenerator.cs |
| ParallelTileGenerator.cs | TerrainGeneration/ParallelTileGenerator.cs |
| EdgeStitcher.cs | Edge/EdgeStitcher.cs |
| EdgeConstraintGraph.cs | Edge/EdgeConstraintGraph.cs |
| TexturePainter.cs | Texture/TexturePainter.cs |
| TerrainTileGenerator.cs | TerrainGeneration/TerrainTileGenerator.cs |
| WetlandGenerator.cs | Coastal/WetlandGenerator.cs |
| TileMemoryManager.cs | TerrainGeneration/TileMemoryManager.cs |
| BeachGenerator.cs | Coastal/BeachGenerator.cs |
| DetailTileEdgeContract.cs | Edge/DetailTileEdgeContract.cs |
| CoastalSegmentGenerator.cs | Coastal/CoastalSegmentGenerator.cs |
| DetailZoneConfig.cs | Configuration/DetailZoneConfig.cs |
| BiomeSettings.cs | Configuration/BiomeSettings.cs |
| BiomeFirstGenerationOrder.cs | Configuration/BiomeFirstGenerationOrder.cs |
| CoastalHeightModifier.cs | Coastal/CoastalHeightModifier.cs |
| CliffGenerator.cs | Coastal/CliffGenerator.cs |

### Duplicate Job (1 file)
| Deleted | Kept |
|---------|------|
| Jobs/SplatmapGenerationJob.cs | Jobs/TerraRasterizationJobs.cs (nested struct) |

The nested `GenerateSplatmapJob` in `TerraRasterizationJobs.cs` is the actively used version.

## Analysis: Classes NOT Changed

Several class names appear multiple times but are **intentionally distinct**:

### Different Namespaces (Intentional)
- `ClimateIntegrationStage` - Climate vs Pipeline namespace (different purposes)
- `ThermalErosionStage` - Erosion (algorithm) vs Pipeline (wrapper)
- `HydraulicErosionStage` - Erosion (algorithm) vs Pipeline (wrapper)
- `QuestDefinition` - Narrative.Quests vs Gameplay.FirstPlayable.Quests
- `POIDefinition` - Gameplay.Encounters vs WorldGeneration.POI
- `FirstPlayableBootstrap` - Gameplay vs Scenes

### Nested Types (No Conflict)
- `ResourceReward` - Nested in BossDefinition, BaseDefenseController, QuestDefinition
- `LootReward` - Nested in BossDefinition, BossEncounterController
- `ValidationResult` - Nested in EdgeContractValidator, NavMeshContinuityValidator
- `Baker` - Nested in DOTS authorings
- `PerformanceMetrics` - Nested in performance test classes

These are properly scoped and don't cause conflicts.

## Verification

After deletion:
- Subfolder versions remain as single source of truth
- All subfolder files have proper namespaces and organization
- Meta files deleted to prevent Unity ghost references

## Recommendations

1. **Enforce folder organization** - All new WorldGeneration code should go in appropriate subfolders
2. **Add linting rule** - Flag classes in root WorldGeneration folder
3. **Consider namespace validation** - Add CI check for duplicate class names in same namespace

## Related Issues
- #1059 - EdgeDirection enum consolidation (already done)
- #1067 - This fix

## Push Status

⚠️ **LFS Quota Exceeded** - GitHub LFS storage quota for this repository is exceeded.
The commit is ready locally on branch `fix/duplicate-class-names-1067`.

To complete:
1. Increase GitHub LFS quota OR clean up LFS objects
2. Run: `git push -u origin fix/duplicate-class-names-1067`
3. Create PR via GitHub

---
**OUTPUT FOOTER:**
```
STATUS: PARTIAL
DUPLICATES_FIXED: 20
FILES_MODIFIED: 40 (20 .cs + 20 .meta deleted)
COMMIT: 64a45af40 (local)
BRANCH: fix/duplicate-class-names-1067
PR_CREATED: N/A (blocked by LFS quota)
```
