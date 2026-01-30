# Issue #1032: Terra: Water Feature Debug Visualization Tools

## Status: ✅ Complete

**PR**: https://github.com/zachyzissou/Bloom/pull/1136
**Branch**: `feat/water-debug-viz-1032-final`
**Date**: 2026-01-29

## Summary

Created debug visualization tools for water features to preview water carving results before committing to TerrainData.

## Files Created

### 1. `Assets/Scripts/Editor/WorldGeneration/Hydrology/WaterFeatureDebugWindow.cs`
Main editor window (37KB) with:
- **PreviewMode enum**: RiverPaths, CarvingDepth, LakeBasins, FlowDirection, WaterExclusion
- **Tile selection**: Single tile, radius-based, or entire world preview
- **Visualization settings**: Width scale, depth range, exclusion radius, arrow settings
- **Color customization**: All visualization colors are configurable
- **Export functionality**: Save preview to PNG images
- **Scene view overlay**: Interactive panel with quick toggles

### 2. `Assets/Scripts/Editor/WorldGeneration/Hydrology/WaterFeatureGizmos.cs`
Scene view gizmo system (23KB) with menu toggles:
- **Toggle All Water Gizmos** (Bloom > Debug > Water Gizmos)
- **Show River Carving Preview**: Width boundaries, depth indicators, entry/exit points
- **Show Lake Carving Preview**: Boundaries, fill areas, inflow/outflow points
- **Show Cross Sections**: U-shaped channel visualization with dimensions
- **Show Terrain Intersection**: Actual terrain height vs. carved depth

## Key Features

1. **Preview Modes**:
   - **RiverPaths**: Shows river centerlines with width indicators
   - **CarvingDepth**: Heat map of terrain carving depth (blue=shallow to dark blue=deep)
   - **LakeBasins**: Lake boundaries with filled areas and depth labels
   - **FlowDirection**: Arrow visualization showing water flow direction and discharge
   - **WaterExclusion**: Vegetation exclusion zones around water features

2. **Data Sources**:
   - Uses `RiverSystem.GetSegmentsByTileSnapshot()` for river data
   - Uses `LakeSystem.GetSegmentsByTileSnapshot()` for lake data
   - No terrain modification - pure visualization

3. **Performance**:
   - Cached preview data with dirty flag
   - Selective tile loading (radius-based)
   - Live preview toggle for controlled updates

## Usage

1. Open Unity Editor
2. Go to **Bloom > Debug > Water Feature Debug Window**
3. Ensure RiverSystem and LakeSystem are in the scene
4. Select preview mode and tile region
5. Toggle "Scene View Overlay" to see visualizations
6. Use **Bloom > Debug > Water Gizmos** menu for quick toggles

## Acceptance Criteria (from issue)

- [x] Preview window shows all water features
- [x] Multiple visualization modes available
- [x] Scene view overlay option
- [x] Live preview during parameter editing
- [x] Export preview to image

## Technical Notes

- Uses `Handles` API for scene view drawing
- Data structures: `WaterFeaturePreviewData`, `CarvingDepthSample`
- Integrates with existing `WaterDebugWindow` via quick action button
- EditorPrefs used for persisting gizmo toggle states
