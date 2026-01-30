# Issue #1009: Terrain Auto-Connect Validation + Neighbor Wiring

## Summary
Implemented auto-connect validation and deterministic neighbor wiring for terrain tiles to fix border artifacts.

## Problem
- `m_AllowAutoConnect` was enabled on terrain tiles, but border artifacts persisted
- Unity's auto-connect only works when neighbors are properly assigned via `SetNeighbors()`
- No terrain neighbor wiring was being done during batch generation
- No validation existed to check neighbor assignments

## Solution
Created a comprehensive terrain neighbor validation and wiring system:

### Files Created

#### 1. `Assets/Scripts/WorldGeneration/Validation/TerrainNeighborValidator.cs`
- Parses terrain coordinates from naming convention (`Terrain_x_z`)
- Validates neighbor assignments against expected neighbors
- Provides deterministic neighbor wiring using `Terrain.SetNeighbors()`
- Generates detailed validation reports

Key classes:
- `NeighborValidationResult`: Per-terrain validation result
- `ValidationSummary`: Aggregate validation for all terrains
- `WiringResult`: Result of neighbor wiring operation

#### 2. `Assets/Scripts/Editor/TerrainNeighborWiringUtility.cs`
Editor menu items under `Bloom/Terrain/`:
- **Validate Neighbor Wiring**: Check all terrain neighbor assignments
- **Wire All Neighbors**: Fix all neighbor wiring issues
- **Show Neighbor Status**: View selected terrain's neighbor info

### Files Modified

#### 1. `Assets/Scripts/Editor/BatchTerrainGenerator.cs`
Added post-generation step to automatically wire terrain neighbors:
- `WireTerrainNeighbors()` method added
- Called after constraint solver, before `AssetDatabase.SaveAssets()`
- Validates wiring was successful and logs results

#### 2. `Assets/Scripts/Editor/TerrainValidationSuite.cs`
Added Test 6: Terrain Neighbor Wiring
- Integrates `TerrainNeighborValidator` into validation suite
- Reports missing/incorrect neighbor assignments
- Shows validity score

## How It Works

### Neighbor Wiring Logic
Unity Terrain uses the following coordinate convention:
- `leftNeighbor`: tile at x-1 (West)
- `rightNeighbor`: tile at x+1 (East)
- `topNeighbor`: tile at z+1 (North)
- `bottomNeighbor`: tile at z-1 (South)

The validator:
1. Parses tile coordinates from terrain name or position
2. Determines expected neighbors based on grid adjacency
3. Compares against actual assignments
4. Reports discrepancies

### Post-Generation Wiring
After all tiles are generated:
1. Build lookup tables for all terrains
2. For each terrain, find neighbors by coordinates
3. Call `terrain.SetNeighbors(left, top, right, bottom)`
4. Flush terrain LOD for proper auto-connect

## Usage

### Automatic (During Generation)
Neighbor wiring is now automatic after batch generation. No action needed.

### Manual Validation
```
Unity Menu: Bloom → Terrain → Validate Neighbor Wiring
```

### Manual Wiring
```
Unity Menu: Bloom → Terrain → Wire All Neighbors
```

### Check Single Terrain
Select terrain in Hierarchy, then:
```
Unity Menu: Bloom → Terrain → Show Neighbor Status
```

## Testing
The implementation includes:
- Validation in `TerrainValidationSuite` (Test 6)
- Automatic post-wiring validation in `BatchTerrainGenerator`
- Editor menu items for manual testing

## Notes
- Neighbor wiring enables Unity's `m_AllowAutoConnect` to function correctly
- The wiring step is idempotent (safe to run multiple times)
- Position-based fallback for terrains with non-standard names
- Detailed logging for debugging wiring issues
