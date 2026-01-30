# Bloom Lore Consistency Audit Report

**Audit Date:** 2025-01-28  
**Auditor:** Lore Consistency Subagent  
**Canonical Reference:** The 7 factions are Directorate, Vultures, Wardens, SeventySeven, PactOfAsh, Roadborn, Archive

---

## Executive Summary

This audit identified **23 inconsistencies** across the Bloom lore documentation, categorized as:
- **🔴 CRITICAL (5):** Fundamental contradictions that break canon
- **🟠 MAJOR (9):** Significant inconsistencies requiring resolution
- **🟡 MINOR (9):** Stylistic/naming variations that should be standardized

The most severe issues involve **faction list discrepancies**, **character name conflicts**, and **timeline contradictions** between the canonical Game Bible and supporting documents.

---

## Critical Issues (🔴)

### 1. FACTION LIST MISMATCH - Game Bible vs Canonical 7

**Severity:** 🔴 CRITICAL  
**Documents:** 
- `BLOOM_GAME_BIBLE.md` Section 5.1
- Provided canonical reference

**Conflict:**
- **Game Bible says 7 factions:** Directorate, Vultures, Seventy-Seven, **Helix Syndicate**, Roadborn, Obsidian Archive, Truce Wardens
- **Canonical 7 factions per instruction:** Directorate, Vultures, Wardens, SeventySeven, **PactOfAsh**, Roadborn, Archive

**Specific Discrepancy:**
- Game Bible includes `FCT_HLX - Helix Syndicate` but NOT `FCT_ASH - Pact of Ash`
- Canonical reference includes `PactOfAsh` but NOT `Helix Syndicate`

**Recommended Resolution:**
Either update BLOOM_GAME_BIBLE.md to replace Helix Syndicate with Pact of Ash, OR clarify which document is the true source of truth. The Pact of Ash appears in Wiki/Lore/Lore_Bible.md as FCT_ASH but is absent from the main Game Bible's 7-faction launch list.

---

### 2. MARSHAL VARGAS - FIRST NAME CONFLICT

**Severity:** 🔴 CRITICAL  
**Documents:**
- `BLOOM_GAME_BIBLE.md` Section 6.1 → "CHR_ALEXEI_VARGAS – Marshal Alexei Vargas"
- `FACTION_CHARACTER_PROFILES.md` → "Marshal Alexei Vargas"
- `Wiki/Lore/Characters.md` → "CHR_ADELE_VARGAS - Marshal of the Northern Districts" / "Adele Vargas"

**Conflict:**
The Directorate leader is named **"Alexei Vargas"** in the Game Bible and Character Profiles, but **"Adele Vargas"** in the Wiki. These are fundamentally different names (and genders) for the same canonical character.

**Recommended Resolution:**
Standardize on `CHR_ALEXEI_VARGAS` as this appears in the canonical Game Bible. Update Wiki/Lore/Characters.md to correct the name from "Adele" to "Alexei".

---

### 3. CASCADE TRIGGER TIME CONTRADICTION

**Severity:** 🔴 CRITICAL  
**Documents:**
- `BLOOM_GAME_BIBLE.md` Section 2.5
- `Wiki/Lore/Timeline_2147_2161.md`

**Conflict:**
- **Game Bible:** Primary Pulse (EVT_IEZ_CASCADE start) at **~09:47 UTC**
- **Wiki Timeline:** "2161-06-12, **14:37 Hours** — Monolith Excavation Trigger"

**Additional Confusion:**
The Game Bible says **14:37–14:41** was the Aurora Incident at The Cosmonaut, NOT the Cascade trigger. These are completely different events occurring nearly 5 hours apart.

**Recommended Resolution:**
Standardize the Cascade Primary Pulse to **09:47** per the Game Bible. The Wiki Timeline appears to have conflated the Cosmonaut incident time (14:37) with the Cascade trigger time.

---

### 4. HELIX SYNDICATE IDENTITY CRISIS

**Severity:** 🔴 CRITICAL  
**Documents:**
- `BLOOM_GAME_BIBLE.md` Section 5.5
- `Wiki/Lore/Lore_Bible.md` v2.0.0

