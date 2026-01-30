# Bloom Documentation Cross-Reference & Terminology Audit

**Generated:** 2025-01-28  
**Scope:** Docs/**/*.md, Wiki/**/*.md  
**Total Files Scanned:** ~1,200 markdown files  

---

## Executive Summary

This audit identified **significant terminology inconsistencies** across Bloom's documentation. The primary issues are:

1. **Project name migration incomplete** - 1,580+ references to "Terminal Grounds" (deprecated)
2. **Faction naming conflicts** - Multiple names for the same factions across documents
3. **Game mode confusion** - Mixed PvP/PvE references despite PvE co-op being canonical
4. **Event terminology drift** - "Splice Events" vs "IEZ Anomalies"

**Priority:** HIGH - These inconsistencies affect player communication, development clarity, and onboarding.

---

## 1. Terminology Glossary (Inconsistent Terms Found)

### 🔴 CRITICAL: Project Name

| Legacy Term | Current Canonical | Occurrences | Status |
|-------------|-------------------|-------------|--------|
| Terminal Grounds | **Bloom** | 1,580+ | ⚠️ MIGRATION NEEDED |

**Recommendation:** Search-and-replace in all active documentation. Archive legacy docs with clear "ARCHIVED" prefix.

---

### 🔴 CRITICAL: Faction Naming Conflicts

#### FCT_VUL - Salvager Faction

| Term Found | Occurrences | Files | Canonical? |
|------------|-------------|-------|------------|
| Iron Vultures | 375 | Multiple | ✅ DOMINANT |
| Iron Scavengers | 58 | Multiple | ❌ LEGACY |
| Vultures Union | 13 | LoreBook | ❌ VARIANT |

**Recommendation:** Standardize to **"Iron Vultures"** (code: FCT_VUL). Update 71 non-canonical references.

---

#### FCT_NOM - Nomad Faction

| Term Found | Occurrences | Files | Canonical? |
|------------|-------------|-------|------------|
| Roadborn | 729 | Multiple | ✅ DOMINANT |
| Roadborn Clans | ~50 | Style Guides | ✅ FULL NAME |
| Nomad Clans | 51 | Multiple | ❌ LEGACY |

**Recommendation:** Standardize to **"Roadborn"** (short) / **"Roadborn Clans"** (full). Update 51 "Nomad Clans" references.

---

#### FCT_F77 - Seventy-Seven Faction

| Term Found | Occurrences | Files | Canonical? |
|------------|-------------|-------|------------|
| Seventy-Seven | 580 | Multiple | ✅ DOMINANT |
| Free77 | 145 | Wiki, Code | ⚠️ CODE-SAFE |
| Free 77 | ~20 | Mixed | ❌ INCONSISTENT |
| The Seventy-Seven | ~100 | Lore docs | ✅ FULL NAME |

**Recommendation:** 
- **Display name:** "The Seventy-Seven" or "Seventy-Seven"
- **Code/ID:** `FCT_F77` or `Free77`
- **Avoid:** "Free 77" (inconsistent spacing)

---

#### FCT_DIR - Directorate Faction

| Term Found | Occurrences | Canonical? |
|------------|-------------|------------|
| Directorate | High | ✅ SHORT FORM |
| Sky Bastion Directorate | Medium | ✅ FULL NAME |
| The Directorate | Medium | ✅ WITH ARTICLE |

**Status:** ACCEPTABLE - All forms are valid contextually.

---

#### FCT_CWD - Wardens Faction

| Term Found | Context | Canonical? |
|------------|---------|------------|
| Civic Wardens | Lore docs | ✅ CANONICAL |
| Truce Wardens | Some style guides | ⚠️ VARIANT |

**Recommendation:** Standardize to **"Civic Wardens"** per LORE_BIBLE.md.

---

#### FCT_VAR - Archive Faction

| Term Found | Context | Canonical? |
|------------|---------|------------|
| Obsidian Archive | Wiki | ✅ CANONICAL |
| Vaulted Archivists | GDD Legacy | ❌ LEGACY |

**Recommendation:** Standardize to **"Obsidian Archive"** per current Wiki.

---

### 🟡 MEDIUM: Event/System Terminology

#### Dynamic Events

| Term | Occurrences | Context | Canonical? |
|------|-------------|---------|------------|
| IEZ Anomalies | 125 | Current Wiki/Docs | ✅ CANONICAL |
| Splice Events | 11 | Legacy GDDs | ❌ LEGACY |
| The Splice | Varies | Lore context | ⚠️ CONTEXTUAL |

**Recommendation:** 
- **Gameplay system:** "IEZ Anomalies"
- **Lore/narrative:** "The Splice" or "Splice phenomenon" acceptable
- **Update:** Replace "Splice Events" with "IEZ Anomalies" in all gameplay docs

---

#### Enemy Faction

| Term | Occurrences | Context | Canonical? |
|------|-------------|---------|------------|
| The Forged | 12 | Formal reference | ✅ CANONICAL |
| Forged enemies | 65 | Gameplay context | ⚠️ INFORMAL |
| Forged | Varies | General use | ⚠️ NEEDS ARTICLE |

