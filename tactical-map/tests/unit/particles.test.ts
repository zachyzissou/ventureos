import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container {
    children: any[] = [];
    parent: Container | null = null;
    addChild(...nodes: any[]) {
      for (const n of nodes) {
        if (n && typeof n === 'object') n.parent = this;
      }
      this.children.push(...nodes);
      return nodes[0];
    }
  }

  class Texture {
    static WHITE = new Texture();
  }

  class Sprite {
    parent: Container | null = null;
    x = 0;
    y = 0;
    tint = 0xffffff;
    alpha = 1;
    width = 1;
    height = 1;
    scale = { set: () => void 0 };
    anchor = { set: () => void 0 };
    position = {
      set: (x: number, y: number) => {
        this.x = x;
        this.y = y;
      }
    };

    constructor(_t?: Texture) {}

    removeFromParent() {
      if (!this.parent) return;
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
  }

  return { Container, Texture, Sprite };
});

import { PARTICLES } from '@/config';
import { createParticleSystem } from '@/renderer/particles';

describe('particles', () => {
  it('initializes with ambient target particles', () => {
    const ps = createParticleSystem({ seed: 1 });
    expect(ps.count()).toBeGreaterThanOrEqual(PARTICLES.AMBIENT_TARGET);
  });

  it('burst adds particles but respects the MAX cap', () => {
    const ps = createParticleSystem({ seed: 2 });

    ps.burst('TYPING', { x: 0, y: 0 }, 20);
    expect(ps.count()).toBeGreaterThanOrEqual(PARTICLES.AMBIENT_TARGET + 20);

    ps.burst('TYPING', { x: 0, y: 0 }, 10_000);
    expect(ps.count()).toBeLessThanOrEqual(PARTICLES.MAX);
  });

  it('emitRate spawns rate-based particles', () => {
    const ps = createParticleSystem({ seed: 3 });
    const before = ps.count();
    ps.emitRate('DEPLOY', { x: 0, y: 0 }, 10, 1000);
    expect(ps.count()).toBeGreaterThanOrEqual(before + 9);
  });

  it('update expires non-ambient particles and maintains ambient count', () => {
    const ps = createParticleSystem({ seed: 4 });
    ps.burst('ERROR', { x: 0, y: 0 }, 50);
    expect(ps.count()).toBeGreaterThan(PARTICLES.AMBIENT_TARGET);

    ps.update(20_000);
    expect(ps.count()).toBeGreaterThanOrEqual(PARTICLES.AMBIENT_TARGET);
  });

  it('reset restores deterministic ambient baseline', () => {
    const ps = createParticleSystem({ seed: 5 });
    ps.burst('DEPLOY', { x: 0, y: 0 }, 30);
    ps.update(500);
    expect(ps.count()).toBeGreaterThan(PARTICLES.AMBIENT_TARGET);

    ps.reset();
    expect(ps.count()).toBeGreaterThanOrEqual(PARTICLES.AMBIENT_TARGET);
    expect(ps.count()).toBeLessThanOrEqual(PARTICLES.MAX);
  });
});
