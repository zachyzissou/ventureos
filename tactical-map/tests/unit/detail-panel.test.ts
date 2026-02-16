/**
 * Phase 5.7 — Detail Panel unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore } from '../../src/state/store';
import type { SelectionState } from '../../src/state/types';

// Mock pixi.js with proper classes
vi.mock('pixi.js', () => {
  class Container {
    children: unknown[] = [];
    visible = true;
    position = { set: vi.fn(), x: 0, y: 0 };
    zIndex = 0;
    addChild = vi.fn();
    removeChild = vi.fn();
  }
  class Graphics {
    alpha = 1;
    clear = vi.fn().mockReturnThis();
    roundRect = vi.fn().mockReturnThis();
    stroke = vi.fn().mockReturnThis();
    fill = vi.fn().mockReturnThis();
    moveTo = vi.fn().mockReturnThis();
    lineTo = vi.fn().mockReturnThis();
  }
  class Text {
    text: string;
    position = { set: vi.fn() };
    anchor = { set: vi.fn() };
    style: Record<string, unknown>;
    alpha = 1;
    visible = true;
    eventMode = 'auto';
    cursor = 'default';
    on = vi.fn();
    removeAllListeners = vi.fn();
    constructor(opts?: { text?: string; style?: Record<string, unknown> }) {
      this.text = opts?.text ?? '';
      this.style = opts?.style ?? {};
    }
  }
  return { Container, Graphics, Text };
});

// Mock dependencies
vi.mock('../../src/utils/sanitize', () => ({
  sanitizePlainText: (s: unknown) => String(s ?? '')
}));

vi.mock('../../src/economy/sparkline', () => ({
  buildSparklinePoints: () => [{ x: 0, y: 0 }, { x: 1, y: 1 }]
}));

import { createDetailPanel } from '../../src/interaction/detail-panel';

describe('DetailPanel', () => {
  let selectionStore: ReturnType<typeof createStore<SelectionState>>;

  beforeEach(() => {
    selectionStore = createStore<SelectionState>({ selectedId: null, hoveredId: null });
  });

  it('should create a panel that starts hidden', () => {
    const panel = createDetailPanel(selectionStore);
    expect(panel.container).toBeDefined();
    expect(panel.container.visible).toBe(false);
  });

  it('should not be visible when nothing is selected', () => {
    const panel = createDetailPanel(selectionStore);
    panel.setViewport(1920, 1080);
    panel.update(300);
    expect(panel.isVisible()).toBe(false);
  });

  it('should become visible when an agent is selected', () => {
    const panel = createDetailPanel(selectionStore);
    panel.setViewport(1920, 1080);

    selectionStore.set({ selectedId: 'oracle', hoveredId: null });
    expect(panel.isVisible()).toBe(true);
  });

  it('should hide when agent is deselected', () => {
    const panel = createDetailPanel(selectionStore);
    panel.setViewport(1920, 1080);

    selectionStore.set({ selectedId: 'oracle', hoveredId: null });
    expect(panel.isVisible()).toBe(true);

    selectionStore.set({ selectedId: null, hoveredId: null });
    expect(panel.isVisible()).toBe(false);
  });

  it('should accept health data', () => {
    const panel = createDetailPanel(selectionStore);
    // Should not throw
    panel.setHealthData({});
    panel.setAlerts([]);
  });

  it('should clean up on destroy', () => {
    const panel = createDetailPanel(selectionStore);
    panel.destroy();
    selectionStore.set({ selectedId: 'oracle', hoveredId: null });
  });

  it('should animate slide-in over time', () => {
    const panel = createDetailPanel(selectionStore);
    panel.setViewport(1920, 1080);

    selectionStore.set({ selectedId: 'oracle', hoveredId: null });

    // After partial animation time, should be visible but still animating
    panel.update(100);
    expect(panel.container.visible).toBe(true);
  });
});
