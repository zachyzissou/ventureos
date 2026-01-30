# Bloom World Generation Deep Dive Audit

## Project Overview
- **Location:** `C:\Users\Zachg\Development\Games\Bloom`
- **World Size:** 32×32 km (1024 tiles at 1km each)
- **Tile Resolution:** 513×513 heightmap, 512×512 alphamap
- **Terrain Height:** 600m total (sea level at 100m)

---

## 1. Pipeline Stages

### WorldGenerationPipeline.cs
**Location:** `Assets\Scripts\WorldGeneration\WorldGenerationPipeline.cs`

A lightweight runtime coordinator that:
- Registers with ServiceLocator on Awake
- Loads `PeninsulaGridLayout` from Resources
- Loads all `BiomeSettings` ScriptableObjects into a dictionary by BiomeType
- Provides `GetBiomeSettings(BiomeType)` lookup

### BiomeGenerationPhase.cs - 5-Phase System
1. **Anchors (Phase 0):** 10 tiles - one anchor per biome defining core character
2. **Cores (Phase 1):** ~90 tiles - 3×3 regions around each anchor
3. **Transitions (Phase 2):** ~100 tiles - biome boundary blending
4. **Perimeter (Phase 3):** ~40 tiles - ocean tiles bordering land
5. **Ocean (Phase 4):** ~16 tiles - pure ocean (lowest priority, generated last)

### BatchTerrainGenerator.cs - Actual Generation Engine
**Location:** `Assets\Scripts\Editor\BatchTerrainGenerator.cs` (~3800 lines)

This is the **real** terrain generation workhorse:
- Menu: `Bloom → Terrain Generation → Generate Full World (32×32)` (~8-15 hours)
- Menu: `Bloom → Terrain Generation → Generate Test Region (3×3)` (~2 min)
- Integrates: BiomeManager, MacroWorldGenerator, EdgeStitcher, TexturePainter

**Key constants:**
```csharp
WORLD_SIZE_TILES = 32
TILE_SIZE_METERS = 1000f (1km)
HEIGHTMAP_RESOLUTION = 513
ALPHAMAP_RESOLUTION = 512
TERRAIN_HEIGHT_METERS = 600f
SEA_LEVEL_METERS = 100f
EDGE_BLEND_WIDTH = 32 pixels
```

### MacroWorldGenerator.cs - Multi-Tile Features
**Location:** `Assets\Scripts\Terrain\MacroFeatures\MacroWorldGenerator.cs` (~1200 lines)

Two-pass workflow:
1. `GenerateMacroElevationMask()` - Initializes tiled mask system
2. `ApplyMacroFeatures()` - Blends tile mask at Step 1.5 (after base, before erosion)

**Performance:**
- Memory: ~9MB active tiles (3×3 LRU cache) vs 256MB monolithic
- Speed: ~50-100ms per tile with 38 features enabled
- Uses Unity Burst + Jobs for parallel processing

---

## 2. Biome Implementation

### BiomeType Enum (13 Biomes)
| Biome | Hazard Level | Character |
|-------|--------------|-----------|
| CentralGrasslands | H3 | IEZ Core (world center) |
| ForestHills | H1 | Safe zone |
| TheReach | H1 | Starting zone (coastal) |
| SouthwestPlains | H1 | Agricultural |
| EasternPlateaus | H2 | Tech salvage |
| WesternMountains | H2-H3 | Industrial |
| GreyreachDistrict | H2 | Urban |
| SnowPeaks | H3 | Alpine |
| TheStillfreeze | H3 | Frozen |
| ShimmerMarsh | H2-H3 | Wetlands |
| TheDrift | H2 | Desert nomad |
| Ocean | - | Water tiles |
| Volcanic | - | Geothermal obsidian fields |

### TileResolution Enum
- **Standard2km:** 2048m × 2048m base tiles
- **Detail500m:** 512m × 512m detail tiles

### BiomeSettings Loading
- Loaded from `Resources/WorldGeneration/Biomes/` at runtime
- Each biome type maps to a `BiomeSettings` ScriptableObject
- Falls back to null with warning if biome settings missing

---

## 3. POI Placement System

