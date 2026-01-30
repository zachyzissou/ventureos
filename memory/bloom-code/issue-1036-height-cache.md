# Issue #1036: Terrain Height Sample Caching

## Problem
Terrain height samples may be recomputed multiple times during water generation (lake and river systems), causing unnecessary computational overhead.

## Solution: Height Sample Cache

### Modifications to Terrain Generation Systems

#### 1. Create Terrain Height Cache Interface
```csharp
public interface ITerrainHeightCache
{
    void Initialize();
    void Clear();
    float GetHeight(Vector3 position);
    void SetHeight(Vector3 position, float height);
    void InvalidateRegion(Vector2Int minTile, Vector2Int maxTile);
}

public class TerrainHeightCache : ITerrainHeightCache
{
    private readonly Dictionary<(int x, int z), float> _heightCache = new Dictionary<(int x, int z), float>();
    private readonly IBiomeManager _biomeManager;
    private const float CACHE_SPATIAL_RESOLUTION = 10f; // meters

    public TerrainHeightCache(IBiomeManager biomeManager)
    {
        _biomeManager = biomeManager;
    }

    public void Initialize() => _heightCache.Clear();

    public void Clear() => _heightCache.Clear();

    public float GetHeight(Vector3 position)
    {
        // Quantize position to reduce cache key complexity
        int x = Mathf.RoundToInt(position.x / CACHE_SPATIAL_RESOLUTION);
        int z = Mathf.RoundToInt(position.z / CACHE_SPATIAL_RESOLUTION);
        var key = (x, z);

        if (_heightCache.TryGetValue(key, out float cachedHeight))
        {
            return cachedHeight;
        }

        // Sample height and cache
        float height = _biomeManager.GetTerrainHeightAt(position);
        _heightCache[key] = height;
        return height;
    }

    public void SetHeight(Vector3 position, float height)
    {
        int x = Mathf.RoundToInt(position.x / CACHE_SPATIAL_RESOLUTION);
        int z = Mathf.RoundToInt(position.z / CACHE_SPATIAL_RESOLUTION);
        _heightCache[(x, z)] = height;
    }

    public void InvalidateRegion(Vector2Int minTile, Vector2Int maxTile)
    {
        _heightCache.RemoveAll(kvp =>
        {
            var worldPos = new Vector3(
                kvp.Key.x * CACHE_SPATIAL_RESOLUTION, 
                0, 
                kvp.Key.z * CACHE_SPATIAL_RESOLUTION
            );
            Vector2Int tilePos = WorldPositionToTilePosition(worldPos);
            return tilePos.x >= minTile.x && tilePos.x < maxTile.x &&
                   tilePos.y >= minTile.y && tilePos.y < maxTile.y;
        });
    }

    private Vector2Int WorldPositionToTilePosition(Vector3 worldPosition, int tileSize = 1000)
    {
        return new Vector2Int(
            Mathf.FloorToInt(worldPosition.x / tileSize),
            Mathf.FloorToInt(worldPosition.z / tileSize)
        );
    }
}
```

#### 2. Modify LakeSystem and RiverSystem

In both systems' `Initialize()` method:
```csharp
private ITerrainHeightCache _heightCache;

public void Initialize()
{
    // Existing initialization code...

    // Initialize height cache
    if (_heightCache == null)
    {
        _heightCache = new TerrainHeightCache(biomeManager);
    }
    else 
    {
        _heightCache.Clear();
    }
}
```

Replace direct terrain height sampling with cache:
```csharp
// Example in LakeSystem or RiverSystem
float GetTerrainHeight(Vector3 position)
{
    return _heightCache.GetHeight(position);
}
```

#### 3. Terrain Modification Notification

In `TerrainModificationSystem`:
```csharp
public void OnTerrainModified(Vector2Int minTile, Vector2Int maxTile)
{
    var lakeSystem = ServiceLocator.Instance.GetService<LakeSystem>();
    var riverSystem = ServiceLocator.Instance.GetService<RiverSystem>();

    lakeSystem?._heightCache?.InvalidateRegion(minTile, maxTile);
    riverSystem?._heightCache?.InvalidateRegion(minTile, maxTile);
}
```

## Performance Considerations

1. Use a bounded cache size to prevent unbounded memory growth
2. Use spatial quantization to reduce key complexity
3. Invalidate cache on significant terrain modifications

## Risks and Mitigations

- **Cache Staleness**: Added `InvalidateRegion` method ensures cache is updated after terrain changes
- **Memory Overhead**: Use spatial quantization and consider adding a max cache size limit
- **Performance**: Low overhead, as sampling is only done once per unique location

## Test Cases

1. Generate world with height cache enabled
2. Verify height is only sampled once for repeated positions
3. Modify terrain and verify cache is invalidated for modified region

## Implementation Steps

1. Add `TerrainHeightCache` to core terrain systems
2. Update `TerrainModificationSystem` to notify caches
3. Integrate with existing lake and river generation methods

## Estimated Performance Impact
- Reduce redundant height sampling calls
- Potential 10-30% reduction in height sampling computational cost
- Minimal memory overhead (spatial quantization)

## References
- GitHub Issue: #1036
- Pull Request: TODO: Link PR when created