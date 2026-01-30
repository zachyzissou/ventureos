# Bloom Lore Touchpoint Map
Generated: 2025-11-22

This document maps EVERY file in the Bloom project that references faction names, lore terms, or narrative content.
**Excluding `.worktrees/**` to avoid duplicates.**

---

## Summary Statistics

| Category | File Count |
|----------|-----------|
| **CANONICAL FACTIONS** | |
| Directorate/Sky Bastion/FCT_DIR | ~270 files |
| Vultures/Iron Vultures/FCT_VUL | ~210 files |
| Wardens/Truce Wardens/Civic Wardens | ~250 files |
| Nomads/Roadborn/FCT_NOM | ~180 files |
| Free 77/SeventySeven/FCT_F77 | ~170 files |
| Obsidian Archive/Vault Lexicon/FCT_VAR | ~160 files |
| **LORE TERMS** | |
| Harvester/Harrower/Skimmer | ~230 files |
| Monolith | ~230 files |
| IEZ/Dead Sky | ~250 files |
| Cascade | ~65 files |
| Black Vault/Deep Vault | ~95 files |
| **DEPRECATED TERMS** | |
| ⚠️ Apex Dynamics | ~55 files |
| ⚠️ Ghost Protocol | ~14 files |

---

## 🟢 CANONICAL FACTIONS

### 1. Directorate / Sky Bastion / FCT_DIR
**File Count:** ~270 files
**Status:** ✅ Primary canonical faction

**Code Files (.cs):**
- `Assets/Scripts/Narrative/FactionType.cs`
- `Assets/Scripts/Narrative/PlayerFactionService.cs`
- `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`
- `Assets/Scripts/WorldGeneration/DetailZones/FactionHubDetailZone.cs`
- `Assets/Scripts/WorldGeneration/DetailZones/GreyreachDistrictDetailZone.cs`
- `Assets/Scripts/WorldGeneration/Configuration/PeninsulaGridLayout.cs`
- `Assets/Scripts/WorldGeneration/POI/POIType.cs`
- `Assets/Scripts/WorldGeneration/POI/POIInstance.cs`
- `Assets/Scripts/WorldGeneration/POI/POIConfiguration.cs`
- `Assets/Scripts/WorldGeneration/Narrative/ProceduralNarrativeSystem.cs`
- `Assets/Scripts/UI/FactionSelectionUI.cs`
- `Assets/Scripts/Audio/PlayerCalloutSystem.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilitySystem.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilityEffects.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilityVFX.cs`
- `Assets/Scripts/Terrain/BiomeTerrainPreset.cs`
- `Assets/Scripts/Environment/Weather/ExtremeWeatherSystem.cs`
- `Assets/Scripts/Testing/Integration/ProgressionFactionIntegrationTests.cs`

**JSON/Config Files:**
- `Assets/Resources/Codex/Faction_Directorate.json`
- `Assets/Resources/Codex/Faction_TruceWardens.json` (references Directorate)
- `Assets/Resources/Codex/Technology_Helium3.json`
- `Assets/Resources/Codex/Technology_SpliceGrade.json`
- `Assets/Resources/Codex/Harvester_*.json` (multiple)
- `Assets/Resources/WorldGeneration/POIConfiguration.asset`

**Unity Assets:**
- `Assets/Environment/Biome Presets/BiomePreset_SnowPeaks.asset`
- `Assets/Prefabs/VFX/FactionAbilities/VFX_Directorate_DamageResistAura.prefab`

**Documentation:**
- `Docs/Lore/LoreBook/factions/FCT_DIR_Directorate.md`
- `Docs/Lore/LoreBook/regions/REG_SKY_BASTION.md`
- `Docs/Lore/LoreBook/characters/CHR_DIR_*.md`
- `Wiki/Factions/Directorate.md`
- `Wiki/Maps/Sky_Bastion.md`
- `Docs/Design/Faction_Conflict_Matrix.md`
- `Docs/Design/Faction_Leaders_And_Handlers.md`
- `Docs/Narrative/AudioLogScripts/DIR-*.md` (multiple)

---

### 2. Vultures / Iron Vultures / FCT_VUL
**File Count:** ~210 files
**Status:** ✅ Primary canonical faction