**Conflict:**
- **Game Bible:** "Helix Syndicate (FCT_HLX) - **successor to Trivector Combine**"
- **Wiki Lore_Bible:** FCT_HLX is a "**Combine splinter faction** led by engineers who rejected profit-over-safety mandates"

But BOTH documents also list `FCT_CCB - Trivector Combine` as a separate entity:
- Game Bible Section 5.5: "Trivector Combine processes"
- Wiki Lore_Bible: FCT_CCB exists as a "lore-only faction"

**Question:** Is Helix a successor (meaning Combine no longer exists) or a splinter (meaning both exist)?

**Recommended Resolution:**
Clarify the relationship. If Helix is a true successor, remove FCT_CCB from active faction lists. If they coexist, clarify Helix as a splinter. The current text contradicts itself.

---

### 5. SABLE KHAN vs YARA IDENTITY CONFUSION

**Severity:** 🔴 CRITICAL  
**Documents:**
- `BLOOM_GAME_BIBLE.md` Section 6.1
- `FACTION_CHARACTER_PROFILES.md` Section 6 header
- `Wiki/Lore/Characters.md`

**Conflict:**
The Roadborn leader has conflicting names:
- Game Bible: "Road Mother Sable Khan (CHR_SABLE_KHAN, FCT_NOM)"
- Wiki: "CHR_SABLE_KHAN - Road Mother of the Ashway"
- FACTION_CHARACTER_PROFILES.md header: "Road Sable Khan **Yara**"
- Same document body: "Yara doesn't have a permanent address..." (describing the character as "Yara")

**Question:** Is the character named "Sable Khan" or "Yara"? Or is it "Sable Khan Yara" (full name)?

**Recommended Resolution:**
Standardize as either:
- "Sable Khan" (with "Yara" deprecated), OR
- "Yara Khan" (with "Sable" as a title/honorific meaning "Road Mother"), OR  
- Clarify naming convention (e.g., "Khan" is a Roadborn title, "Sable Yara" is the name)

---

## Major Issues (🟠)

### 6. WIKI LORE_BIBLE 10 FACTIONS vs GAME BIBLE 7 FACTIONS

**Severity:** 🟠 MAJOR  
**Documents:**
- `BLOOM_GAME_BIBLE.md` Section 5.1
- `Wiki/Lore/Lore_Bible.md` v2.0.0

**Conflict:**
- Game Bible lists **7 primary factions** at EA launch
- Wiki Lore_Bible v2.0.0 lists **10 playable factions** + 3 lore-only factions

The Wiki adds:
- FCT_AEG (Aegis Collective) - Healer/Support
- FCT_HLX (Helix Syndicate) - Tech/Engineer  
- FCT_NGD (North Guard) - Anti-Forged
- FCT_ASH (Pact of Ash) - Defender/Supplier
- FCT_APX (Apex Dynamics) - Elite Hunter
- FCT_NOM (Roadborn/Wayfarer) - Scout/Mobility

**Recommended Resolution:**
Determine if the Game Bible needs updating to v2.0.0 canon, or if Wiki Lore_Bible is ahead of approved canon. The changelog note says "2025-11-02: MAJOR EXPANSION - 10 Playable Factions Canon Integration" but this hasn't propagated to the main Game Bible.

---

### 7. IXZ vs IEZ TERMINOLOGY INCONSISTENCY

**Severity:** 🟠 MAJOR  
**Documents:**
- `BLOOM_GAME_BIBLE.md` (uses "IXZ" extensively)
- `RETCON_NOTES_2025_08_28.md` (says use "IEZ")
- All Wiki documents (use "IEZ")

**Conflict:**
- RETCON_NOTES: "Primary display 'Dead Sky (IEZ)'; in tech notes 'IEZ' acceptable; avoid 'Industrial Exclusion Zone'"
- Game Bible repeatedly uses "IXZ Core ('the Bloom')" and "IXZ" without explanation
- No document defines what "IXZ" stands for or how it differs from "IEZ"