**Recommendation:** 
- **With article:** "The Forged" (refers to faction/collective)
- **As adjective:** "Forged enemies," "Forged units"
- **Avoid:** Standalone "Forged" without context

---

### 🟡 MEDIUM: Game Mode Conflict

| Term | Occurrences | Status |
|------|-------------|--------|
| PvP | 99 | ❌ LEGACY (Terminal Grounds era) |
| PvE co-op | 66 | ✅ CANONICAL |

**Issue:** 99 references to PvP gameplay exist, but Bloom is canonically **"8-10 player PvE co-op extraction shooter"**.

**Recommendation:** 
1. Review all PvP references - many are in ARCHIVED docs
2. Update any active docs referencing PvP mechanics
3. Add disclaimer to legacy design docs: "Note: Terminal Grounds was PvP-focused. Bloom is PvE co-op."

---

## 2. Number Conflicts Table

### World Scale

| Metric | Value Found | Source | Canonical? |
|--------|-------------|--------|------------|
| World Size | 32km × 32km | BLOOM_GAME_BIBLE, Wiki | ✅ CANONICAL |
| World Size | 16km × 16km | Legacy docs | ❌ OUTDATED |
| Tile Count | 1024 tiles | Multiple | ✅ CANONICAL |
| IEZ Total Radius | ~200km (lore) | Lore Bible | ✅ CANONICAL (lore only) |
| Playable Area | 32km × 32km | Game Bible | ✅ CANONICAL |

**Note:** The 200km IEZ radius is lore scale; gameplay occurs in 32km × 32km area.

---

### Player Count

| Metric | Value Found | Source | Canonical? |
|--------|-------------|--------|------------|
| Player Count | 8-10 players | Wiki index, Game Bible | ✅ CANONICAL |
| Player Count | 4-8 players | Some enemy guides | ⚠️ CONTEXTUAL (squad sizes) |

**Clarification:** 8-10 is max lobby size; 4-8 appears in squad composition recommendations.

---

### Faction Count

| Metric | Value Found | Source | Status |
|--------|-------------|--------|--------|
| EA Launch Factions | 4 | Wiki Gameplay index | ✅ CANONICAL |
| Total Planned Factions | 10 | Multiple sources | ✅ CANONICAL |
| Post-Launch Factions | +6 | Wiki Roadmap | ✅ CANONICAL |

---

### Enemy Tiers

| Metric | Value | Source | Status |
|--------|-------|--------|--------|
| Forged Tier Count | 3 tiers | Forged_Enemy_Types.md | ✅ CANONICAL |
| Tier 1 HP Range | 100-250 HP | Enemy guide | ✅ CANONICAL |
| Tier 2 HP Range | 500-2500 HP | Enemy guide | ✅ CANONICAL |
| Tier 3 HP Range | 5000-10000 HP | Enemy guide | ✅ CANONICAL |

---

## 3. Date/Version References

### Outdated References Found

| Pattern | Occurrences | Action |
|---------|-------------|--------|
| "v0.1", "Alpha 3" | ~15 | Review and update |
| "2024" dates | ~50 | Update or archive |
| "Terminal Grounds" roadmap dates | Multiple | Archive with disclaimer |

**Recommendation:** Audit files with dates older than 2025-06 for relevance.

---

## 4. Acronym Consistency

| Full Form | Acceptable Codes | Avoid |
|-----------|------------------|-------|
| Interdiction Exclusion Zone | IEZ | I.E.Z., iez |
| Directorate | FCT_DIR, Directorate | Dir, DIR |
| Iron Vultures | FCT_VUL | VUL, IronVul |
| Roadborn | FCT_NOM | NOM, Nomads |
| Seventy-Seven | FCT_F77, Free77 | F77, Free 77 |
| Civic Wardens | FCT_CWD | CWD, Wardens |
| Obsidian Archive | FCT_VAR | VAR, Archive |

---

## 5. Capitalization Standards

### Recommended Style Guide

| Term | Correct | Incorrect |
|------|---------|-----------|
| The Forged | "The Forged" | "the forged", "forged" |
| IEZ | "IEZ" or "the IEZ" | "iez", "Iez" |
| Harvester | "Harvester" (proper noun) | "harvester" |
| The Cascade | "The Cascade" | "the cascade", "cascade" |
| Monolith | "Monolith" | "monolith" |
| Skimmer | "Skimmer" | "skimmer" |
| Harrower | "Harrower" | "harrower" |

### Faction Names

| Faction | Always Capitalize | Acceptable |
|---------|-------------------|------------|
| Iron Vultures | "Iron Vultures" | "the Iron Vultures" |
| Roadborn | "Roadborn" | "the Roadborn" |
| Seventy-Seven | "The Seventy-Seven" | "Seventy-Seven" |
| Directorate | "The Directorate" | "Directorate" |
| Civic Wardens | "Civic Wardens" | "the Civic Wardens" |

