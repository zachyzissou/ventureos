import { describe, it, expect, vi } from 'vitest';

// Pixi's real Text/Filter stack requires a full Canvas/WebGL environment.
// For unit tests, we mock the tiny subset of Pixi APIs used by our procedural renderers.
vi.mock('pixi.js', () => {
  class Container {
    children: unknown[] = [];
    parent: Container | null = null;
    x = 0;
    y = 0;
    rotation = 0;
    alpha = 1;

    position = {
      x: 0,
      y: 0,
      set: (x: number, y: number) => {
        this.position.x = x;
        this.position.y = y;
        this.x = x;
        this.y = y;
      }
    };

    scale = {
      x: 1,
      y: 1,
      set: (v: number) => {
        this.scale.x = v;
        this.scale.y = v;
      }
    };

    eventMode?: string;
    cursor?: string;
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

    on() {
      /* noop */
    }
  }

  class Graphics extends Container {
    rect() {
      return this;
    }
    roundRect() {
      return this;
    }
    circle() {
      return this;
    }
    poly() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
    clear() {
      return this;
    }
  }

  class Text extends Container {
    text: string;
    style: unknown;
    anchor = { set: () => void 0 };
    alpha = 1;
    width = 100;
    height = 20;
    constructor(opts: { text: string; style?: unknown }) {
      super();
      this.text = opts.text;
      this.style = opts.style;
    }
  }

  class BlurFilter {
    strength = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(opts?: any) {
      if (opts && typeof opts.strength === 'number') this.strength = opts.strength;
    }
  }

  class Texture {
    static WHITE = new Texture();
  }

  class Sprite extends Container {
    tint = 0xffffff;
    width = 1;
    height = 1;
    anchor = { set: () => void 0 };
    constructor(_tex?: Texture) {
      super();
    }
  }

  return { Container, Graphics, Text, BlurFilter, Texture, Sprite };
});

import { Container, Text } from 'pixi.js';
import { createTerrain } from '@/renderer/terrain';
import { createBuildingsLayer, RING_AGENT_IDS } from '@/renderer/buildings';
import { createNexus } from '@/renderer/venture_control';
import { createHud } from '@/renderer/hud';

describe('renderer foundation', () => {
  it('creates terrain with hit surface', () => {
    const t = createTerrain();
    expect(t.container).toBeInstanceOf(Container);
    expect(t.hit).toBeTruthy();
    expect(t.hit.eventMode).toBe('static');
  });

  it('creates building layer with expected buildings', () => {
    const layer = createBuildingsLayer();
    expect(layer.container).toBeInstanceOf(Container);
    expect(Object.keys(layer.buildings).sort()).toEqual([...RING_AGENT_IDS].sort());
    expect(layer.container.children.length).toBe(RING_AGENT_IDS.length);
    layer.update(16);
  });

  it('creates venture_control view and update does not throw', () => {
    const n = createNexus();
    expect(n.container).toBeInstanceOf(Container);
    expect(n.container.children.length).toBeGreaterThan(0);
    n.update(16);
    n.setStateColor(0xff0000);
  });

  it('creates HUD and can resize/update', () => {
    const hud = createHud();
    expect(hud.container).toBeInstanceOf(Container);
    hud.setSize(1920, 1080);
    hud.setKpiText('Oracle WIS: 85 | Atlas SPD: 72');
    hud.update(16);
    hud.setSize(1366, 768);
    hud.update(16);

    // Sanity: should have at least one Text child somewhere.
    const hasText =
      hud.container.children.some((c) => c instanceof Text) ||
      hud.container.children.some((c) => (c as Container).children?.some((cc) => cc instanceof Text));
    expect(hasText).toBe(true);

    // Regression guard: ticker scroll layer must be clipped to the strip bounds.
    const hasMask = findDescendant(hud.container, (node) => Boolean((node as { mask?: unknown }).mask));
    expect(hasMask).toBe(true);
  });
});

function findDescendant(node: unknown, predicate: (node: unknown) => boolean): boolean {
  if (!node || typeof node !== 'object') return false;
  if (predicate(node)) return true;
  const children = (node as { children?: unknown[] }).children;
  if (!Array.isArray(children)) return false;
  for (const child of children) {
    if (findDescendant(child, predicate)) return true;
  }
  return false;
}
