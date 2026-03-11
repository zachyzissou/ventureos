/**
 * Help Overlay Tests — Issue #210
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class MockGraphics {
    clear() { return this; } roundRect() { return this; } fill() { return this; }
    stroke() { return this; } destroy() {}
  }
  class MockText {
    text: string; style: Record<string, unknown>;
    position = { set: vi.fn(), x: 0, y: 0 }; visible = true; width = 50; height = 14;
    eventMode = 'auto';
    constructor(opts?: { text?: string; style?: Record<string, unknown> }) {
      this.text = opts?.text ?? ''; this.style = opts?.style ?? {};
    }
    destroy() {}
  }
  class MockContainer {
    children: unknown[] = []; visible = true; alpha = 1; zIndex = 0;
    position = { set: vi.fn(), x: 0, y: 0 }; eventMode = 'auto';
    addChild(...args: unknown[]) { this.children.push(...args); return this; }
    removeChildren() { this.children = []; return this; }
    destroy() { this.children = []; } on() { return this; }
  }
  return { Container: MockContainer, Graphics: MockGraphics, Text: MockText };
});

import { createHelpOverlay } from '@/renderer/help-overlay';
import { HELP_ENTRIES } from '@/tour/steps';

describe('createHelpOverlay', () => {
  it('creates with expected interface', () => {
    const o = createHelpOverlay(HELP_ENTRIES);
    for (const fn of ['toggle','show','hide','isVisible','setViewport','update']) {
      expect(typeof (o as any)[fn]).toBe('function');
    }
  });

  it('starts hidden', () => {
    expect(createHelpOverlay(HELP_ENTRIES).isVisible()).toBe(false);
  });

  it('show/hide', () => {
    const o = createHelpOverlay(HELP_ENTRIES);
    o.show(); expect(o.isVisible()).toBe(true);
    o.hide(); expect(o.isVisible()).toBe(false);
  });

  it('toggle flips', () => {
    const o = createHelpOverlay(HELP_ENTRIES);
    o.toggle(); expect(o.isVisible()).toBe(true);
    o.toggle(); expect(o.isVisible()).toBe(false);
  });

  it('setViewport does not throw', () => {
    expect(() => createHelpOverlay(HELP_ENTRIES).setViewport(800, 600)).not.toThrow();
  });

  it('update does not throw', () => {
    const o = createHelpOverlay(HELP_ENTRIES);
    expect(() => o.update(16)).not.toThrow();
    o.show(); expect(() => o.update(16)).not.toThrow();
  });

  it('works with empty entries', () => {
    const o = createHelpOverlay([]);
    o.show(); expect(o.isVisible()).toBe(true);
  });

  it('animation completes on hide', () => {
    const o = createHelpOverlay(HELP_ENTRIES);
    o.show(); o.hide();
    for (let i = 0; i < 200; i++) o.update(16);
    expect(o.isVisible()).toBe(false);
  });
});
