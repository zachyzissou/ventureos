# Issue #973: River Carving Produces Hard Banks

**Status:** Fixed  
**PR:** https://github.com/zachyzissou/Bloom/pull/1129  
**Branch:** `fix/issue-973-river-bank-gradients-v2`  
**Date:** 2025-01-29

## Problem

River carving in the terrain generation pipeline was producing hard, unnatural edges at the water line instead of gradual terrain transitions.

**Root Cause:** The `CarveRivers` method in `WaterFeatureConfig.cs` used linear interpolation (`Mathf.Lerp`) for bank blending, which creates a straight slope from river elevation to surrounding terrain. Additionally, the bank falloff zone was too narrow (only 0.5x the river width).

## Solution

Three changes were made to `Assets/Scripts/Terrain/Pipeline/Configs/WaterFeatureConfig.cs`:

### 1. New Configurable Parameter
Added `riverBankGradientWidth` field (default 1.5x) to allow artists to control the bank transition zone width:
```csharp
[Tooltip("Bank gradient width multiplier...")]
[Range(0.5f, 3.0f)]
public float riverBankGradientWidth = 1.5f;
```

### 2. Smoothstep Blending
Replaced linear interpolation with smoothstep function for natural S-curve transitions:
```csharp
// Before (linear):
float tBank = (dist - widthPixels) / bankFalloffPixels;
float bankHeight = Mathf.Lerp(riverElevation, heightmap[pz, px], tBank);

// After (smoothstep):
float tBank = (dist - widthPixels) / bankFalloffPixels;
float smoothT = tBank * tBank * (3f - 2f * tBank);  // 3t² - 2t³
float bankHeight = Mathf.Lerp(riverElevation, heightmap[pz, px], smoothT);
```

The smoothstep formula `3t² - 2t³` creates an S-curve that:
- Starts gently (derivative = 0 at t=0)
- Accelerates through the middle
- Ends gently (derivative = 0 at t=1)

### 3. Wider Bank Falloff
Changed bank falloff calculation:
```csharp
// Before:
float bankFalloffPixels = Mathf.Max(2f, widthPixels * 0.5f);

// After:
float bankFalloffPixels = Mathf.Max(3f, widthPixels * riverBankGradientWidth);
```

## Files Modified

- `Assets/Scripts/Terrain/Pipeline/Configs/WaterFeatureConfig.cs`
  - Added `riverBankGradientWidth` field (line ~34)
  - Updated `bankFalloffPixels` calculation (line ~234)
  - Added smoothstep calculation (lines ~302-304)
  - Added validation in `OnValidate` (line ~890)

## Testing Notes

- Visual inspection should show gradual terrain transitions at river edges
- Performance impact is negligible (one additional multiplication per pixel)
- The `riverBankGradientWidth` parameter can be adjusted in the WaterFeatureConfig asset inspector
