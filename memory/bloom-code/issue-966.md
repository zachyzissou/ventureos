# Issue #966: Macro Mask Analysis - Remove Full Pre-Generation Pass

**Status:** Fixed
**PR:** #1123
**Branch:** `fix/macro-mask-pregeneration-966`

## Problem

In `MacroWorldGenerator.AnalyzeMask()`, there was a full pre-generation pass that loaded all 1024 tiles (32×32 world) into memory BEFORE starting analysis. This was wasteful because:

1. The tiled mask system (`TiledMacroMaskManager`) was designed for on-demand generation with LRU caching
2. Pre-generating all tiles defeated the purpose of the LRU cache (only 9 tiles should be active)
3. The analysis loop already called `GetMaskTile()`, which handles generation on-demand
4. Double work: tiles were generated twice (pre-gen loop + analysis loop)

## Solution

Removed the pre-generation loop (lines 496-527) and let the analysis loop generate tiles on-demand as it processes them.

### Changes Made

1. **Removed pre-generation loop:**
   - Deleted the `Parallel.ForEach` batch generation that pre-loaded all tiles
   - Removed associated logging ("Pre-generating X tiles...")

2. **Updated analysis to use on-demand generation:**
   - Analysis loop now relies on `GetMaskTile()` for on-demand generation
   - Added comment explaining the on-demand behavior

3. **Fixed indentation:**
   - The analysis section had extra indentation (16 spaces instead of 12)
   - Normalized to consistent 12-space indentation

### Before (simplified):
```csharp
// Pre-generate ALL tiles upfront
for (batchStart = 0; ...; batchSize)
{
    Parallel.ForEach(batch, coord => GetMaskTile(coord));  // Generates all tiles
}

// Then analyze (calls GetMaskTile AGAIN)
for (batchStart = 0; ...; analysisBatchSize)
{
    GetMaskTile(coord);  // Already generated, but still called
    // analyze...
}
```

### After:
```csharp
// NO pre-generation - analyze with on-demand generation
for (batchStart = 0; ...; analysisBatchSize)
{
    // On-demand: generates tile if not cached
    GetMaskTile(coord);
    // analyze...
}
```

## Files Modified

- `Assets/Scripts/Terrain/MacroFeatures/MacroWorldGenerator.cs`
  - Removed pre-generation loop
  - Fixed indentation in AnalyzeMask method
  - Updated comments to explain on-demand behavior

## Testing Notes

The change should be functionally equivalent since:
- `GetMaskTile()` already handles generation when tiles aren't cached
- The LRU cache will now work as designed (max 9 tiles active)
- Memory usage should be significantly reduced during analysis

## Date

2026-01-29
