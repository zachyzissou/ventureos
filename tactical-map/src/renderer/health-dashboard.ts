/**
 * Health Dashboard Renderer — Phase 5.6
 *
 * System-wide health dashboard panel showing:
 * - Overall system health score
 * - Per-agent health grid
 * - Aggregate performance metrics
 * - Connectivity matrix
 *
 * Renders as a screen-space overlay panel.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { AGENT_ORDER } from '@/config';
import type { AgentId } from '@/config';
import { clamp01 } from '@/utils/color';
import {
  formatCpu,
  formatErrorRate,
  formatLatency,
  formatMemory,
  formatRps,
  formatUptime,
  computeHealthScore,
  computeSystemHealthScore,
} from '@/health/metrics';
import type { ConnectivityStatus, HealthState, HealthStatus } from '@/health/types';

export type HealthDashboardLayer = {
  container: Container;
  setViewport: (width: number, height: number) => void;
  setHealthState: (state: HealthState) => void;
  setVisible: (visible: boolean) => void;
  update: (elapsedMs: number) => void;
  /** Test access. */
  isVisible: () => boolean;
};

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const PANEL_WIDTH = 340;
const PANEL_PADDING = 12;
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 40;
const AGENT_GRID_TOP = 80;
const METRICS_TOP_OFFSET = 20;

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const STATUS_COLORS: Record<HealthStatus, number> = {
  green: 0x39e58c,
  yellow: 0xffc247,
  red: 0xff3b3b,
};

