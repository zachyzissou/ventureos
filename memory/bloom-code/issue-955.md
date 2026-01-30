# Issue #955: Fix Water System Database Assignment in Scene Setup

## Status: ✅ Complete

## Problem
The `SetupScene()` method in `SceneSetupValidator` was creating `RiverSystem` and `LakeSystem` GameObjects but **not assigning their databases**. This left the water systems in a broken state because:
- `RiverSystem.riverDatabase` was null
- `LakeSystem.lakeDatabase` was null
- No containers were created for managing water objects

Meanwhile, `SceneSetupHelper.CreateWaterSystemsInScene()` did properly assign databases using reflection.

## Solution
Updated `SceneSetupValidator.SetupScene()` to match the database assignment behavior of `SceneSetupHelper`:

### Changes Made
1. **Added `AssignRiverDatabase()` helper method**
   - Loads or creates `RiverDatabase` asset at `Assets/Resources/Water/RiverDatabase.asset`
   - Uses reflection to assign to private `riverDatabase` field
   - Creates `RiverContainer` child transform

2. **Added `AssignLakeDatabase()` helper method**
   - Loads or creates `LakeDatabase` asset at `Assets/Resources/Water/LakeDatabase.asset`
   - Uses reflection to assign to private `lakeDatabase` field
   - Creates `LakeContainer` child transform

3. **Updated dialog messages**
   - Changed "RiverSystem (optional)" → "RiverSystem (with database)"
   - Changed "LakeSystem (optional)" → "LakeSystem (with database)"
   - Updated completion message to remove manual configuration note

## Files Changed
- `Assets/Scripts/Editor/WorldGeneration/SceneSetupValidator.cs` (+132, -12 lines)

## PR
- **PR #1119**: https://github.com/zachyzissou/Bloom/pull/1119
- **Branch**: `fix/issue-955-water-db-final`
- **Commit**: `a6cbee888` - fix: assign water system databases in scene setup

## Testing Notes
After this fix, running "Bloom → Terrain Generation → Setup Scene (Auto)" will:
1. Create BiomeManager, RiverSystem, and LakeSystem GameObjects
2. Automatically create database assets if they don't exist
3. Assign databases to the systems via reflection
4. Create container transforms for proper hierarchy

No manual configuration is needed after running the auto setup.

## Date
2026-01-29