**Recommended Resolution:**
Either:
1. Define IXZ (if intentional) in a glossary entry
2. Replace all IXZ with IEZ if this was a typo that propagated
3. Clarify if IXZ is a subset of IEZ (e.g., "IXZ Core" within "IEZ Dead Sky")

---

### 8. GREAT CONVOY WAR MISSING FROM GAME BIBLE

**Severity:** 🟠 MAJOR  
**Documents:**
- `Wiki/Lore/Timeline.md` (mentions "The Great Convoy War (2153-2155)")
- `BLOOM_GAME_BIBLE.md` Section 2 (does NOT mention this event)

**Conflict:**
The Wiki Timeline includes a major historical event that shaped Roadborn culture:
> "2153-2155: Massive conflict over trade route control... Modern convoy protection protocols established... 'The Road Endures' slogan originates from this conflict."

This formative event is absent from the canonical Game Bible timeline.

**Recommended Resolution:**
Either add "EVT_CONVOY_WAR" to Game Bible Section 2.3, or deprecate this Wiki content as non-canonical.

---

### 9. BLACK VAULT INCIDENT (2149) NOT IN GAME BIBLE

**Severity:** 🟠 MAJOR  
**Documents:**
- `Wiki/Lore/Timeline.md` (mentions "The Black Vault Incident (2149)")
- `BLOOM_GAME_BIBLE.md` (does not mention this 2149 event)

**Conflict:**
Wiki describes a major event 2 years after First Contact:
> "First major containment breach at Harvester artifact research facility... Formation of Archive containment specialists (precursor to Obsidian Archive faction)... First documented psychotropic resonance cases"

This event is foundational to Archive lore but missing from the Game Bible.

**Recommended Resolution:**
Add to Game Bible Section 2.3 as "EVT_VAULT_INCIDENT" or clarify if this is deprecated lore.

---

### 10. HELENA ROOK BACKSTORY INCONSISTENCY

**Severity:** 🟠 MAJOR  
**Documents:**
- `FACTION_CHARACTER_PROFILES.md` - Helena Rook section

**Conflict:**
Within the same document:
1. Quote: "haunted by losing her daughter Emma in the Cascade"
2. Separate detail: "A faint scar runs from her right temple to jawline—shrapnel from a drone strike in '59 that killed her entire signals team"

**Question:** Did she lose her daughter to the Cascade (2161) or a drone strike (2159)? Is Emma related to the signals team death?

**Recommended Resolution:**
Clarify the timeline of her personal losses. If daughter died in Cascade and team died in '59, state both clearly. Current text implies the scar and daughter-loss may be related.

---

### 11. TRIVECTOR COMBINE vs HELIX - BOTH LISTED AS ACTIVE

**Severity:** 🟠 MAJOR  
**Documents:**
- `Wiki/Lore/Factions_Flavor.md` (lists FCT_CCB Trivector Combine)
- `Wiki/Lore/Lore_Bible.md` (lists FCT_HLX Helix Syndicate AND FCT_CCB as lore-only)
- `BLOOM_GAME_BIBLE.md` (lists Helix as "successor to Trivector Combine")

**Conflict:**
If Helix is the "successor" to Combine, why does Combine still exist in faction matrices? The relationships show:
- FCT_HLX is "Hostile to Combine"
- But how can you be hostile to an organization you succeeded?

**Recommended Resolution:**
Define relationship clearly:
- Option A: Combine is defunct; Helix succeeded it. Remove FCT_CCB from active docs.
- Option B: Helix split from Combine; both exist. Change "successor" to "splinter" in Game Bible.

---

### 12. CIVIC WARDENS vs TRUCE WARDENS NAMING

**Severity:** 🟠 MAJOR  
**Documents:**
- `Docs/Lore/LoreBook/factions/FCT_CWD_Civic_Wardens.md` (filename)
- Same file content: "title: Truce Wardens"
- `FACTION_CHARACTER_PROFILES.md` Section 3 header: "Civic Wardens (Humanitarian Medic)"
- Same document content: "Truce Wardens" throughout

**Conflict:**
Inconsistent usage of "Civic Wardens" (file names, some headers) vs "Truce Wardens" (content, canonical name).

