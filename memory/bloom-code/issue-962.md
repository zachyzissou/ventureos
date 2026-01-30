# Issue #962: Caves Never Generated - CaveSystemStage Not Executed

**Status:** Fixed  
**PR:** [#1128](https://github.com/zachyzissou/Bloom/pull/1128)  
**Date:** 2026-01-29

## Problem

The cave system was never being generated despite:
1. `CaveEntrance` being a registered macro feature type in `TerraFeatureRegistry`
2. `CaveGenerationSystem` class existing with cave mesh generation code
3. `TerraFeatureGenerators.GenerateCaveEntrance` creating surface depressions for cave entrances

**Root Cause:** There was no pipeline stage (`CaveSystemStage`) that actually invoked `CaveGenerationSystem` to generate the 3D cave networks. The `CaveEntrance` feature generator only created heightmap depressions for entrances - the actual cave mesh generation was never triggered.

## Solution

### Created `CaveSystemStage.cs`

New pipeline stage that:
1. Runs after `TileGenerationStage` (needs heightmaps) and before `EdgeSolverStage`
2. Scans all generated tiles for `CaveEntrance` macro features in biome configurations
3. Uses `CaveGenerationSystem` to generate procedural cave meshes
4. Creates cave GameObjects with MeshFilter, MeshRenderer, and MeshCollider
5. Supports deterministic generation via tile coordinates and world seed

Key implementation details:
- Falls back to `GameObject.Find` if terrain isn't in registry
- Uses custom hash combine function for .NET compatibility
- Gracefully skips when no tiles have cave features
- Stores cave statistics in stage data for reporting

### Updated `TerrainGenerationPipeline.cs`

1. Added `CaveSystemStage` to the stages list after `POIPlacementStage`
2. Updated pipeline documentation comment to include the new stage

Pipeline order is now:
1. GlobalPrepStage
2. WaterSystemInitStage
3. EcologyInitStage
4. MacroMaskGenerationStage
5. VegetationDistributionStage
6. TileGenerationStage
7. POIPlacementStage (Issue #960)
8. **CaveSystemStage** (NEW - Issue #962)
9. EdgeSolverStage
10. DetailZoneStage
11. VegetationDetailStage
12. ValidationStage

## Files Changed

- `Assets/Scripts/WorldGeneration/Pipeline/Stages/CaveSystemStage.cs` (new file, ~350 lines)
- `Assets/Scripts/WorldGeneration/Pipeline/TerrainGenerationPipeline.cs` (updated stage list and docs)

## Testing Notes

- Stage will skip if no tiles have `CaveEntrance` features
- Cave GameObjects are created under a "CaveSystem" parent
- Uses placeholder cave material if `Resources/Materials/CaveMaterial` doesn't exist
- Cave meshes have colliders for physics/navmesh integration

## Related Components

- `CaveGenerationSystem` - Actual mesh generation (placeholder implementation exists)
- `TerraFeatureGenerators.GenerateCaveEntrance` - Creates surface depressions
- `MacroFeatureType.CaveEntrance` - Feature enum value
- Biome configurations define which biomes can have caves
