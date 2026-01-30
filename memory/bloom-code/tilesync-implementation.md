# TileStateSynchronizationSystem Network Implementation

**Date:** 2025-01-24  
**Issue:** #945 - Multiplayer Tile State Synchronization  
**Severity:** Critical (required for co-op multiplayer)  
**Verified:** ✓ Pattern consistency, balanced braces, enum serialization fixed

## The Problem

`TileStateSynchronizationSystem` was a plain C# class with stubbed networking:

```csharp
// Previous implementation - just logged changes, no actual sync
private void NotifyPOIStateChange(string poiID, POIState oldState, POIState newState)
{
    // TODO: Integrate with Unity Netcode or custom networking system
    // For now, just log the change
    Debug.Log($"[TileStateSynchronizationSystem] POI {poiID} state changed...");
}
```

This meant:
- POI states (ruined, operational, repaired) weren't synced between players
- Resource node states (harvested, respawning) weren't synced
- Spawn point states weren't synced
- Late-joining clients had no way to receive current world state
- Co-op players saw different world states

## What Was Changed

### 1. Converted to NetworkBehaviour

The class now inherits from `NetworkBehaviour` and requires a `NetworkObject`:

```csharp
[RequireComponent(typeof(NetworkObject))]
public class TileStateSynchronizationSystem : NetworkBehaviour
```

### 2. Created Network-Serializable Structs

Four `INetworkSerializable` structs using `FixedString64Bytes` for string IDs:

- **`NetworkPOIEntry`** - POI ID, state type, health, faction owner
- **`NetworkResourceNodeEntry`** - Resource ID, harvested flag, respawn time, harvester
- **`NetworkSpawnPointEntry`** - Spawn point ID, active flag, faction ID
- **`NetworkTileEntry`** - Tile coordinates (x,y), version, timestamp

Example (note: enums stored as int for serialization compatibility):
```csharp
public struct NetworkPOIEntry : INetworkSerializable, IEquatable<NetworkPOIEntry>
{
    public FixedString64Bytes poiID;
    public int stateInt; // POIStateType stored as int
    public float health;
    public int factionOwnerID;
    public float lastModified;
    
    public POIStateType State
    {
        get => (POIStateType)stateInt;
        set => stateInt = (int)value;
    }
    
    public void NetworkSerialize<T>(BufferSerializer<T> serializer) where T : IReaderWriter
    {
        serializer.SerializeValue(ref poiID);
        serializer.SerializeValue(ref stateInt); // Serialize as int
        // ...
    }
}
```

### 3. Replaced Dictionaries with NetworkLists

```csharp
private NetworkList<NetworkPOIEntry> networkPOIStates;
private NetworkList<NetworkResourceNodeEntry> networkResourceStates;
private NetworkList<NetworkSpawnPointEntry> networkSpawnPointStates;
private NetworkList<NetworkTileEntry> networkTileEntries;
```

`NetworkList<T>` provides:
- Automatic sync to all connected clients
- Delta sync (only changed elements transmitted)
- Late-joiner support (full list sent on connect)
- Built-in `OnListChanged` events

### 4. Server-Authoritative Design

All state modifications follow this pattern:
1. Client calls public method (e.g., `UpdatePOIState()`)
2. If not server, sends RPC to server
3. Server modifies the NetworkList
4. NetworkList automatically syncs to all clients
5. Clients receive `OnListChanged` event and fire local events

```csharp
public void UpdatePOIState(string poiID, POIState newState)
{
    // Offline mode: direct update
    if (!IsNetworked)
    {
        UpdatePOIStateOffline(poiID, newState);
        return;
    }

    if (!IsServer)
    {
        RequestUpdatePOIStateServerRpc(poiID, (int)newState.state, newState.health, newState.factionOwnerID);
        return;
    }

    UpdatePOIStateInternal(poiID, newState);
}
```

### 5. Offline Mode Support

For solo play without networking, the code detects `!IsSpawned` and falls back to local dictionaries:

```csharp
private bool IsNetworked => IsSpawned;

// Fallback storage for solo play
private readonly Dictionary<Vector2Int, TileState> offlineTileStates = new();
private readonly Dictionary<string, POIState> offlinePOIStates = new();
private readonly Dictionary<string, ResourceNodeState> offlineResourceStates = new();
```

### 6. Event System

Events fire on both server and clients for UI updates and gameplay reactions:

```csharp
public event Action<string, POIState, POIState> OnPOIStateChanged;
public event Action<string, ResourceNodeState, ResourceNodeState> OnResourceStateChanged;
public event Action<string, SpawnPointState, SpawnPointState> OnSpawnPointStateChanged;
public event Action OnTileStatesSynchronized;
```

### 7. TileStateSyncStage Updated

The pipeline stage now:
1. Finds existing `TileStateSynchronizationSystem` in scene, OR
2. Creates new GameObject with `NetworkObject` + `TileStateSynchronizationSystem`
3. Spawns the NetworkObject if running as server
4. Falls back to offline mode if not networked

## Files Modified

