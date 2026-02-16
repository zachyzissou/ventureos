import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container {
    children: any[] = [];
    visible = true;
    parent: Container | null = null;

    addChild(...nodes: any[]) {
      for (const n of nodes) {
        if (n && typeof n === 'object') n.parent = this;
      }
      this.children.push(...nodes);
      return nodes[0];
    }

    position = {
      set: (_x: number, _y: number) => void 0
    };
  }

  class Graphics extends Container {
    clear() {
      return this;
    }
    roundRect() {
      return this;
    }
    rect() {
      return this;
    }
    circle() {
      return this;
    }
    arc() {
      return this;
    }
    moveTo() {
      return this;
    }
    lineTo() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
  }

  class Text extends Container {
    private _text = '';
    style: any;
    anchor = { set: (_x: number, _y?: number) => void 0 };
    alpha = 1;

    constructor(opts?: any) {
      super();
      this._text = String(opts?.text ?? '');
      this.style = opts?.style ?? {};
    }

    set text(v: string) {
      this._text = String(v);
    }

    get text() {
      return this._text;
    }

    get width() {
      return this._text.length * 6;
    }

    get height() {
      return 12;
    }
  }

  return { Container, Graphics, Text };
});

import { createEmptyEconomyState } from '@/economy/state';
import { createResourceEconomyLayer } from '@/renderer/resource-economy';

describe('renderer/resource-economy', () => {
  it('renders economy indicators incrementally without full-scene redraws', () => {
    const layer = createResourceEconomyLayer();

    const state = createEmptyEconomyState(0);
    state.agents.oracle.tokenBudget = 10_000;
    state.agents.oracle.tokensUsed = 8_000;
    state.agents.oracle.tokensRemaining = 2_000;
    state.agents.oracle.usageRatio = 0.8;
    state.agents.oracle.quotaRemainingRatio = 0.2;
    state.agents.oracle.health = 'yellow';
    state.agents.oracle.costUsd = 12.7;
    state.agents.oracle.burnRateUsdPerHour = 4.2;
    state.agents.oracle.history = [
      { ts: 1000, tokensUsed: 5000, costUsd: 8.1 },
      { ts: 2000, tokensUsed: 8000, costUsd: 12.7 }
    ];

    state.pool.tokenQuotaTotal = 100_000;
    state.pool.tokenQuotaUsed = 70_000;
    state.pool.tokenQuotaRemaining = 30_000;
    state.pool.tokenQuotaRemainingRatio = 0.3;
    state.pool.costBudgetUsd = 200;
    state.pool.costUsedUsd = 110;
    state.pool.costRemainingUsd = 90;
    state.pool.costRemainingRatio = 0.45;

    layer.setViewport(1920, 1080);
    layer.setEconomyState(state);

    layer.update(16);
    layer.update(120); // heatmap redraw throttle

    const first = layer.getDrawStats();
    expect(first.agentRedraws).toBeGreaterThan(0);
    expect(first.panelRedraws).toBeGreaterThan(0);
    expect(first.heatmapRedraws).toBeGreaterThan(0);

    // No changed state -> only pulse/animation, no new redraw required.
    layer.update(16);
    const second = layer.getDrawStats();

    expect(second.agentRedraws).toBe(first.agentRedraws);
    expect(second.panelRedraws).toBe(first.panelRedraws);

    layer.setConnectionStatus(true);
    layer.update(16);

    const third = layer.getDrawStats();
    expect(third.panelRedraws).toBeGreaterThan(second.panelRedraws);
  });
});
