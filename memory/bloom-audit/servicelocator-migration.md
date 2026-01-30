# Bloom: ServiceLocator Migration Audit

**Generated:** 2025-01-28  
**Project:** C:\Users\Zachg\Development\Games\Bloom  
**Scope:** FindObjectOfType, FindObjectsOfType, GameObject.Find, GameObject.FindWithTag

---

## Executive Summary

**Total Anti-Pattern Usages Found:** 70+ instances  
**In Project Assets (Non-Library):** ~45 instances  
**Critical (Runtime/Update):** 3 files  
**High Priority (Runtime/Awake/Start):** 8 files  
**Editor-Only (Acceptable):** ~25 files  

### Quick Stats
| Category | Count | Action |
|----------|-------|--------|
| Runtime in Update/Frame | 1 | 🔴 Critical - Migrate immediately |
| Runtime in Awake/Start | 7 | 🟠 High - Migrate to ServiceLocator |
| Runtime Cached Lookups | 3 | 🟡 Medium - Consider caching |
| Editor Scripts | ~25 | 🟢 Low - Acceptable for editor tools |
| Library/Package Code | ~30 | ⚪ Ignore - Third-party |

---

## 🔴 CRITICAL PRIORITY (Runtime Performance Impact)

### 1. WeatherSystem.cs
**File:** `Assets/Scripts/Environment/Weather/WeatherSystem.cs`  
**Line:** 370  
**Pattern:** `GameObject.FindWithTag("Player")`  
**Context:** Called in `TryFindPlayerTransform()` which runs periodically (throttled via `nextPlayerSearchTime`)

```csharp
var playerObject = GameObject.FindWithTag("Player");
if (playerObject != null)
{
    playerTransform = playerObject.transform;
}
```

**Issue:** Even though throttled, this is runtime code that could be called multiple times.  
**Migration:** Inject player reference via ServiceLocator or event-based player spawn notification.  
**Effort:** 🟡 Medium (2-3 hours)

---

### 2. PhaseDetectorSystem.cs
**File:** `Assets/Scripts/Environment/PhaseDetectorSystem.cs`  
**Line:** 131  
**Pattern:** `GameObject.FindGameObjectsWithTag(HARVESTER_TAG)`  
**Context:** Called in `RefreshHarvesterSourcesCache()` - manual refresh method

```csharp
GameObject[] sources = GameObject.FindGameObjectsWithTag(HARVESTER_TAG);
harvesterSources.AddRange(sources);
```

**Issue:** FindGameObjectsWithTag iterates all objects. Called manually but could be frequent.  
**Migration:** Use a Harvester registry pattern - sources register/unregister themselves.  
**Effort:** 🟡 Medium (3-4 hours)

---

### 3. TerrainModificationSystem.cs
**File:** `Assets/Scripts/WorldGeneration/Runtime/TerrainModificationSystem.cs`  
**Line:** 309  
**Pattern:** `GameObject.Find(terrainName)`  
**Context:** Called in `GetTerrainForTile()` with caching

```csharp
var terrainObj = GameObject.Find(terrainName);
```

**Issue:** Runtime terrain lookup, but uses cache to mitigate repeated calls.  
**Migration:** Use TileGenerationContext registry (already exists for pipeline stages).  
**Effort:** 🟢 Low (1-2 hours) - Infrastructure exists

---

## 🟠 HIGH PRIORITY (Runtime Awake/Start)

### 4. StreamingHeatDebugOverlay.cs
**File:** `Assets/Scripts/Gameplay/StreamingHeatDebugOverlay.cs`  
**Line:** 47  
**Pattern:** `GameObject.FindWithTag("Player")`  
**Context:** Awake fallback when inspector reference not set

```csharp
var localPlayer = GameObject.FindWithTag("Player");
if (localPlayer != null)
{
    player = localPlayer.transform;
}
```

**Migration:** ServiceLocator.GetService<IPlayerProvider>()  
**Effort:** 🟢 Low (1 hour)

---

### 5. StreamingHeatDebugSpawner.cs
**File:** `Assets/Scripts/Gameplay/StreamingHeatDebugSpawner.cs`  
**Line:** 29  
**Pattern:** `GameObject.FindWithTag("Player")`  
**Context:** Awake fallback

