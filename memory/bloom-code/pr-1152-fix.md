# PR #1152 Fix - Terra Expanded Validation (Issue #1005)

**Branch:** `feat/terra-expanded-validation-1005`
**Date:** 2026-01-29
**Commit:** `65a17956e`

## Issues Fixed (from Copilot Review)

### 1. Compile-time BiomeType Enum Mismatch ✅

**Problem:** `FeaturePlacementValidator.cs` referenced non-existent BiomeType members:
- `WesternWoodlands`, `NorthernHighlands`, `NorthernTundra`, `CoastalPlains`, `EasternBadlands`, `SouthernDesert`, `SouthernWetlands`

**Solution:** Updated `FeatureBiomeCompatibility` matrix to use actual BiomeType values:

| Feature | Old (Invalid) | New (Valid) |
|---------|---------------|-------------|
| Tree | WesternWoodlands, NorthernHighlands, NorthernTundra, CoastalPlains | ForestHills, TheReach, SouthwestPlains, ShimmerMarsh |
| Rock | NorthernHighlands, EasternBadlands, CoastalPlains, WesternWoodlands, NorthernTundra | EasternPlateaus, WesternMountains, SnowPeaks, TheStillfreeze, GreyreachDistrict, Volcanic |
| Cactus | EasternBadlands, SouthernDesert | TheDrift |
| Bush | WesternWoodlands, CoastalPlains | ForestHills, SouthwestPlains, ShimmerMarsh |
| DeadTree | SouthernDesert, EasternBadlands, NorthernTundra, SouthernWetlands | TheDrift, TheStillfreeze, ShimmerMarsh, Volcanic |
| Grass | (excluded SouthernDesert) | (excluded TheDrift) |

**File:** `Assets/Scripts/WorldGeneration/Validation/FeaturePlacementValidator.cs` (lines 136-155)

### 2. Unused `minFeatureSpacing` Threshold ✅

**Problem:** Field was exposed via slider but never used in validation logic.

**Solution:** Implemented spacing check in `FindOverlaps()` method:
```csharp
// Check both overlap (radius-based) and minimum spacing requirements
float radiusBasedMinDistance = feature.radius + other.radius - overlapTolerance;
float effectiveMinDistance = Mathf.Max(radiusBasedMinDistance, minFeatureSpacing);

if (distance < effectiveMinDistance)
{
    overlaps.Add(other);
}
```

Now the slider value actually affects validation - features closer than `minFeatureSpacing` meters are flagged as overlapping.

### 3. `useTestHeightmap` Toggle Had No Effect ✅

**Problem:** Toggle only showed/hid UI controls but validators always generated test data unconditionally.

**Solution:** 
1. Modified validation methods to check the toggle
2. Added `TryLoadTerraHeightmap()` and `TryLoadTerraMask()` methods to load real terrain data from active Unity terrains
3. When toggle is OFF, validators attempt to load real Terra data; if unavailable, they show an error message
4. When toggle is ON, uses synthetic test data (original behavior)

**New behavior:**
- `useTestHeightmap = true`: Uses `GenerateTestHeightmap()` / `GenerateTestMask()` (synthetic Perlin noise terrain)
- `useTestHeightmap = false`: Attempts to find active Unity terrain at specified tile coords and extract heightmap/alphamap data

**Files modified:**
- `Assets/Scripts/Editor/Terra/TerraVisualValidator.cs` (+132 lines)
- `Assets/Scripts/WorldGeneration/Validation/FeaturePlacementValidator.cs` (+22 lines)

## Additional Fix

Fixed test feature generation in `TerraVisualValidator.GenerateTestFeatures()` to use valid `BiomeType.ForestHills` instead of invalid `BiomeType.WesternWoodlands`.

## Verification

Pushed to `origin/feat/terra-expanded-validation-1005`. Ready for re-review.
