import { BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { AGENT_ORDER, AGENTS, BONDS } from '@/config';
import type { AgentId, Point } from '@/config';
import { affinityToAlpha, affinityToTier, tierToColor, tierToParticleCount, tierToSpeedPxPerS } from '@/affinity/affinity';
import type { AffinityTier } from '@/affinity/affinity';
import { AFFINITY_SEED_BONDS } from '@/affinity/seed';
import {
  type CircleObstacle,
  quadraticBezierPoint,
  quadraticBezierPolyline,
  toPixiPoly,
  estimatePolylineLength,
  generateBondControlPoint,
  hashString
} from '@/affinity/path';

export type Bond = {
  a: AgentId;
  b: AgentId;
  key: string;
  affinity: number;
  tier: AffinityTier;
  color: number;
  width: number;
  alphaTarget: number;
  /** smoothed alpha */
  alpha: number;
  phase: number;
  controlBase: Point;
  length: number;
  gfx: Graphics;
  particles: Array<{ t: number; sprite: Sprite }>;
};

export type AffinityNetworkLayer = {
  container: Container;
  setAgentPositions: (pos: Record<AgentId, Point>) => void;
  setBondAffinity: (a: AgentId, b: AgentId, affinity: number) => void;
  update: (elapsedMs: number) => void;
  /** reset motion state for deterministic screenshots/tests */
  reset: () => void;
  /** for testing */
  getBonds: () => Bond[];
};

function bondKey(a: AgentId, b: AgentId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function computeWidth(tier: AffinityTier): number {
  return BONDS.BASE_WIDTH + (tier - 1) * BONDS.WIDTH_MULTIPLIER;
}

function defaultPositions(): Record<AgentId, Point> {
  const out = {} as Record<AgentId, Point>;
  for (let i = 0; i < AGENT_ORDER.length; i++) {
    const id = AGENT_ORDER[i];
    out[id] = id === 'nexus' ? { x: 0, y: 0 } : AGENTS.POSITIONS[i] ?? { x: 0, y: 0 };
  }
  return out;
}

export function createAffinityNetworkLayer(): AffinityNetworkLayer {
  const container = new Container();

  // Bond line Graphics nodes (one per bond) to avoid per-frame full-geometry rebuild.
  const linesContainer = new Container();
  container.addChild(linesContainer);

  // Particle sprites live above the lines.
  const particleContainer = new Container();

  // A single subtle glow filter is cheaper than per-particle glow.
  const glow = new BlurFilter({ strength: BONDS.PARTICLE_GLOW_BLUR });
  particleContainer.filters = [glow];

  container.addChild(particleContainer);

  let timeS = 0;
  let positions: Record<AgentId, Point> = defaultPositions();

  const bonds: Bond[] = [];
  const bondByKey = new Map<string, Bond>();

  // Initialize from seed list.
  for (const s of AFFINITY_SEED_BONDS) {
    const key = bondKey(s.a, s.b);
    const tier = affinityToTier(s.affinity);
    const color = tierToColor(tier);
    const width = computeWidth(tier);
    const alphaTarget = affinityToAlpha(s.affinity);

    const gfx = new Graphics();
    linesContainer.addChild(gfx);

    const b: Bond = {
      a: s.a,
      b: s.b,
      key,
      affinity: s.affinity,
      tier,
      color,
      width,
      alphaTarget,
      alpha: alphaTarget,
      phase: (hashString(key) % 10_000) / 10_000,
      controlBase: { x: 0, y: 0 },
      length: 1,
      gfx,
      particles: []
    };

    bonds.push(b);
    bondByKey.set(key, b);
  }

  function rebuildBondGeometry() {
    const obstacles: CircleObstacle[] = [];
    const r = (AGENTS.BUILDING_SIZE * 0.5) * BONDS.OBSTACLE_RADIUS_MULT;

    for (const id of AGENT_ORDER) {
      obstacles.push({ center: positions[id], radius: r, id });
    }

    for (const bond of bonds) {
      const aPos = positions[bond.a];
      const bPos = positions[bond.b];

      const localObstacles = obstacles.filter((o) => o.id !== bond.a && o.id !== bond.b);

      bond.controlBase = generateBondControlPoint({
        a: aPos,
        b: bPos,
        key: bond.key,
        obstacles: localObstacles,
        obstaclePadding: BONDS.OBSTACLE_PADDING,
        curvature: BONDS.CURVATURE,
        iterations: BONDS.AVOID_ITERS
      });

      const poly = quadraticBezierPolyline(aPos, bond.controlBase, bPos, BONDS.SEGMENTS);
      bond.length = Math.max(1, estimatePolylineLength(poly));

      // Draw base geometry (alpha is applied via display object alpha).
      bond.gfx.clear();
      bond.gfx.poly(toPixiPoly(poly), false).stroke({ width: bond.width, color: bond.color, alpha: 1 });
      bond.gfx.alpha = bond.alpha;

      // Particle allocation (stable count)
      const desiredCount = tierToParticleCount(bond.tier);
      // Remove extras
      while (bond.particles.length > desiredCount) {
        const p = bond.particles.pop();
        p?.sprite.removeFromParent();
      }
      // Add missing
      while (bond.particles.length < desiredCount) {
        const sprite = new Sprite(Texture.WHITE);
        sprite.anchor.set(0.5);
        sprite.width = BONDS.PARTICLE_SIZE;
        sprite.height = BONDS.PARTICLE_SIZE;
        // Additive-ish glow (in Pixi this is a real enum; safe as a string for tests).
        (sprite as any).blendMode = 'add';
        particleContainer.addChild(sprite);

        const t = (bond.particles.length / Math.max(1, desiredCount)) % 1;
        bond.particles.push({ t, sprite });
      }
    }
  }

  function setAgentPositions(pos: Record<AgentId, Point>) {
    positions = pos;
    rebuildBondGeometry();
    // If the main ticker is paused (visual tests), draw immediately.
    update(0);
  }

  function setBondAffinity(a: AgentId, b: AgentId, affinity: number) {
    const key = bondKey(a, b);
    const bond = bondByKey.get(key);
    if (!bond) return;

    bond.affinity = affinity;
    bond.tier = affinityToTier(affinity);
    bond.color = tierToColor(bond.tier);
    bond.width = computeWidth(bond.tier);
    bond.alphaTarget = affinityToAlpha(affinity);

    // Rebuild particle counts when tier changes.
    rebuildBondGeometry();
    update(0);
  }

  // First build.
  rebuildBondGeometry();

  let lineRedrawAccumMs = 0;

  function update(elapsedMs: number) {
    timeS += elapsedMs / 1000;
    lineRedrawAccumMs += elapsedMs;

    // Rebuild line geometry at a lower cadence to keep 60fps under load.
    const doRedraw = elapsedMs === 0 || lineRedrawAccumMs >= BONDS.LINE_REDRAW_MS;
    if (doRedraw) lineRedrawAccumMs = 0;

    for (const bond of bonds) {
      // Smooth alpha toward target.
      const lerp = Math.min(1, elapsedMs / BONDS.ALPHA_LERP_MS);
      bond.alpha = bond.alpha + (bond.alphaTarget - bond.alpha) * lerp;

      // Drift: small organic wobble of the control point.
      const aPos = positions[bond.a];
      const bPos = positions[bond.b];
      const phase = bond.phase;

      const dx = bPos.x - aPos.x;
      const dy = bPos.y - aPos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const perpX = -dy / dist;
      const perpY = dx / dist;

      const drift = Math.sin((timeS * BONDS.DRIFT_HZ * Math.PI * 2) + phase * Math.PI * 2) * BONDS.DRIFT_PX;
      const control: Point = {
        x: bond.controlBase.x + perpX * drift,
        y: bond.controlBase.y + perpY * drift
      };

      // Pulse alpha very slightly.
      const pulse = 0.92 + Math.sin(timeS * BONDS.PULSE_HZ * Math.PI * 2 + phase * 6.28) * 0.08;
      const alpha = bond.alpha * pulse;
      bond.gfx.alpha = alpha;

      if (doRedraw) {
        const pts = quadraticBezierPolyline(aPos, control, bPos, BONDS.SEGMENTS);
        bond.gfx.clear();
        bond.gfx.poly(toPixiPoly(pts), false).stroke({ width: bond.width, color: bond.color, alpha: 1 });
      }

      // Particles
      const speed = tierToSpeedPxPerS(bond.tier);
      const dt = (speed / bond.length) * (elapsedMs / 1000);

      for (let i = 0; i < bond.particles.length; i++) {
        const p = bond.particles[i];
        p.t = (p.t + dt) % 1;

        const pt = quadraticBezierPoint(aPos, control, bPos, p.t);
        p.sprite.position.set(pt.x, pt.y);
        p.sprite.tint = bond.color;

        // Gentle breathing.
        const tw = 0.65 + 0.35 * Math.sin(timeS * 2.0 + phase * 5.1 + i);
        p.sprite.alpha = alpha * (0.35 + tw * 0.65);
        const s = 0.7 + tw * 0.6;
        p.sprite.scale.set(s);
      }
    }
  }

  // Draw once so the network is visible even if the ticker is paused immediately (e.g. visual tests).
  update(0);

  function reset() {
    timeS = 0;
    lineRedrawAccumMs = 0;
    rebuildBondGeometry();
    for (const bond of bonds) {
      const count = Math.max(1, bond.particles.length);
      for (let i = 0; i < bond.particles.length; i++) {
        bond.particles[i].t = (i / count) % 1;
      }
      bond.alpha = bond.alphaTarget;
      bond.gfx.alpha = bond.alphaTarget;
    }
    update(0);
  }

  return {
    container,
    setAgentPositions,
    setBondAffinity,
    update,
    reset,
    getBonds: () => bonds
  };
}
