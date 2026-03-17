# Performance Testing Guide

> VentureOS Tactical Map — Automated Performance Benchmarking Suite

## Overview

The performance benchmarking suite ensures the Tactical Map maintains consistent rendering performance as features are added across all 6 phases (Foundation, Activity/Animation, Affinity Network, Resource Economy, Mission Tracking, Health Diagnostics).

### What It Tests

| Suite | File | Purpose |
|-------|------|---------|
| Render Performance | `render-performance.test.ts` | FPS, frame time, render loop profiling |
| Load Testing | `load-testing.test.ts` | 100/500/1000 agent equivalents |
| Memory Leak Detection | `memory-leak.test.ts` | Long-running session leak detection |
| Network Latency | `network-latency.test.ts` | Simulated delays, reconnection |

### Performance Targets

| Scenario | Target FPS | Max P95 Frame Time | Max Memory |
|----------|-----------|-------------------|------------|
| Idle (all agents idle) | ≥55 | <25ms | <100MB |
| Active (all agents busy) | ≥55 | <30ms | <100MB |
| Mixed states (active + error) | ≥50 | <35ms | <150MB |
| Baseline load (100 equiv) | ≥55 | <25ms | <100MB |
| Stress load (500 equiv) | ≥45 | <40ms | <200MB |
| Maximum load (1000 equiv) | ≥30 | — | <300MB |

## Quick Start

### Run All Benchmarks

```bash
cd tactical-map

# Full suite
./scripts/run-benchmarks.sh

# Or via npm
npm run test:perf
```

### Run Individual Suites

```bash
# Render performance only
npm run test:perf:render

# Load testing only
npm run test:perf:load

# Memory leak detection only
npm run test:perf:memory

# Network latency only
npm run test:perf:network
```

### Using the Runner Script

```bash
# Run specific suite
./scripts/run-benchmarks.sh --suite render

# CI mode (generates reports, strict checks)
./scripts/run-benchmarks.sh --ci

# Custom regression threshold
./scripts/run-benchmarks.sh --threshold 15

# Update baselines after verified run
./scripts/run-benchmarks.sh --update-baselines
```

## Architecture

### How It Works

```
┌─────────────────────────────────────────────────┐
│                 Playwright                       │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Test Suite │→ │ Browser  │→ │ Tactical Map │ │
│  │ (.test.ts)│  │ (Chrome) │  │ (Vite dev)   │ │
│  └───────────┘  └──────────┘  └──────────────┘ │
│       │              │                │          │
│       │  measureFPS()│                │          │
│       │──────────────│→ rAF loop ────│          │
│       │              │                │          │
│       │  captureMemory()              │          │
│       │──────────────│→ performance.memory       │
│       │              │                │          │
│       │  injectLoad()│                │          │
│       │──────────────│→ __TACTICAL_MAP__ API     │
│       │              │                │          │
│  ┌────▼────┐                                    │
│  │ Report  │ → performance-reports/              │
│  └─────────┘                                    │
└─────────────────────────────────────────────────┘
```

### Key Components

1. **Benchmark Harness** (`helpers/benchmark-harness.ts`)
   - `measureFPS()` — Measures FPS via `requestAnimationFrame` with percentile frame time analysis
   - `captureMemory()` — Chrome's `performance.memory` API for heap snapshots
   - `forceGC()` — Triggers garbage collection (requires `--expose-gc` flag)
   - `checkRegression()` — Compares results against baselines

2. **Mock Data Generator** (`helpers/mock-data-generator.ts`)
   - Deterministic data via Mulberry32 PRNG (reproducible across runs)
   - Three load profiles: `baseline` (100), `stress` (500), `maximum` (1000)
   - Generates MapState, EconomyState, and HealthState data

3. **Performance Reporter** (`helpers/performance-reporter.ts`)
   - Loads/saves baselines from `performance-baselines.json`
   - Detects regressions against baselines
   - Generates markdown and JSON reports

4. **Runner Script** (`scripts/run-benchmarks.sh`)
   - Single entry point for all benchmark runs
   - CI integration with report generation
   - Baseline management

### Load Profile Design

Since the Tactical Map has a fixed 8-agent architecture, "100/500/1000 agents" is simulated by scaling complexity:

| Profile | Sessions/Agent | Active % | Particles | Economy Trend Points | Health Alerts |
|---------|---------------|----------|-----------|---------------------|---------------|
| Baseline (100) | 2 | 50% | 1x | 16 | 0 |
| Stress (500) | 4 | 85% | 3x | 48 | 3 |
| Maximum (1000) | 5 | 70% + 20% overloaded + 10% error | 5x | 64 | 8 |

## Baselines

Baselines are stored in `performance-baselines.json` and committed to the repository.

### Updating Baselines

1. Run the full suite on a clean machine (or CI)
2. Verify results are stable (run 3+ times)
3. Update the baselines:

```bash
./scripts/run-benchmarks.sh --update-baselines
```

