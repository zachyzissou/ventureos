# Bloom Extraction System Review

**Date**: 2025-01-28  
**Reviewer**: Subagent (bloom-extraction-review)  
**Status**: Complete

---

## Executive Summary

The extraction system in Bloom is **solid foundational work** with room for enhancement. The `ExtractionZoneEnhanced` component provides a robust, network-synchronized extraction mechanic with timer, wave spawning, and loot handling. The supporting systems (CollectorSweepManager, VeilCacheService) add a unique "recovery" mechanic that differentiates from Tarkov/Hunt.

**Overall Grade: B+** - Core loop works, but missing features expected in extraction shooters.

---

## System Architecture

### Core Components

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| `ExtractionZone` | `Mission/ExtractionZone.cs` | Basic single-shot extraction trigger | Legacy/Simple |
| `ExtractionZoneEnhanced` | `Mission/ExtractionZoneEnhanced.cs` | Full networked extraction with timer/waves | **Primary** |
| `CollectorSweepManager` | `Loot/CollectorSweepManager.cs` | Tarkov-style corpse cleanup | Working |
| `VeilCacheService` | `Loot/VeilCacheService.cs` | Lost loot recovery broker | Working |
| `CorpseLootContainer` | `Loot/CorpseLootContainer.cs` | Networked corpse with loot | Working |
| `ExtractionUI` | `UI/ExtractionUI.cs` | HUD for extraction status | Basic |
| `FirstMissionController` | `Mission/FirstMissionController.cs` | Mission orchestration | Working |
| `StoryMissionController` | `Mission/StoryMissionController.cs` | Objective-based missions | Working |

### Data Flow

```
Mission Start
     ↓
Kill Quota / Objectives
     ↓
ExtractionZoneEnhanced.EnableExtraction(true)
     ↓
Player enters trigger → StartExtraction()
     ↓
┌─────────────────────────────────────┐
│  EXTRACTION IN PROGRESS             │
│  - Timer counting down (3 min)      │
│  - Waves spawning (5 waves)         │
│  - Squad wipe detection active      │
└─────────────────────────────────────┘
     ↓
SUCCESS: Timer expires with players alive
     ↓
- TransferLootToStash() → PlayerStash
- AwardExtractionXP() → ProgressionManager
- ReturnToHQCoroutine() → Teleport to faction HQ
     
     OR
     
FAILURE: Squad wipe detected
     ↓
- DropPlayerInventoriesToCorpses() → CorpseLootContainer
- CollectorSweepManager.RegisterCorpse() → Schedule sweep
- VeilCacheService stores loot for recovery
```

---

## Implementation Details

### How Extraction Points Work

1. **Activation**: `EnableExtractionServerRpc(true)` called by mission controller when objectives complete
2. **Trigger Entry**: `OnTriggerEnter` detects player with NetworkObject, adds to `playersInZone` HashSet
3. **Start**: First player entry starts extraction (timer begins, waves spawn)
4. **Progress**: Timer counts down while waves spawn at intervals
5. **Completion**: Timer reaches 0 = success, all players dead = failure

### Timer Mechanics

```csharp
// Default configuration
extractionTimerSeconds = 180f;    // 3 minutes
waveCount = 5;
waveIntervalSeconds = 30f;        // Wave every 30 seconds
```

- Timer is server-authoritative (`NetworkVariable<float>`)
- Updates broadcast to clients via `OnValueChanged` callback
- UI updates on both server (during Update) and client (via events)

### Enemy Contestation

**Current State**: Enemies spawn in waves around the extraction zone but do NOT have special targeting of extraction.

```csharp
private void SpawnWave(int waveIndex)
{
    int enemyCount = waveIndex < enemiesPerWave.Length 
        ? enemiesPerWave[waveIndex] 
        : enemiesPerWave[enemiesPerWave.Length - 1];
    
    for (int i = 0; i < enemyCount; i++)
    {
        Vector3 spawnPosition = GetRandomSpawnPosition(); // Random within radius
        // Enemies spawn but no special "contest extraction" behavior
    }
}
```

**Gap**: Enemies don't specifically try to enter the extraction zone or interrupt extraction. They use standard AI behavior.

### Successful Extraction Flow

```csharp
private void HandleExtractionSuccess()
{
    extractionSuccess.Value = true;
    StopExtraction();
    TransferLootToStash();      // Inventory → PlayerStash (persistent)
    AwardExtractionXP();        // Base 500 XP + loot bonus
    StartCoroutine(ReturnToHQCoroutine()); // 5s delay → teleport
}
```

**XP Calculation**:
```csharp
int xpAmount = BASE_EXTRACTION_XP + (lootValue / 1000) * LOOT_XP_PER_1000_CREDITS;
// 500 base + 50 per 1000 credits of loot value
```

---

## Gap Analysis vs. Tarkov/Hunt Standard

### Missing Features

