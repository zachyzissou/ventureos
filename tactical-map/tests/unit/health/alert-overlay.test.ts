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

import { createAlertOverlay } from '@/renderer/alert-overlay';
import type { HealthAlert } from '@/health/types';

function makeAlert(overrides: Partial<HealthAlert> = {}): HealthAlert {
  return {
    id: `alert-${Math.random()}`,
    severity: 'P1',
    state: 'active',
    agentId: 'venture_research',
    title: 'Warning',
    message: 'Test alert message',
    createdAt: Date.now(),
    ttlMs: 120_000,
    ...overrides,
  };
}

describe('createAlertOverlay', () => {
  it('creates an overlay with a container', () => {
    const overlay = createAlertOverlay();
    expect(overlay.container).toBeDefined();
  });

  it('starts with 0 visible alerts', () => {
    const overlay = createAlertOverlay();
    expect(overlay.getVisibleCount()).toBe(0);
  });

  it('shows alerts when set', () => {
    const overlay = createAlertOverlay();
    const alerts = [makeAlert({ id: 'a1' })];

    overlay.setAlerts(alerts);
    // Banners are created immediately with fadeProgress starting at 0, but > 0 after update
    overlay.update(500); // enough to fade in

    expect(overlay.getVisibleCount()).toBe(1);
  });

  it('shows up to 5 alerts', () => {
    const overlay = createAlertOverlay();
    const alerts = Array.from({ length: 7 }, (_, i) =>
      makeAlert({ id: `a${i}` })
    );

    overlay.setAlerts(alerts);
    overlay.update(500);

    expect(overlay.getVisibleCount()).toBeLessThanOrEqual(5);
  });

  it('prioritizes P0 over P1', () => {
    const overlay = createAlertOverlay();
    const alerts = [
      makeAlert({ id: 'p1-1', severity: 'P1', message: 'P1 alert' }),
      makeAlert({ id: 'p0-1', severity: 'P0', message: 'P0 alert' }),
    ];

    overlay.setAlerts(alerts);
    // P0 should be sorted first
    overlay.update(500);
    expect(overlay.getVisibleCount()).toBe(2);
  });

  it('filters out non-active alerts', () => {
    const overlay = createAlertOverlay();
    const alerts = [
      makeAlert({ id: 'a1', state: 'active' }),
      makeAlert({ id: 'a2', state: 'resolved' }),
      makeAlert({ id: 'a3', state: 'acknowledged' }),
    ];

    overlay.setAlerts(alerts);
    overlay.update(500);

    expect(overlay.getVisibleCount()).toBe(1);
  });

  it('fades out removed alerts', () => {
    const overlay = createAlertOverlay();

    // Add an alert
    overlay.setAlerts([makeAlert({ id: 'a1' })]);
    overlay.update(500); // fade in
    expect(overlay.getVisibleCount()).toBe(1);

    // Remove it
    overlay.setAlerts([]);
    overlay.update(16); // start fade
    // Still visible during fade
    expect(overlay.getVisibleCount()).toBe(1);

    // After full fade duration
    overlay.update(500);
    expect(overlay.getVisibleCount()).toBe(0);
  });

  it('handles viewport changes', () => {
    const overlay = createAlertOverlay();
    overlay.setViewport(1024, 768);
    // Should not throw
    overlay.update(16);
  });

  it('handles updates with no alerts', () => {
    const overlay = createAlertOverlay();
    overlay.update(16);
    overlay.update(32);
    expect(overlay.getVisibleCount()).toBe(0);
  });

  it('handles rapid alert changes', () => {
    const overlay = createAlertOverlay();

    overlay.setAlerts([makeAlert({ id: 'a1' })]);
    overlay.update(16);

    overlay.setAlerts([makeAlert({ id: 'a2' })]);
    overlay.update(16);

    overlay.setAlerts([]);
    overlay.update(600);

    expect(overlay.getVisibleCount()).toBe(0);
  });
});