**Recommended Resolution:**
Standardize on "Truce Wardens" per BLOOM_GAME_BIBLE.md (FCT_CWD). Rename the LoreBook file to `FCT_CWD_Truce_Wardens.md`.

---

### 13. NOMAD CLANS vs ROADBORN vs WAYFARER

**Severity:** 🟠 MAJOR  
**Documents:**
- `Docs/Lore/LoreBook/factions/FCT_NOM_Nomad_Clans.md` (filename says "Nomad Clans")
- Same file content: "title: Roadborn Clans"
- `BLOOM_GAME_BIBLE.md`: "Roadborn (FCT_NOM)"
- Section 5.6 mentions "Wayfarer routes (traced from old Roadborn codices)"

**Conflict:**
Three different names used for the same faction:
1. "Nomad Clans" (file naming)
2. "Roadborn Clans" or "Roadborn" (canonical)
3. "Wayfarer" (mentioned as related concept)

**Recommended Resolution:**
Standardize on "Roadborn" per Game Bible. Clarify if "Wayfarer" is a sub-group or deprecated term. Rename LoreBook file to `FCT_NOM_Roadborn.md`.

---

### 14. NEW PLAYABLE FACTION LEADERS NOT IN GAME BIBLE

**Severity:** 🟠 MAJOR  
**Documents:**
- `Wiki/Lore/Lore_Bible.md` v2.0.0 Characters section
- `BLOOM_GAME_BIBLE.md` Section 6.1

**Conflict:**
Wiki Lore_Bible v2.0.0 added 6 new canonical leaders:
- CHR_MIRA_CHEN (Aegis Collective)
- CHR_GABRIEL_TORRES (Helix Syndicate)
- CHR_ELENA_VOSS (Roadborn)
- CHR_VIKTOR_PETROV (North Guard)
- CHR_YARA_OSMAN (Pact of Ash)
- CHR_KARA_VEX (Apex Dynamics)

None of these appear in the main Game Bible character list.

**Recommended Resolution:**
If these characters are canonical (per Wiki v2.0.0), add them to BLOOM_GAME_BIBLE.md Section 6. If not yet approved, mark them as "proposed" in Wiki.

---

## Minor Issues (🟡)

### 15. "BLACK VAULT" DUPLICATE ALIAS

**Severity:** 🟡 MINOR  
**Documents:**
- `RETCON_NOTES_2025_08_28.md`

**Issue:**
> "Black Vault ↔ Black Vault: REG_BLACK_VAULT is canonical ID; primary display 'Black Vault'; alias 'Black Vault'"

The alias is the same as the primary display, making this entry meaningless.

**Recommended Resolution:**
Remove duplicate alias or clarify if there was intended to be a different alias (e.g., "Obsidian Vault", "The Vault", etc.).

---

### 16. DOCTOR IVEY CHARACTER ID INCONSISTENCY

**Severity:** 🟡 MINOR  
**Documents:**
- `BLOOM_GAME_BIBLE.md` Section 6.1: "CHR_DOCTOR_IVEY (Dr. Reyna Ivey)"
- `Wiki/Lore/Characters.md`: "CHR_DOCTOR_IVEY - Vault Lexicographer"
- `FACTION_CHARACTER_PROFILES.md`: "Dr. Reyna Ivey - Character Profile"

**Issue:**
The character ID uses "DOCTOR" but her actual title is "Dr." - minor but creates search/reference confusion.

**Recommended Resolution:**
Consider standardizing to either `CHR_REYNA_IVEY` or keep `CHR_DOCTOR_IVEY` but document that "DOCTOR" is part of the ID, not the title.

---

### 17. KAEL TAMSIN vs ABSENT PACT OF ASH

**Severity:** 🟡 MINOR  
**Documents:**
- `FACTION_CHARACTER_PROFILES.md` Section 5: Full profile for "Harvest Speaker Kael Tamsin"
- `BLOOM_GAME_BIBLE.md`: No Pact of Ash faction, no Kael Tamsin character

**Issue:**
A detailed character exists for a faction that isn't in the Game Bible's 7-faction list.

**Recommended Resolution:**
If Pact of Ash is canonical (per instruction), add both the faction and Kael Tamsin to the Game Bible.

