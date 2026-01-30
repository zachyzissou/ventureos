# Bloom Deep Architecture Analysis

**Audit Date:** January 28, 2026  
**Project Path:** `C:\Users\Zachg\Development\Games\Bloom`  
**Unity Version:** 6000.x (HDRP 17.3.0)  
**Codebase Size:** 785 C# files in Assets/

---

## Executive Summary

The Bloom codebase demonstrates **solid architecture fundamentals** with well-organized namespaces, proper assembly definitions, and server-authoritative multiplayer patterns. Critical findings for EA launch:

| Priority | Finding | Impact |
|----------|---------|--------|
| 🔴 HIGH | Duplicate enum definitions (3 EdgeDirection, 2 UINotificationType, 2 CoastalType) | Runtime conflicts |
| 🔴 HIGH | Duplicate class names (12 classes defined multiple times) | Compilation/serialization issues |
| 🟡 MEDIUM | Heavy Debug.Log usage (3,544 instances) | Performance overhead in builds |
| 🟡 MEDIUM | Singleton/Instance patterns (343 Singleton refs, 251 .Instance calls) | Coupling, test difficulty |
| 🟢 LOW | No DI framework | Manual wiring acceptable for project size |

---

## 1. Project Structure

### Folder Organization ✅ GOOD

```
Assets/
├── Scripts/                    # Main code (~785 files)
│   ├── Audio/                  # Audio systems
│   ├── Core/                   # Core services & messages
│   ├── Ecology/                # Ecosystem simulation
│   ├── Environment/            # Weather, water
│   ├── Gameplay/FirstPlayable/ # Combat, loot, missions, etc.
│   ├── Networking/             # 40 networking files
│   ├── Performance/            # Performance monitoring
│   ├── POI/                    # Points of interest
│   ├── Terrain/                # Terrain generation
│   ├── UI/                     # User interface
│   └── WorldGeneration/        # Procedural world gen
├── Editor/                     # Editor tools
├── Tests/                      # PlayMode tests
├── Plugins/                    # ParrelSync only
└── Packages/                   # NuGet packages (Roslyn, etc.)
```

**Verdict:** Clean separation. `FirstPlayable` folder under Gameplay contains the bulk of EA gameplay code.

### Assembly Definitions ✅ GOOD

| Assembly | Purpose | Dependencies |
|----------|---------|--------------|
| `com.bloom.runtime` | Main runtime | Netcode, Steamworks, HDRP, Input System |
| `com.bloom.editor.core` | Core editor tools | Runtime, Editor scripts, Testing |
| `com.bloom.editor.scripts` | Additional editor | (nested) |
| `Bloom.Testing` | Test utilities | Runtime |
| `Bloom.Tests.PlayMode` | PlayMode tests | Testing |

**Features:**
- `allowUnsafeCode: true` for runtime (needed for NativeArray/Jobs)
- Version defines for conditional compilation (Netcode, Addressables, Cinemachine)
- Proper platform exclusion (Editor assemblies exclude runtime)

### Namespace Conventions ✅ EXCELLENT

27 distinct namespaces, all following `Bloom.*` pattern:

```
Bloom.Audio
Bloom.Core
Bloom.Core.Messages
Bloom.Core.Runtime
Bloom.Ecology
Bloom.Editor
Bloom.Editor.Cleanup
Bloom.Editor.Debugging
Bloom.Editor.Validation
Bloom.Environment
Bloom.Gameplay
Bloom.Hair
Bloom.Missions
Bloom.Narrative
Bloom.Networking
Bloom.Performance
Bloom.PerformanceSinks
Bloom.Player
Bloom.POI
Bloom.Streaming.DOTS
Bloom.Systems
Bloom.Terra.Editor
Bloom.Terrain
Bloom.Testing
Bloom.UI
Bloom.VfxCollision
Bloom.WorldGeneration
```

---

## 2. Architecture Patterns

### Service Locator / FindObjectOfType

| Pattern | Count | Assessment |
|---------|-------|------------|
| `FindObjectOfType` | 0 | ✅ ELIMINATED |
| `GetComponent()` | 5 | ✅ Minimal |
| `Singleton` references | 343 | ⚠️ Heavy usage |
| `.Instance` calls | 251 | ⚠️ Tight coupling |

**Note:** The previously reported 241 FindObjectOfType calls appear to have been eliminated. Current codebase shows zero instances.

### Dependency Injection

