# Issue #978: Upgrade TerraNoiseMaskFilter to GPU/fBm Noise

## Summary
Upgraded the `TerraNoiseMaskFilter` in the Terra terrain brush system from a CPU-based fragment shader to a GPU-accelerated compute shader implementation with proper fBm (fractional Brownian motion) noise.

## Implementation Details

### Compute Shader: `TerraNoiseMaskGeneration.compute`
Location: `Assets/Shaders/Compute/` and `Assets/Resources/Shaders/Compute/`

**Features:**
- GPU-optimized Perlin noise using improved gradient hash functions
- GPU-optimized Simplex noise (Ashima Arts algorithm adapted for compute shaders)
- Proper fBm implementation with configurable:
  - Octaves (1-6)
  - Lacunarity (frequency multiplier per octave)
  - Persistence (amplitude decay per octave)
  - Seed for reproducibility
- World-space and UV-space noise modes
- 8x8 thread groups for efficient GPU utilization

### Updated Filter: `TerraNoiseMaskFilter`
Location: `Assets/Scripts/Editor/Terra/TerraBrushMaskFilters.cs`

**Changes:**
- Renamed display name to "Terra/Noise Mask (GPU)"
- Added compute shader loading and kernel management
- GPU availability detection with automatic CPU fallback
- New UI elements:
  - GPU status indicator (green = GPU, yellow = CPU fallback)
  - "Force GPU" toggle
  - Renamed "Octaves" to "Octaves (fBm)" for clarity
- Preserved backward compatibility with original fragment shader fallback

### Noise Algorithm Details
- **Perlin Noise**: Uses quintic interpolation (C2 continuous) for smooth gradients
- **Simplex Noise**: Based on Ashima Arts implementation with circularly symmetric blending kernel
- **fBm**: Normalized multi-octave accumulation with amplitude normalization to [0,1] range

## Files Changed
1. `Assets/Shaders/Compute/TerraNoiseMaskGeneration.compute` (new)
2. `Assets/Resources/Shaders/Compute/TerraNoiseMaskGeneration.compute` (new - copy for Resources.Load)
3. `Assets/Scripts/Editor/Terra/TerraBrushMaskFilters.cs` (modified)

## Branch
`feat/gpu-noise-filter-978`

## PR
https://github.com/zachyzissou/Bloom/pull/new/feat/gpu-noise-filter-978

## Testing Notes
- GPU compute shader requires `SystemInfo.supportsComputeShaders == true`
- Fallback to fragment shader is automatic when compute shaders unavailable
- Tested configurations:
  - [x] Code compiles
  - [ ] Unity Editor GPU path (requires Unity open)
  - [ ] CPU fallback path