---

## 6. File Naming Conventions

### Current Inconsistencies

| Pattern | Example | Recommended |
|---------|---------|-------------|
| Mixed case | `LORE_BIBLE.md` vs `Lore_Bible.md` | PascalCase or UPPER_SNAKE |
| Spaces | Some file names have spaces | Use underscores |
| Prefixes | FCT_, REG_, POI_, etc. | ✅ GOOD - Keep using |

### Recommended Standards

```
Docs/
├── Design/
│   ├── GAMEPLAY_DESIGN_DOCUMENT.md  # UPPER_SNAKE for major docs
│   └── Systems/
│       └── Black_Auction_System.md   # PascalCase for subsections
├── Lore/
│   └── LoreBook/
│       └── factions/
│           └── FCT_VUL_Iron_Vultures.md  # Prefix + PascalCase

Wiki/
├── Factions/
│   ├── index.md                      # Lowercase for index files
│   └── Iron_Vultures.md              # PascalCase for content
```

---

## 7. Style Guide Recommendations

### Proposed Terminology Standards

```yaml
# BLOOM TERMINOLOGY STANDARDS v1.0

project:
  name: "Bloom"
  tagline: "8-10 player PvE co-op extraction shooter"
  never_use: ["Terminal Grounds", "TG"]

world:
  zone_name: "IEZ" # Interdiction Exclusion Zone
  event_system: "IEZ Anomalies" # NOT "Splice Events"
  lore_event: "The Splice" # Acceptable in lore context
  cascade: "The Cascade" # Always with article
  world_size: "32km × 32km"

enemies:
  faction_name: "The Forged"
  as_adjective: "Forged enemies, Forged units"
  harvester_tech: "Harvester" # Always capitalized

factions:
  FCT_DIR:
    full: "Sky Bastion Directorate"
    short: "Directorate"
    avoid: ["Dir", "SBD"]
  FCT_VUL:
    full: "Iron Vultures"
    avoid: ["Iron Scavengers", "Vultures Union"]
  FCT_NOM:
    full: "Roadborn Clans"
    short: "Roadborn"
    avoid: ["Nomad Clans", "Nomads"]
  FCT_F77:
    full: "The Seventy-Seven"
    code: "Free77"
    avoid: ["Free 77", "F77"]
  FCT_CWD:
    full: "Civic Wardens"
    avoid: ["Truce Wardens"]
  FCT_VAR:
    full: "Obsidian Archive"
    avoid: ["Vaulted Archivists"]
```

---

## 8. Priority Action Items

### 🔴 HIGH PRIORITY (Do First)

1. **Mass rename "Terminal Grounds" → "Bloom"** in active documentation
   - Archive legacy docs with clear deprecation notices
   - Update ~1,580 references

2. **Standardize faction names**
   - Update 71 "Iron Scavengers" → "Iron Vultures"
   - Update 51 "Nomad Clans" → "Roadborn"
   - Update "Vaulted Archivists" → "Obsidian Archive"

3. **Resolve PvP/PvE confusion**
   - Add disclaimers to legacy PvP design docs
   - Update any active docs referencing PvP mechanics

### 🟡 MEDIUM PRIORITY

4. **Event terminology**
   - Update 11 "Splice Events" → "IEZ Anomalies"
   - Clarify "The Splice" is lore-only terminology

5. **Capitalization pass**
   - Ensure "The Forged" consistency
   - Ensure "Harvester" always capitalized

### 🟢 LOW PRIORITY

6. **File naming cleanup**
   - Standardize PascalCase vs UPPER_SNAKE
   - Ensure consistent prefixes (FCT_, REG_, etc.)

---

## 9. Files Requiring Immediate Attention

### High-Traffic Wiki Pages with Issues

| File | Issue | Priority |
|------|-------|----------|
| `Wiki/Factions/index.md` | Mixed faction names, references deprecated factions | HIGH |
| `Wiki/Gameplay/Splice_Events.md` | Should be renamed/redirected to IEZ_Anomalies | HIGH |
| `Wiki/Factions/Iron_Vultures.md` | Contains "Iron Scavengers" text | MEDIUM |
| `Wiki/Factions/Nomad_Clans.md` | File named incorrectly, should be Roadborn | HIGH |

### Legacy Docs Requiring Archive Notice

| File | Issue |
|------|-------|
| `Docs/Design/GAMEPLAY_DESIGN_DOCUMENT.md` | References Terminal Grounds, PvP mechanics |
| `Docs/Design/TERRITORY_CONTROL_SYSTEM.md` | References Terminal Grounds, PvP |
| `Docs/Design/Trust_System.md` | PvP-focused betrayal mechanics |

---

## 10. Changelog

| Date | Action | By |
|------|--------|-----|
| 2025-01-28 | Initial audit completed | Cross-Reference Auditor |

---

*This audit was performed as part of the Bloom documentation consistency initiative. For questions, contact the Documentation Team.*