**Migration:** ServiceLocator.GetService<IPlayerProvider>()  
**Effort:** 🟢 Low (1 hour)

---

### 6. StreamingHeatMinimap.cs
**File:** `Assets/Scripts/Gameplay/StreamingHeatMinimap.cs`  
**Line:** 33  
**Pattern:** `GameObject.FindWithTag("Player")`  
**Context:** Awake fallback

**Migration:** ServiceLocator.GetService<IPlayerProvider>()  
**Effort:** 🟢 Low (1 hour)

---

### 7. EnemyPatrolSystem.cs
**File:** `Assets/Scripts/Gameplay/FirstPlayable/Combat/EnemyPatrolSystem.cs`  
**Line:** 59  
**Pattern:** `GameObject.Find(DefaultWaypointNetworkName)`  
**Context:** Start - finds waypoint network

```csharp
var network = GameObject.Find(DefaultWaypointNetworkName);
```

**Migration:** Inject WaypointNetwork via inspector or ServiceLocator.  
**Effort:** 🟢 Low (1-2 hours)

---

### 8. HubBrokerBootstrap.cs
**File:** `Assets/Scripts/Gameplay/FirstPlayable/UI/HubBrokerBootstrap.cs`  
**Line:** 81  
**Pattern:** `GameObject.FindGameObjectWithTag("Player")`  
**Context:** EnsurePlaceholderPlayer method

**Migration:** ServiceLocator check for player existence  
**Effort:** 🟢 Low (1 hour)

---

### 9. RuntimeTerrainLoader.cs
**File:** `Assets/Scripts/Terrain/RuntimeTerrainLoader.cs`  
**Line:** 151  
**Pattern:** `GameObject.Find("Bloom Terrains")`  
**Context:** Awake - finds/creates terrain parent container

```csharp
terrainParent = GameObject.Find("Bloom Terrains");
if (terrainParent == null)
{
    terrainParent = new GameObject("Bloom Terrains");
}
```

**Migration:** Use ServiceLocator or make it a prefab with proper DI.  
**Effort:** 🟢 Low (1 hour)

---

### 10. SteamAutoInitializer.cs
**File:** `Assets/Scripts/Networking/SteamAutoInitializer.cs`  
**Line:** 29  
**Pattern:** `GameObject.Find("SteamManager")`  
**Context:** InitializeOnLoad - editor bootstrap

**Note:** This is `[InitializeOnLoadMethod]` - editor-only bootstrap.  
**Migration:** Optional - editor code is acceptable.  
**Effort:** ⚪ N/A

---

## 🟡 MEDIUM PRIORITY (World Generation Runtime)

### 11. VegetationDetailStage.cs
**File:** `Assets/Scripts/WorldGeneration/Pipeline/Stages/VegetationDetailStage.cs`  
**Lines:** 130, 268, 314  
**Pattern:** `GameObject.Find($"Terrain_{detailTile.x}_{detailTile.y}")`

**Context:** Pipeline stage - runs during world generation (not gameplay loop).  
**Note:** Should use TileGenerationContext registry (TERRA-300 compliance).  
**Effort:** 🟡 Medium (2 hours)

---

### 12. DetailZoneStage.cs
**File:** `Assets/Scripts/WorldGeneration/Pipeline/Stages/DetailZoneStage.cs`  
**Lines:** 1074, 1398, 1462, 1487, 1523  
**Patterns:** 
- `Resources.FindObjectsOfTypeAll<UnityEngine.Terrain>()`
- `GameObject.Find(terrainName)` (with TERRA-300 fallback comment)

**Context:** Pipeline stage with partial TERRA-300 compliance.  
**Note:** Line 1395 shows proper pattern: "Fallback to GameObject.Find if not in registry (legacy support)"  
**Effort:** 🟡 Medium (2-3 hours to fully migrate)

---

### 13. TerrainStageHelpers.cs
**File:** `Assets/Scripts/WorldGeneration/Pipeline/Stages/TerrainStageHelpers.cs`  
**Line:** 65  
**Pattern:** `GameObject.Find(name)`