---

### 18. THE SILENCE (2158) EVENT MISSING

**Severity:** 🟡 MINOR  
**Documents:**
- `Wiki/Lore/Timeline.md` (describes "The Silence (2158)")
- `BLOOM_GAME_BIBLE.md` (not mentioned)

**Issue:**
Wiki describes a three-month communication blackout that established Warden toll gate network, but this isn't in the Game Bible.

**Recommended Resolution:**
Add as background event if canonical, or mark as deprecated in Wiki.

---

### 19. HANDLER "PACT OF ASH" KAEL TAMSIN NOT IN HANDLER LIST

**Severity:** 🟡 MINOR  
**Documents:**
- `FACTION_CHARACTER_PROFILES.md` handler section

**Issue:**
The Handler section lists 7 handlers but there's no dedicated handler for Pact of Ash. The document header says "Kael Tamsin – Pact of Ash" but in the handler matrix, Pact of Ash isn't listed. Instead Eli Zhou/Combine has a handler (PD-43 Wei) for a faction that should be replaced by Helix.

**Recommended Resolution:**
Add Pact of Ash handler if faction is canonical. Remove Combine handler if Helix replaced it.

---

### 20. INCONSISTENT EVENT CODE FORMATTING

**Severity:** 🟡 MINOR  
**Documents:**
- Various (EVT_FIRST_CONTACT vs EVT_IEZ_CASCADE formatting)

**Issue:**
Some events use underscores (EVT_IEZ_CASCADE), some docs reference them without underscores, and the Game Bible uses both formats inconsistently.

**Recommended Resolution:**
Standardize all event codes to `EVT_UPPERCASE_UNDERSCORES` format.

---

### 21. JAX KORDER SIGNALS BACKGROUND CONFLICT

**Severity:** 🟡 MINOR  
**Documents:**
- `BLOOM_GAME_BIBLE.md`: "Former signals NCO"
- `FACTION_CHARACTER_PROFILES.md`: "signals NCO in the Reconstruction Accord's 7th Recon"
- `Wiki/Lore/Characters.md`: "Former signals NCO (Directorate deserter or discharge)"

**Issue:**
Wiki hedges on whether Korder is a deserter or honorably discharged. Game Bible and Profiles don't mention this ambiguity.

**Recommended Resolution:**
Canonize one backstory: deserter, discharge, or intentionally ambiguous (and state that clearly).

---

### 22. ROAD MOTHER vs KHAN TITLE USAGE

**Severity:** 🟡 MINOR  
**Documents:**
- `BLOOM_GAME_BIBLE.md`: "Road Mother Sable Khan"
- `FACTION_CHARACTER_PROFILES.md`: "Road Sable Khan Yara" (header format)

**Issue:**
"Road Mother" and "Khan" both appear to be titles, but usage is inconsistent. Is she:
- "Road Mother Sable Khan" (two titles?)
- "Road Khan Yara" (title + name?)
- Something else?

**Recommended Resolution:**
Clarify Roadborn naming conventions in Game Bible glossary. Define whether "Khan" is a title or surname.

---

### 23. MISSING OBSIDIAN ARCHIVE LEADERSHIP

**Severity:** 🟡 MINOR  
**Documents:**
- `Wiki/Lore/Characters.md`: "Unknown Leadership (Archive command structure remains secret)"
- `BLOOM_GAME_BIBLE.md`: Lists Dr. Ivey as Lexicographer but not as overall leader

**Issue:**
Unlike other factions, Archive has no named leader. Dr. Ivey is described as a researcher, not the faction head.

**Recommended Resolution:**
Either designate Dr. Ivey as de facto leader, or create a new leader character, or clarify that Archive intentionally has no single leader (council structure?).

---

## Cross-Reference Matrix