| Framework | Usage |
|-----------|-------|
| Zenject | ❌ Not used |
| VContainer | ❌ Not used |
| `[Inject]` attributes | 0 |

**Pattern:** Manual service wiring via singletons. Acceptable for current project size but limits testability.

### Event Systems ✅ GOOD

**294 event-related patterns found:**
- `UnityEvent` usage
- `System.Action` delegates  
- `.Invoke()` calls
- `OnMissionStateChanged`, `OnInventoryChanged`, etc.

**Example from MissionManager:**
```csharp
public event Action<MissionState> OnMissionStateChanged;
OnMissionStateChanged?.Invoke(currentState);
```

### State Machines ✅ DECENT

Simple state pattern used in:
- `PatrolState` (Idle, Patrolling, etc.)
- `MissionState` (Inactive, Running, ExtractionAvailable, Completed, Failed)
- `MenuState` (MainMenu, InGame, JoinMultiplayer, etc.)

**Pattern:** Enum-based states with `currentState` field and switch statements. No formal FSM framework.

### ScriptableObject Usage ✅ EXTENSIVE

| Metric | Value |
|--------|-------|
| ScriptableObject classes | 84 |
| `.asset` config files | 30+ |

**Common patterns:**
- `BiomeTerrainConfig_*.asset` for each biome
- `*Database.asset` for loot, perks, crafting
- `*Configuration.asset` for world generation

---

## 3. Code Quality

### Coding Standards

| Metric | Count | Assessment |
|--------|-------|------------|
| `[SerializeField]` | 1,349 | ✅ Proper encapsulation |
| `[RequireComponent]` | 62 | ✅ Component safety |
| `OnValidate/OnDrawGizmos` | 58 | ✅ Editor tooling |
| `Update/FixedUpdate/LateUpdate` | 140 | 🟡 Monitor for performance |

### Error Handling

| Pattern | Count |
|---------|-------|
| `try` blocks | 22 |
| `catch (Exception)` | 115 |

**Assessment:** Catch blocks outnumber try blocks 5:1, indicating broad exception catching elsewhere or inherited patterns. Review for overly broad catches.

### Null Safety ✅ GOOD

**5,876 null check patterns** (`??`, `!= null`, `== null`)

High usage indicates defensive programming. Example from `NetworkedDamageSystem`:
```csharp
if (NetworkManager.Singleton == null) return false;
if (attacker.PlayerObject == null) return false;
```

### Memory Management

| Pattern | Count | Risk |
|---------|-------|------|
| NativeArray/Dispose patterns | 572 | ✅ DOTS-aware |
| `new List/Dictionary/StringBuilder` | 1,551 | ⚠️ GC pressure |
| Object pooling | 11 | 🔴 Insufficient |

**Recommendation:** Expand object pooling for frequently created objects (loot, projectiles, VFX).

---

## 4. Technical Debt

### TODO/FIXME Analysis

**48 TODO comments found.** Categorization:

| Category | Count | Examples |
|----------|-------|----------|
| VFX/Audio placeholder | 12 | "TODO: Play damage VFX/audio" |
| Gameplay features | 10 | "TODO: Implement nearby player detection" |
| Authorization/Security | 2 | "TODO: Add authorization check" |
| UI feedback | 6 | "TODO: Show UI feedback" |
| Integration pending | 8 | "TODO: Integrate with narrative system" |
| Performance | 3 | "TODO: Get actual average from PerformanceMonitor" |
| World gen | 7 | "TODO: Implement overhang generation" |

**High-priority for EA:**
- Authorization checks (security)
- Network latency tracking
- VFX/Audio placeholders visible to players

### Deprecated Code

| Marker | Count |
|--------|-------|
| `[Obsolete]` | 1 |
| `#pragma warning` | 16 |

**Assessment:** Very little deprecated code. Clean codebase.

### Duplicate Definitions 🔴 CRITICAL

#### Duplicate Enums

| Enum | Locations | Values |
|------|-----------|--------|
| `EdgeDirection` | 5 files | Varies: some have 2 values (North, East), others have 4 (N/S/E/W) |
| `UINotificationType` | 2 files | Both have Info, Success, Warning... |
| `CoastalType` | 2 files | Both have Cliff, Beach... different order |

