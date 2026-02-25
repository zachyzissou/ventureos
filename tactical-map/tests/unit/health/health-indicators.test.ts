import { describe, it, expect, vi } from 'vitest';

// Mock pixi.js before importing the module
vi.mock('pixi.js', () => {
  class Container {
    visible = true;
    alpha = 1;
    children: unknown[] = [];
    position = { set: vi.fn() };
    addChild(...items: unknown[]) {
      this.children.push(...items);
    }
  }

  class Graphics {
    alpha = 1;
    position = { set: vi.fn() };
    circle() { return this; }
    roundRect() { return this; }
    rect() { return this; }
    fill() { return this; }
    stroke() { return this; }
    clear() { return this; }
    arc() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
  }

  class Text {
    text = '';
    style: Record<string, unknown> = {};
    alpha = 1;
    visible = true;
    position = { set: vi.fn() };
    anchor = { set: vi.fn() };
    width = 50;
    height = 14;

    constructor(opts?: { text?: string; style?: Record<string, unknown> }) {
      if (opts?.text) this.text = opts.text;
      if (opts?.style) this.style = opts.style;
    }
  }

  return { Container, Graphics, Text };
});

import { createHealthIndicatorsLayer } from '@/renderer/health-indicators';

describe('createHealthIndicatorsLayer', () => {
  it('creates a layer with a container', () => {
    const layer = createHealthIndicatorsLayer();
    expect(layer.container).toBeDefined();
  });

  it('starts with 0 redraws', () => {
    const layer = createHealthIndicatorsLayer();
    expect(layer.getDrawStats().redraws).toBe(0);
  });

  it('sets agent health and triggers redraw on update', () => {
    const layer = createHealthIndicatorsLayer();

    layer.setAgentHealth('oracle', { x: 100, y: 100 }, 'green', 'online', 0.3, 0.4, 50);
    layer.update(16);

    expect(layer.getDrawStats().redraws).toBe(1);
  });

  it('does not redraw if nothing changed', () => {
    const layer = createHealthIndicatorsLayer();

    layer.setAgentHealth('oracle', { x: 100, y: 100 }, 'green', 'online', 0.3, 0.4, 50);
    layer.update(16);
    const redraws1 = layer.getDrawStats().redraws;

    // Same values → no redraw
    layer.setAgentHealth('oracle', { x: 100, y: 100 }, 'green', 'online', 0.3, 0.4, 50);
    layer.update(16);
    expect(layer.getDrawStats().redraws).toBe(redraws1);
  });

  it('redraws when status changes', () => {
    const layer = createHealthIndicatorsLayer();

    layer.setAgentHealth('oracle', { x: 100, y: 100 }, 'green', 'online', 0.3, 0.4, 50);
    layer.update(16);
    const redraws1 = layer.getDrawStats().redraws;

    layer.setAgentHealth('oracle', { x: 100, y: 100 }, 'red', 'online', 0.3, 0.4, 50);
    layer.update(16);
    expect(layer.getDrawStats().redraws).toBe(redraws1 + 1);
  });

  it('redraws when connectivity changes', () => {
    const layer = createHealthIndicatorsLayer();

    layer.setAgentHealth('atlas', { x: 200, y: 200 }, 'green', 'online', 0.3, 0.4, 50);
    layer.update(16);
    const redraws1 = layer.getDrawStats().redraws;

    layer.setAgentHealth('atlas', { x: 200, y: 200 }, 'green', 'offline', 0.3, 0.4, 50);
    layer.update(16);
    expect(layer.getDrawStats().redraws).toBe(redraws1 + 1);
  });

  it('redraws when metrics change', () => {
    const layer = createHealthIndicatorsLayer();

    layer.setAgentHealth('synth', { x: 300, y: 300 }, 'yellow', 'online', 0.3, 0.4, 50);
    layer.update(16);
    const redraws1 = layer.getDrawStats().redraws;

    layer.setAgentHealth('synth', { x: 300, y: 300 }, 'yellow', 'online', 0.8, 0.4, 50);
    layer.update(16);
    expect(layer.getDrawStats().redraws).toBe(redraws1 + 1);
  });

  it('handles update calls without setting agent health', () => {
    const layer = createHealthIndicatorsLayer();
    // Should not throw
    layer.update(16);
    layer.update(32);
  });

  it('handles multiple agents', () => {
    const layer = createHealthIndicatorsLayer();

    layer.setAgentHealth('oracle', { x: 100, y: 0 }, 'green', 'online', 0.1, 0.2, 10);
    layer.setAgentHealth('atlas', { x: 200, y: 0 }, 'yellow', 'degraded', 0.5, 0.6, 200);
    layer.setAgentHealth('sentinel', { x: 300, y: 0 }, 'red', 'offline', 0.9, 0.9, 3000);

    layer.update(16);

    // All 3 should have been redrawn
    expect(layer.getDrawStats().redraws).toBe(3);
  });

  it('ignores unknown agent IDs', () => {
    const layer = createHealthIndicatorsLayer();
    // Should not throw
    layer.setAgentHealth('unknown-agent' as any, { x: 0, y: 0 }, 'green', 'online', 0, 0, 0);
    layer.update(16);
  });
});
