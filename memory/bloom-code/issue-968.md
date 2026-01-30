# Issue #968: GPU Macro Mask Parity - Feature/LUT Support for Exact Output

## Summary
Implemented GPU macro mask generation with exact CPU output parity through a comprehensive Feature LUT (Lookup Table) system and feature-specific compute shader kernels.

## Changes Made

### 1. Compute Shader: `TerraMacroMaskGeneration.compute`
**Path:** `Assets/Resources/Shaders/Compute/TerraMacroMaskGeneration.compute`

**New Features:**
- Added `ApplyFeatureWithLUT` kernel for exact CPU parity
- Implemented all 38 feature type algorithms in HLSL matching `TerraFeatureGeneratorJobs.cs`:
  - Landforms: Piedmont, Foothills, Intermontane, Foreland Basin, Glacial Outwash, Hogback Ridge, Canyonlands, Badlands, Mesa, Plateau Escarpment, River Valley, Ridge and Valley, Alluvial Fan, Playa, Bajada, Dune Field, Impact Crater, Radial Drainage, Subsidence Zone
  - Water: Alpine Lake, Kettle Lake, Oxbow Lake, Canyon Lake, Crater Lake, Ephemeral Stream
  - Glacial: Cirque, Arete, Hanging Valley, Moraine, Drumlin Field, Esker, U-Shaped Valley
  - Karst: Cave Entrance, Sinkhole, Solution Valley, Karst Tower, Disappearing Stream
  - Biome-Specific: Plateau Interior Flats

- Added proper blend mode handling:
  - `BLEND_MODE_LERP (0)`: Standard interpolation
  - `BLEND_MODE_MIN (1)`: Depression features (valleys, lakes, craters)
  - `BLEND_MODE_MAX (2)`: Elevation features (ridges, plateaus, mesas)

- Implemented `snoise()` function matching Unity.Mathematics noise for GPU/CPU parity

### 2. C# Generator: `TerraGPUMacroMaskGenerator.cs`
**Path:** `Assets/Scripts/WorldGeneration/GPU/TerraGPUMacroMaskGenerator.cs`

**New Features:**
- Added `FeatureLUTEntry` struct for GPU-side feature parameter lookup
- Implemented `InitializeFeatureLUT()` with default parameters for all 38 features
- Added `GenerateMaskWithParity()` method using the new `ApplyFeatureWithLUT` kernel
- Added `IsParityModeAvailable()` check
- Added `GetFeatureLUTEntry()` for debugging/validation
- Maintained backward compatibility with legacy `GenerateMask()` method

### 3. Validation Tests: `GPUMacroMaskParityTests.cs`
**Path:** `Assets/Scripts/Testing/Unit/GPU/GPUMacroMaskParityTests.cs`

**Test Coverage:**
- GPU generator availability checks
- Feature LUT initialization validation (all 38 types)
- CPU generation validation for key features
- GPU/CPU output parity tests with tolerance checking
- Blend mode verification for depression vs elevation features
- Scattered feature flag validation

## Technical Details

### Feature LUT Structure
```csharp
struct FeatureLUTEntry
{
    int featureType;        // MacroFeatureType enum value
    int blendMode;          // 0=lerp, 1=min, 2=max
    float sinFrequency;     // For sin-wave features (hogback, moraine)
    float noiseScale;       // For noise-based features (canyonlands)
    float depthMultiplier;  // Depression depth (lakes, valleys)
    float steepThreshold;   // Steep drop threshold (escarpment)
    float profilePower;     // Power function exponent
    float flatnessRatio;    // Flat area ratio (playa)
    int useScattered;       // 1 = scattered feature pattern
    float scatteredRadius;  // Pixel radius for scattered features
}
```

### Algorithm Parity
Each GPU feature function directly mirrors its CPU counterpart in `TerraFeatureGeneratorJobs.cs`:
- Same distance calculations (radial from center)
- Same elevation formulas (sin waves, noise, power functions)
- Same blend modes per feature type
- Matching noise functions (snoise implementation)

### Performance
- Expected speedup: 10-100x over CPU for large operations
- Thread groups: 8x8 per dispatch
- Async GPU readback with fallback to synchronous

## Files Changed
1. `Assets/Resources/Shaders/Compute/TerraMacroMaskGeneration.compute` - Updated
2. `Assets/Scripts/WorldGeneration/GPU/TerraGPUMacroMaskGenerator.cs` - Updated
3. `Assets/Scripts/Testing/Unit/GPU/GPUMacroMaskParityTests.cs` - New

## Branch
`feat/gpu-macro-mask-968`

## References
- TERRA-201: Original GPU acceleration ticket
- TerraFeatureGeneratorJobs.cs: CPU reference implementation
- MacroFeatureType.cs: Feature type enum definitions
