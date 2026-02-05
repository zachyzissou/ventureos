# Bloom Full Audit Summary

**Date:** 2026-01-28
**Auditors:** OpenClaw + 5 sub-agents
**Project:** C:\Users\Zachg\Development\Games\Bloom

---

## 📊 Codebase Overview
| Metric | Value |
|--------|-------|
| Total C# Files | 766 |
| Total Lines | 174,259 |
| Avg Lines/File | 227 |
| Large Files (>500 LOC) | 47 |
| Mega Files (>2000 LOC) | 5 |
| Namespaces | 119 |
| MonoBehaviours | 188 |
| ScriptableObjects | 148 |

---

## ✅ Test Health (GOOD)
- **449 tests** across 73 files
- **96.4% enabled** (only 8 disabled, all intentional)
- **17 inconclusive** (environment-dependent, working as designed)

### Coverage Gaps (Need Tests)
| System | Files | Priority |
|--------|-------|----------|
| ProceduralIntelligence | 24 | P1 - HIGH |
| Audio | 3 | P2 |
| Narrative | 9 | P2 |
| Environment | 24 | P2 |

---

## 🔍 ServiceLocator Migration (VALIDATED with ripgrep)
**Total:** 241 instances across 117 files
- **Editor/Testing:** 67 (acceptable)
- **Runtime:** 154 (need migration)

### Top Offenders (Runtime)
| Count | File | Fix |
|-------|------|-----|
| 7 | `QuestTracker.cs` | IQuestService |
| 7 | `TileGenerationContext.cs` | May be intentional |
| 6 | `HudRuntimeSpawner.cs` | IUIService |
| 5 | `MultiplayerSaveLoadManagerSetup.cs` | Constructor injection |
| 4 | `PlayerSpawner.cs` | IPlayerProvider |
| 4 | `LakeSystem.cs` | ITerrain/IPlayer |
| 4 | `BuildingController.cs` | IPlayerProvider |

### By Folder
| Folder | Count | Priority |
|--------|-------|----------|
| Gameplay | 100 | 🔴 HIGH |
| Networking | 20 | 🟠 MEDIUM |
| WorldGeneration | 18 | 🟡 LOW |
| Environment | 8 | 🟡 LOW |

**Estimated Effort:** 40-60 hours (revised up)
**New Services Needed:** IPlayerProvider, IQuestService, IUIService, ITerrainRegistry

---

## ⚔️ Type Conflicts (VALIDATED with ripgrep)
| Conflict | Severity | Count | Resolution |
|----------|----------|-------|------------|
| FactionType | 🔴 Critical | 3 | `Bloom.Narrative.FactionType` canonical |
| EdgeDirection | 🟠 High | **5** | Multiple private + 2 public duplicates |
| UINotificationType | 🟡 Medium | 2 | Keep `Bloom.UI` version |

### EdgeDirection Locations (5 definitions)
1. `WorldGeneration/Services/IEdgeContractManager.cs:8` — public, canonical
2. `WorldGeneration/Edge/TileEdgeContract.cs:7` — duplicate public
3. `WorldGeneration/Validation/NavMeshContinuityValidator.cs:83` — private (ok)
4. `Editor/EdgeValidationTool.cs:188` — private editor (ok)
5. `Editor/TerrainValidationSuite.cs:567` — private editor (ok)

---

## 🏗️ Architecture & Tech Debt
| Category | Count | Action |
|----------|-------|--------|
| TODO comments | 54 | Review and prioritize |
| HACK/XXX | 5 | Low concern |
| Large files | 47 | Refactor top 10 |
| Singletons | 17 | Review thread-safety |
| async void | 2 | Fix immediately |

### Critical Refactor Candidates
1. `BatchTerrainGenerator.cs` - 4,882 lines
2. `LakeSystem.cs` - 4,394 lines
3. `TerraTestingSuite.cs` - 3,756 lines
4. `RiverSystem.cs` - 3,413 lines
5. `ValidationStage.cs` - 2,324 lines

---

## 📋 Prioritized Action Plan

### P0 - Immediate (This Sprint)
- [ ] Fix 2 `async void` methods (anti-pattern, can cause silent failures)
- [ ] Consolidate FactionType to single definition
- [ ] Fix 3 critical FindObjectOfType usages

### P1 - High (Next 2 Sprints)
- [ ] Add smoke tests for ProceduralIntelligence
- [ ] Migrate 7 high-priority ServiceLocator usages
- [ ] Remove EdgeDirection duplicate
- [ ] Re-enable ThermalErosionStageTests with better test data

### P2 - Medium (Backlog)
- [ ] Split mega-files (target: <1000 LOC each)
- [ ] Add basic tests for Audio, Narrative, Environment
- [ ] Review singleton thread-safety
- [ ] Clean up 54 TODOs

### P3 - Low (Tech Debt Paydown)
- [ ] Consolidate UINotificationType
- [ ] Review using-alias workarounds
- [ ] Document remaining ServiceLocator migrations

---

## 🔧 Tooling Created
| File | Purpose |
|------|---------|
| `bloom-stats.json` | Cached metrics for quick reference |
| `bloom-search.ps1` | Context-efficient search commands |
| `BLOOM-INDEX.md` | Agent reference for file sizes/risks |

---

## Detailed Reports
- `test-health.md` - Full test analysis
- `servicelocator-migration.md` - All FindObjectOfType usages
- `enum-conflicts.md` - Type conflict details
- `architecture-review.md` - Full tech debt inventory
- `milestone-validation.md` - (pending)
