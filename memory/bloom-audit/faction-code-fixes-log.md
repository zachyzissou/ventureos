# Faction Code Fixes Log

**Date:** 2025-01-13  
**Task:** Fix faction code inconsistencies in Bloom documentation

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| `FCT_CWD` occurrences | 92 | **0** |
| `7 factions` occurrences | Many | **0** |
| `seven factions` occurrences | Many | **0** |
| `FCT_WAR` occurrences | — | 102 |
| `8 factions` occurrences | — | 388 |

---

## Issue 1: Warden Faction Code (FCT_CWD → FCT_WAR)

**Total files fixed:** 49  
**Total replacements:** 92

### Files Modified (Docs/)

| File | Replacements |
|------|-------------|
| Docs\Bloom_Naming_and_Style_Guide.md | 1 |
| Docs\ROSTERS.md | 2 |
| Docs\Analysis\FACTION_TERRITORY_ANALYSIS.md | 13 |
| Docs\Analysis\LORE_CONSISTENCY_AUDIT_COMPREHENSIVE.md | 1 |
| Docs\Archive\LegacyLore\LORE_BIBLE.md | 2 |
| Docs\Archive\LegacyLore\Naming_Refresh_2025_08.md | 6 |
| Docs\Design\FACTION_AUDIO_LOGS_FRAMEWORK.md | 6 |
| Docs\Design\Faction_Conflict_Matrix.md | 1 |
| Docs\Design\Faction_Leaders_And_Handlers.md | 1 |
| Docs\Design\NPC_HANDLER_BRIEFINGS.md | 1 |
| Docs\Design\PLAYER_EXPERIENCE_COHERENCE_REVIEW.md | 1 |
| Docs\Design\SURVIVAL_CRAFT_UX_DESIGN.md | 3 |
| Docs\Design\World_Scale_And_Expansion.md | 1 |
| Docs\Lore\BLOOM_GAME_BIBLE.md | 3 |
| Docs\Lore\LoreBook\characters\CHR_CWD_Gate_Captain_Alaia.md | 1 |
| Docs\Narrative\ENVIRONMENTAL_STORYTELLING_BIBLE.md | 1 |
| Docs\Narrative\AudioLogScripts\WAR-04A_TollKeeperAnchor.md | 1 |
| Docs\Narrative\AudioLogScripts\WAR-06A_MedicHope.md | 1 |
| Docs\Plans\2025-11-02-bloom-audio-design.md | 1 |

### Files Modified (Wiki/)

| File | Replacements |
|------|-------------|
| Wiki\COMPREHENSIVE_CONTENT_QUALITY_AUDIT_2025-11-02.md | 2 |
| Wiki\COMPREHENSIVE_QUALITY_REPORT_2025-11-02.md | 3 |
| Wiki\.worktrees\wiki-updates\Factions\Conflict_Matrix.md | 1 |
| Wiki\.worktrees\wiki-updates\Factions\Leaders_And_Handlers.md | 1 |
| Wiki\.worktrees\wiki-updates\Lore\Lore_Bible.md | 2 |
| Wiki\.worktrees\wiki-updates\Lore\Naming_Guide.md | 6 |
| Wiki\.worktrees\wiki-updates\Lore\Characters\Gate_Captain_Alaia.md | 1 |
| Wiki\.worktrees\wiki-updates\Maps\World_Scale.md | 1 |
| Wiki\.worktrees\wiki-updates\Marketing\Brand.md | 1 |
| Wiki\Art\Audio_Music_System.md | 1 |
| Wiki\Factions\Conflict_Matrix.md | 1 |
| Wiki\Factions\index.md | 1 |
| Wiki\Factions\Leaders_And_Handlers.md | 1 |
| Wiki\Factions\Obsidian_Archive.md | 1 |
| Wiki\Gameplay\Biomes_Guide.md | 2 |
| Wiki\Lore\Audio_Log_Guide.md | 1 |
| Wiki\Lore\Characters.md | 1 |
| Wiki\Lore\Character_Archetypes.md | 1 |
| Wiki\Lore\Events.md | 1 |
| Wiki\Lore\Factions_Flavor.md | 2 |
| Wiki\Lore\Faction_Relationships.md | 1 |
| Wiki\Lore\index.md | 1 |
| Wiki\Lore\Lore_Bible.md | 3 |
| Wiki\Lore\Naming_Guide.md | 6 |
| Wiki\Lore\Technology.md | 1 |
| Wiki\Lore\Timeline.md | 2 |
| Wiki\Lore\Characters\Gate_Captain_Alaia.md | 1 |
| Wiki\Lore\Events\Meteor_Salvage.md | 1 |
| Wiki\Maps\World_Scale.md | 1 |
| Wiki\Marketing\Brand.md | 1 |

---

## Issue 2: Faction Count (7 → 8 factions)

**Total files fixed:** 154

Replaced all occurrences of:
- `7 factions` → `8 factions`
- `seven factions` → `8 factions`

### Notable High-Impact Files

| File | Changes |
|------|---------|
| Docs\NARRATIVE_DESIGN_RESEARCH_REPORT.md | 10 |
| Docs\Marketing\BRAND_POSITIONING_ARC_RAIDERS_QUALITY.md | 21 |
| Docs\Design\UI_UX_DESIGN_SYSTEMS_REVIEW.md | 9 |
| Docs\Lore\Writing\BLOOM_WRITING_TASKS_ROADMAP.md | 9 |
| Docs\Analysis\NARRATIVE_COMPARATIVE_ANALYSIS_MASTER.md | 9 |
| Docs\Design\PLAYER_CALLOUT_SYSTEM.md | 8 |
| Docs\GITLAB_MILESTONE_OVERHAUL.md | 8 |
| Docs\Analysis\ENVIRONMENTAL_STORYTELLING_QUALITY_ASSESSMENT.md | 8 |

---

## Canonical 8 Factions Reference

| Code | Faction Name |
|------|--------------|
| FCT_DIR | Sky Bastion Directorate |
| FCT_VUL | Iron Vultures |
| FCT_WAR | Truce Wardens |
| FCT_F77 | The Seventy-Seven |
| FCT_NOM | Roadborn |
| FCT_VAR | Obsidian Archive |
| FCT_ASH | Pact of Ash |
| FCT_HLX | Helix Syndicate |

---

## Final Verification ✅

```
Remaining FCT_CWD occurrences: 0 ✅
Remaining '7 factions' occurrences: 0 ✅
Remaining 'seven factions' occurrences: 0 ✅
Current FCT_WAR occurrences: 102
Current '8 factions' occurrences: 388
```

**All faction code inconsistencies have been resolved.**
