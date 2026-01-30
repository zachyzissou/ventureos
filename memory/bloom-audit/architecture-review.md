# Bloom Architecture & Tech Debt Review

**Generated:** 2025-01-21
**Project:** C:\Users\Zachg\Development\Games\Bloom
**Scope:** Full codebase health analysis

---

## 📊 Executive Summary

| Metric | Value | Assessment |
|--------|-------|------------|
| Total C# Files | 781 | Large codebase |
| Total LOC (estimated) | ~150K+ | Substantial |
| Namespaces | 119 | Well-organized |
| TODO Comments | 54 | Moderate debt |
| HACK Comments | 3 | Low |
| XXX Comments | 2 | Low |
| Large Files (>500 LOC) | 60 | ⚠️ Refactor candidates |
| Singletons | 17 | ⚠️ Needs review |

**Overall Health: 🟡 Moderate** - Solid architecture with areas needing attention.

---

## 1. Code Comment Analysis (TODO/FIXME/HACK/XXX)

### Summary
- **TODO:** 54 comments
- **FIXME:** 0 comments
- **HACK:** 3 comments (all resolved/documented)
- **XXX:** 2 comments (edge blending notes)

### TODO Distribution by File

| File | Count | Category |
|------|-------|----------|
| FactionAbilitySystem.cs | 7 | Gameplay/VFX |
| FactionAbilityEffects.cs | 5 | Buff system |
| PlayerData.cs | 5 | Week-based milestones |
| TileStateSynchronizationSystem.cs | 4 | Networking |
| BatchTerrainGenerator.cs | 3 | World gen |
| TerrainPrototypeManager.cs | 3 | Vegetation |
| BiomeManager.cs | 3 | Refactoring notes |
| StashUI.cs | 2 | UI polish |
| SkillPointSystem.cs | 2 | VFX/feedback |
| Others | 20+ | Various |

### High-Priority TODOs

```csharp
// Networking (Week 4-5 milestones)
PlayerData.cs:160 // TODO Week 5: Notify other systems (spawn point assignment, loadout restrictions)
PlayerData.cs:243 // TODO Week 4: Drop loot, notify squad
PlayerData.cs:244 // TODO Week 5: Faction-specific death mechanics (Wardens revive faster)
PlayerRoster.cs:81 // TODO Week 4: Drop player loot, notify squad

// Performance/Telemetry
PrometheusMetricsExporter.cs:188 // TODO: Get actual average from PerformanceMonitor
PrometheusMetricsExporter.cs:215 // TODO: Implement actual latency tracking

// Combat System
NetworkedDamageSystem.cs:158 // TODO: Improve by using weapon's fire origin point
NetworkedDamageSystem.cs:326 // TODO: Play damage VFX/audio at hit point

// World Generation
MeshTerrainGenerator.cs:279 // TODO: Implement overhang generation
TileStateSynchronizationSystem.cs:175-210 // TODO: Integrate with Unity Netcode
```

---

## 2. Large Files (>500 Lines) - Refactoring Hotspots

### Critical (>2000 LOC) 🔴

| File | Lines | Component | Recommendation |
|------|-------|-----------|----------------|
| **BatchTerrainGenerator.cs** | 5,512 | Editor | Split into: HeightmapGenerator, BiomeApplicator, WaterFeatureGenerator, ValidationModule |
| **LakeSystem.cs** | 5,048 | Water | Extract: LakeRenderer, LakeMeshBuilder, LakeDebug |
| **TerraTestingSuite.cs** | 4,285 | Testing | Split by test category |
| **RiverSystem.cs** | 4,047 | Water | Extract: RiverPathfinder, RiverMeshBuilder, RiverDebug |

### High (1000-2000 LOC) 🟠

