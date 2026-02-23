import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container {
    children: any[] = [];
    addChild(...nodes: any[]) {
      this.children.push(...nodes);
      return nodes[0];
    }
  }

  class Graphics {
    position = { set: () => void 0 };
    roundRect() {
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

  return { Container, Graphics };
});

import { createHealthBarsLayer } from '@/renderer/health-bars';

describe('health bars layer', () => {
  it('creates 2 graphics per agent (bg + fill)', () => {
    const layer = createHealthBarsLayer(['oracle']);
    expect(layer.container.children.length).toBe(2);
  });

  it('setAgent positions and redraws without throwing', () => {
    const layer = createHealthBarsLayer(['oracle']);
    layer.setAgent('oracle', { x: 10, y: 20 }, 'ACTIVE', 1);
    layer.update(16);
    layer.setAgent('oracle', { x: 10, y: 20 }, 'OVERLOADED', 3);
    layer.update(1000);
  });
});
