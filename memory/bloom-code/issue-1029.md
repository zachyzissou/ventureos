# Issue #1029: Terra: Predictive Tile Prewarming Based on Player Velocity

## Status: Completed

## Summary
Implemented predictive tile prewarming that uses player velocity vectors to prefetch tiles ahead of movement, preventing loading hitches and improving cache utilization in multiplayer scenarios.

## Implementation

### New Files
1. **`Assets/Scripts/Terrain/PredictiveLoadingSettings.cs`**
   - ScriptableObject for configuration
   - Controls lookahead time, smoothing, directional biases
   - CreateAssetMenu for easy asset creation

2. **`Assets/Scripts/Terrain/PredictiveTileLoader.cs`**
   - Clean API class for predictive loading
   - Per-player velocity tracking with EMA smoothing
   - Tile prediction based on movement direction
   - Telemetry for prediction accuracy tracking
   - Event system for telemetry updates

3. **`Assets/Scripts/Testing/Unit/TerrainGeneration/PredictiveTileLoaderTests.cs`**
   - Comprehensive unit tests
   - Tests velocity tracking, prediction, telemetry

### Modified Files
1. **`Assets/Scripts/Terrain/TileStreamingManager.cs`**
   - Integrated PredictiveTileLoader
   - Constructor accepts PredictiveLoadingSettings
   - Delegated velocity tracking and prediction to PredictiveTileLoader
   - Exposed PredictiveLoader property for advanced configuration

## Configuration Options

```csharp
public class PredictiveLoadingSettings : ScriptableObject
{
    public float lookAheadSeconds = 3f;      // How far to predict
    public float velocitySmoothingTime = 0.5f;
    public int maxPredictedTilesPerPlayer = 4;
    public float minVelocityThreshold = 2f;  // m/s to trigger prediction
    public float forwardBias = 1.5f;         // Priority for forward tiles
    public float lateralBias = 1.0f;         // Priority for side tiles
    public float backwardBias = 0.5f;        // Priority for backward tiles
}
```

## API Usage

```csharp
// Create settings
var settings = PredictiveLoadingSettings.CreateDefault();
settings.lookAheadSeconds = 5f;

// Create loader
var loader = new PredictiveTileLoader(settings, tileSize: 1000f, gridSize: 32);

// Update per frame
loader.UpdateAllPlayerVelocities(playerPositions);

// Get predicted tiles
var predictedTiles = loader.GetAllPredictedTiles(streamingRadius);

// Access telemetry
var telemetry = loader.Telemetry;
Debug.Log($"Prediction accuracy: {telemetry.Accuracy:P0}");
```

## Algorithm
1. Track player velocity (smoothed EMA over configurable time window)
2. Project position forward by lookAheadSeconds
3. Identify tiles within predictive radius of projected position
4. Apply directional bias (forward > lateral > backward)
5. Limit to maxPredictedTilesPerPlayer per player
6. Deduplicate across players, keeping highest priority

## Acceptance Criteria Met
- [x] Player velocity tracked and smoothed (per-player EMA)
- [x] Prediction generates tile list based on direction
- [x] Predicted tiles have higher load priority
- [x] Multiplayer: each player's prediction independent
- [x] Configurable via ScriptableObject
- [x] Unit tests for core functionality

## Branch
`feat/predictive-tile-prewarming`

## Date
2025-01-13