| Feature | Tarkov | Hunt | Bloom | Priority |
|---------|--------|------|-------|----------|
| Multiple extraction points | ✅ | ✅ | ❌ | **HIGH** |
| Randomized available extracts | ✅ | ✅ | ❌ | HIGH |
| Conditional extracts (key/item) | ✅ | ✅ | ❌ | MEDIUM |
| Extract camping deterrents | ✅ | ⚠️ | ❌ | MEDIUM |
| Per-player extract timer | ✅ | ❌ | ❌ | MEDIUM |
| Vehicle extracts | ✅ | ❌ | ❌ | LOW |
| Co-op extract requirement | ❌ | ✅ | ❌ | LOW |
| Time-limited extracts | ✅ | ✅ | ❌ | LOW |
| VIP/cargo extracts | ✅ | ❌ | ❌ | LOW |
| Extract siren/warning to others | ✅ | ✅ | ⚠️ Partial | LOW |

### Network Sync Issues

1. **`playersInZone` not replicated**: Clients don't know who's in the extraction zone
   - Impact: UI can't show "waiting for X more players"
   - Fix: Add `NetworkList<ulong>` for player IDs in zone

2. **No disconnect handling**: If player disconnects during extraction:
   - Current: Their loot disappears (not in stash, not in corpse)
   - Fix: Treat disconnect as "death" → spawn corpse with their loot

3. **Roster sync incomplete**: `missionRoster` is server-only
   - Impact: Clients can't display roster info
   - Fix: Sync roster via RPC or NetworkList if needed for UI

### Edge Cases Not Handled

| Scenario | Current Behavior | Expected Behavior |
|----------|------------------|-------------------|
| Disconnect during extract | Loot lost | Corpse spawned with loot |
| Party split (some extract) | Only those in zone get rewards | Warning "squad incomplete" |
| Join mid-extraction | Can enter and get rewards | Intentional? Document or restrict |
| Multiple extracts per map | N/A (single extract) | Random subset available |
| Player dies in extract zone | Extraction continues | Should it pause/fail for that player? |

---

## Suggested Improvements

### 1. Dynamic Extraction Points (HIGH PRIORITY)

**Concept**: Multiple extraction points per map, random subset available per raid.

```csharp
public class DynamicExtractionManager : NetworkBehaviour
{
    [SerializeField] private List<ExtractionZoneEnhanced> allExtractionPoints;
    [SerializeField] private int minActiveExtracts = 2;
    [SerializeField] private int maxActiveExtracts = 4;
    
    private NetworkList<int> activeExtractIndices;
    
    public override void OnNetworkSpawn()
    {
        if (IsServer)
        {
            SelectRandomExtracts();
        }
    }
    
    private void SelectRandomExtracts()
    {
        var indices = Enumerable.Range(0, allExtractionPoints.Count)
            .OrderBy(_ => UnityEngine.Random.value)
            .Take(UnityEngine.Random.Range(minActiveExtracts, maxActiveExtracts + 1))
            .ToList();
        
        foreach (int idx in indices)
        {
            activeExtractIndices.Add(idx);
            // Don't enable yet - mission controller handles that
        }
    }
}
```

### 2. Contested Extractions (HIGH PRIORITY)

**Concept**: Special "Forged Harvesters" AI that specifically targets players in extraction zones.

```csharp
// Add to ExtractionZoneEnhanced
[Header("Contested Extraction")]
[SerializeField] private bool enableContestedExtraction = true;
[SerializeField] private GameObject harvesterPrefab;
[SerializeField] private float harvesterSpawnChance = 0.3f; // 30% per wave
[SerializeField] private float harvesterEnrageDistance = 10f; // Proximity triggers enrage

private void SpawnWave(int waveIndex)
{
    // Existing wave spawn code...
    
    // Add harvester chance
    if (enableContestedExtraction && UnityEngine.Random.value < harvesterSpawnChance)
    {
        SpawnHarvester();
    }
}

private void SpawnHarvester()
{
    var harvester = Instantiate(harvesterPrefab, GetRandomSpawnPosition(), Quaternion.identity);
    var ai = harvester.GetComponent<HarvesterAI>();
    ai.SetTargetZone(this); // Harvester specifically tries to enter zone
    harvester.GetComponent<NetworkObject>().Spawn(true);
}
```

### 3. VIP Extractions (MEDIUM PRIORITY)

**Concept**: Special cargo that must be carried to extraction for bonus rewards.

```csharp
public class VIPCargo : NetworkBehaviour
{
    [SerializeField] private LootDefinition bonusReward;
    [SerializeField] private int bonusXP = 1000;
    [SerializeField] private float movementPenalty = 0.3f; // 30% slower while carrying
    
    private NetworkVariable<ulong> carrierClientId = new(-1);
    
    public void OnExtraction(ExtractionZoneEnhanced zone)
    {
        if (carrierClientId.Value != ulong.MaxValue)
        {
            // Award bonus to carrier
            var carrier = NetworkManager.ConnectedClients[carrierClientId.Value];
            carrier.PlayerObject.GetComponent<PlayerInventory>()?.AddLoot(bonusReward, 1);
            carrier.PlayerObject.GetComponent<ProgressionManager>()?.AwardXP(bonusXP, carrierClientId.Value);
        }
    }
}
```

