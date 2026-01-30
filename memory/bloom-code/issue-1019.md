# Issue #1019: Terra: Hydrology Metadata Cache Invalidation on Biome Config Changes

**Status**: ✅ Completed  
**PR**: [#1146](https://github.com/zachyzissou/Bloom/pull/1146)  
**Branch**: `feat/hydrology-cache-invalidation`  
**Date**: 2026-01-29

## Problem

The hydrology metadata (HydrologyMetadata.asset) stores water feature data that depends on biome configurations. When BiomeConfiguration assets are modified, the cached hydrology metadata becomes stale but there was no mechanism to detect or handle this.

## Solution

Implemented a comprehensive cache invalidation system:

### New Files

1. **HydrologyMetadataCacheValidator.cs** (Editor script)
   - Computes combined SHA256 hash of all BiomeConfiguration assets
   - Stores hash comparison for validation
   - Provides methods to check cache validity and invalidate
   - Auto-validates on editor startup
   - Integrates with AssetPostprocessor for change detection
   - Adds menu items: `Bloom > World Generation > Validate Hydrology Cache` and `Force Invalidate Hydrology Cache`

### Modified Files

1. **HydrologyMetadata.cs**
   - Added `biomeConfigHash` field (stores hash at build time)
   - Added `lastBuildTimestamp` field (ISO 8601 timestamp)

2. **BiomeConfigurationPostprocessor.cs**
   - Integrated with HydrologyMetadataCacheValidator
   - Triggers validation when biome configs are imported/deleted

3. **BiomeManager.cs**
   - Added `InvalidateHydrologyCache()` method
   - Clears `cachedHydrologyMetadata` and resets warning flag

4. **RuntimeTerrainLoader.cs**
   - Added `InvalidateHydrologyCache()` method
   - Clears `cachedHydrologyMetadata` and resets warning flag

5. **HydrologyMetadataBuilderEditor.cs**
   - Calls `HydrologyMetadataCacheValidator.UpdateStoredHash(metadata)` after rebuild
   - Ensures hash is stored before asset is saved

## Architecture

```
BiomeConfiguration changes
        ↓
BiomeConfigurationPostprocessor.OnPostprocessAllAssets()
        ↓
HydrologyMetadataCacheValidator.OnBiomeConfigurationChanged()
        ↓
    [Hash comparison]
        ↓ (if different)
HydrologyMetadataCacheValidator.InvalidateCache()
        ↓
    - Log warning to user
    - Call BiomeManager.InvalidateHydrologyCache()
    - Call RuntimeTerrainLoader.InvalidateHydrologyCache()
    - Fire OnCacheInvalidated event
```

## Usage

### Automatic
- On editor startup: validates cache silently, warns if stale
- On biome config changes: detects changes, invalidates if needed

### Manual
- Menu: `Bloom > World Generation > Validate Hydrology Cache`
- Menu: `Bloom > World Generation > Force Invalidate Hydrology Cache`
- Menu: `Bloom > World Generation > Rebuild Hydrology Metadata` (also updates hash)

## Technical Notes

- Hash computation uses SHA256 via HashUtility
- BiomeConfiguration.ComputeHash() includes: biomeType, baseFrequency, octaveCount, powerCurve, elevation range, world center, cover density, terrain layers, macro features, composition profile
- Session state prevents repeated startup validation in same editor session
- Uses EditorApplication.delayCall for async safety
