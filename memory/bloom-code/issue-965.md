# Issue #965: Lake Boundary Coordinate System Mismatch

**Status:** Fixed  
**PR:** [#1120](https://github.com/zachyzissou/Bloom/pull/1120)  
**Branch:** `fix/issue-965-lake-boundary-coords-v2`

## Problem

In `LakeSystem.CarveLakeBasinIntoTerrain()`, the `DistanceToPolygonEdge()` function was being called with **world coordinates** while `segment.boundaryPoints` are stored in **local (tile-relative) coordinates** (0-1000m range).

This coordinate system mismatch caused:
- Incorrect distance-from-shore calculations
- Wrong depth factor calculations  
- Malformed lake basins during terrain carving

## Root Cause Analysis

The `LakeSegment` class stores boundary points in local coordinates (relative to tile origin):
```csharp
// From LakeSegment.cs
/// Polygon boundary points (local coordinates relative to tile origin).
public Vector3[] boundaryPoints;
```

However, in `CarveLakeBasinIntoTerrain`, the code was passing world coordinates:
```csharp
// BUG: worldPosition is in world coordinates, but boundaryPoints is in local
float distanceFromShore = DistanceToPolygonEdge(worldPosition, segment.boundaryPoints);
```

The `ContainsPoint()` method worked correctly because it internally converted world to local:
```csharp
public bool ContainsPoint(Vector3 worldPosition)
{
    // Convert to local coordinates
    float localX = worldPosition.x - (tilePosition.x * tileSize);
    float localZ = worldPosition.z - (tilePosition.y * tileSize);
    // ... polygon test using local coordinates
}
```

## Solution

Convert world position to local coordinates before calling `DistanceToPolygonEdge`:

```csharp
// FIXED: Use local coordinates for distance calculation
Vector3 localPosition = new Vector3(worldX, worldPosition.y, worldZ);
float distanceFromShore = DistanceToPolygonEdge(localPosition, segment.boundaryPoints);
```

Also renamed misleading variables in the segment-only overload (`worldX`/`worldZ` → `localX`/`localZ`) for clarity.

## Files Changed

- `Assets/Scripts/Environment/Water/LakeSystem.cs`

## Testing Notes

- `CalculateMaxDistanceFromShore()` was already correct (samples from polygon bounding box in local coords)
- `ContainsPoint()` correctly converts world → local internally
- Both `CarveLakeBasinIntoTerrain` overloads (with/without LakeDefinition) were fixed
