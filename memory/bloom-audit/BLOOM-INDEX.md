# Bloom Codebase Index

**Generated:** 2026-01-28
**Project:** C:\Users\Zachg\Development\Games\Bloom

## Quick Stats
- **766 C# files** | **174,259 lines**
- **47 large files** (>500 LOC)
- **4 mega files** (>2000 LOC) - DO NOT LOAD WHOLE

## ⚠️ Do Not Load Whole (>2000 LOC)
| File | Lines | Notes |
|------|-------|-------|
| `Editor/BatchTerrainGenerator.cs` | 4,882 | Editor tool, refactor candidate |
| `Environment/Water/LakeSystem.cs` | 4,394 | Core water system |
| `Editor/TerraTestingSuite.cs` | 3,756 | Test harness |
| `Environment/Water/RiverSystem.cs` | 3,413 | Core water system |
| `WorldGeneration/Pipeline/Stages/ValidationStage.cs` | 2,324 | Pipeline stage |

## 🟠 Caution (1000-2000 LOC)
| File | Lines |
|------|-------|
| `Editor/WorldGeneration/Hydrology/HydrologyMetadataBuilderEditor.cs` | 1,753 |
| `Terrain/Pipeline/Configs/WaterFeatureConfig.cs` | 1,698 |
| `Terrain/MacroFeatures/MacroWorldGenerator.cs` | 1,474 |
| `WorldGeneration/Pipeline/Stages/DetailZoneStage.cs` | 1,411 |
| `Terrain/RuntimeTerrainLoader.cs` | 1,326 |

## Top Folders by File Count
| Folder | Files | Notes |
|--------|-------|-------|
| Editor | 59 | Editor tools, safe to skip for runtime analysis |
| WorldGeneration | 45 | Core terrain generation |
| Networking | 42 | Multiplayer, Steamworks |
| UI | 38 | User interface |
| Stages | 25 | Pipeline stages |
| Integration | 18 | Tests |
| Pipeline | 17 | Generation pipeline |
| Features | 17 | World features |
| Vegetation | 15 | Foliage system |
| Terrain | 14 | Runtime terrain |

## Known Issues (from audit)
1. **Enum conflicts:** FactionType (3 defs), EdgeDirection (2 defs)
2. **ServiceLocator gaps:** 70+ FindObjectOfType usages
3. **Coverage gaps:** ProceduralIntelligence, Audio, Narrative, Environment (0 tests)
4. **Tech debt:** 54 TODOs, 17 singletons, 2 async void

## Search Tooling
```powershell
# Use bloom-search.ps1 for context-efficient searches
.\memory\bloom-audit\bloom-search.ps1 search "FactionType"
.\memory\bloom-audit\bloom-search.ps1 anti find
.\memory\bloom-audit\bloom-search.ps1 folder Networking
```

## Agent Instructions
When auditing Bloom:
1. **Consult this index first** - know what's large before loading
2. **Use bloom-search.ps1** - grep before read
3. **Use offset/limit** - never load >500 lines at once
4. **Write incrementally** - don't hold findings in context
