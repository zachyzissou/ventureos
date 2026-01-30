# Duplicate Classes in Bloom

## Summary
- **45 duplicate class/struct/interface/enum names found** (not 12 as originally stated)
- **93 total files/definitions affected**
- Severity ranges from simple file-local duplicates to cross-module naming conflicts

## High Priority Duplicates (4 occurrences)

### ResourceReward (4 occurrences)
- `Gameplay\FirstPlayable\BaseDefense\BaseDefenseController.cs` : Line 70
- `Gameplay\FirstPlayable\Boss\BossDefinition.cs` : Line 86
- `Gameplay\FirstPlayable\Boss\BossEncounterController.cs` : Line 27 (as LootReward) / Line 34
- `Gameplay\FirstPlayable\Quests\QuestDefinition.cs` : Line 112
- **Recommendation:** Create a shared `Bloom.Gameplay.Rewards.ResourceReward` class and reference from all locations

### ValidationResult (4 occurrences)
- `WorldGeneration\Configuration\WorldConfig.cs` : Line 861
- `WorldGeneration\Validation\CollisionContinuityValidator.cs` : Line 52
- `WorldGeneration\Validation\EdgeContractValidator.cs` : Line 34
- `WorldGeneration\Validation\NavMeshContinuityValidator.cs` : Line 56
- **Recommendation:** Create `Bloom.WorldGeneration.Validation.ValidationResult` as shared type

## Medium Priority Duplicates (3 occurrences)

### BenchmarkResult (3 occurrences)
- `Editor\Terra\TerraPerformanceProfiler.cs` : Line 289
- `Testing\Performance\TerraPerformanceTests.cs` : Line 542
- `Testing\Performance\VegetationPerformanceTests.cs` : Line 162
- **Recommendation:** Create shared `Bloom.Testing.BenchmarkResult` struct

### LootReward (3 occurrences)
- `Gameplay\FirstPlayable\Boss\BossDefinition.cs` : Line 79
- `Gameplay\FirstPlayable\Boss\BossEncounterController.cs` : Line 27
- `Gameplay\FirstPlayable\Quests\QuestDefinition.cs` : Line 105
- **Recommendation:** Consolidate into shared `Bloom.Gameplay.Rewards.LootReward`

### LootEntry (3 occurrences)
- `Gameplay\FirstPlayable\Encounters\EncounterDefinition.cs` : Line 30
- `Gameplay\FirstPlayable\Persistence\SaveData.cs` : Line 37
- `Networking\PlayerPersistenceData.cs` : Line 23
- **Recommendation:** Create `Bloom.Gameplay.Loot.LootEntry` for shared use

### TileRecord (3 occurrences)
- `Ecology\VegetationDebugSnapshot.cs` : Line 21
- `WorldGeneration\Edge\EdgeConstraintGraph.cs` : Line 806
- `WorldGeneration\Services\TerrainEdgeDatabase.cs` : Line 30
- **Recommendation:** Different contexts - may need prefixing: `VegetationTileRecord`, `EdgeTileRecord`, etc.

### EdgeContractManager (3 occurrences)
- `WorldGeneration\EdgeContractManager.cs` : Line 13
- `WorldGeneration\Edge\EdgeContractManager.cs` : Line 13
- `WorldGeneration\Services\EdgeContractManager.cs` : Line 13
- **Recommendation:** CRITICAL - likely the same class in wrong locations. Keep `WorldGeneration\Edge\EdgeContractManager.cs`, delete others

### CoastalType (3 occurrences)
- `Terrain\Pipeline\Configs\CoastalTransitionConfig.cs` : Line 14
- `WorldGeneration\CoastalType.cs` : Line 7
- `WorldGeneration\Coastal\CoastalType.cs` : Line 7
- **Recommendation:** Keep `WorldGeneration\Coastal\CoastalType.cs`, remove duplicates

## Standard Priority Duplicates (2 occurrences)

### FactionType (2 occurrences)
- `Narrative\FactionType.cs` : Line 30
- `Terrain\BiomeTerrainPreset.cs` : Line 118
- **Recommendation:** Keep `Narrative\FactionType.cs` (canonical), rename terrain version

