# Wiki Audit Report

**Generated:** 2026-01-28  
**Auditor:** Bloom Wiki Audit Subagent  
**Workspace:** C:\Users\Zachg\Development\Games\Bloom\Wiki

## Summary
- **Files scanned:** 81
- **Files with issues:** 42
- **Total deprecated references:** 158+
- **Fake faction files to delete:** 4

---

## Critical: Fake Faction Files to DELETE

These files reference non-canonical factions and should be removed entirely:

### Factions/Apex_Dynamics.md
- **Action:** DELETE entire file (fake faction)

### Factions/Helix_Syndicate.md
- **Action:** DELETE entire file (fake faction)

### Factions/North_Guard.md
- **Action:** DELETE entire file (fake faction)

### Factions/Aegis_Collective.md
- **Action:** DELETE or merge content into Civic_Wardens.md (use display name "Wardens")

### Factions/Wayfarers.md
- **Action:** DELETE or rename to Roadborn.md (Wayfarers → Roadborn per canonical lore)

---

## Files Requiring Updates

### Factions/index.md
- Line 18: Link to "Aegis Collective" → should reference "Wardens" or "Civic_Wardens"
- Line 22: Link to "Helix Syndicate" → DELETE (fake faction)
- Line 23: Link to "The Wayfarers" (FCT_WAY) → should be "Roadborn" (FCT_NOM)
- Line 27: Link to "North Guard" → DELETE (fake faction)
- Line 29: Link to "Apex Dynamics" → DELETE (fake faction)

### Factions/Obsidian_Archive.md
- Line 29: "Deep Vault" territory reference → "Black Vault"
- Line 40: "Deep Vault" in origin text → "Black Vault"
- Line 87: "Combine" reference → verify if "Trivector Combine"
- Line 160: "POI_BLACK_VAULT" - correct name but verify context
- Line 211: "1x Wayfarers" → "1x Roadborn"
- Line 307: "Deep Vault" in progression table → "Black Vault"
- Line 347: "Deep Vault Expeditions" → "Black Vault Expeditions"
- Line 411: "The Deep Vault (REG_..." → "The Black Vault"

