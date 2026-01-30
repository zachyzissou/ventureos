# Issue #948: Terra - Integrate Wetland Terrain Generation for ShimmerMarsh Biome

## Summary
Integrated wetland terrain generation into the Terra world generation system for the ShimmerMarsh biome.

## Implementation Details

### Files Created/Modified

#### New Files
1. **`Assets/Scripts/WorldGeneration/WetlandGenerator.cs`**
   - Full wetland terrain generator with marsh channels
   - Supports edge-based generation (N/S/E/W)
   - Water saturation gradients for vegetation placement
   - Uses TerrainArrayPool for memory efficiency

#### Modified Files
1. **`Assets/Scripts/Terrain/MacroFeatures/MacroFeatureType.cs`**
   - Added `Wetland = 38` to MacroFeatureType enum
   - Documented as ShimmerMarsh biome primary terrain feature

2. **`Assets/Scripts/WorldGeneration/Services/TerraFeatureGenerators.cs`**
   - Added `GenerateWetland()` method with profiling marker
   - Uses Burst job for parallel execution (5-10x speedup)

3. **`Assets/Scripts/WorldGeneration/Jobs/TerraFeatureGeneratorJobs.cs`**
   - Added `GenerateWetlandJob` Burst-compiled job
   - Multi-layer Perlin noise for organic marsh channels
   - Quadratic blend curves for gentle terrain transitions

4. **`Assets/Scripts/WorldGeneration/Services/TerraFeatureRegistry.cs`**
   - Registered Wetland generator in `CreateDefault()`

## Technical Details

### Wetland Characteristics
- **Slope**: 0-2° (very flat, flatter than beaches at 3-8°)
- **Elevation**: 5-10m above water level
- **Marsh Channels**: 0.5-2m deep, organic patterns via Perlin noise
- **Transition Zones**: 100-200m (shorter than beaches at 200-300m)

### Noise Configuration
- **Large-scale channels**: 0.05 frequency (primary organic pattern)
- **Small-scale texture**: 0.15 frequency (detail variation)
- **Blend ratio**: 70% large / 30% small for natural look

### Performance
- Uses Burst-compiled parallel jobs
- Expected 5-10x speedup over single-threaded implementation
- Memory-efficient pooled heightmap allocation

## Usage

### As MacroFeature (recommended)
```csharp
var wetlandFeature = new MacroFeatureDefinition
{
    featureType = MacroFeatureType.Wetland,
    baseElevationOffset = 7.5f,    // meters above water
    elevationAmplitude = 1.5f,      // channel depth
    maxDistanceFromCore = 5        // tile radius
};
```

### As Coastal Generator
```csharp
var generator = new WetlandGenerator();
var result = generator.GenerateWetlandFace(
    baseHeightmap,
    EdgeDirection.North,
    segmentStartMeters: 0f,
    segmentEndMeters: 2048f,
    tileSizeMeters: 2048f,
    baseElevation: 7.5f,
    transitionZoneMeters: 150f,
    channelDepth: 1.5f
);
// IMPORTANT: Return result to pool after use
TerrainArrayPool.ReturnHeightmap(result);
```

## Testing
- Manual testing via `Window → World Generation → Wetland Generator Test`
- Visual preview with slope map and saturation map options
- Can apply directly to scene terrain for validation

## Branch
`feature/issue-948-shimmermarsh-wetland`

## Related
- TERRA-948 tracking
- ShimmerMarsh biome (H2-H3 Wetlands)
- WetlandPropagator for tile feature tagging

## Date
2026-01-29
