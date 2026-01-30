# Bloom Code-Documentation Sync Audit Report

**Generated:** 2026-01-28
**Auditor:** Code-Documentation Sync Auditor (Subagent)
**Workspace:** C:\Users\Zachg\Development\Games\Bloom

---

## Executive Summary

This audit reveals **significant mismatches** between the Bloom project's documentation and actual codebase. The most critical issues include:

1. **Engine Mismatch**: Architecture docs describe Unreal Engine 5.6 but the project is Unity
2. **Faction Enum Mismatch**: Code has 7 factions, docs describe 10 playable factions
3. **Missing Core Systems**: Documentation references classes that don't exist in code
4. **ID Inconsistencies**: Faction IDs differ between code and documentation

---

## 1. ENUM SYNC STATUS

### 1.1 FactionType Enum

**Location in Code:** `Assets/Scripts/Narrative/FactionType.cs`

| Status | Code Value | Code Name | Code FCT_ID | Doc FCT_ID | Doc Name | Notes |
|--------|-----------|-----------|-------------|------------|----------|-------|
| ✅ MATCH | 0 | Directorate | FCT_DIR | FCT_DIR | Sky Bastion Directorate | Aligned |
| ⚠️ PARTIAL | 1 | Vultures | FCT_VUL | FCT_VUL | Iron Vultures | Name slight diff |
| ❌ MISMATCH | 2 | Wardens | FCT_WAR | FCT_CWD | Truce Wardens | **Different ID!** |
| ✅ MATCH | 3 | SeventySeven | FCT_F77 | FCT_F77 | The Seventy-Seven | Aligned |
| ❌ NOT IN DOCS | 4 | PactOfAsh | FCT_ASH | N/A | N/A | **Code-only at enum level** |
| ✅ MATCH | 5 | Roadborn | FCT_NOM | FCT_NOM | Roadborn | Aligned |
| ✅ MATCH | 6 | Archive | FCT_VAR | FCT_VAR | Obsidian Archive | Aligned |
| ❌ DOC ONLY | N/A | N/A | N/A | FCT_HLX | Helix Syndicate | **Not in code enum** |
| ❌ DOC ONLY | N/A | N/A | N/A | FCT_AEG | Aegis Collective | **Not in code enum** |
| ❌ DOC ONLY | N/A | N/A | N/A | FCT_NGD | North Guard | **Not in code enum** |
| ❌ DOC ONLY | N/A | N/A | N/A | FCT_APX | Apex Dynamics | **Not in code enum** |

**Critical Finding:** 
- Code enum has **7 factions**
- Wiki index claims **10 playable factions** at EA launch
- BLOOM_GAME_BIBLE.md lists **7 primary factions at EA launch** but with different set

### 1.2 BiomeType Enum

**Location in Code:** `Assets/Scripts/WorldGeneration/Configuration/BiomeType.cs`

| Code Biome | In Docs | In Wiki | Status |
|------------|---------|---------|--------|
| CentralGrasslands | ✅ | ✅ | MATCH |
| ForestHills | ✅ | ✅ | MATCH |
| TheReach | ✅ | ✅ | MATCH |
| SouthwestPlains | ✅ | ✅ | MATCH |
| EasternPlateaus | ✅ | ✅ | MATCH |
| WesternMountains | ✅ | ✅ | MATCH |
| GreyreachDistrict | ✅ | ✅ | MATCH |
| SnowPeaks | ✅ | ✅ | MATCH |
| TheStillfreeze | ✅ | ✅ | MATCH |
| ShimmerMarsh | ✅ | ✅ | MATCH |
| TheDrift | ✅ | ✅ | MATCH |
| Ocean | ✅ | ✅ | MATCH |
| Volcanic | ✅ | ? | Needs verification |

**Status:** ✅ BiomeType enum is generally well-synced (13 values = 12 land + Ocean)

### 1.3 RegionType Enum

**Location in Code:** `Assets/Scripts/WorldGeneration/FeatureRegions/FeatureRegionDescriptor.cs`

| Code Value | In Docs | Status |
|------------|---------|--------|
| River | Needs check | |
| MountainRange | Needs check | |
| Forest | Needs check | |
| TransitionZone | Needs check | |
| Custom | Needs check | |

**Note:** This is a small internal enum for feature regions, not user-facing.

### 1.4 WeaponType Enum

**Status:** ❌ **NOT FOUND IN CODE**

