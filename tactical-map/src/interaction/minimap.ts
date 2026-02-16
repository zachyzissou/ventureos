/**
 * Phase 5.7 — Minimap
 *
 * Small overview map in the bottom-right corner showing agent positions
 * as colored dots and the current camera viewport rectangle.
 * Clicking on the minimap navigates the camera.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { AGENT_ORDER, AGENTS, MINIMAP, AGENT_COLORS, FEATURES } from '@/config';
import type { AgentId, Point } from '@/config';
import type { Store } from '@/state/store';
import type { SelectionState } from '@/state/types';
import type { AgentStatus } from '@/health/types';
import type { CameraState } from '@/interaction/camera';

const STATUS_DOT_COLORS: Record<AgentStatus, number> = {
  healthy: 0x39e58c,
  degraded: 0xffc247,
  unhealthy: 0xff3b3b,
  offline: 0x555555
};

export type MinimapLayer = {
  container: Container;
  setViewport: (width: number, height: number) => void;
  setCameraState: (state: CameraState) => void;
  setAgentStatuses: (statuses: Record<string, AgentStatus>) => void;
  setVisible: (visible: boolean) => void;
  isVisible: () => boolean;
  /** Returns a callback that should be called when the minimap is clicked. */
  onNavigate: (cb: (worldX: number, worldY: number) => void) => void;
  update: (elapsedMs: number) => void;
  destroy: () => void;
};

export function createMinimap(
  selectionStore: Store<SelectionState>
): MinimapLayer {
  const container = new Container();
  container.visible = FEATURES.MINIMAP;
  container.zIndex = 80;

  const size = MINIMAP.SIZE;
  const extent = MINIMAP.WORLD_EXTENT;
  const scale = size / (extent * 2); // world → minimap scale

  let viewportW = 1920;
  let viewportH = 1080;
  let cameraState: CameraState = { x: 0, y: 0, zoom: 1 };
  let agentStatuses: Record<string, AgentStatus> = {};
  let selectedId: AgentId | null = null;
  let navigateCb: ((wx: number, wy: number) => void) | null = null;
  let visible: boolean = FEATURES.MINIMAP;

  // Background
  const bg = new Graphics();
  container.addChild(bg);

  // Agent dots
  const dotsContainer = new Container();
  container.addChild(dotsContainer);

  const agentDots = new Map<AgentId, Graphics>();
  for (const id of AGENT_ORDER) {
    const dot = new Graphics();
    agentDots.set(id, dot);
    dotsContainer.addChild(dot);
  }

  // Nexus indicator (center)
  const nexusDot = new Graphics();
  dotsContainer.addChild(nexusDot);

  // Camera viewport rect
  const viewportRect = new Graphics();
  container.addChild(viewportRect);

  // Label
  const label = new Text({
    text: 'MINIMAP',
    style: {
      fontSize: 8,
      fill: 0x888888,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    }
  });
  label.anchor.set(0.5, 0);
  container.addChild(label);

  // Hit area for clicking
  const hitArea = new Graphics();
  hitArea.rect(0, 0, size, size).fill({ color: 0x000000, alpha: 0.001 });
  hitArea.eventMode = 'static';
  hitArea.cursor = 'crosshair';
  container.addChild(hitArea);

  hitArea.on('pointertap', (e) => {
    if (!navigateCb) return;
    // Convert minimap coords to world coords
    const local = container.toLocal(e.global);
    const worldX = (local.x - size / 2) / scale;
    const worldY = (local.y - size / 2) / scale;
    navigateCb(worldX, worldY);
  });

  const unsub = selectionStore.subscribe((s) => {
    selectedId = s.selectedId;
  });

  function redraw() {
    // Background
    bg.clear();
    bg.roundRect(0, 0, size, size, 4)
      .fill({ color: MINIMAP.BG_COLOR, alpha: MINIMAP.BG_ALPHA });
    bg.roundRect(0, 0, size, size, 4)
      .stroke({ width: 1, color: MINIMAP.BORDER_COLOR, alpha: MINIMAP.BORDER_ALPHA });

    // Nexus at center
    nexusDot.clear();
    nexusDot.circle(size / 2, size / 2, 3).fill({ color: 0xffd700, alpha: 0.9 });

    // Agent dots
    for (let i = 0; i < AGENT_ORDER.length; i++) {
      const id = AGENT_ORDER[i];
      const dot = agentDots.get(id);
      if (!dot) continue;

      const worldPos = id === 'nexus' ? { x: 0, y: 0 } : (AGENTS.POSITIONS[i] ?? { x: 0, y: 0 });
      const mx = size / 2 + worldPos.x * scale;
      const my = size / 2 + worldPos.y * scale;

      const isSelected = id === selectedId;
      const r = isSelected ? MINIMAP.SELECTED_DOT_RADIUS : MINIMAP.DOT_RADIUS;

      const status = agentStatuses[id];
      const color = status ? (STATUS_DOT_COLORS[status] ?? AGENT_COLORS[id]) : AGENT_COLORS[id];

      dot.clear();
      dot.circle(mx, my, r).fill({ color, alpha: 0.9 });

      if (isSelected) {
        dot.circle(mx, my, r + 2).stroke({ width: 1, color: 0xffd700, alpha: 0.8 });
      }
    }

    // Camera viewport rectangle
    viewportRect.clear();

    // Camera state: world container is at (cameraState.x, cameraState.y) with zoom.
    // The visible world region is:
    //   world_left = -cameraState.x / cameraState.zoom
    //   world_top  = -cameraState.y / cameraState.zoom
    //   world_w    = viewportW / cameraState.zoom
    //   world_h    = viewportH / cameraState.zoom
    const zoom = cameraState.zoom || 1;
    const wLeft = -cameraState.x / zoom;
    const wTop = -cameraState.y / zoom;
    const wW = viewportW / zoom;
    const wH = viewportH / zoom;

    const rx = size / 2 + wLeft * scale;
    const ry = size / 2 + wTop * scale;
    const rw = wW * scale;
    const rh = wH * scale;

    viewportRect.rect(rx, ry, rw, rh).stroke({
      width: 1,
      color: MINIMAP.VIEWPORT_COLOR,
      alpha: MINIMAP.VIEWPORT_ALPHA
    });

    // Label
    label.position.set(size / 2, size + 3);
  }

  function setViewport(w: number, h: number) {
    viewportW = w;
    viewportH = h;
    container.position.set(
      viewportW - size - MINIMAP.MARGIN,
      viewportH - size - MINIMAP.MARGIN - 20
    );
  }

  function setCameraState(state: CameraState) {
    cameraState = state;
  }

  function setAgentStatuses(statuses: Record<string, AgentStatus>) {
    agentStatuses = statuses;
  }

  function setVisible(v: boolean) {
    visible = v;
    container.visible = v && FEATURES.MINIMAP;
  }

  function onNavigate(cb: (worldX: number, worldY: number) => void) {
    navigateCb = cb;
  }

  function update(_elapsedMs: number) {
    if (!container.visible) return;
    redraw();
  }

  function destroy() {
    unsub();
  }

  return {
    container,
    setViewport,
    setCameraState,
    setAgentStatuses,
    setVisible,
    isVisible: () => visible,
    onNavigate,
    update,
    destroy
  };
}