| File | Lines | Recommendation |
|------|-------|----------------|
| ValidationStage.cs | 2,622 | Extract validators into separate classes |
| HydrologyMetadataBuilderEditor.cs | 2,049 | Split UI and logic |
| WaterFeatureConfig.cs | 1,959 | Consider config splitting by feature type |
| MacroWorldGenerator.cs | 1,699 | Extract feature-specific generators |
| DetailZoneStage.cs | 1,632 | Split by zone type |
| RuntimeTerrainLoader.cs | 1,533 | Extract loading strategies |
| TerraFeatureGeneratorJobs.cs | 1,490 | Split by feature type |
| TiledMacroMaskManager.cs | 1,482 | Extract mask operations |
| TerraFeatureGenerators.cs | 1,359 | One class per generator type |
| BiomeManager.cs | 1,279 | Extract biome logic per type |

### Medium (500-1000 LOC) 🟡

60 files total in this range - key ones:
- TileStreamingManager.cs (1,072)
- BloomNetworkManager.cs (979)
- ExtractionZoneEnhanced.cs (940)
- PlayerHUD.cs (927)
- EdgeConstraintGraph.cs (926)
- WeatherSystem.cs (710)
- MainMenuUI.cs (740)

---

## 3. Namespace Organization Analysis

### Structure Quality: ✅ Excellent

```
Bloom
├── Audio                    (3 files)
├── Core                     (9 files) - Services, EventBus, GameManager
├── DOTS                     (5 files) - ECS/streaming
├── Ecology                  (9 files)
├── Editor                   (121 files)
│   ├── Builds, Cleanup, Debugging, Networking
│   ├── Performance, Progression, Setup, Steam
│   ├── Terra, Testing, Validation, Vegetation
│   └── WorldGeneration (Hydrology, Materials, etc.)
├── Environment              (24 files)
│   ├── Water               - LakeSystem, RiverSystem
│   └── Weather             - WeatherSystem, ExtremeWeather
├── Gameplay                 (144 files)
│   └── FirstPlayable       - Combat, Enemies, Factions, Loot, etc.
├── Hair                     (11 files)
├── Narrative                (9 files) - AudioLogs, Codex
├── Networking               (40 files) - Steam, Netcode
├── Performance              (7 files)
├── Player                   (4 files)
├── ProceduralIntelligence   (24 files) - LLMR, Muse, Sentis
├── Terrain                  (31 files)
├── Testing                  (63 files)
├── UI                       (10 files)
├── VfxCollision             (10 files)
└── WorldGeneration          (239 files) - Largest subsystem
    ├── Caves, Climate, Configuration, Constraints
    ├── DetailZones, Ecology, Erosion, Features
    ├── GPU, Hydrology, Jobs, LOD, Map
    ├── Materials, MeshTerrain, MicroFeatures
    ├── Multiplayer, Narrative, Navigation
    ├── Pipeline (Stages), POI, Roads, Runtime
    ├── Services, Texture, Underground
    ├── Validation, Vegetation, Water
```

### Issues Identified

1. **Duplicate EdgeContractManager**: Found in both:
   - `Bloom.WorldGeneration.Services.EdgeContractManager`
   - `Bloom.WorldGeneration.Edge.EdgeContractManager`
   
2. **Testing namespace fragmentation**:
   - `Bloom.Testing.*` (63 files)
   - `Bloom.Tests.*` (additional files)
   - Consider consolidating under single root

3. **Feature duplication risk**: Similar naming in WorldGeneration subfolders

---

## 4. Code Duplication Patterns

### Identified Patterns

1. **NetworkManager.Singleton Access** (50+ occurrences)
   ```csharp
   // Pattern repeated across AI, Combat, Network systems
   if (NetworkManager.Singleton != null && NetworkManager.Singleton.IsServer)
   {
       foreach (var client in NetworkManager.Singleton.ConnectedClientsList)
       // ...
   }
   ```
   **Recommendation:** Create `NetworkHelper` utility class

2. **ServiceLocator.Instance Access** (60+ occurrences)
   ```csharp
   var locator = ServiceLocator.Instance;
   var service = locator?.GetService<T>();
   ```
   **Recommendation:** Consider dependency injection or cached references

3. **Reflection BindingFlags** (30+ occurrences)
   ```csharp
   BindingFlags.NonPublic | BindingFlags.Instance
   ```
   **Recommendation:** Create `ReflectionHelper` constants

