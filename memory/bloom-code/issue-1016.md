# Issue #1016: Validation and Tuning Presets for Natural-Looking Lakes

## Status: Complete

## Summary
Created a comprehensive validation system and tuning presets for generating natural-looking lakes based on real-world limnology data.

## Changes Made

### 1. LakeNaturalnessValidator.cs
**Path:** `Assets/Scripts/WorldGeneration/Validation/LakeNaturalnessValidator.cs`

A static validation system that checks lake properties against natural parameters:

- **Natural Reference Constants**: Based on Hakanson (1981), Wetzel (2001), and Hutchinson (1957):
  - Depth-to-area ratios for each lake type
  - Shoreline development indices
  - Aspect ratios (length:width)
  - Water clarity ranges by type

- **Validation Methods**:
  - `ValidateLake(LakeDefinition)` - Full validation of lake definitions
  - `ValidatePreset(LakePreset)` - Validate designer presets
  - `ValidateAllLakes(LakeSystem)` - Batch validate scene lakes
  - `ValidateLakeSegment(LakeSegment)` - Validate individual segments

- **Metrics Evaluated**:
  - Depth ratio score (depth per km²)
  - Water clarity score
  - Wave properties score
  - Shoreline development score
  - River integration score
  - Seasonality score
  - Size appropriateness score

- **Tuning Recommendations**: Auto-generates specific recommendations for improving naturalness

### 2. NaturalLakeTuningPresets.cs
**Path:** `Assets/Scripts/WorldGeneration/Configuration/NaturalLakeTuningPresets.cs`

ScriptableObject collection of scientifically-tuned presets for each lake type:

- **8 Lake Type Presets**:
  1. **Alpine Glacial Lake** - Crystal clear, deep, elongated
  2. **Kettle Lake** - Rounded, post-glacial depressions
  3. **Oxbow Lake** - Crescent-shaped, shallow, murky
  4. **Crater Lake** - Circular, very deep, exceptionally clear
  5. **Tectonic Rift Lake** - Elongated along fault lines
  6. **Fluvial Lake** - River-connected, moderate depth
  7. **Karst Sinkhole Lake** - Mineral-rich, sudden depth drops
  8. **Ephemeral Playa Lake** - Seasonal, very shallow, arid regions

- **Global Tuning Parameters**:
  - `globalSizeScale` - Master scale for all lake sizes
  - `globalDepthScale` - Master depth multiplier
  - `autoBiomeSelection` - Auto-select presets by biome

- **Biome Suitability Mapping**: Each preset includes suitable biomes

### 3. LakeNaturalnessValidatorWindow.cs
**Path:** `Assets/Scripts/Editor/WorldGeneration/LakeNaturalnessValidatorWindow.cs`

Unity Editor window for validation workflow:

- **Menu:** Bloom > Validation > Lake Naturalness Validator

- **Features**:
  - Validate all scene lakes at once
  - Validate individual presets
  - Visual score breakdown with color-coded metrics
  - Reference data panel showing natural values
  - Export validation reports to Markdown
  - Create default tuning presets button

- **Score Grading**:
  - A (Excellent): ≥90%
  - B (Good): 70-89%
  - C (Acceptable): 60-69%
  - D (Needs Work): 50-59%
  - F (Poor): <50%

## Natural Lake Type Reference

| Type | Depth Ratio (m/km²) | Clarity | Shape |
|------|---------------------|---------|-------|
| Glacial | 25-60 | 0.75-0.98 | Elongated |
| Kettle | 10-30 | 0.45-0.75 | Rounded |
| Oxbow | 2-6 | 0.10-0.35 | Crescent |
| Crater | 60-150 | 0.85-1.00 | Circular |
| Tectonic | 25-80 | 0.55-0.85 | Long rift |
| Fluvial | 3-12 | 0.25-0.50 | Irregular |
| Karst | 15-45 | 0.35-0.70 | Rounded |
| Playa | 0.2-2 | 0.00-0.25 | Flat basin |

## Usage

### Validating Lakes
```csharp
// Validate a single definition
var result = LakeNaturalnessValidator.ValidateLake(lakeDefinition);
Debug.Log($"Score: {result.overallScore:P0} - {result.GetGrade()}");

// Get tuning recommendations
var recommendations = LakeNaturalnessValidator.GetTuningRecommendations(result);
```

### Using Tuning Presets
```csharp
var presets = Resources.Load<NaturalLakeTuningPresets>("WorldGeneration/NaturalLakeTuningPresets");
var glacialPreset = presets.GetPresetForType(LakeType.Glacial);

// Generate a LakePreset from natural parameters
LakePreset preset = glacialPreset.ToLakePreset();

// Calculate natural depth for an area
float depth = glacialPreset.CalculateNaturalDepth(areaKm2);
```

## Files Created
- `Assets/Scripts/WorldGeneration/Validation/LakeNaturalnessValidator.cs`
- `Assets/Scripts/WorldGeneration/Configuration/NaturalLakeTuningPresets.cs`
- `Assets/Scripts/Editor/WorldGeneration/LakeNaturalnessValidatorWindow.cs`
- `Assets/Resources/WorldGeneration/` (directory for preset asset)

## Branch
`feature/issue-1016-lake-validation`

## Related Issues
- #1012 - LakeGenerationSettings (uses similar configuration patterns)
- #1015 - Lake diagnostics (complements validation workflow)
