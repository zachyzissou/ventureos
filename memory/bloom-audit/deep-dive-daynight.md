# Deep Dive: Day/Night Cycle System

**Date**: 2025-01-28
**Status**: Critical Gap Identified
**Severity**: HIGH - Core survival game mechanic missing

---

## Executive Summary

The `GetTimeOfDay()` method in both `WeatherSystem.cs` and `ExtremeWeatherSystem.cs` returns a **hardcoded value of `12.0f`** (noon). This represents a **placeholder stub** with a TODO comment indicating the system was never implemented. For a survival game, this is a critical missing feature affecting:

- Weather modulation (fog at dawn/dusk)
- Thermal effects (night cold, day heat)
- Enemy spawn behavior (potential night-only spawns)
- Lighting/atmosphere (perpetual noon)
- Player experience (no day/night gameplay variety)

---

## 1. Current State (What Exists)

### 1.1 The Hardcoded Stubs

**Location 1:** `Assets/Scripts/Environment/Weather/WeatherSystem.cs` (lines 701-705)
```csharp
private float GetTimeOfDay()
{
    // TODO: Hook into TimeOfDaySystem when implemented
    // For now, return a placeholder value (12:00 noon)
    return 12f;
}
```

**Location 2:** `Assets/Scripts/Environment/Weather/ExtremeWeatherSystem.cs` (lines 389-393)
```csharp
private float GetTimeOfDay()
{
    // TODO: Hook into TimeOfDaySystem when implemented
    return 12f; // Placeholder: 12:00 noon
}
```

### 1.2 Time-of-Day Integration Points (Ready But Unused)

The weather system has **infrastructure ready** for time-of-day modulation:

**BiomeWeatherPreset.cs:**
- `enableTimeOfDayModulation` field (bool) - currently `false` by default
- `timeOfDayMultiplierCurves` - AnimationCurve array for per-hour probability adjustments
- `GetRandomWeatherType(float timeOfDay = 12f)` - accepts time parameter but always gets `12f`

**WeatherSystem.cs:**
- `TriggerWeatherChange(BiomeType biomeType, float timeOfDay)` - interface ready
- Time-of-day is passed through the system but always equals noon

### 1.3 No Day/Night Controller Exists

Searched for:
- ❌ `TimeOfDaySystem` - does not exist
- ❌ `DayCycleController` - does not exist
- ❌ `WorldTimeManager` - does not exist
- ❌ `SunController` / `DirectionalLightController` - does not exist
- ❌ Any HDRP sky/lighting controller tied to game time - not found

The project uses **HDRP** (High Definition Render Pipeline) but has no runtime day/night lighting system.

---

## 2. What's Missing

### 2.1 Core Day/Night System Components

| Component | Status | Description |
|-----------|--------|-------------|
| `TimeOfDaySystem.cs` | ❌ NOT IMPLEMENTED | Central time manager (0-24 hour cycle) |
| Sun/Light controller | ❌ NOT IMPLEMENTED | Directional light rotation + HDRP sky updates |
| Time synchronization | ❌ NOT IMPLEMENTED | Server-authoritative time for multiplayer |
| Time scale config | ❌ NOT IMPLEMENTED | How long is 1 game day in real time? |
| Time persistence | ❌ NOT IMPLEMENTED | Save/load current time of day |

### 2.2 Systems That Would Use Time-of-Day

| System | Current State | Expected Behavior |
|--------|---------------|-------------------|
| **Weather** | Always gets `12f` | Fog at dawn/dusk, storms in afternoon |
| **Thermal** | Constant baseline | Colder at night, hotter at midday |
| **Enemy Spawns** | Time-agnostic | Night = more enemies, different types |
| **Lighting** | Static noon | Sun position changes, shadows rotate |
| **Sky** | Static | HDRP sky gradient, star visibility at night |
| **NPC Schedules** | None | Vendors, patrols could have schedules |

### 2.3 Design Documentation Gap

**WeatherConfigurationGuide.md** mentions time-of-day modulation:
> "Make weather probability dynamic based on time (e.g., fog at dawn/dusk, thunderstorms in afternoon)"

**SURVIVAL_MECHANICS_MASTER_DESIGN.md** describes thermal effects but assumes a working day/night cycle:
> "Thermal gameplay effects (hypothermia in blizzards, heatstroke in haboobs)"

**No design doc** specifies:
- How long is a game day? (10 min? 30 min? 2 hours?)
- What time does a session/raid start at?
- Are there night-only mechanics (enemies, events)?
- Do players need to manage sleep/fatigue?

---

## 3. Dependencies & Blockers

### 3.1 Technical Dependencies

