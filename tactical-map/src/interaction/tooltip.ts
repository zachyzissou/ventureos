/**
 * Phase 5.7 — Tooltip Overlay
 *
 * Floating tooltip shown when hovering over an agent building.
 * Renders in screen space (added to app.stage, not world).
 * Subscribes to selection store for hovered agent.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { TOOLTIP, COLORS, FEATURES } from '@/config';
import type { AgentId } from '@/config';
import type { Store } from '@/state/store';
import type { SelectionState, BuildingState } from '@/state/types';
import type { AgentHealthState, AgentStatus } from '@/health/types';
import type { MapState } from '@/state/types';
import { sanitizePlainText } from '@/utils/sanitize';

const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const STATUS_DOTS: Record<AgentStatus, { char: string; color: number }> = {
  healthy: { char: '●', color: 0x39e58c },
  degraded: { char: '◐', color: 0xffc247 },
  unhealthy: { char: '●', color: 0xff3b3b },
  offline: { char: '○', color: 0x555555 }
};

export type TooltipOverlay = {
  container: Container;
  /** Call per-frame from ticker. */
  update: (elapsedMs: number) => void;
  /** Provide the world→screen transform so tooltip positions correctly. */
  setWorldTransform: (offsetX: number, offsetY: number, zoom: number) => void;
  /** Provide health data for the hovered agent. */
  setHealthData: (agents: Record<string, AgentHealthState>) => void;
  /** Provide map state for session count. */
  setMapData: (state: MapState) => void;
  destroy: () => void;
};