1. **`Assets/Scripts/WorldGeneration/Multiplayer/TileStateSynchronizationSystem.cs`**
   - Complete rewrite as NetworkBehaviour
   - ~900 lines (was ~220 lines)

2. **`Assets/Scripts/WorldGeneration/Multiplayer/TileStateSyncStage.cs`**
   - Updated to find/create NetworkBehaviour instance
   - Added network spawning logic

## API Compatibility

The public API is **backward compatible**:

| Method | Still Works | Notes |
|--------|-------------|-------|
| `Initialize()` | ✓ | Called automatically on spawn |
| `RegisterTileState()` | ✓ | Server-authoritative when networked |
| `UpdatePOIState()` | ✓ | Server-authoritative when networked |
| `UpdateResourceState()` | ✓ | Server-authoritative when networked |
| `GetPOIState()` | ✓ | Works on all clients |
| `GetResourceState()` | ✓ | Works on all clients |
| `GetTileState()` | ✓ | Works on all clients |
| `GetPOIStatesForTile()` | ✓ | Works on all clients |
| `GetResourceStatesForTile()` | ✓ | Works on all clients |
| `SerializeTileState()` | ✓ | For save/load persistence |
| `DeserializeTileState()` | ✓ | For save/load persistence |

New methods added:
- `GetAllPOIStates()` - Get all POI states as dictionary
- `GetAllResourceStates()` - Get all resource states as dictionary
- `GetRegisteredTiles()` - Get all registered tile coordinates
- `GetStats()` - Get sync system statistics
- `LogState()` - Debug logging

## How to Test

### Basic Networking Test
1. Start a multiplayer session with 2+ players
2. Player 1 harvests a resource node
3. Verify Player 2 sees the resource as harvested
4. Player 2 damages a POI
5. Verify Player 1 sees the POI state change

### Late-Joiner Test
1. Start host and modify world state (harvest resources, change POI states)
2. Have new client join
3. Verify new client sees current world state immediately
4. Check console for sync system stats

### Offline Mode Test
1. Play solo (no NetworkManager)
2. Verify tile state tracking works locally
3. Harvest resources, verify state updates
4. Save and quit
5. Load save, verify states persist

### Edge Cases
- Test with 8-10 players (max co-op)
- Test rapid state changes (multiple harvests quickly)
- Test client disconnect/reconnect
- Test host migration (if supported)

## Integration Points

### Resource Nodes
When a resource node is harvested:
```csharp
var syncSystem = FindObjectOfType<TileStateSynchronizationSystem>();
syncSystem?.UpdateResourceState(resourceID, new ResourceNodeState
{
    resourceID = resourceID,
    isHarvested = true,
    respawnTime = 300f, // 5 minutes
    harvesterPlayerID = (int)NetworkManager.Singleton.LocalClientId
});
```

### POI State Changes
When a POI is damaged/repaired:
```csharp
var syncSystem = FindObjectOfType<TileStateSynchronizationSystem>();
syncSystem?.UpdatePOIState(poiID, new POIState
{
    poiID = poiID,
    state = POIStateType.Damaged,
    health = 0.5f,
    factionOwnerID = factionId
});
```

### UI Integration
Subscribe to events for UI updates:
```csharp
var syncSystem = FindObjectOfType<TileStateSynchronizationSystem>();
syncSystem.OnPOIStateChanged += (id, oldState, newState) =>
{
    // Update map markers, minimap, etc.
    UpdatePOIMarker(id, newState);
};
```

## Performance Considerations

- **NetworkList Delta Sync**: Only changed elements are transmitted
- **FixedString64Bytes**: Stack-allocated, no GC pressure for string IDs
- **Index-based Lookups**: O(n) for finds, but n is typically small (~100s of POIs/resources per session)
- **Event-Driven Updates**: UI only updates on actual changes

For typical sessions with 50-200 POIs and 100-500 resource nodes, performance impact is negligible.

## Architecture Notes

### Why NetworkList over Custom RPCs?

| Approach | Pros | Cons |
|----------|------|------|
| **NetworkList** ✓ | Auto late-joiner sync, delta sync, less code | Less control over exact transmission |
| **Custom RPCs** | Full control, custom batching | Must implement late-joiner manually, more code |

For world state that changes infrequently and needs late-joiner support, NetworkList is the cleaner solution.

### Why Flat Lists vs Nested Structures?

NetworkList doesn't support nested collections. Instead of:
```csharp
// Can't do this:
NetworkList<TileWithNestedPOIs> tiles;
```

We use flat lists with ID-based filtering:
```csharp
NetworkList<NetworkPOIEntry> allPOIs;
// Filter by tile: POI_X_Y_Category_Index
```

This is the same pattern used by PlayerInventory for loot/resources.

## Prefab Setup (if using prefab)

If `TileStateSynchronizationSystem` is on a prefab:
1. Ensure the prefab has a `NetworkObject` component
2. Register prefab in `NetworkManager.NetworkPrefabs`
3. Spawn on server during world initialization

Or let `TileStateSyncStage` create it dynamically (current approach).
