# HDRP Performance Optimization Analysis - Issue #1063

**Date:** 2025-01-28  
**Issue:** #1063 - HDRP costs 69% of frame budget (53 FPS projected)  
**Target:** 60 FPS (16.67ms frame budget)  
**Current Projection:** 53 FPS (18.8ms per frame)  
**Priority:** P1

---

## Executive Summary

HDRP is consuming **~12-15ms per frame** (69-90% of the 16.67ms budget for 60 FPS). Analysis of the current HDRP quality tier assets reveals several high-cost features that can be optimized without significant visual degradation.

### Quick Wins (Est. +10-15 FPS combined)

| Change | Est. Savings | Visual Impact |
|--------|-------------|---------------|
| Disable SSGI in High Fidelity | 2-3ms | Moderate |
| Disable SSR Transparent | 1-2ms | Low |
| Reduce Shadow Atlas 4096→2048 | 1-2ms | Low |
| Enable Dynamic Resolution (DLSS/FSR2) | 4-6ms | Varies |
| Reduce Volumetric Fog Budget | 1-2ms | Low |
| LOD Bias Optimization | 0.5-1ms | Low |

---

## Current Configuration Analysis

### Quality Tier Comparison

| Feature | High Fidelity | Balanced | Performant | Recommendation |
|---------|--------------|----------|------------|----------------|
| **SSR** | ✅ ON | ❌ OFF | ❌ OFF | Keep OFF for Balanced |
| **SSR Transparent** | ✅ ON | ❌ OFF | ❌ OFF | Disable (high cost) |
| **SSGI** | ✅ ON | ❌ OFF | ❌ OFF | **Disable (3ms+)** |
| **Ray Tracing** | ✅ ON | ❌ OFF | ❌ OFF | Disable by default |
| **Volumetric Clouds** | ✅ ON | ❌ OFF | ❌ OFF | Disable for perf |
| **Volumetrics** | ✅ ON | ✅ ON | ❌ OFF | Reduce budget |
| **Light Layers** | ✅ ON | ✅ ON | ✅ ON | Keep (low cost) |
| **SSAO** | ✅ ON | ✅ ON | ✅ ON | Reduce quality |
| **Contact Shadows** | ✅ ON | ✅ ON | ✅ ON | Reduce samples |
| **Dynamic Resolution** | ❌ OFF | ❌ OFF | ❌ OFF | **Enable (critical)** |

### Shadow Configuration

**Current Settings (High Fidelity):**
```yaml
Shadow Atlas: 4096x4096 (punctual)
Area Light Atlas: 4096x4096
Cached Punctual: 4096
Cached Area: 4096
Max Directional: 4096
Max Punctual: 4096  
Max Area: 4096
Filtering Quality: 2 (High)
```

**🔴 Problem:** 4096x4096 shadow atlases are GPU-memory intensive and cause excessive draw calls for shadow cascades.

**Recommendation for Balanced:**
```yaml
Shadow Atlas: 2048x2048 (punctual)
Area Light Atlas: 2048x2048
Cached Punctual: 2048
Cached Area: 1024
Max Directional: 2048
Max Punctual: 2048
Max Area: 1024
Filtering Quality: 1 (Medium)
```

### Volumetric Fog Configuration

**Current (SkyandFogSettingsProfile):**
```yaml
enableVolumetricFog: true
screenResolutionPercentage: 8%
volumeSliceCount: 32
volumetricFogBudget: 0.25 (25%)
resolutionDepthRatio: 0.5
anisotropy: 0.65
```

**🔴 Problem:** 32 volume slices at 25% budget is expensive for real-time.

**Recommendation:**
```yaml
volumeSliceCount: 16-24
volumetricFogBudget: 0.166 (16.6%)
resolutionDepthRatio: 0.666
```

### SSAO Configuration

**Current (DefaultSettingsVolumeProfile):**
```yaml
intensity: 0.5
radius: 1.5
quality: Medium
fullRes: false (quality-dependent)
```

