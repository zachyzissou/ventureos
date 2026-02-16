/**
 * Phase 5.7 — Tooltip Overlay unit tests
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
  }
  class Text {
    text: string;
    position = { set: vi.fn() };
    anchor = { set: vi.fn() };
    style: Record<string, unknown>;
    alpha = 1;
    visible = true;
    constructor(opts?: { text?: string; style?: Record<string, unknown> }) {
      this.text = opts?.text ?? '';
      this.style = opts?.style ?? {};
    }
  }
  return { Container, Graphics, Text };
});

// Mock sanitize
vi.mock('../../src/utils/sanitize', () => ({
  sanitizePlainText: (s: unknown) => String(s ?? '')
}));

import { createTooltipOverlay } from '../../src/interaction/tooltip';

describe('TooltipOverlay', () => {
  let selectionStore: ReturnType<typeof createStore<SelectionState>>;

  beforeEach(() => {
    selectionStore = createStore<SelectionState>({ selectedId: null, hoveredId: null });
  });

  it('should create a tooltip that starts hidden', () => {
    const tooltip = createTooltipOverlay(
      selectionStore,
      () => ({ x: 0, y: 0 })
    );
    expect(tooltip.container).toBeDefined();
    expect(tooltip.container.visible).toBe(false);
  });

  it('should not show immediately on hover (delay)', () => {
    const tooltip = createTooltipOverlay(
      selectionStore,
      () => ({ x: 0, y: 0 })
    );

    selectionStore.set({ selectedId: null, hoveredId: 'oracle' });
    tooltip.update(100); // only 100ms, below 300ms delay
    expect(tooltip.container.visible).toBe(false);
  });

  it('should show after delay when hovering', () => {
    const tooltip = createTooltipOverlay(
      selectionStore,
      () => ({ x: 100, y: 100 })
    );

    selectionStore.set({ selectedId: null, hoveredId: 'oracle' });
    tooltip.setWorldTransform(960, 540, 1);
    tooltip.update(350); // above 300ms delay
    expect(tooltip.container.visible).toBe(true);
  });

  it('should hide when hover leaves', () => {
    const tooltip = createTooltipOverlay(
      selectionStore,
      () => ({ x: 100, y: 100 })
    );

    selectionStore.set({ selectedId: null, hoveredId: 'oracle' });
    tooltip.setWorldTransform(960, 540, 1);
    tooltip.update(350);
    expect(tooltip.container.visible).toBe(true);

    selectionStore.set({ selectedId: null, hoveredId: null });
    tooltip.update(16);
    expect(tooltip.container.visible).toBe(false);
  });

  it('should reset delay when hovering a different agent', () => {
    const tooltip = createTooltipOverlay(
      selectionStore,
      () => ({ x: 100, y: 100 })
    );

    selectionStore.set({ selectedId: null, hoveredId: 'oracle' });
    tooltip.setWorldTransform(960, 540, 1);
    tooltip.update(200);
    expect(tooltip.container.visible).toBe(false);

    selectionStore.set({ selectedId: null, hoveredId: 'atlas' });
    tooltip.update(200);
    expect(tooltip.container.visible).toBe(false);
  });

  it('should clean up on destroy', () => {
    const tooltip = createTooltipOverlay(
      selectionStore,
      () => ({ x: 0, y: 0 })
    );
    tooltip.destroy();
    // Should not throw
    selectionStore.set({ selectedId: null, hoveredId: 'oracle' });
  });
});