**Code Files (.cs):**
- `Assets/Scripts/Narrative/FactionType.cs`
- `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`
- `Assets/Scripts/WorldGeneration/DetailZones/FactionHubDetailZone.cs`
- `Assets/Scripts/WorldGeneration/DetailZones/GreyreachDistrictDetailZone.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilitySystem.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilityEffects.cs`

**JSON/Config Files:**
- `Assets/Resources/Codex/Faction_IronVultures.json`

**Unity Assets:**
- `Assets/Prefabs/VFX/FactionAbilities/VFX_Vultures_LootDetectionPulse.prefab`
- `Assets/Environment/Biome Presets/BiomePreset_EasternPlateaus.asset`

**Documentation:**
- `Docs/Lore/LoreBook/factions/FCT_VUL_Vultures_Union.md`
- `Docs/Lore/LoreBook/characters/CHR_VUL_Rig_Chief_Mase.md`
- `Wiki/Factions/Iron_Vultures.md`
- `Docs/Art/Factions/IronScavengers.md`
- `Docs/Narrative/AudioLogScripts/VUL-*.md` (multiple)

---

### 3. Wardens / Truce Wardens / Civic Wardens / FCT_WAR / FCT_CWD
**File Count:** ~250 files
**Status:** ✅ Primary canonical faction

**Code Files (.cs):**
- `Assets/Scripts/Narrative/FactionType.cs`
- `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`
- `Assets/Scripts/WorldGeneration/POI/POIType.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilitySystem.cs`
- `Assets/Scripts/Audio/PlayerCalloutSystem.cs`

**JSON/Config Files:**
- `Assets/Resources/Codex/Faction_TruceWardens.json`
- `Assets/Resources/Codex/Technology_Helium3.json`

**Unity Assets:**
- `Assets/Prefabs/VFX/FactionAbilities/VFX_Wardens_MedicalAura.prefab`
- `Assets/Prefabs/VFX/FactionAbilities/VFX_Wardens_HealingStation.prefab`
- `Assets/Environment/Biome Presets/BiomePreset_ForestHills.asset`

**Documentation:**
- `Docs/Lore/LoreBook/factions/FCT_CWD_Civic_Wardens.md`
- `Docs/Lore/LoreBook/characters/CHR_CWD_Gate_Captain_Alaia.md`
- `Wiki/Factions/Civic_Wardens.md`
- `Wiki/Systems/Truce_Gates.md`
- `Docs/Art/Factions/CivicWardens.md`
- `Docs/Narrative/AudioLogScripts/WAR-*.md` (multiple)

---

### 4. Nomads / Roadborn / Nomad Clans / FCT_NOM
**File Count:** ~180 files
**Status:** ✅ Primary canonical faction

**Code Files (.cs):**
- `Assets/Scripts/Narrative/FactionType.cs`
- `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`
- `Assets/Scripts/WorldGeneration/Roads/RoadType.cs`
- `Assets/Scripts/WorldGeneration/Configuration/BiomeType.cs`
- `Assets/Scripts/WorldGeneration/POI/POIType.cs`

**JSON/Config Files:**
- `Assets/Resources/Codex/Faction_RoadbornClans.json`
- `Assets/Resources/Codex/Phenomenon_TemporalJitter.json`

**Unity Assets:**
- `Assets/Environment/Biome Presets/BiomePreset_SouthwestPlains.asset`
- `Assets/Resources/WorldGeneration/POIConfiguration.asset`

**Documentation:**
- `Docs/Lore/LoreBook/factions/FCT_NOM_Nomad_Clans.md`
- `Docs/Lore/LoreBook/characters/CHR_NOM_RoadCaptain_Ora.md`
- `Wiki/Factions/Nomad_Clans.md`
- `Docs/Art/Factions/NomadClans.md`

---

### 5. Free 77 / SeventySeven / FCT_F77
**File Count:** ~170 files
**Status:** ✅ Primary canonical faction

**Code Files (.cs):**
- `Assets/Scripts/Narrative/FactionType.cs`
- `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilitySystem.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Factions/WeaponRestrictionSystem.cs`
- `Assets/Scripts/Editor/WorldGeneration/DetailZones/DetailZoneConfigWizard.cs`
- `Assets/Scripts/Terrain/BiomeTerrainPreset.cs`

