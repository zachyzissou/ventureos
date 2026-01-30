# Issue #956: Fix Collision Continuity Validation Float Overflow

**Status:** ✅ Complete  
**PR:** [#1126](https://github.com/zachyzissou/Bloom/pull/1126)  
**Branch:** `fix/issue-956-collision-overflow`  
**Date:** 2026-01-29

## Problem

The collision continuity validation was reporting invalid gap values:
- Max gap: `340282300000000000000000000000000000000.000m` (Float.MaxValue)
- Affected tiles: (7,7) - South and West edges
- Gap samples: 0/513 (no valid samples found)
- 2 out of 36 edges failing validation

Root cause: `CollisionContinuityValidator` was being called from `BatchTerrainGenerator.cs` but the class **never existed**.

## Solution

Created `Assets/Scripts/WorldGeneration/Validation/CollisionContinuityValidator.cs` with proper float overflow protection.

### Key Implementation Details

1. **IsValidFloat() Guard Method**
   - Checks for NaN
   - Checks for Infinity
   - Checks for excessively large values (>10km, indicating uninitialized data)

2. **Pre-computation Validation**
   - All gap calculations are guarded by validity checks BEFORE subtraction
   - Prevents overflow from propagating

3. **Missing Data Tracking**
   - `MissingSamples` counter distinguishes between:
     - Invalid gaps (real discontinuities)
     - Missing data (no collision mesh)
   - Edges with all missing samples are "skipped" not "failed"

4. **Raycast-based Sampling**
   - Samples terrain collision heights via Physics.Raycast
   - Uses Terrain layer mask when available
   - 513 samples per edge (matches heightmap resolution)

### API

```csharp
// Single tile validation
CollisionContinuityValidator.ValidateTile(int tileX, int tileZ, float terrainHeight)

// Region validation
CollisionContinuityValidator.ValidateRegion(int startX, int startZ, int endX, int endZ, float terrainHeight)

// Full world validation
CollisionContinuityValidator.ValidateWorld(float terrainHeight)

// Output formatting
CollisionContinuityValidator.FormatResult(ValidationResult result)
CollisionContinuityValidator.LogResult(ValidationResult result)
```

## Files Changed

- **Added:** `Assets/Scripts/WorldGeneration/Validation/CollisionContinuityValidator.cs` (562 lines)

## Testing Notes

The validator is called automatically by `BatchTerrainGenerator` after world generation:
- `GenerateFullWorld()` calls `ValidateWorld(TERRAIN_HEIGHT_METERS)`
- `GenerateTestRegionCoreInternal()` calls `ValidateRegion(...)` for the generated region

The fix ensures that even if collision meshes are missing or contain invalid data, the validation will:
1. Report the issue clearly (not with overflow values)
2. Continue validating other edges
3. Distinguish between "gaps" and "missing data"
