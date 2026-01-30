# SeedManager Usage Guide

## Overview

The `SeedManager` class provides centralized seed management for deterministic procedural generation in Bloom. This addresses issue #1048 by ensuring consistent seeding across all world generation systems.

## When to Use Deterministic vs Non-Deterministic

### ✅ Use Deterministic (SeedManager)

**World Generation Systems:**
- Terrain heightmaps and noise generation
- River and lake placement
- Vegetation distribution and placement
- Biome boundaries
- Erosion simulation
- Detail zone generation
- Ecology systems

**Multiplayer Requirements:**
- Any system where all clients must generate identical results
- Systems that affect gameplay mechanics (collision, AI pathfinding)
- Systems that create save-loadable content

### ❌ Use Non-Deterministic (Regular Random)

**User Experience Systems:**
- Audio system callout variations
- Narrative dialogue variations 
- UI animations and effects
- Particle effects (non-gameplay)
- Weather transitions (for immersion, not gameplay)
- Enemy spawn timing variations (balance vs predictability)

### ⚠️ Context-Dependent

**Weather Systems:**
- Use deterministic for multiplayer consistency
- Use non-deterministic for single-player variety

**Audio:**
- Use deterministic for critical audio cues
- Use non-deterministic for ambient/atmospheric audio

## Usage Patterns

### 1. Initialize at World Generation Start
```csharp
// In GlobalPrepStage or similar
SeedManager.Initialize(worldSeed);
```

### 2. Deterministic Subsystem Seeds
```csharp
// Get a deterministic seed for terrain at tile (5, 10)
int terrainSeed = SeedManager.GetDeterministicSeed(SeedManager.SeedCategory.Terrain, 5, 10);

// Get System.Random for complex deterministic operations
var terrainRandom = SeedManager.GetDeterministicRandom(SeedManager.SeedCategory.Vegetation, tileX, tileZ);
```

### 3. Temporary Deterministic State
```csharp
// For systems using UnityEngine.Random that need determinism
SeedManager.PushState(SeedManager.SeedCategory.Hydrology, regionX, regionY);
try
{
    // Generate rivers using UnityEngine.Random calls
    GenerateRivers();
}
finally
{
    SeedManager.PopState(); // ALWAYS restore state
}
```

### 4. Non-Deterministic Operations
```csharp
// For UI/audio/effects that should vary
float randomValue = SeedManager.GetNonDeterministicRandom().Range(0f, 1f);
```

## Seed Categories

- `Terrain`: Base heightmaps, noise generation
- `Vegetation`: Plant placement and distribution
- `Hydrology`: Rivers, lakes, water systems
- `Ecology`: Species interactions and ecosystems
- `DetailZones`: High-resolution detail areas
- `Erosion`: Terrain modification processes
- `Biomes`: Biome boundaries and transitions
- `Weather`: Climate and weather patterns (context-dependent)

## Migration from Legacy Systems

### Before (Manual Seeding)
```csharp
// Old approach - inconsistent across systems
Random.InitState((tileX * 73856093) ^ (tileZ * 19349663));
var rng = new System.Random(someHashCode);
```

### After (SeedManager)
```csharp
// New approach - consistent and centralized
int seed = SeedManager.GetDeterministicSeed(SeedManager.SeedCategory.Terrain, tileX, tileZ);
var rng = new System.Random(seed);
```

## Debugging and Logging

### Enable Seed Logging
```csharp
// Check current seed state
SeedManager.LogSeedState("Before terrain generation");

// Get master seed for debugging
int masterSeed = SeedManager.GetMasterSeed();
```

### Multiplayer Validation
```csharp
// Ensure all clients have same master seed
Debug.Log($"Client seed: {SeedManager.GetMasterSeed()}");
```

## Best Practices

1. **Initialize Early**: Call `SeedManager.Initialize()` before any generation
2. **Use Categories**: Choose appropriate seed categories for your system
3. **Match State Operations**: Always pair `PushState()` with `PopState()`
4. **Separate Concerns**: Keep deterministic and non-deterministic operations separate
5. **Document Intent**: Comment whether your system should be deterministic or not
6. **Test Reproducibility**: Verify same seeds produce identical results

## Common Pitfalls

❌ **Don't mix approaches**: Don't use both SeedManager and manual Random.InitState()
❌ **Don't forget PopState**: Unmatched PushState calls break random state
❌ **Don't over-determinize**: Not everything needs to be deterministic
❌ **Don't use wrong category**: Choose the most appropriate seed category

## Testing

```csharp
// Test deterministic behavior
int seed1 = SeedManager.GetDeterministicSeed(SeedManager.SeedCategory.Terrain, 0, 0);
int seed2 = SeedManager.GetDeterministicSeed(SeedManager.SeedCategory.Terrain, 0, 0);
Assert.AreEqual(seed1, seed2, "Same inputs should produce same seeds");
```