### 4. Emergency Extracts (LOW PRIORITY)

**Concept**: Limited-use, expensive extracts that bypass normal requirements.

```csharp
public class EmergencyExtract : NetworkBehaviour
{
    [SerializeField] private int creditCost = 5000;
    [SerializeField] private int usesPerRaid = 1;
    [SerializeField] private float extractTime = 10f; // Much faster
    [SerializeField] private bool penaltyOnUse = true; // Reputation hit
    
    private NetworkVariable<int> remainingUses;
    
    public bool TryEmergencyExtract(ulong clientId)
    {
        if (remainingUses.Value <= 0) return false;
        
        var wallet = GetPlayerWallet(clientId);
        if (wallet.Credits < creditCost) return false;
        
        wallet.RemoveCredits(creditCost);
        remainingUses.Value--;
        
        if (penaltyOnUse)
        {
            // Small reputation hit for "cowardly" extract
            GetPlayerFaction(clientId).ModifyReputation(-10);
        }
        
        // Instant extract
        HandleExtractionSuccess(clientId);
        return true;
    }
}
```

### 5. Disconnect Recovery (HIGH PRIORITY - BUG FIX)

```csharp
// Add to ExtractionZoneEnhanced
public override void OnClientDisconnect(ulong clientId)
{
    if (!IsServer) return;
    
    // Check if disconnected player was in extraction
    if (playersInZone.Contains(clientId) || missionRoster.Contains(clientId))
    {
        // Spawn corpse with their inventory
        if (NetworkManager.ConnectedClients.TryGetValue(clientId, out var client))
        {
            var inventory = client.PlayerObject?.GetComponent<PlayerInventory>();
            if (inventory != null && (inventory.Stacks.Count > 0 || inventory.ResourceStacks.Count > 0))
            {
                SpawnCorpseForInventory(client.PlayerObject, clientId, inventory);
                Debug.Log($"[ExtractionZoneEnhanced] Player {clientId} disconnected - spawned corpse with loot");
            }
        }
        
        playersInZone.Remove(clientId);
    }
}
```

---

## Unique Strengths (Keep These!)

### VeilCacheService - Excellent Design

The three-tier recovery system is **unique and compelling**:

1. **Grace Period** (10-25 min): Normal cost to recover
2. **Auction State**: 1.5x surcharge after grace
3. **Buyback State**: 2.5x surcharge + reputation cost

This is MORE forgiving than Tarkov while still having tension. Don't remove this!

### CollectorSweepManager - Smart Implementation

- Distance-based grace (farther from spawn = more time)
- Hot zone penalty (contested areas = less time)
- Difficulty scaling
- Telemetry integration

### Network Architecture - Solid Foundation

- Server-authoritative with client prediction where appropriate
- NetworkVariables for synced state
- Events for UI updates
- RPC permissions properly set

---

## Implementation Priority

### Phase 1 - Critical Fixes
1. ❌ **Disconnect handling** - Loot loss is unacceptable
2. ❌ **PlayersInZone sync** - Clients need this for UI

### Phase 2 - Expected Features  
3. 🔶 **Multiple extraction points** - Core extraction shooter feature
4. 🔶 **Randomized extracts** - Replayability

### Phase 3 - Enhancement
5. 🔷 **Contested extraction AI** - Harvester enemies
6. 🔷 **Conditional extracts** - Keys, items, currency
7. 🔷 **Party warnings** - "Squad incomplete" UI

### Phase 4 - Nice to Have
8. ⬜ **VIP cargo**
9. ⬜ **Emergency extracts**
10. ⬜ **Time-limited extracts**

---

## Code Quality Notes

### Positive
- Clean separation of concerns
- Good use of events for loose coupling
- Comprehensive XML documentation
- Proper null checking throughout
- Telemetry integration (RuntimeTelemetryRecorder)

### Areas for Improvement
- `playersInZone` should be a `NetworkList` for client visibility
- Some magic numbers should be `const` or serialized fields
- Consider extracting wave spawning to separate component for reuse
- Add unit tests for edge cases (disconnect, roster enforcement)

---

## Files Modified/Created

**Reviewed Files**:
- `Assets/Scripts/Gameplay/FirstPlayable/Mission/ExtractionZone.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Mission/ExtractionZoneEnhanced.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Mission/FirstMissionController.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Mission/StoryMissionController.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/UI/ExtractionUI.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Loot/CollectorSweepManager.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Loot/CorpseLootContainer.cs`
- `Assets/Scripts/Gameplay/FirstPlayable/Loot/VeilCacheService.cs`
- `Assets/Editor/FirstPlayableSetup.cs`

**No code changes made** - This is a review/audit document.

---

## Validation Footer

```
---
VALIDATION:
- Output file: memory/bloom-code/extraction-system-review.md ✓ exists
- Completeness: complete
- Self-check: PASS - All major extraction files reviewed
- Confidence: high
```

---

*Generated by bloom-extraction-review subagent*
