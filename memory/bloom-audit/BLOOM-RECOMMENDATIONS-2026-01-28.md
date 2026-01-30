# Bloom Audit Recommendations - January 28, 2026

**Generated from**: Performance Evidence Audit + Asset Faction Audit  
**Status**: Ready for review/implementation

---

## Executive Summary

Two audits completed today identified **critical gaps in performance validation** while confirming **assets are clean**. The 60 FPS target for EA launch is theoretically achievable but **remains unproven** in actual gameplay.

| Area | Status | Risk Level |
|------|--------|------------|
| Tile Streaming | ✅ Proven (2.9ms avg) | Low |
| HDRP Optimization | ✅ Proven (473% min FPS improvement) | Low |
| Gameplay FPS Baseline | 🔴 Not tested | **High** |
| Generation Performance | 🔴 Tests disabled | **High** |
| Memory Stability | ⚠️ Short tests only | Medium |
| Asset Faction Names | ✅ Clean | Low |
| Code Faction Enums | ⚠️ Mismatch found | Low |

---

## 🔴 Critical: Performance Test Gap

### Problem
**13 performance tests are disabled** with `.disabled` extension:
- `DetailZonePerformanceTests.cs.disabled` (10 tests)
- `GenerationPerformanceTests.cs.disabled` (3 tests)  
- `PerformanceTestHarness.cs.disabled` (support framework)

**Why disabled:**
- Missing dependencies: `TerrainTileGenerator`, `EdgeStitcher`, `TheReachDetailZone`
- `BiomeManager` not found in test scene

### Impact
- **Tile generation <150ms target**: UNVALIDATED
- **Detail zone <80ms target**: UNVALIDATED
- **0% test coverage** on generation performance

### Fix (Priority 1)
1. Re-enable `PerformanceTestHarness.cs` first (no dependencies)
2. Fix or mock missing classes for generation tests
3. Run full generation benchmark suite

---

## 🔴 Critical: No Gameplay FPS Baseline

### Problem
Current FPS data (451.8 avg) was captured in an **empty scene** with only PerfHarness running. This is meaningless for predicting real gameplay performance.

### What's Missing
- [ ] Full gameplay scene test (10 players + 100 enemies + loot)
- [ ] AI pathfinding cost (100 enemies)
- [ ] Loot pooling validation (GC spikes)
- [ ] Network bandwidth under load
- [ ] Extended play memory profiling (30+ minutes)

### Fix (Priority 1)
Create a **Gameplay Stress Test Scene** with:
- 10 networked players (or bots simulating movement)
- 100 AI enemies with pathfinding active
- 100+ loot items spawned
- Run for 5+ minutes, capture:
  - Average FPS (target: ≥55)
  - Min FPS (target: ≥50)
  - Memory delta (target: stable, no growth)
  - GC pause frequency

---

## ⚠️ Medium: Incomplete Documentation

### Templates Not Filled
| Document | Completion | Missing |
|----------|------------|---------|
| `M2_PERFORMANCE_BASELINE_RESULTS.md` | 60% | HDRP settings, CPU profiler data |
| `DetailZonePerformanceReport.md` | Template only | All actual measurements |

### Fix (Priority 2)
Run the existing menu item tests and fill in actual data:
- `Bloom/Terra/Performance Tests/Test Burst Feature Generators`
- `Bloom/Terra/Performance Tests/Test GPU vs CPU Heightmap`
- `TERRA-211: Benchmark Tile Generation`

---

## ⚠️ Low: Faction Enum Mismatch

### Finding
Two different `FactionType` enums exist with different faction lists:

**Bloom.Narrative.FactionType** (7 factions):
```csharp
None, Directorate, Vultures, Wardens, SeventySeven, PactOfAsh, Roadborn, Archive
```

**Bloom.WorldGeneration.FactionType** (10 factions):
```csharp
SkyBastion, IronVultures, AegisCollective, SeventySeven, HelixSyndicate, 
Wayfarers, ObsidianArchive, NorthGuard, PactOfAsh, ApexDynamics
```

### Issue
- `ApexDynamics` exists in WorldGeneration enum (deprecated name?)
- Different naming conventions (Directorate vs SkyBastion, Vultures vs IronVultures)
- May cause confusion or bugs when systems interact

### Fix (Priority 3)
- Audit if `ApexDynamics` should be removed or renamed
- Consider consolidating to single canonical FactionType enum
- Document which enum is authoritative

---

## ✅ Validated: What's Working

### Tile Streaming Performance
- **Average load time**: 2.9ms (target: <3ms) ✅
- **Max observed**: 6.27ms (target: <7ms) ✅
- **Crossfade coverage**: 100% ✅
- **Data source**: 63 telemetry sessions over 14 days

### HDRP Optimization
- **Min FPS improved**: 4.9 → 28.1 (+473%) ✅
- **Changes applied**: Volumetric fog -36%, slice count -50%, fog budget -24%
- Eliminates initialization spikes

### Asset Faction Names
- **235 .asset files scanned**: 0 deprecated names found ✅
- All faction references use valid numeric enum values

---

## Recommended Action Plan

### Week 1 (Immediate)
| Task | Owner | Estimate |
|------|-------|----------|
| Re-enable `PerformanceTestHarness.cs` | Dev | 5 min |
| Create Gameplay Stress Test Scene | Dev | 2-4 hours |
| Run initial FPS baseline | Dev | 30 min |
| Document results in M2 report | Dev | 30 min |

### Week 2-3 (Short-term)
| Task | Owner | Estimate |
|------|-------|----------|
| Fix generation test dependencies | Dev | 2-4 hours |
| Run full generation benchmark | Dev | 1 hour |
| Extended play memory profiling | Dev | 2 hours |
| Network bandwidth testing | Dev | 2 hours |

### Week 4+ (Pre-EA Validation)
| Task | Owner | Estimate |
|------|-------|----------|
| Fill DetailZonePerformanceReport | Dev | 1 hour |
| Consolidate faction enums (if needed) | Dev | 2-4 hours |
| Final build performance comparison | Dev | 2 hours |
| Sign-off on 60 FPS target | Lead | - |

---

## Pre-Launch Checklist

```
Performance Validation
[ ] Full gameplay scene: ≥55 FPS average
[ ] Min FPS: ≥50 FPS (no spikes below)
[ ] Tile generation: <150ms per tile
[ ] Memory stability: No leaks over 30min
[ ] Network: <50 KB/sec client bandwidth
[ ] AI pathfinding: <10ms per frame (100 enemies)
[ ] Loot pooling: Zero GC on spawn
[ ] Build performance: Within 10% of Editor

Documentation
[ ] M2_PERFORMANCE_BASELINE_RESULTS.md complete
[ ] DetailZonePerformanceReport.md filled
[ ] All disabled tests re-enabled or removed

Code Quality
[ ] Faction enum mismatch resolved
[ ] No deprecated names in code or assets
```

---

## Source Reports

Full details available in:
- `memory/bloom-audit/performance-evidence-audit.md`
- `memory/bloom-audit/asset-faction-audit.md`

---

*Document generated by Echo based on sub-agent audit findings.*