### Factions/Conflict_Matrix.md
- Line 103: Link to "Iron Scavengers" → DELETE reference (file doesn't exist, fake faction)

### Factions/Directorate.md
- Line 191: Link to "Iron Scavengers" → DELETE reference (fake faction)

### Factions/Free77.md
- Line 224: Link to "Iron Scavengers" → DELETE reference (fake faction)

### Factions/Leaders_And_Handlers.md
- Line 187: Link to "Iron Scavengers" → DELETE reference (fake faction)

### Factions/Nomad_Clans.md
- Line 242: Link to "Iron Scavengers" → DELETE reference (fake faction)

---

### Lore/Audio_Log_Guide.md
- Line 321: "Deep Vault" → "Black Vault"
- Line 410: "Deep Vault" ambient reference → "Black Vault"

### Lore/Characters.md
- Line 147: Handler Six "Deep Vault" reference → "Black Vault"
- Line 234: "Deep Vault" academic reference → "Black Vault"

### Lore/Environmental_Storytelling.md
- Line 213: "Deep Vault" placement → "Black Vault"
- Line 543: "Deep Vault" in table → "Black Vault"

### Lore/Events.md
- Line 333: "Deep Vault" trigger → "Black Vault"

### Lore/Faction_Relationships.md
- Line 85: "Deep Vault" access → "Black Vault"
- Line 109: "Deep Vault" reference → "Black Vault"
- Line 329: "The Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"

### Lore/Harvester_Technology.md
- Line 201: "Deep Vault" → "Black Vault"

### Lore/index.md
- Line 90: "Deep Vault" event → "Black Vault"
- Line 218: "REG_BLACK_VAULT" - correct but verify context
- Line 241: "Deep Vault" reference → "Black Vault"

### Lore/Lore_Backbone.md
- Line 30: "Deep Vault" region list → "Black Vault"

### Lore/Lore_Bible.md
- Line 182: "REG_BLACK_VAULT" - verify correct usage
- Line 198: "FCT_WAY" diagram → Remove or change to FCT_NOM
- Line 310: "FCT_WAY" section → Remove or change to Roadborn (FCT_NOM)
- Line 330: "Wayfarers" territory → "Roadborn" territory
- Line 339: "Wayfarers" 2161 Role → "Roadborn"
- Line 542: "Wayfarer" character reference → "Roadborn"
- Line 546: "Wayfarer" conflict → "Roadborn"
- Line 704: "Deep Vault" event → "Black Vault"
- Line 713: "Wayfarers" faction mention → Remove from canonical list
- Line 717: Check canonical leader list
- Line 720: "Wayfarers" biome reference → "Roadborn"

### Lore/Naming_Guide.md
- Line 162: "FCT_VAR → Vault Lexicon" → "FCT_VAR → Obsidian Archive"
- Line 178: "Deep Vault" → "Black Vault"
- Line 283: "FCT_CCB: Corporate Combine" → "FCT_CCB: Trivector Combine"
- Line 372: "FCT_VAR → Obsidian Archive" - correct
- Line 388: "Deep Vault" → "Black Vault"

### Lore/Timeline.md
- Line 270: "Deep Vault" reference → "Black Vault"
- Line 360: "Deep Vault" event → "Black Vault"
- Line 368: "Deep Vault" legacy → "Black Vault"
- Line 431: "Deep Vault" hoarding → "Black Vault"
- Line 485: "Deep Vault" emission → "Black Vault"

### Lore/Timeline_2147_2161.md
- Line 273: "Deep Vault" Archive reference → "Black Vault"
- Line 374: "Wayfarers" expansion → Remove or change to Roadborn
- Line 376: "Deep Vault Breach" → "Black Vault Breach"

### Lore/Characters/Handler_Six.md
- Line 32: "Deep Vault" walked reference → "Black Vault"

### Lore/Events/Tech_Vault_Siege.md
- Line 43: "Deep Vault" reference → "Black Vault"

---

### Gameplay/AI_Director_System.md
- Line 236: "1x Wayfarers detected" → "1x Roadborn detected"

### Gameplay/Biomes_Guide.md
- Line 229: "The Deep Vault" → "The Black Vault"
- Line 235: "The Deep Vault / Black Vault" → "The Black Vault"
- Line 276: "Deep Vault Access" → "Black Vault Access"
- Line 284: "Archive Deep Vault" → "Archive Black Vault"
- Line 448: "Deep Vault" event → "Black Vault"
- Line 770: "Wayfarers" tech → "Roadborn"
- Line 779: "Wayfarers" tech → "Roadborn"
- Line 974: "Deep Vault" diagram → "Black Vault"

### Gameplay/Combat.md
- Line 109: "Wayfarers" specialist → "Roadborn"
- Line 217: "The Wayfarers (Scout)" → "Roadborn (Scout)"
- Line 247: "Scouts (Wayfarers)" → "Scouts (Roadborn)"
- Line 250: "Wayfarers mark" → "Roadborn mark"
- Line 426: "Wayfarers + Iron Vultures" → "Roadborn + Vultures"

### Gameplay/Controls_And_Keybinds.md
- Line 107: "The Wayfarers (Scout)" → "Roadborn (Scout)"

### Gameplay/Crafting_And_Upgrades.md
- Line 143: "Wayfarers" → "Roadborn"
- Line 188: "Wayfarers" table row → "Roadborn"

### Gameplay/Death_And_Respawn.md
- Line 466: "Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 504: "Scouts (Wayfarers mobile)" → "Scouts (Roadborn mobile)"

### Gameplay/Electronic_Warfare.md
- Line 9: Wiki link cleanup
- Line 413: "Helix Syndicate" link → DELETE (fake faction)

### Gameplay/Extraction.md
- Line 77: "Deep Vault Shaft" → "Black Vault Shaft"
- Line 264: "The Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 385: "Wayfarers (Scout)" → "Roadborn (Scout)"
- Line 450: "Deep Vault Shaft" → "Black Vault Shaft"
- Line 602: "2x Wayfarers (Scout)" → "2x Roadborn (Scout)"
- Line 653: "The Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"

### Gameplay/Factions.md
- Line 122: "The Wayfarers | FCT_WAY" → "Roadborn | FCT_NOM"
- Line 355: "The Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 398: "1x Wayfarers (Scout)" → "1x Roadborn (Scout)"
- Line 423: "Wayfarers" table row → "Roadborn"

### Gameplay/Forged_Enemy_Types.md
- Line 285: "Wayfarers" bonus → "Roadborn"
- Line 298: "Wayfarers" table row → "Roadborn"

### Gameplay/Game_Design_Document.md
- Line 42: "The Wayfarers | FCT_WAY" → "Roadborn | FCT_NOM"

### Gameplay/Health_And_Medical.md
- Line 48: Check thermal damage context
- Line 133: "Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 221: "Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 323: "Wayfarers (Scout)" → "Roadborn (Scout)"
- Line 377: "Deep Vault" reference → "Black Vault"

### Gameplay/Intelligence.md
- Line 431: "Archive + Wayfarers" → "Archive + Roadborn"
- Line 435: "Wayfarers +15%" → "Roadborn +15%"

### Gameplay/Inventory_System.md
- Line 170: "The Wayfarers" → "Roadborn"
- Line 253: "Wayfarers Scout" → "Roadborn Scout"
- Line 342: "The Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 443: "Wayfarers" overwatch → "Roadborn"
- Line 555: "Archive Deep Vault" → "Archive Black Vault"

### Gameplay/Loot_System.md
- Line 268: "Deep Vault containment" → "Black Vault containment"
- Line 422: "Deep Vault" region → "Black Vault"
- Line 629: "Deep Vault" region → "Black Vault"
- Line 664: "The Wayfarers" → "Roadborn"
- Line 795: "The Wayfarers" → "Roadborn"
- Line 918: "Deep Vault" location → "Black Vault"
- Line 967: "Archive Deep Vault" → "Archive Black Vault"
- Line 992: "Wayfarers" Coastal → "Roadborn"
- Line 1048: "Wayfarers" Scout → "Roadborn"

### Gameplay/Maps.md
- Line 128: "The Deep Vault (REG_...)" → "The Black Vault"
- Line 149: "Deep Vault" lore context → "Black Vault"
- Line 360: "The Wayfarers" faction → "Roadborn"
- Line 413: "Deep Vault" diagram → "Black Vault"

### Gameplay/Movement_And_Stamina.md
- Line 43: "Wayfarers" faction bonus → "Roadborn"
- Line 281: "Wayfarers" directorate → "Roadborn"
- Line 302: "Wayfarers -10%" → "Roadborn -10%"
- Line 354: "The Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 360: "The Wayfarers" MVP → "Roadborn"
- Line 487: "Wayfarers" faction → "Roadborn"
- Line 499: "Wayfarers" faction → "Roadborn"
- Line 509: "Wayfarers Speed Aura" → "Roadborn Speed Aura"
- Line 525: "Wayfarers" squad → "Roadborn"
- Line 562: "Directorate + Wayfarers" → "Directorate + Roadborn"
- Line 583: "Ignored Wayfarers" warning → "Ignored Roadborn"
- Line 584: "Wayfarers" solution → "Roadborn"

### Gameplay/Navigation_And_Waypoints.md
- Line 311: "Wayfarers Navigation" → "Roadborn Navigation"
- Line 313: "The Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 368: "Wayfarers" solution → "Roadborn"
- Line 377: "Wayfarers" usage → "Roadborn"
- Line 438: "Wayfarers" diagram → "Roadborn"
- Line 472: "10 Playable Factions" link - verify accuracy

### Gameplay/New_Player_Guide.md
- Line 193: "6 additional factions" note - verify canonical count (should be 7 total)
- Line 379: "Scouts/Support (Wayfarers)" → "Scouts/Support (Roadborn)"
- Line 748: "Helix Syndicate" mention → DELETE (fake faction)

### Gameplay/Overview.md
- Line 74: SMG category check
- Line 223: "The Wayfarers | FCT_WAY" → "Roadborn | FCT_NOM"
- Line 240: "1x Wayfarers (Scout)" → "1x Roadborn (Scout)"

### Gameplay/Progression.md
- Line 136: "Scout/Mobility" diagram → verify reference
- Line 224: "3 additional factions" → verify canonical count
- Line 239: "The Wayfarers" → "Roadborn"

### Gameplay/Progression_Systems.md
- Line 196: "Deep Vault" unlock → "Black Vault"

### Gameplay/Squad_Mechanics.md
- Line 30: "The Wayfarers" diagram → "Roadborn"
- Line 57: "1x Scout/Mobility" → verify reference
- Line 65: "1x Scout - Wayfarers" → "1x Scout - Roadborn"
- Line 111: "Wayfarers +15%" → "Roadborn +15%"
- Line 140: "The Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 292: "Wayfarers scout" → "Roadborn scout"
- Line 306: "Wayfarers (Scout)" → "Roadborn (Scout)"
- Line 368: "Wayfarers (Scout)" → "Roadborn (Scout)"
- Line 384: "Wayfarers (Scout)" → "Roadborn (Scout)"
- Line 411: "Wayfarers" Mark → "Roadborn"
- Line 461: "Wayfarers" squad loss → "Roadborn"

### Gameplay/Stealth_Tactics.md
- Line 49: "Deep Vault" origin → "Black Vault"
- Line 335: "Archive + Wayfarers" → "Archive + Roadborn"
- Line 338: "Wayfarers +15%" → "Roadborn +15%"
- Line 414: "Deep Vault" link → "Black Vault"

### Gameplay/Weapons_And_Loadouts.md
- Line 64: SMG table check
- Line 135: SMG context check
- Line 161: "The Wayfarers - Pathfinder" → "Roadborn - Pathfinder"
- Line 493: "Wayfarers" stock → "Roadborn"

### Gameplay/Weather_Survival_Guide.md
- Line 24: "Wayfarers" faction → "Roadborn"
- Line 191: "Wayfarers heat resistance" → "Roadborn heat resistance"
- Line 293: "Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"
- Line 332: "Wayfarers faction" → "Roadborn faction"
- Line 449: "Wayfarers (FCT_WAY)" → "Roadborn (FCT_NOM)"

### Gameplay/World_Events.md
- Line 224: "1x Wayfarers" → "1x Roadborn"
- Line 230: "Deep Vault" drop → "Black Vault"

---

## Summary of Changes Needed

### Term Replacements:
| Old Term | New Term | Occurrences |
|----------|----------|-------------|
| Wayfarers | Roadborn | ~100+ |
| FCT_WAY | FCT_NOM | ~25 |
| Deep Vault | Black Vault | ~40 |
| Vault Lexicon | Obsidian Archive | 1 |
| Corporate Combine | Trivector Combine | 1 |

### Files to DELETE:
1. `Factions/Apex_Dynamics.md`
2. `Factions/Helix_Syndicate.md`
3. `Factions/North_Guard.md`
4. `Factions/Aegis_Collective.md` (or merge into Civic_Wardens.md)
5. `Factions/Wayfarers.md` (or rename/rewrite as Roadborn.md)

### Broken Links to Remove:
- All links to "Iron_Scavengers.md" (file doesn't exist)
- Links referencing fake factions (ApexDynamics, HelixSyndicate, NorthGuard, etc.)

---

## Canonical Faction Reference

Per BLOOM_GAME_BIBLE.md, the 7 canonical factions are:

| # | Display Name | Code |
|---|--------------|------|
| 1 | Directorate | FCT_DIR |
| 2 | Vultures / Iron Vultures | FCT_VUL |
| 3 | Wardens / Truce Wardens | FCT_WAR |
| 4 | SeventySeven / Free 77 | FCT_F77 |
| 5 | Pact of Ash | FCT_ASH |
| 6 | Roadborn / Nomad Clans | FCT_NOM |
| 7 | Archive / Obsidian Archive | FCT_VAR |

**NOT canonical (delete references):**
- ApexDynamics, GhostProtocol, RedCollective, NorthstarPMC
- ScavengerUnion, HelixSyndicate, NorthGuard
- Iron Scavengers, Aegis Collective (as standalone)
- Wayfarers (replaced by Roadborn)

---

*Report complete. Do NOT make changes - this documents what needs fixing.*
