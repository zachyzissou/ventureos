# Docs Lore/Narrative/Design Audit Report

**Generated:** 2026-01-28
**Auditor:** Subagent (bloom-docs-audit)
**Workspace:** C:\Users\Zachg\Development\Games\Bloom\Docs

## Summary

- **Files scanned:** 25 (priority files + related Lore/Narrative/Design documents)
- **Files with issues:** 17
- **Total deprecated term instances:** ~115+

## Canonical Reference (7 Factions)

| ID | Canonical Name | Notes |
|----|---------------|-------|
| FCT_DIR | Directorate / Sky Bastion Directorate | ✓ |
| FCT_VUL | Vultures / Iron Vultures | ✓ |
| FCT_WAR | Wardens / Truce Wardens | ✓ |
| FCT_F77 | SeventySeven / Free 77 / The Seventy-Seven | ✓ |
| FCT_ASH | PactOfAsh / Pact of Ash | ✓ |
| FCT_NOM | **Roadborn** / Nomad Clans | NOT "Wayfarers" |
| FCT_VAR | Archive / Obsidian Archive | ✓ |

## Deprecated Terms Reference

| Deprecated | Canonical Replacement |
|------------|----------------------|
| Helix Syndicate | *REMOVE - fake faction* |
| Wayfarers / The Wayfarers | **Roadborn** |
| North Guard | *REMOVE - fake faction* |
| Apex Dynamics | *REMOVE - fake faction* |
| GhostProtocol | *REMOVE - fake faction* |
| RedCollective | *REMOVE - fake faction* |
| NorthstarPMC | *REMOVE - fake faction* |
| ScavengerUnion | *REMOVE - fake faction* |
| Deep Vault | **Black Vault** |
| Vault Lexicon | **Obsidian Archive** |
| Corporate Combine | **Trivector Combine** |

---

## Files Requiring Updates

### 1. Docs/Lore/PLAYER_CALLOUT_DIALOGUE.md
**CRITICAL - 38+ instances**

**Helix Syndicate (19 instances - entire faction section needs removal/replacement):**
- Line 34: `### Helix Syndicate` → Remove entire section or replace with canonical faction
- Line 37-40: Helix Syndicate loot dialogue (4 lines)
- Line 87: `### Helix Syndicate` combat section
- Line 90-93: Helix Syndicate combat dialogue (4 lines)
- Line 134: `### Helix Syndicate` extraction section
- Line 137-138: Helix Syndicate extraction dialogue (2 lines)
- Line 173: `### Helix Syndicate` environmental section
- Line 176-177: Helix Syndicate environmental dialogue (2 lines)
- Line 208: `**Helix Syndicate**:` sacrifice moment
- Line 233: `**Helix Syndicate**:` sacrifice moment
- Line 267: `**Helix Syndicate** (Eating):`
- Line 270: `**Helix Syndicate** (Donating):`
- Line 313: `**Helix Syndicate** (Using):`
- Line 316: `**Helix Syndicate** (Avoiding):`
- Line 359: `**Helix Syndicate** (Sharing):`
- Line 362: `**Helix Syndicate** (Hoarding):`
- Line 405: `**Helix Syndicate** (Following):`
- Line 408: `**Helix Syndicate** (Refusing):`
- Line 451: `**Helix Syndicate** (Leaving):`
- Line 454: `**Helix Syndicate** (Waiting):`
- Line 497: `**Helix Syndicate** (Trusting):`
- Line 500: `**Helix Syndicate** (Suspicious):`
- Line 576: `**Helix Syndicate**:` voice coaching