### QuestState (2 occurrences)
- `Gameplay\FirstPlayable\Quests\QuestInstance.cs` : Line 11
- `Narrative\Quests\QuestState.cs` : Line 6
- **Recommendation:** Keep `Narrative\Quests\QuestState.cs`, import into FirstPlayable

### IUINotificationService (2 occurrences)
- `Narrative\IUINotificationService.cs` : Line 7
- `UI\IUINotificationService.cs` : Line 19
- **Recommendation:** Keep `UI\IUINotificationService.cs`, delete Narrative version

### UINotificationType (2 occurrences)
- `Narrative\IUINotificationService.cs` : Line 32
- `UI\UINotificationType.cs` : Line 19
- **Recommendation:** Keep `UI\UINotificationType.cs`, delete inline definition in Narrative

### PlacementValidationResult (2 occurrences)
- `WorldGeneration\Validation\ResourceNodeCoordinator.cs` : Line 57
- `WorldGeneration\Validation\SpawnPointCoordinator.cs` : Line 52
- **Recommendation:** Create shared `PlacementValidationResult` in Validation namespace

### ResourceEntry (2 occurrences)
- `Gameplay\FirstPlayable\Persistence\SaveData.cs` : Line 11
- `Networking\PlayerPersistenceData.cs` : Line 16
- **Recommendation:** Create shared `Bloom.Persistence.ResourceEntry`

### BuildingEntry (2 occurrences)
- `Gameplay\FirstPlayable\Persistence\SaveData.cs` : Line 18
- `Networking\WorldSaveData.cs` : Line 15
- **Recommendation:** Create shared `Bloom.Persistence.BuildingEntry`

### QuestDefinition (2 occurrences)
- `Gameplay\FirstPlayable\Quests\QuestDefinition.cs` : Line 39
- `Narrative\Quests\QuestDefinition.cs` : Line 16
- **Recommendation:** CRITICAL - Keep `Narrative\Quests\QuestDefinition.cs`, refactor FirstPlayable to use it

### EdgeValidationResult (2 occurrences)
- `WorldGeneration\Validation\CollisionContinuityValidator.cs` : Line 25
- `WorldGeneration\Validation\NavMeshContinuityValidator.cs` : Line 29
- **Recommendation:** Create shared struct in Validation namespace

### GenerateBaseHeightmapJob (2 occurrences)
- `Terrain\Jobs\GenerateBaseHeightmapJob.cs` : Line 14
- `WorldGeneration\Jobs\BaseHeightmapGenerationJob.cs` : Line 14
- **Recommendation:** Keep WorldGeneration version, delete Terrain duplicate

### GenerateSplatmapJob (2 occurrences)
- `WorldGeneration\Jobs\SplatmapGenerationJob.cs` : Line 14
- `WorldGeneration\Jobs\TerraRasterizationJobs.cs` : Line 340
- **Recommendation:** Keep SplatmapGenerationJob.cs, remove inline definition

### TileHydrologySummary (2 occurrences)
- `WorldGeneration\Pipeline\StageDataContracts.cs` : Line 307
- `WorldGeneration\Pipeline\Stages\WaterSystemInitStage.cs` : Line 292
- **Recommendation:** Keep StageDataContracts.cs version (central contracts)

### VegetationCoverageReport (2 occurrences)
- `WorldGeneration\Pipeline\StageDataContracts.cs` : Line 235
- `WorldGeneration\Pipeline\Stages\ValidationStage.cs` : Line 2226
- **Recommendation:** Keep StageDataContracts.cs version

### ArtEngineJobSummary (2 occurrences)
- `WorldGeneration\Materials\ArtEnginePipelineUtility.cs` : Line 174
- `WorldGeneration\Pipeline\StageDataContracts.cs` : Line 224
- **Recommendation:** Keep StageDataContracts.cs version

