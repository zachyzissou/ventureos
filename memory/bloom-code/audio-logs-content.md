# Audio Logs Content - Bloom Narrative System

**Created**: 2026-01-28  
**Status**: Placeholder assets created, awaiting voice recording  
**Source Scripts**: `Bloom/Docs/Narrative/AudioLogScripts/`

---

## Summary

Created the `AudioLogDefinition` ScriptableObject system and placeholder assets for all 16 audio log scripts from the design docs. The AudioLogService framework was already implemented; this work provides the content data the system needs.

---

## Files Created

### Code
- `Assets/Scripts/Narrative/AudioLogs/AudioLogDefinition.cs` - ScriptableObject definition
- `Assets/Scripts/Narrative/AudioLogs/AudioLogDefinition.cs.meta` - Unity meta file (GUID: 8a7b5c6d4e3f2a1b0c9d8e7f6a5b4c3d)

### Asset Directories
- `Assets/Data/AudioLogs/` - Root folder for audio log assets
  - `Directorate/` - Sky Bastion Directorate faction logs (4)
  - `Vultures/` - Iron Vultures faction logs (4)
  - `Wardens/` - Truce Wardens faction logs (4)
  - `SeventySeven/` - The Seventy-Seven faction logs (3)
  - `Headquarters/` - HQ/Special logs (1)

---

## Audio Log Assets (16 Total)

### Directorate (4 logs)
| ID | Speaker | Duration | Rep Req | Core Theme |
|----|---------|----------|---------|------------|
| DIR-02A | Marshal Vargas | 50s | 60 | Executes 12 deserters to save 12 children |
| DIR-03A | Signals Officer Chen | 35s | 40 | Chooses duty broadcast over finding family |
| DIR-04A | Field Medic Keyes | 40s | 50 | Triage math: 48 BLACK tags haunting |
| DIR-07A | Commander Liu | 42s | 70 | Evacuated 300, left 1700 to die |

### Iron Vultures (4 logs)
| ID | Speaker | Duration | Rep Req | Core Theme |
|----|---------|----------|---------|------------|
| VUL-01A | Rin Okafor | 48s | 30 | First corpse salvage, keeps photo as penance |
| VUL-03A | Crew Welder | 40s | 40 | Defining ethical salvage boundaries |
| VUL-04A | Market Vendor Tarps | 45s | 50 | Riot killed mother and child over 20 credits |
| VUL-07A | Vulture Raider Chain | 38s | 60 | Killed a kid for a teddy bear |

### Truce Wardens (4 logs)
| ID | Speaker | Duration | Rep Req | Core Theme |
|----|---------|----------|---------|------------|
| WAR-01A | Lupe Santos | 40s | 30 | Watching children die, choosing presence |
| WAR-02A | Medic Mercy | 38s | 45 | Morphine rationing: children get mercy |
| WAR-04A | Toll Keeper Anchor | 42s | 55 | Rules killed 3 children at toll gate |
| WAR-06A | Medic Hope | 50s | 75 | **SUICIDE** - Compassion fatigue ending |

### The Seventy-Seven (3 logs)
| ID | Speaker | Duration | Rep Req | Core Theme |
|----|---------|----------|---------|------------|
| F77-01A | Jax Korder | 40s | 30 | Honoring dead clients' contracts |
| F77-03A | Coordinator Ledger | 45s | 50 | Making 27k credits watching people die |
| F77-05A | Escort Lead | 35s | 60 | Failed refugee escort, child deaths |

### Headquarters (1 log)
| ID | Speaker | Duration | Rep Req | Core Theme |
|----|---------|----------|---------|------------|
| FHQ-01B | Helena Rook | 45s | 90 | **QUALITY BENCHMARK** - Mother chose 83 soldiers over daughter Emma |

---

## AudioLogDefinition Fields