| Issue # | Primary Doc | Conflicting Doc(s) | Resolution Priority |
|---------|-------------|-------------------|---------------------|
| 1 | Game Bible | Canonical instruction | 🔴 CRITICAL |
| 2 | Game Bible | Wiki Characters | 🔴 CRITICAL |
| 3 | Game Bible | Wiki Timeline | 🔴 CRITICAL |
| 4 | Game Bible | Wiki Lore_Bible | 🔴 CRITICAL |
| 5 | Game Bible | Character Profiles | 🔴 CRITICAL |
| 6 | Game Bible | Wiki Lore_Bible | 🟠 MAJOR |
| 7 | Game Bible | Retcon Notes, Wiki | 🟠 MAJOR |
| 8 | Wiki Timeline | Game Bible (missing) | 🟠 MAJOR |
| 9 | Wiki Timeline | Game Bible (missing) | 🟠 MAJOR |
| 10 | Character Profiles | Internal conflict | 🟠 MAJOR |
| 11 | Multiple | Multiple | 🟠 MAJOR |
| 12 | LoreBook | Game Bible | 🟠 MAJOR |
| 13 | LoreBook | Game Bible | 🟠 MAJOR |
| 14 | Wiki Lore_Bible | Game Bible (missing) | 🟠 MAJOR |
| 15 | Retcon Notes | N/A | 🟡 MINOR |
| 16 | Multiple | N/A | 🟡 MINOR |
| 17 | Character Profiles | Game Bible (missing) | 🟡 MINOR |
| 18 | Wiki Timeline | Game Bible (missing) | 🟡 MINOR |
| 19 | Character Profiles | Internal | 🟡 MINOR |
| 20 | Multiple | Formatting | 🟡 MINOR |
| 21 | Wiki Characters | Game Bible, Profiles | 🟡 MINOR |
| 22 | Multiple | Naming convention | 🟡 MINOR |
| 23 | Wiki | Game Bible | 🟡 MINOR |

---

## Recommended Canonical Resolutions

### Immediate Actions (Critical Issues)

1. **Faction List:** Decide if the 7 EA factions are:
   - Directorate, Vultures, Wardens, SeventySeven, **PactOfAsh**, Roadborn, Archive (per instruction)
   - OR the Game Bible's current list with Helix instead of Pact of Ash
   
2. **Marshal Vargas:** Standardize name to `Alexei Vargas` (Game Bible canon) and update Wiki

3. **Cascade Time:** Standardize Primary Pulse to `09:47 UTC` per Game Bible; Wiki's 14:37 is the Cosmonaut incident

4. **Helix/Combine:** Clarify as splinter (both exist) rather than successor (one replaced other)

5. **Sable Khan:** Establish canonical full name and naming convention

### Short-Term Actions (Major Issues)

6. Synchronize Wiki Lore_Bible v2.0.0 faction expansion with Game Bible
7. Define IXZ vs IEZ terminology in glossary
8. Add missing historical events (Great Convoy War, Black Vault Incident) to Game Bible or deprecate from Wiki
9. Resolve Civic Wardens vs Truce Wardens naming

### Long-Term Actions (Minor Issues)

10. Standardize all character IDs, event codes, and faction file naming
11. Complete handler roster for all 7 canonical factions
12. Document Roadborn naming conventions (Khan, Road Mother, etc.)

---

## Audit Methodology

**Documents Reviewed:**
- `Docs/Lore/BLOOM_GAME_BIBLE.md` (canonical source of truth)
- `Docs/Lore/10_YEAR_NARRATIVE_ROADMAP.md`
- `Docs/Lore/FACTION_CHARACTER_PROFILES.md`
- `Docs/Lore/RETCON_NOTES_2025_08_28.md`
- `Docs/Lore/LEGACY_DOC_AUDIT.md`
- `Docs/Lore/DOC_DEPRECATION_MATRIX.md`
- `Docs/Lore/LoreBook/factions/*.md` (5 files)
- `Wiki/Lore/Timeline.md`
- `Wiki/Lore/Timeline_2147_2161.md`
- `Wiki/Lore/Lore_Bible.md`
- `Wiki/Lore/Factions_Flavor.md`
- `Wiki/Lore/Characters.md`

**Canonical Hierarchy Applied:**
Per BLOOM_GAME_BIBLE.md Section 0: "When in doubt: this file > LORE_BIBLE.md > design/analysis docs > flavor pieces"

---

*Report generated by Lore Consistency Auditor subagent*
