# Deep Dive: Bloom Networking Layer

**Audit Date:** 2025-01-21  
**Analyst:** Subagent (bloom-networking-respawn)  
**Scope:** Full networking implementation analysis for EA readiness

---

## Executive Summary

Bloom uses **Unity Netcode for GameObjects (NGO)** with a custom **Steam P2P transport** layer built on Steamworks.NET (compatible with Heathen Toolkit). The architecture is **server-authoritative** with proper security patterns including RPC rate limiting, ownership validation, and lag compensation for damage systems.

### Key Strengths
- ✅ Server-authoritative damage with lag compensation (0.5s rewind)
- ✅ Custom Steam P2P transport with fallback to Unity Transport
- ✅ RPC rate limiting to prevent DoS attacks
- ✅ Owner-validated RPCs using `RpcInvokePermission.Owner`
- ✅ Connection approval with player limits (8-10 players)
- ✅ NetworkVariable patterns with proper permissions

### Key Concerns
- ⚠️ 214 `FindObjectOfType` calls (performance risk in networked Update loops)
- ⚠️ No explicit tick rate configuration found
- ⚠️ 2 `RequireOwnership = false` ServerRpcs without additional validation
- ⚠️ NetworkTransform at 10Hz may be insufficient for fast-paced combat

---

## 1. Netcode Architecture

### Core Components

| File | Lines | Purpose |
|------|-------|---------|
| `Networking/BloomNetworkManager.cs` | ~870 | Main network manager wrapper, connection approval, Steam/Unity transport switching |
| `Networking/SteamworksNetcodeTransport.cs` | ~820 | Custom Steam P2P transport using SteamNetworkingSockets |
| `Networking/PlayerData.cs` | ~350 | Player identity & state with NetworkVariables |
| `Networking/NetworkPlayerSpawner.cs` | ~420 | Connection approval handler, player spawning |
| `Combat/NetworkedDamageSystem.cs` | ~340 | Server-authoritative damage with lag compensation |

### NetworkManager Setup

**BloomNetworkManager** wraps Unity's `NetworkManager.Singleton` and provides:

```csharp
// BloomNetworkManager.cs - Key Configuration
[SerializeField] private int maxPlayers = 10;
[SerializeField] private bool useSteamTransport = false;
[SerializeField] private bool autoDetectSteam = true;
```

**Connection Approval Flow:**
1. `HandleConnectionApproval()` validates player limit
2. Steam authentication via `IAuthorizationService` (if available)
3. Approval handlers from `NetworkPlayerSpawner` for spawn position
4. Player object created with faction-specific spawn point

### NetworkObject Patterns

Found **60+ NetworkBehaviour classes** across the codebase:

**Entity Types:**
- `PlayerData` - Player identity, health, faction
- `EnemyHealth`, `BossHealth` - Enemy damage handling
- `MemoryFragment` - Collectible memory items
- `ResourcePickup`, `LootPickup` - Pickup items
- `ExtractionZoneEnhanced` - Extraction mechanics
- `TerritoryManager`, `TerritoryCaptureTrigger` - Territory control
- `VeilCacheBroker` - Economy/trading
- `BiomeNetworkManager` - World state sync

---

## 2. RPCs Analysis

### ServerRpc Patterns

**Total ServerRpcs Found:** ~45 methods

**Secure Pattern (Owner-Validated):**
```csharp
// PlayerData.cs - GOOD: Owner-only with rate limiting
[Rpc(SendTo.Server, InvokePermission = RpcInvokePermission.Owner)]
public void RequestFactionChangeServerRpc(FactionType newFaction, RpcParams rpcParams = default)
{
    if (!IsServer) return; // Defense-in-depth
    
    // Validate sender matches owner
    ulong senderClientId = rpcParams.Receive.SenderClientId;
    if (senderClientId != OwnerClientId) return; // Security check
    
    // Rate limit: 1 change per 5 seconds
    if (Time.time - lastFactionChangeTime < FACTION_CHANGE_COOLDOWN) return;
    
    // Validate enum value
    if (!System.Enum.IsDefined(typeof(FactionType), newFaction)) return;
    
    Faction.Value = newFaction;
    lastFactionChangeTime = Time.time;
}
```