### ThermalErosionStage (2 occurrences)
- `WorldGeneration\Erosion\ThermalErosionStage.cs` : Line 18
- `WorldGeneration\Pipeline\Stages\ThermalErosionStage.cs` : Line 14
- **Recommendation:** CRITICAL - class file in two places. Keep Pipeline version

### ClimateIntegrationStage (2 occurrences)
- `WorldGeneration\Climate\ClimateIntegrationStage.cs` : Line 16
- `WorldGeneration\Pipeline\Stages\ClimateIntegrationStage.cs` : Line 17
- **Recommendation:** CRITICAL - class file in two places. Keep Pipeline version

### HydraulicErosionStage (2 occurrences)
- `WorldGeneration\Erosion\HydraulicErosionStage.cs` : Line 17
- `WorldGeneration\Pipeline\Stages\HydraulicErosionStage.cs` : Line 14
- **Recommendation:** CRITICAL - class file in two places. Keep Pipeline version

### ObjectiveType (2 occurrences)
- `Gameplay\FirstPlayable\Mission\MissionObjective.cs` : Line 9
- `Narrative\Quests\QuestObjective.cs` : Line 9
- **Recommendation:** Different contexts - rename to `MissionObjectiveType` and `QuestObjectiveType`

### PerformanceMetrics (2 occurrences)
- `Editor\WorldGeneration\BaselineArchiver.cs` : Line 1254
- `WorldGeneration\AdaptiveDetail\AdaptiveDetailSystem.cs` : Line 325
- **Recommendation:** Create shared `Bloom.Performance.PerformanceMetrics`

### ComparisonDeltas (2 occurrences)
- `Editor\Performance\RuntimeTelemetryInspector.cs` : Line 140
- `Performance\RuntimeStreamingTelemetry.cs` : Line 396
- **Recommendation:** Create shared in Performance namespace

### ValidationSummary (2 occurrences)
- `Editor\WorldGeneration\ProgressiveValidationCI.cs` : Line 185
- `Performance\RuntimeStreamingTelemetry.cs` : Line 322
- **Recommendation:** Different contexts - prefix appropriately

### MacroMaskSection (2 occurrences)
- `Editor\WorldGeneration\ProgressiveValidationCI.cs` : Line 203
- `Performance\RuntimeStreamingTelemetry.cs` : Line 336
- **Recommendation:** Create shared type in WorldGeneration namespace

### TilesSection (2 occurrences)
- `Editor\WorldGeneration\ProgressiveValidationCI.cs` : Line 197
- `Performance\RuntimeStreamingTelemetry.cs` : Line 330
- **Recommendation:** Create shared type in WorldGeneration namespace

### SpeciesCoverage (2 occurrences)
- `Ecology\VegetationCoverageSnapshot.cs` : Line 34
- `WorldGeneration\Pipeline\Stages\VegetationDetailStage.cs` : Line 42
- **Recommendation:** Keep Ecology version, import into WorldGeneration

### SpeciesEntry (2 occurrences)
- `Ecology\BiomeSpeciesMix.cs` : Line 43
- `WorldGeneration\Vegetation\VegetationSpawnBufferAsset.cs` : Line 22
- **Recommendation:** Keep Ecology version, import into WorldGeneration

### StreamingTelemetrySummary (2 occurrences)
- `Editor\Performance\RuntimeTelemetryInspector.cs` : Line 109
- `Performance\RuntimeStreamingTelemetry.cs` : Line 404
- **Recommendation:** Keep Performance version (runtime), Editor should reference it

### BaselineMetrics (2 occurrences)
- `Editor\Performance\RuntimeTelemetryInspector.cs` : Line 131
- `Performance\RuntimeStreamingTelemetry.cs` : Line 386
- **Recommendation:** Keep Performance version

### RuntimeMetrics (2 occurrences)
- `Editor\Performance\RuntimeTelemetryInspector.cs` : Line 118
- `Performance\RuntimeStreamingTelemetry.cs` : Line 349
- **Recommendation:** Keep Performance version

### EdgeSolverSummary (2 occurrences)
- `Editor\WorldGeneration\Validation\ValidationManifestGate.cs` : Line 191
- `WorldGeneration\Pipeline\Stages\ValidationStage.cs` : Line 1637
- **Recommendation:** Keep ValidationStage version

