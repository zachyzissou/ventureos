# Bloom Wiki Structure Audit Report

**Generated:** 2025-01-13
**Scope:** C:\Users\Zachg\Development\Games\Bloom\Wiki (excluding .worktrees, excluding Archive)
**Auditor:** Subagent (wiki-structure)

---

## Executive Summary

| Category | Count | Severity |
|----------|-------|----------|
| **Missing Pages (Broken Links)** | 9 critical | 🔴 CRITICAL |
| **External/Cross-Repo Links** | 100+ | 🟡 HIGH |
| **Index Incompleteness** | 4 indexes | 🟡 HIGH |
| **TBD/TODO Markers** | 50+ instances | 🟠 MEDIUM |
| **Placeholder Content** | 15+ files | 🟠 MEDIUM |
| **Legacy/Deprecated References** | 45+ files | 🟢 LOW (documented) |

**Overall Status:** Wiki is **functionally usable** but has **structural debt** that should be addressed before public release.

---

## 🔴 CRITICAL: Missing Pages (Broken Links)

Links in `Factions/index.md` point to pages that do **not exist**:

| Missing File | Referenced In | Link Text |
|--------------|---------------|-----------|
| `Factions/Aegis_Collective.md` | Factions/index.md | "Aegis Collective Faction Style Guide" |
| `Factions/Helix_Syndicate.md` | Factions/index.md | "Helix Syndicate Faction Style Guide" |
| `Factions/Roadborn.md` | Factions/index.md | "Roadborn Faction Style Guide" |
| `Factions/North_Guard.md` | Factions/index.md | "North Guard Faction Style Guide" |
| `Factions/Apex_Dynamics.md` | Factions/index.md | "Apex Dynamics Faction Style Guide" |

**Note:** These are listed as "Post-EA Launch Factions" so the missing pages may be intentional (planned content). However, the index links directly to them without marking them as "Coming Soon".

### Recommended Fix (CRITICAL)

**Option A (Preferred):** Create stub pages for each missing faction:
```markdown
# [Faction Name] (Coming Soon)

This faction is planned for post-Early Access release.

**Planned Release:** Month 3-6 / Month 6-9
**Role:** [Role from index]

---

*Documentation will be added when this faction enters development.*
```

**Option B:** Update `Factions/index.md` to mark these as "Coming Soon" without clickable links:
```markdown
**Post-EA Launch Factions (Month 3-6)**:
- ⏳ Helix Syndicate - FCT_HLX - Tech/Engineer (Coming Soon)
- ⏳ Roadborn - FCT_NOM - Scout/Mobility (Coming Soon)
- ⏳ Obsidian Archive - FCT_VAR - Stealth/Intel (Coming Soon)
```

---

## 🟡 HIGH: External/Cross-Repo Broken Links

Multiple files contain links to paths **outside the Wiki** that won't resolve:

### Files with External Links (Sample)

| File | Broken Link | Type |
|------|-------------|------|
| Documentation_Index.md | `../DOCUMENTATION_INDEX.md` | Parent repo |
| Documentation_Index.md | `../README.md` | Parent repo |
| Documentation_Index.md | `../Context.md` | Parent repo |
| Documentation_Index.md | `../.claude/CLAUDE.md` | Parent repo |
| Gameplay/index.md | `../../BLOOM_COMPREHENSIVE_STRATEGIC_ANALYSIS_2025` | Parent repo |
| Gameplay/index.md | `../../WORLD_GENERATION_MASTER_PLAN` | Parent repo |
| LINK_AUDIT_*.md | Multiple `../Docs/...` paths | Audit reports documenting old issues |

### Analysis

- **~100+ external links** point to files in the parent repository (`../Docs/`, `../.claude/`, etc.)
- Most are in **audit report files** (LINK_AUDIT_*, LINK_FIX_*) which document historical issues
- Some are in **active documentation** (Documentation_Index.md, Gameplay/index.md)

### Recommended Fix

1. **Audit Report Files:** Add disclaimer header:
   ```markdown
   > ⚠️ **Historical Audit Report:** This document references external repository paths
   > that may not resolve from the Wiki. See the main repository for full context.
   ```

2. **Active Documentation:** Replace external links with Wiki-relative links or notes:
   - `../Context.md` → Link to repo or remove
   - `../.claude/CLAUDE.md` → Link to repo root with instructions

