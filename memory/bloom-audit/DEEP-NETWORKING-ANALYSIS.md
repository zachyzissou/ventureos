# Bloom Networking & Multiplayer Deep Dive Analysis

**Audit Date:** January 28, 2026  
**Project Path:** `C:\Users\Zachg\Development\Games\Bloom`  
**Framework:** Unity Netcode for GameObjects (NGO)

---

## Executive Summary

The Bloom project has a **well-designed server-authoritative networking architecture** with proper use of NetworkVariables, NetworkLists, and RPCs. However, several critical gaps exist that could cause multiplayer desync issues.

### Key Findings
- ✅ **PlayerInventory IS networked** - Contrary to the reported issue, it uses NetworkLists properly
- ✅ **TileStateSynchronizationSystem is well-designed** - Uses NetworkLists with offline fallback
- ⚠️ **EnemyHealth is NOT networked** - Uses MonoBehaviour, not NetworkBehaviour
- ⚠️ **PlayerHealth is NOT networked** - Local-only, relies on PlayerData for network sync
- ❌ **EnemySpawner lacks NetworkBehaviour** - Server checks exist but no proper spawn replication

---

## 1. NetworkBehaviour Inventory

### Complete List (45 NetworkBehaviour Classes)

| Class | File Path | Sync Type | Authority |
|-------|-----------|-----------|-----------|
| **PlayerData** | `Networking/PlayerData.cs` | 5 NetworkVariables | Server |
| **PlayerInventory** | `Loot/PlayerInventory.cs` | 2 NetworkLists | Server |
| **PlayerRoster** | `Networking/PlayerRoster.cs` | Events Only | Server |
| **NetworkPlayerSpawner** | `Networking/NetworkPlayerSpawner.cs` | Spawn Control | Server |
| **PlayerStash** | `Persistence/PlayerStash.cs` | 2 NetworkLists | Server |
| **TileStateSynchronizationSystem** | `Multiplayer/TileStateSynchronizationSystem.cs` | 4 NetworkLists | Server |
| **NetworkedDamageSystem** | `Combat/NetworkedDamageSystem.cs` | RPCs | Server |
| **BossHealth** | `Boss/BossHealth.cs` | 2 NetworkVariables | Server |
| **BossEncounterController** | `Boss/BossEncounterController.cs` | Events | Server |
| **BossLeaderboard** | `Boss/BossLeaderboard.cs` | NetworkList | Server |
| **BossRespawnTracker** | `Boss/BossRespawnTracker.cs` | NetworkVariable | Server |
| **BossRotationManager** | `Boss/BossRotationManager.cs` | NetworkVariables | Server |
| **ExtractionZoneEnhanced** | `Mission/ExtractionZoneEnhanced.cs` | 4 NetworkVariables | Server |
| **TimeOfDaySystem** | `Systems/TimeOfDaySystem.cs` | 3 NetworkVariables | Server |
| **CurrencyWallet** | `Economy/CurrencyWallet.cs` | 1 NetworkVariable | Server |
| **ReputationWallet** | `Economy/ReputationWallet.cs` | 1 NetworkVariable | Server |
| **ProgressionManager** | `Progression/ProgressionManager.cs` | 3 NetworkVariables | Server |
| **SkillPointSystem** | `Progression/SkillPointSystem.cs` | NetworkVariables | Server |
| **FactionAbilitySystem** | `Factions/FactionAbilitySystem.cs` | 3 NetworkVariables | Server |
| **WeaponRestrictionSystem** | `Factions/WeaponRestrictionSystem.cs` | NetworkVariable | Server |
| **FactionAbilityEffects** | `Factions/FactionAbilityEffects.cs` | RPCs | Server |
| **LootPickup** | `Loot/LootPickup.cs` | 2 NetworkVariables | Server |
| **ResourcePickup** | `Loot/ResourcePickup.cs` | 2 NetworkVariables | Server |
| **VeilCacheBroker** | `Loot/VeilCacheBroker.cs` | RPCs | Server |
| **VeilCacheService** | `Loot/VeilCacheService.cs` | Service | Server |
| **CollectorSweepManager** | `Loot/CollectorSweepManager.cs` | NetworkList | Server |
| **CorpseLootContainer** | `Loot/CorpseLootContainer.cs` | NetworkLists | Server |
| **EnemyAIController** | `Enemy/EnemyAIController.cs` | Server Logic Only | Server |
| **AdvancedEnemyAI** | `Enemies/AdvancedEnemyAI.cs` | Server Logic Only | Server |
| **RusherEnemyAI** | `Enemies/RusherEnemyAI.cs` | Server Logic Only | Server |
| **SupportEnemyAI** | `Enemies/SupportEnemyAI.cs` | Server Logic Only | Server |
| **BossEnemyAI** | `Enemy/BossEnemyAI.cs` | Server Logic Only | Server |
| **EnemyXPHandler** | `Progression/EnemyXPHandler.cs` | RPCs | Server |
| **NetworkSpawnFx** | `Enemy/NetworkSpawnFx.cs` | RPCs | Server |
| **CompanionCommandNetworkProxy** | `Companions/CompanionCommandNetworkProxy.cs` | RPCs | Server |
| **CompanionStatusNetworkSync** | `Companions/CompanionStatusNetworkSync.cs` | 4 NetworkVariables | Server |
| **POIComponent** | `Encounters/POIComponent.cs` | NetworkVariable | Server |
| **BiomeManager** | `Terrain/BiomeManager.cs` | Limited | Server |
| **BiomeNetworkManager** | `Terrain/BiomeNetworkManager.cs` | 2 NetworkVariables | Server |
| **PersistentNetworkObject** | `Networking/PersistentNetworkObject.cs` | 2 NetworkVariables | Server |
| **PersistentObjectManager** | `Networking/PersistentObjectManager.cs` | Management | Server |
| **MultiplayerSaveLoadManager** | `Networking/MultiplayerSaveLoadManager.cs` | RPCs | Server |
| **BaseDefenseController** | `BaseDefense/BaseDefenseController.cs` | NetworkVariables | Server |
| **VeilCacheKioskUI** | `UI/VeilCacheKioskUI.cs` | RPCs | Client |
| **HeathenTransportMessageHarness** | `Networking/HeathenTransportMessageHarness.cs` | Transport | Both |

