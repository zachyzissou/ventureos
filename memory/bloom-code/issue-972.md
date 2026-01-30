# Issue #972: Terrain Shows Checkered/Faceted Shading Artifacts

## Problem
Terrain in Bloom was displaying checkered or faceted shading artifacts, particularly visible on terrain edges and after heightmap modifications.

## Root Cause
The checkered/faceted shading artifacts occur because Unity's HDRP terrain rendering relies on a normal map that is generated from the heightmap. When `SetHeights()` is called to modify the terrain heightmap, the normal map is NOT automatically regenerated. This results in stale normals that cause incorrect lighting calculations.

The issue is documented in Unity's API: `TerrainData.SyncHeightmap()` must be called after `SetHeights()` to synchronize the heightmap changes with the internal representation used for rendering, including normal map regeneration.

## Solution
Added `SyncHeightmap()` and `Flush()` calls after every `SetHeights()` call in the following locations:

### Files Modified

1. **`Assets/Scripts/Editor/WorldGeneration/EdgeConstraintSolver.cs`**
   - In `ApplyToTerrains()` method
   - This was the main culprit as edge solving modifies heightmaps AFTER initial terrain generation

2. **`Assets/Scripts/Editor/WorldGeneration/MultiPassEdgeRefiner.cs`**
   - In `RefineTilesInternal()` method
   - Edge refinement pass that also modifies heightmaps post-generation

3. **`Assets/Scripts/WorldGeneration/Pipeline/Stages/ThermalErosionStage.cs`**
   - In `Execute()` method
   - Optional erosion post-processing stage

4. **`Assets/Scripts/WorldGeneration/Pipeline/Stages/HydraulicErosionStage.cs`**
   - In `Execute()` method
   - Optional erosion post-processing stage

### Code Pattern
```csharp
terrainData.SetHeights(0, 0, heightmap);

// Issue #972: Sync heightmap to regenerate terrain normal texture
// Without this, HDRP per-pixel normals show checkered/faceted shading artifacts
terrainData.SyncHeightmap();
terrain.Flush();
```

## Notes
- `ConfigureTerrainTextures()` in `BatchTerrainGenerator.cs` already had this fix (added in issue #1007)
- The fix was missing in other code paths that modify heightmaps after initial generation
- `Flush()` is also called to ensure Unity processes all terrain changes immediately

## Branch
`fix/terrain-shading-972`

## PR
https://github.com/zachyzissou/Bloom/pull/new/fix/terrain-shading-972

## Status
- [x] Branch created
- [x] Fix implemented
- [x] Committed
- [x] Pushed to origin
- [ ] PR created (requires manual creation via GitHub web interface or gh CLI)

## Testing
To verify the fix:
1. Generate a terrain region (e.g., 3x3 test region)
2. Observe terrain edges and areas where erosion/edge solving occurred
3. The terrain should display smooth, continuous shading without checkered patterns
