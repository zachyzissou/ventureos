/**
 * Agent Detail Panel Renderer — Phase 5.7
 *
 * Screen-space overlay panel that opens when an agent is clicked.
 * Shows agent identity, health status, metrics, economy, sessions,
 * and provides action buttons (pause/resume, config).
 *
 * Renders as a PixiJS Container positioned relative to the viewport
 * (not world-space, so it doesn't move with camera).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { AGENT_COLORS, AGENT_ORDER } from '@/config';
import type { AgentId } from '@/config';
import type { AgentDetailData } from '@/interaction/types';
import type { EventBus } from '@/interaction/event-bus';

export type AgentDetailPanelLayer = {
  container: Container;
  /** Show the panel for a specific agent. */
  show: (data: AgentDetailData) => void;
  /** Hide / close the panel. */
  hide: () => void;
  /** Update agent data while panel is open. */
  updateData: (data: AgentDetailData) => void;
  /** Set viewport size for positioning. */
  setViewport: (width: number, height: number) => void;
  /** Per-frame animation. */
  update: (elapsedMs: number) => void;
  /** Is the panel currently visible? */
  isVisible: () => boolean;
  /** Which agent is shown (null if hidden). */
  currentAgent: () => AgentId | null;
  /** Called when pause/resume action text is clicked. */
  onTogglePauseResume: (callback: (agentId: AgentId, paused: boolean) => void) => void;
  /** Called when spawn mission action text is clicked. */
  onSpawnMission: (callback: (agentId: AgentId) => void) => void;
};

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const PANEL_WIDTH = 320;
const PANEL_PADDING = 16;
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 44;
const SECTION_GAP = 12;
const CORNER_RADIUS = 8;
const ANIM_SPEED = 0.008; // alpha per ms

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const STATUS_LABELS: Record<string, string> = {
  green: '● Healthy',
  yellow: '◐ Degraded',
  red: '○ Critical',
};

const STATUS_COLORS: Record<string, number> = {
  green: 0x39e58c,
  yellow: 0xffc247,
  red: 0xff3b3b,
};

const STATE_LABELS: Record<string, string> = {
  IDLE: 'Idle',
  ACTIVE: 'Active',
  OVERLOADED: 'Overloaded',
  ERROR: 'Error',
};

// ═══════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════

