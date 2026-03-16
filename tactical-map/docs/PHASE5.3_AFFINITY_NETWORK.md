# Phase 5.3 — Affinity Network (Bonds & Affinity Visualization)

## What shipped

- **28 bond lines** (8 agents fully connected) rendered as **curved Bezier paths** with **basic obstacle avoidance** against building footprints.
- **5-tier affinity color system** (nascent → synergistic):
  - Tier 1: dim blue
  - Tier 2: cyan
  - Tier 3: green
  - Tier 4: yellow
  - Tier 5: gold/orange
- **Collaboration particles** flowing along each bond path
  - Speed varies by affinity tier
  - Subtle glow via a single container blur filter
- **Organic drift**
  - Bonds pulse (alpha) + drift (control-point wobble)

## Runbook

### Dev

```bash
cd tactical-map
npm run dev
```

### Unit tests

```bash
cd tactical-map
npm test
```

### Visual regression

```bash
cd tactical-map
npm run test:e2e
```

### Optional performance smoke test

```bash
cd tactical-map
PERF=1 npm run test:e2e -- tests/e2e/performance.spec.ts
```

### CPU micro-benchmark (path generation)

```bash
cd tactical-map
node --experimental-strip-types scripts/bench-affinity-network.ts
```

## Implementation notes

- Seed bond values come from `~/clawd/scripts/seed-affinity-network.sh` (fully connected 28 edges).
- Bonds redraw each animation frame, but the total geometry is small (28 × 16 segments) and has not shown measurable regression in the existing Playwright FPS benchmark.

## Key files

- `src/renderer/affinity-network.ts` — rendering + drift + particles
- `src/affinity/affinity.ts` — tier/color/speed mapping
- `src/affinity/path.ts` — curved path + obstacle avoidance
- `src/affinity/seed.ts` — canonical 28-bond seed list
