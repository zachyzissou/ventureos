# Issue #954: Fix ServiceLocator DontDestroyOnLoad in Editor Mode

## Status: PR Created ✅

## Problem
`DontDestroyOnLoad()` throws an error when called outside of Play mode in the Unity Editor. This was happening in `ServiceLocator.cs` when it was accessed in Editor scripts or during edit-time initialization.

## Solution
Wrapped both `DontDestroyOnLoad` calls with `Application.isPlaying` checks in:
- `CreateLocator()` method (line 145)
- `Awake()` method (line 161)

## Changes Made
```csharp
// Only call DontDestroyOnLoad in Play mode - it throws in Editor mode
if (Application.isPlaying)
{
    DontDestroyOnLoad(go);
}
```

## Files Modified
- `Assets/Scripts/Core/ServiceLocator.cs`

## PR Details
- **Branch:** `fix/servicelocator-editor-ddol`
- **PR:** https://github.com/zachyzissou/Bloom/pull/1118
- **Commit:** `4bc53fb59` - "fix: wrap DontDestroyOnLoad calls with Application.isPlaying check"

## Date
2026-01-29