**Wayfarers (19 instances - should be "Roadborn"):**
- Line 41: `### Wayfarers` → `### Roadborn`
- Line 44-47: Wayfarers loot dialogue → Roadborn
- Line 94: `### Wayfarers` → `### Roadborn`
- Line 97-100: Wayfarers combat dialogue → Roadborn
- Line 139: `### Wayfarers` → `### Roadborn`
- Line 142-143: Wayfarers extraction dialogue → Roadborn
- Line 178: `### Wayfarers` → `### Roadborn`
- Line 181-182: Wayfarers environmental dialogue → Roadborn
- Line 211: `**Wayfarers**:` → `**Roadborn**:`
- Line 236: `**Wayfarers**:` → `**Roadborn**:`
- Line 273: `**Wayfarers** (Eating):` → `**Roadborn** (Eating):`
- Line 276: `**Wayfarers** (Donating):` → `**Roadborn** (Donating):`
- Line 319: `**Wayfarers** (Using):` → `**Roadborn** (Using):`
- Line 322: `**Wayfarers** (Avoiding):` → `**Roadborn** (Avoiding):`
- Line 365: `**Wayfarers** (Sharing):` → `**Roadborn** (Sharing):`
- Line 368: `**Wayfarers** (Hoarding):` → `**Roadborn** (Hoarding):`
- Line 411: `**Wayfarers** (Following):` → `**Roadborn** (Following):`
- Line 414: `**Wayfarers** (Refusing):` → `**Roadborn** (Refusing):`
- Line 457: `**Wayfarers** (Leaving):` → `**Roadborn** (Leaving):`
- Line 460: `**Wayfarers** (Waiting):` → `**Roadborn** (Waiting):`
- Line 503: `**Wayfarers** (Trusting):` → `**Roadborn** (Trusting):`
- Line 506: `**Wayfarers** (Suspicious):` → `**Roadborn** (Suspicious):`
- Line 582: `**Wayfarers**:` voice coaching → `**Roadborn**:`

---

### 2. Docs/ROSTERS.md
**CRITICAL - 14+ instances**

**Fake factions listed as "playable" (must be removed or moved to NPC-only):**
- Line ~12: `| FCT_HLX | Helix Syndicate | Tech/Engineer | Month 3-6 |` → REMOVE
- Line ~13: `| FCT_WAY | The Wayfarers | Scout/Mobility | Month 3-6 |` → Change to FCT_NOM / Roadborn
- Line ~14: `| FCT_NGD | North Guard | Anti-Forged Specialist | Month 6-9 |` → REMOVE
- Line ~16: `| FCT_APX | Apex Dynamics | Elite Hunter | Month 6-9 |` → REMOVE

**JSON block also contains these deprecated entries:**
- `"HelixSyndicate"` worldgenEnum
- `"Wayfarers"` worldgenEnum
- `"NorthGuard"` worldgenEnum
- `"ApexDynamics"` worldgenEnum

**Note:** Document lists 10 playable factions but canonical count is 7.

---

### 3. Docs/Lore/FACTION_BANTER_DIALOGUE.md
**CRITICAL - 12+ instances**

**Helix Syndicate (full section needs removal/replacement):**
- Line 111: `## Helix Syndicate (10 Lines)` → Remove entire section
- Line 114: Reference to "Wayfarers" in Helix dialogue
- Lines 117-143: All Helix Syndicate banter lines (10 lines)

**Wayfarers (full section - rename to Roadborn):**
- Line 145: `## Wayfarers (10 Lines)` → `## Roadborn (10 Lines)`
- Lines 148-180: All "Wayfarer" references → "Roadborn"
- Line 182: Cross-reference: "Helix Syndicate... they integrate" → needs update

---

### 4. Docs/Lore/10_YEAR_NARRATIVE_ROADMAP.md
**HIGH - 8+ instances**

**Deep Vault → Black Vault:**
- Line 87: `**The Deep Vault Anomaly**` → `**The Black Vault Anomaly**`
- Line 148: `**3. Deep Vault Unsealed**` → `**3. Black Vault Unsealed**`
- Line 447: "Storms Archive Deep Vault demanding answers" → "Black Vault"
- Line 624: "Deep Vault Cascade" → "Black Vault Cascade"
- Line 792: "Nadia's Research Station (Archive Deep Vault)" → "Black Vault"

**Wayfarers references (context-dependent):**
- Various references to Wayfarers throughout character arcs need review

---

### 5. Docs/Lore/HANDLER_CHECKIN_DIALOGUE.md
**HIGH - 8 instances**

