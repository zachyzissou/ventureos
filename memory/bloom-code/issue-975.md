# Issue #975: Clean up CS0414 unused field warnings

**Status**: ✅ Completed  
**PR**: https://github.com/zachyzissou/Bloom/pull/1122  
**Branch**: `fix/cs0414-warnings`

## Summary

Cleaned up CS0414 (unused field) warnings by removing fields that were marked as "reserved for future implementation" along with their `#pragma warning disable` suppressions.

## Changes Made

### 1. FactionAbilityEffects.cs
- Removed `lootDetectionRadius` field (Vultures ability placeholder)
- Removed associated pragma warning disable/restore

### 2. PlayerStash.cs
- Removed `unlimitedCapacity` field (capacity limits placeholder)
- Removed `[Header("Stash Configuration")]` attribute (no longer needed)
- Removed associated pragma warning disable/restore

### 3. SteamworksNetcodeTransport.cs
- Removed `maxConnections` field
- Removed `connectionTimeoutSeconds` field
- Removed `[Header("Connection Settings")]` attribute
- Removed associated pragma warning disable/restore

### 4. OrbitHarness.cs
- Complete simplification removing unused DOTS entity support:
  - Removed `#if UNITY_ENTITIES` conditional compilation blocks
  - Removed `targetEntity` field (both Entity and int versions)
  - Removed `moveDotsEntity` field
  - Removed `MoveDotsEntity()` methods
  - Removed DOTS-related using statements
- Simplified `ExecuteOrbit()` to only use Transform targets

## Rationale

These fields were suppressing CS0414 warnings with comments like "reserved for future implementation". However:

1. **YAGNI (You Ain't Gonna Need It)**: Better to add features when actually needed
2. **Code cleanliness**: Reduces clutter and technical debt
3. **Warning-free builds**: Removes need for pragma suppressions

If these features are needed in the future, they can be re-added with proper implementation rather than as unused placeholders.

## Files Changed

```
Assets/Scripts/Gameplay/FirstPlayable/Factions/FactionAbilityEffects.cs  (-3 lines)
Assets/Scripts/Gameplay/FirstPlayable/Persistence/PlayerStash.cs         (-5 lines)
Assets/Scripts/Networking/SteamworksNetcodeTransport.cs                  (-6 lines)
Assets/Scripts/Testing/Streaming/OrbitHarness.cs                         (-70 lines)
```

Total: 84 lines removed, codebase cleaner.