---

## 2. RPC Audit

### ServerRpc Methods (Modern [Rpc(SendTo.Server)] Style)

| Class | Method | Parameters | Purpose |
|-------|--------|------------|---------|
| **PlayerData** | `RequestFactionChangeServerRpc` | FactionType, RpcParams | Faction change (rate-limited) |
| **PlayerData** | `RequestNameChangeServerRpc` | FixedString64Bytes, RpcParams | Name change (rate-limited) |
| **PlayerInventory** | `RequestAddLootServerRpc` | string, int | Add loot to inventory |
| **PlayerInventory** | `RequestAddResourceServerRpc` | string, int | Add resource to inventory |
| **PlayerInventory** | `RequestResetServerRpc` | none | Reset inventory |
| **LootPickup** | `RequestPickupServerRpc` | RpcParams | Request pickup |
| **ResourcePickup** | `RequestPickupServerRpc` | RpcParams | Request pickup |
| **NetworkedDamageSystem** | `RequestDamageServerRpc` | ulong, float, Vector3, Vector3, float, RpcParams | Request damage validation |
| **FactionAbilitySystem** | `RequestPrimaryAbilityServerRpc` | none | Use primary ability |
| **FactionAbilitySystem** | `RequestSecondaryAbilityServerRpc` | none | Use secondary ability |
| **ProgressionManager** | `AwardXPServerRpc` | int, RpcParams | Award XP |
| **VeilCacheBroker** | `ClaimCacheServerRpc` | ulong | Claim veil cache |
| **VeilCacheBroker** | `RequestCacheStateServerRpc` | ulong | Request cache state |
| **ExtractionZoneEnhanced** | `EnableExtractionServerRpc` | bool | Enable/disable extraction |
| **PersistentNetworkObject** | `RequestPickupServerRpc` | ulong | Pick up persistent object |
| **PersistentNetworkObject** | `RequestDestroyServerRpc` | ulong | Destroy persistent object |
| **TileStateSynchronizationSystem** | `RequestRegisterTileStateServerRpc` | int, int, int | Register tile state |
| **TileStateSynchronizationSystem** | `RequestUpdatePOIStateServerRpc` | string, int, float, int | Update POI state |
| **TileStateSynchronizationSystem** | `RequestUpdateResourceStateServerRpc` | string, bool, float, int | Update resource state |
| **TileStateSynchronizationSystem** | `RequestUpdateSpawnPointStateServerRpc` | string, bool, int | Update spawn point |
| **BiomeNetworkManager** | `UpdateWorldGenerationProgressServerRpc` | float, RpcParams | Update world gen progress |
| **TimeOfDaySystem** | `RequestSetTimeServerRpc` | float, ServerRpcParams | Set time (admin) |
| **TimeOfDaySystem** | `RequestTogglePauseServerRpc` | ServerRpcParams | Toggle pause (admin) |
| **BossRespawnTracker** | `RecordBossKillServerRpc` | string | Record boss kill |

