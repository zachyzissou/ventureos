# Environmental Hazards System - Summary

**Created:** 2026-01-28
**Status:** Design Complete - Ready for Implementation

## Overview

Designed a comprehensive environmental hazard system for Bloom's 13 biomes. The system integrates with existing code:

- **BuffController** - For status effect debuffs (movement, accuracy, stamina)
- **PlayerHealth** - For direct damage over time
- **SurvivalVitals** - For accelerated hunger/thirst/stamina drain  
- **WeatherSystem** - For visibility and weather-triggered hazards

## Key Finding: No Existing Hazard System

Searched the codebase - no `HazardDefinition`, `HazardZone`, or similar exists. This is a **new system** to be built.

### Relevant Files Found
- `Assets/Scripts/Core/Messages.cs` - Uses BiomeType for tile metadata
- `Assets/Scripts/Environment/Weather/IWeatherSystem.cs` - Weather types with effects
- `Assets/Scripts/Environment/Weather/BiomeWeatherPreset.cs` - Per-biome weather config
- `Assets/Scripts/Gameplay/FirstPlayable/Buffs/BuffDefinition.cs` - Status effect system
- `Assets/Scripts/Gameplay/FirstPlayable/Buffs/BuffController.cs` - Buff application
- `Assets/Scripts/Gameplay/FirstPlayable/Player/PlayerHealth.cs` - Damage system
- `Assets/Scripts/Gameplay/FirstPlayable/Survival/SurvivalVitals.cs` - Hunger/thirst/stamina

## Hazard Types by Biome

| Biome | Primary Hazards | Mechanics |
|-------|-----------------|-----------|
| **CentralGrasslands** | Pollen storms, Sinkholes, IEZ anomalies | Visibility, terrain collapse, equipment malfunction |
| **EasternPlateaus** | High winds, Cliff edges, Radiation | Movement/accuracy, fall hazard, DOT |
| **ForestHills** | Toxic spores, Predators, Undergrowth | Poison stacks, AI threat, movement |
| **SnowPeaks** | Hypothermia, Avalanches, Thin ice | Warmth system, instant kill, fall-through |
| **SouthwestPlains** | Heat exhaustion, Dust storms, Quicksand | Thirst drain, visibility, movement trap |

## New ScriptableObjects Needed

### HazardDefinition.cs
```csharp
[CreateAssetMenu(menuName = "Bloom/Environment/Hazard Definition")]
public class HazardDefinition : ScriptableObject
{
    public string hazardId;
    public BiomeType[] validBiomes;
    public HazardTriggerType triggerType;
    public BuffDefinition debuffToApply;
    public float damagePerSecond;
    public float hungerDrainMultiplier;
    public float thirstDrainMultiplier;
    public float visibilityOverride;
}
```

### HazardZone.cs (MonoBehaviour)
- Trigger volume like ExtractionZone
- Applies debuffs via BuffController
- Ticks damage via PlayerHealth.ApplyDamage()
- Can link to weather system for conditional activation

## New Buff Definitions Needed

| Buff ID | Type | Key Modifiers |
|---------|------|---------------|
| `hazard_pollen_storm` | Debuff | 0.75x move, 0.8x stamina regen |
| `hazard_high_winds` | Debuff | 0.8x move, 0.7x accuracy |
| `hazard_toxic_spores` | Debuff/Stack | 0.9x move, poison DOT |
| `hypothermia_*` | Debuff (3 tiers) | Progressive movement/stamina |
| `heat_*` | Debuff (3 tiers) | Progressive thirst/damage |
| `hazard_quicksand` | Debuff | 0.1x move (scales to 0) |

## Weather Integration

Some hazards should trigger from existing weather types:
- `WeatherType.Wind` → High Winds hazard (enhanced)
- `WeatherType.Blizzard/Whiteout` → Hypothermia
- `WeatherType.DustStorm/Haboob` → Dust/Heat hazards

Consider adding:
- `WeatherType.PollenStorm` (new, for CentralGrasslands)

## Implementation Priority

1. **Phase 1: Core System**
   - HazardDefinition ScriptableObject
   - HazardZone MonoBehaviour  
   - Basic buff application

2. **Phase 2: Weather Integration**
   - Weather-triggered hazards
   - Conditional activation

3. **Phase 3: Content Creation**
   - Create all buff definitions
   - Create hazard definition assets
   - Place zones during terrain generation
   - Add VFX and audio

## Documentation Created

Full designs in Obsidian vault:
- `🔧 Projects/Bloom/Biome Hazards/Environmental Hazard System Design.md`
- `🔧 Projects/Bloom/Biome Hazards/Central Grasslands Hazards.md`
- `🔧 Projects/Bloom/Biome Hazards/Eastern Plateaus Hazards.md`
- `🔧 Projects/Bloom/Biome Hazards/Forest Hills Hazards.md`
- `🔧 Projects/Bloom/Biome Hazards/Snow Peaks Hazards.md`
- `🔧 Projects/Bloom/Biome Hazards/Southwest Plains Hazards.md`
- `🔧 Projects/Bloom/Biome Hazards/Additional Biome Hazards.md`

---

VALIDATION:
- Output file: C:\Users\Zachg\clawd\memory\bloom-code\environmental-hazards.md ✓ exists
- Completeness: complete
- Self-check: PASS - Verified existing systems, designed compatible integration
- Confidence: high
