# Bloom Multiplayer/Networking Deep Dive

**Date:** 2025-01-21  
**Auditor:** Clawdbot Subagent  
**Scope:** Complete networking architecture review for 8-10 player PvE co-op

---

## 1. Architecture Overview

### 1.1 Framework & Stack

| Component | Technology | Version |
|-----------|------------|---------|
| **Networking Framework** | Unity Netcode for GameObjects | 2.8.0 |
| **Primary Transport** | SteamworksNetcodeTransport (custom Steam P2P) | Custom impl |
| **Fallback Transport** | Unity Transport (UTP) | Built-in |
| **Steam Integration** | Steamworks.NET | 2025.162.1 |
| **Lobby System** | HeathenSteamAdapter + SteamMatchmaking | Custom wrapper |
| **Testing Tool** | ParrelSync (local multi-editor testing) | Installed |

### 1.2 Network Authority Model

**Server-Authoritative Design:**
- All gameplay state validated on server (damage, loot, extraction)
- `NetworkVariables` with `NetworkVariableWritePermission.Server` throughout
- RPC security: `RpcInvokePermission.Owner` for sensitive operations
- Rate limiting on RPCs (5s faction change, 10s name change)

### 1.3 Player Capacity

```csharp
// BloomNetworkManager.cs:23
[SerializeField] private int maxPlayers = 10;
```

- Hard cap at 10 players enforced in connection approval
- Dual enforcement: `BloomNetworkManager.CheckPlayerLimit()` + `NetworkPlayerSpawner.HandleApproval()`
- Boss scaling designed for 8-10 players (`optimalPlayerCount = 8`)

### 1.4 Host/Dedicated Server Model

**Supports Both:**
- **Host Mode:** Player runs as host+client (`StartHost()`)
- **Dedicated Server:** Headless server via `StartServer()`
- Transport auto-detection: Uses Unity Transport for Linux headless servers

```csharp
// BloomNetworkManager.cs - ConfigureTransport()
if (Application.platform == RuntimePlatform.LinuxServer ||
    Application.platform == RuntimePlatform.LinuxHeadlessSimulation)
{
    shouldUseSteam = false; // Use Unity Transport for dedicated servers
}
```

---

## 2. Core Networking Components

### 2.1 Network Manager Layer

| File | Purpose |
|------|---------|
| `BloomNetworkManager.cs` | Main network manager wrapper (525 LOC) |
| `NetworkPlayerSpawner.cs` | Server-authoritative player spawning (310 LOC) |
| `PlayerRoster.cs` | Player tracking dictionary (165 LOC) |
| `PlayerData.cs` | Per-player NetworkVariables (280 LOC) |
| `SteamworksNetcodeTransport.cs` | Custom Steam P2P transport (540 LOC) |
| `HeathenSteamAdapter.cs` | Steam lobby management (600 LOC) |

### 2.2 State Synchronization

**NetworkVariables in Use:**

| System | Variables | Sync Scope |
|--------|-----------|------------|
| PlayerData | `PlayerName`, `Faction`, `CurrentHealth`, `MaxHealth`, `IsAlive`, `PlayerLevel`, `PlayerXP` | Everyone |
| ExtractionZone | `extractionEnabled`, `extractionTimer`, `currentWave`, `extractionInProgress`, `extractionSuccess` | Everyone |
| BossHealth | `currentHealth`, `isAlive` | Everyone |
| BossLeaderboard | `NetworkList<BossLeaderboardEntry>` | Everyone |
| BossRespawnTracker | `NetworkList<BossKillData>` | Everyone |
| BossRotationManager | `currentBossIndex` | Everyone |
| CompanionStatus | `StatusMessage`, `ModeValue`, `StatusIsError`, `CommandCooldownRemaining` | Everyone |
| FactionAbilitySystem | `PrimaryCooldownRemaining`, `SecondaryCooldownRemaining`, `IsAbilityActive` | Everyone |
| ProgressionManager | `CurrentLevel`, `CurrentXP`, `AvailableSkillPoints` | Everyone |
| SkillPointSystem | `AvailableSkillPoints`, `NetworkList<unlockedPerkIds>` | Everyone |
| LootPickup | `lootGuidNet`, `quantityNet` | Everyone |
| ResourcePickup | `resourceGuidNet`, `quantityNet` | Everyone |
| CurrencyWallet | `balance` | Owner only |
| ReputationWallet | `rep` | Owner only |

### 2.3 RPC Usage

**ServerRpcs Found (validated with security checks):**
- `RequestFactionChangeServerRpc` (rate-limited, owner-only)
- `RequestNameChangeServerRpc` (rate-limited, owner-only)
- `RequestDamageServerRpc` (sender validation)
- `RequestPrimaryAbilityServerRpc` (owner-only)
- `RecordBossKillServerRpc` (public)
- `FollowServerRpc`, `GuardServerRpc`, `HarvestServerRpc` (companion commands)

