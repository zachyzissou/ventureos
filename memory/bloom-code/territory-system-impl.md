# Territory System Foundation - Implementation Report

**Date**: 2026-01-28
**Branch**: `feat/issue-1065-territory-quietus-foundation`
**PR**: https://github.com/zachyzissou/Bloom/pull/1081

## Summary

Found existing Territory System foundation - extended it with capture mechanics and contested events.

## Existing Foundation (Already Implemented)

The branch already contained a solid foundation:

| File | Purpose |
|------|---------|
| `ITerritoryService.cs` | Interface with influence enums, events, querying methods |
| `TerritoryManager.cs` | NetworkBehaviour, server-authoritative, influence decay |
| `TerritoryZone.cs` | MonoBehaviour with bounds, multi-faction influence tracking |

### Existing Features
- 3-level hierarchy: Region → District → ControlPoint
- Influence system (0-100 scale) with 5 levels: None, Minor, Moderate, Major, Total
- Control determination: 40+ influence with 20+ advantage OR 80+ with rivals <20
- Server-authoritative influence modification
- Client sync via RPCs
- Natural influence decay over time
- Service locator registration

## New Additions (This Commit)

### 1. TerritoryCaptureTrigger.cs (NEW)
Handles player presence detection and capture progress:
```csharp
// NetworkVariables for capture progress per faction
NetworkVariable<float> directorateCaptureProgress
NetworkVariable<float> vulturesCaptureProgress
// ... (one per faction)

// Events
event Action<FactionType, float> OnCaptureProgressChanged
event Action<FactionType> OnCaptureComplete
event Action<TerritoryZone> OnZoneContested
event Action<TerritoryZone> OnZoneUncontested
```

**Features**:
- Trigger collider detects player entry/exit
- Tracks players by faction via `IFactionMember` interface
- Capture rate scales with player count
- Contested multiplier (0.5x speed when multiple factions)
- Capture decay when no players present
- Capture completion adds influence via `ITerritoryService`

### 2. TerritoryZone.cs (Enhanced)
Added events and helper methods:
```csharp
// New events
event Action<TerritoryZone> OnZoneContested
event Action<TerritoryZone> OnZoneUncontested

// New methods
List<FactionType> GetFactionsWithInfluence()
FactionType GetDominantFaction()

// New properties exposed
ControlPointType PointType
float CaptureTimeSeconds
float CaptureDifficulty
int MaxCapturePlayers
```

### 3. ITerritoryService.cs (Extended)
New interface methods:
```csharp
bool IsZoneContested(string zoneId)
IReadOnlyList<TerritoryZone> GetContestedZones()
IReadOnlyList<TerritoryZone> GetZonesControlledBy(FactionType faction)
event Action<string> OnZoneContested
event Action<string> OnZoneUncontested
```

### 4. TerritoryManager.cs (Extended)
Implements new interface methods and broadcasts contested state to clients.

### 5. TerritoryZoneConfig.cs (NEW)
ScriptableObject for reusable zone presets:
- Display name, description
- Scale and control point type
- Capture settings (time, difficulty, max players)
- Initial state (controller, influence)
- Strategic value (influence multiplier, resource bonus)

### 6. IFactionMember Interface (NEW)
Simple interface for faction detection:
```csharp
public interface IFactionMember
{
    FactionType Faction { get; }
}
```

## Architecture Overview

```
TerritoryManager (NetworkBehaviour, singleton service)
    ├── Discovers all TerritoryZone components on spawn
    ├── Server-authoritative influence modifications
    ├── Natural decay system (configurable rate)
    └── Broadcasts changes via ClientRpc

TerritoryZone (MonoBehaviour, placed in world)
    ├── Defines bounds (center + size)
    ├── Tracks influence per faction (0-100)
    ├── Calculates contested state
    ├── Determines controlling faction
    └── Fires events on state changes

TerritoryCaptureTrigger (NetworkBehaviour, trigger collider)
    ├── Detects player presence via OnTriggerEnter/Exit
    ├── Tracks players by faction
    ├── Updates capture progress (NetworkVariables)
    ├── Handles contested capture slowdown
    └── Triggers influence gain on capture complete
```

## Usage Example

```csharp
// Setup in scene:
// 1. Create GameObject with TerritoryZone component
// 2. Add BoxCollider (set as trigger)
// 3. Add TerritoryCaptureTrigger component
// 4. Configure bounds, scale, capture settings

// Runtime:
var territoryService = ServiceLocator.GetService<ITerritoryService>();

// Query zone state
var zone = territoryService.GetZoneAtPosition(player.transform.position);
if (zone != null)
{
    var controller = zone.ControllingFaction;
    var influence = zone.GetInfluence(FactionType.Wardens);
    var isContested = zone.IsContested;
}

// Listen for events
territoryService.OnControlChanged += (zoneId, prevFaction, newFaction) => {
    Debug.Log($"Zone {zoneId} control changed from {prevFaction} to {newFaction}");
};

territoryService.OnZoneContested += (zoneId) => {
    Debug.Log($"Zone {zoneId} is now contested!");
};
```

## Next Steps (Future Work)

1. **UI Integration**: Zone control display on world map
2. **Faction AI**: NPCs respond to territorial changes
3. **Benefits System**: Spawn security, resource bonuses per zone
4. **Persistence**: Save/load territorial state across sessions
5. **Dynamic Events**: Faction offensive operations, environmental crises

## Files Modified/Created

| File | Status | Lines |
|------|--------|-------|
| `ITerritoryService.cs` | Modified | 5762 bytes |
| `TerritoryManager.cs` | Modified | 8184 bytes |
| `TerritoryZone.cs` | Modified | 8001 bytes |
| `TerritoryCaptureTrigger.cs` | **Created** | 12560 bytes |
| `TerritoryZoneConfig.cs` | **Created** | 2420 bytes |

---

**VALIDATION:**
- Output file: C:\Users\Zachg\clawd\memory\bloom-code\territory-system-impl.md ✓ exists
- Completeness: complete
- Self-check: PASS
- Confidence: high
