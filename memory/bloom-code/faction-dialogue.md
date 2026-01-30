# Faction Dialogue Framework - Summary

**Created**: 2025-01-28
**Status**: Templates Complete (4/8 Factions)

---

## Dialogue System Overview

### Location
```
Assets/Scripts/Narrative/Dialogue/
├── DialogueDefinition.cs    # ScriptableObject container
├── DialogueLine.cs          # Individual line data
├── DialogueLineType.cs      # Line type enum
├── DialogueService.cs       # Playback manager
└── IDialogueService.cs      # Interface
```

### Key Schema (DialogueDefinition)
| Field | Type | Purpose |
|-------|------|---------|
| `dialogueId` | string | Unique ID (e.g., "DIR_ROOK_GREET_FIRST") |
| `handlerId` | string | Speaker reference |
| `faction` | FactionType | Faction association |
| `triggerType` | DialogueTriggerType | What triggers dialogue |
| `priority` | DialoguePriority | Interrupt handling |
| `lines` | List<DialogueLine> | Actual dialogue content |
| `requiredReputation` | int | Reputation gate (0-1000) |
| `variations` | string[] | Random variation IDs |
| `firstTimeDialogueId` | string | Override for first encounter |
| `repeatDialogueId` | string | Override for return visits |

### Line Length Limits (ENFORCED)
| Type | Max Chars | Use Case |
|------|-----------|----------|
| MissionBriefing | 80 | Quest briefings |
| MissionUpdate | 60 | Mid-mission radio |
| MissionComplete | 100 | Success acknowledgment |
| WorldCommentary | 50 | Ambient chatter |
| Standard | 100 | General dialogue |

### Trigger Types
- `Manual` - Scripted/event trigger
- `OnInteract` - Player interaction
- `OnAreaEnter` - Location-based
- `OnQuestStart/Complete/Failed` - Quest events
- `OnReputationChange` - Rep threshold crossed
- `AmbientRandom` - Random ambient lines

---

## Templates Created

### 1. Sky Bastion Directorate (DIR)
**Handler**: Helena Rook (Signals Adjutant)
**Tone**: Military precision, efficient, protective beneath professional mask
**File**: `Dialogue Templates/DIR_Directorate_Dialogues.md`

**Dialogue Types Created**:
- ✅ Greeting (First, Low/Mid/High Rep)
- ✅ Trade (Open, High Rep, Purchase, No Funds)
- ✅ Quest Offer (Standard, Priority)
- ✅ Quest Accept/Decline
- ✅ Reputation-gated (Hostile, Neutral, Allied)
- ✅ World Commentary
- ✅ Emotional Beat (Late Night confession)

### 2. Iron Vultures (VUL)
**Handler**: Mako "Slipway" Kade (Dockside Fixer)
**Tone**: Street-smart, hustler energy, transactional but genuine
**File**: `Dialogue Templates/VUL_IronVultures_Dialogues.md`

**Dialogue Types Created**:
- ✅ Greeting (First, Low/Mid/High Rep)
- ✅ Trade (Open, High Rep, Purchase, Great Deal, No Funds)
- ✅ Quest Offer (Standard, High-Risk Ghost Bid)
- ✅ Quest Accept/Decline
- ✅ Reputation-gated (Hostile, Neutral, Allied)
- ✅ World Commentary
- ✅ Emotional Beat (Orphan backstory)

### 3. Truce Wardens (WAR)
**Handler**: Bram "Verdict" Hale (Gate Caller)
**Tone**: Weary idealism, protective, humanitarian exhaustion
**File**: `Dialogue Templates/WAR_TruceWardens_Dialogues.md`

**Dialogue Types Created**:
- ✅ Greeting (First, Low/Mid/High Rep)
- ✅ Trade (Open, High Rep, Purchase, No Funds)
- ✅ Quest Offer (Standard Supply Run, Emergency Evacuation)
- ✅ Quest Accept/Decline
- ✅ Reputation-gated (Hostile, Neutral, Allied)
- ✅ World Commentary
- ✅ Emotional Beat (Night watch exhaustion)

