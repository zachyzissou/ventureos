# Issue #974 - Scene Lighting Misconfigured After Unity 6.3 Upgrade

## Summary
Scene lighting appeared broken/misconfigured after upgrading to Unity 6.3.

## Root Cause
Unity 6.3 upgrade caused:
- HDRP Volume Profile settings to be reset/corrupted
- Scene sun references to be broken in scene files
- Lighting configuration in Bloom.unity and OutdoorsScene.unity to be lost

## Fix Applied
Cherry-picked commit `bc252cbd` from `origin/fix/issue-974-lighting` which:
1. Restored HDRP DefaultSettingsVolumeProfile.asset with correct lighting parameters
2. Fixed scene sun references in `Assets/Bloom.unity`
3. Fixed scene sun references in `Assets/OutdoorsScene.unity`

## Files Changed
- `Assets/Bloom.unity` - Main scene with lighting configuration restored
- `Assets/OutdoorsScene.unity` - Outdoor scene with lighting references fixed
- `Assets/Settings/HDRPDefaultResources/DefaultSettingsVolumeProfile.asset` - HDRP volume profile settings

## Branch
`fix/lighting-unity6-974-v2`

## PR
https://github.com/zachyzissou/Bloom/pull/1159

## Status
- [x] Branch created from master
- [x] Fix cherry-picked from existing fix branch
- [x] Branch pushed to origin
- [x] PR #1159 created

## Date
2026-01-29
