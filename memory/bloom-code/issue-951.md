# Issue #951: Terra POI Placement System

**Status**: ✅ Implemented
**Branch**: `feature/issue-951-poi-placement-system`
**Commit**: `be12a609a`
**Date**: 2026-01-29

## Summary

Designed and implemented a comprehensive POI (Point of Interest) placement system for Terra based on the `POI_TAXONOMY_AND_DISTRIBUTION.md` design document.

## Components Created

### Core System (`Assets/Scripts/POI/`)

1. **POIType.cs** - POI type definitions
   - 31 POI types across 10 categories
   - POICategory enum (FactionHubs, Military, Crash sites, etc.)
   - HazardTier enum (H1_Safe, H2_Medium, H3_Hardcore)
   - Extension methods for category, hazard tier, and code lookups

2. **POIDefinition.cs** - ScriptableObject for POI configuration
   - Placement rules (min distances, terrain constraints)
   - Size/scale settings (footprint, height, visibility)
   - Instance count limits
   - Biome spawn weights
   - Prefab variants with weights

3. **POIPlacementConfig.cs** - World-level placement configuration
   - Global density settings (target 0.2 POIs/km²)
   - POI count targets (181-221 total)
   - Biome distribution rules
   - Category placement order
   - Poisson sampling settings

4. **POIPlacementData.cs** - Runtime placement data
   - POIInstance class with all placement info
   - Spatial queries (by tile, by radius, by type)
   - Statistics tracking
   - Serialization support

5. **POIPlacementService.cs** - Core placement algorithm
   - Spatial grid for fast neighbor queries
   - Biome-aware distribution
   - Category-ordered placement (landmarks first)
   - Distance validation
   - Weighted random selection

6. **POIPlacementStage.cs** - Pipeline integration
   - Integrates with TerrainGenerationPipeline
   - Dependencies: TileGenerationStage, EdgeSolverStage
   - Saves placement data as ScriptableObject asset

7. **POISpawner.cs** - Runtime spawning
   - Streaming system (spawn/despawn by distance)
   - LOD support for distant POIs
   - POIMarker component for spawned objects
   - Event callbacks for spawn/despawn

### Editor Tools (`Assets/Scripts/POI/Editor/`)

8. **POIPlacementEditor.cs** - Editor window
   - Configuration management
   - Placement data visualization
   - Generation controls
   - Validation utilities

### Tests (`Assets/Scripts/Testing/Unit/POI/`)

9. **POIPlacementTests.cs** - Unit tests
   - POIType mapping tests
   - POIInstance creation tests
   - POIPlacementData query tests
   - POIPlacementConfig validation tests

## Design Decisions

### Placement Algorithm
- Uses spatial grid for O(1) neighbor lookups during placement
- Places POIs in category order: Landmarks → FactionHubs → Extraction → ... → Resources
- Validates minimum distances between POIs (configurable per-type)

### Biome Distribution
- Each biome has min/max POI quotas from design doc
- POI types have biome spawn weights
- Category exclusions prevent misplaced POIs

### Runtime Streaming
- POIs spawn within configurable distance (default 1000m)
- Despawn at larger distance (default 1500m)
- LOD prefabs used beyond lodDistance (500m)
- Max spawns per frame prevents hitching

## Integration Points

1. **Terrain Pipeline**: POIPlacementStage runs after EdgeSolverStage
2. **Tile Streaming**: POISpawner integrates with existing streaming system
3. **POIHeatBroadcaster**: Existing component for streaming heat

## Usage

### Editor Workflow
1. Open `Bloom > POI > POI Placement Editor`
2. Create/assign POI Placement Config
3. Create POI Definitions for each type
4. Generate placements
5. Placement data saved to `Assets/WorldGeneration/POI/`

### Runtime
1. Add POISpawner to scene
2. Assign placement data and config
3. Set streaming origin (player transform)
4. POIs stream in/out automatically

## Target Metrics (from Design Doc)

| Category | Target Count |
|----------|-------------|
| Faction Hubs | 7-9 |
| Military Installations | 38-51 |
| Harvester Crash Sites | 43-54 |
| Industrial Sites | 31-41 |
| Civilian Ruins | 33-43 |
| Extraction Zones | 5-8 |
| Underground Locations | 39-50 |
| Landmarks | 5-6 |
| Resource Nodes | 45-57 |
| Wilderness Features | 35-45 |
| **Total** | **181-221** |

## PR Status

Branch pushed to `origin/feature/issue-951-poi-placement-system`
PR URL: https://github.com/zachyzissou/Bloom/pull/new/feature/issue-951-poi-placement-system

## Next Steps (for future work)

1. Create POIDefinition ScriptableObjects for all 31 POI types
2. Create POI prefabs with LOD variants
3. Integrate with gameplay systems (loot, spawners, quests)
4. Add minimap/map marker integration
5. Implement POI discovery system
