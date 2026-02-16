/**
 * Phase 5.7 — Selection Ring unit tests
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
    circle = vi.fn().mockReturnThis();
    stroke = vi.fn().mockReturnThis();
    fill = vi.fn().mockReturnThis();
    moveTo = vi.fn().mockReturnThis();
    lineTo = vi.fn().mockReturnThis();
  }
  class Text {
    text = '';
    position = { set: vi.fn() };
    anchor = { set: vi.fn() };
    style: Record<string, unknown> = {};
    alpha = 1;
    visible = true;
  }
  return { Container, Graphics, Text };
});

import { createSelectionRing } from '../../src/interaction/selection';

describe('SelectionRing', () => {
  let selectionStore: ReturnType<typeof createStore<SelectionState>>;

  beforeEach(() => {
    selectionStore = createStore<SelectionState>({ selectedId: null, hoveredId: null });
  });

  it('should create a selection ring that starts hidden', () => {
    const ring = createSelectionRing(
      selectionStore,
      () => ({ x: 0, y: 0 })
    );
    expect(ring.container).toBeDefined();
    expect(ring.container.visible).toBe(false);
  });

  it('should become visible when an agent is selected', () => {
    const ring = createSelectionRing(
      selectionStore,
      () => ({ x: 100, y: 200 })
    );

    selectionStore.set({ selectedId: 'oracle', hoveredId: null });
    expect(ring.container.visible).toBe(true);
  });

  it('should hide when deselected', () => {
    const ring = createSelectionRing(
      selectionStore,
      () => ({ x: 100, y: 200 })
    );

    selectionStore.set({ selectedId: 'oracle', hoveredId: null });
    expect(ring.container.visible).toBe(true);

    selectionStore.set({ selectedId: null, hoveredId: null });
    expect(ring.container.visible).toBe(false);
  });

  it('should update position on each frame', () => {
    let pos = { x: 100, y: 200 };
    const ring = createSelectionRing(
      selectionStore,
      () => pos
    );

    selectionStore.set({ selectedId: 'atlas', hoveredId: null });
    ring.update(16);
    expect(ring.container.position.set).toHaveBeenCalledWith(100, 200);

    pos = { x: 300, y: 400 };
    ring.update(16);
    expect(ring.container.position.set).toHaveBeenCalledWith(300, 400);
  });

  it('should clean up on destroy', () => {
    const ring = createSelectionRing(
      selectionStore,
      () => ({ x: 0, y: 0 })
    );

    ring.destroy();
    // After destroy, store changes should not cause errors
    selectionStore.set({ selectedId: 'oracle', hoveredId: null });
  });
});