export function createAgentDetailPanel(eventBus?: EventBus): AgentDetailPanelLayer {
  const container = new Container();
  container.visible = false;
  container.alpha = 0;
  container.zIndex = 1000;

  let visible = false;
  let targetAlpha = 0;
  let currentData: AgentDetailData | null = null;
  let vpWidth = 1920;
  let vpHeight = 1080;

  // Background
  const bg = new Graphics();
  container.addChild(bg);

  // Close hit area (top-right X)
  const closeBtn = new Container();
  closeBtn.eventMode = 'static';
  closeBtn.cursor = 'pointer';
  const closeGfx = new Graphics();
  const closeTxt = new Text({ text: '✕', style: { fontSize: 18, fill: 0xffffff, fontFamily } });
  closeTxt.anchor.set(0.5, 0.5);
  closeBtn.addChild(closeGfx, closeTxt);
  closeBtn.on('pointertap', () => {
    hide();
    eventBus?.emit({ type: 'panel:close', timestamp: performance.now() });
  });
  container.addChild(closeBtn);

  // Header
  const headerText = new Text({ text: '', style: { fontSize: 18, fontWeight: 'bold', fill: 0xffffff, fontFamily } });
  headerText.position.set(PANEL_PADDING, PANEL_PADDING);
  container.addChild(headerText);

  // Status badge
  const statusText = new Text({ text: '', style: { fontSize: 13, fill: 0x39e58c, fontFamily } });
  statusText.position.set(PANEL_PADDING, PANEL_PADDING + 26);
  container.addChild(statusText);

  // Metrics lines
  const maxMetricLines = 12;
  const metricTexts: Text[] = [];
  for (let i = 0; i < maxMetricLines; i++) {
    const t = new Text({ text: '', style: { fontSize: 12, fill: 0xcccccc, fontFamily } });
    t.position.set(PANEL_PADDING, 0);
    container.addChild(t);
    metricTexts.push(t);
  }

  let togglePauseResumeCallback: ((agentId: AgentId, paused: boolean) => void) | null = null;
  let spawnMissionCallback: ((agentId: AgentId) => void) | null = null;

  // Pause/Resume control (text-based)
  const actionText = new Text({ text: '', style: { fontSize: 13, fill: 0x00d4ff, fontFamily } });
  actionText.eventMode = 'static';
  actionText.cursor = 'pointer';
  actionText.on('pointertap', () => {
    if (!currentData || currentData.id === 'nexus') return;
    togglePauseResumeCallback?.(currentData.id, currentData.paused);
  });
  container.addChild(actionText);

  // Spawn mission action
  const missionText = new Text({ text: '', style: { fontSize: 13, fill: 0xffd700, fontFamily } });
  missionText.eventMode = 'static';
  missionText.cursor = 'pointer';
  missionText.on('pointertap', () => {
    if (!currentData || currentData.id === 'nexus') return;
    spawnMissionCallback?.(currentData.id);
  });
  container.addChild(missionText);

  function drawBackground(height: number) {
    bg.clear();
    bg.roundRect(0, 0, PANEL_WIDTH, height, CORNER_RADIUS)
      .fill({ color: 0x0a0a1a, alpha: 0.92 });
    bg.roundRect(0, 0, PANEL_WIDTH, height, CORNER_RADIUS)
      .stroke({ width: 1, color: 0x333366, alpha: 0.6 });
  }

  function layout() {
    // Position panel on the right side of the viewport
    const margin = 20;
    container.position.set(vpWidth - PANEL_WIDTH - margin, margin);
  }

  function renderContent(data: AgentDetailData) {
    const agentColor = AGENT_COLORS[data.id] ?? 0x00d4ff;

    // Header
    headerText.text = data.id.toUpperCase();
    headerText.style.fill = agentColor;

    // Status
    const stateLabel = STATE_LABELS[data.state] ?? data.state;
    const healthLabel = STATUS_LABELS[data.healthStatus] ?? data.healthStatus;
    statusText.text = `${stateLabel} — ${healthLabel}`;
    statusText.style.fill = STATUS_COLORS[data.healthStatus] ?? 0xcccccc;

    // Metrics section
    let lineIdx = 0;
    const metricsY = HEADER_HEIGHT + 28;

    const lines: string[] = [
      `─── Performance ───`,
      `CPU:     ${(data.metrics.cpuUsage * 100).toFixed(1)}%`,
      `Memory:  ${(data.metrics.memoryUsage * 100).toFixed(1)}%`,
      `Latency: ${data.metrics.latencyMs.toFixed(0)}ms`,
      `RPS:     ${data.metrics.requestsPerSec.toFixed(1)}`,
      `Errors:  ${(data.metrics.errorRate * 100).toFixed(2)}%`,
      ``,
      `─── Status ───`,
      `Sessions: ${data.sessions}`,
      `Uptime:   ${data.uptimeStr}`,
      `Network:  ${data.connectivity}`,
      data.paused ? '⏸ PAUSED' : '',
    ];

    for (let i = 0; i < maxMetricLines; i++) {
      const t = metricTexts[i];
      if (i < lines.length) {
        t.text = lines[i];
        t.visible = true;
        t.position.y = metricsY + i * ROW_HEIGHT;

        // Highlight section headers
        if (lines[i].startsWith('───')) {
          t.style.fill = agentColor;
          t.style.fontSize = 11;
        } else if (lines[i] === '⏸ PAUSED') {
          t.style.fill = 0xff9500;
          t.style.fontSize = 13;
        } else {
          t.style.fill = 0xcccccc;
          t.style.fontSize = 12;
        }
      } else {
        t.visible = false;
      }
      lineIdx = i;
    }

    // Economy info (if available)
    if (data.economy) {
      const ecoLine = `Budget: ${((data.economy.usageRatio) * 100).toFixed(1)}% used`;
      if (lineIdx < maxMetricLines - 1) {
        lineIdx++;
        const t = metricTexts[lineIdx];
        t.text = ecoLine;
        t.visible = true;
        t.position.y = metricsY + lineIdx * ROW_HEIGHT;
        t.style.fill = data.economy.health === 'red' ? 0xff3b3b : data.economy.health === 'yellow' ? 0xffc247 : 0xcccccc;
        t.style.fontSize = 12;
      }
    }

    // Action controls
    const actionY = metricsY + (lineIdx + 2) * ROW_HEIGHT;
    const canControl = data.id !== 'nexus';

    if (canControl) {
      actionText.text = data.paused ? '[▶ Resume]' : '[⏸ Pause]';
      actionText.position.set(PANEL_PADDING, actionY);
      actionText.visible = true;

      missionText.text = '[⚔ Spawn Mission]';
      missionText.position.set(PANEL_PADDING + 130, actionY);
      missionText.visible = true;
    } else {
      actionText.visible = false;
      missionText.visible = false;
    }

    // Background
    const totalHeight = actionY + ROW_HEIGHT + PANEL_PADDING;
    drawBackground(totalHeight);

    // Close button
    closeBtn.position.set(PANEL_WIDTH - 30, 10);
    closeTxt.position.set(10, 10);
  }

  function show(data: AgentDetailData) {
    currentData = data;
    visible = true;
    targetAlpha = 1;
    container.visible = true;
    renderContent(data);
    layout();
  }

  function hide() {
    visible = false;
    targetAlpha = 0;
    currentData = null;
  }

  function updateData(data: AgentDetailData) {
    if (!visible) return;
    currentData = data;
    renderContent(data);
  }

  function setViewport(width: number, height: number) {
    vpWidth = width;
    vpHeight = height;
    layout();
  }

  function update(elapsedMs: number) {
    // Animate alpha
    if (container.alpha < targetAlpha) {
      container.alpha = Math.min(1, container.alpha + ANIM_SPEED * elapsedMs);
    } else if (container.alpha > targetAlpha) {
      container.alpha = Math.max(0, container.alpha - ANIM_SPEED * elapsedMs);
      if (container.alpha <= 0) {
        container.visible = false;
      }
    }
  }

  return {
    container,
    show,
    hide,
    updateData,
    setViewport,
    update,
    isVisible: () => visible,
    currentAgent: () => currentData?.id ?? null,
    onTogglePauseResume: (callback) => {
      togglePauseResumeCallback = callback;
    },
    onSpawnMission: (callback) => {
      spawnMissionCallback = callback;
    },
  };
}
