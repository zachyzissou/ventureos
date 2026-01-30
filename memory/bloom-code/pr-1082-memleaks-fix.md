# PR #1082 Memory Leak Fixes

**Status:** ✅ Complete
**Commit:** 1c020800961c14be149669bfe8a8f9b8eb0ee87f
**Branch:** feat/issue-1065-territory-quietus-foundation-v2

## Fixes Implemented

### 1. TerritoryCaptureTrigger.cs - NetworkVariable Subscriptions

**Problem:** OnNetworkSpawn subscribed to 7 faction capture progress NetworkVariables but never unsubscribed.

**Solution:** Added OnNetworkDespawn (line 98-108) that unsubscribes from all events:
```csharp
public override void OnNetworkDespawn()
{
    directorateCaptureProgress.OnValueChanged -= HandleDirectorateCaptureProgressChanged;
    vulturesCaptureProgress.OnValueChanged -= HandleVulturesCaptureProgressChanged;
    wardensCaptureProgress.OnValueChanged -= HandleWardensCaptureProgressChanged;
    seventySevenCaptureProgress.OnValueChanged -= HandleSeventySevenCaptureProgressChanged;
    pactOfAshCaptureProgress.OnValueChanged -= HandlePactOfAshCaptureProgressChanged;
    roadbornCaptureProgress.OnValueChanged -= HandleRoadbornCaptureProgressChanged;
    archiveCaptureProgress.OnValueChanged -= HandleArchiveCaptureProgressChanged;
    base.OnNetworkDespawn();
}
```

### 2. TerritoryManager.cs - Zone Event Cleanup

**Problem:** Zone registrations subscribed to events without cleanup.

**Solution:** Added OnNetworkDespawn (line 44-64) with proper cleanup pattern.

## Code Style Improvements (Same Commit)

- Replaced verbose foreach loops with LINQ `.Where()` and `.Select()`
- Added warning logging for faction detection edge cases
- Improved code readability

## Validation

- [x] OnNetworkDespawn exists in both files
- [x] All subscriptions have matching unsubscriptions
- [x] Changes committed and pushed
- [x] PR #1082 updated

**Validated:** 2026-01-28 22:35 CST
