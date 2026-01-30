# Issue #958: Fix Missing Water Systems Validation Timing

**Status:** Fixed  
**PR:** https://github.com/zachyzissou/Bloom/pull/1125  
**Branch:** `fix/issue-958-water-validation-timing`  
**Date:** 2025-01-29

## Problem

`AutoRunTerrainGenerator` validates scene prerequisites at Unity startup but warns about missing water systems:
- `⚠ RiverSystem not found in scene. Rivers will be skipped during generation.`
- `⚠ LakeSystem not found in scene. Lakes will be skipped during generation.`

This happens because `AutoRunTerrainGenerator` uses `[InitializeOnLoad]` with `EditorApplication.delayCall` to run validation early, but `SceneSetupValidator`'s system creation logic was only accessible via manual menu action.

## Root Cause

Validation order/timing issue:
1. `AutoRunTerrainGenerator` validates at Unity startup (via `[InitializeOnLoad]`)
2. `SceneSetupValidator.SetupScene()` can create water systems but requires manual invocation
3. Result: Validation runs before systems can be created → confusing warnings

## Solution

### Files Modified

1. **`Assets/Scripts/Editor/WorldGeneration/SceneSetupValidator.cs`**
   - Added `EnsureWaterSystemsExist()` public static method
   - Silently creates RiverSystem/LakeSystem GameObjects if missing
   - Assigns databases via existing `AssignRiverDatabase()`/`AssignLakeDatabase()` methods

2. **`Assets/Scripts/Editor/AutoRunTerrainGenerator.cs`**
   - Added `using Bloom.Editor.WorldGeneration;` import
   - Call `SceneSetupValidator.EnsureWaterSystemsExist()` at start of `ValidateScenePrerequisites()`
   - Added comment linking to issue #958

### Key Design Decisions

- Reused existing `AssignRiverDatabase()` and `AssignLakeDatabase()` private methods
- Silent operation (uses `BloomDebug.Log` instead of dialogs)
- Returns `bool` for future extensibility
- No changes to existing menu-driven `SetupScene()` workflow
