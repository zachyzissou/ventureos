# Issue #980: Integrate Erosion Simulation for Terra Brushes

**Status:** Implementation complete, PR ready to create  
**Branch:** `feat/erosion-simulation-980`  
**Date:** 2025-07-13

## Summary

Integrated localized erosion simulation into the Terra brush system, allowing artists to paint realistic erosion effects directly onto terrain.

## Files Added/Modified

### New Files
- `Assets/Scripts/Editor/Terra/TerraErosionSimulator.cs` - Core erosion algorithms
- `Assets/Scripts/Editor/Terra/TerraErosionBrush.cs` - Interactive brush and mask filter

### Modified Files
- `Assets/Scripts/Editor/Terra/TerraBrushRegistration.cs` - Added erosion brush/filter registration

## Implementation Details

### TerraErosionSimulator
Provides localized erosion algorithms that work within brush regions:

**Hydraulic Erosion:**
- Simulates water flow over terrain
- Erodes based on water velocity and slope
- Transports and deposits sediment
- Creates channels, gullies, and drainage patterns

**Thermal Erosion:**
- Enforces talus angle (angle of repose)
- Smooths slopes that exceed threshold
- Simulates landslides and material slumping

**Presets:**
- `CreateDefault()` - Balanced for general use
- `CreateChannelCarving()` - Optimized for rivers/channels
- `CreateSlopeSmoothing()` - Thermal-only for cliff softening

### TerraErosionBrush
Interactive brush implementing `IBrushUIGroup`:

**Modes:**
- Combined (hydraulic + thermal)
- Hydraulic Only
- Thermal Only

**Features:**
- Preset selection for quick setup
- Full parameter control in Custom mode
- Brush falloff integration
- Inspector GUI with foldouts

### TerraErosionMaskFilter
Erosion-based mask filter for combining with other brushes.

## Architecture Notes

The implementation bridges the WorldGeneration erosion stages (which operate on full heightmaps via Jobs) with the Terra brush system (which operates on localized regions interactively). Key design decisions:

1. **Localized processing**: Erosion is computed only within brush radius + border
2. **Brush falloff**: Results are blended using brush falloff for smooth edges
3. **No Jobs dependency**: Direct computation for interactive response (Jobs would add latency)
4. **Configurable presets**: Easy-to-use presets for common scenarios

## Testing Notes

- Test with various brush sizes (small for detail, large for broad weathering)
- ChannelCarving preset works best when painting along intended drainage paths
- SlopeSmoothing is effective on harsh procedural terrain edges
- Combined mode may require lower strength for subtle effects

## PR Information

**Branch pushed to:** `origin/feat/erosion-simulation-980`

**PR Title:** feat(Terra): Integrate erosion simulation for Terra brushes (#980)

**PR Body:**
```
Adds localized hydraulic and thermal erosion to Terra brush system:

- TerraErosionSimulator: Core erosion algorithm for brush-local regions
  - Hydraulic erosion (water flow, sediment transport, deposition)
  - Thermal erosion (talus angle enforcement, slope smoothing)
  - Configurable presets (ChannelCarving, SlopeSmoothing, NaturalWeathering)

- TerraErosionBrush: Interactive brush for painting erosion effects
  - Combined, Hydraulic-only, or Thermal-only modes
  - Preset configurations for common use cases
  - Full inspector UI with parameter controls
  - Brush falloff integration

- TerraErosionMaskFilter: Erosion-based mask filter for other brushes

- Updated TerraBrushRegistration to include new brush and filter

Closes #980
```

**Note:** PR needs to be created manually via GitHub UI since `gh` CLI is not installed:
https://github.com/zachyzissou/Bloom/pull/new/feat/erosion-simulation-980
