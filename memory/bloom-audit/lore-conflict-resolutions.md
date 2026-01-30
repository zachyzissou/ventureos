# Bloom Lore Conflict Resolutions

**Date:** 2025-01-21
**Resolved by:** Lore Conflict Resolver Subagent

---

## 1. Marshal Vargas First Name: "Alexei" vs "Adele"

### Conflict Summary
- **Game Bible & Character Profiles:** "Alexei Vargas"
- **Leaders_And_Handlers.md:** "Alexei Vargas — Marshal of the Northern Districts"
- **Wiki (multiple files):** "CHR_ADELE_VARGAS" / "Adele Vargas"

### Decision
**CANONICAL NAME: Alexei Vargas**

### Rationale
- "Alexei" appears in the primary canonical sources (Game Bible, Faction Character Profiles, Leaders & Handlers)
- The Faction Character Profiles document contains extensive narrative about "Alexei Vargas" including detailed backstory
- "Adele" appeared only in Wiki files, which are derivative documents
- Gender pronoun consistency: "he/him" used throughout canonical sources

### Files Updated
| File | Before | After |
|------|--------|-------|
| `Wiki/Lore/Characters.md` | CHR_ADELE_VARGAS (3 occurrences) | CHR_ALEXEI_VARGAS |
| `Wiki/Gameplay/Biomes_Guide.md` | Marshal Adele Vargas (CHR_ADELE_VARGAS) | Marshal Alexei Vargas (CHR_ALEXEI_VARGAS) |
| `Wiki/Lore/Character_Archetypes.md` | CHR_ADELE_VARGAS | CHR_ALEXEI_VARGAS |
| `Wiki/Lore/index.md` | Marshal Adele Vargas | Marshal Alexei Vargas |
| `Wiki/Lore/Lore_Bible.md` | CHR_ADELE_VARGAS | CHR_ALEXEI_VARGAS |
| `Wiki/Marketing/Brand_Guidelines.md` | Marshal Adele Vargas (3 occurrences) | Marshal Alexei Vargas |
| `Wiki/Marketing/Marketing_Strategy.md` | Marshal Adele Vargas (2 occurrences) | Marshal Alexei Vargas |
| `Wiki/COMPREHENSIVE_QUALITY_REPORT_2025-11-02.md` | CHR_ADELE_VARGAS (2 occurrences) | CHR_ALEXEI_VARGAS |

### Character ID Update
- **Old:** `CHR_ADELE_VARGAS`
- **New:** `CHR_ALEXEI_VARGAS`

### Note on Worktrees
Files in `Wiki/.worktrees/` (git branches) were NOT updated and will need to be synchronized when those branches are merged.

---

## 2. Cascade Trigger Time: 09:47 vs 14:37

### Conflict Summary
- **Game Bible (BLOOM_GAME_BIBLE.md):** "09:47 – Primary Pulse (EVT_IEZ_CASCADE start)"
- **Wiki Timeline (Timeline_2147_2161.md):** "2161-06-12, 14:37 Hours — Monolith Excavation Trigger"

### Decision
**CANONICAL TIME: 09:47**

### Rationale
- The Game Bible explicitly states 09:47 as the "Primary Pulse" that starts the EVT_IEZ_CASCADE event
- The 14:37 time in the Game Bible refers to the **Aurora Incident** (a separate event at The Cosmonaut), NOT the Cascade trigger
- The Game Bible is established as the canonical source of truth (it supersedes Wiki docs)

### Files Updated
| File | Before | After |
|------|--------|-------|
| `Wiki/Lore/Timeline_2147_2161.md` | "2161-06-12, 14:37 Hours — Monolith Excavation Trigger" | "2161-06-12, 09:47 Hours — Monolith Excavation Trigger" |

### Timeline Clarification
The Wiki had conflated two distinct events on June 12, 2161:
- **09:47** - Primary Pulse / Cascade Trigger (Monolith harmonic spike emanates)
- **14:37–14:41** - Aurora Incident at The Cosmonaut (spacecraft crash, helium-3 rupture, 44 crew die)

---

## 3. Faction Count: 7 vs 10

### Conflict Summary
- **Code (FactionType.cs):** 7 factions enumerated
- **Wiki/Gameplay/Factions.md:** Claims "10 Playable Factions"

