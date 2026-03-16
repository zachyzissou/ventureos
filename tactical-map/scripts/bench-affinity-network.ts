/*
 * Phase 5.3 micro-benchmark (CPU-side) for affinity-network path generation.
 *
 * Run:
 *   node --experimental-strip-types scripts/bench-affinity-network.ts
 */

import { AGENT_ORDER, AGENTS, BONDS } from '../src/config.ts';
import type { AgentId, Point } from '../src/config.ts';
import { AFFINITY_SEED_BONDS } from '../src/affinity/seed.ts';
import { generateBondControlPoint, quadraticBezierPolyline, estimatePolylineLength } from '../src/affinity/path.ts';

function defaultPositions(): Record<AgentId, Point> {
  const out = {} as Record<AgentId, Point>;
  for (let i = 0; i < AGENT_ORDER.length; i++) {
    const id = AGENT_ORDER[i];
    out[id] = id === 'nexus' ? { x: 0, y: 0 } : AGENTS.POSITIONS[i] ?? { x: 0, y: 0 };
  }
  return out;
}

const pos = defaultPositions();
const obstacleRadius = (AGENTS.BUILDING_SIZE * 0.5) * BONDS.OBSTACLE_RADIUS_MULT;
const obstacles = AGENT_ORDER.map((id) => ({ center: pos[id], radius: obstacleRadius, id }));

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

function run() {
  const WARMUP = 50;
  const ITERS = 500;

  // Warmup JIT
  for (let w = 0; w < WARMUP; w++) {
    for (const b of AFFINITY_SEED_BONDS) {
      const a = pos[b.a];
      const bb = pos[b.b];
      const local = obstacles.filter((o) => o.id !== b.a && o.id !== b.b);
      const cp = generateBondControlPoint({
        a,
        b: bb,
        key: `${b.a}:${b.b}`,
        obstacles: local,
        obstaclePadding: BONDS.OBSTACLE_PADDING,
        curvature: BONDS.CURVATURE,
        iterations: BONDS.AVOID_ITERS
      });
      const poly = quadraticBezierPolyline(a, cp, bb, BONDS.SEGMENTS);
      estimatePolylineLength(poly);
    }
  }

  const t0 = nowMs();
  let sumLen = 0;

  for (let i = 0; i < ITERS; i++) {
    for (const b of AFFINITY_SEED_BONDS) {
      const a = pos[b.a];
      const bb = pos[b.b];
      const local = obstacles.filter((o) => o.id !== b.a && o.id !== b.b);
      const cp = generateBondControlPoint({
        a,
        b: bb,
        key: `${b.a}:${b.b}`,
        obstacles: local,
        obstaclePadding: BONDS.OBSTACLE_PADDING,
        curvature: BONDS.CURVATURE,
        iterations: BONDS.AVOID_ITERS
      });
      const poly = quadraticBezierPolyline(a, cp, bb, BONDS.SEGMENTS);
      sumLen += estimatePolylineLength(poly);
    }
  }

  const t1 = nowMs();
  const totalMs = t1 - t0;
  const perIter = totalMs / ITERS;
  const perBond = totalMs / (ITERS * AFFINITY_SEED_BONDS.length);

  // eslint-disable-next-line no-console
  console.log('[bench] bonds:', AFFINITY_SEED_BONDS.length);
  // eslint-disable-next-line no-console
  console.log('[bench] iters:', ITERS);
  // eslint-disable-next-line no-console
  console.log('[bench] total ms:', totalMs.toFixed(2));
  // eslint-disable-next-line no-console
  console.log('[bench] ms/iter (28 bonds):', perIter.toFixed(3));
  // eslint-disable-next-line no-console
  console.log('[bench] ms/bond:', perBond.toFixed(4));
  // eslint-disable-next-line no-console
  console.log('[bench] checksum (ignore):', sumLen.toFixed(2));
}

run();
