# Issue #1014: Add Shoreline Roughness and Biome-Aware Archetype Weighting

**Status:** ✅ Implemented  
**Branch:** `feat/shoreline-roughness-archetype-weighting`  
**Date:** 2026-01-29

## Summary

Added shoreline roughness controls and biome-aware archetype weighting for lake generation, creating more naturalistic and varied lake shapes that respect biome characteristics.

## Changes Made

### 1. LakeGenerationSettings.cs (Configuration)

**New Shoreline Roughness Parameters:**
- `baseShorelineRoughness` (0-1): Base roughness for shoreline irregularity
- `shorelineNoiseOctaves` (1-6): Number of noise octaves for detail
- `shorelineNoiseFrequency` (0.5-8): Noise frequency for wiggle rate
- `shorelineRadiusVariation` (0-0.5): Max radius variation as fraction
- `shorelineRoughnessFalloff`: AnimationCurve for depth-based falloff

**Enhanced BiomeLakeModifier:**
- `shorelineRoughnessOverride`: Per-biome roughness override (-1 = use global)
- `archetypeWeights`: List of weighted lake type configurations

**New LakeArchetypeWeight Class:**
- `lakeType`: The lake archetype
- `weight`: Relative selection weight (0-10)
- `minElevation`/`maxElevation`: Elevation constraints
- `sizeMultiplier`/`depthMultiplier`: Archetype-specific modifiers
- `shorelineRoughness`: Archetype-specific roughness (-1 = use biome/global)

**New API Methods:**
- `GetEffectiveShorelineRoughness(biome, lakeType?)`: Gets cascaded roughness value
- `SelectWeightedArchetype(biome, elevation, random?)`: Weighted random archetype selection
- `GetArchetypeSizeMultiplier(biome, lakeType)`: Gets combined size multiplier
- `GetArchetypeDepthMultiplier(biome, lakeType)`: Gets depth multiplier
- `GetArchetypeElevationRange(biome, lakeType)`: Gets elevation constraints

### 2. LakePreset.cs

**New Shoreline Parameters:**
- `shorelineRoughness` (0-1)
- `shorelineNoiseOctaves` (1-6)
- `shorelineNoiseFrequency` (0.5-8)
- `shorelineRadiusVariation` (0-0.5)
- `shorelineSeedOffset`: For deterministic generation

### 3. LakeDefinition.cs

**New Shoreline Shape Section:**
- `shorelineRoughness` (0-1)
- `shorelineNoiseOctaves` (1-6)
- `shorelineNoiseFrequency` (0.5-8)
- `shorelineRadiusVariation` (0-0.5)
- `shorelineSeed`: Deterministic seed

### 4. LakeSystem.cs

**New Methods:**
- `GenerateRoughShorelineBoundary()`: Creates noise-based irregular shorelines using multi-octave Perlin noise
- `GenerateBoundaryFromDefinition()`: Generates boundary using LakeDefinition params
- `GenerateBoundaryFromSettings()`: Generates boundary using LakeGenerationSettings for biome

**Updated Methods:**
- `PlaceLake()`: Now uses `GenerateBoundaryFromDefinition()` for rough shorelines
- `PlaceLakeFromPreset()`: Copies preset roughness to definition if needed

## Technical Details

### Shoreline Generation Algorithm

Uses multi-octave Perlin noise for natural-looking perturbation:

1. For each boundary point around the circumference:
   - Sample noise at angle-based coordinates
   - Layer multiple octaves with decreasing amplitude
   - Apply roughness and radius variation factors
   - Ensure minimum radius to prevent self-intersection

2. Parameters allow fine control:
   - **Roughness**: Overall perturbation strength
   - **Octaves**: Detail level (more = finer features)
   - **Frequency**: Wiggle rate around perimeter
   - **Radius Variation**: Maximum deviation from base radius

### Archetype Weighting System

Hierarchical configuration cascade:
1. Archetype-specific settings (per lake type in biome)
2. Biome-level settings (applies to all lakes in biome)
3. Global settings (fallback)

Selection uses weighted random with elevation filtering.

## Example Configurations

### Mountain Biome (Rough shores, glacial preference)
```csharp
biomeModifiers.Add(new BiomeLakeModifier {
    biome = BiomeType.WesternMountains,
    shorelineRoughnessOverride = 0.4f,
    archetypeWeights = new List<LakeArchetypeWeight> {
        new LakeArchetypeWeight { lakeType = LakeType.Glacial, weight = 5f, minElevation = 180f },
        new LakeArchetypeWeight { lakeType = LakeType.Tectonic, weight = 3f, minElevation = 120f },
        new LakeArchetypeWeight { lakeType = LakeType.Karst, weight = 2f }
    }
});
```

### Grassland Biome (Smooth shores, fluvial preference)
```csharp
biomeModifiers.Add(new BiomeLakeModifier {
    biome = BiomeType.CentralGrasslands,
    shorelineRoughnessOverride = 0.15f,
    archetypeWeights = new List<LakeArchetypeWeight> {
        new LakeArchetypeWeight { lakeType = LakeType.Fluvial, weight = 6f },
        new LakeArchetypeWeight { lakeType = LakeType.Oxbow, weight = 4f, shorelineRoughness = 0.1f }
    }
});
```

## Files Modified

1. `Assets/Scripts/WorldGeneration/Configuration/LakeGenerationSettings.cs`
2. `Assets/Scripts/Environment/Water/LakePreset.cs`
3. `Assets/Scripts/Environment/Water/LakeDefinition.cs`
4. `Assets/Scripts/Environment/Water/LakeSystem.cs`

## Testing Notes

- Verify rough shorelines render correctly across tile boundaries
- Test archetype selection distribution matches configured weights
- Validate elevation filtering excludes inappropriate archetypes
- Check deterministic seed produces consistent shorelines