**ClientRpcs Found:**
- `PlayDamageEffectClientRpc` (visual sync)
- `SendAbilityFailedFeedbackClientRpc` (UI feedback)

---

## 3. Test Coverage Status

### 3.1 Existing Network Tests

| Test Class | Test Count | Coverage Area |
|------------|------------|---------------|
| `NetworkChurnTests.cs` | 6 | Host/client join, leave, respawn, JIP |
| `ExtractionReplicationTests.cs` | 5 | Timer sync, wave sync, success/failure states |
| `MultiplayerPersistenceTests.cs` | 4 | World state, player data, reconnection |
| `PlayerRosterTests.cs` | 5 | Roster operations (unit tests) |
| `SteamTransportTests.cs` | 3 | Transport selection, host start |
| `SteamAuthenticationTests.cs` | ~3 | Steam auth flows |
| `SteamPresenceTests.cs` | ~2 | Presence updates |
| `SteamAchievementsTests.cs` | ~3 | Achievement integration |

**Total: ~31 network-related tests**

### 3.2 What's Tested

✅ Host startup and client connection  
✅ Join/leave state consistency  
✅ Respawn flows (dead player respawn)  
✅ Double-leave safety (no NREs)  
✅ Extraction timer/wave replication  
✅ JIP (join-in-progress) timer state restoration  
✅ Player roster operations  
✅ Transport configuration  
✅ Persistence save/load  

### 3.3 What's NOT Tested

❌ **10-player concurrent load test** - No test simulates 10 clients  
❌ **Multi-client interaction** - All tests are single-host only  
❌ **Network latency/packet loss simulation** - Network Simulator not used in tests  
❌ **Inventory sync** - PlayerInventory has no network tests  
❌ **Position/transform sync validation** - Relies on Netcode defaults  
❌ **Tile state sync** - TileStateSynchronizationSystem is stubbed  
❌ **Steam transport under load** - Tests use Unity Transport fallback  

---

## 4. Known Issues & Risks

### 4.1 TODOs Related to Networking

```
Assets/Scripts/Gameplay/FirstPlayable/Enemies/SupportEnemyAI.cs:185
// TODO: Route enemy weapon hits through a NetworkedEnemyWeaponController / NetworkedDamageSystem

Assets/Scripts/Performance/PrometheusMetricsExporter.cs:215
metrics[METRIC_NETWORK_LATENCY_MS] = 0f; // TODO: Implement actual latency tracking

Assets/Scripts/WorldGeneration/Multiplayer/TileStateSynchronizationSystem.cs:175,185
// TODO: Integrate with Unity Netcode or custom networking system
```

### 4.2 Disabled/Ignored Tests

Only 2 ignored tests found (terrain-related, not networking):
- `ThermalErosionStageTests` - Performance test environment-dependent
- No networking tests are skipped

### 4.3 Critical Gaps Identified

| Gap | Severity | Description |
|-----|----------|-------------|
| **PlayerInventory Not Networked** | 🔴 HIGH | `PlayerInventory.cs` uses local `List<>`, not `NetworkList<>`. Inventory changes won't sync to other clients. |
| **TileStateSynchronizationSystem Stubbed** | 🟠 MEDIUM | POI/resource state changes only logged, not transmitted. World state won't sync across clients. |
| **No 10-Player Load Test** | 🔴 HIGH | Zero evidence of validation at target player count. |
| **Latency Metrics Placeholder** | 🟡 LOW | Network latency tracking returns 0f always. |

### 4.4 Security Concerns

✅ RPC rate limiting implemented (DoS prevention)  
✅ Owner validation on sensitive RPCs  
✅ Server-authoritative damage system  
⚠️ `RecordBossKillServerRpc` allows `InvokePermission.Everyone` - potential for spoofed kills  

---

## 5. Production Readiness Assessment

### 5.1 Lobby System

**Status: ✅ Implemented**

- `HeathenSteamAdapter.CreateLobby()` - Creates Steam lobby (max 10 members)
- `HeathenSteamAdapter.JoinLobby()` - Joins existing lobby
- `HeathenSteamAdapter.SearchPublicLobbies()` - Lobby discovery
- Lobby metadata set (game name, version, owner)
- Automatic host/client start on lobby events

### 5.2 Session Management

**Status: ✅ Implemented**

- `BloomNetworkManager.HandleConnectionApproval()` with multi-handler support
- `NetworkPlayerSpawner.HandleApproval()` enforces 10-player cap
- `PlayerRoster` tracks all connected players with O(1) lookup
- Steam authentication integration (optional, via `SteamAuthService`)

