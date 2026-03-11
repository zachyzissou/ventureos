# Performance Benchmarking Suite

Automated performance testing and regression detection for the VentureOS Tactical Map.

## Quick Start

```bash
# Run all benchmarks (from repo root)
npm run test:perf

# Run a specific suite
npm run test:perf:render
npm run test:perf:load
npm run test:perf:memory
npm run test:perf:network

# Or use the benchmark runner script (from tactical-map/)
cd tactical-map
./scripts/run-benchmarks.sh
./scripts/run-benchmarks.sh --suite render
./scripts/run-benchmarks.sh --ci
```

## Architecture

```
tactical-map/
├── tests/performance/
│   ├── helpers/
│   │   ├── benchmark-harness.ts      # Core measurement utilities (FPS, memory, GC)
│   │   ├── mock-data-generator.ts    # Synthetic load generation (100/500/1000 equiv)
│   │   └── performance-reporter.ts   # Report generation, regression detection, baselines
│   ├── render-performance.test.ts    # FPS, frame time, jank detection
│   ├── load-testing.test.ts          # Scaled load (100/500/1000 agents)
│   ├── memory-leak.test.ts           # Heap growth, store churn, leak detection
│   └── network-latency.test.ts       # Simulated latency, failure, recovery
├── scripts/
│   └── run-benchmarks.sh             # CLI runner with CI mode, baselines, reports
├── performance-baselines.json        # Committed baseline metrics
└── playwright.config.ts              # Playwright config (Chrome flags for perf APIs)
```

### CI Integration

The **Performance Benchmarks** GitHub Actions workflow (`.github/workflows/performance.yml`) runs automatically on:
- PRs touching `tactical-map/**`
- Push to `main`
- Manual dispatch (`workflow_dispatch`)

It uploads benchmark reports as artifacts, posts a summary comment on PRs, and fails the check if regressions exceed the threshold.

## Test Suites

### 1. Render Performance (`render-performance.test.ts`)

Measures the rendering pipeline under various visual states.

| Test | What It Measures | Pass Criteria |
|------|-----------------|---------------|
| Idle state FPS | Baseline render cost with no activity | ≥55 FPS, P95 frame time <25ms |
| All agents active | Full activity with sessions and particles | ≥55 FPS, P95 <30ms |
| Mixed states | Worst-case visual complexity (active + overloaded + error) | ≥50 FPS, P95 <35ms |
| Frame consistency | Jank detection (frames >50ms) | <2% jank frames |
| Ticker callback profiling | Render call duration separate from rAF | P95 render <8ms |
| Camera zoom & pan | FPS during rapid viewport changes | ≥50 FPS |

### 2. Load Testing (`load-testing.test.ts`)

Stress tests at scaled agent-equivalent loads. Since the app has a fixed 8-agent architecture, load is simulated by scaling session complexity, particle emissions, and data depth.

| Load Profile | Equivalent | Sessions/Agent | Pass Criteria |
|-------------|-----------|----------------|---------------|
| Baseline | 100 agents | 2 | ≥55 FPS, <100MB memory |
| Stress | 500 agents | 4 | ≥45 FPS, <200MB memory |
| Maximum | 1000 agents | 5 | ≥30 FPS, <300MB memory |

Additional load tests:
- **Sustained load**: FPS must not degrade >15% over 30 seconds
- **Rapid state transitions**: FPS ≥40 during 200ms state cycling
- **Memory scaling**: Stress must be <3× baseline memory; maximum <5×

### 3. Memory Leak Detection (`memory-leak.test.ts`)

Detects memory leaks via heap snapshots across repeated load/unload cycles.

| Test | Method | Leak Threshold |
|------|--------|---------------|
| 10 load/unload cycles | Heap comparison after warmup | <20% growth |
| Economy state updates | 100 rapid economy mutations | <25% growth |
| Health state updates | 100 rapid health mutations with alerts | <25% growth |
| MapState churn | 200 rapid store updates | <30% growth |
| Heap trend analysis | 20 measurements checking for monotonic growth | Non-monotonic; range ratio <2× |

### 4. Network Latency Simulation (`network-latency.test.ts`)

Verifies the render loop is decoupled from API latency using Playwright's route interception.

| Test | Condition | Pass Criteria |
|------|-----------|---------------|
| 50ms API latency | Moderate delay on all API routes | ≥55 FPS |
| 200ms API latency | High delay | ≥50 FPS |
| 500ms API latency | Severe delay | ≥45 FPS |
| API failure | All routes blocked | ≥40 FPS, app alive |
| WebSocket reconnection | WS endpoint blocked | ≥50 FPS |
| Network recovery | Block then restore | FPS recovers within 15% |
| Burst responses | Delayed responses arrive simultaneously | ≥40 FPS |

## Performance Baselines

Baselines are stored in `tactical-map/performance-baselines.json` and committed to the repo. They represent expected metric values on CI hardware.

### Current Baselines

| Scenario | Avg FPS | P95 Frame Time | Memory |
|----------|---------|---------------|--------|
| Idle state | 60 | 18ms | 40MB |
| All agents active | 58 | 20ms | 55MB |
| Mixed states | 55 | 25ms | 60MB |
| Baseline load (100 equiv) | 58 | 20ms | 50MB |
| Stress load (500 equiv) | 50 | 28ms | 80MB |
| Maximum load (1000 equiv) | 40 | 35ms | 120MB |

### Updating Baselines

Baselines should only be updated after verified stable runs on CI hardware:

```bash
cd tactical-map
./scripts/run-benchmarks.sh --update-baselines
```

This runs the full suite and, if all tests pass, saves the measured values as the new baselines.