**JSON/Config Files:**
- `Assets/Resources/Codex/Faction_SeventySeven.json`

**Unity Assets:**
- `Assets/Prefabs/VFX/FactionAbilities/VFX_SeventySeven_XPBoostAura.prefab`
- `Assets/Resources/WorldGeneration/DetailZones/FactionHub_SeventySeven_Profile.asset`

**Documentation:**
- `Docs/Lore/LoreBook/characters/CHR_F77_Handler_Six.md`
- `Wiki/Factions/Free77.md`
- `Wiki/Lore/Characters/Handler_Six.md`
- `Docs/Art/Factions/Free77.md`
- `Docs/Narrative/AudioLogScripts/F77-*.md`

---

### 6. Obsidian Archive / Vault Lexicon / FCT_VAR
**File Count:** ~160 files
**Status:** ✅ Primary canonical faction

**Code Files (.cs):**
- `Assets/Scripts/Narrative/FactionType.cs`
- `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`
- `Assets/Scripts/Narrative/CodexService.cs`

**JSON/Config Files:**
- `Assets/Resources/Codex/Faction_ObsidianArchive.json`
- `Assets/Resources/Codex/Harvester_Monolith.json`
- `Assets/Resources/Codex/Harvester_TemporalLattices.json`
- `Assets/Resources/Codex/Phenomenon_MonolithCompulsion.json`
- `Assets/Resources/Codex/Technology_Helium3.json`
- `Assets/Resources/Codex/Technology_SpliceGrade.json`

**Documentation:**
- `Docs/Lore/LoreBook/characters/CHR_VAR_Lexicographer_Meridian.md`
- `Docs/Lore/LoreBook/technology/TECH_ALN_HARMONIC_BEACON.md`
- `Wiki/Factions/Obsidian_Archive.md`
- `Wiki/Lore/Characters/Lexicographer_Meridian.md`

---

## 🟢 CANONICAL LORE TERMS

### Harvester / Harrower / Skimmer
**File Count:** ~230 files
**Status:** ✅ Core enemy/lore concept

**Key Code Files:**
- `Assets/Scripts/WorldGeneration/POI/POIType.cs`
- `Assets/Scripts/WorldGeneration/POI/POIDefinition.cs`
- `Assets/Scripts/WorldGeneration/Narrative/ProceduralNarrativeSystem.cs`
- `Assets/Scripts/Environment/PhaseDetectorSystem.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Progression/EnemyXPHandler.cs`
- `Assets/Scripts/Audio/PlayerCalloutSystem.cs`

**JSON/Config Files:**
- `Assets/Resources/Codex/Harvester_Monolith.json`
- `Assets/Resources/Codex/Harvester_Harrower.json`
- `Assets/Resources/Codex/Harvester_Skimmer.json`
- `Assets/Resources/Codex/Harvester_BiomechanicalAlloys.json`
- `Assets/Resources/Codex/Harvester_PhaseShiftedCores.json`
- `Assets/Resources/Codex/Harvester_TemporalLattices.json`
- `Assets/Resources/Codex/Hazard_HarvesterContamination.json`

---

### Monolith
**File Count:** ~230 files
**Status:** ✅ Core mysterious entity

**Key Files:**
- `Assets/Resources/Codex/Harvester_Monolith.json`
- `Assets/Resources/Codex/Phenomenon_MonolithCompulsion.json`
- `Docs/Lore/LoreBook/pois/POI_IEZ_MONOLITH_SHADE.md`
- `Assets/Scripts/WorldGeneration/POI/POIType.cs`
- `Assets/Scripts/Terrain/MacroFeatures/MacroFeatureType.cs`
- `Assets/Scripts/Terrain/MacroFeatures/MacroWorldGenerator.cs`

---

### IEZ / Industrial Exclusion Zone / Dead Sky
**File Count:** ~250 files
**Status:** ✅ Core world region