**Helix Syndicate section (needs removal/replacement):**
- Line 58: `## Helix Syndicate (PD-43 "Hyacinth" Wei)` → Remove entire section
- Lines 59-73: All Helix Syndicate handler dialogue (4 mission phases)

**Wayfarers section (rename to Roadborn):**
- Line 74: `## Wayfarers (Ive "Marker" Ravel)` → `## Roadborn (Ive "Marker" Ravel)`
- Lines 75-89: All "Wayfarer" references → "Roadborn"

---

### 6. Docs/Lore/MISSION_BRIEFING_DIALOGUE.md
**HIGH - 12 instances**

**Helix Syndicate section (needs removal/replacement):**
- Line 109: `## Helix Syndicate (PD-43 "Hyacinth" Wei)` → Remove entire section
- Lines 110-141: All Helix Syndicate mission briefings (6 variants)

**Wayfarers section (rename to Roadborn):**
- Line 142: `## Wayfarers (Ive "Marker" Ravel)` → `## Roadborn (Ive "Marker" Ravel)`
- Lines 143-175: All "Wayfarer" references → "Roadborn"

---

### 7. Docs/Lore/BLOOM_GAME_BIBLE.md
**HIGH - 15+ instances**

**Section 5.5 and 5.6 are entirely about deprecated factions:**
- Line 447: `- **FCT_HLX - Helix Syndicate (successor to Trivector Combine)**` → REMOVE
- Line 448: `- **FCT_WAY - The Wayfarers (formerly Roadborn Clans)**` → **BACKWARDS** - Roadborn is canonical
- Line 514: `### 5.5 Helix Syndicate (FCT_HLX)` → Remove entire section
- Line 531: `### 5.6 The Wayfarers (FCT_WAY) - Post-Launch` → Rename to Roadborn section or remove
- Line 553: "The Black Vault / Deep Vault" → "The Black Vault" (remove alias)
- Line 640: `- **Ive "Marker" Ravel - Wayfarers**` → "Roadborn"
- Line 846: "Deep Vault / Black Vault" → "Black Vault"

**Note:** Line 304 refers to "six additional blocs (Helix, Wayfarers, Archive, North Guard, Pact of Ash, Apex Dynamics)" which is incorrect. Only Archive and Pact of Ash are canonical additional factions.

---

### 8. Docs/Lore/AUDIO_LOG_SCRIPTS.md
**MEDIUM - 4 instances**

- Line 178: "The Cosmonaut, Deep Vault containment lab" → "Black Vault"
- Line 1014: "Helix Syndicate medical outreach tent" → Remove or replace
- Line 1021: "Helix Syndicate Humanitarian Division" → Remove or replace

---

### 9. Docs/Lore/FACTION_CHARACTER_PROFILES.md
**MEDIUM - 4 instances**

- Line 366: "Deep Vault" → "Black Vault"
- Line 382: "Night Shift at the Deep Vault" → "Night Shift at the Black Vault"
- Line 384: "The Deep Vault is silent" → "The Black Vault is silent"

---

### 10. Docs/Lore/Season1_Scripting_Packet.md
**LOW - 1 instance**

- Line 63: `Ive "Marker" Ravel (Wayfarers)` → `Ive "Marker" Ravel (Roadborn)`

---

### 11. Docs/Design/MASTER_WORLD_LAYOUT.md
**MEDIUM - 8 instances**

**Deep Vault → Black Vault:**
- Line 241: `### Landmark 8: Obsidian Archive - Deep Vault (Hidden)` → "Black Vault"
- Line 314: `| **Obsidian Archive** | Deep Vault |` → "Black Vault"
- Line 470: `- **Tile_06_16**: Deep Vault (Archive, hidden)` → "Black Vault"
- Line 658: "Archive Deep Vault requires reputation unlock" → "Black Vault"
- Line 694: "Deep Vault" in landmarks list → "Black Vault"
- Line 765: "including Archive Deep Vault" → "Black Vault"

---

### 12. Docs/Design/MASTER_WORLD_MAP_DESIGN.md
**MEDIUM - 4 instances**

- Line 213: "Deep Vault" → "Black Vault"
- Line 219: "Deep Vault (Archive HQ)" → "Black Vault"
- Line 453: "Deep Vault" in faction hub table → "Black Vault"

