# Issue #949: Terra: Verify Vegetation Placement Coverage Across All Tiles

## Summary
Added comprehensive integration tests to verify vegetation placement coverage across all tiles in the Terra world generation system.

## Implementation Details

### Branch
`feature/vegetation-coverage-verification-949`

### Changes Made
Added 4 new tests to `Assets/Scripts/Testing/Integration/TerraVegetationTests.cs`:

1. **VegetationCoverage_AllTilesWithSpeciesMix_ReceivePlans**
   - Tests that all tiles with valid biome species mixes receive vegetation plans and payloads
   - Verifies 100% coverage across all tiles that should have vegetation
   - Reports missing tiles if coverage is incomplete

2. **VegetationCoverage_MultipleBiomes_SelectiveCoverage**
   - Tests coverage with multiple biome configurations
   - Verifies that tiles with species mixes get plans while others are correctly excluded
   - Validates plan structure and deterministic seed assignment

3. **VegetationCoverage_DifferentSeeds_ConsistentCoverage**
   - Ensures vegetation coverage is consistent regardless of world seed
   - Tests with seeds: 1, 42, 12345, 999999, INT_MAX-1
   - All seeds should produce the same number of vegetation plans for identical world configs

4. **VegetationCoverage_SpawnPayloads_ValidDensityRanges**
   - Validates spawn payload density calculations are within configured bounds
   - Verifies suitability values are in valid range [0, 1]
   - Checks species density respects min/max density configuration

### Test Coverage
- Coverage verification across all tiles
- Multi-biome selective coverage
- Seed consistency validation
- Density range validation

### Commit
```
feat: Add vegetation placement coverage verification tests

Fixes #949

Adds four new integration tests to TerraVegetationTests.cs:

- VegetationCoverage_AllTilesWithSpeciesMix_ReceivePlans: Verifies all
  tiles with biome species mixes receive vegetation plans and payloads
- VegetationCoverage_MultipleBiomes_SelectiveCoverage: Tests selective
  coverage with multiple biome configurations
- VegetationCoverage_DifferentSeeds_ConsistentCoverage: Ensures coverage
  is consistent regardless of seed value
- VegetationCoverage_SpawnPayloads_ValidDensityRanges: Validates spawn
  payload density calculations are within configured bounds

These tests ensure the vegetation distribution system provides complete
coverage across all tiles that should receive vegetation, with no gaps
or missed tiles during the distribution phase.
```

## PR Status
- Branch pushed: ✅
- PR URL: https://github.com/zachyzissou/Bloom/pull/new/feature/vegetation-coverage-verification-949

## Files Modified
- `Assets/Scripts/Testing/Integration/TerraVegetationTests.cs` (+309 lines)