**Key Code Files:**
- `Assets/Scripts/WorldGeneration/Configuration/BiomeType.cs`
- `Assets/Scripts/WorldGeneration/Configuration/PeninsulaGridLayout.cs`
- `Assets/Scripts/Environment/Weather/ExtremeWeatherSystem.cs`
- `Assets/Scripts/Environment/Weather/WeatherFrontSystem.cs`
- `Assets/Scripts/Environment/Weather/IWeatherSystem.cs`
- `Assets/Scripts/Editor/CreateWeatherAssets.cs`
- `Assets/Scripts/Editor/CreateBiomeWeatherPresets.cs`
- `Assets/Scripts/Terrain/MacroFeatures/MacroFeatureType.cs`
- `Assets/Scripts/Narrative/CodexService.cs`
- `Assets/Scripts/UI/CodexUI.cs`

**Unity Assets:**
- `Assets/Environment/Weather Effects/WeatherEffect_IEZAnomaly.asset`
- `Assets/Environment/Biome Presets/BiomePreset_CentralGrasslands.asset`

**Documentation:**
- `Wiki/Maps/IEZ.md`
- `Wiki/Maps/DeadSky.md`
- `Wiki/Maps/DeadSky_Art.md`
- `Wiki/Maps/DeadSky_Implementation.md`
- `Wiki/Lore/IEZ_Phenomenon.md`
- `Docs/Lore/IEZ_BIOME_ENVIRONMENTAL_DESCRIPTIONS.md`
- `Docs/Lore/LoreBook/pois/POI_IEZ_*.md`

---

### Black Vault / Deep Vault
**File Count:** ~95 files
**Status:** ✅ Key mysterious location

**Key Files:**
- `Docs/Lore/LoreBook/regions/REG_BLACK_VAULT.md`
- `Wiki/Maps/Black_Vault.md`
- `Assets/Resources/Codex/Faction_ObsidianArchive.json`
- `Assets/Resources/Codex/Harvester_PhaseShiftedCores.json`

---

### Cascade
**File Count:** ~65 files
**Status:** ✅ Historical event/phenomenon

**Key Files:**
- `Assets/Resources/Codex/Technology_SpliceGrade.json`
- `Assets/Resources/Codex/Phenomenon_RealityFractures.json`
- `Assets/Resources/Codex/Hazard_HarvesterContamination.json`

---

## 🟡 ADDITIONAL CANONICAL FACTIONS

### Trivector Combine / Pact of Ash
**Status:** ✅ Canonical (secondary factions)

**JSON Files:**
- `Assets/Resources/Codex/Faction_TrivectorCombine.json`
- `Assets/Resources/Codex/Faction_PactOfAsh.json`

**Documentation:**
- `Wiki/Factions/Pact_of_Ash.md`
- `Wiki/Factions/Corporate_Hegemony.md`

---

## ⚠️ DEPRECATED/LEGACY TERMS

### ❌ Apex Dynamics
**File Count:** ~55 files
**Status:** ⚠️ DEPRECATED - Legacy faction name, needs migration

**Files Still Referencing (needs cleanup):**
- `Wiki/Factions/Apex_Dynamics.md` ← **SHOULD BE REMOVED/REDIRECTED**
- `Wiki/Gameplay/Factions.md` (references Apex)
- `Wiki/Gameplay/Game_Design_Document.md`
- `Wiki/Gameplay/Movement_And_Stamina.md`
- `Wiki/Marketing/Brand_Guidelines.md`
- `Wiki/Marketing/Faction_Marketing_Profiles.md`
- `Wiki/Maps/Black_Vault.md`
- `Wiki/Maps/Crimson_Docks.md`
- `Wiki/Maps/IEZ.md`
- `Wiki/Maps/Sky_Bastion.md`
- `Wiki/Maps/Tech_Wastes.md`
- `Wiki/Lore/Timeline_2147_2161.md`
- `Wiki/Lore/Lore_Bible.md`
- `Wiki/Lore/Faction_Relationships.md`
- `Docs/Data/Biome_Distribution_Grid.txt`
- `Docs/Architecture/TERMINAL_GROUNDS_VISUAL_IDENTITY.md`
- `Docs/Architecture/FactionSystemStatus.md`
- `Docs/Archive/OldProjects/TERMINAL_GROUNDS_FOUNDATION.md`
- `Assets/Scripts/Terrain/BiomeTerrainPreset.cs` ← **CODE FILE - NEEDS REVIEW**
- `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs` ← **CODE FILE - NEEDS REVIEW**

