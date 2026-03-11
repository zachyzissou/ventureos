/**
 * Completion Animations Tests — Phase 5.5
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AnimationManager,
  createCompletionParticles,
  updateParticles,
  applyAnimation,
  easeOutCubic,
  easeInOutCubic,
  easeOutElastic,
  easeOutBounce,
} from '../../../src/missions/completion-animations';
import type { Animation, Point } from '../../../src/missions/types';

// ─── AnimationManager ───────────────────────────────────────────────────

describe('AnimationManager', () => {
  let manager: AnimationManager;

  beforeEach(() => {
    manager = new AnimationManager(50);
  });

  describe('create()', () => {
    it('creates an animation with correct properties', () => {
      const id = manager.create('card_appear', 'mission-1', 500);
      expect(id).toBeTruthy();
      expect(id).toMatch(/^anim-/);
      expect(manager.count).toBe(1);
    });

    it('returns unique IDs for each animation', () => {
      const id1 = manager.create('card_appear', 'm1', 500);
      const id2 = manager.create('card_appear', 'm2', 500);
      expect(id1).not.toBe(id2);
    });

    it('respects max capacity and prunes oldest', () => {
      const mgr = new AnimationManager(3);
      mgr.create('card_appear', 'm1', 500);
      mgr.create('card_appear', 'm2', 500);
      mgr.create('card_appear', 'm3', 500);
      mgr.create('card_appear', 'm4', 500); // Should prune m1
      expect(mgr.count).toBe(3);
    });
  });

  describe('update()', () => {
    it('returns active animations', () => {
      manager.create('card_appear', 'm1', 1000);
      const active = manager.update(performance.now());
      expect(active).toHaveLength(1);
      expect(active[0].type).toBe('card_appear');
    });

    it('progresses animation toward completion', () => {
      manager.create('card_appear', 'm1', 1000);
      const now = performance.now();
      // First update
      manager.update(now);
      // Second update 500ms later
      const active = manager.update(now + 500);
      expect(active[0].progress).toBeGreaterThan(0);
      expect(active[0].progress).toBeLessThan(1);
    });

    it('removes completed animations', () => {
      manager.create('card_appear', 'm1', 100);
      const now = performance.now();
      // After duration passes
      const active = manager.update(now + 200);
      expect(active).toHaveLength(0);
      expect(manager.count).toBe(0);
    });
  });

  describe('remove()', () => {
    it('removes a specific animation', () => {
      const id = manager.create('card_appear', 'm1', 500);
      expect(manager.count).toBe(1);
      manager.remove(id);
      expect(manager.count).toBe(0);
    });
  });

  describe('removeByTarget()', () => {
    it('removes all animations for a target', () => {
      manager.create('card_appear', 'm1', 500);
      manager.create('phase_transition', 'm1', 800);
      manager.create('card_appear', 'm2', 500);
      expect(manager.count).toBe(3);

      manager.removeByTarget('m1');
      expect(manager.count).toBe(1);
    });
  });

  describe('hasActiveAnimation()', () => {
    it('returns true when target has animation', () => {
      manager.create('card_appear', 'm1', 500);
      expect(manager.hasActiveAnimation('m1')).toBe(true);
    });

    it('returns false when target has no animation', () => {
      manager.create('card_appear', 'm1', 500);
      expect(manager.hasActiveAnimation('m2')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('removes all animations', () => {
      manager.create('card_appear', 'm1', 500);
      manager.create('card_appear', 'm2', 500);
      manager.clear();
      expect(manager.count).toBe(0);
    });
  });
});

// ─── Particle System ────────────────────────────────────────────────────

describe('createCompletionParticles', () => {
  it('creates the requested number of particles', () => {
    const particles = createCompletionParticles({ x: 100, y: 100 }, 20);
    expect(particles).toHaveLength(20);
  });

  it('particles start at the center point', () => {
    const center: Point = { x: 50, y: 75 };
    const particles = createCompletionParticles(center, 5);
    for (const p of particles) {
      expect(p.x).toBe(50);
      expect(p.y).toBe(75);
    }
  });

  it('particles have velocity', () => {
    const particles = createCompletionParticles({ x: 0, y: 0 }, 10);
    const hasVelocity = particles.some((p) => p.vx !== 0 || p.vy !== 0);
    expect(hasVelocity).toBe(true);
  });

  it('particles start with life = 1', () => {
    const particles = createCompletionParticles({ x: 0, y: 0 }, 5);
    for (const p of particles) {
      expect(p.life).toBe(1);
    }
  });

  it('particles have colors from provided palette', () => {
    const colors = ['#FF0000', '#00FF00'];
    const particles = createCompletionParticles({ x: 0, y: 0 }, 4, colors);
    for (const p of particles) {
      expect(colors).toContain(p.color);
    }
  });

  it('uses default count of 24', () => {
    const particles = createCompletionParticles({ x: 0, y: 0 });
    expect(particles).toHaveLength(24);
  });
});

describe('updateParticles', () => {
  it('moves particles based on velocity', () => {
    const particles = createCompletionParticles({ x: 100, y: 100 }, 5);
    const origX = particles.map((p) => p.x);
    const updated = updateParticles(particles, 0.1);
    const movedParticles = updated.filter((p, i) => p.x !== origX[i]);
    expect(movedParticles.length).toBeGreaterThan(0);
  });

  it('decreases particle life over time', () => {
    const particles = createCompletionParticles({ x: 0, y: 0 }, 5);
    const updated = updateParticles(particles, 0.1);
    for (const p of updated) {
      expect(p.life).toBeLessThan(1);
    }
  });

  it('removes dead particles', () => {
    const particles = createCompletionParticles({ x: 0, y: 0 }, 5);
    // Apply a long time step to kill particles
    const updated = updateParticles(particles, 2.0);
    expect(updated.length).toBeLessThan(5);
  });

  it('applies gravity (particles move downward)', () => {
    const particles = [
      { x: 0, y: 0, vx: 0, vy: 0, life: 1, color: '#FFF', size: 3 },
    ];
    updateParticles(particles, 0.1, 80);
    expect(particles[0].vy).toBeGreaterThan(0); // Gravity pulled down
  });

  it('returns empty array when all particles are dead', () => {
    const particles = [
      { x: 0, y: 0, vx: 0, vy: 0, life: 0.01, color: '#FFF', size: 0.1 },
    ];
    const result = updateParticles(particles, 1);
    expect(result).toHaveLength(0);
  });
});

// ─── Easing Functions ───────────────────────────────────────────────────

describe('easing functions', () => {
  const easingFns = [
    { name: 'easeOutCubic', fn: easeOutCubic },
    { name: 'easeInOutCubic', fn: easeInOutCubic },
    { name: 'easeOutElastic', fn: easeOutElastic },
    { name: 'easeOutBounce', fn: easeOutBounce },
  ];

  for (const { name, fn } of easingFns) {
    describe(name, () => {
      it('returns 0 at t=0', () => {
        expect(fn(0)).toBeCloseTo(0, 5);
      });

      it('returns 1 at t=1', () => {
        expect(fn(1)).toBeCloseTo(1, 5);
      });

      it('returns values in reasonable range for 0 < t < 1', () => {
        for (let t = 0.1; t < 1; t += 0.1) {
          const v = fn(t);
          // Elastic/bounce can overshoot slightly, but should be near 0-1.2
          expect(v).toBeGreaterThan(-0.5);
          expect(v).toBeLessThan(1.5);
        }
      });
    });
  }
});

// ─── applyAnimation ─────────────────────────────────────────────────────

describe('applyAnimation', () => {
  function makeAnim(type: string, progress: number, params: Record<string, number | string> = {}): Animation {
    return {
      id: 'test',
      type: type as any,
      targetId: 'target',
      startTime: 0,
      duration: 1000,
      progress,
      params,
    };
  }

  it('card_appear: starts transparent and becomes opaque', () => {
    const start = applyAnimation(makeAnim('card_appear', 0));
    const end = applyAnimation(makeAnim('card_appear', 1));
    expect(start.opacity).toBeLessThan(end.opacity);
    expect(end.opacity).toBeCloseTo(1, 1);
  });

  it('card_disappear: starts opaque and becomes transparent', () => {
    const start = applyAnimation(makeAnim('card_disappear', 0));
    const end = applyAnimation(makeAnim('card_disappear', 1));
    expect(start.opacity).toBeGreaterThan(end.opacity);
    expect(end.opacity).toBeCloseTo(0, 1);
  });

  it('error_shake: has horizontal offset that diminishes', () => {
    const mid = applyAnimation(makeAnim('error_shake', 0.2));
    const end = applyAnimation(makeAnim('error_shake', 0.99));
    // The shake intensity should be greater at the start
    expect(Math.abs(mid.offsetX)).toBeGreaterThan(Math.abs(end.offsetX));
  });

  it('completion_burst: scales up then settles', () => {
    const mid = applyAnimation(makeAnim('completion_burst', 0.5));
    expect(mid.scale).toBeGreaterThan(1);
  });

  it('float_bob: oscillates vertically', () => {
    const a = applyAnimation(makeAnim('float_bob', 0, { amplitude: 5 }));
    const b = applyAnimation(makeAnim('float_bob', 0.25, { amplitude: 5 }));
    const c = applyAnimation(makeAnim('float_bob', 0.5, { amplitude: 5 }));
    // Different progress values should give different offsets
    expect(a.offsetY).not.toBe(b.offsetY);
    // At 0.5, sin(π) ≈ 0
    expect(Math.abs(c.offsetY)).toBeLessThan(1);
  });

  it('unknown type returns neutral transform', () => {
    const result = applyAnimation(makeAnim('unknown_type', 0.5));
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
    expect(result.scale).toBe(1);
    expect(result.opacity).toBe(1);
  });
});
