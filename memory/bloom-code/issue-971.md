# Issue #971: Macro mask analysis generates full world during scoped runs

## Status: ✅ FIXED

## Problem
When running scoped/partial world generation (e.g., 3x3 or 9x9 test regions), the `MacroWorldGenerator.AnalyzeMask()` method was always iterating over all 1024 tiles in the world, regardless of the actual scope. This caused unnecessary full world generation during scoped runs.

## Root Cause
In `MacroWorldGenerator.AnalyzeMask()`, the tile list was always built from `worldSizeTiles`:
```csharp
var tileCoordsList = new List<Vector2Int>(worldSizeTiles * worldSizeTiles);
for (int tz = 0; tz < worldSizeTiles; tz++)
{
    for (int tx = 0; tx < worldSizeTiles; tx++)
    {
        tileCoordsList.Add(new Vector2Int(tx, tz));
    }
}
```

The `TileGenerationContext.TilesToGenerate` property, which contains the actual scoped tiles, was never used.

## Solution
1. Added optional `scopedTiles` parameter to `MacroWorldGenerator.AnalyzeMask()`:
   ```csharp
   public MacroMaskStatistics AnalyzeMask(
       PeninsulaGridLayout gridLayout,
       IReadOnlyList<Bloom.WorldGeneration.BiomeType> featureBiomes,
       int worldSizeTiles,
       IReadOnlyList<Vector2Int> scopedTiles = null)
   ```

2. When `scopedTiles` is provided and non-empty, only those tiles are analyzed:
   ```csharp
   if (scopedTiles != null && scopedTiles.Count > 0)
   {
       var uniqueTiles = new HashSet<Vector2Int>(scopedTiles);
       tileCoordsList = new List<Vector2Int>(uniqueTiles);
   }
   ```

3. Updated `MacroMaskGenerationStage.Execute()` to pass the scoped tiles:
   ```csharp
   var scopedTiles = context.TilesToGenerate;
   var stats = macroGenerator.AnalyzeMask(grid, featureBiomeList, worldConfig.worldSizeTiles, scopedTiles);
   ```

## Files Modified
- `Assets/Scripts/Terrain/MacroFeatures/MacroWorldGenerator.cs`
- `Assets/Scripts/WorldGeneration/Pipeline/Stages/MacroMaskGenerationStage.cs`

## Branch
`fix/issue-971-macro-mask-scoped-runs-v2`

## Commit
`d25b4e7ae` - fix: Macro mask analysis respects scoped runs instead of generating full world

## PR
Create at: https://github.com/zachyzissou/Bloom/pull/new/fix/issue-971-macro-mask-scoped-runs-v2

## Backward Compatibility
- The `scopedTiles` parameter has a default value of `null`
- Existing calls without the parameter continue to work (full world analysis)
- The `BatchTerrainGenerator` and test files use the 3-parameter signature and will continue to analyze full world

## Testing Recommendations
1. Run a 3x3 scoped generation and verify logs show "Analyzing 9 scoped tiles" instead of "Analyzing 1024 tiles"
2. Run a full world generation and verify it still analyzes all 1024 tiles
3. Ensure existing tests pass with the new optional parameter