| Dependency | Available? | Notes |
|------------|------------|-------|
| HDRP Sky System | ✅ Yes | Project uses HDRP, sky controls available |
| Directional Light | ✅ Likely | Standard scene setup expected |
| Netcode | ✅ Yes | Unity Netcode for GameObjects in use |
| ServiceLocator | ✅ Yes | Can register `ITimeOfDaySystem` |

### 3.2 Blockers

1. **No design spec** - Need to decide day length, starting time, gameplay implications
2. **Multiplayer sync** - Must be server-authoritative; time must sync to all clients
3. **Performance** - HDRP sky updates can be expensive; need LOD for distant rendering
4. **Save/Load** - Time must persist across sessions

---

## 4. Estimated Effort to Complete

### 4.1 Minimum Viable Implementation

**Time:** 2-3 days
**Scope:**
- `TimeOfDaySystem.cs` with configurable day length
- Wire `GetTimeOfDay()` to the real system
- Basic HDRP directional light rotation
- Server-authoritative time sync

### 4.2 Full Implementation

**Time:** 1-2 weeks
**Additional Scope:**
- HDRP procedural sky (sunset/sunrise gradients, stars at night)
- Volumetric lighting adjustments
- Weather probability curves active
- Thermal modulation (night cold)
- Night-specific enemy spawns
- UI time indicator
- Save/load time state
- Designer-configurable parameters

### 4.3 Polish & Balance

**Time:** Ongoing (1-2 weeks after initial implementation)
- Tune day length for pacing
- Balance night difficulty
- Add night-only events/POIs
- Audio (night insects, day birds)

---

## 5. Recommended Approach

### Phase 1: Core System (2-3 days)

1. **Create `ITimeOfDaySystem` interface:**
   ```csharp
   public interface ITimeOfDaySystem
   {
       float CurrentHour { get; } // 0-24
       float NormalizedTime { get; } // 0-1 (midnight to midnight)
       bool IsDay { get; }
       bool IsNight { get; }
       event Action<float> OnHourChanged;
   }
   ```

2. **Create `TimeOfDaySystem.cs`:**
   - NetworkBehaviour for server authority
   - Configurable `realSecondsPerGameHour` (e.g., 60 = 24-minute day cycle)
   - Syncable `NetworkVariable<float>` for current time
   - Register with ServiceLocator

3. **Wire weather systems:**
   - Replace hardcoded `12f` with `ServiceLocator.Instance.GetService<ITimeOfDaySystem>().CurrentHour`

4. **Basic lighting:**
   - Rotate directional light based on time
   - Update HDRP sky controller if available

### Phase 2: Gameplay Integration (1 week)

1. Enable `enableTimeOfDayModulation` in BiomeWeatherPresets
2. Configure fog/storm curves for dawn/dusk/afternoon
3. Add thermal night penalty to ThermalEffectSystem
4. Add time-based spawn modifiers to EnemySpawner
5. Add HUD time indicator

### Phase 3: Polish (1 week)

1. HDRP procedural sky (sunset colors, stars)
2. Post-processing adjustments (night = blue tint, day = warm)
3. Audio ambience switching
4. Night-only events (rare spawns, special POIs)

---

## 6. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Performance (HDRP sky updates) | Medium | Update sky every 5 seconds, not every frame |
| Multiplayer desync | High | Server-authoritative time; clients interpolate |
| Balance (night too hard) | Medium | Start with subtle differences, tune based on playtest |
| Scope creep | Medium | Phase 1 is minimal; don't add schedules/sleep yet |

---

## 7. Conclusion

The Day/Night system is **completely unimplemented** despite being a core survival game feature. The weather system has **infrastructure ready** to consume time-of-day data, but the source of that data doesn't exist.

**Recommendation:** Prioritize Phase 1 (2-3 days) before Early Access. A working day/night cycle is a fundamental expectation for any survival game. The hardcoded noon creates a static, less immersive experience that wastes the existing time-of-day modulation infrastructure.

---

## Appendix: Files Involved

### Files to Modify
- `Assets/Scripts/Environment/Weather/WeatherSystem.cs`
- `Assets/Scripts/Environment/Weather/ExtremeWeatherSystem.cs`
- `Assets/Scripts/Environment/Weather/BiomeWeatherPreset.cs` (enable modulation)

### Files to Create
- `Assets/Scripts/Core/TimeOfDay/ITimeOfDaySystem.cs`
- `Assets/Scripts/Core/TimeOfDay/TimeOfDaySystem.cs`
- `Assets/Scripts/Core/TimeOfDay/SunController.cs`

### Configuration Assets to Update
- All BiomeWeatherPreset assets (enable time modulation, configure curves)