**RequireOwnership = false (Security Risk):**
```csharp
// EnemyHealth.cs - Allows any client to request damage
[ServerRpc(RequireOwnership = false)]
private void ApplyDamageServerRpc(float amount, Vector3 hitPoint, Vector3 hitNormal, ulong instigatorNetworkId)
{
    // ANALYSIS: This is acceptable because:
    // 1. Server validates via NetworkedDamageSystem hit validation
    // 2. Damage to enemies should be allowed from any player
    // 3. instigatorNetworkId is used for XP credit, not authorization
}
```

### ClientRpc Patterns

**Total ClientRpcs Found:** ~35 methods

**Good Patterns:**
- Targeted RPCs using `ClientRpcParams` for single-client updates
- Broadcast RPCs for visual effects (damage VFX, sounds)
- State sync RPCs with data validation

```csharp
// VeilCacheBroker.cs - GOOD: Targeted ClientRpc
[ClientRpc]
private void ClaimResultClientRpc(bool success, string message, float etaSeconds, ClientRpcParams rpcParams = default)
{
    OnClaimResult?.Invoke(success, message, etaSeconds);
}
```

### RPC Rate Limiting

**Implemented Cooldowns:**
| RPC | Cooldown | Purpose |
|-----|----------|---------|
| `RequestFactionChangeServerRpc` | 5s | Prevent faction spam |
| `RequestNameChangeServerRpc` | 10s | Prevent name spam |

**Missing Rate Limiting:**
- `RequestDamageServerRpc` (handled by hit validation instead)
- `RequestPickupServerRpc` (covered by server-side availability check)
- Ability RPCs (cooldowns are inherent to ability design)

---

## 3. NetworkVariables

### Synchronization Patterns

**Total NetworkVariables Found:** ~50+ declarations

**Consistent Pattern:**
```csharp
// Everyone can read, only server can write
public NetworkVariable<float> CurrentHealth = new NetworkVariable<float>(
    100f,
    NetworkVariableReadPermission.Everyone,
    NetworkVariableWritePermission.Server
);
```

**Owner-Only Read:**
```csharp
// Economy wallets - only owner sees balance
private NetworkVariable<int> balance = new NetworkVariable<int>(
    0, 
    NetworkVariableReadPermission.Owner, 
    NetworkVariableWritePermission.Server
);
```

### NetworkVariable Categories

| Category | Variables | Permission |
|----------|-----------|------------|
| **Player Identity** | `PlayerName`, `Faction` | Everyone/Server |
| **Player State** | `CurrentHealth`, `MaxHealth`, `IsAlive` | Everyone/Server |
| **Progression** | `PlayerLevel`, `PlayerXP`, `AvailableSkillPoints` | Everyone/Server |
| **Economy** | `balance` (currency), `rep` (reputation) | Owner/Server |
| **Abilities** | `PrimaryCooldownRemaining`, `IsAbilityActive` | Everyone/Server |
| **Territory** | Capture progress per faction (7 vars) | Everyone/Server |
| **Extraction** | `extractionEnabled`, `extractionTimer`, `currentWave` | Everyone/Server |

### Value Change Callbacks

Proper subscription pattern:
```csharp
public override void OnNetworkSpawn()
{
    CurrentHealth.OnValueChanged += OnHealthChanged;
    Faction.OnValueChanged += OnFactionChanged;
}

public override void OnNetworkDespawn()
{
    CurrentHealth.OnValueChanged -= OnHealthChanged; // Prevents memory leaks
}
```

---

## 4. Connection Flow

### Host/Client Setup

**BloomNetworkManager.StartHost():**
1. Authorization check (`IAuthorizationService.CanStartHost`)
2. Configure transport (Steam or Unity)
3. `NetworkManager.Singleton.StartHost()`
4. Retry logic with exponential backoff (up to 10 retries for Steam)
5. Register telemetry sinks

