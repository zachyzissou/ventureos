# Bloom Game Systems - Deep Dive Analysis

**Generated:** 2025-01-20  
**Scope:** Core gameplay systems analysis for Bloom first playable  
**Source:** `Assets/Scripts/Gameplay/FirstPlayable/`

---

## Table of Contents
1. [Inventory System](#1-inventory-system)
2. [Combat System](#2-combat-system)
3. [Character Stats](#3-character-stats)
4. [Crafting System](#4-crafting-system)
5. [Quest/Mission System](#5-questmission-system)
6. [Save/Load System](#6-saveload-system)
7. [Architecture Summary](#7-architecture-summary)
8. [Tech Debt & Recommendations](#8-tech-debt--recommendations)

---

## 1. Inventory System

### File Locations
| File | Path | Lines |
|------|------|-------|
| PlayerInventory | `Loot/PlayerInventory.cs` | ~165 |
| PlayerStash | `Persistence/PlayerStash.cs` | ~290 |
| LootDefinition | `Loot/LootDefinition.cs` | ~22 |
| ResourceMaterial | `Loot/ResourceMaterial.cs` | ~18 |

### Architecture Pattern
**Event-Driven Container** - Uses events for UI binding, plain C# Lists for storage.

```csharp
// Two separate stack types
private readonly List<LootStack> stacks = new();        // Loot items
private readonly List<ResourceStack> resourceStacks = new();  // Crafting materials
```

### Key Features

| Feature | Implementation | Status |
|---------|---------------|--------|
| **Stacking** | FindIndex + merge by definition/materialId | ✅ Working |
| **Persistence** | Via SaveLoadManager (JSON) | ✅ Working |
| **UI Binding** | Events: `OnLootAdded`, `OnResourceAdded`, `OnInventoryChanged` | ✅ Working |
| **Capacity Limits** | Not implemented (unlimited) | ⚠️ Missing |
| **Weight System** | `ResourceMaterial.weight` defined but unused | ⚠️ Partial |

### Dependencies
```
PlayerInventory
├── LootDefinition (ScriptableObject)
├── ResourceMaterial (ScriptableObject)
├── CraftingRecipe (for HasIngredients/ConsumeIngredients)
└── SaveLoadManager (persistence)

PlayerStash (NetworkBehaviour)
├── NetworkVariable<int> stashVersion
├── SaveLoadManager (disk persistence)
└── StashData serializable class
```

### Dual-Key Lookup Pattern
Resources support both asset reference AND string ID lookup:
```csharp
int index = resourceStacks.FindIndex(s => 
    s.material == material || s.materialId == material.materialId);
```
This allows save/load by ID while maintaining asset references at runtime.

### Tech Debt
1. **O(n) lookup** - `FindIndex` for every add/remove operation
2. **No capacity limits** - Weight system defined but not enforced
3. **Separate stash system** - PlayerStash duplicates some PlayerInventory logic
4. **No item rarity/quality** - Only quantity tracked

---

## 2. Combat System

### File Locations
| File | Path | Lines |
|------|------|-------|
| NetworkedDamageSystem | `Combat/NetworkedDamageSystem.cs` | ~230 |
| HitScanWeapon | `Combat/HitScanWeapon.cs` | ~225 |
| WeaponDefinition | `Combat/WeaponDefinition.cs` | ~40 |
| IDamageable | `Combat/IDamageable.cs` | ~25 |
| PlayerHealth | `Player/PlayerHealth.cs` | ~75 |

### Architecture Pattern
**Server-Authoritative with Client Prediction** - All damage validated server-side with lag compensation.

### Damage Flow
```
[Client] HitScanWeapon.TryFire()
    ↓ Local raycast + immediate feedback (VFX/SFX)
    ↓
[Client → Server] RequestDamageServerRpc(targetId, damage, hitPoint, timestamp)
    ↓
[Server] ValidateHit()
    ├── Check distance (maxHitDistance = 200m)
    ├── Lag compensation (rewind 0.5s, 20 snapshots)
    ├── Position tolerance check (0.5m)
    └── Server raycast validation
    ↓
[Server] ApplyValidatedDamage()
    ├── IDamageable.ApplyDamage() (preferred)
    ├── PlayerData.TakeDamage() (fallback)
    └── EnemyHealth.ApplyDamage() (fallback)
    ↓
[Server → All] PlayDamageEffectClientRpc()
```

### Damage Calculation
```csharp
float totalDamage = weaponDefinition.damage 
    * damageMul          // BalanceRuntime.weaponDamageMultiplier
    * buffDamageMul      // BuffController.WeaponDamageMul
    * externalDamageMul; // SetExternalDamageMultiplier()
```

### Hit Detection
- **Type:** Hitscan (raycast)
- **Mask:** Configurable per weapon (`WeaponDefinition.hitMask`)
- **Validation:** Server performs secondary raycast to confirm hit

### Lag Compensation System
```csharp
private struct PlayerPositionSnapshot {
    public Vector3 position;
    public Quaternion rotation;
    public float timestamp;
}
// 20 snapshots × 0.1s interval = 2 seconds of history
```

### Weapon System
```csharp
public class WeaponDefinition : ScriptableObject {
    // Ballistics
    public float damage = 28f;
    public float fireRate = 9f;        // shots/second (9 = 540 RPM)
    public float range = 120f;         // meters
    
    // Ammunition
    public int magazineSize = 30;
    public float reloadDuration = 1.8f;
    public bool automatic = true;
    
    // Feel
    public float verticalKick = 0.7f;
    public float horizontalKick = 0.35f;
}
```

### Performance Optimizations
1. **Object Pooling** - `GameObjectPool` for muzzle flash and impact FX
2. **Coroutine-Free** - Update loop manages timed effects
3. **Line Renderer Bullet Trail** - Disabled after 0.05s

### Tech Debt
1. **Raycast origin TODO** - Currently uses player position, should use weapon muzzle
2. **No projectile weapons** - Only hitscan implemented
3. **VFX placeholder** - `PlayDamageEffectClientRpc` is empty TODO
4. **Fallback cascade** - Three different damage receivers (IDamageable → PlayerData → EnemyHealth)

---

## 3. Character Stats

### File Locations
| File | Path | Lines |
|------|------|-------|
| PlayerHealth | `Player/PlayerHealth.cs` | ~75 |
| SurvivalVitals | `Survival/SurvivalVitals.cs` | ~200 |
| BuffController | `Buffs/BuffController.cs` | ~135 |
| BuffDefinition | `Buffs/BuffDefinition.cs` | ~35 |
| ProgressionManager | `Progression/ProgressionManager.cs` | ~220 |

### Architecture Pattern
**Component-Based Stats** - Separate MonoBehaviours for health, vitals, buffs, and progression.

### Health System
```csharp
public class PlayerHealth : MonoBehaviour, IDamageable, INetworkHealth {
    [SerializeField] private float maxHealth = 100f;
    [SerializeField] private bool invulnerable;
    
    public event Action<float, float> OnHealthChanged;  // (current, max)
    public event Action OnDied;
    public event Action OnRespawned;
}
```
- **Local-only** for first playable (comment notes future network proxy)
- Implements both `IDamageable` and `INetworkHealth` interfaces

### Survival Vitals (Hunger/Thirst/Stamina)
```csharp
// Degrade rates (per second at idle)
hungerDegradeRateIdle = 100f / 3600f;  // 60 min to empty
thirstDegradeRateIdle = 100f / 1200f;  // 20 min to empty

// Sprint multiplier
sprintMultiplier = 1.5f;  // +50% drain when sprinting
```

**Status Thresholds:**
| Status | Hunger Range | Thirst Range | Effect |
|--------|--------------|--------------|--------|
| Well Fed/Hydrated | ≥70% | ≥70% | +10% move speed, +15% stamina regen |
| Hungry/Thirsty | 10-30% | 10-30% | -5% move speed, -10% stamina regen |
| Starving/Dehydrated | <10% | <10% | -15% move speed, -30% stamina regen, -10% accuracy |

**Performance Modifiers:**
```csharp
public float MovementSpeedModifier { get; }
public float StaminaRegenModifier { get; }  // Compounds hunger + thirst
public float AccuracyModifier { get; }
```

### Buff System
```csharp
public enum StackingRule {
    Replace,   // New replaces old
    Extend,    // Extends duration
    Stack,     // Additive stacks (unlimited)
    MaxStack,  // Stack up to maxStacks, then extend
    Ignore     // Keep existing, ignore new
}
```

**Buff Modifiers (multiplicative):**
```csharp
public float MoveSpeedMul { get; }
public float WeaponDamageMul { get; }
public float StaminaRegenMul { get; }
public float HealthRegenMul { get; }
public float AccuracyMul { get; }
public float ArmorMul { get; }
```

**Stack Calculation:**
```csharp
// For stacked buffs, effect is exponentiated by stack count
move *= Mathf.Pow(b.def.moveSpeedMul, stackMul);
```

### Progression System
```csharp
// NetworkVariables (server-authoritative)
public NetworkVariable<int> CurrentLevel;
public NetworkVariable<int> CurrentXP;
public NetworkVariable<int> AvailableSkillPoints;

// XP Curve (tiered linear)
Level 1-10:  1,000 XP per level
Level 11-25: 1,500 XP per level
Level 26-50: 2,000 XP per level
```

### Dependencies Graph
```
PlayerHealth ←─┐
               │ IDamageable
SurvivalVitals │
  └── BalanceRuntime (multipliers)
  └── BuffController.StaminaRegenMul
               │
BuffController ├── BuffDefinition (ScriptableObject)
               │
ProgressionManager
  └── SkillPointSystem
  └── IPlayerFactionService (bonus XP)
```

### Tech Debt
1. **No health regeneration** - Only damage and heal methods
2. **No armor/resistance system** - ArmorMul defined but unused in damage calc
3. **Vitals not networked** - SurvivalVitals is local-only (INetworkVitals interface exists but not used)
4. **Buff stacking via Pow()** - Can create extreme values with many stacks

---

## 4. Crafting System

### File Locations
| File | Path | Lines |
|------|------|-------|
| CraftingRecipe | `Crafting/CraftingRecipe.cs` | ~110 |
| CraftingDatabase | `Crafting/CraftingDatabase.cs` | ~55 |
| CraftingStation | `Crafting/CraftingStation.cs` | ~180 |
| RecipeUnlockManager | `Crafting/RecipeUnlockManager.cs` | ~170 |
| CraftingUI | `Crafting/CraftingUI.cs` | (not analyzed) |

### Architecture Pattern
**ScriptableObject Database + Unlock Manager** - Recipes are data assets, unlocks tracked at runtime.

### Recipe Structure
```csharp
[CreateAssetMenu(menuName = "Bloom/FirstPlayable/Crafting Recipe")]
public class CraftingRecipe : ScriptableObject {
    // Ingredients
    public List<Ingredient> ingredients;
    
    // Output (priority: outputLoot > outputResource > outputItemId)
    public LootDefinition outputLoot;
    public ResourceMaterial outputResource;
    public string outputItemId;  // Fallback
    public int outputQuantity = 1;
    
    // Requirements
    public float craftTime = 5f;
    public string requiredStation = "Basic Workbench";
    
    // Unlock conditions
    public int requiredLevel = 0;
    public FactionType requiredFaction;
    public int requiredReputationTier = 0;
    public bool isBlueprintRecipe = false;
    public string blueprintItemId = "";
    
    // Tier system
    public RecipeTier recipeTier;  // Tier1/Tier2/Tier3
}
```

### Recipe Tiers
| Tier | Description | Typical Requirements |
|------|-------------|---------------------|
| Tier 1 | Basic human-tier gear | Level 1, no faction |
| Tier 2 | Hybrid tech | Level 10+, faction rep |
| Tier 3 | Alien/Monolith tech | Blueprint discovery |

### Unlock Flow
```
Player crafts item
    ↓
CraftingStation.CanCraft()
    ├── Check station tier matches recipe.requiredStation
    ├── Check recipe in availableRecipes list
    └── RecipeUnlockManager.IsRecipeUnlocked()
        ├── Check player level >= requiredLevel
        ├── Check faction reputation tier
        └── Check blueprint discovered (if isBlueprintRecipe)
    ↓
PlayerInventory.HasIngredients()
    ↓
Coroutine: CraftCoroutine()
    ├── OnAnyCraftStarted event
    ├── Progress loop (craftTime seconds)
    ├── PlayerInventory.ConsumeIngredients()
    └── AddCraftedItemToInventory()
        └── OnAnyCraftCompleted event
```

### Blueprint Discovery
```csharp
// Blueprints are discovered via:
// 1. Quest rewards (unlockRewards list)
// 2. Direct discovery (DiscoverBlueprint())

// Persistence: PlayerPrefs (comma-separated IDs)
PlayerPrefs.SetString("DiscoveredBlueprints", "bp_1,bp_2,bp_3");
```

### Tech Debt
1. **No crafting queue** - One item at a time
2. **Coroutine-based** - Could interrupt on player death
3. **Station coupling** - Recipe tied to specific station string
4. **PlayerPrefs for blueprints** - Should use SaveLoadManager

---

## 5. Quest/Mission System

### File Locations
| File | Path | Lines |
|------|------|-------|
| QuestDefinition | `Quests/QuestDefinition.cs` | ~130 |
| QuestInstance | `Quests/QuestInstance.cs` | ~200 |
| QuestTracker | `Quests/QuestTracker.cs` | ~350 |
| QuestGiver | `Quests/QuestGiver.cs` | (not analyzed) |
| QuestUI | `Quests/QuestUI.cs` | (not analyzed) |

### Architecture Pattern
**Definition/Instance Split** - ScriptableObject templates + runtime instance tracking.

### Quest Types
```csharp
public enum QuestType {
    Gather,     // Collect X items/resources
    Deliver,    // Deliver items to location/NPC
    Eliminate,  // Kill X enemies
    ClearPOI,   // Clear a specific POI
    Craft,      // Craft X items
    Survive,    // Survive for X time
    Custom      // Custom quest logic
}

public enum QuestFrequency {
    Daily,       // Resets daily
    Weekly,      // Resets weekly
    OneTime,     // Can only be completed once
    Repeatable   // Can be repeated indefinitely
}
```

### Quest States
```
Available → Active → Completed → TurnedIn
                  ↘ Failed/Expired
```

### Progress Tracking
```csharp
public class QuestInstance {
    // Per-type progress dictionaries
    public Dictionary<string, int> gatherProgress;
    public Dictionary<string, int> eliminateProgress;
    public bool poiCleared;
    public int craftProgress;
    public float surviveProgress;
}
```

### Event Integration
```csharp
// QuestTracker subscribes to gameplay events:
playerInventory.OnLootAdded += HandleLootAdded;
playerInventory.OnResourceAdded += HandleResourceAdded;
EnemySpawner.OnEnemyKilled += HandleEnemyKilled;
CraftingStation.OnAnyCraftCompleted += HandleCraftCompleted;
```

### Reward System
```csharp
// QuestDefinition rewards
public int currencyReward = 100;
public int reputationReward = 50;
public int xpReward = 100;
public List<LootReward> lootRewards;
public List<ResourceReward> resourceRewards;
public List<string> unlockRewards;  // Blueprint IDs
```

### UI Integration
```csharp
// Throttled prompt updates (every 0.5s)
promptManager.SetQuestPrompt(questName, objective, progress);
```

### Tech Debt
1. **No quest persistence** - Active quests lost on restart
2. **FindFirstObjectByType** - Used frequently instead of dependency injection
3. **Enemy type matching** - Uses GameObject.name as fallback
4. **No quest chains** - Each quest is standalone

---

## 6. Save/Load System

### File Locations
| File | Path | Lines |
|------|------|-------|
| SaveLoadManager | `Persistence/SaveLoadManager.cs` | ~165 |
| SaveData | `Persistence/SaveData.cs` | ~45 |
| PlayerStash | `Persistence/PlayerStash.cs` | ~290 |

### Architecture Pattern
**JSON Serialization + GuidRegistry** - Simple JSON files with asset lookup tables.

### Save Data Structure
```csharp
[Serializable]
public class SaveData {
    public List<ResourceEntry> resources;   // materialId + quantity
    public List<LootEntry> loot;            // lootGuid + lootName + quantity
    public List<BuildingEntry> buildings;   // position, rotation, health, tier
    public List<HelperEntry> helpers;       // position, mode, guardPoint
    public ProgressionEntry progression;    // level, xp, skillPoints
}
```

### Save Flow
```
SaveLoadManager.Save()
    ├── Serialize PlayerInventory.ResourceStacks
    ├── Serialize PlayerInventory.Stacks (with GUID lookup)
    ├── Find all BuildingInstance objects
    ├── Find all CompanionHelper objects
    ├── Get ProgressionManager state
    └── JsonUtility.ToJson() → persistentDataPath/save.json
```

### Load Flow
```
SaveLoadManager.Load()
    ├── JsonUtility.FromJson<SaveData>()
    ├── PlayerInventory.ResetInventory()
    ├── For each resource: materialRegistry.Get() → AddResource()
    ├── For each loot: lootRegistry.Get() → AddLoot()
    ├── For each building: Instantiate(def.prefab) + Initialize()
    ├── For each helper: Instantiate + SetOwner() + SetMode()
    └── ProgressionManager NetworkVariable assignments (server only)
```

### Registry System
```csharp
// GuidRegistry<T> provides asset ↔ GUID mapping
[SerializeField] private GuidRegistry<BuildingDefinition> buildingRegistry;
[SerializeField] private GuidRegistry<ResourceMaterial> materialRegistry;
[SerializeField] private GuidRegistry<LootDefinition> lootRegistry;
```

### Stash System (Separate)
```csharp
// PlayerStash persists to separate files per player
string path = $"stash_{OwnerClientId}.json";

// Server-authoritative with NetworkVariable sync
private NetworkVariable<int> stashVersion;  // Change notification
```

### Data NOT Persisted
- ❌ Quest progress (active quests)
- ❌ Buff states
- ❌ Enemy positions
- ❌ Player position (respawns at default)
- ❌ World state (POI clear status)
- ❌ Crafting blueprints (uses PlayerPrefs separately)

### Tech Debt
1. **Reflection for BuildingInstance** - Uses `GetField()` to set private fields
2. **No versioning** - Save file format changes would break old saves
3. **Single save slot** - Always overwrites `save.json`
4. **Mixed persistence** - Blueprints in PlayerPrefs, inventory in JSON
5. **No auto-save** - Manual save only

---

## 7. Architecture Summary

### Design Patterns Used
| Pattern | Usage |
|---------|-------|
| ScriptableObject | Definitions (Weapon, Recipe, Quest, Buff, Loot, Material) |
| Event-Driven | UI binding, quest progress, inventory changes |
| Server-Authoritative | Damage, progression, stash |
| Component-Based | Stats split across PlayerHealth, SurvivalVitals, BuffController |
| Interface Abstraction | IDamageable, INetworkHealth, INetworkVitals, IInteractable |

### Networking Architecture
```
Server-Authoritative:
├── NetworkedDamageSystem (hit validation, lag compensation)
├── ProgressionManager (XP, levels, skill points)
└── PlayerStash (persistent storage)

Local-Only (First Playable):
├── PlayerHealth
├── PlayerInventory
├── SurvivalVitals
├── BuffController
└── QuestTracker
```

### Global State Access
```csharp
// BalanceRuntime singleton for multipliers
BalanceRuntime.Current.weaponDamageMultiplier
BalanceRuntime.ActiveBuffs  // BuffController reference

// ServiceLocator for services
ServiceLocator.Instance.GetService<IPlayerFactionService>()

// FindFirstObjectByType (frequent, not ideal)
FindFirstObjectByType<ProgressionManager>()
```

---

## 8. Tech Debt & Recommendations

### Critical Issues
| Issue | System | Impact | Recommendation |
|-------|--------|--------|----------------|
| Quest progress not saved | Quest | Progress lost on restart | Add QuestState to SaveData |
| No save versioning | Save/Load | Breaking changes risky | Add version field + migration |
| Reflection for loading | Save/Load | Fragile, slow | Add Initialize() method to BuildingInstance |

### High Priority
| Issue | System | Impact | Recommendation |
|-------|--------|--------|----------------|
| O(n) inventory lookup | Inventory | Poor scaling | Use Dictionary<string, ResourceStack> |
| FindFirstObjectByType spam | All | Performance | Dependency injection or caching |
| Damage VFX placeholder | Combat | No feedback | Implement PlayDamageEffectClientRpc |
| Mixed persistence | Save/Load | Confusing | Consolidate to SaveLoadManager |

### Medium Priority
| Issue | System | Impact | Recommendation |
|-------|--------|--------|----------------|
| No inventory capacity | Inventory | No resource tension | Implement weight limit |
| Coroutine crafting | Crafting | Interruptible | State machine approach |
| Buff stacking math | Stats | Extreme values | Cap stack effects |
| Single save slot | Save/Load | No rollback | Multi-slot saves |

### Low Priority
| Issue | System | Impact | Recommendation |
|-------|--------|--------|----------------|
| No projectile weapons | Combat | Limited variety | Add projectile system |
| No quest chains | Quest | Limited narrative | Add prerequisite quests |
| No health regen | Stats | Missing mechanic | Add regen buff or passive |

### Code Quality Notes
- **Good:** Clear separation of Definition (data) vs Instance (runtime)
- **Good:** Events for UI decoupling
- **Good:** Network-ready interfaces even for local-only systems
- **Needs Work:** Inconsistent dependency resolution (DI vs FindFirstObjectByType)
- **Needs Work:** Some TODO comments remain in production code

---

## Appendix: Quick Reference

### Key Interfaces
```csharp
IDamageable         // ApplyDamage, IsAlive
INetworkHealth      // Current, Max, IsAlive
INetworkVitals      // (placeholder for future)
IInteractable       // CanInteract, Interact, Prompt
IPlayerFactionService // GetReputationTierLevel, ModifyFactionReputation
```

### Event Cheat Sheet
```csharp
// Inventory
PlayerInventory.OnLootAdded(LootDefinition, int)
PlayerInventory.OnResourceAdded(ResourceMaterial, int)
PlayerInventory.OnInventoryChanged()

// Combat
PlayerHealth.OnHealthChanged(float, float)  // current, max
PlayerHealth.OnDied()

// Survival
SurvivalVitals.OnVitalsChangedNormalized(float, float, float)  // hunger%, thirst%, stamina%

// Buffs
BuffController.OnBuffAdded(BuffDefinition)
BuffController.OnBuffRemoved(BuffDefinition)
BuffController.OnBuffsChanged()

// Progression
ProgressionManager.OnLevelUp(int)
ProgressionManager.OnXPGained(int)

// Crafting
CraftingStation.OnAnyCraftStarted(string)
CraftingStation.OnAnyCraftProgress(string, float)
CraftingStation.OnAnyCraftCompleted(string)

// Quests
QuestTracker.OnQuestAccepted(QuestInstance)
QuestTracker.OnQuestProgressChanged(QuestInstance)
QuestTracker.OnQuestCompleted(QuestInstance)
QuestTracker.OnQuestTurnedIn(QuestInstance)
```

---
VALIDATION:
- Output file: memory/bloom-audit/deep-dive-systems.md ✓ exists
- Completeness: complete
- Self-check: PASS
- Confidence: high