const CONNECTIVITY_SYMBOLS: Record<ConnectivityStatus, string> = {
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

type AgentRow = {
  container: Container;
  dot: Graphics;
  nameText: Text;
  statusText: Text;
  connectivityText: Text;
  metricsText: Text;
};

// ═══════════════════════════════════════════
// Layer factory
// ═══════════════════════════════════════════

export function createHealthDashboard(): HealthDashboardLayer {
  const container = new Container();
  container.visible = false;

  // Panel background
  const bg = new Graphics();
  container.addChild(bg);

  // Title
  const title = new Text({
    text: 'System Health',
    style: { fontSize: 15, fill: 0xffffff, fontWeight: 'bold', fontFamily },
  });
  container.addChild(title);

  // System score
  const scoreText = new Text({
    text: 'Score: 100',
    style: { fontSize: 13, fill: 0x39e58c, fontFamily },
  });
  container.addChild(scoreText);

  // System status summary
  const summaryText = new Text({
    text: '8 online | 0 issues',
    style: { fontSize: 11, fill: 0xaabbcc, fontFamily },
  });
  container.addChild(summaryText);

  // Column headers
  const headerBg = new Graphics();
  container.addChild(headerBg);

  const colHeaders = new Text({
    text: 'Agent        Status   Conn    CPU   MEM   Latency',
    style: { fontSize: 9, fill: 0x88aacc, fontFamily },
  });
  container.addChild(colHeaders);

  // Agent rows
  const agentRows = new Map<AgentId, AgentRow>();
  const rowsContainer = new Container();
  container.addChild(rowsContainer);

  for (let i = 0; i < AGENT_ORDER.length; i++) {
    const id = AGENT_ORDER[i];
    const rowContainer = new Container();

    const dot = new Graphics();
    dot.circle(0, 0, 4).fill({ color: 0x39e58c });

    const nameText = new Text({
      text: id.charAt(0).toUpperCase() + id.slice(1),
      style: { fontSize: 10, fill: 0xffffff, fontFamily },
    });

    const statusText = new Text({
      text: 'green',
      style: { fontSize: 10, fill: 0x39e58c, fontFamily },
    });

    const connectivityText = new Text({
      text: '●',
      style: { fontSize: 10, fill: 0x39e58c, fontFamily },
    });

    const metricsText = new Text({
      text: '0%  0%  0ms',
      style: { fontSize: 9, fill: 0xaabbcc, fontFamily },
    });

    rowContainer.addChild(dot, nameText, statusText, connectivityText, metricsText);
    rowsContainer.addChild(rowContainer);

    agentRows.set(id, {
      container: rowContainer,
      dot,
      nameText,
      statusText,
      connectivityText,
      metricsText,
    });
  }

  // Aggregate metrics section
  const aggregateTitle = new Text({
    text: 'Aggregate Metrics',
    style: { fontSize: 11, fill: 0x88aacc, fontFamily },
  });
  container.addChild(aggregateTitle);

  const aggregateText = new Text({
    text: '',
    style: { fontSize: 10, fill: 0xdddddd, fontFamily },
  });
  container.addChild(aggregateText);

  let viewportW = 1920;
  let viewportH = 1080;
  let dirty = true;
  let currentState: HealthState | null = null;

  function layoutPanel() {
    const panelH = AGENT_GRID_TOP + AGENT_ORDER.length * ROW_HEIGHT + 80;
    const x = PANEL_PADDING;
    const y = Math.max(50, Math.round(viewportH * 0.06));

    container.position.set(x, y);

    bg.clear();
    bg
      .roundRect(0, 0, PANEL_WIDTH, panelH, 8)
      .fill({ color: 0x05070d, alpha: 0.82 })
      .stroke({ width: 1, color: 0x2d507a, alpha: 0.55 });

    title.position.set(PANEL_PADDING, PANEL_PADDING);
    scoreText.position.set(PANEL_WIDTH - 80, PANEL_PADDING + 2);
    summaryText.position.set(PANEL_PADDING, PANEL_PADDING + 24);

    // Column headers
    const headerY = AGENT_GRID_TOP - 16;
    headerBg.clear();
    headerBg
      .rect(0, headerY - 2, PANEL_WIDTH, 14)
      .fill({ color: 0x0a1020, alpha: 0.5 });
    colHeaders.position.set(PANEL_PADDING + 12, headerY);

    // Agent rows
    for (let i = 0; i < AGENT_ORDER.length; i++) {
      const id = AGENT_ORDER[i];
      const row = agentRows.get(id);
      if (!row) continue;

      const rowY = AGENT_GRID_TOP + i * ROW_HEIGHT;
      row.container.position.set(PANEL_PADDING, rowY);

      row.dot.position.set(4, ROW_HEIGHT / 2 - 1);
      row.nameText.position.set(14, 3);
      row.statusText.position.set(95, 3);
      row.connectivityText.position.set(145, 3);
      row.metricsText.position.set(170, 4);
    }

    // Aggregate section
    const aggY = AGENT_GRID_TOP + AGENT_ORDER.length * ROW_HEIGHT + METRICS_TOP_OFFSET;
    aggregateTitle.position.set(PANEL_PADDING, aggY);
    aggregateText.position.set(PANEL_PADDING, aggY + 16);

    dirty = true;
  }

  function redraw() {
    if (!currentState) return;

    const score = computeSystemHealthScore(currentState);
    const sys = currentState.system;

    // Score
    scoreText.text = `Score: ${score}`;
    scoreText.style.fill =
      score >= 80 ? 0x39e58c : score >= 50 ? 0xffc247 : 0xff3b3b;

    // Summary
    const onlineCount = sys.connectivitySummary.online;
    const issueCount = sys.statusCounts.yellow + sys.statusCounts.red;
    summaryText.text = `${onlineCount} online | ${issueCount} issue${issueCount !== 1 ? 's' : ''}`;
    summaryText.style.fill = issueCount > 0 ? 0xffc247 : 0xaabbcc;

    // Agent rows
    for (const id of AGENT_ORDER) {
      const row = agentRows.get(id);
      if (!row) continue;

      const agent = currentState.agents[id];
      const color = STATUS_COLORS[agent.status];

      row.dot.clear();
      row.dot.circle(0, 0, 4).fill({ color });

      row.statusText.text = agent.status;
      row.statusText.style.fill = color;

      row.connectivityText.text = CONNECTIVITY_SYMBOLS[agent.connectivity];
      row.connectivityText.style.fill = CONNECTIVITY_COLORS[agent.connectivity];

      const cpu = formatCpu(agent.metrics.cpuUsage);
      const mem = formatMemory(agent.metrics.memoryUsage);
      const lat = formatLatency(agent.metrics.latencyMs);
      row.metricsText.text = `${cpu}  ${mem}  ${lat}`;
    }

    // Aggregate
    const agg = sys.aggregateMetrics;
    aggregateText.text = [
      `CPU: ${formatCpu(agg.cpuUsage)}  Memory: ${formatMemory(agg.memoryUsage)}`,
      `Latency: ${formatLatency(agg.latencyMs)}  RPS: ${formatRps(agg.requestsPerSec)}`,
      `Error Rate: ${formatErrorRate(agg.errorRate)}  Uptime: ${formatUptime(agg.uptimeSec)}`,
    ].join('\n');

    dirty = false;
  }

  function setViewport(width: number, height: number) {
    viewportW = width;
    viewportH = height;
    layoutPanel();
  }

  function setHealthState(state: HealthState) {
    currentState = state;
    dirty = true;
  }

  function setVisible(visible: boolean) {
    container.visible = visible;
    if (visible) dirty = true;
  }

  function update(_elapsedMs: number) {
    if (!container.visible) return;
    if (dirty) redraw();
  }

  // Initialize
  layoutPanel();

  return {
    container,
    setViewport,
    setHealthState,
    setVisible,
    update,
    isVisible: () => container.visible,
  };
}