### ClientRpc Methods

| Class | Method | Parameters | Purpose |
|-------|--------|------------|---------|
| **NetworkedDamageSystem** | `PlayDamageEffectClientRpc` | Vector3, Vector3, Vector3 | VFX on all clients |
| **FactionAbilitySystem** | `BroadcastAbilityUsedClientRpc` | int | Ability VFX |
| **FactionAbilitySystem** | `SendAbilityFailedFeedbackClientRpc` | string | Feedback |
| **ExtractionZoneEnhanced** | `PlaySoundClientRpc` | int | Audio on all clients |
| **VeilCacheBroker** | `ClaimResultClientRpc` | bool, string, float, ClientRpcParams | Targeted result |
| **VeilCacheBroker** | `CacheStateClientRpc` | bool, float, float, float, bool, ClientRpcParams | Targeted state |
| **BiomeNetworkManager** | `NotifyBiomeEventClientRpc` | string | Biome events |

### RPC Patterns Assessment

**✅ Good Patterns:**
- Rate limiting on faction/name changes (DoS prevention)
- Owner permission enforcement via `RpcInvokePermission.Owner`
- Targeted ClientRpcs using `ClientRpcParams`
- Using modern `[Rpc(SendTo.X)]` attribute syntax

**⚠️ Patterns to Monitor:**
- `RpcInvokePermission.Everyone` used on some RPCs - ensure server validates authority
- No explicit bandwidth throttling on frequent RPCs

---

## 3. NetworkVariable Usage

### Per-Class Breakdown

#### PlayerData (High Priority)
```csharp
NetworkVariable<FixedString64Bytes> PlayerName     // Everyone/Server
NetworkVariable<FactionType> Faction               // Everyone/Server
NetworkVariable<float> CurrentHealth               // Everyone/Server
NetworkVariable<float> MaxHealth                   // Everyone/Server
NetworkVariable<bool> IsAlive                      // Everyone/Server
NetworkVariable<int> PlayerLevel                   // Everyone/Server
NetworkVariable<int> PlayerXP                      // Everyone/Server
```

#### PlayerInventory (NetworkLists)
```csharp
NetworkList<NetworkLootEntry> networkLootStacks    // Server-write
NetworkList<NetworkResourceEntry> networkResourceStacks // Server-write
```

#### TileStateSynchronizationSystem (NetworkLists)
```csharp
NetworkList<NetworkPOIEntry> networkPOIStates
NetworkList<NetworkResourceNodeEntry> networkResourceStates
NetworkList<NetworkSpawnPointEntry> networkSpawnPointStates
NetworkList<NetworkTileEntry> networkTileEntries
```

