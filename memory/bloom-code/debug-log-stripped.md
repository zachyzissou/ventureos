# Debug.Log Stripping - Issue #1068

**Date:** 2026-01-28
**Status:** Complete
**Issue:** https://github.com/zachyzissou/Bloom/issues/1068

## Summary

Migrated 3,414 Debug.Log calls to use BloomDebug wrapper with `[Conditional("DEBUG")]` attributes. All calls are now completely stripped from release builds at compile time.

## Changes Made

### New File: `Assets/Scripts/Core/BloomDebug.cs`

Created a static logging wrapper class that uses `[Conditional("DEBUG")]` attributes:

```csharp
using System.Diagnostics;

namespace Bloom.Core
{
    public static class BloomDebug
    {
        [Conditional("DEBUG")]
        public static void Log(object message) { ... }
        
        [Conditional("DEBUG")]
        public static void LogWarning(object message) { ... }
        
        [Conditional("DEBUG")]
        public static void LogError(object message) { ... }
        
        // Plus Format variants and Assert
    }
}
```

### Migration Statistics

- **Files modified:** 400
- **Calls wrapped:** 3,414
- **Remaining raw Debug.Log:** 0 (excluding BloomDebug.cs internal calls)

## How It Works

The `[Conditional("DEBUG")]` attribute causes the C# compiler to completely remove method calls (including argument evaluation) when the `DEBUG` symbol is not defined.

In Unity:
- **Editor/Development builds:** DEBUG is defined → logs execute
- **Release builds:** DEBUG is not defined → calls stripped entirely

## Performance Impact

Before: ~3,500 string allocations and method calls per frame (worst case)
After: Zero overhead in release builds - calls don't exist in IL

## Usage Guide

### For new code:
```csharp
using Bloom.Core;

BloomDebug.Log("Player spawned");
BloomDebug.LogWarning("Low health");
BloomDebug.LogError("Missing prefab");
```

### For critical errors that MUST appear in release:
```csharp
// Use UnityEngine.Debug directly for critical release-time errors
UnityEngine.Debug.LogError("Critical: Save file corrupted");
```

## Files Modified

See migration script output or git diff for full list. Key areas:
- Core systems (GameManager, EventBus, ServiceLocator)
- Networking (Steam, Netcode, P2P)
- World generation pipeline (all stages)
- Terrain streaming and loading
- Weather systems
- All gameplay systems

## Verification

Run in project root:
```powershell
rg "(?<!Bloom)Debug\.(Log|LogWarning|LogError)" --type cs -c Assets -g "!BloomDebug.cs"
```

Should return empty (no remaining raw calls).