> **⚠️ Caution:** Updating baselines on a developer laptop may produce values that don't match CI runners. Prefer updating baselines from CI via `workflow_dispatch` with `update_baselines: true`.

## Regression Detection

The regression detection system compares each benchmark result against its baseline:

| Metric | Direction | Regression Threshold |
|--------|-----------|---------------------|
| Average FPS | Higher is better | Fail if drops >10% below baseline |
| P95 Frame Time | Lower is better | Fail if increases >10% above baseline |
| Memory Usage | Lower is better | Fail if increases >10% above baseline |

### How It Works

1. Tests run and produce `BenchmarkResult` objects with FPS, memory, and custom metrics
2. `detectRegressions()` in `performance-reporter.ts` compares results against `performance-baselines.json`
3. Any metric that regresses beyond the threshold (default 10%) is flagged
4. In CI, the workflow fails and posts a detailed regression table on the PR

### Adjusting Thresholds

The default 10% threshold balances sensitivity with CI variance. To adjust:

```bash
# Via the benchmark runner
./scripts/run-benchmarks.sh --threshold 15

# Via environment variable in CI
PERF_REGRESSION_THRESHOLD=15 npx playwright test tests/performance/
```

## Running Locally

### Prerequisites

```bash
# From the repo root
npm install

# Install tactical-map dependencies
cd tactical-map
npm install

# Install Playwright browsers (Chromium required)
npx playwright install chromium
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PERF` | unset | Set to `1` to enable performance tests (skipped otherwise) |
| `CI` | unset | Set to `true` for CI mode (strict, generates reports) |
| `PERF_UPDATE_BASELINES` | unset | Set to `1` to save results as new baselines |
| `PERF_REGRESSION_THRESHOLD` | `10` | Regression threshold percentage |

### Interpreting Results

Console output includes tagged metrics for each test:

```
[perf:render:idle]     avg=62.3 min=58.1 p95ft=16.4ms
[perf:render:active]   avg=59.8 min=55.2 p95ft=19.1ms
[perf:load:baseline]   fps=60.1 min=57.3 mem=42.5MB delta=1.2MB
[perf:load:stress]     fps=52.4 min=46.8 p95ft=26.3ms mem=71.8MB
[perf:memory:leak]     growth: 2.14 MB (5.3%)
[perf:network:200ms]   avg=58.7 min=54.2
```

- **avg/fps**: Average FPS over the measurement window (higher = better)
- **min**: Minimum FPS in any 1-second bucket (shows worst-case drops)
- **p95ft**: 95th percentile frame time in ms (lower = smoother)
- **mem**: Heap memory used (lower = better)
- **delta**: Memory change during measurement (ideally near zero)
- **growth**: Heap growth after repeated cycles (% of baseline; <20% = pass)

### CI Reports

In CI mode, reports are saved to `tactical-map/performance-reports/`:

- `performance-report.json` — machine-readable results
- `performance-report.md` — markdown summary for PR comments
- `metadata.json` — commit SHA, branch, timestamp
- `baselines-used.json` — copy of baselines used for comparison

Reports are uploaded as GitHub Actions artifacts with 30-day retention.

## Measurement Methodology

### FPS Measurement

FPS is measured via `requestAnimationFrame` loops running inside the browser page context. The harness:

1. Records individual frame times over the measurement window (default 3–5 seconds)
2. Calculates average FPS from total frames / elapsed time
3. Computes P95 and P99 frame times from sorted frame time arrays
4. Buckets into 1-second windows for min/max FPS

### Memory Measurement

Memory snapshots use Chrome's `performance.memory` API (requires `--enable-precise-memory-info` flag, set in `playwright.config.ts`). The harness:

1. Forces garbage collection via `--js-flags=--expose-gc`
2. Captures `usedJSHeapSize` before and after test operations
3. Reports delta and absolute values in MB

### Load Simulation

Since the Tactical Map has a fixed 8-agent architecture, agent counts (100/500/1000) are simulated by scaling:

- Sessions per agent (2 → 4 → 5)
- Active/overloaded/error ratios
- Economy trend data depth (16 → 48 → 64 points)
- Health alert counts
- Particle emission multipliers

The `mock-data-generator.ts` uses a deterministic PRNG (Mulberry32) for reproducible test data.

## Known Limitations

1. **CI hardware variance**: GitHub Actions runners have variable performance; baselines include a 10% tolerance margin
2. **No GPU benchmarking**: FPS measurements reflect CPU-side frame scheduling, not GPU render time
3. **Chrome-only**: `performance.memory` and `--expose-gc` are Chrome/Chromium-specific; Firefox/Safari benchmarks would need different instrumentation
4. **Synthetic load only**: Tests use mock data injection, not real API traffic; production performance may differ under real data patterns
5. **No long-duration soak tests**: Memory leak tests run ~2 minutes of simulated time; very slow leaks may not be caught

## Troubleshooting

### Tests skip with "Set PERF=1"
All performance tests are gated behind `PERF=1` to avoid slowing normal test runs. Set it explicitly:
```bash
PERF=1 npx playwright test tests/performance/
```

### "Canvas not found" or "\_\_TACTICAL_MAP\_\_ undefined"
The Playwright web server must be running and the app must bootstrap successfully. Check:
```bash
cd tactical-map && npm run dev -- --host 127.0.0.1 --port 5174
```

### Memory tests show 0 MB
`performance.memory` requires Chrome with `--enable-precise-memory-info`. The Playwright config sets this, but custom config overrides may omit it.

### FPS lower than expected locally
Local results depend on system load, display refresh rate, and GPU. Performance tests are designed for CI consistency — local variance of ±20% is normal.
