import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container {
    position = {
      x: 0,
      y: 0,
      set: (x: number, y: number) => {
        this.position.x = x;
        this.position.y = y;
      }
    };
    scale = {
      x: 1,
      y: 1,
      set: (v: number) => {
        this.scale.x = v;
        this.scale.y = v;
      }
    };
  }
  return { Container };
});

import { Container } from 'pixi.js';
import { CAMERA } from '@/config';
import { createCameraController } from '@/interaction/camera';

function createFakeCanvas() {
  const listeners = new Map<string, ((e: any) => void)[]>();

  const canvas: any = {
    width: 100,
    height: 100,
    addEventListener: (type: string, fn: (e: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: (type: string, fn: (e: any) => void) => {
      const next = (listeners.get(type) ?? []).filter((f) => f !== fn);
      listeners.set(type, next);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    dispatch: (type: string, e: any) => {
      for (const fn of listeners.get(type) ?? []) fn(e);
    }
  };

  return canvas;
}

describe('camera controller', () => {
  it('reset animates back to home', () => {
    const world = new Container();
    world.position.set(100, 100);
    world.scale.set(1);

    const canvas = createFakeCanvas();
    const cam = createCameraController({ world: world as any, canvas: canvas as any });
    cam.setHome({ x: 100, y: 100 });
    cam.setState({ x: 140, y: 160, zoom: 1.4 });

    cam.reset();
    cam.update(CAMERA.RESET_MS);

    const s = cam.getState();
    expect(s.x).toBeCloseTo(100, 4);
    expect(s.y).toBeCloseTo(100, 4);
    expect(s.zoom).toBeCloseTo(1, 4);

    cam.destroy();
  });

  it('wheel zoom updates zoom', () => {
    const world = new Container();
    world.position.set(100, 100);
    world.scale.set(1);

    const canvas = createFakeCanvas();
    const cam = createCameraController({ world: world as any, canvas: canvas as any });
    cam.setHome({ x: 100, y: 100 });
    cam.setState({ x: 100, y: 100, zoom: 1 });

    const preventDefault = vi.fn();
    canvas.dispatch('wheel', { deltaY: -120, clientX: 50, clientY: 50, preventDefault });

    const s = cam.getState();
    expect(preventDefault).toHaveBeenCalled();
    expect(s.zoom).toBeGreaterThan(1);

    cam.destroy();
  });
});