**Files with EdgeDirection:**
1. `Editor/EdgeValidationTool.cs` - `{ East, North }` (2 values)
2. `Editor/TerrainValidationSuite.cs` - `{ North, East }` (2 values)
3. `WorldGeneration/Edge/TileEdgeContract.cs` - `{ North, South, East, West }` (4 values)
4. `WorldGeneration/Services/IEdgeContractManager.cs` - `{ North, South, East, West }` (4 values)
5. `WorldGeneration/Validation/NavMeshContinuityValidator.cs` - `{ North, South, East, West }` (4 values)

**Impact:** Potential runtime confusion, serialization mismatches, compilation ambiguity.

**Fix:** Consolidate to single canonical enum in `Bloom.Core` or `Bloom.WorldGeneration`.

#### Duplicate Classes

| Class Name | Instances |
|------------|-----------|
| ResourceReward | 3 |
| EdgeContractManager | 2 |
| HydraulicErosionStage | 2 |
| ThermalErosionStage | 2 |
| ClimateIntegrationStage | 2 |
| ValidationResult | 2 |
| POIDefinition | 2 |
| LootReward | 2 |
| SpeciesCoverage | 2 |
| PerformanceMetrics | 2 |
| ExtractionZoneTests | 2 |
| TerraFeatureRegistryTests | 2 |

---

## 5. Third-Party Dependencies

### Unity Package Dependencies

| Package | Version | Status |
|---------|---------|--------|
| `com.unity.netcode.gameobjects` | 2.8.0 | ✅ Recent |
| `com.unity.render-pipelines.high-definition` | 17.3.0 | ✅ Current |
| `com.unity.addressables` | 2.7.6 | ✅ Recent |
| `com.unity.inputsystem` | 1.17.0 | ✅ Current |
| `com.unity.burst` | 1.8.27 | ✅ Current |
| `com.unity.collections` | (bundled) | ✅ |
| `com.unity.splines` | 2.8.2 | ✅ Current |
| `com.unity.terrain-tools` | 5.3.1 | ✅ Current |
| `com.unity.probuilder` | 6.0.8 | ✅ Current |
| `com.unity.ai.inference` | 2.4.1 | ✅ AI features |
| `com.unity.ai.assistant` | 1.5.0-pre.2 | ⚠️ Pre-release |
| `com.unity.ai.generators` | 1.5.0-pre.2 | ⚠️ Pre-release |

### Third-Party Libraries

| Library | Source | Purpose |
|---------|--------|---------|
| Steamworks.NET | GitHub | Steam integration |
| NuGetForUnity | GitHub | NuGet package manager |
| ParrelSync | GitHub | Editor instance cloning |
| CoPlay | GitHub (beta) | Multiplayer services? |

### NuGet Packages

- Microsoft.CodeAnalysis.Analyzers 4.14.0
- Microsoft.CodeAnalysis.CSharp 5.0.0
- System.* packages (buffers, memory, etc.)

### Asset Store

| Asset | Location | Status |
|-------|----------|--------|
| Gaia | `Assets/Gaia User Data`, `Assets/Procedural Worlds` | 🟡 Data folders present, no runtime scripts |

**Note:** Gaia appears to be used for offline terrain generation, not runtime. No Procedural Worlds `.cs` files found in Assets.

---

## 6. Build Configuration

### Platform Targets

| Platform | Status |
|----------|--------|
| Standalone (Windows) | ✅ Primary target |
| Android | Configured (min SDK 25) |
| iOS | Configured (min 15.0) |
| PS4/PS5 | Configured but likely unused |
| Xbox | Configured but likely unused |
| Switch | Configured but likely unused |

### Build Settings

- **Product Name:** Bloom
- **Version:** 0.1.0
- **Template:** HDRP Blank
- **Default Scene:** `Assets/OutdoorsScene.unity`
- **Color Space:** Linear (m_ActiveColorSpace: 1)
- **GPU Skinning:** Enabled
- **Run in Background:** Enabled

### Scripting Defines

Conditional compilation found:
- `UNITY_EDITOR` (common)
- `UNITY_ENTITIES` (DOTS support)
- `UNITY_TERRAIN_TOOLS`
- `UNITY_NETCODE_AVAILABLE` (version define)
- `UNITY_TEST_FRAMEWORK_AVAILABLE`
- `UNITY_ADDRESSABLES_AVAILABLE`
- `UNITY_CINEMACHINE_AVAILABLE`

---

## 7. Networking & Multiplayer Security ✅ GOOD

### Server Authority Pattern

