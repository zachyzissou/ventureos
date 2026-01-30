# Issue #1033: Burst-Compile EdgeStitcher

## Changes Made
- Added `using Unity.Burst;` and `using Unity.Collections;`
- Added `[BurstCompile]` attribute to the `EdgeStitcher` class
- Refactored `BlendEdge` method to use Burst-compatible parallel jobs
- Converted static methods to Burst-compilable versions
- Introduced parallel job implementations for each edge direction:
  - `BlendNorthEdgeJob`
  - `BlendSouthEdgeJob`
  - `BlendEastEdgeJob`
  - `BlendWestEdgeJob`

## Performance Expectations
- Reduce edge stitching computation time by leveraging Burst compilation
- Utilize parallel job scheduling for multi-core performance
- Maintain existing smoothstep interpolation logic
- Minimize memory allocation overhead

## Validation
- Verify no managed references in job structs
- Ensure original functionality is preserved
- Test with various tile sizes and edge conditions

## Potential Future Improvements
- Further optimize job scheduling parameters
- Consider custom memory management for large heightmaps
- Profile to validate performance gains

## Notes
- Requires Unity.Burst and Unity.Collections packages
- May require Unity 2022.3+ for optimal Burst support