4. Commit the updated baselines file

### Baseline File Structure

```json
{
  "version": 1,
  "updatedAt": "2026-02-16T17:30:00.000Z",
  "baselines": {
    "idle state maintains ≥55 FPS": {
      "avgFps": 60,
      "p95FrameTimeMs": 18,
      "memoryMB": 40
    }
  }
}
```

## CI Integration

### GitHub Actions Workflow

The `performance.yml` workflow runs automatically on:
- PRs touching `tactical-map/**`
- Push to `main` branch
- Manual dispatch

Current stabilization policy while `#630` is open:
- PR runs execute only the stable `load` suite through `./scripts/run-benchmarks.sh --ci --suite load`.
- Full push and manual runs continue to execute all suites for evidence collection.
- Only the stable suite is merge-blocking; `render`, `network`, and `memory` remain informational until their GitHub-runner signals are trustworthy.
- CI benchmark execution is pinned to `workers=1` and `retries=1` to reduce runner contention.
- Render isolation comes from `waitForTacticalMap()`, which stops backend polling/reconnect loops before measurement.
- Workflow summaries come from `scripts/summarize-performance-ci.mjs`, which emits suite-aware policy and gating data in `performance-status.json`.

### Regression Detection

A regression is flagged when:
- **FPS** drops by more than **10%** below baseline
- **P95 frame time** increases by more than **10%** above baseline
- **Memory usage** increases by more than **10%** above baseline

The threshold is configurable via the `--threshold` flag.

### PR Comments

The CI workflow automatically comments benchmark results on PRs, showing:
- Pass/fail status
- Key FPS metrics
- Memory usage
- Any detected regressions

### Artifacts

Each CI run uploads a `performance-reports` artifact containing:
- `performance-output.txt` — Raw Playwright output
- `metadata.json` — Git commit, branch, timestamp
- `benchmark-exit-code.txt` — Captured runner exit code
- `performance-status.json` — Structured CI status contract for gating/commenting
- `summary.md` — Human-readable summary

The `performance-status.json` artifact is the canonical machine-readable source for:
- which suites were executed
- which suites are treated as stable vs informational
- whether the run is merge-blocking or observational
- the final `pass` / `warn` / `fail` decision used by CI

## Troubleshooting

### Tests Skipped

Performance tests require `PERF=1` environment variable. They're skipped by default to keep regular CI fast.

```bash
# Won't run perf tests:
npx playwright test

# Will run perf tests:
PERF=1 npx playwright test --project=chromium
```

### Low FPS in CI

CI runners (GitHub Actions) have limited GPU/CPU, and the Tactical Map suites do not all behave the same way on hosted runners:
- `load` currently produces coherent CI signals around the expected frame budget and is used for enforcement.
- `render`, `network`, and `memory` still need runner-specific stabilization work before they are safe to make merge-blocking.

Baselines should be set from CI runs, not local machines.

### Memory Measurements Show 0

`performance.memory` is Chrome-specific and requires the `--enable-precise-memory-info` flag. The Playwright config adds this automatically for the `chromium` project.

### Flaky Tests

Performance tests can be noisy. Mitigations:
- Warmup periods before measurement
- 3-5 second measurement windows
- Multiple retry attempts in CI
- 10% regression threshold (not exact matching)

### Running Locally

```bash
# Quick render check
npm run test:perf:render

# Full suite with reports
./scripts/run-benchmarks.sh --ci

# Just memory leak tests
npm run test:perf:memory
```

## Adding New Benchmarks

1. Create a new test in `tests/performance/` or add to an existing file
2. Use the harness helpers:

```typescript
import { measureFPS, captureMemory, waitForTacticalMap } from './helpers/benchmark-harness';

perfTest('my new benchmark', async ({ page }) => {
  await page.goto('/');
  await waitForTacticalMap(page);

  // Setup load
  await page.evaluate(() => { /* ... */ });

  // Measure
  const fps = await measureFPS(page, 3000);
  expect(fps.avgFps).toBeGreaterThanOrEqual(50);
});
```

3. Add a baseline entry to `performance-baselines.json`
4. Run the suite to verify

## Files Reference

```
tactical-map/
├── performance-baselines.json          # Committed baselines
├── scripts/
│   └── run-benchmarks.sh               # Runner script
├── tests/
│   └── performance/
│       ├── helpers/
│       │   ├── benchmark-harness.ts     # Core measurement utilities
│       │   ├── mock-data-generator.ts   # Synthetic load generation
│       │   └── performance-reporter.ts  # Report generation
│       ├── render-performance.test.ts   # FPS & frame time tests
│       ├── load-testing.test.ts         # Load scaling tests
│       ├── memory-leak.test.ts          # Memory leak detection
│       └── network-latency.test.ts      # Network simulation tests
├── docs/
│   └── PERFORMANCE_TESTING.md           # This file
└── .github/workflows/
    └── performance.yml                  # CI workflow
```
