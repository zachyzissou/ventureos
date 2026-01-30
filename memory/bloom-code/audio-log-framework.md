# Bloom Audio Log Content Framework

**Created**: 2025-01-28
**Status**: Framework complete, 25/80 scripts written

---

## Summary

Audited and documented Bloom's audio log system. Created content pipeline for 80 planned logs.

### What Exists

**Scripts Written**: 25 total (was 15, added 10)
- **Directorate**: 6 scripts (DIR-02A through DIR-07A, FHQ-01B)
- **Iron Vultures**: 6 scripts (VUL-01A through VUL-07A)
- **Truce Wardens**: 6 scripts (WAR-01A through WAR-06A)
- **Seventy-Seven**: 5 scripts (F77-01A through F77-05A)
- **Obsidian Archive**: 2 scripts (ARC-01A, ARC-02A) ← NEW FACTION

**Code Infrastructure**:
- `AudioLogDefinition.cs` - ScriptableObject schema (complete)
- `AudioLogService.cs` - Playback service (exists)
- `IAudioLogService.cs` - Interface (exists)
- `FHQ01B_Trigger.cs` - Example trigger (exists)

**Locations**:
- Scripts: `Docs/Narrative/AudioLogScripts/` (game repo)
- New scripts: `Documents/VaultZap/🔧 Projects/Bloom/Audio Scripts/`
- Framework: `Docs/Design/FACTION_AUDIO_LOGS_FRAMEWORK.md`

### AudioLogDefinition Schema

```csharp
// Key fields from AudioLogDefinition.cs
public string logId;           // e.g., "FHQ-01B"
public string displayName;     // e.g., "Helena Rook - Personal Recording"
public string speakerName;     // e.g., "Helena Rook"
public string speakerRole;     // e.g., "Directorate Handler"
public FactionType faction;    // Directorate, Vultures, Wardens, etc.
public AudioClip audioClip;    // null until recorded
public float targetDuration;   // 30-60 seconds typical
public string scriptText;      // Full script for subtitles
public AudioLogEmotionalArc emotionalArc;  // 4-phase BioShock arc
public int requiredReputation; // 0-100
public string linkedTableauId; // Skeletal Tableau integration
public AudioLogContentWarning contentWarnings; // Suicide, ChildDeath, etc.
public bool scriptComplete;
public bool voiceRecorded;
public bool soundDesignComplete;
```

### Discovery Triggers

| Type | Count | Mechanic |
|------|-------|----------|
| POI Discovery | 45 | Found at specific locations |
| Reputation Unlock | 20 | High faction loyalty rewards |
| Quest Progress | 10 | Story milestone triggers |
| Random/Hidden | 5 | Rare environmental finds |

---

## New Scripts Created (10)

### Directorate (2)
1. **DIR-05A** - Scout Lt. Zhao: Monolith observation, cosmic dread, scouts walking toward structure
2. **DIR-06A** - Logistics Officer Park: Ration calculations, starving own daughter to save 812

### Iron Vultures (2)
1. **VUL-02A** - Scavenger Sawtooth: Harrower nest disaster, dark humor coping with crew deaths
2. **VUL-06A** - Tech Solder: Splice tech explosion, page forty-seven she skipped, three friends dead

### Truce Wardens (2)
1. **WAR-03A** - Doctor Graves: Cholera outbreak, children's graves, "small holes easier to dig"
2. **WAR-05A** - Defender Shield: Barricade victory, child's thank-you note, survivor's guilt

### Seventy-Seven (2)
1. **F77-02A** - Aid Worker Delivery: Neutrality violated, white flag didn't stop bullets
2. **F77-04A** - Operative Cipher: Mysterious client, Monolith fragments, "piece in a game I can't see"

### Obsidian Archive (2) - NEW FACTION
1. **ARC-01A** - Archivist Index: Deep Vault descent, ethical cost of knowledge, quiet complicity
2. **ARC-02A** - Dr. Lila Moss: Translation witness, watching Ivey upload, contamination question

---

## Quality Benchmark

All scripts follow **Helena Rook (FHQ-01B) template**:

### 4-Phase Emotional Arc
1. **Professional Facade** (0:00-0:15): Composed, efficient, in-control
2. **Emotional Crack** (0:15-0:30): Voice breaks, mask slips
3. **Vulnerable Truth** (0:30-0:45): Genuine emotion revealed
4. **Dissociation** (0:45-end): Retreat to ideology or quiet acceptance

### Faction Voice Guidelines
- **Directorate**: Military professionalism masking trauma
- **Vultures**: Working-class pragmatism with moral conflicts
- **Wardens**: Exhausted humanitarians, compassion under strain
- **Seventy-Seven**: Professional detachment, questioning pragmatism
- **Archive**: Academic obsession, knowledge-at-any-cost tension

---

## Production Pipeline

### Phase 1: Script Writing ✅ (Partially Complete)
- [x] Template established (Helena Rook)
- [x] 15 original EA scripts
- [x] 10 additional scripts (this session)
- [ ] 55 remaining scripts needed

### Phase 2: Voice Casting (Month 4-5)
- 8-10 voice actors needed
- Casting directions in each script
- Example: Viggo Mortensen energy (Directorate male)

### Phase 3: Recording (Month 5-6)
- ~60-80 studio hours total
- Multiple takes per log
- Target: 30-60 seconds per log

### Phase 4: Sound Design (Month 6-7)
- Environmental ambience per script
- Key SFX (gunshots, radio static, etc.)
- 3-layer mix (voice, ambience, SFX)

### Phase 5: Implementation (Month 7-8)
- Create AudioLogDefinition assets in Unity
- Place world triggers
- Codex integration
- QA testing

---

## File Locations

**Tracker**:
`C:\Users\Zachg\Documents\VaultZap\🔧 Projects\Bloom\Audio Log Tracker.md`

**New Scripts**:
`C:\Users\Zachg\Documents\VaultZap\🔧 Projects\Bloom\Audio Scripts\`
- DIR-05A_ScoutZhao.md
- DIR-06A_LogisticsOfficerPark.md
- VUL-02A_ScavengerSawtooth.md
- VUL-06A_TechSolder.md
- WAR-03A_DoctorGraves.md
- WAR-05A_DefenderShield.md
- F77-02A_AidWorkerDelivery.md
- F77-04A_OperativeCipher.md
- ARC-01A_ArchivistIndex.md
- ARC-02A_DrLilaMoss.md

**Existing Scripts** (game repo):
`C:\Users\Zachg\Development\Games\Bloom\Docs\Narrative\AudioLogScripts\`

**Framework Doc**:
`C:\Users\Zachg\Development\Games\Bloom\Docs\Design\FACTION_AUDIO_LOGS_FRAMEWORK.md`

---

## Next Steps

1. **Copy new scripts to game repo** (Docs/Narrative/AudioLogScripts/)
2. **Write remaining 55 scripts** (prioritize Pre-Cascade Civilian, Harvester categories)
3. **Create AudioLogDefinition assets** in Unity for completed scripts
4. **Begin voice actor casting** when script count reaches 50+
5. **Update tracker** as scripts complete

---

## Validation

- [x] Output files exist and are complete
- [x] All 10 scripts follow 4-phase emotional arc
- [x] Scripts include voice acting directions
- [x] Scripts include sound design requirements
- [x] Content warnings flagged appropriately
- [x] Tracker created with all 80 planned logs
- [x] Summary written

**Status**: SUCCESS
**Confidence**: HIGH
