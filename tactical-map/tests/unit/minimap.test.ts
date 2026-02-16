/**
 * Phase 5.7 — Minimap unit tests
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
    toLocal = vi.fn().mockReturnValue({ x: 80, y: 80 });
  }
  class Graphics {
    alpha = 1;
    eventMode = 'auto';
    cursor = 'default';
    on = vi.fn();
    removeAllListeners = vi.fn();
    clear = vi.fn().mockReturnThis();
    circle = vi.fn().mockReturnThis();
    rect = vi.fn().mockReturnThis();
    roundRect = vi.fn().mockReturnThis();
    stroke = vi.fn().mockReturnThis();
    fill = vi.fn().mockReturnThis();
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

import { createMinimap } from '../../src/interaction/minimap';

describe('Minimap', () => {
  let selectionStore: ReturnType<typeof createStore<SelectionState>>;

  beforeEach(() => {
    selectionStore = createStore<SelectionState>({ selectedId: null, hoveredId: null });
  });

  it('should create a minimap', () => {
    const minimap = createMinimap(selectionStore);
    expect(minimap.container).toBeDefined();
  });

  it('should be visible by default', () => {
    const minimap = createMinimap(selectionStore);
    expect(minimap.isVisible()).toBe(true);
  });

  it('should toggle visibility', () => {
    const minimap = createMinimap(selectionStore);
    minimap.setVisible(false);
    expect(minimap.isVisible()).toBe(false);
    minimap.setVisible(true);
    expect(minimap.isVisible()).toBe(true);
  });

  it('should accept camera state', () => {
    const minimap = createMinimap(selectionStore);
    minimap.setCameraState({ x: 960, y: 540, zoom: 1.5 });
    minimap.update(16);
    // Should not throw
  });

  it('should accept agent statuses', () => {
    const minimap = createMinimap(selectionStore);
    minimap.setAgentStatuses({
      oracle: 'healthy',
      atlas: 'degraded',
      sentinel: 'unhealthy'
    });
    minimap.update(16);
    // Should not throw
  });

  it('should register navigation callback', () => {
    const minimap = createMinimap(selectionStore);
    const cb = vi.fn();
    minimap.onNavigate(cb);
    // Navigation is triggered by click — tested in integration
    expect(cb).not.toHaveBeenCalled();
  });

  it('should clean up on destroy', () => {
    const minimap = createMinimap(selectionStore);
    minimap.destroy();
    selectionStore.set({ selectedId: 'oracle', hoveredId: null });
  });

  it('should set viewport position', () => {
    const minimap = createMinimap(selectionStore);
    minimap.setViewport(1920, 1080);
    expect(minimap.container.position.set).toHaveBeenCalled();
  });
});
