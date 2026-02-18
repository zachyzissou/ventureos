/**
 * Diagnostics Drill-Down Panel — Issue #205
 *
 * Expandable sub-panel that opens when an agent row is clicked
 * in the health dashboard. Shows:
 * - 4 metric sparklines (CPU, memory, latency, error rate)
 * - Health score gauge
 * - Recent error list
 * - Active alert badges
 *
 * Renders as a PixiJS Container that slides open below the
 * health dashboard panel.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { AgentId } from '@/config';
import { AGENT_COLORS } from '@/config';
import { createSparkline, SPARKLINE_PRESETS } from './sparkline';
import type { SparklineLayer } from './sparkline';

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface DiagnosticsData {
  agentId: AgentId;
  healthScore: number;
  sessionCount: number;
  abortedCount: number;
  successRate: number | null;
  metricsHistory: {
    cpuUsage: number[];
    memoryUsage: number[];
    latencyMs: number[];
    errorRate: number[];
  };
  recentErrors: Array<{
    ts: number;
    message: string;
    level: string;
  }>;
  alerts: Array<{
    severity: 'P0' | 'P1';
    title: string;
    message: string;
  }>;
}

export type DiagnosticsPanelLayer = {
  container: Container;
  /** Show the diagnostics panel for an agent. */
  show: (data: DiagnosticsData) => void;
  /** Hide / close the panel. */
  hide: () => void;
  /** Update data while panel is open. */
  updateData: (data: DiagnosticsData) => void;
  /** Set viewport size for positioning. */
  setViewport: (width: number, height: number) => void;
  /** Per-frame animation. */
  update: (elapsedMs: number) => void;
  /** Is panel visible? */
  isVisible: () => boolean;
  /** Currently displayed agent. */
  currentAgent: () => AgentId | null;
  /** Register close callback. */
  onClose: (callback: () => void) => void;
};

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const PANEL_WIDTH = 340;
const PANEL_PADDING = 12;
const SPARKLINE_WIDTH = 130;
const SPARKLINE_HEIGHT = 28;
const SPARKLINE_GAP = 44;
const SECTION_GAP = 14;
const ERROR_ROW_HEIGHT = 16;
const MAX_VISIBLE_ERRORS = 5;
const ANIM_SPEED = 0.006; // alpha per ms

const SEVERITY_COLORS = {
  P0: 0xff3b3b,
  P1: 0xffc247,
};

// ═══════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════