### 4. The Seventy-Seven (F77)
**Handler**: Sera "Ledger" Venn (Operations Broker)
**Tone**: Corporate precision, contract-focused, hidden humanity
**File**: `Dialogue Templates/F77_SeventySeven_Dialogues.md`

**Dialogue Types Created**:
- ✅ Greeting (First, Low/Mid/High Rep)
- ✅ Trade (Open, High Rep, Purchase, No Funds)
- ✅ Quest Offer (Standard Contract, Executive Tier)
- ✅ Quest Accept/Decline
- ✅ Reputation-gated (Hostile, Neutral, Allied)
- ✅ World Commentary
- ✅ Emotional Beat (Father's death confession)

---

## Remaining Factions (Post-Launch)

| Faction | Handler | Status |
|---------|---------|--------|
| Pact of Ash (FCT_ASH) | TBD | Not started |
| Roadborn Clans (FCT_NOM) | Ive "Marker" Ravel | Not started |
| Obsidian Archive (FCT_VAR) | Lila "Cant" Moroz | Not started |
| Helix Combine (FCT_CCB) | PD-43 "Hyacinth" Wei | Not started |

---

## ID Naming Convention

```
{FACTION}_{HANDLER}_{TYPE}_{VARIANT}

Examples:
- DIR_ROOK_GREET_FIRST      (Directorate, Rook, Greeting, First meeting)
- VUL_MAKO_QUEST_OFFER_01   (Vultures, Mako, Quest Offer, #01)
- WAR_HALE_EMOTIONAL_01     (Wardens, Hale, Emotional Beat, #01)
- F77_SERA_TRADE_OPEN_HIGH  (Seventy-Seven, Sera, Trade Open, High rep)
```

---

## Implementation Notes

### Creating DialogueDefinition Assets
1. Right-click in Project window
2. Create > Bloom > Narrative > Dialogue Definition
3. Fill in fields per template YAML
4. Register with DialogueService at bootstrap

### Triggering Dialogue
```csharp
// Via service
var dialogueService = ServiceLocator.Instance.GetService<IDialogueService>();
dialogueService.PlayDialogue("DIR_ROOK_GREET_FIRST");

// Check reputation for gating
var playerRep = reputationService.GetReputation(FactionType.Directorate);
if (playerRep >= 300) {
    dialogueService.PlayDialogue("DIR_ROOK_GREET_HIGH");
} else if (playerRep >= 100) {
    dialogueService.PlayDialogue("DIR_ROOK_GREET_MID");
} else {
    dialogueService.PlayDialogue("DIR_ROOK_GREET_LOW");
}
```

### Existing Dialogue Content
- `HANDLER_CHECKIN_DIALOGUE.md` - 28 mid-mission lines (all 7 factions)
- `MISSION_BRIEFING_DIALOGUE.md` - Mission briefing scripts
- `FACTION_BANTER_DIALOGUE.md` - Inter-faction commentary

---

## Related Files

| File | Location |
|------|----------|
| Dialogue System Code | `Assets/Scripts/Narrative/Dialogue/` |
| Handler Profiles | `Docs/Design/Faction_Leaders_And_Handlers.md` |
| Character Profiles | `Docs/Lore/FACTION_CHARACTER_PROFILES.md` |
| Handler Check-ins | `Docs/Lore/HANDLER_CHECKIN_DIALOGUE.md` |
| Faction Lore | `Docs/Lore/Factions_Flavor.md` |
| Templates Output | `VaultZap/🔧 Projects/Bloom/Dialogue Templates/` |

---

## VALIDATION
- Output files: 4 dialogue templates ✓ exists
- Completeness: All 4 factions have full template sets
- Self-check: PASS (line lengths verified, IDs consistent)
- Confidence: HIGH

---

**Next Steps**:
1. Convert templates to DialogueDefinition assets in Unity
2. Implement NPC interaction triggers
3. Add reputation-based dialogue switching logic
4. Record placeholder audio for testing
5. Create templates for remaining 4 factions (post-launch)