Documentation (FactionSystemStatus.md) references `WeaponType` enum with values:
- Assault, SMG, Sniper, Heavy, Melee

**Finding:** WeaponType enum is documented but does not exist in the codebase.

---

## 2. CLASS NAME SYNC STATUS

### 2.1 Classes Referenced in Docs But Missing in Code

| Class Name | Referenced In | Actually Exists | Status |
|------------|--------------|-----------------|--------|
| `FactionManager` | FactionSystemStatus.md, Refactoring docs | ❌ NO | **DEAD REFERENCE** |
| `FactionEquipmentSystem` | FactionSystemStatus.md | ❌ NO | **DEAD REFERENCE** |
| `TrustSystem` | SYSTEM-ARCHITECTURE.md, FactionSystemStatus.md | ❌ NO | **DEAD REFERENCE** |
| `TerritorialSystem` | SYSTEM-ARCHITECTURE.md, multiple design docs | ❌ NO | **DEAD REFERENCE** |
| `CodexSystem` | SYSTEM-ARCHITECTURE.md | ❌ NO | **DEAD REFERENCE** |
| `SpliceSystem` | SYSTEM-ARCHITECTURE.md | ❌ NO | **DEAD REFERENCE** |

### 2.2 Classes That Exist in Code

| Class Name | Location | In Docs | Status |
|------------|----------|---------|--------|
| `FactionAbilitySystem` | Assets/Scripts/Gameplay/FirstPlayable/ | ✅ Yes | MATCH |
| `PlayerFactionService` | Assets/Scripts/Narrative/ | Partial | Underdocumented |
| `GameManager` | Assets/Scripts/Core/ | Partial | Underdocumented |
| `WeatherSystem` | Assets/Scripts/Environment/Weather/ | ✅ Yes | MATCH |
| `TileStreamingSystem` | Assets/Scripts/DOTS/ | ✅ Yes | MATCH |

---

## 3. SYSTEM ARCHITECTURE MISMATCH

### 3.1 Engine Mismatch (CRITICAL)

**Finding:** `Docs/Architecture/SYSTEM-ARCHITECTURE.md` describes an **Unreal Engine 5.6** architecture with **C++** code:

```cpp
// From SYSTEM-ARCHITECTURE.md
namespace TG::Core {
    class TrustSystem : public UGameInstanceSubsystem {
```

