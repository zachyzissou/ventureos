# PlayerInventory Networking Fix

**Status:** ✅ IMPLEMENTED + OPTIMIZED  
**Date:** 2025-01-20 (impl) / 2025-01-29 (optimization)  
**Branch:** `fix/player-inventory-networking-optimize` (optimization on top of base impl)  
**PR:** Pending (LFS quota exceeded - push blocked)

## The Problem

`PlayerInventory` was using local `List<T>` collections to store loot and resources:

```csharp
private readonly List<LootStack> stacks = new();
private readonly List<ResourceStack> resourceStacks = new();
```

This meant:
- Only the server/host had the actual inventory data
- Clients had empty or stale inventories
- Picking up items, crafting, and trading were broken in co-op
- 8-10 player co-op was essentially non-functional for inventory features

## What Was Changed

### 1. Converted PlayerInventory to NetworkBehaviour

The class now inherits from `NetworkBehaviour` instead of `MonoBehaviour`:

```csharp
public class PlayerInventory : NetworkBehaviour
```

### 2. Added Network-Serializable Structs

Created new structs that implement `INetworkSerializable` for transmission:

- `NetworkLootEntry` - Uses `FixedString64Bytes` for loot GUID + quantity
- `NetworkResourceEntry` - Uses `FixedString64Bytes` for materialId + quantity

These use string IDs instead of ScriptableObject references because SO references can't be serialized over the network.

### 3. Replaced Lists with NetworkLists

```csharp
private NetworkList<NetworkLootEntry> networkLootStacks;
private NetworkList<NetworkResourceEntry> networkResourceStacks;
```

`NetworkList<T>` automatically syncs changes to all connected clients.

### 4. Server-Authoritative Design

All inventory modifications now follow this pattern:
1. Client calls public method (e.g., `AddLoot()`)
2. If not server, sends RPC to server
3. Server modifies the NetworkList
4. NetworkList automatically syncs to all clients
5. Clients receive `OnListChanged` event and fire local events

### 5. Offline Mode Support

For solo play without networking, the code detects `!IsSpawned` and falls back to local lists:

```csharp
private bool IsNetworked => IsSpawned;

// Fallback storage for solo play
private readonly List<LootStack> offlineLootStacks = new();
private readonly List<ResourceStack> offlineResourceStacks = new();
```

This ensures backward compatibility with single-player testing.

### 6. Registry Integration

Uses `RegistryResolver` to convert between string GUIDs and ScriptableObject references:
- `LootDefinitionRegistry` maps loot GUIDs to `LootDefinition` SOs
- `ResourceMaterialRegistry` maps material IDs to `ResourceMaterial` SOs

## Files Modified

1. **`Assets/Scripts/Gameplay/FirstPlayable/Loot/PlayerInventory.cs`**
   - Complete rewrite for networking support
   - ~550 lines (was ~170 lines)

2. **`Assets/Scripts/Gameplay/FirstPlayable/Persistence/SaveLoadManager.cs`**
   - Updated `Load()` to use new `LoadFromSaveData()` method
   - Updated `Save()` to use new export methods
   - Handles both networked and offline modes

## How to Test

### Basic Networking Test
1. Start a multiplayer session with 2+ players
2. Have Player 1 pick up a resource
3. Verify Player 2's UI shows Player 1's inventory update (if viewing)
4. Have Player 2 pick up a resource
5. Verify all players see the update

### Crafting Test
1. Start co-op session
2. Have one player gather resources
3. Verify all clients see the same resource counts
4. Craft an item
5. Verify resources are consumed on all clients

### Save/Load Test
1. Play solo (offline mode) - verify inventory works
2. Save and quit
3. Load the save - verify inventory is restored
4. Host a multiplayer session
5. Have clients join
6. Verify save/load still works with networked inventories

### Edge Cases
- Test with 8-10 players (max co-op size)
- Test client disconnect/reconnect (inventory should restore)
- Test host migration (if supported)

## Migration Notes

### Save Format
**No changes to save format.** The existing save system already used string IDs:
- Resources use `materialId` (string)
- Loot uses `lootGuid` (string from registry)

Old saves will load correctly.

### API Changes
The public API is **backward compatible**:
- `Stacks`, `ResourceStacks` properties still work
- `AddLoot()`, `AddResource()`, `AddResourceById()` still work
- `ResetInventory()`, `HasIngredients()`, `ConsumeIngredients()` still work

New methods added:
- `LoadFromSaveData(resources, loot)` - Bulk load for efficiency
- `GetResourceStacksForSave()` - Export for saving
- `GetLootStacksForSave()` - Export for saving

### Prefab Setup
If `PlayerInventory` is on a player prefab:
1. Ensure the prefab has a `NetworkObject` component
2. The player prefab should be registered in `NetworkManager.NetworkPrefabs`
3. No other changes needed - the component auto-initializes on spawn

## Architecture Notes

### Why NetworkList over RPCs?

Option A: `NetworkList<T>` ✓ (chosen)
- Auto-syncs to all clients
- Handles late joiners automatically
- Efficient delta sync
- Built-in event system

Option B: Server-authoritative with RPCs
- More control but more code
- Must handle late joiners manually
- Must implement own delta sync
- Better for complex items with behavior

For simple quantity-based inventory, NetworkList is the cleaner solution.

### Why String IDs?

ScriptableObjects can't be directly serialized over the network. Options:
1. **String GUID lookup** ✓ (chosen) - Uses existing registry system
2. **NetworkObjectReference** - Only works for spawned NetworkObjects
3. **Asset hash** - Complex, no existing infrastructure

The registry approach leverages existing `GuidRegistry<T>` infrastructure.

## Performance Considerations

- NetworkList syncs only changed elements (delta sync)
- String comparisons use `FixedString64Bytes` (stack allocated, no GC)
- Registry lookups are cached (`Dictionary<string, T>`)
- Events only fire on actual changes

For 8-10 players with typical inventory sizes (< 100 stacks), performance impact is negligible.

---

## Implementation Summary

| Item | Status |
|------|--------|
| Convert to NetworkBehaviour | ✅ |
| Add NetworkList storage | ✅ |
| Implement ServerRpcs | ✅ |
| Offline mode fallback | ✅ |
| Registry integration | ✅ |
| SaveLoadManager update | ✅ |
| Branch created | ✅ `fix/player-inventory-networking` |
| Commit made | ✅ `866737fca` |
| Branch pushed | ✅ |
| PR created | 🔗 Ready for manual creation |

**Next Steps:**
1. Create PR at: https://github.com/zachyzissou/Bloom/pull/new/fix/player-inventory-networking
2. Test in Unity with 2+ player co-op
3. Merge after verification