| Metric | Count |
|--------|-------|
| `NetworkBehaviour` classes | 48 |
| `[ServerRpc]` / `[Rpc(SendTo.Server)]` | ~30 |
| `[ClientRpc]` | 13 |
| `NetworkVariable/NetworkList` | 195 |
| `IsOwner/OwnerClientId` checks | 108 |

### Security Patterns ✅ IMPLEMENTED

**NetworkedDamageSystem** demonstrates exemplary security:

```csharp
[Rpc(SendTo.Server, InvokePermission = RpcInvokePermission.Everyone)]
public void RequestDamageServerRpc(
    ulong targetClientId,
    float damageAmount,
    Vector3 hitPoint,
    Vector3 hitDirection,
    float clientTimestamp,
    RpcParams rpcParams = default)
{
    if (!IsServer) return;
    ulong attackerClientId = rpcParams.Receive.SenderClientId;
    
    // Validate hit before applying
    if (!ValidateHit(attackerClientId, targetClientId, hitPoint, ...))
    {
        Debug.LogWarning("Hit validation failed...");
        return;
    }
    
    ApplyValidatedDamage(...);
}
```

**Key security features:**
1. ✅ Server authority (`if (!IsServer) return`)
2. ✅ Sender validation via `rpcParams.Receive.SenderClientId`
3. ✅ Distance validation (`maxHitDistance = 200f`)
4. ✅ Position tolerance (`hitValidationTolerance = 0.5f`)
5. ✅ Lag compensation (`lagCompensationTime = 0.5f`)
6. ✅ Position history for rewinding

**Other RPCs with security:**
- `FactionAbilitySystem`: `InvokePermission = RpcInvokePermission.Owner`
- `PlayerData`: Defense-in-depth owner checks
- `CompanionCommandNetworkProxy`: `IsSenderAuthorized()` helper

### Potential Cheat Vectors

| Vector | Risk | Mitigation |
|--------|------|------------|
| Damage spoofing | LOW | Server validates all damage |
| Speed hacking | MEDIUM | Need position rate-limiting |
| Inventory duplication | LOW | Server authoritative via NetworkList |
| Ability cooldown bypass | LOW | Server tracks cooldowns |

### Missing Security (TODOs)

```csharp
// TODO: Add authorization check via IAuthorizationService
// TODO: Add authorization check
```

**Recommendation:** Implement `IAuthorizationService` before EA launch.

---

## 8. Performance Considerations

### GC Pressure Points

| Pattern | Count | Recommendation |
|---------|-------|----------------|
| `new List<>` | High | Use pooled lists |
| `new Dictionary<>` | Medium | Pre-size or pool |
| `.ToList()/.ToArray()` | High | Avoid in hot paths |
| Debug.Log | 3,544 | Conditional compile |

### Update Methods

**140 Update/FixedUpdate/LateUpdate methods** - manageable but should audit for frequency.

### Async Patterns

| Pattern | Count |
|---------|-------|
| `async Task/await` | 57 |
| `Coroutine/StartCoroutine` | 294 |

Mixed async model. Consider consolidating to one pattern.

---

## Recommendations by EA Launch Priority

### 🔴 CRITICAL (Fix Before Launch)

1. **Consolidate EdgeDirection enum** - 5 conflicting definitions
2. **Consolidate UINotificationType enum** - 2 definitions
3. **Consolidate CoastalType enum** - 2 definitions
4. **Review duplicate class definitions** - 12 classes with same name

### 🟡 HIGH PRIORITY (Launch Blockers)

5. **Strip Debug.Log in builds** - Add `#if UNITY_EDITOR` or use conditional logging
6. **Implement TODO authorization checks** - Security gap
7. **Complete VFX/Audio placeholders** - Player-visible gaps

### 🟢 POST-LAUNCH IMPROVEMENTS

8. **Expand object pooling** - GC pressure reduction
9. **Add position rate-limiting** - Anti-speed hack
10. **Consider DI framework** - If codebase grows significantly
11. **Audit Singleton usage** - 343 references indicate tight coupling

---

## Appendix: File Statistics

| Metric | Value |
|--------|-------|
| Total C# files | 785 |
| Networking files | 40 |
| Test files | ~30 |
| ScriptableObject classes | 84 |
| NetworkBehaviour classes | 48 |
| Interfaces | 33 |
| Public enums | 114 |
| Serialized fields | 1,349 |

---

*Generated by Bloom Architecture Audit - January 2026*
