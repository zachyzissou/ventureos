# Bloom: Audit vs Official Roadmap Comparison

**Generated:** 2026-01-28
**Sources:** 6 deep-dive audits + ROADMAP.md + Git history

---

## Executive Summary

| Area | Official Roadmap Says | Audit Found | Gap |
|------|----------------------|-------------|-----|
| **Milestone** | M3: EA Launch Q1 2026 | Systems built, content missing | 🔴 Content is 15% ready |
| **Networking** | "Server-authoritative implemented" | True, but EnemyHealth not networked | ⚠️ P0 bug |
| **Content** | 4 factions, 3 biomes | 5/120 quests, 0 playable scenes | 🔴 Critical gap |
| **Performance** | "60 FPS validated M2" | 70+ tests disabled, 53 FPS projected | 🔴 Unvalidated |
| **Systems** | Territory/Quietus/Seasons planned | 0 code for any of them | ⚠️ Design-only |
| **Tests** | "All multiplayer tests pass" | 22 active tests, 85% disabled | 🔴 CI broken |

---

## What Roadmap Claims vs Reality

### ✅ Roadmap Accurate

| Claim | Evidence |
|-------|----------|
| Server-authoritative networking | `NetworkedDamageSystem` has proper hit validation, lag compensation |
| Tile streaming works | 2.9ms avg load time, validated by telemetry |
| HDRP optimization done | 473% min FPS improvement documented |
| Faction system exists | 7 factions defined, reputation tiers working |
| Quest framework ready | QuestManager, QuestDefinition, 6 quest types |
| Steam integration | Heathen's Toolkit + Steamworks.NET implemented |

### ⚠️ Roadmap Partially Accurate

| Claim | Reality |
|-------|---------|
| "60 FPS on RTX 2060" | Only proven in empty scene (451 FPS meaningless) |
| "All Netcode PlayMode tests pass" | Tests exist but 22 active out of 90+ |
| "Extraction loop v1" | System exists, but no playable level to run it |
| "3 EA biomes playable" | World gen works, no content in biomes |

### 🔴 Roadmap Contradicted by Audit

| Claim | Reality |
|-------|---------|
| "Content: 4 factions shipped" | Only Directorate has content (5 quests) |
| "POIs: FeatureRegions applied" | 9 POIs exist, ~200 needed |
| "UI: minimal HUD" | HUD exists but references "Terminal Grounds" |
| "All EA content spawns in world" | 0 playable scenes exist |

---

## Priority Matrix: What to Fix First

### 🔴 P0: Blockers (Cannot Ship Without)

| Issue | Source | Fix Effort | Impact |
|-------|--------|------------|--------|
| **No playable scene** | Content audit | 2-3 days | Nothing to play |
| **EnemyHealth not NetworkBehaviour** | Network audit | 1 day | Enemies desync in co-op |
| **5 duplicate EdgeDirection enums** | Arch audit | 1 day | Subtle bugs |
| **70+ disabled tests** | Perf audit | 2-3 days | No CI safety net |

### ⚠️ P1: Critical for EA Quality

| Issue | Source | Fix Effort | Impact |
|-------|--------|------------|--------|
| **115 missing quests** | Content audit | 2-4 weeks | Nothing to do |
| **1 enemy type** | Content audit | 1-2 weeks | No variety |
| **No gameplay FPS baseline** | Perf audit | 1-2 days | Unknown real perf |
| **HDRP 69% frame budget** | Perf audit | 1 week | May miss 60 FPS |
| **227 broken wiki links** | Docs audit | 4 hours | Dev friction |

### 📋 P2: Should Fix for EA

| Issue | Source | Fix Effort | Impact |
|-------|--------|------------|--------|
| Territory system (0 code) | Systems audit | 2-3 weeks | Missing feature |
| Quietus/Memory Economy (0 code) | Systems audit | 2-3 weeks | Missing differentiator |
| Audio logs (0 recorded) | Content audit | External | No atmosphere |
| 12 duplicate class names | Arch audit | 1 day | Confusion |
| 3,544 Debug.Log calls | Arch audit | 2 hours | Perf in release |

### 📝 P3: Post-EA / Nice to Have

| Issue | Source | Fix Effort | Impact |
|-------|--------|------------|--------|
| Seasonal campaigns (0 code) | Systems audit | Ongoing | Live ops |
| Vegetation pipeline missing | Perf audit | 5-7 days | Polish |
| Addressables not connected | Perf audit | 2-3 days | Load times |

---

## Roadmap vs Audit: System-by-System

### Networking (Audit: DEEP-NETWORKING-ANALYSIS.md)

**Roadmap:** "Server-authoritative gameplay implemented"
**Audit:** Mostly true, but critical gaps:

| Component | Status | Issue |
|-----------|--------|-------|
| PlayerInventory | ✅ Networked | Works with NetworkLists |
| TileStateSyncSystem | ✅ Solid | Good design with 4 NetworkLists |
| PlayerHealth | ⚠️ Fragile | Works via delegation, not direct |
| **EnemyHealth** | 🔴 Broken | MonoBehaviour, not NetworkBehaviour |
| EnemySpawner | ⚠️ Fragile | Works but lifecycle issues |
| CompanionStatusNetworkSync | ⚠️ Wasteful | Polls every frame |

