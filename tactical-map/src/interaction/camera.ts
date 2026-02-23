import { Container, type FederatedPointerEvent } from 'pixi.js';
import { CAMERA } from '@/config';
import { clamp, lerp } from '@/renderer/primitives';

export type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

export function zoomToCursor(
  state: CameraState,
  cursor: { x: number; y: number },
  nextZoom: number
): CameraState {
  const z0 = state.zoom;
  const z1 = nextZoom;

  // worldCoord under cursor (assuming screen = pos + world * zoom)
  const worldX = (cursor.x - state.x) / z0;
  const worldY = (cursor.y - state.y) / z0;

  const nextX = cursor.x - worldX * z1;
  const nextY = cursor.y - worldY * z1;

  return { x: nextX, y: nextY, zoom: z1 };
}

export function pan(state: CameraState, delta: { dx: number; dy: number }): CameraState {
  return { ...state, x: state.x + delta.dx * CAMERA.PAN_SPEED, y: state.y + delta.dy * CAMERA.PAN_SPEED };
}

export type CameraController = {
  /** Applies the current camera state to the world container. */
  apply: () => void;
  /** Reset camera back to default (animated). */
  reset: () => void;
  /** Update the "home" position used by reset (typically screen center). */
  setHome: (home: { x: number; y: number }) => void;
  /** Call per-frame with elapsed ms. */
  update: (elapsedMs: number) => void;
  /** Current camera state. */
  getState: () => CameraState;
  /** Set camera state directly (no animation). */
  setState: (next: CameraState) => void;

  /** Start panning; should be wired to the terrain pointerdown. */
  onPanDown: (e: FederatedPointerEvent) => void;
  /** Continue panning; wire to stage pointermove. */
  onPanMove: (e: FederatedPointerEvent) => void;
  /** End panning; wire to stage pointerup/pointerupoutside. */
  onPanUp: (e: FederatedPointerEvent) => void;

  /** Detach DOM listeners. */
  destroy: () => void;
};

export type CameraControllerOptions = {
  world: Container;
  canvas: HTMLCanvasElement;
  /** Called when we should enable/disable cursor style. */
  setCursor?: (cursor: string) => void;
  /** For double-click reset on terrain. */
  onDoubleClick?: () => void;
};

type ResetAnim = {
  t: number;
  from: CameraState;
  to: CameraState;
};

export function createCameraController(opts: CameraControllerOptions): CameraController {
  // Home is typically the screen center; used by reset.
  let home = { x: opts.world.position.x, y: opts.world.position.y };

  let state: CameraState = { x: home.x, y: home.y, zoom: opts.world.scale.x };

  let resetAnim: ResetAnim | null = null;
  let isPanning = false;
  let lastPointer: { x: number; y: number } | null = null;

  function apply() {
    opts.world.position.set(state.x, state.y);
    opts.world.scale.set(state.zoom);
  }

  function setState(next: CameraState) {
    state = next;
    resetAnim = null;
    apply();
  }

  function reset() {
    resetAnim = {
      t: 0,
      from: { ...state },
      to: { x: home.x, y: home.y, zoom: 1 }
    };
  }

  function setHome(nextHome: { x: number; y: number }) {
    home = { ...nextHome };
  }

  function update(elapsedMs: number) {
    if (!resetAnim) return;
    resetAnim.t += elapsedMs;
    const t = clamp(resetAnim.t / CAMERA.RESET_MS, 0, 1);
    // smoothstep
    const tt = t * t * (3 - 2 * t);
    state = {
      x: lerp(resetAnim.from.x, resetAnim.to.x, tt),
      y: lerp(resetAnim.from.y, resetAnim.to.y, tt),
      zoom: lerp(resetAnim.from.zoom, resetAnim.to.zoom, tt)
    };
    apply();
    if (t >= 1) resetAnim = null;
  }

  function toCanvasPoint(evt: WheelEvent | PointerEvent): { x: number; y: number } {
    const rect = opts.canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (opts.canvas.width / rect.width),
      y: (evt.clientY - rect.top) * (opts.canvas.height / rect.height)
    };
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    const nextZoom = clamp(state.zoom + dir * CAMERA.ZOOM_STEP, CAMERA.MIN_ZOOM, CAMERA.MAX_ZOOM);
    const cursor = toCanvasPoint(e);
    state = zoomToCursor(state, cursor, nextZoom);
    apply();
  }

  function onPanDown(e: FederatedPointerEvent) {
    // Only start panning when primary button.
    if ((e as unknown as { button?: number }).button !== 0) return;
    isPanning = true;
    lastPointer = { x: e.clientX, y: e.clientY };
    opts.setCursor?.('grabbing');
  }

  function onPanMove(e: FederatedPointerEvent) {
    if (!isPanning || !lastPointer) return;
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    lastPointer = { x: e.clientX, y: e.clientY };
    state = pan(state, { dx, dy });
    apply();
  }

  function onPanUp(_e: FederatedPointerEvent) {
    if (!isPanning) return;
    isPanning = false;
    lastPointer = null;
    opts.setCursor?.('grab');
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Home') {
      e.preventDefault();
      reset();
    }
  }

  // wire listeners
  opts.canvas.addEventListener('wheel', onWheel, { passive: false });
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKeyDown);

  // Optional: double-click reset (wired to terrain by main, but keep DOM fallback)
  let lastClick = 0;
  opts.canvas.addEventListener('click', () => {
    const now = performance.now();
    if (now - lastClick < 280) opts.onDoubleClick?.();
    lastClick = now;
  });

  return {
    apply,
    reset,
    setHome,
    update,
    getState: () => state,
    setState,
    onPanDown,
    onPanMove,
    onPanUp,
    destroy: () => {
      opts.canvas.removeEventListener('wheel', onWheel);
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeyDown);
    }
  };
}

export const __test = { zoomToCursor, pan };
