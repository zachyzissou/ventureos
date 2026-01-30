# Day/Night System Implementation

**Created:** 2025-01-28
**Updated:** 2025-01-28
**Status:** ✅ COMPLETE - Weather systems wired to TimeOfDaySystem (PR #1077)
**System:** TimeOfDaySystem for Bloom (Unity 6 / Netcode for GameObjects)

## Files Created

### 1. `Assets/Scripts/Systems/TimeOfDaySettings.cs`
ScriptableObject configuration for day/night cycle.

**Features:**
- `dayLengthMinutes` - Real-time minutes for 24-hour game day (default: 60 min)
- `startingHour` - Initial time when game starts (default: 6 AM)
- `timeScale` - Global time multiplier
- Time period thresholds (dawn, noon, dusk, midnight)
- `TimePeriod` enum for discrete time states

**Usage:**
1. Create asset: `Assets → Create → Bloom → Systems → Time of Day Settings`
2. Configure day length and time thresholds
3. Assign to TimeOfDaySystem component

### 2. `Assets/Scripts/Systems/TimeOfDaySystem.cs`
Server-authoritative NetworkBehaviour for multiplayer time sync.

**Features:**
- `NetworkVariable<float>` for time synchronization (server → clients)
- Singleton pattern via `TimeOfDaySystem.Instance`
- ServiceLocator registration as `ITimeOfDaySystem`
- Events: `OnDawn`, `OnNoon`, `OnDusk`, `OnMidnight`, `OnTimePeriodChanged`, `OnHourChanged`
- Pause/resume capability
- Time skip methods for story events

**Key Methods:**
```csharp
// Get current time (0-24 hours)
float hour = TimeOfDaySystem.Instance.GetTimeOfDay();

// Or via ServiceLocator
var timeSystem = ServiceLocator.Instance.GetService<ITimeOfDaySystem>();
float hour = timeSystem.GetTimeOfDay();

// Subscribe to events
timeSystem.OnDawn += () => Debug.Log("Dawn!");
timeSystem.OnTimePeriodChanged += (period) => Debug.Log($"Period: {period}");

// Server-only controls
TimeOfDaySystem.Instance.PauseTime();
TimeOfDaySystem.Instance.SetTimeOfDay(18f); // Set to 6 PM
TimeOfDaySystem.Instance.SkipToPeriod(TimePeriod.Midnight);
```

## Files Modified

### 1. `Assets/Scripts/Environment/Weather/WeatherSystem.cs` ✅ DONE
- Added `using Bloom.Systems;` import
- Updated `GetTimeOfDay()` to query `ITimeOfDaySystem` from ServiceLocator
- Falls back to singleton access, then to `12f` if system unavailable

### 2. `Assets/Scripts/Environment/Weather/ExtremeWeatherSystem.cs` ✅ DONE
- Added `using Bloom.Systems;` import
- Updated `GetTimeOfDay()` with same pattern as WeatherSystem

### Implementation Details (2025-01-28)
Both systems now use this pattern:
```csharp
private float GetTimeOfDay()
{
    // Query TimeOfDaySystem via ServiceLocator
    if (ServiceLocator.TryGetInstance(out var locator))
    {
        var timeSystem = locator.GetService<ITimeOfDaySystem>();
        if (timeSystem != null)
        {
            return timeSystem.GetTimeOfDay();
        }
    }

    // Fallback: try singleton access
    if (TimeOfDaySystem.Instance != null)
    {
        return TimeOfDaySystem.Instance.GetTimeOfDay();
    }

    // Default to noon if system unavailable (pre-spawn or missing)
    return 12f;
}
```

## How to Test

### 1. Scene Setup
1. Add an empty GameObject to your scene
2. Add `TimeOfDaySystem` component (requires NetworkBehaviour, so needs NetworkManager)
3. Create a `TimeOfDaySettings` ScriptableObject and assign it
4. Ensure `NetworkManager` is in scene and started

### 2. Basic Test
```csharp
// In any MonoBehaviour
void Start()
{
    StartCoroutine(TestTimeOfDay());
}

IEnumerator TestTimeOfDay()
{
    yield return new WaitForSeconds(1f); // Wait for NetworkManager spawn
    
    var timeSystem = TimeOfDaySystem.Instance;
    if (timeSystem != null)
    {
        Debug.Log($"Current time: {timeSystem.GetFormattedTime()}");
        Debug.Log($"Period: {timeSystem.CurrentPeriod}");
        
        // Subscribe to events
        timeSystem.OnHourChanged += (hour) => Debug.Log($"Hour: {hour}:00");
    }
}
```

### 3. Weather Integration Test
1. Start a host session
2. Weather system should now query actual time of day
3. BiomeWeatherPresets with `enableTimeOfDayModulation = true` will use real time
4. Check console for time-based weather probability changes

### 4. Multiplayer Test
1. Start host on one machine
2. Connect client on another
3. Both should show synchronized time
4. Only server can modify time (PauseTime, SetTimeOfDay, etc.)

## Integration Notes

### Weather System
- `BiomeWeatherPreset.GetRandomWeatherType(float timeOfDay)` now receives real time
- Time-of-day modulation curves in presets will work automatically
- No additional setup required

### HDRP Lighting (Future Work)
The TimeOfDaySystem provides events but does NOT directly control HDRP lighting. 
To integrate with HDRP:

```csharp
// Example: Hook into HDRP volume profile
public class HDRPTimeOfDayController : MonoBehaviour
{
    [SerializeField] private Volume hdriSky;
    [SerializeField] private AnimationCurve sunRotationCurve;
    
    void Start()
    {
        var timeSystem = ServiceLocator.Instance.GetService<ITimeOfDaySystem>();
        // Use timeSystem.CurrentHour or NormalizedTime to drive HDRP settings
    }
}
```

### Default Values (No Settings Asset)
If no `TimeOfDaySettings` is assigned:
- Day length: 60 minutes
- Starting hour: 6 AM
- Time periods use default thresholds

### Network Requirements
- Requires `NetworkManager` to be spawned before `TimeOfDaySystem` will sync
- Server-authoritative: only server can modify time
- Clients receive updates via `NetworkVariable` synchronization
- Pre-spawn queries return default starting hour (6 AM)

## Architecture

```
TimeOfDaySystem (NetworkBehaviour)
├── NetworkVariable<float> _networkTimeOfDay    [Server → Clients]
├── NetworkVariable<bool> _networkTimePaused    [Server → Clients]
├── NetworkVariable<float> _networkTimeScale    [Server → Clients]
├── ITimeOfDaySystem interface
│   └── Registered with ServiceLocator
├── Events
│   ├── OnDawn, OnNoon, OnDusk, OnMidnight
│   ├── OnTimePeriodChanged(TimePeriod)
│   ├── OnHourChanged(int)
│   └── OnPauseChanged(bool)
└── TimeOfDaySettings (ScriptableObject)
    └── Configuration data
```

## Known Limitations

1. **No HDRP integration** - System provides time data only; lighting control is separate
2. **No in-editor preview** - Time only advances at runtime with NetworkManager
3. **Authorization not implemented** - ServerRPCs don't validate permissions yet (TODO)
4. **Single time zone** - No support for different time zones in different world regions

## Future Enhancements (Not Implemented)

- [ ] HDRP sun/sky automatic control
- [ ] Moon phases
- [ ] Seasonal modifiers
- [ ] Time zone support for large worlds
- [ ] Authorization checks for ServerRPCs
