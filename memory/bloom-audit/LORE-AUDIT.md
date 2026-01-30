# Bloom Lore & Narrative Audit

**Date:** 2026-01-28
**Status:** Needs Cleanup

---

## 📚 Source of Truth

**Canonical:** `Docs/Lore/BLOOM_GAME_BIBLE.md` (44KB, v0.9.0)

The Game Bible is well-structured with:
- 12 sections (themes, timeline, factions, characters, tech, etc.)
- Stable ID system (FCT_*, REG_*, POI_*, CHR_*, etc.)
- Canon rules and governance process
- Retcon tracking in Section 12

---

## ✅ Active/Living Docs (per deprecation matrix)

| Doc | Purpose | Size |
|-----|---------|------|
| `BLOOM_GAME_BIBLE.md` | Canon source of truth | 44KB |
| `10_YEAR_NARRATIVE_ROADMAP.md` | Long-range seasons | 100KB |
| `AUDIO_LOG_SCRIPTS.md` | Voice recording scripts | 114KB |
| `FACTION_BANTER_DIALOGUE.md` | Encounter banter | 17KB |
| `HANDLER_CHECKIN_DIALOGUE.md` | Handler VO matrix | 13KB |
| `MISSION_BRIEFING_DIALOGUE.md` | Briefing templates | 19KB |
| `PLAYER_CALLOUT_DIALOGUE.md` | Player barks | 20KB |
| `FACTION_CHARACTER_PROFILES.md` | Character details | 67KB |
| `Season1_Scripting_Packet.md` | S1 scripts | 6KB |
| `DOC_DEPRECATION_MATRIX.md` | Governance tracker | 4KB |

---

## ⚠️ Issues Found

### 1. Worktree Drift (CRITICAL)
The `peninsula-world-generation` worktree has diverged significantly:

| File | Main | Worktree | Status |
|------|------|----------|--------|
| LORE_BIBLE.md | 223 bytes (stub) | 17KB (full) | Main archived |
| HARVESTER_MYSTERY_CLUES.md | 394 bytes (stub) | 109KB (full) | Main archived |
| IEZ_BIOME_ENVIRONMENTAL_DESCRIPTIONS.md | 389 bytes (stub) | 56KB (full) | Main archived |
| COSMONAUT_NARRATIVE_COHERENCE_REPORT.md | 440 bytes (stub) | 28KB (full) | Main archived |
| + 11 more files... | | | |

**Risk:** Worktree may have stale/deprecated lore still active. Needs rebase or selective merge.

### 2. Wiki vs Docs/Lore Overlap
Same filenames exist in both locations:
- `Factions_Flavor.md`
- `Lore_Backbone.md`
- `Lore_Bible.md` / `LORE_BIBLE.md`
- `POIs_Flavor.md`

**Risk:** Which is canonical? Wiki may have outdated content.

### 3. Empty LoreBook Entries
Many files in `Docs/Lore/LoreBook/` are 0KB stubs:
- factions/*.md
- regions/*.md
- characters/*.md
- pois/*.md
- technology/*.md
- events/*.md

**Risk:** These are placeholders. Need to be either populated or removed.

### 4. Retcon Propagation
Known renames not verified across all docs:
- "Vault Lexicon" → "Obsidian Archive"
- "Corporate Combine" → "Trivector Combine"
- "Deep Vault" → "Black Vault"
- "Industrial Exclusion Zone" → "Dead Sky (IEZ)"

---

## 📋 Recommended Actions

### P0 - Immediate
1. [ ] **Merge/rebase worktree** — Sync `peninsula-world-generation` with main's archive changes
2. [ ] **Dedupe Wiki** — Determine if Wiki is secondary to Docs/Lore, archive duplicates

### P1 - This Week
3. [ ] **Audit LoreBook stubs** — Either populate from Game Bible or delete empty files
4. [ ] **Verify retcons** — Search codebase for old terminology, update to canonical names
5. [ ] **Create LORE-INDEX** — Single quick-reference for all canon locations

### P2 - Backlog
6. [ ] **Consolidate Wiki/Docs** — One source, one structure
7. [ ] **Link code to lore** — Ensure FactionType enum matches Game Bible FCT_* IDs
8. [ ] **Audio log audit** — Verify scripts match in-game implementation

---

## 🗂️ Current Lore Locations

```
Docs/Lore/                    <- ACTIVE CANON
├── BLOOM_GAME_BIBLE.md       <- SOURCE OF TRUTH
├── LoreBook/                 <- Structured entries (many empty)
├── Writing/                  <- Writing tasks
└── [dialogue scripts]        <- Active

Docs/Archive/LegacyLore/      <- DEPRECATED (read-only)

Wiki/Lore/                    <- SECONDARY? (needs decision)
Wiki/Factions/                <- SECONDARY?

Docs/Narrative/               <- VO/SCRIPTS (active)
├── AudioLogScripts/
├── EnvironmentalNotes/
└── HandlerBriefings/

Assets/Scripts/Narrative/     <- CODE (FactionType, etc.)
```

---

## 🔗 Faction ID Mapping — CRITICAL MISMATCH

### Game Bible Canon (FCT_* IDs)
| ID | Display Name | Role |
|----|--------------|------|
| FCT_DIR | The Directorate | Corporate/Military |
| FCT_VUL | Iron Vultures | Scavenger/Looter |
| FCT_WAR | Truce Wardens | Medic/Defender |
| FCT_CWD | Civic Wardens | ? |
| FCT_NOM | Nomad Clans | ? |
| FCT_F77 | Free 77 | ? |
| FCT_VAR | Obsidian Archive | Knowledge/Archive |
| FCT_AEG | Aegis Collective | Healer/Support |

### Code Enum Comparison (3 CONFLICTING DEFINITIONS)

| Narrative/*.cs (CANONICAL) | WorldGeneration/*.cs | BiomeTerrainPreset (DEPRECATED!) |
|---------------------------|---------------------|----------------------------------|
| Directorate (FCT_DIR) | SkyBastion | Directorate |
| Vultures (FCT_VUL) | IronVultures | Free77 |
| TruceWardens? (FCT_WAR) | AegisCollective | ApexDynamics |
| ... | ... | RedCollective |
| | | NorthstarPMC |
| | | ScavengerUnion |
| | | GhostProtocol |

### ⚠️ BiomeTerrainPreset Has COMPLETELY WRONG Factions!
`Assets/Scripts/Terrain/BiomeTerrainPreset.cs` line 118 defines:
- ApexDynamics, RedCollective, NorthstarPMC, ScavengerUnion, GhostProtocol

**These do NOT exist in the Game Bible!** This is deprecated lore that was never cleaned up.

### Action Required
1. **Delete** `BiomeTerrainPreset.FactionType` nested enum
2. **Consolidate** to `Bloom.Narrative.FactionType` as single source
3. **Update** WorldGeneration to reference Narrative enum
4. **Verify** all code uses canonical FCT_* faction names
