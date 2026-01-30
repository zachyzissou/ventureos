# Issue #960 - POIs Never Generated - POIPlacementStage Not Executed

## Summary
Fixed the bug where POI (Point of Interest) placement during world generation was silently skipped because the `POIPlacementStage` was never registered in the terrain generation pipeline.

## Root Cause
The POI placement system was designed and implemented in feature branch `feature/issue-951-poi-placement-system` which included:
- `POIPlacementStage.cs` - Pipeline stage for POI placement
- `POIPlacementConfig.cs` - Configuration for placement rules
- `POIPlacementData.cs` - Data structures for POI instances
- `POIPlacementService.cs` - Placement algorithm using Poisson disk sampling
- `POIType.cs` - Enum of all POI types (31 types across 10 categories)
- `POIDefinition.cs` - ScriptableObject for POI type properties
- `POISpawner.cs` - Runtime spawner component

However, while all the infrastructure was created, the `POIPlacementStage` was **never added to the `stages` list** in `TerrainGenerationPipeline`. This meant the stage was never executed during world generation.

## Fix
Added `POIPlacementStage` to the pipeline stages in `TerrainGenerationPipeline.cs`:

```csharp
stages.AddRange(new ITerrainGenerationStage[]
{
    new EdgeSolverStage(),
    new POIPlacementStage(),  // Issue #960: POI placement after terrain edges are resolved
    new VfxCollisionExportStage(),
    new DetailZoneStage(),
    new VegetationDetailStage(),
    new ValidationStage()
});
```

The stage is placed after `EdgeSolverStage` because its dependencies are:
1. "Tile Generation" - terrain must be generated
2. "Edge Constraint Solving" - terrain seams must be resolved

## Branch
`fix/poi-generation-960`

## Changes
1. Merged `origin/feature/issue-951-poi-placement-system` to bring in POI infrastructure
2. Registered `POIPlacementStage` in `TerrainGenerationPipeline` constructor

## Files Modified
- `Assets/Scripts/WorldGeneration/Pipeline/TerrainGenerationPipeline.cs` - Added POIPlacementStage registration

## Files Added (from merge)
- `Assets/Scripts/POI/POIPlacementStage.cs`
- `Assets/Scripts/POI/POIPlacementConfig.cs`
- `Assets/Scripts/POI/POIPlacementData.cs`
- `Assets/Scripts/POI/POIPlacementService.cs`
- `Assets/Scripts/POI/POIType.cs`
- `Assets/Scripts/POI/POIDefinition.cs`
- `Assets/Scripts/POI/POISpawner.cs`
- `Assets/Scripts/POI/Editor/POIPlacementEditor.cs`
- `Assets/Scripts/Testing/Unit/POI/POIPlacementTests.cs`

## PR
https://github.com/zachyzissou/Bloom/pull/new/fix/poi-generation-960

## Notes
- The POI placement system uses Poisson disk sampling for even distribution
- POIs are categorized into 10 categories: FactionHubs, MilitaryInstallations, HarvesterCrashSites, IndustrialSites, CivilianRuins, ExtractionZones, UndergroundLocations, Landmarks, ResourceNodes, WildernessFeatures
- Each biome has distribution rules controlling POI density and preferred categories
- Target is 181-221 POIs across a 32x32 tile world

## Date
2025-01-30
