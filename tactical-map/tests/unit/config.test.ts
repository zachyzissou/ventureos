import { describe, it, expect } from 'vitest';
import { CANVAS, AGENTS, COLORS, BONDS, CAMERA, API, CAPACITY, ECONOMY, SELECTION, TOOLTIP, DETAIL_PANEL, MINIMAP, FEATURES, calculateCirclePositions } from '@/config';

describe('config.ts', () => {
  it('exports core constant groups', () => {
    expect(CANVAS.WIDTH).toBeGreaterThan(0);
    expect(CANVAS.HEIGHT).toBeGreaterThan(0);
    expect(COLORS.PROTOSS_BLUE).toBeTypeOf('number');
    expect(BONDS.TIER_COLORS.length).toBe(5);
    expect(CAMERA.MIN_ZOOM).toBeLessThan(CAMERA.MAX_ZOOM);
    expect(API.POLL_INTERVAL).toBeGreaterThan(0);
    expect(API.RESOURCE_WS_URL).toContain('/resources/stream');
    expect(ECONOMY.WARNING_THRESHOLD).toBeGreaterThan(0);
    expect(CAPACITY.MAX_SESSIONS.atlas).toBe(5);
    expect(AGENTS.POSITIONS.length).toBe(8);

    // Phase 5.7 constants
    expect(SELECTION.RING_RADIUS).toBeGreaterThan(0);
    expect(SELECTION.RING_COLOR).toBeTypeOf('number');
    expect(SELECTION.PULSE_HZ).toBeGreaterThan(0);
    expect(TOOLTIP.WIDTH).toBeGreaterThan(0);
    expect(TOOLTIP.SHOW_DELAY_MS).toBeGreaterThan(0);
    expect(DETAIL_PANEL.WIDTH).toBeGreaterThan(0);
    expect(DETAIL_PANEL.ANIM_MS).toBeGreaterThan(0);
    expect(MINIMAP.SIZE).toBeGreaterThan(0);
    expect(MINIMAP.DOT_RADIUS).toBeGreaterThan(0);
    expect(MINIMAP.SELECTED_DOT_RADIUS).toBeGreaterThan(MINIMAP.DOT_RADIUS);
    expect(FEATURES.INTERACTIVE_SELECTION).toBe(true);
    expect(FEATURES.TOOLTIP).toBe(true);
    expect(FEATURES.DETAIL_PANEL).toBe(true);
    expect(FEATURES.MINIMAP).toBe(true);
  });

  it('calculateCirclePositions() returns evenly spaced points on a circle', () => {
    const pts = calculateCirclePositions(8, 100);
    expect(pts).toHaveLength(8);

    // All points should be at radius ~100
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeGreaterThan(99.999);
      expect(r).toBeLessThan(100.001);
    }

    // Angle differences should be ~45 degrees
    const angles = pts.map((p) => Math.atan2(p.y, p.x));
    // unwrap and normalize
    const norm = angles.map((a) => (a < -Math.PI / 2 ? a + Math.PI * 2 : a));
    const diffs = norm
      .slice(1)
      .map((a, i) => a - norm[i])
      .map((d) => (d < 0 ? d + Math.PI * 2 : d));

    for (const d of diffs) {
      expect(d).toBeGreaterThan(Math.PI / 4 - 1e-6);
      expect(d).toBeLessThan(Math.PI / 4 + 1e-6);
    }
  });
});
