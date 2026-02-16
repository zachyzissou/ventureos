/**
 * Phase 5.7 — Help Overlay unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    eventMode = 'auto';
    cursor = 'default';
    on = vi.fn();
    removeAllListeners = vi.fn();
    clear = vi.fn().mockReturnThis();
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

import { createHelpOverlay } from '../../src/interaction/help-overlay';

describe('HelpOverlay', () => {
  it('should create a help overlay that starts hidden', () => {
    const help = createHelpOverlay();
    expect(help.container).toBeDefined();
    expect(help.isVisible()).toBe(false);
  });

  it('should toggle visibility', () => {
    const help = createHelpOverlay();
    help.toggle();
    expect(help.isVisible()).toBe(true);
    help.toggle();
    expect(help.isVisible()).toBe(false);
  });

  it('should set visible directly', () => {
    const help = createHelpOverlay();
    help.setVisible(true);
    expect(help.isVisible()).toBe(true);
    help.setVisible(false);
    expect(help.isVisible()).toBe(false);
  });

  it('should update viewport', () => {
    const help = createHelpOverlay();
    help.setViewport(1920, 1080);
    // Should not throw
  });

  it('should re-layout when shown', () => {
    const help = createHelpOverlay();
    help.setViewport(1920, 1080);
    help.setVisible(true);
    expect(help.isVisible()).toBe(true);
  });
});