3. **Consider:** Moving core strategic docs INTO the Wiki, or creating Wiki summaries that link OUT to repo.

---

## 🟡 HIGH: Index File Incompleteness

### Development/index.md

**Missing from index (files exist but not listed):**
- `Asset_Pipeline.md`
- `Build_Process.md`
- `CI_CD_Pipeline.md`
- `Debugging.md` (only Debugging_Guide is listed)
- `Git_Workflow.md`
- `Performance_Profiling.md` (listed but as "Advanced Guides")
- `Testing_Framework.md`
- `Unity_Editor_Tools.md`

**Recommendation:** Add comprehensive listing or consolidate duplicates (Debugging vs Debugging_Guide, Performance vs Performance_Profiling)

### Gameplay/index.md

**Missing from index (files exist but not listed):**
- `AI_Director_System.md`
- `Combat.md`
- `Controls_And_Keybinds.md`
- `Death_And_Respawn.md`
- `Electronic_Warfare.md`
- `Health_And_Medical.md`
- `Intelligence.md`
- `Inventory_System.md`
- `Movement_And_Stamina.md`
- `Navigation_And_Waypoints.md`
- `Progression.md` (different from Progression_Systems)
- `Squad_Mechanics.md`
- `Stealth_Tactics.md`
- `Weather_Survival_Guide.md`
- `World_Events.md`

**Recommendation:** Add these to the "Essential Reading" table or create a "Complete Reference" section.

### Technical/index.md

**Missing from index:**
- `Terrain_Generation_Architecture.md`