#### BossHealth
```csharp
NetworkVariable<float> currentHealth               // Everyone/Server
NetworkVariable<bool> isAlive                      // Everyone/Server
```

#### ExtractionZoneEnhanced
```csharp
NetworkVariable<bool> extractionEnabled
NetworkVariable<float> extractionTimer
NetworkVariable<int> currentWave
NetworkVariable<bool> extractionInProgress
NetworkVariable<bool> extractionSuccess
```

#### TimeOfDaySystem
```csharp
NetworkVariable<float> _networkTimeOfDay           // Everyone/Server
NetworkVariable<bool> _networkTimePaused           // Everyone/Server
NetworkVariable<float> _networkTimeScale           // Everyone/Server
```

#### CurrencyWallet
```csharp
NetworkVariable<int> balance                       // Owner/Server
```

#### CompanionStatusNetworkSync
```csharp
NetworkVariable<FixedString64Bytes> StatusMessage
NetworkVariable<int> ModeValue
NetworkVariable<bool> StatusIsError
NetworkVariable<float> CommandCooldownRemaining
```

---

## 4. State Synchronization Analysis

### What Syncs ✅

| System | Synced Data | Method |
|--------|-------------|--------|
| Player Identity | Name, Faction, Level, XP | NetworkVariables |
| Player Health | Current, Max, Alive | NetworkVariables in PlayerData |
| Player Inventory | Loot, Resources | NetworkLists |
| Boss Health | Current, Max, Alive | NetworkVariables |
| Extraction | Timer, Wave, Progress, Success | NetworkVariables |
| Time of Day | Hour, Pause, Scale | NetworkVariables |
| Tile State | POIs, Resources, Spawn Points | NetworkLists |
| Companion Status | Mode, Status, Cooldown | NetworkVariables |
| Currency/Reputation | Balance | NetworkVariables (Owner-read) |
| Progression | Level, XP, Skill Points | NetworkVariables |

### What DOESN'T Sync ❌

| System | Issue | Impact |
|--------|-------|--------|
| **EnemyHealth** | MonoBehaviour, not NetworkBehaviour | P0 - Enemies will desync |
| **PlayerHealth** | MonoBehaviour, relies on PlayerData | P1 - Works via PlayerData but fragile |
| **EnemySpawner** | MonoBehaviour with server checks | P1 - Spawning works, but lacks proper replication |
| **Weapon State** | Not implemented | P2 - Future feature |
| **AI Targeting** | Server-only, no client prediction | P2 - Visual lag on clients |

### What SHOULD Sync But Doesn't

1. **EnemyHealth** (P0 Critical)
   - Currently a MonoBehaviour
   - Enemies on clients won't show damage correctly
   - Death events may not trigger properly on clients

2. **Projectiles/Bullets** (P2)
   - No visible projectile sync system
   - Relies on hit validation only

3. **Animation States** (P2)
   - No NetworkAnimator references found
   - Player/Enemy animations may desync

---

## 5. Authority Model Analysis

### Server-Authoritative ✅
The codebase is **fully server-authoritative**:

- All NetworkVariables use `NetworkVariableWritePermission.Server`
- All gameplay-affecting RPCs are ServerRpcs
- Client can only REQUEST changes, server validates and applies
- Damage system validates hits server-side with lag compensation

### No Client Prediction ⚠️
- Movement: Uses Unity's NetworkTransform (likely)
- Combat: No client-side hit prediction
- Input: Standard request/response model

### Security Measures
- RPC rate limiting (5s faction, 10s name changes)
- Ownership validation on sensitive RPCs
- Hit validation with distance checks
- Lag compensation in damage system (0.5s rewind)

---

## 6. Connection Flow Analysis

### Host/Join Flow