### Decision
**CANONICAL COUNT: 7 factions**

### The 7 Canonical Factions
| ID | Code Name | Full Name | Code ID | Launch Phase |
|----|-----------|-----------|---------|--------------|
| 0 | Directorate | Sky Bastion Directorate | FCT_DIR | EA Launch |
| 1 | Vultures | Iron Vultures | FCT_VUL | EA Launch |
| 2 | Wardens | Truce Wardens | FCT_WAR | EA Launch |
| 3 | SeventySeven | The Seventy-Seven | FCT_F77 | EA Launch |
| 4 | PactOfAsh | Pact of Ash | FCT_ASH | Post-Launch (Month 3-6) |
| 5 | Roadborn | Roadborn Clans | FCT_NOM | Post-Launch (Month 3-6) |
| 6 | Archive | Obsidian Archive | FCT_VAR | Post-Launch (Month 3-6) |

### Rationale
- The `FactionType.cs` enum is the authoritative source (implemented in game code)
- The Game Bible also references these 7 factions
- The Wiki's "10 factions" claim was likely from an earlier design iteration that was never implemented

### Files Updated
| File | Before | After |
|------|--------|-------|
| `Wiki/Gameplay/Factions.md` | "# Bloom - 10 Playable Factions Guide" | "# Bloom - 7 Playable Factions Guide" |

---

## 4. Healing Station Values: 5 vs 25 vs 200 HP/sec

### Conflict Summary
- **Code (FactionAbilityEffects.cs):** `healingRate = 20f; // HP per second`
- **Dev Docs (FACTION_ABILITY_EFFECTS_COMPLETE.md):** "20 HP/sec"
- **Wiki (Death_And_Respawn.md):** "200 HP/second"

### Decision
**[DESIGN DECISION NEEDED]**

### Current Values Found
| Source | Value | Authority Level |
|--------|-------|-----------------|
| FactionAbilityEffects.cs (Code) | 20 HP/sec | **Implementation (Actual)** |
| FACTION_ABILITY_EFFECTS_COMPLETE.md | 20 HP/sec | Development Documentation |
| Wiki/Gameplay/Death_And_Respawn.md | 200 HP/sec | Player-Facing Documentation |

### Analysis
The code shows **20 HP/sec** is the **currently implemented value**. However:
- 200 HP/sec in the wiki is 10x higher - this could be:
  - **Intentional design target** not yet implemented, OR
  - **A typo** (extra zero)
- The discrepancy is significant enough to affect gameplay balance

### Recommendation
1. **If 20 HP/sec is the intended final value:** Update Wiki docs to match code
2. **If 200 HP/sec is the design intent:** Update code to match design docs

### Files NOT Updated (Pending Decision)
This conflict requires explicit designer input before resolution.

---

## Summary of Actions Taken

| Conflict | Resolution | Files Updated | Status |
|----------|------------|---------------|--------|
| Marshal Vargas name | Alexei (canonical) | 8 Wiki files | ✅ **RESOLVED** |
| Cascade trigger time | 09:47 (canonical) | 1 Wiki file | ✅ **RESOLVED** |
| Faction count | 7 (canonical) | 1 Wiki file | ✅ **RESOLVED** |
| Healing Station HP/sec | 20 (code) vs 200 (wiki) | None | ⏳ **DESIGN DECISION NEEDED** |

### Total Files Modified: 10

---

## Appendix: Source Authority Hierarchy

As established in BLOOM_GAME_BIBLE.md:
1. **Code** (FactionType.cs, FactionAbilityEffects.cs) — Implementation truth
2. **BLOOM_GAME_BIBLE.md** — Canonical lore source
3. **LORE_BIBLE.md** — Historical canon seed
4. **Design/Analysis docs** — Secondary reference
5. **Wiki docs** — Player-facing, derivative (must match above)

---

## Next Steps

1. ✅ All name conflicts resolved
2. ✅ Timeline corrected
3. ✅ Faction count corrected
4. ⏳ **Designer to decide** on Healing Station rate (20 vs 200 HP/sec)
5. ⚠️ Sync worktree branches when merged (wiki-updates branch has old "Adele" references)