### ValidationThresholds (2 occurrences)
- `Editor\WorldGeneration\Validation\ValidationManifestGate.cs` : Line 181
- `WorldGeneration\Pipeline\Stages\ValidationStage.cs` : Line 1594
- **Recommendation:** Keep ValidationStage version

### FirstPlayableBootstrap (2 occurrences)
- `Gameplay\FirstPlayable\FirstPlayableBootstrap.cs` : Line 11
- `Scenes\FirstPlayableBootstrap.cs` : Line 18
- **Recommendation:** CRITICAL - same bootstrap class in two places. Keep Gameplay version

### POIDefinition (2 occurrences)
- `Gameplay\FirstPlayable\Encounters\POIDefinition.cs` : Line 9
- `WorldGeneration\POI\POIDefinition.cs` : Line 11
- **Recommendation:** Keep WorldGeneration version as canonical for generation, FirstPlayable should reference it

### Baker (2 occurrences)
- `DOTS\PlayerStreamingTagAuthoring.cs` : Line 10
- `DOTS\WorldStreamingSettingsAuthoring.cs` : Line 16
- **Recommendation:** These are nested DOTS Baker classes - standard pattern, likely OK as-is (internal to each authoring)

### SeamResidualRecord (2 occurrences)
- `Editor\WorldGeneration\Validation\CoastalSeamAnalyzer.cs` : Line 158
- `WorldGeneration\Pipeline\Stages\EdgeSolverStage.cs` : Line 331
- **Recommendation:** Create shared struct

### HydrologySection (2 occurrences)
- `Editor\WorldGeneration\ProgressiveValidationCI.cs` : Line 209
- `Performance\RuntimeStreamingTelemetry.cs` : Line 342
- **Recommendation:** Create shared struct

### ValidationManifest (2 occurrences)
- `Editor\WorldGeneration\Validation\ValidationManifestGate.cs` : Line 140
- `WorldGeneration\Pipeline\Stages\ValidationStage.cs` : Line 1573
- **Recommendation:** Keep ValidationStage version

### SeamQualityManifest (2 occurrences)
- `Editor\WorldGeneration\Validation\ValidationManifestGate.cs` : Line 168
- `WorldGeneration\Pipeline\Stages\ValidationStage.cs` : Line 1604
- **Recommendation:** Keep ValidationStage version

### BaselineComparisonSummary (2 occurrences)
- `Editor\WorldGeneration\Validation\ValidationManifestGate.cs` : Line 158
- `WorldGeneration\Pipeline\Stages\ValidationStage.cs` : Line 1468
- **Recommendation:** Keep ValidationStage version

---

## Critical Issues Summary

The following require immediate attention as they appear to be identical classes in multiple locations:

1. **EdgeContractManager** - 3 copies of same class
2. **ThermalErosionStage** - 2 copies of same pipeline stage
3. **ClimateIntegrationStage** - 2 copies of same pipeline stage
4. **HydraulicErosionStage** - 2 copies of same pipeline stage
5. **FirstPlayableBootstrap** - 2 copies of bootstrap class
6. **QuestDefinition** - 2 competing definitions

## Root Cause Analysis

Many duplicates appear to stem from:
1. **File-local struct definitions** - Validation results, metrics structs defined inline
2. **Module isolation** - FirstPlayable vs Narrative having parallel hierarchies
3. **Migration artifacts** - Old locations not cleaned up (Erosion/ vs Pipeline/Stages/)
4. **Editor/Runtime split** - Editor code duplicating runtime structs

## Recommended Fix Strategy

1. **Phase 1:** Fix critical duplicates (identical classes in multiple files)
2. **Phase 2:** Create shared types for cross-module usage (ResourceReward, LootReward, etc.)
3. **Phase 3:** Clean up file-local duplicates by moving to shared locations
4. **Phase 4:** Add namespace uniqueness validation to CI

---

*Generated: 2025-01-21*
*Issue: GitHub #1067*
