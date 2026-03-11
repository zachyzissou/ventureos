/**
 * Sparkline Renderer — Issue #205
 *
 * Minimal line-chart renderer for the diagnostics drill-down panel.
 * Draws compact metric history sparklines using PixiJS Graphics.
 *
 * Each sparkline shows a time-series with:
 * - Line graph of values
 * - Optional filled area under the curve
 * - Min/max/current value labels
 * - Threshold line (warning/critical)
 */

import { Container, Graphics, Text } from 'pixi.js';

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface SparklineConfig {
  /** Display width in pixels. */
  width: number;
  /** Display height in pixels. */
  height: number;
  /** Line color (hex). */
  lineColor: number;
  /** Fill color under curve (hex), or null to disable. */
  fillColor: number | null;
  /** Fill alpha (0..1). */
  fillAlpha: number;
  /** Line width in pixels. */
  lineWidth: number;
  /** Optional warning threshold value (draws a dashed line). */
  warningThreshold: number | null;
  /** Optional critical threshold value. */
  criticalThreshold: number | null;
  /** Label for the metric. */
  label: string;
  /** Unit suffix for display (e.g., '%', 'ms'). */
  unit: string;
  /** Value range minimum (auto if null). */
  minValue: number | null;
  /** Value range maximum (auto if null). */
  maxValue: number | null;
  /** Format function for value display. */
  formatValue: (v: number) => string;
}

export const DEFAULT_SPARKLINE_CONFIG: SparklineConfig = {
  width: 140,
  height: 32,
  lineColor: 0x00d4ff,
  fillColor: 0x00d4ff,
  fillAlpha: 0.12,
  lineWidth: 1.5,
  warningThreshold: null,
  criticalThreshold: null,
  label: '',
  unit: '',
  minValue: null,
  maxValue: null,
  formatValue: (v) => v.toFixed(1),
};

export type SparklineLayer = {
  container: Container;
  setData: (values: number[]) => void;
  setConfig: (config: Partial<SparklineConfig>) => void;
  destroy: () => void;
};

// ═══════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════

export function createSparkline(initialConfig?: Partial<SparklineConfig>): SparklineLayer {
  const config: SparklineConfig = { ...DEFAULT_SPARKLINE_CONFIG, ...initialConfig };

  const container = new Container();
  const lineGfx = new Graphics();
  const fillGfx = new Graphics();
  const thresholdGfx = new Graphics();
  container.addChild(fillGfx, thresholdGfx, lineGfx);

  // Label
  const labelText = new Text({
    text: config.label,
    style: { fontSize: 9, fill: 0x88aacc, fontFamily },
  });
  labelText.position.set(0, -12);
  container.addChild(labelText);

  // Current value
  const valueText = new Text({
    text: '',
    style: { fontSize: 9, fill: 0xffffff, fontFamily },
  });
  container.addChild(valueText);

  let currentValues: number[] = [];

  function render() {
    lineGfx.clear();
    fillGfx.clear();
    thresholdGfx.clear();

    const { width, height, lineColor, fillColor, fillAlpha, lineWidth } = config;

    if (currentValues.length < 2) {
      valueText.text = currentValues.length === 1
        ? config.formatValue(currentValues[0]) + config.unit
        : '--';
      valueText.position.set(width + 4, height / 2 - 5);
      return;
    }

    // Compute range
    let minV = config.minValue ?? Infinity;
    let maxV = config.maxValue ?? -Infinity;
    if (config.minValue === null || config.maxValue === null) {
      for (const v of currentValues) {
        if (config.minValue === null && v < minV) minV = v;
        if (config.maxValue === null && v > maxV) maxV = v;
      }
    }
    // Ensure non-zero range
    if (maxV <= minV) {
      maxV = minV + 1;
    }

    const range = maxV - minV;
    const stepX = width / (currentValues.length - 1);

    // Map value to Y (inverted: higher value = lower Y)
    const toY = (v: number): number => {
      const norm = (v - minV) / range;
      return height - norm * height;
    };

    // Draw fill area
    if (fillColor !== null) {
      fillGfx.moveTo(0, height);
      for (let i = 0; i < currentValues.length; i++) {
        fillGfx.lineTo(i * stepX, toY(currentValues[i]));
      }
      fillGfx.lineTo((currentValues.length - 1) * stepX, height);
      fillGfx.closePath();
      fillGfx.fill({ color: fillColor, alpha: fillAlpha });
    }

    // Draw line
    lineGfx.moveTo(0, toY(currentValues[0]));
    for (let i = 1; i < currentValues.length; i++) {
      lineGfx.lineTo(i * stepX, toY(currentValues[i]));
    }
    lineGfx.stroke({ width: lineWidth, color: lineColor });

    // Draw threshold lines
    if (config.warningThreshold !== null) {
      const y = toY(config.warningThreshold);
      if (y >= 0 && y <= height) {
        drawDashedLine(thresholdGfx, 0, y, width, y, 0xffc247, 0.5, 4, 3);
      }
    }
    if (config.criticalThreshold !== null) {
      const y = toY(config.criticalThreshold);
      if (y >= 0 && y <= height) {
        drawDashedLine(thresholdGfx, 0, y, width, y, 0xff3b3b, 0.5, 4, 3);
      }
    }

    // Update value text
    const current = currentValues[currentValues.length - 1];
    valueText.text = config.formatValue(current) + config.unit;
    valueText.position.set(width + 4, height / 2 - 5);

    // Color value based on thresholds
    if (config.criticalThreshold !== null && current >= config.criticalThreshold) {
      valueText.style.fill = 0xff3b3b;
    } else if (config.warningThreshold !== null && current >= config.warningThreshold) {
      valueText.style.fill = 0xffc247;
    } else {
      valueText.style.fill = 0x39e58c;
    }

    // Update label
    labelText.text = config.label;
  }

  function setData(values: number[]) {
    currentValues = values;
    render();
  }

  function setConfig(partial: Partial<SparklineConfig>) {
    Object.assign(config, partial);
    render();
  }

  function destroy() {
    container.destroy({ children: true });
  }

  // Initial render
  render();

  return {
    container,
    setData,
    setConfig,
    destroy,
  };
}