export function createDiagnosticsPanel(): DiagnosticsPanelLayer {
  const container = new Container();
  container.visible = false;
  container.alpha = 0;
  container.zIndex = 999;

  let visible = false;
  let targetAlpha = 0;
  let currentData: DiagnosticsData | null = null;
  let vpWidth = 1920;
  let vpHeight = 1080;
  let closeCallback: (() => void) | null = null;

  // Background
  const bg = new Graphics();
  container.addChild(bg);

  // Header
  const headerText = new Text({
    text: '',
    style: { fontSize: 13, fontWeight: 'bold', fill: 0x00d4ff, fontFamily },
  });
  headerText.position.set(PANEL_PADDING, PANEL_PADDING);
  container.addChild(headerText);

  // Close button
  const closeBtn = new Container();
  closeBtn.eventMode = 'static';
  closeBtn.cursor = 'pointer';
  const closeTxt = new Text({ text: '✕', style: { fontSize: 14, fill: 0xaaaaaa, fontFamily } });
  closeTxt.anchor.set(0.5, 0.5);
  closeBtn.addChild(closeTxt);
  closeBtn.on('pointertap', () => {
    hide();
    closeCallback?.();
  });
  container.addChild(closeBtn);

  // Health score
  const scoreGfx = new Graphics();
  container.addChild(scoreGfx);
  const scoreText = new Text({
    text: '',
    style: { fontSize: 22, fontWeight: 'bold', fill: 0x39e58c, fontFamily },
  });
  container.addChild(scoreText);
  const scoreLabelText = new Text({
    text: 'Health',
    style: { fontSize: 9, fill: 0x88aacc, fontFamily },
  });
  container.addChild(scoreLabelText);

  // Session summary
  const sessionText = new Text({
    text: '',
    style: { fontSize: 10, fill: 0xcccccc, fontFamily },
  });
  container.addChild(sessionText);

  // Sparklines container
  const sparklinesContainer = new Container();
  container.addChild(sparklinesContainer);

  const sparklines: { key: string; layer: SparklineLayer }[] = [];
  for (const [key, preset] of Object.entries(SPARKLINE_PRESETS)) {
    const sl = createSparkline({
      ...preset,
      width: SPARKLINE_WIDTH,
      height: SPARKLINE_HEIGHT,
    });
    sparklines.push({ key, layer: sl });
    sparklinesContainer.addChild(sl.container);
  }

  // Errors section
  const errorsHeaderText = new Text({
    text: 'Recent Errors',
    style: { fontSize: 10, fill: 0x88aacc, fontFamily },
  });
  container.addChild(errorsHeaderText);

  const errorTexts: Text[] = [];
  for (let i = 0; i < MAX_VISIBLE_ERRORS; i++) {
    const t = new Text({
      text: '',
      style: { fontSize: 9, fill: 0xff9999, fontFamily },
    });
    container.addChild(t);
    errorTexts.push(t);
  }

  // Alerts section
  const alertsContainer = new Container();
  container.addChild(alertsContainer);
  const alertBadges: { bg: Graphics; text: Text }[] = [];

  function drawBackground(height: number) {
    bg.clear();
    bg.roundRect(0, 0, PANEL_WIDTH, height, 6)
      .fill({ color: 0x060a14, alpha: 0.90 })
      .stroke({ width: 1, color: 0x1a3050, alpha: 0.6 });
  }

  function layout() {
    // Position below the health dashboard panel
    const x = PANEL_PADDING;
    // Place below the estimated health dashboard bottom
    const healthDashboardHeight = 320; // estimated
    const y = Math.max(50, Math.round(vpHeight * 0.06)) + healthDashboardHeight + 8;
    container.position.set(x, y);
  }

  function renderContent(data: DiagnosticsData) {
    const agentColor = AGENT_COLORS[data.agentId] ?? 0x00d4ff;

    // Header
    headerText.text = `${data.agentId.toUpperCase()} Diagnostics`;
    headerText.style.fill = agentColor;

    // Close button
    closeBtn.position.set(PANEL_WIDTH - 20, PANEL_PADDING);
    closeTxt.position.set(0, 0);

    // Health score gauge
    const scoreX = PANEL_WIDTH - 55;
    const scoreY = PANEL_PADDING + 4;

    scoreGfx.clear();
    // Score ring
    const scoreColor = data.healthScore >= 80
      ? 0x39e58c
      : data.healthScore >= 50
        ? 0xffc247
        : 0xff3b3b;
    scoreGfx.circle(scoreX, scoreY + 12, 16)
      .stroke({ width: 3, color: scoreColor, alpha: 0.8 });
    // Arc proportional to score
    const angle = (data.healthScore / 100) * Math.PI * 2 - Math.PI / 2;
    scoreGfx.arc(scoreX, scoreY + 12, 16, -Math.PI / 2, angle)
      .stroke({ width: 3, color: scoreColor });

    scoreText.text = data.healthScore.toString();
    scoreText.style.fill = scoreColor;
    scoreText.position.set(scoreX - 8, scoreY + 2);
    scoreLabelText.position.set(scoreX - 8, scoreY + 22);

    // Sessions
    const successPct = data.successRate !== null
      ? `${Math.round(data.successRate * 100)}%`
      : 'N/A';
    sessionText.text = `Sessions: ${data.sessionCount} | Aborted: ${data.abortedCount} | Success: ${successPct}`;
    sessionText.position.set(PANEL_PADDING, PANEL_PADDING + 26);

    // Sparklines (2×2 grid)
    let sparkY = PANEL_PADDING + 48;
    for (let i = 0; i < sparklines.length; i++) {
      const { key, layer } = sparklines[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      layer.container.position.set(
        PANEL_PADDING + col * (SPARKLINE_WIDTH + SPARKLINE_GAP),
        sparkY + row * (SPARKLINE_HEIGHT + 22),
      );

      // Set data based on key
      const values = data.metricsHistory[key as keyof typeof data.metricsHistory];
      if (values) {
        layer.setData(values);
      }
    }

    // Errors section
    const errorsY = sparkY + 2 * (SPARKLINE_HEIGHT + 22) + SECTION_GAP;
    errorsHeaderText.position.set(PANEL_PADDING, errorsY);

    const visibleErrors = data.recentErrors.slice(0, MAX_VISIBLE_ERRORS);
    for (let i = 0; i < MAX_VISIBLE_ERRORS; i++) {
      const t = errorTexts[i];
      if (i < visibleErrors.length) {
        const err = visibleErrors[i];
        const ago = formatAgo(Date.now() - err.ts);
        t.text = `${ago} — ${truncate(err.message, 45)}`;
        t.visible = true;
        t.position.set(PANEL_PADDING, errorsY + 16 + i * ERROR_ROW_HEIGHT);
      } else {
        t.visible = false;
      }
    }

    const noErrors = visibleErrors.length === 0;
    if (noErrors) {
      errorTexts[0].text = '  No recent errors';
      errorTexts[0].style.fill = 0x667788;
      errorTexts[0].visible = true;
      errorTexts[0].position.set(PANEL_PADDING, errorsY + 16);
    } else {
      for (const t of errorTexts) {
        t.style.fill = 0xff9999;
      }
    }

    // Alerts
    const alertsY = errorsY + 16 + (noErrors ? 1 : visibleErrors.length) * ERROR_ROW_HEIGHT + SECTION_GAP;

    // Clear old badges
    for (const badge of alertBadges) {
      badge.bg.destroy();
      badge.text.destroy();
    }
    alertBadges.length = 0;
    alertsContainer.removeChildren();
    alertsContainer.position.set(PANEL_PADDING, alertsY);

    if (data.alerts.length > 0) {
      let badgeX = 0;
      for (const alert of data.alerts.slice(0, 4)) {
        const badgeBg = new Graphics();
        const badgeColor = SEVERITY_COLORS[alert.severity];
        const label = `${alert.severity}: ${alert.title}`;
        const badgeText = new Text({
          text: label,
          style: { fontSize: 9, fill: 0xffffff, fontFamily },
        });
        const bw = badgeText.width + 10;
        badgeBg.roundRect(0, 0, bw, 16, 3).fill({ color: badgeColor, alpha: 0.25 })
          .stroke({ width: 1, color: badgeColor, alpha: 0.6 });
        badgeText.position.set(5, 2);
        const badgeContainer = new Container();
        badgeContainer.addChild(badgeBg, badgeText);
        badgeContainer.position.set(badgeX, 0);
        alertsContainer.addChild(badgeContainer);
        alertBadges.push({ bg: badgeBg, text: badgeText });
        badgeX += bw + 6;
      }
    }

    // Total panel height
    const totalHeight = alertsY + (data.alerts.length > 0 ? 24 : 0) + PANEL_PADDING;
    drawBackground(totalHeight);
  }

  function show(data: DiagnosticsData) {
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

  function updateData(data: DiagnosticsData) {
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
    if (container.alpha < targetAlpha) {
      container.alpha = Math.min(1, container.alpha + ANIM_SPEED * elapsedMs);
    } else if (container.alpha > targetAlpha) {
      container.alpha = Math.max(0, container.alpha - ANIM_SPEED * elapsedMs);
      if (container.alpha <= 0) {
        container.visible = false;
      }
    }
  }

  // Initialize
  layout();

  return {
    container,
    show,
    hide,
    updateData,
    setViewport,
    update,
    isVisible: () => visible,
    currentAgent: () => currentData?.agentId ?? null,
    onClose: (callback) => { closeCallback = callback; },
  };
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function formatAgo(ms: number): string {
  if (ms < 0) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}