### 5.3 Disconnection Handling

**Status: ✅ Implemented**

- `NetworkPlayerSpawner.OnClientDisconnect()` - Despawns NetworkObject, removes from roster
- `PlayerRoster.UnregisterPlayer()` - Manual cleanup API
- Corpse loot drop on death (`PlayerData.DropInventoryToCorpse()`)
- Respawn countdown (5s default)

### 5.4 Reconnection Support

**Status: ✅ Implemented**

- `MultiplayerSaveLoadManager` saves/loads player data
- Player state (level, XP, faction) persisted on disconnect
- `ApplyPlayerData()` restores state on reconnect
- JIP receives current NetworkVariable state automatically

### 5.5 Position/Transform Sync

**Status: ⚠️ Implicit Only**

- No explicit `NetworkTransform` configuration found in code search
- Relies on Netcode's default `NetworkObject` behavior
- May need explicit `NetworkTransform` component with interpolation settings

---

## 6. Validation Gap Analysis

### 6.1 The "10-Player Test Never Run" Concern

**Finding: CONFIRMED - No evidence of 10-player validation**

Evidence reviewed:
1. **NetworkChurnTests** - Single host only, no multi-client
2. **ExtractionReplicationTests** - Single host only
3. **SteamTransportTests** - Single host only
4. **ParrelSync installed** - But not used in automated tests
5. **No soak test for network churn** - `SoakTestFramework.cs` exists but not for networking

### 6.2 What Would Be Needed

To validate 10-player networking:

1. **Multi-Instance Test Harness**
   - Use ParrelSync to spawn 10 editor instances
   - Or use Unity's Multiplayer Tools for simulated clients

2. **Load Test Scenarios**
   - All 10 players in extraction zone simultaneously
   - Rapid player churn (join/leave cycling)
   - 10-player boss fight with damage/leaderboard updates
   - Inventory operations across all players

3. **Network Condition Testing**
   - Enable Unity Network Simulator with latency presets
   - Test packet loss scenarios
   - Test NAT traversal (Steam Relay)

4. **Metrics Validation**
   - Implement actual latency tracking (currently placeholder)
   - Monitor bandwidth per player
   - Track NetworkVariable update frequency

---

## 7. Recommendations

### 7.1 Critical (Before Launch)

1. **🔴 Network PlayerInventory**
   ```csharp
   // Current (broken):
   private readonly List<LootStack> stacks = new();
   
   // Should be:
   private NetworkList<LootStack> stacks;
   ```
   Or implement server-authoritative inventory with RPCs.

2. **🔴 Implement 10-Player Load Test**
   - Create `MultiClientLoadTests.cs` using ParrelSync
   - Test extraction zone with 10 concurrent players
   - Validate no NREs, state consistency, performance

3. **🔴 Implement TileStateSynchronizationSystem**
   - Replace log-only stubs with actual NetworkVariables
   - POI and resource state must sync across clients

### 7.2 High Priority

4. **🟠 Add NetworkTransform Validation**
   - Verify player positions sync correctly
   - Add interpolation settings for smooth movement

5. **🟠 Fix Boss Kill RPC Security**
   - `RecordBossKillServerRpc` should validate sender participated in fight
   - Or use server-only call pattern

6. **🟠 Implement Latency Metrics**
   - Use `SteamworksNetcodeTransport.GetCurrentRtt()` 
   - Feed into `PrometheusMetricsExporter`

### 7.3 Nice to Have

7. **🟡 Add Network Condition Tests**
   - Use Unity Network Simulator in automated tests
   - Test degraded network scenarios

8. **🟡 Steam Relay Testing**
   - Verify NAT traversal works
   - Test with players on different networks

---

## 8. Summary

### What Works Well

- ✅ Solid server-authoritative architecture
- ✅ Comprehensive NetworkVariable usage for most systems
- ✅ Security-conscious RPC design with rate limiting
- ✅ Complete lobby system with Steam integration
- ✅ Proper disconnection and reconnection handling
- ✅ Good test coverage for single-host scenarios

### What Needs Work

- ❌ PlayerInventory not networked (critical)
- ❌ TileStateSynchronizationSystem stubbed
- ❌ Zero 10-player validation tests
- ❌ No multi-client automated tests
- ❌ Network latency metrics placeholder

### Production Readiness Score

| Category | Score | Notes |
|----------|-------|-------|
| Architecture | 9/10 | Solid design, well-structured |
| Implementation | 7/10 | Most systems networked, inventory gap |
| Test Coverage | 5/10 | Good single-host, no multi-client |
| Scale Validation | 2/10 | No evidence of 10-player testing |
| **Overall** | **6/10** | Good foundation, validation gaps |

---

*Report generated by Clawdbot subagent for Bloom audit.*
