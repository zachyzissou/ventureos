/**
 * Health Indicators Renderer — Phase 5.6
 *
 * Per-agent health status rings with color coding (green/yellow/red),
 * error state pulsing animation, and connectivity status icons.
 * Sits as a world-space layer around each agent building.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { AGENT_ORDER } from '@/config';
import type { AgentId, Point } from '@/config';
import { clamp01 } from '@/utils/color';
import type { ConnectivityStatus, HealthStatus } from '@/health/types';

export type HealthIndicatorsLayer = {
  container: Container;
  setAgentHealth: (
    agentId: AgentId,
    pos: Point,
    status: HealthStatus,
    connectivity: ConnectivityStatus,
    cpuUsage: number,
    memoryUsage: number,
    latencyMs: number
  ) => void;
  update: (elapsedMs: number) => void;
  /** Test/dev visibility. */
  getDrawStats: () => { redraws: number };
};

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const INDICATOR_RING_RADIUS = 56;
const INDICATOR_RING_WIDTH = 3;
const CONNECTIVITY_ICON_OFFSET_X = 44;
const CONNECTIVITY_ICON_OFFSET_Y = -52;
const METRIC_LABEL_OFFSET_Y = 78;

const STATUS_COLORS: Record<HealthStatus, number> = {
  green: 0x39e58c,
  yellow: 0xffc247,
  red: 0xff3b3b,
};

const CONNECTIVITY_ICONS: Record<ConnectivityStatus, string> = {
  online: '●',
  degraded: '◐',
  offline: '○',
};

const CONNECTIVITY_COLORS: Record<ConnectivityStatus, number> = {
  online: 0x39e58c,
  degraded: 0xffc247,
  offline: 0xff3b3b,
};

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

type AgentIndicatorView = {
  container: Container;
  ring: Graphics;
  connectivityIcon: Text;
  metricLabel: Text;
  status: HealthStatus;
  connectivity: ConnectivityStatus;
  pulsePhase: number;
  errorPulsePhase: number;
  signature: string;
  dirty: boolean;
};

// ═══════════════════════════════════════════
// Layer factory
// ═══════════════════════════════════════════

export function createHealthIndicatorsLayer(): HealthIndicatorsLayer {
  const container = new Container();
  const views = new Map<AgentId, AgentIndicatorView>();

  let stats = { redraws: 0 };

  const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

  for (const id of AGENT_ORDER) {
    const agentContainer = new Container();
    const ring = new Graphics();
    const connectivityIcon = new Text({
      text: '●',
      style: { fontSize: 12, fill: 0x39e58c, fontFamily },
    });
    connectivityIcon.anchor.set(0.5, 0.5);

    const metricLabel = new Text({
      text: '',
      style: { fontSize: 9, fill: 0xcccccc, align: 'center', fontFamily },
    });
    metricLabel.anchor.set(0.5, 0);

    agentContainer.addChild(ring, connectivityIcon, metricLabel);
    container.addChild(agentContainer);

    views.set(id, {
      container: agentContainer,
      ring,
      connectivityIcon,
      metricLabel,
      status: 'green',
      connectivity: 'online',
      pulsePhase: Math.random() * Math.PI * 2,
      errorPulsePhase: 0,
      signature: '',
      dirty: false,
    });
  }

  function redraw(view: AgentIndicatorView) {
    const color = STATUS_COLORS[view.status];
    const alpha = view.status === 'green' ? 0.6 : 0.9;

    view.ring.clear();

    // Background ring (dim)
    view.ring
      .circle(0, 0, INDICATOR_RING_RADIUS)
      .stroke({ width: INDICATOR_RING_WIDTH, color: 0x1a2a3a, alpha: 0.4 });

    // Health status ring
    view.ring
      .circle(0, 0, INDICATOR_RING_RADIUS)
      .stroke({ width: INDICATOR_RING_WIDTH, color, alpha });

    // Connectivity icon
    view.connectivityIcon.text = CONNECTIVITY_ICONS[view.connectivity];
    view.connectivityIcon.style.fill = CONNECTIVITY_COLORS[view.connectivity];
    view.connectivityIcon.position.set(CONNECTIVITY_ICON_OFFSET_X, CONNECTIVITY_ICON_OFFSET_Y);

    stats.redraws++;
    view.dirty = false;
  }

  function setAgentHealth(
    agentId: AgentId,
    pos: Point,
    status: HealthStatus,
    connectivity: ConnectivityStatus,
    cpuUsage: number,
    memoryUsage: number,
    latencyMs: number
  ) {
    const view = views.get(agentId);
    if (!view) return;

    view.container.position.set(pos.x, pos.y);

    const sig = `${status}:${connectivity}:${cpuUsage.toFixed(2)}:${memoryUsage.toFixed(2)}:${Math.round(latencyMs)}`;
    if (sig !== view.signature) {
      view.status = status;
      view.connectivity = connectivity;
      view.signature = sig;
      view.dirty = true;

      // Update metric label
      const cpu = `${Math.round(clamp01(cpuUsage) * 100)}%`;
      const mem = `${Math.round(clamp01(memoryUsage) * 100)}%`;
      const lat = latencyMs < 1000 ? `${Math.round(latencyMs)}ms` : `${(latencyMs / 1000).toFixed(1)}s`;
      view.metricLabel.text = `CPU ${cpu} | MEM ${mem} | ${lat}`;
      view.metricLabel.position.set(0, METRIC_LABEL_OFFSET_Y);
    }
  }

  function update(elapsedMs: number) {
    const dt = elapsedMs / 1000;

    for (const view of views.values()) {
      if (view.dirty) redraw(view);

      // Error pulsing animation (red status = pulsing ring)
      if (view.status === 'red') {
        view.errorPulsePhase += dt * 6;
        const pulse = 0.5 + Math.sin(view.errorPulsePhase) * 0.5;
        view.ring.alpha = 0.5 + pulse * 0.5;
      } else if (view.status === 'yellow') {
        view.pulsePhase += dt * 3;
        const pulse = 0.7 + Math.sin(view.pulsePhase) * 0.3;
        view.ring.alpha = pulse;
      } else {
        view.ring.alpha = 1;
      }

      // Connectivity icon blink for offline
      if (view.connectivity === 'offline') {
        view.errorPulsePhase += dt * 4;
        view.connectivityIcon.alpha = 0.3 + Math.abs(Math.sin(view.errorPulsePhase)) * 0.7;
      } else {
        view.connectivityIcon.alpha = 1;
      }
    }
  }

  return {
    container,
    setAgentHealth,
    update,
    getDrawStats: () => ({ ...stats }),
  };
}