**Context:** Helper with proper TERRA-300 implementation - tries registry first, falls back to Find.
```csharp
// TERRA-300 #10: First checks context registry (dependency injection), then falls back to GameObject.Find.
```

**Migration:** Already partially done - remove fallback when all callers use context.  
**Effort:** 🟢 Low (1 hour)

---

### 14. TileGenerationStage.cs
**File:** `Assets/Scripts/WorldGeneration/Pipeline/Stages/TileGenerationStage.cs`  
**Line:** 328  
**Pattern:** `Resources.FindObjectsOfTypeAll<UnityEngine.Terrain>()`

**Context:** Editor-time terrain enumeration during generation.  
**Effort:** 🟡 Medium (1-2 hours)

---

### 15. HybridTerrainSystem.cs
**File:** `Assets/Scripts/WorldGeneration/MeshTerrain/HybridTerrainSystem.cs`  
**Line:** 96  
**Pattern:** `GameObject.Find(terrainName)`

**Context:** Runtime terrain lookup for mesh-terrain hybrid system.  
**Migration:** Use terrain registry or ServiceLocator.  
**Effort:** 🟡 Medium (2 hours)

---

### 16. EdgeConstraintGraph.cs
**File:** `Assets/Scripts/WorldGeneration/Edge/EdgeConstraintGraph.cs`  
**Line:** 602  
**Pattern:** `GameObject.Find(terrainName)`

**Context:** Edge constraint processing during generation.  
**Effort:** 🟡 Medium (1-2 hours)

---

### 17. CollisionContinuityValidator.cs
**File:** `Assets/Scripts/WorldGeneration/Validation/CollisionContinuityValidator.cs`  
**Lines:** 419, 424  
**Pattern:** `GameObject.Find(terrainName)`

**Context:** Validation tool - acceptable for editor/validation.  
**Effort:** 🟢 Low (optional)

---

## 🟢 LOW PRIORITY (Editor Scripts - Acceptable)

These are editor-only scripts where Find patterns are acceptable:

| File | Lines | Pattern | Notes |
|------|-------|---------|-------|
| BatchTerrainGenerator.cs | 911, 922, 1502, 2068, 2716, 2960, 3314, 3390, 3527, 3541, 3587, 3602, 3651, 3826, 5064, 5093, 5119 | GameObject.Find | Editor terrain generation |
| HeathenSceneSetup.cs | 31, 45, 94 | GameObject.Find | Editor scene setup |
| EdgeConstraintSolver.cs | 132 | GameObject.Find | Editor tool |
| MultiPassEdgeRefiner.cs | 76 | GameObject.Find | Editor tool |
| FirstPlayableDiagnostics.cs | 170 | GameObject.Find | Diagnostics |
| FirstPlayableWaypointTools.cs | 16, 31 | GameObject.Find | Editor tool |
| InspectLakeWaterPlacement.cs | 99, 145 | GameObject.Find | Editor inspection |
| SceneSetupHelper.cs | 19, 86 | GameObject.Find | Editor setup |
| TerraValidationTools.cs | 193 | GameObject.Find | Validation tool |

---

## ⚪ IGNORED (Third-Party/Library Code)

Files in `Library/PackageCache/` are third-party and should not be modified:

- com.coplaydev.unity-mcp (MCP editor tools)
- com.unity.addressables (Unity Addressables)
- com.unity.ai.assistant (Unity AI Assistant)
- com.unity.ai.generators (Unity AI Generators)
- com.unity.2d.common/sprite (Unity 2D packages)
- com.github-glitchenzo.nugetforunity (NuGet for Unity)

---

## Migration Recommendations

### Immediate Actions (Week 1)

1. **Create IPlayerProvider Service**
   ```csharp
   public interface IPlayerProvider
   {
       Transform PlayerTransform { get; }
       bool HasPlayer { get; }
       event Action<Transform> OnPlayerSpawned;
   }
   ```
   - Register in ServiceLocator
   - Migrate: WeatherSystem, StreamingHeat*, HubBrokerBootstrap