**Analysis:** Current settings are reasonable. For Performant tier, consider:
- Reduce step count: 4 → 3
- Reduce direction count: 2 → 1
- Ensure half-resolution rendering

### LOD Configuration

**Current (All Tiers):**
```yaml
lodBias: [1, 1, 1]  # Same across Low/Medium/High
maximumLODLevel: [0, 0, 0]
```

**🔴 Problem:** LOD bias of 1.0 across all quality levels means no LOD differentiation.

**Recommendation:**
```yaml
# Performant
lodBias: [0.5, 0.75, 1.0]
maximumLODLevel: [1, 0, 0]

# Balanced  
lodBias: [0.75, 1.0, 1.25]
maximumLODLevel: [0, 0, 0]

# High Fidelity
lodBias: [1.0, 1.25, 1.5]
maximumLODLevel: [0, 0, 0]
```

---

## Optimization Recommendations

### Priority 1: Enable Dynamic Resolution (Est. +4-6ms / +8-12 FPS)

**Why:** Single largest performance gain with minimal visual impact when using modern upscalers.

**Implementation (HDRP Balanced.asset):**
```yaml
dynamicResolutionSettings:
  enabled: 1
  useMipBias: 1
  DLSSPerfQualitySetting: 2  # Quality mode
  DLSSUseOptimalSettings: 1
  FSR2UseOptimalSettings: 1
  FSR2QualitySetting: 2  # Quality mode
  maxPercentage: 100
  minPercentage: 66
  dynResType: 1  # Software
  upsampleFilter: 6  # FSR 1.0 as fallback
```

### Priority 2: Reduce SSGI/SSR Impact (Est. +3-5ms)

**High Fidelity Changes:**
```yaml
supportSSGI: 0  # Disable SSGI entirely (use reflection probes)
supportSSRTransparent: 0  # Disable transparent SSR
```

**Volume Override Alternative:**
- Keep SSR but limit ray steps: 32 → 16
- Use SSR Quality: Medium instead of High

### Priority 3: Shadow Optimization (Est. +1-2ms)

**Balanced Tier Modifications:**
```yaml
hdShadowInitParams:
  punctualLightShadowAtlas:
    shadowAtlasResolution: 2048  # Was 4096
  areaLightShadowAtlas:
    shadowAtlasResolution: 1024  # Was 2048
  cachedPunctualLightShadowAtlas: 1024  # Was 2048
  cachedAreaLightShadowAtlas: 512  # Was 2048
  maxDirectionalShadowMapResolution: 2048  # Unchanged
  maxPunctualShadowMapResolution: 1024  # Was 2048
  maxAreaShadowMapResolution: 1024  # Was 2048
  punctualShadowFilteringQuality: 0  # Was 1 (Low)
  directionalShadowFilteringQuality: 1  # Keep Medium
```

**Volume Override - Shadow Distance:**
```yaml
maxShadowDistance: 100  # Was 150 (saves cascade updates)
```

### Priority 4: Reflection Probe Optimization (Est. +0.5-1ms)

**Current Issues:**
- `maxCubeReflectionOnScreen: 64` (High Fidelity)
- `maxPlanarReflectionOnScreen: 64` (High Fidelity)

**Recommendations:**
```yaml
# Balanced
maxCubeReflectionOnScreen: 24
maxPlanarReflectionOnScreen: 8
reflectionCubemapSize: 128  # Was 256
skyReflectionSize: 256  # Was 512
planarReflectionAtlasSize: 512  # Was 1024
```

### Priority 5: Post-Processing Budget (Est. +0.5-1ms)

**Motion Blur (DefaultSettingsVolumeProfile):**
```yaml
# Reduce sample count
m_SampleCount: 4  # Was 8
quality: 0  # Low instead of Medium
```

**Bloom:**
```yaml
# Current is reasonable, but can reduce:
m_Resolution: 4  # Was 2 (quarter res instead of half)
m_HighQualityPrefiltering: 0  # Already disabled
```

---

## Proposed Quality Tier Changes

