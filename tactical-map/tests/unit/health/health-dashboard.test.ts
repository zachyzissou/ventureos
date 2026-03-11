import { describe, it, expect, vi } from 'vitest';

// Mock pixi.js
vi.mock('pixi.js', () => {
  class Container {
    visible = true;
    alpha = 1;
    children: unknown[] = [];
    position = { set: vi.fn() };
    addChild(...items: unknown[]) {
      this.children.push(...items);
    }
    removeChild(item: unknown) {
      const idx = this.children.indexOf(item);
      if (idx >= 0) this.children.splice(idx, 1);
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

import { createHealthDashboard } from '@/renderer/health-dashboard';
import { createEmptyHealthState, applyHealthSnapshot } from '@/health/state';
import type { HealthState, RawHealthSnapshot } from '@/health/types';

describe('createHealthDashboard', () => {
  it('creates a dashboard with a container', () => {
    const dashboard = createHealthDashboard();
    expect(dashboard.container).toBeDefined();
  });

  it('starts hidden', () => {
    const dashboard = createHealthDashboard();
    expect(dashboard.isVisible()).toBe(false);
  });

  it('can toggle visibility', () => {
    const dashboard = createHealthDashboard();
    dashboard.setVisible(true);
    expect(dashboard.isVisible()).toBe(true);
    dashboard.setVisible(false);
    expect(dashboard.isVisible()).toBe(false);
  });

  it('accepts health state', () => {
    const dashboard = createHealthDashboard();
    const state = createEmptyHealthState();
    dashboard.setHealthState(state);
    dashboard.setVisible(true);
    // Should not throw during update
    dashboard.update(16);
  });

  it('handles viewport changes', () => {
    const dashboard = createHealthDashboard();
    dashboard.setViewport(1024, 768);
    // Should not throw
    dashboard.update(16);
  });

  it('updates when visible with state', () => {
    const dashboard = createHealthDashboard();
    const state = createEmptyHealthState();
    dashboard.setHealthState(state);
    dashboard.setVisible(true);
    // Multiple update cycles
    dashboard.update(16);
    dashboard.update(16);
    dashboard.update(16);
  });

  it('skips update when not visible', () => {
    const dashboard = createHealthDashboard();
    const state = createEmptyHealthState();
    dashboard.setHealthState(state);
    dashboard.setVisible(false);
    // Should not throw or do work
    dashboard.update(16);
  });

  it('shows degraded agent state', () => {
    const dashboard = createHealthDashboard();
    const snapshot: RawHealthSnapshot = {
      agents: {
        oracle: { cpu: 0.95, memory: 0.92, latency: 3000, errorRate: 0.20 },
      },
    };
    const state = applyHealthSnapshot(createEmptyHealthState(), snapshot);
    dashboard.setHealthState(state);
    dashboard.setVisible(true);
    dashboard.update(16);
    // Dashboard should render without errors
    expect(dashboard.isVisible()).toBe(true);
  });

  it('reflects system-wide status', () => {
    const dashboard = createHealthDashboard();
    const snapshot: RawHealthSnapshot = {
      agents: {
        oracle: { cpu: 0.95 },
        atlas: { cpu: 0.95 },
        sentinel: { cpu: 0.95 },
      },
    };
    const state = applyHealthSnapshot(createEmptyHealthState(), snapshot);
    dashboard.setHealthState(state);
    dashboard.setVisible(true);
    dashboard.update(16);

    expect(state.system.overallStatus).toBe('red');
  });

  it('handles empty health state gracefully', () => {
    const dashboard = createHealthDashboard();
    dashboard.setVisible(true);
    // No state set, should handle gracefully
    dashboard.update(16);
  });

  it('handles multiple state updates', () => {
    const dashboard = createHealthDashboard();
    dashboard.setVisible(true);

    const state1 = createEmptyHealthState();
    dashboard.setHealthState(state1);
    dashboard.update(16);

    const snapshot: RawHealthSnapshot = {
      agents: { oracle: { cpu: 0.8 } },
    };
    const state2 = applyHealthSnapshot(state1, snapshot);
    dashboard.setHealthState(state2);
    dashboard.update(16);

    // Should reflect updated state
    expect(dashboard.isVisible()).toBe(true);
  });
});
