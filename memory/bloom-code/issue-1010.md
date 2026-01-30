# Issue #1010: Terrain Border Diagnostics & Visualization Tools

## Status: ✅ Complete

**PR:** https://github.com/zachyzissou/Bloom/pull/1132
**Branch:** `feature/issue-1010-border-diagnostics`
**Commit:** `ff471dffa`

## Summary

Added comprehensive border diagnostics and visualization tools for the terrain system to help identify and debug tile border discontinuities (seam artifacts).

## Files Created

### 1. `Assets/Scripts/Terrain/Debug/BorderDiagnosticsVisualizer.cs`
**MonoBehaviour for Scene View visualization**

Features:
- Color-coded border lines (green=valid, yellow=warning, red=error)
- Discontinuity point markers with height spheres
- Per-tile labels showing delta values and issue counts
- Configurable thresholds (warning/error in meters)
- Auto-refresh option for real-time monitoring
- Filter by tile range
- Toggle layers (lines, points, labels)
- Show-only-problems mode

Usage:
1. Add component to any GameObject in scene
2. Configure thresholds in Inspector
3. Click "Refresh Diagnostics" or enable auto-refresh
4. View Gizmos in Scene view

### 2. `Assets/Scripts/Editor/BorderDiagnosticsWindow.cs`
**Editor Window for comprehensive diagnostics**

Access: `Bloom > Terrain > Border Diagnostics` or `Shift+Alt+B`

Features:
- Full world scan with progress bar
- Sortable results table (by coordinates, severity, delta)
- Filterable (valid/warning/error, search by tile coords)
- Quick navigation to problem tiles in Scene view
- Detailed per-tile breakdown (per-edge stats)
- Export reports to text file
- Create/focus visualizer button

### 3. `Assets/Scripts/WorldGeneration/Validation/BorderDiagnosticsAPI.cs`
**Static API for runtime and editor use**

Key Methods:
- `CheckTileHealth(tileX, tileZ, out maxDelta)` - Quick single-tile check
- `CheckEdgeHealth(tileX, tileZ, edge, out delta)` - Single edge check
- `GetRangeHealth(min, max)` - Batch validation returning `BorderHealthSummary`
- `GetDiscontinuityPoints(tileX, tileZ, minDelta)` - Get points for visualization
- `ValidateAfterStitching(tileX, tileZ, heightmap)` - Post-generation validation hook
- `GetEdgeWorldPositions(tileX, tileZ, edge)` - Get edge as world coordinates

Events:
- `OnBorderIssueDetected` - Fired when issues detected during generation

Data Classes:
- `BorderHealthSummary` - Summary stats for tile range
- `DiscontinuityPoint` - Single discontinuity with world position
- `BorderIssueEventArgs` - Event data for issue detection

## Integration Points

The API integrates with:
- `TerrainEdgeDatabase` - Reads cached edge contract data
- `EdgeStitcher` - Can be called after blending operations
- `BorderDeltaValidator` (issue #1006) - Complementary validation

## Usage Examples

```csharp
// Quick health check
if (!BorderDiagnosticsAPI.CheckTileHealth(5, 10, out float delta))
{
    Debug.LogError($"Tile [5,10] has border issues: {delta}m");
}

// Batch validation
var summary = BorderDiagnosticsAPI.GetRangeHealth(Vector2Int.zero, new Vector2Int(31, 31));
Debug.Log($"World health: {summary.HealthPercent}% valid");

// Subscribe to real-time issues
BorderDiagnosticsAPI.OnBorderIssueDetected += args =>
{
    if (args.Severity == IssueSeverity.Error)
        Debug.LogError($"Border issue at [{args.TileX},{args.TileZ}] {args.Edge}");
};
```

## Related Issues
- Issue #1006: Border Delta Validation (foundational validator)
- Issue #1007: Terrain Texture Blending
- Issue #1009: Terrain Neighbor Wiring
