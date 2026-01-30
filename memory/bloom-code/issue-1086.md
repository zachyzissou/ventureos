# Issue #1086: Replace FindObjectOfType calls with ServiceLocator

## Status: ✅ Completed
- **Branch**: `refactor/issue-1086-servicelocator`
- **PR**: #1137
- **Date**: 2026-01-29

## Summary
Refactored remaining FindObjectOfType calls to use the ServiceLocator pattern for O(1) service lookups.

## Original Issue
The issue stated 214 FindObjectOfType calls needed replacement, but many had already been addressed. Only 11 calls remained (some were comments), concentrated in water-related systems.

## Changes Made

### Files Modified (5 total)

1. **LakeCurrentIntegration.cs**
   - `TryFindPlayerController()`: Uses `ServiceLocator.TryGetService<PlayerController>()` with `FindFirstObjectByType` fallback

2. **SeasonalWaterLevelManager.cs**
   - `Initialize()`: Uses ServiceLocator for `LakeSystem` and `IWeatherSystem`
   - `FindLakeRenderer()`: Updated to use `FindObjectsByType` (Unity 2022.1+ API)

3. **UnderwaterVisibility.cs**
   - Added `using Bloom.Core;` for ServiceLocator access
   - `Start()`: Uses ServiceLocator for `WaterQualityManager`, fallback for Unity's `Volume`
   - `FindNearestWaterBody()`: Updated to use `FindObjectsByType`

4. **WaterBatchingIntegration.cs**
   - Added `using Bloom.Core;` for ServiceLocator access
   - `IntegrateWithBatchingManager()`: Uses ServiceLocator for `WaterBatchingManager`
   - `MonitorPerformance()`: Uses ServiceLocator for `WaterPerformanceProfiler`

5. **TileContinuityVisualizer.cs** (Editor script)
   - `DrawWaterContinuity()`: Updated to use `FindFirstObjectByType` (newer Unity API)

## Technical Approach

### Pattern Used
```csharp
// Try ServiceLocator first for O(1) lookup
var locator = ServiceLocator.Instance;
if (locator != null && locator.TryGetService<T>(out var service))
{
    // Use service
}
else
{
    // Fallback to scene search if not registered
    service = FindFirstObjectByType<T>();
}
```

### Performance Impact
- **Before**: O(n) scene traversal for each lookup
- **After**: O(1) dictionary lookup for registered services
- Fallback ensures backwards compatibility when services aren't registered

### Notes
- Some `FindObjectsByType` calls remain for queries that need to find ALL instances of a type (e.g., finding nearest lake). These are acceptable as they're not per-frame calls.
- Editor scripts use `FindFirstObjectByType` as ServiceLocator may not be available in edit mode.
- Unity's `Volume` component (URP post-processing) isn't registered in ServiceLocator, so uses direct scene search.

## Verification
```powershell
# Verify no deprecated FindObjectOfType calls remain
Get-ChildItem -Recurse -Filter "*.cs" -Path "Assets" | 
  Select-String -Pattern "FindObjectOfType\(" | 
  Measure-Object
# Result: Count = 0
```

## Future Improvements
- Consider adding a spatial query API to `LakeSystem` for efficient nearby lake lookups
- `LakeSystem` could maintain a registry of active renderers to avoid `FindObjectsByType` calls