```csharp
// Identification
string logId;           // e.g., "DIR-02A"
string displayName;     // e.g., "Marshal Vargas - Quietus Authorization"
string subtitle;        // e.g., "August 15, 2161, 09:30"

// Speaker
string speakerName;     // e.g., "Marshal Alexei Vargas"
string speakerRole;     // e.g., "Directorate Northern Command"
string voiceCasting;    // e.g., "Viggo Mortensen energy"

// Faction & Location
FactionType faction;    // Directorate/Vultures/Wardens/SeventySeven
string recordingLocation;
string recordingDateTime;

// Audio Content
AudioClip audioClip;    // null until recorded
float targetDuration;   // 30-60s typical
string scriptText;      // Full transcript for subtitles

// Emotional Design
AudioLogEmotionalArc emotionalArc;  // 4-phase BioShock arc
string emotionalTone;               // e.g., "Stoic -> cracking -> dissociation"
string coreLine;                    // Most impactful line

// Unlock Requirements
int requiredReputation; // 0-100 faction rep
string requiredPOI;     // Optional POI prerequisite
string requiredQuest;   // Optional quest prerequisite

// Integration
string linkedTableauId; // Associated skeletal tableau
string foundAtPOI;      // Where log is discovered
string codexEntryId;    // Unlocks codex entry

// Content Warnings (Flags)
AudioLogContentWarning contentWarnings;
// - Violence, Death, ChildDeath, Suicide, MedicalTrauma, ExecutionViolence

// Production Status
bool scriptComplete;       // Script finalized
bool voiceRecorded;        // Voice acting done
bool soundDesignComplete;  // Ambience/SFX added
string productionNotes;
```

---

## Content Warning Notes

The following logs have sensitive content that must be handled ethically:

| Log | Warnings | Handling Notes |
|-----|----------|----------------|
| WAR-06A (Medic Hope) | Suicide | Shows compassion fatigue, NOT glorified |
| DIR-02A (Vargas) | ExecutionViolence, Death | Utilitarian horror, not sadism |
| VUL-07A (Chain) | ChildDeath, Violence | Player confronts moral line |
| VUL-04A (Tarps) | ChildDeath, Violence | Market violence consequence |
| F77-05A (Escort) | ChildDeath | Contract failure, not gratuitous |
| FHQ-01B (Helena) | ChildDeath | Environmental, off-screen |

---

## Integration Points

### With AudioLogService
The existing `AudioLogService.cs` plays logs via:
```csharp
PlayAudioLog(AudioClip clip, string logTitle, string logSubtitle, string logID)
```

AudioLogDefinition provides all this data. Trigger code should:
1. Load AudioLogDefinition asset
2. Check `CanUnlock(playerReputation)`
3. If unlocked, call `audioLogService.PlayAudioLog(def.audioClip, def.displayName, def.subtitle, def.logId)`

### With Skeletal Tableaus
Each log has a `linkedTableauId` for environmental storytelling synergy:
- Player finds log → Hears character perspective
- Player finds tableau → Sees physical evidence
- Combined = BioShock Rapture-level narrative depth

### With Codex System
Each log unlocks a `codexEntryId` when discovered, adding to player's collected lore.

---

## Production Pipeline (From Design Docs)

### Month 4 - Voice Recording
- Cast 4 voice actors (1 per faction archetype)
- Record 16 logs (2-3 takes each, ~8 hours total)
- Target casting:
  - Directorate: Viggo Mortensen / Ken Watanabe range
  - Vultures: Rosario Dawson / Michael B. Jordan
  - Wardens: Michelle Rodriguez / Mahershala Ali
  - Seventy-Seven: Oscar Isaac / Idris Elba / Chiwetel Ejiofor

### Month 5 - Sound Design
- Add environmental ambience (40 SFX per log average)
- Mix 3 layers (voice, ambience, key SFX)
- Integrate into Unity (Addressables, spatial 3D audio)

### Month 6 - QA & Launch
- Player testing (emotional impact verification)
- Final QA, EA launch deployment

---

## Source Documentation

Full scripts with voice acting direction, sound design specs, and emotional arc details are in:
- `Bloom/Docs/Narrative/AudioLogScripts/AUDIO_LOG_SUMMARY.md`
- `Bloom/Docs/Narrative/AudioLogScripts/[LOG-ID]_[Name].md` (16 files)

---

## Next Steps

1. **Unity Import** - Open Unity, let it import the new assets
2. **Verify References** - Check that AudioLogDefinition script links to assets
3. **Create Registry** - Consider an AudioLogDefinitionRegistry for runtime lookup
4. **Trigger System** - Implement unlock triggers at POI locations
5. **Voice Recording** - When ready, assign AudioClip references

---

*Total Duration: 615 seconds (10 minutes 15 seconds of narrative content)*  
*Quality Benchmark: Helena Rook (FHQ-01B) - BioShock Rapture level character depth*