---

### 13. Docs/Design/PLAYER_CHARACTER_ARCHETYPES.md
**MEDIUM - 4 instances**

- Line 534: "Archive's Deep Vault laboratory" → "Black Vault"
- Line 589: "Deep Vault Laboratory" → "Black Vault Laboratory"
- Line 892: "Deep Vault laboratory" → "Black Vault laboratory"

---

### 14. Docs/Design/STALKER_ATMOSPHERE_MYSTERY_ANALYSIS.md
**LOW - 1 instance**

- Line 808: "Level 3 (Deep Vault)" → "Level 3 (Black Vault)"

---

### 15. Docs/Design/ENVIRONMENT_ART_SPECIFICATIONS.md
**LOW - 1 instance**

- Line 334: "North Guard Bunkers (Directorate)" → Remove "North Guard" or rename

---

### 16. Docs/Design/ENVIRONMENT_ART_SPECIFICATIONS_SOUTHWESTPLAINS.md
**LOW - 1 instance**

- Line 2206: "neutral/North Guard markings appear" → Remove "North Guard"

---

### 17. Docs/Lore/RETCON_NOTES_2025_08_28.md
**NOTE - Documentation file**

This file documents the Deep Vault → Black Vault transition at:
- Line 25: `1. Deep Vault → Black Vault`
- Line 28: Policy note about REG_BLACK_VAULT

This file is historical documentation and should be preserved as-is (explains the retcon).

---

## Priority Ranking

### P0 - Critical (Voice acting/gameplay-facing content)
1. **PLAYER_CALLOUT_DIALOGUE.md** - 38+ changes, production-ready dialogue
2. **ROSTERS.md** - 14+ changes, affects game systems/code
3. **FACTION_BANTER_DIALOGUE.md** - 12+ changes, production-ready dialogue

### P1 - High (Design documentation)
4. **HANDLER_CHECKIN_DIALOGUE.md** - 8 changes
5. **MISSION_BRIEFING_DIALOGUE.md** - 12 changes
6. **BLOOM_GAME_BIBLE.md** - 15+ changes, canonical reference
7. **10_YEAR_NARRATIVE_ROADMAP.md** - 8+ changes

### P2 - Medium (Supporting documentation)
8. **AUDIO_LOG_SCRIPTS.md** - 4 changes
9. **FACTION_CHARACTER_PROFILES.md** - 4 changes
10. **MASTER_WORLD_LAYOUT.md** - 8 changes
11. **MASTER_WORLD_MAP_DESIGN.md** - 4 changes
12. **PLAYER_CHARACTER_ARCHETYPES.md** - 4 changes

### P3 - Low (Minor references)
13. **Season1_Scripting_Packet.md** - 1 change
14. **STALKER_ATMOSPHERE_MYSTERY_ANALYSIS.md** - 1 change
15. **ENVIRONMENT_ART_SPECIFICATIONS.md** - 1 change
16. **ENVIRONMENT_ART_SPECIFICATIONS_SOUTHWESTPLAINS.md** - 1 change

---

## Recommendations

### Structural Changes Needed

1. **Helix Syndicate removal**: This faction appears as a full section in multiple dialogue files. Decision needed:
   - Remove entirely and reduce to 6 factions for voice acting?
   - Replace with Pact of Ash dialogue (currently missing in some files)?
   - Create placeholder for future content?

2. **Wayfarers → Roadborn**: Global find-replace with context review. The faction personality should remain the same; only the name changes.

3. **Deep Vault → Black Vault**: Straightforward replacement. The term "Deep Vault" should become alias only per RETCON_NOTES.

4. **ROSTERS.md restructure**: This file needs significant revision to reflect the canonical 7 factions, not 10.

5. **BLOOM_GAME_BIBLE.md sections 5.5-5.6**: These entire sections cover deprecated factions and need removal or complete rewrite.

### Files NOT Requiring Changes
- Docs/Lore/RETCON_NOTES_2025_08_28.md (historical documentation)
- Any files in Docs/Archive (skipped per instructions)

---

*End of Audit Report*