1. **Connection Approval** (`NetworkPlayerSpawner.HandleApproval`)
   - Validates player count (max 10)
   - Waits for PlayerRoster initialization
   - Sets `CreatePlayerObject = true`

2. **Player Spawn** (`NetworkPlayerSpawner.OnClientConnected`)
   - Server spawns player prefab
   - Uses round-robin spawn points
   - Supports faction-specific spawns

3. **PlayerData Initialization** (`PlayerData.OnNetworkSpawn`)
   - Registers with PlayerRoster
   - Subscribes to NetworkVariable changes
   - Client receives initial state

4. **PlayerInventory Initialization** (`PlayerInventory.OnNetworkSpawn`)
   - NetworkLists auto-sync to late joiners
   - Subscribes to list change events

### Disconnect Handling (`NetworkPlayerSpawner.OnClientDisconnect`)
- Stops respawn coroutines
- Despawns NetworkObject
- Unregisters from PlayerRoster
- Cleanup prevents memory leaks

### Late Joiner Sync
- NetworkVariables auto-sync current state
- NetworkLists replay all entries
- TileStateSynchronizationSystem fires `OnTileStatesSynchronized`

---

## 7. Bandwidth Concerns

### High-Frequency Updates ⚠️

| System | Update Frequency | Concern |
|--------|------------------|---------|
| TimeOfDaySystem | Every frame | Low - single float |
| BiomeNetworkManager | 1Hz (configurable) | OK - batched |
| CompanionStatusNetworkSync | Every frame | Medium - polls helper |
| FactionAbilitySystem | Every frame (cooldowns) | Low - minimal delta |

### Large Sync Operations ⚠️

| System | Size | When |
|--------|------|------|
| TileStateSynchronizationSystem | 4 NetworkLists | Initial sync |
| PlayerInventory | 2 NetworkLists | On join |
| BossLeaderboard | 1 NetworkList | On request |

### Optimization Opportunities

1. **CompanionStatusNetworkSync.Update()** - Polls every frame
   - Should use dirty checking or interval updates

2. **NetworkLists on Late Join** - May cause spike
   - Consider chunked initial sync

3. **TimeOfDaySystem.Update()** - Updates every frame
   - Could batch to 10Hz without visual difference

---

## 8. Critical Gaps & Fixes Required

### P0 - Game Breaking

#### 1. EnemyHealth Not Networked
**File:** `Assets/Scripts/Gameplay/FirstPlayable/Enemy/EnemyHealth.cs`  
**Line:** 14 (class declaration)

**Current:**
```csharp
public class EnemyHealth : MonoBehaviour, IDamageable
```

**Fix Required:**
```csharp
[RequireComponent(typeof(NetworkObject))]
public class EnemyHealth : NetworkBehaviour, IDamageable
{
    private NetworkVariable<float> _currentHealth = new(...);
    private NetworkVariable<bool> _isAlive = new(...);
    // ... convert currentHealth/isAlive to NetworkVariables
}
```

**Impact:** Without this fix, enemy health will desync between server and clients. Clients will see enemies at different health states than the server.

### P1 - Major Issues

#### 2. PlayerHealth Local-Only Design
**File:** `Assets/Scripts/Gameplay/FirstPlayable/Player/PlayerHealth.cs`  
**Line:** 13 (class declaration)

**Current:** Local MonoBehaviour, intended for single-player only.

**Issue:** The class explicitly states it "Mirrors the API of PlayerData.TakeDamage so we can later swap it for a networked proxy."

**Recommendation:** 
- Use PlayerData.CurrentHealth/IsAlive directly for multiplayer
- Or convert PlayerHealth to delegate to PlayerData when networked
- Add `[Obsolete]` attribute and mark for removal

#### 3. EnemySpawner Not a NetworkBehaviour
**File:** `Assets/Scripts/Gameplay/FirstPlayable/Enemy/EnemySpawner.cs`  
**Line:** 15 (class declaration)

**Current:**
```csharp
public class EnemySpawner : MonoBehaviour
```

