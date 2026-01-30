# Bloom 10-Player Load Test Implementation

**Created:** 2025-01-20  
**Author:** QA/Testing Subagent  
**Status:** Initial Implementation Complete

## Overview

This document describes the implementation of automated 10-player load tests for Bloom, validating network stability under maximum player load using Unity Netcode for GameObjects 2.8.0.

## Test File Location

```
Assets/Tests/PlayMode/MultiClientLoadTests.cs
```

## Architecture Decisions

### Why Host-Based Simulation (Not ParrelSync)

ParrelSync creates clones that require multiple Unity Editor instances running simultaneously. While excellent for manual testing, it cannot be automated within Unity's Test Runner. The implemented approach uses **host-based simulation**:

1. **Host starts as server + client** (standard Netcode pattern)
2. **Additional players are spawned as NetworkObjects** with simulated client IDs
3. **Server-authoritative logic is tested directly** since all objects run in the same process

**Tradeoff:** This tests server logic and NetworkVariable behavior but not true network latency/packet loss scenarios. For full integration testing, use ParrelSync with manual test scripts.

### Detection Capabilities

| Detection Type | Implementation |
|---------------|----------------|
| NullReferenceExceptions | `Application.logMessageReceived` callback |
| State Inconsistency | Assertions on NetworkVariable values |
| Performance Degradation | Frame time tracking with 33.33ms budget (30 FPS) |
| Memory Leaks | GC.GetTotalMemory delta tracking |

## Test Categories

### 1. LoadTest.Extraction (3 tests)

Tests 10-player extraction scenarios:

- `TenPlayer_Extraction_CompletesSuccessfully` - Basic 10-player extraction flow
- `TenPlayer_Extraction_WithWaves_MaintainsStability` - Wave progression with all players
- `TenPlayer_Extraction_AllPlayersReceiveXP` - XP distribution verification

### 2. LoadTest.ChurnStress (3 tests)

Tests rapid join/leave cycling:

- `ChurnStress_RapidJoinLeave_NoNREs` - 5 cycles of adding/removing players
- `ChurnStress_MaxPlayerRejection_Works` - Verify 10-player cap enforcement
- `ChurnStress_SimultaneousDisconnect_NoStateCorruption` - Mass disconnect mid-extraction

### 3. LoadTest.InventorySync (3 tests)

Tests NetworkList replication:

- `InventorySync_TenPlayers_AllReceiveLoot` - Loot distribution to all players
- `InventorySync_SimultaneousModification_NoRaceConditions` - Concurrent inventory changes
- `InventorySync_ExtractionTransfer_AllPlayersToStash` - Extraction → Stash flow

### 4. LoadTest.BossFight (3 tests)

Tests combat scenarios with all players:

- `BossFight_TenPlayers_TakingDamage_NoStateCorruption` - Damage application
- `BossFight_TenPlayers_DeathAndRespawn_NoNREs` - Death/respawn cycle
- `BossFight_TenPlayers_SimultaneousHealing_NetworkVarConsistency` - Healing verification

### 5. LoadTest.Performance (2 tests)

Tests frame budget and scaling:

- `Performance_TenPlayers_MaintainsFrameBudget` - 30 FPS minimum
- `Performance_NetworkVariableUpdates_ScalesWithPlayers` - Linear scaling verification

### 6. LoadTest.StateConsistency (2 tests)

Tests NetworkVariable replication:

- `StateConsistency_PlayerData_ReplicatesCorrectly` - PlayerData values
- `StateConsistency_ExtractionZone_PlayersInZoneAccurate` - Zone tracking

## Running the Tests

### From Unity Editor

1. Open **Window → General → Test Runner**
2. Select **PlayMode** tab
3. Filter by category: `LoadTest`
4. Click **Run All** or select specific tests

### From Command Line

```bash
Unity.exe -runTests -testCategory LoadTest -testPlatform PlayMode -batchmode -projectPath "C:\Users\Zachg\Development\Games\Bloom"
```

### CI/CD Integration

```yaml
# Example GitHub Actions step
- name: Run Load Tests
  run: |
    "$UNITY_PATH" -runTests \
      -testCategory LoadTest \
      -testPlatform PlayMode \
      -batchmode \
      -logFile ./test-results.log \
      -testResults ./test-results.xml \
      -projectPath ./Bloom
```

## Performance Metrics

Each test tracks:

```csharp
class PerformanceMetrics
{
    List<float> FrameTimes;     // All frame times in ms
    float PeakFrameTimeMs;      // Worst frame
    float AverageFrameTimeMs;   // Mean frame time
    int DroppedFrames;          // Frames > 33.33ms
    long MemoryStartBytes;      // GC memory at start
    long MemoryEndBytes;        // GC memory at end
    int ExceptionCount;         // Logged exceptions
    int WarningCount;           // Logged warnings
}
```

Summary logged after each test:
```
[LoadTest] Performance Summary: Avg: 8.42ms, Peak: 16.21ms, Dropped: 0, Memory: 1024KB delta, Exceptions: 0, Warnings: 3
```

## Known Limitations

1. **No true network simulation** - All runs in single process; no latency/packet loss testing
2. **ParrelSync not automated** - Manual testing still needed for multi-instance scenarios
3. **Steam transport not tested** - Uses UnityTransport in tests (Steam requires actual Steam client)
4. **Editor overhead** - Frame times higher in Editor than builds

## Future Improvements

1. **Latency injection** - Add artificial delays to simulate network conditions
2. **ParrelSync test scripts** - Create manual test protocols for clone testing
3. **Build pipeline tests** - Run in standalone builds for accurate performance
4. **Chaos testing** - Random disconnects, packet corruption simulation

## Related Files

| File | Purpose |
|------|---------|
| `Assets/Tests/PlayMode/NetcodePlaymodeTests.cs` | Existing smoke tests (reference) |
| `Assets/Tests/PlayMode/ExtractionZoneTests.cs` | Existing extraction tests (reference) |
| `Assets/Scripts/Networking/BloomNetworkManager.cs` | 10-player limit enforcement |
| `Assets/Scripts/Networking/PlayerData.cs` | NetworkVariable schema |
| `Assets/Scripts/Gameplay/FirstPlayable/Loot/PlayerInventory.cs` | NetworkList schema |

## Validation Checklist

### Code Verification (Automated)
- [x] All referenced types exist in codebase
- [x] All method signatures match
- [x] Brace/parenthesis balancing verified
- [x] Using statements match existing test patterns
- [x] Assembly references correct

### Runtime Verification (Manual - Required)
- [ ] Open Unity Test Runner (Window → General → Test Runner)
- [ ] Select PlayMode tab
- [ ] Verify "MultiClientLoadTests" appears (16 tests)
- [ ] Run single test: `TenPlayer_Extraction_CompletesSuccessfully`
- [ ] Verify no compilation errors in Console
- [ ] Run full LoadTest category
- [ ] Review performance metrics in Console output

### Production Readiness
- [ ] CI/CD pipeline integration (pending)
- [ ] Manual ParrelSync validation (pending)

## Verification Commands

```powershell
# Verify test file exists
Test-Path "C:\Users\Zachg\Development\Games\Bloom\Assets\Tests\PlayMode\MultiClientLoadTests.cs"

# Count tests
(Select-String -Path "...\MultiClientLoadTests.cs" -Pattern "\[UnityTest\]").Count
# Expected: 16

# Check for compilation errors in Unity Console after opening project
```
