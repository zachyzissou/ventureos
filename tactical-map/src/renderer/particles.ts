import { Container, Sprite, Texture } from 'pixi.js';
import { PARTICLES } from '@/config';
import type { Point } from '@/config';

export type ParticleKind =
  | 'AMBIENT'
  | 'TYPING'
  | 'COMPILING'
  | 'DEPLOY'
  | 'SCAN'
  | 'SPARK'
  | 'SMOKE'
  | 'ERROR';

export type ParticleSystem = {
  container: Container;
  /** per-frame update */
  update: (elapsedMs: number) => void;
  /** emit a continuous stream (rate is particles/sec) */
  emitRate: (kind: ParticleKind, origin: Point, rate: number, elapsedMs: number) => void;
  /** emit a burst */
  burst: (kind: ParticleKind, origin: Point, count: number) => void;
  /** current active count */
  count: () => number;
  /** reset particle field to deterministic initial state (used by visual tests) */
  reset: () => void;
};

type Particle = {
  s: Sprite;
  kind: ParticleKind;
  lifeMs: number;
  ageMs: number;
  vx: number;
  vy: number;
  size: number;
};

const PARTICLE_POOL_MAX = Math.max(
  PARTICLES.AMBIENT_TARGET * 2,
  Math.floor(PARTICLES.MAX * 0.35)
);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kindConfig(kind: ParticleKind) {
  switch (kind) {
    case 'TYPING':
      return { tint: 0x66ddff, alpha: 0.85, lifeMs: 650, speed: 22, spread: 10, size: 2.0 };
    case 'COMPILING':
      return { tint: 0x33ff88, alpha: 0.9, lifeMs: 780, speed: 18, spread: 16, size: 2.2 };
    case 'DEPLOY':
      return { tint: 0xffd700, alpha: 0.9, lifeMs: 900, speed: 26, spread: 24, size: 2.6 };
    case 'SCAN':
      return { tint: 0xff6633, alpha: 0.8, lifeMs: 520, speed: 40, spread: 12, size: 1.8 };
    case 'SPARK':
      return { tint: 0xffffff, alpha: 0.6, lifeMs: 420, speed: 30, spread: 28, size: 1.6 };
    case 'SMOKE':
      return { tint: 0xaaaaaa, alpha: 0.35, lifeMs: 1700, speed: 10, spread: 12, size: 3.8 };
    case 'ERROR':
      return { tint: 0xff3366, alpha: 0.8, lifeMs: 950, speed: 16, spread: 18, size: 2.6 };
    case 'AMBIENT':
    default:
      return { tint: 0x44aaff, alpha: 0.12, lifeMs: 6000, speed: 5, spread: 220, size: 1.4 };
  }
}

export function createParticleSystem({ seed = 1337 } = {}): ParticleSystem {
  const container = new Container();
  let rng = mulberry32(seed);

  const active: Particle[] = [];
  const pool: Particle[] = [];
  const rateAcc = new Map<ParticleKind, number>();

  function spawn(kind: ParticleKind, origin: Point) {
    if (active.length >= PARTICLES.MAX) return;

    const cfg = kindConfig(kind);

    const p = pool.pop() ?? {
      s: new Sprite(Texture.WHITE),
      kind,
      lifeMs: cfg.lifeMs,
      ageMs: 0,
      vx: 0,
      vy: 0,
      size: cfg.size
    };

    p.kind = kind;
    p.lifeMs = cfg.lifeMs;
    p.ageMs = 0;
    p.size = cfg.size;

    // Random direction with spread.
    const ang = rng() * Math.PI * 2;
    const sp = cfg.speed * (0.55 + rng() * 0.9);
    p.vx = Math.cos(ang) * sp + (rng() - 0.5) * cfg.spread;
    p.vy = Math.sin(ang) * sp + (rng() - 0.5) * cfg.spread;

    // Initial position jitter.
    const j = cfg.spread * 0.5;
    p.s.position.set(origin.x + (rng() - 0.5) * j, origin.y + (rng() - 0.5) * j);

    p.s.tint = cfg.tint;
    p.s.alpha = cfg.alpha;
    p.s.anchor.set(0.5);
    p.s.width = p.size;
    p.s.height = p.size;

    if (!p.s.parent) container.addChild(p.s);

    active.push(p);
  }

  function seedAmbientParticles() {
    const ambientOrigin = { x: 0, y: 0 };
    for (let i = 0; i < PARTICLES.AMBIENT_TARGET; i++) {
      // spread them across a wide area
      const o = {
        x: ambientOrigin.x + (rng() - 0.5) * 1400,
        y: ambientOrigin.y + (rng() - 0.5) * 900
      };
      spawn('AMBIENT', o);
    }
  }

  function reset() {
    // Remove all active sprites from the scene so visual snapshots are deterministic.
    for (const particle of active) {
      particle.s.removeFromParent();
    }
    active.length = 0;
    pool.length = 0;
    rateAcc.clear();

    // Re-seed RNG and rebuild ambient field in a deterministic order.
    rng = mulberry32(seed);
    seedAmbientParticles();
  }

  // Initialize ambient particles deterministically.
  seedAmbientParticles();

  function update(elapsedMs: number) {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.ageMs += elapsedMs;
      const t = p.ageMs / p.lifeMs;

      // Movement.
      p.s.x += (p.vx * elapsedMs) / 1000;
      p.s.y += (p.vy * elapsedMs) / 1000;

      // Fade out.
      p.s.alpha *= 0.995;
      p.s.scale.set(1 + t * 0.35);

      // Simple upward drift for smoke/ambient.
      if (p.kind === 'SMOKE' || p.kind === 'AMBIENT') {
        p.s.y -= (elapsedMs / 1000) * 2.5;
      }

      // Off-screen culling (world space around origin).
      if (p.s.x < -2200 || p.s.x > 2200 || p.s.y < -1400 || p.s.y > 1400) {
        p.ageMs = p.lifeMs + 1;
      }

      if (p.ageMs >= p.lifeMs) {
        // Remove.
        p.s.removeFromParent();
        active.splice(i, 1);
        if (pool.length < PARTICLE_POOL_MAX) {
          pool.push(p);
        }
      }
    }

    // Maintain ambient target.
    let ambientCount = 0;
    for (const p of active) if (p.kind === 'AMBIENT') ambientCount++;

    const need = Math.max(0, PARTICLES.AMBIENT_TARGET - ambientCount);
    for (let i = 0; i < need; i++) {
      const o = { x: (rng() - 0.5) * 1400, y: (rng() - 0.5) * 900 };
      spawn('AMBIENT', o);
    }
  }

  function emitRate(kind: ParticleKind, origin: Point, rate: number, elapsedMs: number) {
    if (rate <= 0) return;
    const prev = rateAcc.get(kind) ?? 0;
    const next = prev + (rate * elapsedMs) / 1000;
    const count = Math.floor(next);
    rateAcc.set(kind, next - count);
    for (let i = 0; i < count; i++) spawn(kind, origin);
  }

  function burst(kind: ParticleKind, origin: Point, count: number) {
    for (let i = 0; i < count; i++) spawn(kind, origin);
  }

  function count() {
    return active.length;
  }

  return { container, update, emitRate, burst, count, reset };
}
