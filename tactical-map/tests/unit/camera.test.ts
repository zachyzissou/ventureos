import { describe, it, expect } from 'vitest';
import { __test as cameraTest } from '@/interaction/camera';

describe('camera math', () => {
  it('zoomToCursor keeps world point under cursor stable', () => {
    const state0 = { x: 960, y: 540, zoom: 1 };
    const cursor = { x: 1000, y: 600 };

    // The world point under cursor before zoom
    const world0 = {
      x: (cursor.x - state0.x) / state0.zoom,
      y: (cursor.y - state0.y) / state0.zoom
    };

    const state1 = cameraTest.zoomToCursor(state0, cursor, 2);

    const world1 = {
      x: (cursor.x - state1.x) / state1.zoom,
      y: (cursor.y - state1.y) / state1.zoom
    };

    expect(world1.x).toBeCloseTo(world0.x, 10);
    expect(world1.y).toBeCloseTo(world0.y, 10);
  });

  it('pan shifts camera position by delta', () => {
    const state0 = { x: 10, y: 20, zoom: 1 };
    const state1 = cameraTest.pan(state0, { dx: 5, dy: -3 });
    expect(state1.x).toBe(15);
    expect(state1.y).toBe(17);
  });
});
