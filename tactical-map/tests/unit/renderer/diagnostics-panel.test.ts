/**
 * Diagnostics Panel Tests — Issue #205
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// PixiJS mocks
vi.mock('pixi.js', () => {
  class MockGraphics {
    children: unknown[] = [];
    clear() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    closePath() { return this; }
    fill() { return this; }
    stroke() { return this; }
    circle() { return this; }
    arc() { return this; }
    roundRect() { return this; }
    rect() { return this; }
    destroy() {}
  }

  class MockText {
    text: string;
    style: Record<string, unknown>;
    position = { set: vi.fn(), x: 0, y: 0 };
    anchor = { set: vi.fn() };
    visible = true;
    width = 50;
    eventMode = 'auto';
    cursor = 'default';

    constructor(opts?: { text?: string; style?: Record<string, unknown> }) {
      this.text = opts?.text ?? '';
      this.style = opts?.style ?? {};
    }
    destroy() {}
    on() { return this; }
  }

  class MockContainer {
    children: unknown[] = [];
    visible = true;
    alpha = 1;
    zIndex = 0;
    position = { set: vi.fn(), x: 0, y: 0 };
    eventMode = 'auto';
    cursor = 'default';

    addChild(...args: unknown[]) { this.children.push(...args); return this; }
    removeChildren() { this.children = []; return this; }
    destroy(opts?: { children?: boolean }) { this.children = []; }
    on() { return this; }
  }

  return {
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
  };
});

import { createDiagnosticsPanel } from '@/renderer/diagnostics-panel';
import type { DiagnosticsData } from '@/renderer/diagnostics-panel';

function makeSampleData(overrides?: Partial<DiagnosticsData>): DiagnosticsData {
  return {
    agentId: 'venture_research',
    healthScore: 85,
    sessionCount: 12,
    abortedCount: 2,
    successRate: 0.833,
    metricsHistory: {
      cpuUsage: [0.2, 0.3, 0.4, 0.35, 0.5, 0.45, 0.3],
      memoryUsage: [0.4, 0.42, 0.45, 0.43, 0.5, 0.48, 0.44],
      latencyMs: [100, 120, 150, 130, 200, 180, 140],
      errorRate: [0, 0, 0.01, 0, 0, 0.02, 0],
    },
    recentErrors: [
      { ts: Date.now() - 60000, message: 'Connection timeout', level: 'error' },
      { ts: Date.now() - 120000, message: 'Rate limit exceeded', level: 'error' },
    ],
    alerts: [
      { severity: 'P1', title: 'CPU Warning', message: 'CPU at 70%' },
    ],
    ...overrides,
  };
}

describe('createDiagnosticsPanel', () => {
  it('creates panel with expected interface', () => {
    const panel = createDiagnosticsPanel();
    expect(panel).toBeDefined();
    expect(panel.container).toBeDefined();
    expect(typeof panel.show).toBe('function');
    expect(typeof panel.hide).toBe('function');
    expect(typeof panel.updateData).toBe('function');
    expect(typeof panel.setViewport).toBe('function');
    expect(typeof panel.update).toBe('function');
    expect(typeof panel.isVisible).toBe('function');
    expect(typeof panel.currentAgent).toBe('function');
    expect(typeof panel.onClose).toBe('function');
  });

  it('starts hidden', () => {
    const panel = createDiagnosticsPanel();
    expect(panel.isVisible()).toBe(false);
    expect(panel.currentAgent()).toBeNull();
  });

  it('show makes it visible', () => {
    const panel = createDiagnosticsPanel();
    panel.show(makeSampleData());
    expect(panel.isVisible()).toBe(true);
    expect(panel.currentAgent()).toBe('venture_research');
  });

  it('hide makes it invisible', () => {
    const panel = createDiagnosticsPanel();
    panel.show(makeSampleData());
    panel.hide();
    expect(panel.isVisible()).toBe(false);
    expect(panel.currentAgent()).toBeNull();
  });

  it('updateData does not throw when visible', () => {
    const panel = createDiagnosticsPanel();
    panel.show(makeSampleData());
    expect(() => panel.updateData(makeSampleData({ healthScore: 60 }))).not.toThrow();
  });

  it('updateData is no-op when hidden', () => {
    const panel = createDiagnosticsPanel();
    // Should not throw even when not visible
    expect(() => panel.updateData(makeSampleData())).not.toThrow();
  });

  it('setViewport does not throw', () => {
    const panel = createDiagnosticsPanel();
    expect(() => panel.setViewport(1920, 1080)).not.toThrow();
    expect(() => panel.setViewport(800, 600)).not.toThrow();
  });

  it('update animates alpha', () => {
    const panel = createDiagnosticsPanel();
    panel.show(makeSampleData());
    // Container alpha starts at 0, should increase with update
    expect(() => panel.update(16)).not.toThrow();
  });

  it('onClose registers callback', () => {
    const panel = createDiagnosticsPanel();
    const cb = vi.fn();
    panel.onClose(cb);
    // The callback is registered but only fires on close button click
    expect(cb).not.toHaveBeenCalled();
  });

  it('handles data with no errors', () => {
    const panel = createDiagnosticsPanel();
    expect(() =>
      panel.show(makeSampleData({ recentErrors: [] })),
    ).not.toThrow();
  });

  it('handles data with no alerts', () => {
    const panel = createDiagnosticsPanel();
    expect(() =>
      panel.show(makeSampleData({ alerts: [] })),
    ).not.toThrow();
  });

  it('handles data with P0 alerts', () => {
    const panel = createDiagnosticsPanel();
    expect(() =>
      panel.show(
        makeSampleData({
          alerts: [
            { severity: 'P0', title: 'CPU Critical', message: 'CPU at 95%' },
            { severity: 'P0', title: 'Latency Critical', message: 'Latency at 3000ms' },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('handles zero health score', () => {
    const panel = createDiagnosticsPanel();
    expect(() =>
      panel.show(makeSampleData({ healthScore: 0 })),
    ).not.toThrow();
  });

  it('handles null success rate', () => {
    const panel = createDiagnosticsPanel();
    expect(() =>
      panel.show(makeSampleData({ successRate: null })),
    ).not.toThrow();
  });

  it('handles empty metrics history', () => {
    const panel = createDiagnosticsPanel();
    expect(() =>
      panel.show(
        makeSampleData({
          metricsHistory: {
            cpuUsage: [],
            memoryUsage: [],
            latencyMs: [],
            errorRate: [],
          },
        }),
      ),
    ).not.toThrow();
  });

  it('can switch between agents', () => {
    const panel = createDiagnosticsPanel();
    panel.show(makeSampleData({ agentId: 'venture_research' }));
    expect(panel.currentAgent()).toBe('venture_research');

    panel.show(makeSampleData({ agentId: 'venture_security' as any }));
    expect(panel.currentAgent()).toBe('venture_security');
  });
});