---

### ❌ Ghost Protocol
**File Count:** ~14 files
**Status:** ⚠️ DEPRECATED - Legacy faction/concept

**Files Still Referencing (needs cleanup):**
- `Wiki/Maps/Sky_Bastion.md`
- `Wiki/Maps/IEZ.md`
- `Wiki/Maps/Black_Vault.md`
- `Wiki/Gameplay/Stealth_Tactics.md`
- `Docs/Data/Biome_Distribution_Grid.txt`
- `Docs/Architecture/TERMINAL_GROUNDS_VISUAL_IDENTITY.md`
- `Docs/Architecture/FactionSystemStatus.md`
- `Docs/Archive/Technical/PROJECT_STATUS_2025-09-25.md`
- `Docs/Archive/Technical/ASSET_DOWNLOAD_GUIDE.md`
- `Docs/Archive/PhaseReports/Terminal_Grounds_16km_World_Configuration.md`
- `Docs/Archive/PhaseReports/Phase_1_Implementation_Summary.md`
- `Docs/Archive/OldProjects/TERMINAL_GROUNDS_FOUNDATION.md`
- `Docs/Archive/Marketing/VISUAL_IDENTITY_IMPLEMENTATION_PLAN.md`
- `Assets/Scripts/Terrain/BiomeTerrainPreset.cs` ← **CODE FILE - NEEDS REVIEW**

---

## 📊 Statistics by File Type

| Extension | Faction References | Lore References | Total |
|-----------|-------------------|-----------------|-------|
| `.cs` (code) | ~50 files | ~40 files | ~70 files |
| `.md` (docs) | ~400+ files | ~300+ files | ~500+ files |
| `.json` (config) | ~25 files | ~15 files | ~30 files |
| `.asset` (Unity) | ~15 files | ~10 files | ~20 files |
| `.prefab` | ~6 files | 0 files | ~6 files |
| `.txt` | ~3 files | ~5 files | ~5 files |

---

## 🎯 ACTION ITEMS

### High Priority (Code Changes Required)
1. **Review `Assets/Scripts/Terrain/BiomeTerrainPreset.cs`** - Contains deprecated faction references
2. **Review `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`** - May have deprecated enum values
3. **Clean `Docs/Data/Biome_Distribution_Grid.txt`** - Contains ApexDynamics and GhostProtocol

### Medium Priority (Documentation Cleanup)
1. **Remove or redirect `Wiki/Factions/Apex_Dynamics.md`** - Deprecated faction page
2. **Update `Wiki/Maps/*.md`** - Multiple map pages reference deprecated factions
3. **Update `Wiki/Gameplay/Factions.md`** - References ApexDynamics
4. **Review Archive docs** - Many Archive docs contain deprecated terms (acceptable in archive)

### Low Priority (Historical Context)
1. Files in `Docs/Archive/*` - Deprecated references acceptable as historical record
2. Files in `Wiki/Archive/*` - Already marked as legacy

---

## 📁 Key File Locations

### Canonical Faction Definitions
- **Enum:** `Assets/Scripts/Narrative/FactionType.cs`
- **World Gen Enum:** `Assets/Scripts/WorldGeneration/Configuration/FactionType.cs`
- **Codex Data:** `Assets/Resources/Codex/Faction_*.json`
- **Lore Docs:** `Docs/Lore/LoreBook/factions/FCT_*.md`
- **Wiki Pages:** `Wiki/Factions/*.md`

### Faction Ability System
- **Core:** `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilitySystem.cs`
- **Effects:** `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilityEffects.cs`
- **VFX:** `Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilityVFX.cs`
- **Prefabs:** `Assets/Prefabs/VFX/FactionAbilities/*.prefab`

### Narrative System
- **Procedural:** `Assets/Scripts/WorldGeneration/Narrative/ProceduralNarrativeSystem.cs`
- **Environmental Notes:** `Assets/Scripts/WorldGeneration/Narrative/EnvironmentalNoteDatabase.cs`
- **Audio Logs:** `Docs/Narrative/AudioLogScripts/*.md`

---

*Generated by Bloom Lore Touchpoint Audit*