// ═══════════════════════════════════════════
// Drawing helpers
// ═══════════════════════════════════════════

function drawDashedLine(
  gfx: Graphics,
  x1: number, y1: number,
  x2: number, y2: number,
  color: number,
  width: number,
  dashLen: number,
  gapLen: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;

  const nx = dx / dist;
  const ny = dy / dist;
  let pos = 0;

  while (pos < dist) {
    const start = pos;
    const end = Math.min(pos + dashLen, dist);
    gfx.moveTo(x1 + nx * start, y1 + ny * start);
    gfx.lineTo(x1 + nx * end, y1 + ny * end);
    gfx.stroke({ width, color, alpha: 0.6 });
    pos = end + gapLen;
  }
}

// ═══════════════════════════════════════════
// Preset sparkline configs
// ═══════════════════════════════════════════

export const SPARKLINE_PRESETS: Record<string, Partial<SparklineConfig>> = {
  cpu: {
    label: 'CPU',
    unit: '%',
    lineColor: 0x00d4ff,
    fillColor: 0x00d4ff,
    minValue: 0,
    maxValue: 1,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
    formatValue: (v) => Math.round(v * 100).toString(),
  },
  memory: {
    label: 'Memory',
    unit: '%',
    lineColor: 0x9b59b6,
    fillColor: 0x9b59b6,
    minValue: 0,
    maxValue: 1,
    warningThreshold: 0.75,
    criticalThreshold: 0.90,
    formatValue: (v) => Math.round(v * 100).toString(),
  },
  latency: {
    label: 'Latency',
    unit: 'ms',
    lineColor: 0xffd700,
    fillColor: 0xffd700,
    minValue: 0,
    maxValue: null, // auto-scale
    warningThreshold: 500,
    criticalThreshold: 2000,
    formatValue: (v) => Math.round(v).toString(),
  },
  errorRate: {
    label: 'Errors',
    unit: '%',
    lineColor: 0xff3b3b,
    fillColor: 0xff3b3b,
    minValue: 0,
    maxValue: null,
    warningThreshold: 0.05,
    criticalThreshold: 0.15,
    formatValue: (v) => (v * 100).toFixed(1),
  },
};