**Issue:** Has server checks but spawned enemies use NetworkObject.Spawn() without the spawner being network-aware. This works but is fragile.

**Recommendation:** Convert to NetworkBehaviour for proper lifecycle management:
```csharp
[RequireComponent(typeof(NetworkObject))]
public class EnemySpawner : NetworkBehaviour
```

### P2 - Minor Issues

#### 4. Missing NetworkAnimator Integration
**Recommendation:** Add NetworkAnimator to player/enemy prefabs for animation sync.

#### 5. CompanionStatusNetworkSync Polling
**File:** `Assets/Scripts/Gameplay/FirstPlayable/Companions/CompanionStatusNetworkSync.cs`  
**Line:** 38-60 (Update method)

**Current:** Polls every frame
```csharp
private void Update()
{
    if (!IsServer || helper == null) return;
    // ... updates every frame
}
```

**Fix:** Add dirty checking or interval:
```csharp
private float _updateTimer;
private const float UPDATE_INTERVAL = 0.25f;

private void Update()
{
    if (!IsServer || helper == null) return;
    _updateTimer += Time.deltaTime;
    if (_updateTimer < UPDATE_INTERVAL) return;
    _updateTimer = 0f;
    // ... updates
}
```

---

## 9. Patterns Assessment

### Good Patterns ✅

1. **Consistent Server Authority**
   - All writes go through server
   - Clients request, server validates

2. **NetworkList for Collections**
   - PlayerInventory uses NetworkList correctly
   - Auto-handles late joiner sync

3. **Offline Fallback Support**
   - PlayerInventory supports offline mode
   - TileStateSynchronizationSystem supports offline mode
   - Good for single-player compatibility

4. **Rate Limiting on RPCs**
   - PlayerData rate-limits faction/name changes
   - Prevents DoS attacks

5. **FixedString for Network Strings**
   - Uses FixedString64Bytes instead of string
   - Avoids GC allocation in network loop

6. **Custom INetworkSerializable Structs**
   - Proper serialization for complex types
   - Efficient network transfer

### Anti-Patterns ⚠️

1. **Mixed MonoBehaviour/NetworkBehaviour**
   - EnemyHealth is MonoBehaviour
   - PlayerHealth is MonoBehaviour
   - Should be consistent

2. **FindFirstObjectByType in Network Code**
   - Several places use this for singletons
   - Can be slow and error-prone
   - Should use ServiceLocator consistently

3. **Magic Numbers**
   - Rate limit values hardcoded
   - Should be in config/constants

---

## 10. Summary & Priority Matrix

### Critical Path for Multiplayer

| Priority | Issue | File | Fix Effort |
|----------|-------|------|------------|
| P0 | EnemyHealth not networked | `Enemy/EnemyHealth.cs` | Medium (2-4h) |
| P1 | PlayerHealth delegation | `Player/PlayerHealth.cs` | Low (1-2h) |
| P1 | EnemySpawner NetworkBehaviour | `Enemy/EnemySpawner.cs` | Low (1h) |
| P2 | CompanionSync polling | `Companions/CompanionStatusNetworkSync.cs` | Low (30m) |
| P2 | NetworkAnimator integration | Multiple prefabs | Medium (2-4h) |

### What's Working Well

- ✅ PlayerInventory properly networked with NetworkLists
- ✅ TileStateSynchronizationSystem well-designed
- ✅ Server-authoritative damage with lag compensation
- ✅ Proper connection/disconnection handling
- ✅ Rate limiting and security measures
- ✅ Late joiner support via NetworkLists

### Verification Checklist

- [ ] Convert EnemyHealth to NetworkBehaviour
- [ ] Test enemy damage sync across clients
- [ ] Verify PlayerHealth delegation works in multiplayer
- [ ] Add NetworkAnimator to prefabs
- [ ] Profile bandwidth in 10-player session
- [ ] Test late joiner sync with large inventories

---

*Report generated by networking audit subagent*
