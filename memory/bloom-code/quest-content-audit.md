# Bloom Quest Content Audit

**Audited**: 2025-01-28  
**Status**: ZERO authored quests — critical EA blocker  
**Output**: 12 starter quest templates created

---

## Quest System Assessment

### Framework Status: ✅ COMPLETE & FUNCTIONAL

The quest system is **production-ready** with no code work needed:

| Component | File | Status |
|-----------|------|--------|
| QuestDefinition | `Scripts/.../Quests/QuestDefinition.cs` | ✅ Full schema |
| QuestInstance | `Scripts/.../Quests/QuestInstance.cs` | ✅ Runtime tracking |
| QuestGiver | `Scripts/.../Quests/QuestGiver.cs` | ✅ NPC interaction |
| QuestTracker | `Scripts/.../Quests/QuestTracker.cs` | ✅ Player state management |
| QuestUI | `Scripts/.../Quests/QuestUI.cs` | ✅ UI integration |

### Supported Quest Types
1. **Gather** — collect items/resources (auto-tracked via inventory events)
2. **Eliminate** — kill enemies (auto-tracked via EnemySpawner events)
3. **ClearPOI** — clear specific location (manual trigger via POIComponent)
4. **Craft** — craft specific items (auto-tracked via CraftingStation events)
5. **Survive** — survive duration (time-based, Update loop)
6. **Custom** — fallback for complex logic

### Quest Frequency Options
- **OneTime** — story progression, one completion per character
- **Daily** — resets daily, engagement loop
- **Weekly** — resets weekly, major challenges
- **Repeatable** — infinite completion, farming

---

## Content Gap Analysis

### What Exists
- ✅ Quest framework code (fully functional)
- ✅ 4 EA launch factions defined (Directorate, Vultures, Wardens, SeventySeven)
- ✅ 11 resource materials (MetalScrap, Cloth, Components, etc.)
- ✅ 5 enemy types (Grunt, Rusher, Stalker, Brute, Marksman)
- ✅ 15 audio log scripts with rich narrative context
- ✅ POI system (POIDefinition, POIComponent)

### What's Missing
- ❌ **ZERO QuestDefinition assets** (no Data/FirstPlayable/Quests folder)
- ❌ Quest giver NPCs (no prefabs)
- ❌ Quest icons
- ❌ Faction-specific loot rewards
- ❌ Blueprint unlock rewards

---

## Starter Quest Templates Created