export function createTooltipOverlay(
  selectionStore: Store<SelectionState>,
  getAgentWorldPos: (id: AgentId) => { x: number; y: number }
): TooltipOverlay {
  const container = new Container();
  container.visible = false;
  container.zIndex = 100;

  const bg = new Graphics();
  const nameText = new Text({ text: '', style: { fontSize: 13, fontWeight: 'bold', fill: 0xffffff, fontFamily: FONT } });
  const statusText = new Text({ text: '', style: { fontSize: 11, fill: 0xaaaaaa, fontFamily: FONT } });
  const cpuLabel = new Text({ text: '', style: { fontSize: 10, fill: 0xaaaaaa, fontFamily: FONT } });
  const cpuBar = new Graphics();
  const memLabel = new Text({ text: '', style: { fontSize: 10, fill: 0xaaaaaa, fontFamily: FONT } });
  const memBar = new Graphics();
  const latencyText = new Text({ text: '', style: { fontSize: 10, fill: 0xaaaaaa, fontFamily: FONT } });
  const sessionsText = new Text({ text: '', style: { fontSize: 10, fill: 0xaaaaaa, fontFamily: FONT } });

  container.addChild(bg, nameText, statusText, cpuLabel, cpuBar, memLabel, memBar, latencyText, sessionsText);

  let hoveredId: AgentId | null = null;
  let showTimer = 0;
  let worldOffsetX = 0;
  let worldOffsetY = 0;
  let worldZoom = 1;
  let healthAgents: Record<string, AgentHealthState> = {};
  let mapState: MapState | null = null;

  const unsub = selectionStore.subscribe((s) => {
    if (s.hoveredId !== hoveredId) {
      hoveredId = s.hoveredId;
      showTimer = 0;
      container.visible = false;
    }
  });

  function drawContent(id: AgentId) {
    const health = healthAgents[id];
    const map = mapState?.agents[id];
    const w = TOOLTIP.WIDTH;
    const pad = TOOLTIP.PADDING;
    let y = pad;

    // Name
    nameText.text = id.toUpperCase();
    nameText.position.set(pad, y);
    y += 18;

    // Status
    if (health) {
      const dot = STATUS_DOTS[health.status] ?? STATUS_DOTS.healthy;
      statusText.text = `${dot.char} ${health.status}`;
      statusText.style.fill = dot.color;
    } else {
      statusText.text = 'No health data';
      statusText.style.fill = 0x888888;
    }
    statusText.position.set(pad, y);
    y += 16;

    // CPU
    const cpuPct = health?.metrics.cpuPercent ?? 0;
    cpuLabel.text = `CPU: ${cpuPct.toFixed(1)}%`;
    cpuLabel.position.set(pad, y);
    cpuBar.clear();
    const barW = w - pad * 2 - 60;
    const barH = 6;
    const barX = w - pad - barW;
    cpuBar.roundRect(barX, y + 2, barW, barH, 2).fill({ color: 0x222233, alpha: 0.8 });
    const cpuFill = Math.min(1, cpuPct / 100);
    const cpuColor = cpuPct > 90 ? 0xff3b3b : cpuPct > 70 ? 0xffc247 : 0x39e58c;
    if (cpuFill > 0) {
      cpuBar.roundRect(barX, y + 2, barW * cpuFill, barH, 2).fill({ color: cpuColor, alpha: 0.9 });
    }
    y += 16;

    // Memory
    const memPct = health && health.metrics.memoryLimitMb > 0
      ? (health.metrics.memoryMb / health.metrics.memoryLimitMb) * 100
      : 0;
    memLabel.text = `MEM: ${memPct.toFixed(0)}%`;
    memLabel.position.set(pad, y);
    memBar.clear();
    memBar.roundRect(barX, y + 2, barW, barH, 2).fill({ color: 0x222233, alpha: 0.8 });
    const memFill = Math.min(1, memPct / 100);
    const memColor = memPct > 90 ? 0xff3b3b : memPct > 75 ? 0xffc247 : 0x39e58c;
    if (memFill > 0) {
      memBar.roundRect(barX, y + 2, barW * memFill, barH, 2).fill({ color: memColor, alpha: 0.9 });
    }
    y += 16;

    // Latency + Req/s
    const lat = health?.metrics.latencyMs ?? 0;
    const rps = health?.metrics.requestsPerSec ?? 0;
    latencyText.text = `Latency: ${Math.round(lat)}ms  Req/s: ${rps.toFixed(1)}`;
    latencyText.position.set(pad, y);
    y += 14;

    // Sessions
    const sessions = map?.sessions ?? 0;
    sessionsText.text = `Sessions: ${sessions}`;
    sessionsText.position.set(pad, y);
    y += 14;

    const h = y + pad;

    // Background
    bg.clear();
    bg.roundRect(0, 0, w, h, 6)
      .fill({ color: TOOLTIP.BG_COLOR, alpha: TOOLTIP.BG_ALPHA });
    bg.roundRect(0, 0, w, h, 6)
      .stroke({ width: 1, color: TOOLTIP.BORDER_COLOR, alpha: TOOLTIP.BORDER_ALPHA });
  }

  function setWorldTransform(ox: number, oy: number, zoom: number) {
    worldOffsetX = ox;
    worldOffsetY = oy;
    worldZoom = zoom;
  }

  function setHealthData(agents: Record<string, AgentHealthState>) {
    healthAgents = agents;
  }

  function setMapData(state: MapState) {
    mapState = state;
  }

  function update(elapsedMs: number) {
    if (!FEATURES.TOOLTIP || !hoveredId) {
      container.visible = false;
      return;
    }

    showTimer += elapsedMs;
    if (showTimer < TOOLTIP.SHOW_DELAY_MS) {
      container.visible = false;
      return;
    }

    drawContent(hoveredId);
    container.visible = true;

    // Position tooltip above the building in screen space
    const worldPos = getAgentWorldPos(hoveredId);
    const screenX = worldOffsetX + worldPos.x * worldZoom;
    const screenY = worldOffsetY + worldPos.y * worldZoom;
    container.position.set(
      screenX - TOOLTIP.WIDTH / 2,
      screenY + TOOLTIP.OFFSET_Y
    );
  }

  function destroy() {
    unsub();
  }

  return { container, update, setWorldTransform, setHealthData, setMapData, destroy };
}
