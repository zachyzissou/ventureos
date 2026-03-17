/**
 * Tour Overlay Renderer Tests — Issue #210
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class MockGraphics {
    clear() { return this; } fill() { return this; } stroke() { return this; }
    circle() { return this; } roundRect() { return this; } rect() { return this; }
    cut() { return this; } destroy() {}
  }
  class MockText {
    text: string; style: Record<string, unknown>;
    position = { set: vi.fn(), x: 0, y: 0 };
    anchor = { set: vi.fn() }; visible = true; width = 50; height = 14;
    eventMode = 'auto'; cursor = 'default';
    constructor(opts?: { text?: string; style?: Record<string, unknown> }) {
      this.text = opts?.text ?? ''; this.style = opts?.style ?? {};
    }
    destroy() {} on() { return this; }
  }
  class MockContainer {
    children: unknown[] = []; visible = true; alpha = 1; zIndex = 0;
    position = { set: vi.fn(), x: 0, y: 0 };
    eventMode = 'auto'; cursor = 'default';
    addChild(...args: unknown[]) { this.children.push(...args); return this; }
    removeChildren() { this.children = []; return this; }
    destroy() { this.children = []; } on() { return this; }
  }
  return { Container: MockContainer, Graphics: MockGraphics, Text: MockText };
});

import { createTourOverlay } from '@/renderer/tour-overlay';
import type { TourStep } from '@/tour/types';

function makeStep(overrides?: Partial<TourStep>): TourStep {
  return { id: 'test', title: 'Test', body: 'Body', anchor: 'viewport', ...overrides };
}

describe('createTourOverlay', () => {
  it('creates overlay with expected interface', () => {
    const o = createTourOverlay();
    expect(o.container).toBeDefined();
    for (const fn of ['show','hide','isVisible','setViewport','update','onNext','onBack','onDismiss','getDisplayedStepIndex']) {
      expect(typeof (o as any)[fn]).toBe('function');
    }
  });

  it('starts hidden', () => {
    const o = createTourOverlay();
    expect(o.isVisible()).toBe(false);
    expect(o.getDisplayedStepIndex()).toBe(-1);
  });

  it('show makes it visible', () => {
    const o = createTourOverlay();
    o.show(makeStep(), 0, 5);
    expect(o.isVisible()).toBe(true);
    expect(o.getDisplayedStepIndex()).toBe(0);
  });

  it('hide makes it invisible', () => {
    const o = createTourOverlay();
    o.show(makeStep(), 0, 5);
    o.hide();
    expect(o.isVisible()).toBe(false);
  });

  it('tracks step index', () => {
    const o = createTourOverlay();
    o.show(makeStep(), 2, 5);
    expect(o.getDisplayedStepIndex()).toBe(2);
  });

  it('setViewport does not throw', () => {
    const o = createTourOverlay();
    expect(() => o.setViewport(800, 600)).not.toThrow();
  });

  it('update does not throw', () => {
    const o = createTourOverlay();
    expect(() => o.update(16)).not.toThrow();
    o.show(makeStep(), 0, 1);
    expect(() => o.update(16)).not.toThrow();
  });

  it('supports all anchor types', () => {
    const o = createTourOverlay();
    for (const anchor of ['viewport', 'venture_control', 'hud', 'agent:venture_research', 'agent:venture_security', { x: 100, y: 200 }] as const) {
      expect(() => o.show(makeStep({ anchor: anchor as any }), 0, 1)).not.toThrow();
    }
  });

  it('supports custom spotlight radius', () => {
    const o = createTourOverlay();
    expect(() => o.show(makeStep({ anchor: 'venture_control', spotlightRadius: 200 }), 0, 1)).not.toThrow();
  });

  it('callbacks can be registered', () => {
    const o = createTourOverlay();
    const cb = vi.fn();
    o.onNext(cb); o.onBack(cb); o.onDismiss(cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('animation hides container after fade-out', () => {
    const o = createTourOverlay();
    o.show(makeStep(), 0, 1);
    o.hide();
    for (let i = 0; i < 200; i++) o.update(16);
    expect(o.isVisible()).toBe(false);
  });
});
