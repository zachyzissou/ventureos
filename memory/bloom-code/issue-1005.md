# Issue #1005: Terra - Expand Terrain Validation Tooling

**Status:** ✅ Completed  
**PR:** https://github.com/zachyzissou/Bloom/pull/1152  
**Branch:** `feat/terra-expanded-validation-1005`  
**Date:** 2026-01-29

## Problem
Need broader terrain validation for masks/features (beyond current reports).

## Goals
- Add checks for jagged artifacts, feature placement, and mask quality
- Surface results in editor tooling

## Solution

### New Validators Created

#### 1. JaggedArtifactValidator
`Assets/Scripts/WorldGeneration/Validation/JaggedArtifactValidator.cs`

Detects aliased edges and artifacts in heightmap data:
- **High-frequency noise detection** - Uses local variance analysis in configurable kernel windows to detect stairstep patterns
- **Sobel edge detection** - Calculates gradient magnitude to identify unnaturally sharp edges
- **Second derivative (Laplacian)** - Detects spikes and pits via curvature analysis
- **Configurable thresholds** - noiseThreshold, gradientThreshold, secondDerivativeThreshold, kernelSize

Key features:
- Spatial analysis with configurable kernel sizes
- Artifact type classification (HighFrequencyNoise, SharpGradient, HighCurvature, MultipleArtifacts)
- World position calculation for editor visualization
- Performance tracking (validationTimeMs)

#### 2. FeaturePlacementValidator
`Assets/Scripts/WorldGeneration/Validation/FeaturePlacementValidator.cs`

Validates terrain feature placement:
- **Overlap detection** - Uses spatial hashing for O(1) neighbor lookups
- **Bounds validation** - Ensures features are within tile boundaries
- **Biome compatibility** - Matrix-based validation (e.g., Cactus only in Desert/Badlands)
- **Slope constraints** - Configurable maximum slope angle for placement
- **Density analysis** - Features per hectare with local density hotspot detection
- **Edge proximity** - Warns when features are too close to tile edges

Key features:
- Spatial hash grid (50m cells) for efficient overlap detection
- Biome compatibility dictionary for common feature types
- Configurable: minFeatureSpacing, maxSlopeDegrees, overlapTolerance, maxDensityPerHectare

#### 3. MaskQualityValidator
`Assets/Scripts/WorldGeneration/Validation/MaskQualityValidator.cs`

Validates terrain mask quality:
- **Hole detection** - Identifies unexpected zero regions surrounded by non-zero values
- **Coverage validation** - Ensures minimum coverage percentage
- **Edge quality analysis** - Detects harsh transitions vs smooth blending
- **Noise level validation** - Local variance analysis for excessive noise
- **Value range validation** - Ensures all values are in [0,1] range

Supports mask types: Biome, Splatmap, Feature, Blend, Macro, Height

Key features:
- Statistical analysis (coverage, min/max, variance, average)
- Edge sharpness calculation via gradient analysis
- Hole percentage tracking
- Configurable: minCoverage, maxHoleSize, minEdgeBlend, maxNoiseVariance, minContrast

### Editor Window Updates

Updated `Assets/Scripts/Editor/Terra/TerraVisualValidator.cs`:

- **Tabbed UI** - Performance, Jagged Artifacts, Feature Placement, Mask Quality, Full Validation
- **Per-validator settings** - Configurable thresholds via sliders
- **Test data generation** - Built-in heightmap, mask, and feature generation for offline testing
- **Full validation suite** - Runs all validators sequentially with combined report
- **Copy to clipboard** - One-click report export
- **Detailed reporting** - Errors, warnings, metrics, and issue locations

### Usage

In Unity Editor: `Bloom → Terra → Visual Validator`

1. Select validation tab
2. Adjust thresholds as needed
3. Configure test tile coordinates
4. Click "Run [Validator Type] Validation" or "Run Full Validation Suite"
5. Review report, copy to clipboard if needed

## Files Changed
- `Assets/Scripts/Editor/Terra/TerraVisualValidator.cs` (modified)
- `Assets/Scripts/WorldGeneration/Validation/JaggedArtifactValidator.cs` (new)
- `Assets/Scripts/WorldGeneration/Validation/FeaturePlacementValidator.cs` (new)
- `Assets/Scripts/WorldGeneration/Validation/MaskQualityValidator.cs` (new)

## Commit
```
feat(terrain): expand terrain validation tooling

Add three new validators for comprehensive terrain validation:
- JaggedArtifactValidator: detects aliased edges, high-frequency noise,
  and stairstep patterns using Sobel edge detection and variance analysis
- FeaturePlacementValidator: validates feature overlap, bounds, biome
  compatibility, slope constraints, and density distribution
- MaskQualityValidator: checks mask coverage, holes, edge quality,
  noise levels, and value range validation

Update TerraVisualValidator editor window with:
- Tabbed UI for each validator type
- Configurable validation thresholds
- Full validation suite combining all validators
- Test data generation for offline validation
- Detailed validation reports with copy-to-clipboard

Fixes #1005
```

## Related Issues
- Extends existing validators: HeightmapGradientValidator, EdgeContractValidator, WaterSystemValidator
- Follows patterns from BorderDiagnosticsAPI