2. **Create ITerrainRegistry Service**
   ```csharp
   public interface ITerrainRegistry
   {
       bool TryGetTerrain(Vector2Int tile, out Terrain terrain);
       void RegisterTerrain(Vector2Int tile, Terrain terrain);
       IEnumerable<Terrain> GetAllTerrains();
   }
   ```
   - Leverage existing TileGenerationContext pattern
   - Migrate: TerrainModificationSystem, VegetationDetailStage, HybridTerrainSystem

### Short-Term Actions (Week 2-3)

3. **Create IHarvesterRegistry Service**
   - Self-registration pattern for harvester sources
   - Migrate: PhaseDetectorSystem

4. **Create IWaypointNetworkProvider Service**
   - Migrate: EnemyPatrolSystem

### Long-Term (As Needed)

5. **Remove GameObject.Find Fallbacks**
   - After all callers use registry, remove fallback code in TerrainStageHelpers
   - Update DetailZoneStage to fully use context

---

## Effort Summary

| Priority | Files | Total Effort |
|----------|-------|--------------|
| 🔴 Critical | 3 | 8-10 hours |
| 🟠 High | 7 | 7-9 hours |
| 🟡 Medium | 7 | 10-14 hours |
| 🟢 Low (Optional) | 10+ | As needed |

**Total Estimated Effort:** 25-35 hours for full migration

---

## Files Already Using ServiceLocator Correctly

These files demonstrate proper patterns to follow:

1. **RuntimeTerrainLoader.cs (lines 168-172)**
   ```csharp
   if (ServiceLocator.TryGetInstance(out var serviceLocator) && 
       serviceLocator.TryGetService<IBiomeManager>(out biomeManager))
   ```

2. **TileGenerationContext.cs** - Full TERRA-300 registry implementation

3. **TerrainStageHelpers.cs** - Shows migration pattern with fallback

---

## Appendix: All Usages by File

### FindObjectOfType Variants (Project Assets Only)
| File | Line | Pattern | Context |
|------|------|---------|---------|
| DetailZoneStage.cs | 1074, 1487 | Resources.FindObjectsOfTypeAll<Terrain> | Pipeline |
| TileGenerationStage.cs | 328 | Resources.FindObjectsOfTypeAll<Terrain> | Pipeline |
| SimplePlayerController.cs (worktree) | 57 | FindObjectOfType<RuntimeTerrainLoader> | Runtime |
| AdaptiveSpatialManager.cs (worktree) | 118 | FindObjectsOfType<DynamicNetworkObject> | Networking |

### GameObject.Find Variants (Project Assets Only)
| File | Line | Pattern | Context |
|------|------|---------|---------|
| WeatherSystem.cs | 370 | FindWithTag("Player") | Runtime |
| PhaseDetectorSystem.cs | 131 | FindGameObjectsWithTag | Runtime |
| StreamingHeatDebugOverlay.cs | 47 | FindWithTag("Player") | Awake |
| StreamingHeatDebugSpawner.cs | 29 | FindWithTag("Player") | Awake |
| StreamingHeatMinimap.cs | 33 | FindWithTag("Player") | Awake |
| EnemyPatrolSystem.cs | 59 | Find(WaypointNetwork) | Start |
| HubBrokerBootstrap.cs | 81 | FindGameObjectWithTag("Player") | Runtime |
| RuntimeTerrainLoader.cs | 151 | Find("Bloom Terrains") | Awake |
| SteamAutoInitializer.cs | 29 | Find("SteamManager") | Editor Init |
| TerrainModificationSystem.cs | 309 | Find(terrainName) | Runtime |
| VegetationDetailStage.cs | 130, 268, 314 | Find(terrain) | Pipeline |
| DetailZoneStage.cs | 1398, 1462, 1523 | Find(terrain/parent) | Pipeline |
| TerrainStageHelpers.cs | 65 | Find (with context fallback) | Pipeline |
| HybridTerrainSystem.cs | 96 | Find(terrainName) | Runtime |
| EdgeConstraintGraph.cs | 602 | Find(terrainName) | Generation |
| CollisionContinuityValidator.cs | 419, 424 | Find(terrain) | Validation |
| BatchTerrainGenerator.cs | 17 instances | Find (various) | Editor |
| (+ ~10 more editor files) | | | Editor |

---

*Report generated by Bloom Architecture Audit*
