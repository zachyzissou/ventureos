/**
 * Phase 5.7 — Detail Panel
 *
 * Side panel that slides in from the right when an agent is selected.
 * Shows full health metrics, sparklines, sessions, errors, alerts.
 * Rendered in screen space (added to app.stage).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { AGENT_ORDER, DETAIL_PANEL, COLORS, FEATURES, HEALTH } from '@/config';
import type { AgentId } from '@/config';
import type { Store } from '@/state/store';
import type { SelectionState, AgentSession } from '@/state/types';
import type { AgentHealthState, AgentStatus, HealthAlert } from '@/health/types';
import type { MapState } from '@/state/types';
import { buildSparklinePoints } from '@/economy/sparkline';
import { clamp01 } from '@/utils/color';
import { sanitizePlainText } from '@/utils/sanitize';

const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const STATUS_COLORS: Record<AgentStatus, number> = {
  healthy: 0x39e58c,
  degraded: 0xffc247,
  unhealthy: 0xff3b3b,
  offline: 0x555555
};

export type DetailPanel = {
  container: Container;
  setViewport: (width: number, height: number) => void;
  setHealthData: (agents: Record<string, AgentHealthState>) => void;
  setMapData: (state: MapState) => void;
  setAlerts: (alerts: HealthAlert[]) => void;
  update: (elapsedMs: number) => void;
  isVisible: () => boolean;
  destroy: () => void;
};

export function createDetailPanel(
  selectionStore: Store<SelectionState>
): DetailPanel {
  const container = new Container();
  container.visible = false;
  container.zIndex = 90;

  const panelW = DETAIL_PANEL.WIDTH;
  let viewportW = 1920;
  let viewportH = 1080;

  // Animation state
  let targetVisible = false;
  let animProgress = 0; // 0 = hidden, 1 = fully shown
  let selectedId: AgentId | null = null;

  let healthAgents: Record<string, AgentHealthState> = {};
  let mapState: MapState | null = null;
  let allAlerts: HealthAlert[] = [];

  // ── Static children ─────────────────────────────────────────

  const bg = new Graphics();
  container.addChild(bg);

  const closeBtn = new Text({
    text: '✕',
    style: { fontSize: 16, fill: 0xaaaaaa, fontFamily: FONT }
  });
  closeBtn.eventMode = 'static';
  closeBtn.cursor = 'pointer';
  closeBtn.on('pointertap', () => {
    selectionStore.update((s) => ({ ...s, selectedId: null }));
  });
  container.addChild(closeBtn);

  const titleText = new Text({ text: '', style: { fontSize: 16, fontWeight: 'bold', fill: 0xffffff, fontFamily: FONT } });
  container.addChild(titleText);

  const statusText = new Text({ text: '', style: { fontSize: 12, fill: 0xaaaaaa, fontFamily: FONT } });
  container.addChild(statusText);

  // Section: Metrics
  const metricsHeading = new Text({ text: 'METRICS', style: { fontSize: 10, fontWeight: 'bold', fill: DETAIL_PANEL.HEADING_COLOR, fontFamily: FONT } });
  container.addChild(metricsHeading);

  const cpuText = new Text({ text: '', style: { fontSize: 11, fill: 0xcccccc, fontFamily: FONT } });
  const cpuBar = new Graphics();
  const memText = new Text({ text: '', style: { fontSize: 11, fill: 0xcccccc, fontFamily: FONT } });
  const memBar = new Graphics();
  const latencyText = new Text({ text: '', style: { fontSize: 11, fill: 0xcccccc, fontFamily: FONT } });
  const rpsText = new Text({ text: '', style: { fontSize: 11, fill: 0xcccccc, fontFamily: FONT } });
  const errRateText = new Text({ text: '', style: { fontSize: 11, fill: 0xcccccc, fontFamily: FONT } });
  const connectionsText = new Text({ text: '', style: { fontSize: 11, fill: 0xcccccc, fontFamily: FONT } });
  container.addChild(cpuText, cpuBar, memText, memBar, latencyText, rpsText, errRateText, connectionsText);

  // Section: Sparklines
  const sparkHeading = new Text({ text: 'TRENDS', style: { fontSize: 10, fontWeight: 'bold', fill: DETAIL_PANEL.HEADING_COLOR, fontFamily: FONT } });
  container.addChild(sparkHeading);

  const cpuSparkLabel = new Text({ text: 'CPU', style: { fontSize: 9, fill: 0x888888, fontFamily: FONT } });
  const cpuSparkline = new Graphics();
  const latSparkLabel = new Text({ text: 'Latency', style: { fontSize: 9, fill: 0x888888, fontFamily: FONT } });
  const latSparkline = new Graphics();
  container.addChild(cpuSparkLabel, cpuSparkline, latSparkLabel, latSparkline);

  // Section: Sessions
  const sessionsHeading = new Text({ text: 'SESSIONS', style: { fontSize: 10, fontWeight: 'bold', fill: DETAIL_PANEL.HEADING_COLOR, fontFamily: FONT } });
  container.addChild(sessionsHeading);

  const sessionTexts: Text[] = [];
  for (let i = 0; i < DETAIL_PANEL.MAX_SESSIONS_SHOWN; i++) {
    const t = new Text({ text: '', style: { fontSize: 10, fill: 0xbbbbbb, fontFamily: FONT } });
    sessionTexts.push(t);
    container.addChild(t);
  }

  // Section: Errors
  const errorsHeading = new Text({ text: 'RECENT ERRORS', style: { fontSize: 10, fontWeight: 'bold', fill: DETAIL_PANEL.HEADING_COLOR, fontFamily: FONT } });
  container.addChild(errorsHeading);

  const errorTexts: Text[] = [];
  for (let i = 0; i < DETAIL_PANEL.MAX_ERRORS_SHOWN; i++) {
    const t = new Text({ text: '', style: { fontSize: 10, fill: 0xff7777, fontFamily: FONT } });
    errorTexts.push(t);
    container.addChild(t);
  }

  // Section: Alerts
  const alertsHeading = new Text({ text: 'ALERTS', style: { fontSize: 10, fontWeight: 'bold', fill: DETAIL_PANEL.HEADING_COLOR, fontFamily: FONT } });
  container.addChild(alertsHeading);

  const alertTexts: Text[] = [];
  for (let i = 0; i < 3; i++) {
    const t = new Text({ text: '', style: { fontSize: 10, fill: 0xffc247, fontFamily: FONT } });
    alertTexts.push(t);
    container.addChild(t);
  }

  // Section: Uptime
  const uptimeText = new Text({ text: '', style: { fontSize: 10, fill: 0x888888, fontFamily: FONT } });
  const heartbeatText = new Text({ text: '', style: { fontSize: 10, fill: 0x888888, fontFamily: FONT } });
  container.addChild(uptimeText, heartbeatText);

  // ── Store subscription ──────────────────────────────────────

  const unsub = selectionStore.subscribe((s) => {
    if (s.selectedId !== selectedId) {
      selectedId = s.selectedId;
      targetVisible = selectedId !== null && FEATURES.DETAIL_PANEL;
    }
  });

  // ── Layout helpers ──────────────────────────────────────────

  function fmtDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  function drawBar(g: Graphics, x: number, y: number, w: number, h: number, ratio: number, color: number) {
    g.clear();
    g.roundRect(x, y, w, h, 2).fill({ color: 0x222233, alpha: 0.8 });
    if (ratio > 0) {
      g.roundRect(x, y, w * Math.min(1, ratio), h, 2).fill({ color, alpha: 0.9 });
    }
  }

  function drawSparklineCurve(g: Graphics, values: number[], color: number, x: number, y: number, w: number, h: number) {
    if (values.length < 2) return;
    const pts = buildSparklinePoints(values, w, h, 1);
    g.clear();
    g.moveTo(x + pts[0].x, y + pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(x + pts[i].x, y + pts[i].y);
    }
    g.stroke({ width: 1.5, color, alpha: 0.85 });
  }

  function redrawContent() {
    if (!selectedId) return;

    const health = healthAgents[selectedId];
    const map = mapState?.agents[selectedId];
    const pad = 14;
    const barW = panelW - pad * 2 - 80;
    let y = 14;

    // Close button
    closeBtn.position.set(panelW - 24, 8);

    // Title
    titleText.text = selectedId.toUpperCase();
    titleText.position.set(pad, y);
    y += 22;

    // Status
    if (health) {
      const color = STATUS_COLORS[health.status] ?? 0x888888;
      statusText.text = `● ${health.status.charAt(0).toUpperCase() + health.status.slice(1)}`;
      statusText.style.fill = color;
    } else {
      statusText.text = 'No health data';
      statusText.style.fill = 0x888888;
    }
    statusText.position.set(pad, y);
    y += 20;

    // ── Metrics section ──
    metricsHeading.position.set(pad, y);
    y += 16;

    const cpu = health?.metrics.cpuPercent ?? 0;
    cpuText.text = `CPU: ${cpu.toFixed(1)}%`;
    cpuText.position.set(pad, y);
    const cpuColor = cpu > 90 ? 0xff3b3b : cpu > 70 ? 0xffc247 : 0x39e58c;
    drawBar(cpuBar, pad + 80, y + 2, barW, 8, cpu / 100, cpuColor);
    y += 16;

    const mem = health?.metrics.memoryMb ?? 0;
    const memLimit = health?.metrics.memoryLimitMb ?? 1;
    const memPct = memLimit > 0 ? (mem / memLimit) * 100 : 0;
    memText.text = `MEM: ${mem.toFixed(0)}/${memLimit} MB`;
    memText.position.set(pad, y);
    const memColor = memPct > 90 ? 0xff3b3b : memPct > 75 ? 0xffc247 : 0x39e58c;
    drawBar(memBar, pad + 80, y + 2, barW, 8, memPct / 100, memColor);
    y += 16;

    const lat = health?.metrics.latencyMs ?? 0;
    const latP99 = health?.metrics.latencyP99Ms ?? 0;
    const latColor = lat > HEALTH.LATENCY_CRITICAL_MS ? 0xff3b3b : lat > HEALTH.LATENCY_WARNING_MS ? 0xffc247 : 0x39e58c;
    latencyText.text = `Latency: p95 ${Math.round(lat)}ms  p99 ${Math.round(latP99)}ms`;
    latencyText.style.fill = latColor;
    latencyText.position.set(pad, y);
    y += 14;

    const rps = health?.metrics.requestsPerSec ?? 0;
    rpsText.text = `Req/s: ${rps.toFixed(1)}`;
    rpsText.position.set(pad, y);
    y += 14;

    const errRate = health?.metrics.errorsPerMin ?? 0;
    const errColor = errRate > HEALTH.ERROR_RATE_CRITICAL ? 0xff3b3b : errRate > HEALTH.ERROR_RATE_WARNING ? 0xffc247 : 0xcccccc;
    errRateText.text = `Errors/min: ${errRate.toFixed(1)}`;
    errRateText.style.fill = errColor;
    errRateText.position.set(pad, y);
    y += 14;

    const conns = health?.metrics.activeConnections ?? 0;
    connectionsText.text = `Connections: ${conns}`;
    connectionsText.position.set(pad, y);
    y += 20;

    // ── Sparklines section ──
    sparkHeading.position.set(pad, y);
    y += 14;

    const spW = DETAIL_PANEL.SPARKLINE_WIDTH;
    const spH = DETAIL_PANEL.SPARKLINE_HEIGHT;

    cpuSparkLabel.position.set(pad, y);
    const cpuHistory = health?.history?.map((h) => h.cpuPercent) ?? [];
    drawSparklineCurve(cpuSparkline, cpuHistory, 0x00d4ff, pad + 50, y, spW, spH);
    y += spH + 6;

    latSparkLabel.position.set(pad, y);
    const latHistory = health?.history?.map((h) => h.latencyMs) ?? [];
    drawSparklineCurve(latSparkline, latHistory, 0xffc247, pad + 50, y, spW, spH);
    y += spH + 10;

    // ── Sessions section ──
    sessionsHeading.position.set(pad, y);
    y += 14;

    const sessions = map?.activeSessions ?? [];
    for (let i = 0; i < sessionTexts.length; i++) {
      if (i < sessions.length && i < DETAIL_PANEL.MAX_SESSIONS_SHOWN) {
        const s = sessions[i];
        sessionTexts[i].text = `• ${sanitizePlainText(s.label, 50)}`;
        sessionTexts[i].visible = true;
        sessionTexts[i].position.set(pad + 4, y);
        y += 13;
      } else {
        sessionTexts[i].visible = false;
      }
    }
    if (sessions.length === 0) {
      sessionTexts[0].text = '  (none)';
      sessionTexts[0].visible = true;
      sessionTexts[0].style.fill = 0x666666;
      sessionTexts[0].position.set(pad + 4, y);
      y += 13;
    }
    y += 6;

    // ── Errors section ──
    errorsHeading.position.set(pad, y);
    y += 14;

    const errors = health?.errors ?? [];
    for (let i = 0; i < errorTexts.length; i++) {
      if (i < errors.length && i < DETAIL_PANEL.MAX_ERRORS_SHOWN) {
        const e = errors[i];
        errorTexts[i].text = `⚠ ${sanitizePlainText(e.message, 50)}`;
        errorTexts[i].visible = true;
        errorTexts[i].position.set(pad + 4, y);
        y += 13;
      } else {
        errorTexts[i].visible = false;
      }
    }
    if (errors.length === 0) {
      errorTexts[0].text = '  No errors';
      errorTexts[0].visible = true;
      errorTexts[0].style.fill = 0x39e58c;
      errorTexts[0].position.set(pad + 4, y);
      y += 13;
    }
    y += 6;

    // ── Alerts section ──
    alertsHeading.position.set(pad, y);
    y += 14;

    const agentAlerts = allAlerts.filter((a) => a.targetId === selectedId && !a.resolved);
    for (let i = 0; i < alertTexts.length; i++) {
      if (i < agentAlerts.length) {
        const a = agentAlerts[i];
        const sevColor = a.severity === 'p0' ? 0xff3366 : a.severity === 'p1' ? 0xff9100 : 0xffc247;
        alertTexts[i].text = `${a.severity.toUpperCase()}: ${sanitizePlainText(a.title || a.message, 45)}`;
        alertTexts[i].style.fill = sevColor;
        alertTexts[i].visible = true;
        alertTexts[i].position.set(pad + 4, y);
        y += 13;
      } else {
        alertTexts[i].visible = false;
      }
    }
    if (agentAlerts.length === 0) {
      alertTexts[0].text = '  No active alerts';
      alertTexts[0].visible = true;
      alertTexts[0].style.fill = 0x39e58c;
      alertTexts[0].position.set(pad + 4, y);
      y += 13;
    }
    y += 6;

    // ── Uptime + heartbeat ──
    const uptime = health?.uptimeMs ?? 0;
    uptimeText.text = `Uptime: ${fmtDuration(uptime)}`;
    uptimeText.position.set(pad, y);
    y += 13;

    if (health?.lastHeartbeatAt) {
      const ago = Date.now() - health.lastHeartbeatAt;
      heartbeatText.text = `Last heartbeat: ${fmtDuration(ago)} ago`;
    } else {
      heartbeatText.text = 'Last heartbeat: —';
    }
    heartbeatText.position.set(pad, y);
    y += 20;

    // Background
    const panelH = Math.min(y, viewportH - 20);
    bg.clear();
    bg.roundRect(0, 0, panelW, panelH, 8)
      .fill({ color: DETAIL_PANEL.BG_COLOR, alpha: DETAIL_PANEL.BG_ALPHA });
    bg.roundRect(0, 0, panelW, panelH, 8)
      .stroke({ width: 1, color: DETAIL_PANEL.BORDER_COLOR, alpha: DETAIL_PANEL.BORDER_ALPHA });
  }

  // ── Public API ──────────────────────────────────────────────

  function setViewport(w: number, h: number) {
    viewportW = w;
    viewportH = h;
  }

  function setHealthData(agents: Record<string, AgentHealthState>) {
    healthAgents = agents;
  }

  function setMapData(state: MapState) {
    mapState = state;
  }

  function setAlerts(alerts: HealthAlert[]) {
    allAlerts = alerts;
  }

  function update(elapsedMs: number) {
    // Animate slide
    const speed = elapsedMs / DETAIL_PANEL.ANIM_MS;
    if (targetVisible) {
      animProgress = Math.min(1, animProgress + speed);
    } else {
      animProgress = Math.max(0, animProgress - speed);
    }

    if (animProgress <= 0) {
      container.visible = false;
      return;
    }

    container.visible = true;

    // Slide from right
    const targetX = viewportW - panelW - 12;
    const hiddenX = viewportW + 10;
    const x = hiddenX + (targetX - hiddenX) * easeOutCubic(animProgress);
    const y = 56; // below HUD bar
    container.position.set(x, y);

    if (selectedId) redrawContent();
  }

  function destroy() {
    unsub();
  }

  return { container, setViewport, setHealthData, setMapData, setAlerts, update, isVisible: () => targetVisible, destroy };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