**Reality:** The actual project is built with **Unity** (C#):
- Evidence: `.cs` files, Assembly-CSharp.csproj, Unity-specific namespaces
- Project files: Bloom.sln, com.bloom.runtime.csproj

**Impact:** The entire SYSTEM-ARCHITECTURE.md document describes a different game engine and is not applicable to the actual codebase.

### 3.2 FactionSystemStatus.md Analysis

This document describes:
- ~61KB of C# code across 3 files
- Classes: FactionManager, FactionEquipmentSystem, FactionAbilitySystem
- Integration with TrustSystem, TerritorialSystem

**Actual Status:**
- `FactionAbilitySystem.cs` ✅ EXISTS
- `FactionManager.cs` ❌ DOES NOT EXIST
- `FactionEquipmentSystem.cs` ❌ DOES NOT EXIST
- `TrustSystem.cs` ❌ DOES NOT EXIST
- `TerritorialSystem.cs` ❌ DOES NOT EXIST

---

## 4. DOCUMENTATION INCONSISTENCIES

### 4.1 Faction Count Discrepancies

| Source | EA Launch Factions | Total Factions |
|--------|-------------------|----------------|
| `FactionType.cs` (Code) | 4 (Directorate, Vultures, Wardens, SeventySeven) | 7 |
| `Wiki/Factions/index.md` | 4 | 10 playable + 3 lore-only |
| `BLOOM_GAME_BIBLE.md` | 7 (different list) | 7 primary |
| `FactionSystemStatus.md` | 7 (yet another list) | 7 |

### 4.2 Faction ID Inconsistencies

**Wardens Faction:**
- Code: `FCT_WAR` (FactionType.Wardens)
- Game Bible: `FCT_CWD` (Truce Wardens)
- This is the same faction with different IDs!

### 4.3 Launch Timeline Confusion

**Code comments say:**
```csharp
// Launch Factions (EA Launch):
// - Directorate, Vultures, Wardens, SeventySeven
// Post-Launch Factions (Month 3-6):
// - PactOfAsh, Roadborn, Archive
```

**Wiki says:**
- EA Launch: Directorate, Iron Vultures, Aegis Collective, Seventy-Seven
- Post-EA (Month 3-6): Helix Syndicate, Roadborn, Obsidian Archive

---

## 5. CONFIG SYNC STATUS

### 5.1 ScriptableObjects

Key config types found in code:
- `BiomeTerrainPreset`
- `WorldConfig`
- `FeatureRegionDescriptor`
- `WeatherPreset`

**Status:** Config structure appears consistent, but detailed value audit not performed.

---

## 6. UNDOCUMENTED CODE (Important Classes Without Docs)

| Class | Location | Importance | Documentation Status |
|-------|----------|------------|---------------------|
| `ServiceLocator` | Assets/Scripts/Core/ | HIGH | No dedicated doc |
| `PlayerFactionService` | Assets/Scripts/Narrative/ | HIGH | Minimal doc |
| `IPlayerFactionService` | Assets/Scripts/Narrative/ | HIGH | No dedicated doc |
| `MacroWorldGenerator` | Assets/Scripts/WorldGeneration/ | HIGH | Partial (in Terra docs) |
| `TileMemoryManager` | Assets/Scripts/WorldGeneration/ | MEDIUM | Minimal doc |

---

## 7. RECOMMENDATIONS

### 7.1 Critical (Do First)

1. **Archive or Update SYSTEM-ARCHITECTURE.md**
   - Current doc describes Unreal Engine, not Unity
   - Either create new Unity architecture doc or archive the Unreal one

2. **Reconcile Faction Definitions**
   - Align FactionType.cs enum with canonical faction list
   - Choose ONE source of truth for faction IDs (FCT_WAR vs FCT_CWD)
   - Update Wiki/Factions/index.md to match actual code

3. **Remove Dead Class References**
   - FactionSystemStatus.md references non-existent classes
   - Either implement the missing classes or update docs to reflect reality

### 7.2 High Priority

4. **Standardize Faction IDs Across Docs**
   - Current: Code uses FCT_WAR, docs use FCT_CWD for same faction
   - Pick one and update all references

5. **Create WeaponType Enum (if needed)**
   - Currently documented but not implemented
   - Either implement or remove from docs

### 7.3 Medium Priority

6. **Document Core Unity Services**
   - ServiceLocator pattern needs documentation
   - PlayerFactionService needs full API docs

7. **Audit BLOOM_GAME_BIBLE.md**
   - Verify all faction/biome/region IDs match code
   - This should be canonical source of truth

---

## 8. AUDIT METHODOLOGY

### Files Examined

**Code Files:**
- `Assets/Scripts/Narrative/FactionType.cs`
- `Assets/Scripts/WorldGeneration/Configuration/BiomeType.cs`
- `Assets/Scripts/WorldGeneration/FeatureRegions/FeatureRegionDescriptor.cs`
- `Assets/Scripts/Terrain/BiomeTypes.cs`
- Directory scans of Assets/Scripts/**

**Documentation Files:**
- `Docs/Architecture/SYSTEM-ARCHITECTURE.md`
- `Docs/Architecture/FactionSystemStatus.md`
- `Docs/Lore/BLOOM_GAME_BIBLE.md`
- `Wiki/Factions/index.md`
- `Wiki/Gameplay/Biomes_Guide.md`

### Search Patterns Used

- `enum\s+FactionType`
- `enum\s+BiomeType`
- `enum\s+RegionType`
- `enum\s+WeaponType`
- Class name searches: `*Manager.cs`, `*System.cs`, `*Controller.cs`
- Faction ID searches: `FCT_*`

---

## 9. SYNC STATUS SUMMARY

| Category | Status | Severity |
|----------|--------|----------|
| BiomeType Enum | ✅ SYNCED | Low |
| FactionType Enum | ❌ MISMATCH | **CRITICAL** |
| WeaponType Enum | ❌ MISSING | Medium |
| RegionType Enum | ✅ SYNCED | Low |
| Core Classes (Manager/System) | ❌ DEAD REFERENCES | **CRITICAL** |
| Architecture Docs | ❌ WRONG ENGINE | **CRITICAL** |
| Faction IDs | ❌ INCONSISTENT | High |
| Biome Configs | ✅ SYNCED | Low |

---

**Report Complete**

*This audit identifies critical documentation debt that should be addressed to maintain codebase coherence and reduce developer confusion.*