**Steam P2P Connection:**
```csharp
// SteamworksNetcodeTransport.cs
public override bool StartServer()
{
    // Create listen socket for P2P connections
    listenSocket = SteamNetworkingSockets.CreateListenSocketP2P(0, options.Length, options);
}

public override bool StartClient()
{
    // Connect to host via Steam ID
    SteamNetworkingIdentity identity = new SteamNetworkingIdentity();
    identity.SetSteamID(hostSteamId);
    serverConnection = SteamNetworkingSockets.ConnectP2P(ref identity, 0, 0, options);
}
```

### Steam Transport Integration

**Transport Selection Logic:**
1. Auto-detect Steam if `autoDetectSteam = true`
2. Use `HeathenSteamAdapter.IsSteamInitialized()` for Steam check
3. Wait up to 2 seconds for Steam initialization
4. Fallback to Unity Transport if Steam unavailable

**Retry Mechanism:**
```csharp
// Exponential backoff: 0.1s, 0.2s, 0.3s, 0.5s, 0.75s, 1s, 1.5s, 2s, 2.5s, 3s
private IEnumerator RetryStartHostCoroutine()
{
    const int maxRetries = 10;
    float[] retryDelays = { 0.1f, 0.2f, 0.3f, 0.5f, 0.75f, 1f, 1.5f, 2f, 2.5f, 3f };
    // Pump SteamAPI.RunCallbacks() between retries
}
```

### Connection Approval

**NetworkPlayerSpawner Flow:**
```csharp
private void HandleApproval(ConnectionApprovalRequest request, ConnectionApprovalResponse response)
{
    // 1. Player limit check (via BloomNetworkManager)
    // 2. Steam auth validation (optional)
    // 3. Spawn position assignment (faction-based)
    response.Approved = true;
    response.CreatePlayerObject = true;
}
```

---

## 5. Prediction/Reconciliation

### Lag Compensation (NetworkedDamageSystem)

**Server-Side Position History:**
```csharp
private const float SNAPSHOT_INTERVAL = 0.1f; // Store position every 100ms
private const int MAX_SNAPSHOTS = 20;         // Keep 2 seconds of history
private float lagCompensationTime = 0.5f;     // Rewind window
```

**Hit Validation:**
1. Validate attacker-to-hit distance (max 200m)
2. Validate hit point near target (0.5m tolerance)
3. Server-side raycast validation
4. Rewind target position based on client timestamp

### NetworkTransform Configuration

From `CreateNetworkedPlayerPrefab.cs`:
```csharp
// NetworkTransform with interpolation at 10Hz
var networkTransform = playerPrefab.AddComponent<NetworkTransform>();
// Interpolation enabled
```

**⚠️ Potential Issue:** 10Hz (100ms) position updates may feel sluggish for fast combat. Consider:
- Increasing to 20-30Hz for player movement
- Using client-side prediction for local player

### No Client-Side Prediction Found

The codebase uses **server-authoritative without client prediction**:
- All movement is server-confirmed
- No input buffer or rollback netcode
- Acceptable for 8-10 player co-op (lower latency sensitivity than PvP)

---

## 6. Bandwidth Considerations

### Message Sizes

**NetworkVariable Types:**
| Type | Size | Variables |
|------|------|-----------|
| `FixedString64Bytes` | 64B | PlayerName |
| `float` | 4B | Health, cooldowns, timers |
| `int` | 4B | Level, XP, skill points |
| `bool` | 1B | IsAlive, states |
| `FactionType` (enum) | 4B | Faction |

**Estimated Per-Player State:** ~150-200 bytes (excluding NetworkTransform)

### Update Frequencies

| System | Frequency | Notes |
|--------|-----------|-------|
| NetworkTransform | 10 Hz | Position sync |
| Lag Comp Snapshots | 10 Hz | Server-side position history |
| BiomeNetworkManager | Configurable | World state sync |

### RPC Payload Sizes

