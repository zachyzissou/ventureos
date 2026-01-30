# Issue #959: BatchTerrainGenerator Not Using TerrainGenerationPipeline

## Status: FIXED

## Problem

The `BatchTerrainGenerator` was not properly using the `TerrainGenerationPipeline` architecture. When the pipeline's `TileGenerationStage` called `BatchTerrainGenerator.GenerateTilesIncremental()`, the method would call `GenerateWorldTiles(..., usePipeline: false)`, which bypassed the pipeline entirely.

This caused:
1. **Duplicate initialization** - Water systems, macro generation, edge persistence were initialized TWICE (once by pipeline stages, once by BatchTerrainGenerator)
2. **Wasted computation** - MacroMaskGenerationStage and WaterSystemInitStage work was being redone
3. **Potential inconsistencies** - Two separate initialization paths could lead to subtle bugs

### Code Flow Before Fix

```
Pipeline.Execute()
  → GlobalPrepStage (init edge DB, memory manager, BiomeConfigManager)
  → WaterSystemInitStage (init + generate rivers/lakes)
  → MacroMaskGenerationStage (setup MacroWorldGenerator)
  → TileGenerationStage
      → BatchTerrainProxy.GenerateTiles()
          → BatchTerrainGenerator.GenerateTilesIncremental()
              → GenerateWorldTiles(..., usePipeline: false)
                  → REDUNDANT: edge DB init, memory manager, BiomeConfigManager reload
                  → REDUNDANT: water system init + generation
                  → REDUNDANT: macro generator setup
                  → actual tile generation
```

## Solution

Added a `calledFromPipeline` parameter to `GenerateTilesIncremental` and `GenerateWorldTiles` methods. When `true`, skips all the initialization that the pipeline stages have already completed.

### Files Modified

1. **Assets/Scripts/Editor/BatchTerrainGenerator.cs**
   - Added `calledFromPipeline` parameter to `GenerateTilesIncremental()` (default: `false`)
   - Added `calledFromPipeline` parameter to `GenerateWorldTiles()` (default: `false`)
   - Wrapped initialization section in `if (!calledFromPipeline)` block
   - Added log message to indicate which initialization path is taken

2. **Assets/Scripts/WorldGeneration/Pipeline/Stages/TileGenerationStage.cs**
   - Updated `BatchTerrainProxy.GenerateTiles()` to pass `calledFromPipeline: true`
   - Added documentation explaining the change

### Code Flow After Fix

```
Pipeline.Execute()
  → GlobalPrepStage (init edge DB, memory manager, BiomeConfigManager)
  → WaterSystemInitStage (init + generate rivers/lakes)
  → MacroMaskGenerationStage (setup MacroWorldGenerator)
  → TileGenerationStage
      → BatchTerrainProxy.GenerateTiles()
          → BatchTerrainGenerator.GenerateTilesIncremental(..., calledFromPipeline: true)
              → GenerateWorldTiles(..., calledFromPipeline: true)
                  → SKIPPED: all redundant initialization
                  → actual tile generation (using pipeline-provided systems)
```

## Backward Compatibility

- **Direct calls to GenerateFullWorld()** continue to work (usePipeline: true by default)
- **Direct calls to GenerateTilesIncremental()** continue to work (calledFromPipeline: false by default)
- **Pipeline calls** now properly skip redundant initialization

## Testing

To verify the fix:
1. Run terrain generation via the pipeline (GenerateFullWorld or test region)
2. Check console logs for: `"[BatchTerrainGenerator] Using pipeline-initialized systems (skipping redundant initialization)"`
3. Verify terrain generates correctly
4. Compare generation time before/after fix (should be faster due to no duplicate work)

## Related Issues
- Related to TERRA-105, TERRA-300 (pipeline architecture improvements)