### Current Implementation (FirstPlayable)
**Location:** `Assets\Scripts\Gameplay\FirstPlayable\Encounters\`

#### POIDefinition.cs (ScriptableObject)
```csharp
- poiId: string identifier
- encounter: EncounterDefinition reference
- lootTable: LootTable reference (independent of encounter loot)
- placementOffset: Vector3
```

#### POISpawner.cs
- Server-only spawning (checks `NetworkManager.Singleton.IsServer`)
- Manual placement via Transform[] `spawnPoints`
- Creates POI GameObjects with `EncounterRunner` component
- Spawns initial loot from POI-specific loot table

**Status:** Placeholder system - uses manual spawn points, not procedural placement.

### Editor Tools
- `POIContentCreator.cs` - Editor tooling
- `POIPrefabCreator.cs` - Prefab generation
- `POIHeatBroadcaster.cs` - Runtime heat system integration

---

## 4. Terrain Generation Approach

### Texture System - 5-Layer Splatmap
Sand / Grass / Dirt / Rock / Snow applied via TexturePainter

### Edge Stitching
- 32-pixel blend width for smoothstep transitions
- Edge contract system (`EdgeContractManager`) for tile boundary consistency
- Continental shelf handling for coastal tiles

### Coastal Features
- Beach width default: 100m
- Continental shelf floor: 50m
- Sea level at 100m allows underwater terrain (0-100m) and above-water (100-600m)

### Noise Configuration
```csharp
BASE_FREQUENCY = 0.5f   // Smooth base terrain
BASE_AMPLITUDE = 0.2f   // Let macro features dominate
```

### Memory Management
- `TileMemoryManager` enforces <500MB budget
- Active tile tracking with unloading
- `TerrainArrayPool` for heightmap array reuse

---

## 5. Test Suite Status

### ⚠️ CRITICAL: Key Test Suites Are DISABLED

| File | Status | Purpose |
|------|--------|---------|
| `WorldGenerationValidationSuite.cs.disabled` | **DISABLED** | Integration tests |
| `WorldGenerationPipelineTests.cs.disabled` | **DISABLED** | Unit tests |

### Active World Generation Tests
| File | Status |
|------|--------|
| `MacroWorldGeneratorTests.cs` | ✅ Active |
| `MacroWorldGeneratorBurstTests.cs` | ✅ Active |
| `EdgeContractManagerTests.cs` | ✅ Active |
| `EdgeSolverResidualTests.cs` | ✅ Active |
| `HydrologyCoverageTests.cs` | ✅ Active |
| `MacroMaskLeakageTests.cs` | ✅ Active |
| `BiomeAssignmentServiceTests.cs` | ✅ Active |
| `TerraFeatureRegistryTests.cs` | ✅ Active |
| `TerraOutputValidationTests.cs` | ✅ Active |

### Disabled Unit Tests (Partial List)
- BiomeSettingsTests.cs.disabled
- EdgeStitcherTests.cs.disabled
- TexturePainterTests.cs.disabled
- PeninsulaGridLayoutTests.cs.disabled
- TerrainTileGeneratorTests.cs.disabled
- CoastalHeightModifierTests.cs.disabled
- DetailZoneDeterminismTests.cs.disabled

**~40+ test files are disabled** (`.cs.disabled` extension)

---

## 6. Key Findings & Technical Debt

### Strengths
1. **Well-architected biome system** - 5-phase generation ensures visual coherence
2. **Memory-conscious** - Tiled LRU cache vs monolithic masks
3. **Burst/Jobs integration** - Parallel terrain generation
4. **Edge contract system** - Consistent tile boundaries

### Concerns
1. **POI placement is placeholder** - Manual spawn points, not procedural
2. **Massive test debt** - Most world generation tests are disabled
3. **Long generation times** - 8-15 hours for full world
4. **Multiple worktrees** - `peninsula-world-generation` branch active

### EA Scope Recommendations
1. Enable critical tests before EA release
2. Implement procedural POI placement using biome rules
3. Profile and optimize full-world generation
4. Consolidate worktree branches

---

## 7. File Reference

### Core Files
- `WorldGenerationPipeline.cs` - Runtime coordinator
- `BatchTerrainGenerator.cs` - Editor generation engine
- `MacroWorldGenerator.cs` - Multi-tile macro features
- `BiomeGenerationPhase.cs` - Phase definitions
- `BiomeType.cs` - Biome enumeration

### Configuration
- `Resources/WorldGeneration/PeninsulaGrid` - Grid layout asset
- `Resources/WorldGeneration/Biomes/` - Biome settings

### Directories
- `Assets\Scripts\WorldGeneration\` - Core worldgen
- `Assets\Scripts\Terrain\MacroFeatures\` - Macro generation
- `Assets\Scripts\Testing\` - Test suites (many disabled)

---

VALIDATION:
- Output file: memory/bloom-audit/deep-dive-worldgen.md ✓ exists
- Completeness: complete
- Self-check: PASS
- Confidence: high
