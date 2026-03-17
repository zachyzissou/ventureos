import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container {
    children: any[] = [];
    parent: Container | null = null;
    x = 0;
    y = 0;
    alpha = 1;
    rotation = 0;

    position = {
      set: (x: number, y: number) => {
        this.x = x;
        this.y = y;
      }
    };

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
  }

  class Graphics extends Container {
    circle() {
      return this;
    }
    roundRect() {
      return this;
    }
    fill() {
      return this;
    }
    clear() {
      return this;
    }
    stroke() {
      return this;
    }
  }

  class Text extends Container {
    text: string;
    style: any;
    anchor = { set: () => void 0 };
    width = 100;
    height = 10;

    constructor(opts: { text: string; style?: any }) {
      super();
      this.text = opts.text;
      this.style = opts.style;
    }
  }

  return { Container, Graphics, Text };
});

import { createUnitsLayer } from '@/renderer/units';

describe('units', () => {
  it('creates units based on sessions count', () => {
    const units = createUnitsLayer(['venture_research']);
    units.setAgent('venture_research', { x: 0, y: 0 }, 'ACTIVE', 2, undefined);
    expect(units.container.children.length).toBe(2);
  });

  it('update positions orbiting units around building', () => {
    const units = createUnitsLayer(['venture_research']);
    units.setAgent('venture_research', { x: 0, y: 0 }, 'ACTIVE', 1, undefined);
    units.update(1000);

    const u = units.container.children[0] as any;
    expect(Math.abs(u.x) + Math.abs(u.y)).toBeGreaterThan(0);
  });

  it('removes units when sessions drop to 0', () => {
    const units = createUnitsLayer(['venture_research']);
    units.setAgent('venture_research', { x: 0, y: 0 }, 'ACTIVE', 2, undefined);
    expect(units.container.children.length).toBe(2);

    units.setAgent('venture_research', { x: 0, y: 0 }, 'IDLE', 0, undefined);
    expect(units.container.children.length).toBe(0);
  });

  it('accepts activeSessions and does not throw on untrusted labels', () => {
    const units = createUnitsLayer(['venture_research']);
    units.setAgent('venture_research', { x: 0, y: 0 }, 'ACTIVE', 1, [
      { id: 's1', label: '<img src=x onerror=alert(1)> Research: XSS', startedAt: new Date().toISOString() }
    ]);
    units.update(16);
  });
});
