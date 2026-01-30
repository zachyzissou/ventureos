# Issue #963: Vegetation Buffers May Not Be Generated - VegetationDistributionStage Not Executed

## Status: FIX IDENTIFIED - GIT STATE UNSTABLE

## Problem
The `VegetationDistributionStage` in `Assets/Scripts/WorldGeneration/Pipeline/Stages/VegetationDistributionStage.cs` uses a field `enableTransitionMetadata` on lines 129 and 154, but the field is never declared in the class.

```csharp
// Line 129
if (enableTransitionMetadata)
{
    VegetationTransitionIntegration.ProcessTilePlan(plan, context.WorldConfigHash);
}

// Line 154
if (enableTransitionMetadata && plans.Count > 0)
{
    var stats = VegetationTransitionManager.Instance.GetCacheStats();
    BloomDebug.Log($"[{StageName}] Generated vegetation edge metadata...");
}
```

This causes a compilation error, preventing the VegetationDistributionStage from executing. Since this stage is responsible for generating vegetation distribution plans, vegetation buffers are not generated.

## Root Cause
The field `enableTransitionMetadata` was added as part of Issue #934 (vegetation edge metadata for cross-tile transitions) but the field declaration was never included.

## Fix Required
Add the missing field declaration to `VegetationDistributionStage` class:

```csharp
[Header("Vegetation Transitions")]
[Tooltip("Enable generation of vegetation edge metadata for cross-tile transitions (Issue #934)")]
public bool enableTransitionMetadata = true;
```

Location: After the `shorelineConfig` field declaration (~line 32), before `_cachedShorelineConfig`.

## Git Repository Issues
The git repository at `C:\Users\Zachg\clawd\repos\Bloom` has unstable state:
- Branches switch automatically between commands
- Staged changes disappear unexpectedly
- Multiple worktrees may be conflicting
- File edits are reverted between operations

This prevented completing the PR workflow. The fix should be applied manually or the git repo state should be investigated.

## Verification
After applying the fix, run:
```bash
findstr /n "enableTransitionMetadata" Assets\Scripts\WorldGeneration\Pipeline\Stages\VegetationDistributionStage.cs
```

Should return 3 lines:
1. The field declaration (~line 36)
2. First usage in Execute (~line 133)
3. Second usage in Execute (~line 158)

## Related Issues
- #934 - Vegetation Transitions (introduced the code that uses this field)
- #963 - This issue (vegetation buffers not generated)