**Verdict:** Fix EnemyHealth immediately. Rest is acceptable for EA.

### Content (Audit: DEEP-CONTENT-INVENTORY.md)

**Roadmap:** "4 factions, 3 biomes, POIs applied"
**Audit:** 

| Content Type | Have | Need | % Ready |
|--------------|------|------|---------|
| Quests | 5 | 120 | 4% |
| Audio Logs | 16 scripts | 80 | 20% (0 recorded) |
| POIs | 9 | 50+ | 18% |
| Enemies | 1 prefab | 15+ | 7% |
| Weapons | 1 | 20+ | 5% |
| Playable Scenes | **0** | 1+ | **0%** |

**Verdict:** This is the critical path. Systems are built but empty.

### Performance (Audit: DEEP-PERFORMANCE-ANALYSIS.md)

**Roadmap:** "60+ FPS sustained with 10 players (M2 validated)"
**Audit:**

| Metric | Claimed | Actual |
|--------|---------|--------|
| Test coverage | "All pass" | 22 active / 90+ total |
| Disabled tests | Not mentioned | 70+ files (.disabled) |
| FPS baseline | 60 FPS | Only in empty scene |
| HDRP frame cost | "Optimized" | 69% of budget (12-15ms) |
| Week 4 projection | 60 FPS | 53 FPS |

**Verdict:** Performance is unvalidated for real gameplay. Need stress test scene.

### Systems (Audit: DEEP-SYSTEMS-ANALYSIS.md)

**Roadmap mentions as future:** Territory, Quietus, Seasonal
**Audit confirms:** Zero code for all three

| System | Design Docs | Code | Gap |
|--------|-------------|------|-----|
| Quest | ✅ 85KB framework | ✅ Complete | Content only |
| Faction | ✅ Defined | ✅ Complete | Content only |
| Inventory | ✅ Defined | ✅ Complete | - |
| Extraction | ✅ Defined | ✅ Complete | - |
| Combat | ✅ Defined | ⚠️ Partial | VFX, armor |
| AI | ✅ Defined | ⚠️ Partial | Behavior trees |
| **Territory** | ✅ 400+ lines | ❌ None | Major feature |
| **Quietus** | ✅ Unique mechanic | ❌ None | Differentiator |
| **Seasonal** | ✅ 4-season design | ❌ None | Live ops |

**Verdict:** Core loop systems are solid. Signature features don't exist.

### Documentation (Audit: DEEP-DOCUMENTATION-ANALYSIS.md)

**Roadmap:** Wiki and design docs maintained
**Audit:**

| Area | Quality | Issue |
|------|---------|-------|
| Narrative design docs | A+ (50KB+ each) | 0% implemented |
| Wiki structure | B+ | 227 broken links |
| Code READMEs | F | 1/24 directories |
| Branding | D | Still says "Terminal Grounds" |

**Verdict:** Documentation is excellent but not reflected in code.

---

## Git History Analysis

**Recent focus (last 30 commits):**
- TERRA-* terrain work (majority)
- Issue fixes (#645-#807 range)
- Dependency injection refactoring
- Pipeline and CI improvements

**Issue count:** 922+ (based on PR numbers)

**Active branches:** 75+ feature/fix branches

**Pattern:** Heavy infrastructure investment, light content work.

---

## Recommended EA Roadmap (Revised)

### Week 1-2: Critical Fixes
- [ ] Fix EnemyHealth → NetworkBehaviour (1 day)
- [ ] Fix 5 EdgeDirection enum duplicates (1 day)
- [ ] Re-enable 70+ disabled tests (2-3 days)
- [ ] Create gameplay stress test scene (2 days)
- [ ] Run real FPS baseline (1 day)

### Week 3-4: Playable Build
- [ ] Create first playable scene with:
  - Spawn point
  - 3-5 enemy spawners
  - Extraction zone
  - Basic loot
- [ ] Import 32 existing quest JSONs
- [ ] Wire up 16 audio log placeholders
- [ ] Fix Terminal Grounds → Bloom branding

### Week 5-8: Content Sprint
- [ ] 50 more quests (realistic for EA)
- [ ] 5+ enemy types
- [ ] 20+ POIs per biome
- [ ] Basic NPC vendors

### Week 9-10: Polish & QA
- [ ] Full playtest cycle
- [ ] Fix P1 issues from testing
- [ ] Performance optimization pass
- [ ] Steam page finalization

### Post-EA Backlog
- Territory system implementation
- Quietus/Memory Economy implementation
- Seasonal campaigns
- Remaining 70 quests
- Voice recording for audio logs

---

## Key Insight

**The project is architecturally sound but content-empty.**

The roadmap accurately describes systems that exist in code. What it doesn't acknowledge:
1. Those systems have no content to run
2. Performance claims are from unrealistic test conditions
3. "Unique features" (Territory, Quietus) are design docs only

**EA is achievable** with a focused content sprint, but timeline may need adjustment unless content creation accelerates dramatically.

---

*Generated from 6 parallel deep-dive audits cross-referenced with official ROADMAP.md*
