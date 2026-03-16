import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container {
    children: any[] = [];
    parent: Container | null = null;
    filters?: unknown[];

    addChild(...nodes: any[]) {
      for (const n of nodes) {
        if (n && typeof n === 'object') n.parent = this;
      }
      this.children.push(...nodes);
      return nodes[0];
    }

    removeFromParent() {
      if (!this.parent) return;
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }

    position = {
      set: (_x: number, _y: number) => void 0
    };

    scale = {
      set: (_s: number) => void 0
    };
  }

  class Graphics extends Container {
    clear() {
      return this;
    }
    poly() {
      return this;
    }
    stroke() {
      return this;
    }
  }

  class BlurFilter {
    strength = 0;
    constructor(opts?: any) {
      if (opts && typeof opts.strength === 'number') this.strength = opts.strength;
    }
  }

  class Texture {
    static WHITE = new Texture();
  }

  class Sprite extends Container {
    tint = 0xffffff;
    alpha = 1;
    width = 1;
    height = 1;
    anchor = { set: () => void 0 };
    position = { set: (_x: number, _y: number) => void 0 };
    scale = { set: (_s: number) => void 0 };
    constructor(_tex?: Texture) {
      super();
    }
  }

  return { Container, Graphics, BlurFilter, Texture, Sprite };
});

import { createAffinityNetworkLayer } from '@/renderer/affinity-network';
import { AFFINITY_SEED_BONDS } from '@/affinity/seed';

describe('affinity network layer', () => {
  it('initializes with 28 bonds and creates particle sprites', () => {
    const layer = createAffinityNetworkLayer();
    const bonds = layer.getBonds();

    expect(bonds.length).toBe(28);
    expect(AFFINITY_SEED_BONDS.length).toBe(28);

    // container has [lines, particleContainer]
    expect(layer.container.children.length).toBe(2);

    const particleContainer = layer.container.children[1] as any;
    expect(particleContainer.children.length).toBeGreaterThan(0);

    // Update should not throw and should animate particles.
    layer.update(16);
    layer.update(16);
  });

  it('can update a bond affinity and rebuild particle counts', () => {
    const layer = createAffinityNetworkLayer();

    const before = (layer.container.children[1] as any).children.length;
    layer.setBondAffinity('sentinel', 'synth', 0.9);
    const after = (layer.container.children[1] as any).children.length;

    // Tier 5 should allocate more particles than tier 1/2.
    expect(after).toBeGreaterThanOrEqual(before);

    layer.update(16);
  });

  it('reset returns particles to deterministic positions', () => {
    const layer = createAffinityNetworkLayer();
    const initialTs = layer.getBonds()[0].particles.map((p) => p.t);

    layer.update(120);
    layer.reset();

    expect(layer.getBonds()[0].particles.map((p) => p.t)).toEqual(initialTs);
  });
});
