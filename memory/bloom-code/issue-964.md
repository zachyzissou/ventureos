# Issue #964: CRITICAL - Lake Generation Ignores Elevation Constraints

**Status:** Fixed  
**PR:** [#1127](https://github.com/zachyzissou/Bloom/pull/1127)  
**Branch:** `fix/issue-964-lake-elevation-constraints`  
**Date:** 2026-01-29

## Problem

Lakes were being placed without respecting elevation constraints. When `BiomeManager` wasn't initialized/ready during lake generation, `LakeSystem` would skip elevation validation entirely and place lakes at any elevation.

### Root Cause

In `LakeSystem.cs`, both `FindSuitableLakeTile` and `FindFirstMatchingTile` had fallback code paths that bypassed elevation checking:

```csharp
// BUGGY CODE (before fix):
else if (fallbackGrid != null)
{
    if (TryGetBiomeFromFallback(candidateTile, out var fallbackBiome) && fallbackBiome == targetBiome)
    {
        // Can't check elevation without biomeManager, so return if biome matches
        // (elevation check will be skipped in this case)
        return candidateTile;  // <-- BUG: Returns without elevation validation!
    }
}
else
{
    // No biome manager or fallback - can't validate, return first candidate
    return candidateTile;  // <-- BUG: Returns without ANY validation!
}
```

This meant that when `BiomeManager` wasn't ready (common during certain generation phases), lakes would be placed based only on biome matching, completely ignoring the `minElevation` and `maxElevation` parameters passed to these functions.

## Solution

Changed the fallback paths to `continue` instead of `return candidateTile`, and added an early-exit in `FindFirstMatchingTile` when elevation cannot be validated:

```csharp
// FIXED CODE:
else if (fallbackGrid != null)
{
    // FIX Issue #964: Do NOT place lakes without elevation validation.
    continue;  // Skip this candidate, try another
}
else
{
    // FIX Issue #964: Do NOT place lakes without proper validation.
    continue;  // Skip this candidate
}

// After the loop, if biomeManager wasn't ready:
if (!biomeManagerReady)
{
    Debug.LogWarning($"[LakeSystem] Cannot find suitable tile for biome {targetBiome} " +
        $"(elevation {minElevation}-{maxElevation}m): BiomeManager not ready. " +
        "Lake placement skipped to prevent invalid elevation placement.");
    return new Vector2Int(-1, -1);  // Indicates no valid placement found
}
```

## Key Changes

1. **`FindSuitableLakeTile`**: Changed fallback paths to use `continue` instead of returning candidates without elevation validation
2. **`FindFirstMatchingTile`**: Added early-exit when `BiomeManager` isn't ready
3. Added clear warning log so developers know why lakes were skipped
4. Simplified `FindFirstMatchingTile` by removing now-unreachable dead code

## Behavioral Impact

**Before:** Lakes could spawn at any elevation when BiomeManager wasn't ready  
**After:** Lakes are skipped (not placed) when elevation cannot be validated

This is intentional - it's better to have no lake than a lake at an invalid elevation (underwater, on mountain peaks, etc.).

## Files Changed

- `Assets/Scripts/Environment/Water/LakeSystem.cs` (+32, -27 lines)

## Testing Notes

- Lakes should only be placed when BiomeManager is properly initialized
- Warning log appears when elevation constraints cannot be enforced
- Normal lake placement continues to work correctly when BiomeManager is ready