4. **Coroutine Patterns** (common)
   ```csharp
   private IEnumerator WaitForSeconds(float delay) {
       yield return new WaitForSeconds(delay);
       // action
   }
   ```
   **Recommendation:** Create reusable delay utilities

---

## 5. Deprecated Unity API Usage

### Status: ✅ Mostly Modern

| API | Count | Status |
|-----|-------|--------|
| FindFirstObjectByType | 247 | ✅ Modern |
| FindObjectsByType | 54 | ✅ Modern |
| FindObjectsOfType | 3 | ⚠️ Legacy (minor) |
| FindObjectOfType | 0 | ✅ None |
| OnGUI (Editor) | 50 | ✅ Expected for EditorWindow |
| WWW | 0 | ✅ None |
| Application.LoadLevel | 0 | ✅ None |

### Remaining Legacy Calls
The 3 `FindObjectsOfType` calls should be migrated to `FindObjectsByType` for consistency.

---

## 6. Async/Await vs Coroutines

### Distribution

| Pattern | Count | Location |
|---------|-------|----------|
| async Task methods | 11 | Pipeline stages |
| IEnumerator methods | 40+ | Gameplay, UI, Audio |
| StartCoroutine | 35+ | Various |
| yield return | 80+ | Various |

### Analysis

**Proper async/await usage (Pipeline):**
- `TerrainGenerationPipeline.ExecuteAsync()`
- `DetailZoneStage.ExecuteAsync()`
- `VegetationDetailStage.ExecuteAsync()`
- `MacroMaskGenerationStage.ExecuteAsync()`

**Coroutines appropriate for:**
- Audio crossfades (WeatherAudioManager)
- UI animations (PlayerHUD)
- Spawn effects (EnemySpawner)
- Wave timing (BaseDefenseController)

### Issues

1. **async void usage** (anti-pattern):
   ```csharp
   BiomeManager.cs:194 // private async void InitializeWithDelay()
   TerrainPipelineWindow.cs:207 // private async void RunPipelineAsync()
   ```
   **Recommendation:** Convert to `async Task` with proper error handling

2. **Missing cancellation tokens** in some async methods

---

## 7. Singleton Analysis

### Identified Singletons (17 total)

| Singleton | Type | Health | Notes |
|-----------|------|--------|-------|
| **ServiceLocator** | Thread-safe | ✅ Good | ConcurrentDictionary, proper locking |
| **GameManager** | Standard | ✅ Good | Proper DontDestroyOnLoad |
| **VegetationProjectSettings** | Settings | ✅ OK | ScriptableObject-backed |
| **FeatureGraphManager** | Non-MonoBehaviour | ⚠️ Review | No thread safety |
| **ConstraintManager** | Non-MonoBehaviour | ⚠️ Review | No thread safety |
| **IncrementalGenerationManager** | Non-MonoBehaviour | ⚠️ Review | No thread safety |
| **WorldGenConfigRegistry** | Settings | ✅ OK | Read-heavy |
| **BossLeaderboard** | Gameplay | ⚠️ Review | Consider per-scene |
| **BossNotificationSystem** | Gameplay | ⚠️ Review | Consider per-scene |
| **BossRespawnTracker** | Gameplay | ⚠️ Review | Consider per-scene |
| **BossRotationManager** | Gameplay | ⚠️ Review | Consider per-scene |
| **GameObjectPool** | Utility | ✅ Good | Expected singleton |
| **LLMRPromptService** | AI | ✅ OK | Service pattern |
| **MuseAgentDebugger** | Debug | ✅ OK | Editor only |
| **SentisInferenceService** | AI | ✅ OK | Service pattern |
| **SentisTelemetryRecorder** | Telemetry | ✅ OK | Service pattern |
| **NetworkManager.Singleton** | Unity Netcode | ✅ Framework | External |

### Singleton Health Issues

1. **Non-thread-safe singletons** in world generation:
   - FeatureGraphManager, ConstraintManager could race during parallel tile generation
   - Recommendation: Add locking or redesign for thread safety