**Damage RPC:**
```csharp
RequestDamageServerRpc(
    ulong targetClientId,      // 8B
    float damageAmount,        // 4B
    Vector3 hitPoint,          // 12B
    Vector3 hitDirection,      // 12B
    float clientTimestamp      // 4B
);
// Total: ~40 bytes + RPC overhead
```

---

## 7. Anti-Patterns Found

### High Priority

| Issue | Count | Files | Risk |
|-------|-------|-------|------|
| `FindObjectOfType` | 214 | 40+ files | High frame time spikes in Update |
| `GameObject.Find` | 44 | 20+ files | String-based lookup, GC pressure |
| `async void` | 2 | BiomeManager, TerrainPipelineWindow | Unhandled exceptions |

### Networking-Specific

| Issue | Location | Recommendation |
|-------|----------|----------------|
| `RequireOwnership = false` without additional validation | `CompanionCommandNetworkProxy.cs` | Add sender validation |
| No tick rate configuration | Global | Consider `NetworkManager.NetworkConfig.TickRate` |
| InvokeRepeating for lag comp | `NetworkedDamageSystem.cs` | Consider FixedUpdate for determinism |

### Anti-Pattern Details

**FindObjectOfType in Networking:**
```
TileGenerationContext.cs: 7 calls
QuestTracker.cs: 7 calls
MultiplayerSaveLoadManagerSetup.cs: 5 calls
TransportHarnessControlPanel.cs: 4 calls
```

**Recommendation:** Use ServiceLocator pattern (already in codebase) consistently.

---

## 8. EA Readiness Assessment

### ✅ Ready for EA

1. **Server Authority** - All critical state is server-controlled
2. **Steam Integration** - P2P transport with lobby support ready
3. **Connection Management** - Player limits, approval, disconnect handling
4. **Security Basics** - RPC validation, rate limiting, ownership checks
5. **Lag Compensation** - 0.5s rewind window for hit validation

### ⚠️ Should Address Before EA

| Issue | Priority | Effort |
|-------|----------|--------|
| Replace FindObjectOfType in networked paths | High | Medium |
| Add tick rate configuration | Medium | Low |
| Validate CompanionCommand RPCs | Medium | Low |
| Increase NetworkTransform update rate | Medium | Low |
| Add network statistics UI (RTT, packet loss) | Low | Medium |

### 🔴 Not Required for EA

- Client-side prediction (acceptable for co-op)
- Advanced rollback netcode
- Dedicated server support (Steam P2P sufficient for 8-10 players)

---

## 9. File Reference

### Core Networking (~3,500 LOC)
```
Networking/BloomNetworkManager.cs         ~870 lines
Networking/SteamworksNetcodeTransport.cs  ~820 lines
Networking/PlayerData.cs                  ~350 lines
Networking/NetworkPlayerSpawner.cs        ~420 lines
Networking/PlayerRoster.cs                ~100 lines
Networking/INetworkManager.cs             ~30 lines
```

### Gameplay Networking (~2,500 LOC)
```
Combat/NetworkedDamageSystem.cs           ~340 lines
Mission/ExtractionZoneEnhanced.cs         ~900 lines
Territory/TerritoryManager.cs             ~220 lines
Territory/TerritoryCaptureTrigger.cs      ~290 lines
Factions/FactionAbilitySystem.cs          ~350 lines
```

### Persistence Networking (~800 LOC)
```
Networking/MultiplayerSaveLoadManager.cs  ~800 lines
Networking/PersistentNetworkObject.cs     ~170 lines
Networking/PersistentObjectManager.cs     ~240 lines
```

---

## Validation Footer

```
---
VALIDATION:
- Output file: memory/bloom-audit/deep-dive-networking.md ✓ exists
- Completeness: complete
- Self-check: PASS
  - Verified BloomNetworkManager.cs structure matches analysis
  - Verified RPC patterns against source files
  - Verified NetworkVariable permissions against declarations
  - Anti-pattern counts confirmed via bloom-search.ps1
- Confidence: high
```
