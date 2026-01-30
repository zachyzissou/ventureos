# Issue #1012: Add LakeGenerationSettings Asset and Terra UI Sliders

## Summary
Added `LakeGenerationSettings` ScriptableObject and integrated real-time UI sliders into the Terra Lake Iteration window for rapid lake generation parameter tuning.

## Files Changed

### New File: `Assets/Scripts/WorldGeneration/Configuration/LakeGenerationSettings.cs`
- **Purpose**: Centralized ScriptableObject for global lake generation parameters
- **Key Features**:
  - Placement parameters (spacing, lakes per tile, probability)
  - Size parameters (radius range, size variation)
  - Depth parameters (depth range, shore slope angle, depth-area curve)
  - Water properties (clarity, waves, currents)
  - River integration (inflow/outflow probability, waterfall settings)
  - Biome-specific modifiers
  - Seasonal settings
  - Performance settings
  - Debug visualization options
- **API Methods**:
  - `GetBiomeModifier(BiomeType)` - Get per-biome lake modifiers
  - `GetEffectiveRadiusRange(BiomeType)` - Calculate radius range for biome
  - `GetEffectiveDepthRange(float normalizedArea)` - Calculate depth based on area
  - `GetEffectiveClarity(BiomeType, LakeType)` - Calculate water clarity
  - `LoadDefault()` - Load from Resources folder

### Modified: `Assets/Scripts/Editor/LakeIterationWindow.cs`
- **Added**: `lakeGenerationSettings` reference field
- **Added**: `showGenerationSettings` foldout state
- **Added**: `DrawGenerationSettings()` method with real-time sliders:
  - Placement sliders (spacing, lakes/tile, probability)
  - Size range sliders (min/max radius, variation)
  - Depth range sliders (min/max depth, shore slope)
  - Water property sliders (clarity, wave intensity, currents)
  - River integration sliders (inflow/outflow probability, waterfall drop)
  - Seasonal fraction slider
- **Added**: `CreateDefaultLakeGenerationSettings()` - Create new settings asset
- **Added**: `ResetSettingsToDefaults()` - Reset all parameters
- **Added**: "Apply & Regenerate" button for quick iteration

## Usage

### Creating a LakeGenerationSettings Asset
1. Menu: `Assets → Create → Bloom → Terra → Lake Generation Settings`
2. Or: Open Lake Iteration Window (`Bloom → Lake Iteration → Open Lake Iteration Window`) and click "Create" button

### Using the Terra UI Sliders
1. Open: `Bloom → Lake Iteration → Open Lake Iteration Window`
2. Expand "Generation Settings (Terra)" foldout
3. Adjust sliders in real-time
4. Click "Apply & Regenerate" to regenerate lakes with new settings

### Parameters Reference
| Parameter | Range | Description |
|-----------|-------|-------------|
| Min Lake Spacing | 100-2000m | Minimum distance between lake centers |
| Max Lakes/Tile | 0-5 | Maximum lakes per biome tile |
| Placement Prob. | 0-2 | Lake placement probability multiplier |
| Radius Range | 10-1000m | Min/max lake radius |
| Size Variation | 0-1 | Size randomization factor |
| Depth Range | 0.5-200m | Min/max lake depth |
| Shore Slope | 5-45° | Underwater slope angle |
| Base Clarity | 0-1 | Water clarity (0=murky, 1=clear) |
| Wave Intensity | 0-2 | Wave animation multiplier |
| Current Strength | 0-2 | Current simulation strength |
| Inflow Prob. | 0-1 | Probability of river inflows |
| Outflow Prob. | 0-1 | Probability of river outflows |
| Waterfall Drop | 1-20m | Min elevation for waterfall spawn |
| Seasonal Fraction | 0-1 | Fraction of seasonal lakes |

## Integration Notes
- Settings can be shared via the ScriptableObject asset
- Changes are saved automatically when modified via sliders
- Works with existing LakeSystem and HydrologyMetadata
- Compatible with region-based regeneration workflow

## Branch
`feat/issue-1012-lake-generation-settings`

## Commits
- `feat: Add LakeGenerationSettings asset and Terra UI sliders`