2. **Boss-related singletons** should consider:
   - Scene lifecycle
   - Multiplayer state sync

---

## 8. Additional Metrics

| Metric | Count | Notes |
|--------|-------|-------|
| MonoBehaviour classes | 188 | Reasonable |
| ScriptableObject classes | 148 | Good data-driven design |
| Interface definitions | 28 | More interfaces = better testability |
| [SerializeField] usages | 1,332 | Inspector-configurable |
| Debug.Log* calls | 3,468 | ⚠️ Consider log levels for release |
| GetComponent<T> calls | 338 | Cache where possible |
| Update() methods | 105 | Monitor for performance |
| Destroy() calls | 183 | Ensure proper cleanup |
| [Obsolete] attributes | 1 | ✅ Low deprecation debt |
| Preprocessor directives | 907 | Platform/Unity version handling |
| Manager/Controller/Service/System classes | 120+ | Service-oriented architecture |

---

## 📋 Tech Debt Backlog

### 🔴 Priority 1 - Critical (Do Soon)

| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| TD-001 | Split BatchTerrainGenerator.cs (5512 LOC) | High | Maintainability |
| TD-002 | Split LakeSystem.cs (5048 LOC) | High | Maintainability |
| TD-003 | Fix async void methods | Low | Reliability |
| TD-004 | Thread-safety for FeatureGraphManager | Medium | Stability |
| TD-005 | Consolidate EdgeContractManager duplicates | Medium | Clarity |

### 🟠 Priority 2 - High (This Sprint)

| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| TD-006 | Week 4-5 TODO milestones in PlayerData | Medium | Feature completion |
| TD-007 | Split RiverSystem.cs (4047 LOC) | High | Maintainability |
| TD-008 | Create NetworkHelper for singleton access | Low | Code quality |
| TD-009 | Implement PrometheusMetrics actual tracking | Medium | Observability |
| TD-010 | Fix FactionAbilitySystem TODOs (7 items) | Medium | Feature completion |

### 🟡 Priority 3 - Medium (This Month)

| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| TD-011 | Split ValidationStage.cs | Medium | Testability |
| TD-012 | Add cancellation tokens to async methods | Medium | Reliability |
| TD-013 | Consolidate Testing namespaces | Low | Organization |
| TD-014 | Migrate 3 FindObjectsOfType calls | Low | Consistency |
| TD-015 | Create ReflectionHelper utilities | Low | DRY |

### 🟢 Priority 4 - Low (Backlog)

| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| TD-016 | Review Debug.Log statements for release | Medium | Performance |
| TD-017 | Cache GetComponent results in hot paths | Medium | Performance |
| TD-018 | Document all public APIs | High | Onboarding |
| TD-019 | Add more interfaces for testability | Medium | Quality |
| TD-020 | Review Boss* singletons lifecycle | Low | Architecture |

---

## 🏆 Architecture Strengths

1. **Well-organized namespaces** - 119 namespaces following domain boundaries
2. **Service Locator pattern** - Thread-safe, reduces FindObject calls
3. **Modern Unity APIs** - Using FindFirstObjectByType consistently
4. **Pipeline architecture** - World generation uses proper async stages
5. **Data-driven design** - 148 ScriptableObjects for configuration
6. **Interface segregation** - 28 interfaces for abstraction
7. **Proper singleton implementation** - ServiceLocator and GameManager are well-done

---

## 📈 Recommendations

### Immediate Actions
1. Create JIRA/GitHub issues for TD-001 through TD-005
2. Schedule refactoring sprint for large files
3. Add `#if UNITY_EDITOR` guards around Debug.Log in hot paths

### Short-term (1-2 weeks)
1. Complete Week 4-5 TODO milestones
2. Create utility classes for common patterns
3. Add async error handling

### Long-term (1-2 months)
1. Consider dependency injection framework
2. Expand interface coverage for testing
3. Performance profiling pass on Update() methods

---

*Report generated by Bloom Architecture Audit*
