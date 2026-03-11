/**
 * Sparkline Renderer Tests — Issue #205
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// PixiJS mocks — sparkline.ts imports from pixi.js
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

    constructor(opts?: { text?: string; style?: Record<string, unknown> }) {
      this.text = opts?.text ?? '';
      this.style = opts?.style ?? {};
    }
    destroy() {}
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

import { createSparkline, SPARKLINE_PRESETS, DEFAULT_SPARKLINE_CONFIG } from '@/renderer/sparkline';

describe('createSparkline', () => {
  it('creates a sparkline with default config', () => {
    const sl = createSparkline();
    expect(sl).toBeDefined();
    expect(sl.container).toBeDefined();
    expect(typeof sl.setData).toBe('function');
    expect(typeof sl.setConfig).toBe('function');
    expect(typeof sl.destroy).toBe('function');
  });

  it('creates sparkline with custom config', () => {
    const sl = createSparkline({
      width: 200,
      height: 40,
      lineColor: 0xff0000,
      label: 'Test',
    });
    expect(sl).toBeDefined();
    expect(sl.container).toBeDefined();
  });

  it('setData updates without throwing', () => {
    const sl = createSparkline({ label: 'CPU' });
    expect(() => sl.setData([0.1, 0.2, 0.3, 0.5, 0.4])).not.toThrow();
  });

  it('handles empty data', () => {
    const sl = createSparkline();
    expect(() => sl.setData([])).not.toThrow();
  });

  it('handles single data point', () => {
    const sl = createSparkline();
    expect(() => sl.setData([0.5])).not.toThrow();
  });

  it('handles large data arrays', () => {
    const sl = createSparkline();
    const data = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.5 + 0.5);
    expect(() => sl.setData(data)).not.toThrow();
  });

  it('setConfig updates without throwing', () => {
    const sl = createSparkline();
    expect(() =>
      sl.setConfig({ lineColor: 0xff0000, label: 'Updated' }),
    ).not.toThrow();
  });

  it('destroy does not throw', () => {
    const sl = createSparkline();
    sl.setData([1, 2, 3]);
    expect(() => sl.destroy()).not.toThrow();
  });
});

describe('SPARKLINE_PRESETS', () => {
  it('has cpu preset', () => {
    expect(SPARKLINE_PRESETS.cpu).toBeDefined();
    expect(SPARKLINE_PRESETS.cpu.label).toBe('CPU');
    expect(SPARKLINE_PRESETS.cpu.warningThreshold).toBe(0.70);
    expect(SPARKLINE_PRESETS.cpu.criticalThreshold).toBe(0.90);
  });

  it('has memory preset', () => {
    expect(SPARKLINE_PRESETS.memory).toBeDefined();
    expect(SPARKLINE_PRESETS.memory.label).toBe('Memory');
  });

  it('has latency preset', () => {
    expect(SPARKLINE_PRESETS.latency).toBeDefined();
    expect(SPARKLINE_PRESETS.latency.unit).toBe('ms');
  });

  it('has errorRate preset', () => {
    expect(SPARKLINE_PRESETS.errorRate).toBeDefined();
    expect(SPARKLINE_PRESETS.errorRate.lineColor).toBe(0xff3b3b);
  });

  it('all presets have required fields', () => {
    for (const [key, preset] of Object.entries(SPARKLINE_PRESETS)) {
      expect(preset.label, `${key} should have label`).toBeDefined();
      expect(preset.unit, `${key} should have unit`).toBeDefined();
      expect(preset.lineColor, `${key} should have lineColor`).toBeDefined();
    }
  });
});

describe('DEFAULT_SPARKLINE_CONFIG', () => {
  it('has valid dimensions', () => {
    expect(DEFAULT_SPARKLINE_CONFIG.width).toBeGreaterThan(0);
    expect(DEFAULT_SPARKLINE_CONFIG.height).toBeGreaterThan(0);
  });

  it('has formatValue function', () => {
    expect(typeof DEFAULT_SPARKLINE_CONFIG.formatValue).toBe('function');
    expect(DEFAULT_SPARKLINE_CONFIG.formatValue(3.14)).toBe('3.1');
  });
});