**Files listed but may not exist or are misnamed:**
- References to `Gameplay_Analysis` and `Player_Experience` in legacy section (these don't exist)

### Lore/index.md

**Good coverage** - Most files are linked. Minor missing items:
- `Harvester_Tech.md` (possibly duplicate of `Harvester_Technology.md`)

---

## 🟠 MEDIUM: TBD/TODO Markers

### Files with Production-Blocking TBD Markers

| File | Line | Content |
|------|------|---------|
| Dashboard.md | 52 | `Map Generation \| ⏳ Deferred \| TBD` |
| Dashboard.md | 55 | `Micro Features \| ⏳ Not Started \| TBD` |
| Dashboard.md | 140 | `Micro Features \| TBD \| Not started` |
| Development/Steamworks_Integration.md | Multiple | `// TODO Week 2: Validate Steam authentication` |
| Development/Steamworks_Integration.md | 706 | `Bloom Development Discord: (Link TBD)` |
| Development/Steamworks_Integration.md | 765 | `Contact: [Discord/Email TBD]` |
| Gameplay/New_Player_Guide.md | 611 | `Discord: Official Bloom Discord (link TBD for EA launch)` |
| Gameplay/Biomes_Guide.md | 799 | `Gameplay/loot/enemy content is still TBD` |
| Art/Audio_Music_System.md | 2158 | `Add remaining 3 factions (Pact of Ash, Apex Dynamics, +1 TBD)` |
| Development/Architecture.md | 634-635 | `Rendering (HDRP) \| TBD`, `Gameplay/AI \| TBD` |
| Development/Build_System.md | 396 | `macOS \| ⏳ Planned \| TBD` |

### Acceptable TBD Usage (No Action Needed)

- Asset pipeline placeholder tracking (`Art/Asset_Pipeline.md`)
- EA launch strategy mentions ("placeholder models OK")
- Dashboard targets column (should rename column from "Current" to "Status")

### Recommended Fixes

1. **Discord/Contact TBD:** Replace with "Coming at EA Launch" or actual links if available
2. **Code TODOs:** Add "(Example)" notation or implement
3. **Performance TBD:** Replace with "Phase 4 Validation" or specific date

---

## 🟠 MEDIUM: Potential Duplicate/Overlapping Content

| File A | File B | Issue |
|--------|--------|-------|
| `Development/Debugging.md` | `Development/Debugging_Guide.md` | Two debugging docs |
| `Development/Performance.md` | `Development/Performance_Profiling.md` | Two performance docs |
| `Development/Testing.md` | `Development/Testing_Framework.md` | Two testing docs |
| `Development/Build_System.md` | `Development/Build_Process.md` | Two build docs |
| `Development/Asset_Pipeline.md` | `Art/Asset_Pipeline.md` | Same topic, different folders |
| `Lore/Harvester_Tech.md` | `Lore/Harvester_Technology.md` | Likely duplicate |
| `Gameplay/Progression.md` | `Gameplay/Progression_Systems.md` | Two progression docs |

### Recommendation

Review each pair and either:
1. **Merge** into single authoritative document
2. **Differentiate** with clear scope (e.g., "Quick Reference" vs "Deep Dive")
3. **Redirect** one to the other

---

## 🟢 LOW: Legacy/Deprecated References (Documented)

The wiki correctly handles legacy "Terminal Grounds" content:
- ✅ `Archive/` folder contains deprecated content
- ✅ Multiple files include disclaimer headers (e.g., `Lore/Naming_Guide.md` line 3)
- ✅ `Gameplay/index.md` has "Legacy/Reference" section with warnings
- ✅ `Technical/index.md` has "Terminal Grounds Archive" section

**No action needed** - Legacy handling is appropriate.

---

## 📊 File Statistics

### By Folder (Excluding Archive, worktrees)

| Folder | File Count |
|--------|------------|
| Root | 22 |
| Art/ | 9 |
| Assets/ | 8 |
| Community/ | 5 |
| Development/ | 18 |
| Factions/ | 11 |
| Gameplay/ | 34 |
| Guides/ | 2 |
| Lore/ | 19 (+ 11 in subfolders) |
| Maps/ | 11 |
| Marketing/ | 9 |
| Operations/ | 6 |
| Systems/ | 6 |
| Technical/ | 18 |

**Total Active Wiki Files:** ~189 markdown files (excluding Archive, worktrees, and audit reports)

---

## 🎯 Priority Action Items

### Immediate (Before EA)

1. **Create stub pages for 5 missing factions** or update index to mark as "Coming Soon"
2. **Add disclaimers to audit report files** (LINK_AUDIT_*, etc.)
3. **Update Development/index.md** to list all files in folder

### Short-Term (Week 11-12)

4. **Replace TBD markers** with specific dates/statuses
5. **Update Gameplay/index.md** to list all 34 gameplay docs
6. **Consolidate or differentiate** duplicate documents

### Long-Term (Post-EA)

7. **Resolve external link strategy** (move docs into Wiki or create summaries)
8. **Full orphan page audit** (identify files truly not linked anywhere)
9. **Automated link validation** in CI/CD

---

## Appendix: Files Audited

<details>
<summary>Click to expand full file list (189 files)</summary>

### Root Level (22 files)
- ANTI_PATTERN_DETECTION_REPORT_2025-11-02.md
- COMPREHENSIVE_CONTENT_QUALITY_AUDIT_2025-11-02.md
- COMPREHENSIVE_QUALITY_REPORT_2025-11-02.md
- CONTRIBUTING.md
- Dashboard.md
- Documentation_Index.md
- ENHANCEMENT_SUMMARY.md
- Home.md
- LINK_AUDIT_COMPREHENSIVE_2025-11-02.md
- LINK_AUDIT_EXECUTIVE_SUMMARY.md
- LINK_AUDIT_FINAL_REPORT_2025-11-02.md
- LINK_AUDIT_REPORT.md
- LINK_FIX_QUICK_REFERENCE.md
- LINK_FIX_REPORT_2025-11-01.md
- LINK_FIX_REPORT_FINAL_2025-11-01.md
- LINK_FIX_SUMMARY_2025-11-02.md
- LINK_SCAN_REPORT_2025-11-01.md
- LINK_VERIFICATION_FINAL_2025-11-01.md
- README.md
- WIKI_LINK_FIX_COMPLETE_2025-11-01.md
- WIKI_NAVIGATION_VERIFICATION_REPORT.md
- _Sidebar.md

### Art/ (9 files)
- Art_Bible.md
- Asset_Manifest.md
- Asset_Pipeline.md
- Audio_Music_System.md
- Audio_Vision.md
- Faction_Visual_Language.md
- index.md
- Production_Status.md
- UI_Style_Guide.md

### Assets/ (8 files)
- AI_Generation.md
- Audio.md
- Faction_Assets.md
- HDRP_Guidelines.md
- index.md
- Map_Design.md
- Pipeline.md
- Style_Guide.md

### Community/ (5 files)
- Code_of_Conduct.md
- Contributing.md
- Features.md
- index.md
- Roadmap.md

### Development/ (18 files)
- Architecture.md
- Asset_Pipeline.md
- Build_Process.md
- Build_System.md
- CI_CD_Pipeline.md
- Debugging.md
- Debugging_Guide.md
- Getting_Started.md
- Git_Workflow.md
- index.md
- MCP_Guide.md
- Multiplayer_Architecture.md
- Performance.md
- Performance_Profiling.md
- Steamworks_Integration.md
- Testing.md
- Testing_Framework.md
- Unity_Editor_Tools.md

### Factions/ (11 files)
- Civic_Wardens.md
- Conflict_Matrix.md
- Corporate_Hegemony.md
- Directorate.md
- Free77.md
- index.md
- Iron_Vultures.md
- Leaders_And_Handlers.md
- Nomad_Clans.md
- Obsidian_Archive.md
- Pact_of_Ash.md

### Gameplay/ (34 files)
- AI_Director_System.md
- Biomes_Guide.md
- Combat.md
- Controls_And_Keybinds.md
- Convoy_Economy.md
- Crafting_And_Upgrades.md
- Death_And_Respawn.md
- Electronic_Warfare.md
- Extraction.md
- Factions.md
- Forged_Enemy_Types.md
- Game_Design_Document.md
- Health_And_Medical.md
- index.md
- Intelligence.md
- Inventory_System.md
- Loot_System.md
- Maps.md
- Missions.md
- Movement_And_Stamina.md
- Navigation_And_Waypoints.md
- New_Player_Guide.md
- Overview.md
- Progression.md
- Progression_Systems.md
- Season1_Arc.md
- Splice_Events.md
- Squad_Mechanics.md
- Stealth_Tactics.md
- Territory_Control.md
- Trust_System.md
- Weapons_And_Loadouts.md
- Weather_Survival_Guide.md
- World_Events.md

### Lore/ (19 + 11 subfiles)
- Audio_Log_Guide.md
- Characters.md
- Character_Archetypes.md
- Environmental_Storytelling.md
- Events.md
- Factions_Flavor.md
- Faction_Relationships.md
- Harvester_Tech.md
- Harvester_Technology.md
- IEZ_Phenomenon.md
- index.md
- Lore_Backbone.md
- Lore_Bible.md
- Lore_Delivery_Systems.md
- Naming_Guide.md
- POIs_Flavor.md
- Technology.md
- Timeline.md
- Timeline_2147_2161.md
- Characters/ (6 files)
- Events/ (2 files)
- Technology/ (4 files)

### Maps/ (11 files)
- Black_Vault.md
- Crimson_Docks.md
- DeadSky.md
- DeadSky_Art.md
- DeadSky_Implementation.md
- IEZ.md
- index.md
- Metro_A.md
- Sky_Bastion.md
- Tech_Wastes.md
- World_Scale.md

### Marketing/ (9 files)
- Brand.md
- Brand_Guidelines.md
- Faction_Marketing_Profiles.md
- index.md
- Key_Art.md
- Marketing_Strategy.md
- Steam_Store.md
- Storefront.md
- Trailer.md

### Operations/ (6 files)
- Demo_Setup.md
- index.md
- Production_Runbook.md
- Quick_Start.md
- Testing.md
- Testing_Steps.md

### Systems/ (6 files)
- Black_Auction.md
- index.md
- Memory_Economy.md
- Phase_Pockets.md
- Quietus_Marks.md
- Truce_Gates.md

### Technical/ (18 files)
- Audit_Gameplay_Tags.md
- Audit_Inventory.md
- Automation.md
- Build_FAQ.md
- Build_System.md
- Faction_Abilities_Implementation.md
- index.md
- Networking_Checklist.md
- Performance.md
- Phase_A_Report.md
- Phase_B_Report.md
- Phase_C_Report.md
- Security.md
- ServiceLocator_Best_Practices.md
- Terrain_Generation_Architecture.md
- Tile_Streaming.md
- Tile_Streaming_Operations.md
- Visibility_System.md

### Guides/ (2 files)
- Biome_Configuration_Pipeline.md
- Edge_Stitching_Usage_Guide.md

</details>

---

*Report generated by wiki-structure audit subagent. For questions, consult the main Bloom development team.*