### New "Balanced" Configuration (Default)

```yaml
# Key changes from current Balanced
supportSSR: 0  # Keep disabled
supportSSAO: 1  # Keep enabled but optimize
supportVolumetrics: 1  # Keep but reduce budget

# Shadows
shadowAtlasResolution: 2048
maxShadowMapResolution: 2048

# Dynamic Resolution - NEW
dynamicResolutionSettings:
  enabled: 1
  minPercentage: 66
  maxPercentage: 100

# LOD - Updated
lodBias: [0.75, 1.0, 1.25]

# Reflection
maxCubeReflectionOnScreen: 24
reflectionCubemapSize: 128
```

### New "Performant" Configuration (Low-End)

```yaml
supportSSR: 0
supportSSAO: 1  # Half-res only
supportVolumetrics: 0  # Disable entirely

# Aggressive shadow reduction
shadowAtlasResolution: 1024
maxDirectionalShadowMapResolution: 1024
maxPunctualShadowMapResolution: 512

# Dynamic Resolution with higher scale
dynamicResolutionSettings:
  enabled: 1
  minPercentage: 50
  maxPercentage: 85

# LOD
lodBias: [0.5, 0.75, 1.0]
maximumLODLevel: [1, 0, 0]
```

---

## Expected Impact Summary

| Optimization | Before | After | FPS Gain |
|--------------|--------|-------|----------|
| Dynamic Resolution | OFF | ON (66-100%) | +8-12 |
| SSGI | ON | OFF | +3-4 |
| SSR Transparent | ON | OFF | +1-2 |
| Shadow Atlas | 4096 | 2048 | +1-2 |
| Volumetric Fog | 25%/32 | 16.6%/16 | +1-2 |
| Reflection Probes | 64 | 24 | +0.5-1 |
| LOD Bias | 1.0 | 0.75-1.25 | +0.5-1 |
| **TOTAL ESTIMATED** | **53 FPS** | **68-75 FPS** | **+15-22** |

---

## Implementation Plan

### Phase 1: Non-Destructive (Settings Only)

1. ✅ Analyze current HDRP assets (this document)
2. Enable Dynamic Resolution in Balanced/Performant tiers
3. Reduce shadow atlas sizes in Balanced tier
4. Adjust LOD bias per quality tier
5. Test with Profiler to validate savings

### Phase 2: Quality-Selective Features

1. Create runtime quality switcher (if not exists)
2. Disable SSGI/SSR in Balanced (keep in High Fidelity)
3. Volume profile overrides per quality level
4. Expose settings in game options menu

### Phase 3: Validation

1. Profile before/after with Unity Profiler
2. Capture GPU timing with RenderDoc
3. Test on min-spec hardware
4. Update DEEP-PERFORMANCE-ANALYSIS.md with results

---

## Files to Modify

| File | Changes |
|------|---------|
| `HDRP Balanced.asset` | Dynamic res, shadows, LOD bias |
| `HDRP Performant.asset` | Aggressive optimization |
| `HDRP High Fidelity.asset` | Disable SSGI, SSR transparent |
| `DefaultSettingsVolumeProfile.asset` | Shadow distance, motion blur |
| `SkyandFogSettingsProfile.asset` | Reduce volumetric budget |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Dynamic Resolution | Slight blur at low res | Use FSR2/DLSS Quality |
| Disable SSGI | Less accurate GI | Bake more reflection probes |
| Shadow reduction | Softer shadows | Barely noticeable at distance |
| LOD changes | Pop-in potential | Use dither crossfade |
| Volumetric reduction | Less fog detail | Still looks good |

---

## Notes for PR

- Branch: `perf/issue-1063-hdrp-optimization`
- All changes should be toggleable via Quality Settings
- Document baseline FPS before merge
- Add regression test for frame budget

---

**Analysis by:** Subagent bloom-fix-1063-hdrp  
**Status:** Complete  
**Confidence:** HIGH - Based on actual asset inspection and HDRP performance documentation