### Location
`C:\Users\Zachg\Documents\VaultZap\🔧 Projects\Bloom\Quest Templates\`

### Summary

| Faction | Quest Count | Types | Audio Log NPCs Leveraged |
|---------|-------------|-------|--------------------------|
| Directorate | 3 | Gather, Eliminate, ClearPOI | Commander Liu |
| Vultures | 3 | Gather, Eliminate, Gather | Rin Okafor |
| Wardens | 3 | Gather, Eliminate, Gather | Lupe Santos (→ Medic Mercy) |
| SeventySeven | 3 | Eliminate, Survive, ClearPOI | Jax Korder |

**Total: 12 quest templates** (36 if counting daily variants)

### Quest Progression Per Faction
1. **Intro Quest** (Rep Tier 0) — simple gather/eliminate, establishes faction voice
2. **Mid-Tier Quest** (Rep Tier 1, Daily) — repeatable engagement loop
3. **Faction-Specific Quest** (Rep Tier 2+, OneTime) — narrative payoff, blueprint unlock

---

## Priority Recommendations

### Phase 1: Minimum Viable Quests (Week 1)

**Author these 4 quests first** — one intro per faction:

| Quest | Effort | Why First |
|-------|--------|-----------|
| DIR-01: Field Supply Audit | 30 min | All assets exist (MetalScrap, Cloth) |
| VUL-01: Salvage Assessment | 30 min | All assets exist, establishes faction |
| WAR-01: Medical Supply Cache | 30 min | All assets exist (Cloth, Filter, Alcohol) |
| F77-01: Proof of Competence | 30 min | Enemy prefabs exist |

**Total Phase 1: ~2 hours** for 4 playable quests

### Phase 2: Daily Engagement Loop (Week 2)

Add daily quests for replay value:

| Quest | Effort | Dependencies |
|-------|--------|--------------|
| DIR-02: Hostile Neutralization | 45 min | Ammo loot asset |
| VUL-02: Contested Salvage | 45 min | Salvage crate loot |
| WAR-02: Perimeter Defense | 45 min | Medical kit loot |
| F77-02: Escort Protocol | 60 min | Survive mechanic testing |

**Total Phase 2: ~3.5 hours** for 4 daily quests

### Phase 3: Narrative Payoff (Week 3-4)

Add faction-specific quests with audio log NPCs:

| Quest | Effort | Key Dependencies |
|-------|--------|------------------|
| DIR-03: Protocol Epsilon | 90 min | POI, Commander Liu NPC, blueprint |
| VUL-03: Rin's Acquisition | 120 min | Pre-Collapse Tech loot, Rin NPC |
| WAR-03: Mercy's Last Wish | 150 min | 5 keepsake locations, Lupe NPC |
| F77-03: Korder Compact | 120 min | POI, Jax Korder NPC |

**Total Phase 3: ~8 hours** for 4 narrative quests

---

## Asset Dependencies Summary

### Must Create

| Asset Type | Count | Examples |
|------------|-------|----------|
| Quest icons | 12 | Clipboard, crosshairs, medical cross, etc. |
| NPC prefabs | 8+ | Quartermaster, Salvage Broker, Lupe Santos... |
| LootDefinitions | 5+ | Medical Kit, Salvage Crate, Pre-Collapse Tech... |
| Crafting recipes | 4 | dir_armor, vul_salvage_kit, war_medkit, f77_toolkit |
| POIs | 2-3 | Protocol Epsilon site, Korder Compact target |

### Already Exist
- All 11 resource materials
- All 5 enemy types
- POI system infrastructure
- Quest framework code

---

## Effort Estimates

| Phase | Quests | Hours | Blocker? |
|-------|--------|-------|----------|
| **Phase 1** | 4 intro | 2h | **DO FIRST** |
| **Phase 2** | 4 daily | 3.5h | Engagement loop |
| **Phase 3** | 4 narrative | 8h | Emotional payoff |
| **Total** | 12 quests | **13.5h** | — |

### Parallel Work Opportunities
- **Art**: Quest icons (can be placeholder until final)
- **Audio**: NPC voice lines (can delay until Phase 3)
- **Design**: POI layouts (can reuse existing locations)

---

## Technical Notes

### Creating a Quest (Step-by-Step)
1. Unity menu: `Create > Bloom > FirstPlayable > Quest Definition`
2. Fill ScriptableObject fields per template
3. Save to `Assets/Content/Data/FirstPlayable/Quests/`
4. Add QuestGiver component to NPC prefab
5. Assign quest to `availableQuests` list
6. Place NPC in world

### Testing Quests
- QuestTracker auto-subscribes to inventory/combat events
- Progress updates automatically for Gather/Eliminate/Craft
- ClearPOI requires manual `OnPOICleared()` call from POIComponent
- Survive runs in Update loop (test performance with multiple survive quests)

### Edge Cases to Watch
- `enemyTypeId` must match EnemyAIController type name or prefab name
- `resource` references must point to existing ResourceMaterial assets
- `requiredReputationTier` check requires IPlayerFactionService implementation

---

## Narrative Integration Opportunities

The audio log scripts provide **named characters** ready for NPC conversion:

| Character | Faction | Audio Log | Quest Potential |
|-----------|---------|-----------|-----------------|
| Commander Liu | Directorate | DIR-07A | Protocol Epsilon giver |
| Marshal Vargas | Directorate | DIR-02A | Combat/ethics quests |
| Rin Okafor | Vultures | VUL-01A | High-tier salvage quests |
| Lupe Santos | Wardens | WAR-01A | Mercy's Last Wish giver |
| Jax Korder | SeventySeven | F77-01A | Korder Compact giver |
| Coordinator Ledger | SeventySeven | F77-03A | Faction conflict quests |

**Recommendation**: Prioritize creating NPC prefabs for audio log characters. Players who find audio logs will recognize quest givers = powerful narrative connection.

---

## Validation

- [x] Output file exists: `quest-content-audit.md`
- [x] Quest templates exist: 4 faction files in VaultZap
- [x] Completeness: All 12 quests documented with full schemas
- [x] Accuracy: Schema matches QuestDefinition.cs exactly
- [x] Self-check: PASS

---

**VALIDATION:**
- Output file: `C:\Users\Zachg\clawd\memory\bloom-code\quest-content-audit.md` ✓ exists
- Completeness: complete
- Self-check: PASS
- Confidence: high
