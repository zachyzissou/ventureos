import { Container, Graphics, Text } from 'pixi.js';
import { AGENT_ORDER, AGENTS, ECONOMY } from '@/config';
import type { AgentId, Point } from '@/config';
import { healthToColor, heatIntensityToColor } from '@/economy/health';
import { buildSparklinePoints } from '@/economy/sparkline';
import type { BudgetAlert, EconomyState } from '@/economy/types';
import { clamp01 } from '@/utils/color';

type AgentView = {
  container: Container;
  ringBg: Graphics;
  ring: Graphics;
  sparkBg: Graphics;
  spark: Graphics;
  label: Text;
  alertIcon: Text;
  pos: Point;
  signature: string;
  pulsePhase: number;
  dirty: boolean;
};

export type ResourceEconomyLayer = {
  worldContainer: Container;
  overlayContainer: Container;
  setViewport: (width: number, height: number) => void;
  setAgentPositions: (positions: Record<AgentId, Point>) => void;
  setEconomyState: (state: EconomyState) => void;
  setConnectionStatus: (connected: boolean) => void;
  setAlerts: (alerts: BudgetAlert[]) => void;
  update: (elapsedMs: number) => void;
  /** Test/dev visibility. */
  getDrawStats: () => { heatmapRedraws: number; agentRedraws: number; panelRedraws: number };
};

function defaultPositions(): Record<AgentId, Point> {
  const out = {} as Record<AgentId, Point>;
  for (let i = 0; i < AGENT_ORDER.length; i++) {
    const id = AGENT_ORDER[i];
    out[id] = id === 'nexus' ? { x: 0, y: 0 } : AGENTS.POSITIONS[i] ?? { x: 0, y: 0 };
  }
  return out;
}

function pct(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function fmtInt(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toString();
}

function fmtUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function drawSparkline(g: Graphics, values: number[], color: number, x: number, y: number, w: number, h: number) {
  const pts = buildSparklinePoints(values, w, h, 1);
  if (pts.length < 2) return;

  g.clear();
  g.moveTo(x + pts[0].x, y + pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    g.lineTo(x + pts[i].x, y + pts[i].y);
  }
  g.stroke({ width: 1.5, color, alpha: 0.95 });
}

export function createResourceEconomyLayer(): ResourceEconomyLayer {
  const worldContainer = new Container();
  const overlayContainer = new Container();

  const heatMap = new Graphics();
  worldContainer.addChild(heatMap);

  const agentsContainer = new Container();
  worldContainer.addChild(agentsContainer);

  const panelBg = new Graphics();
  const panelTitle = new Text({
    text: 'Resource Economy',
    style: {
      fontSize: 13,
      fill: 0xffffff,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    }
  });

  const wsStatus = new Text({
    text: 'Realtime: offline',
    style: {
      fontSize: 11,
      fill: 0xffc247,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    }
  });

  const tokenLabel = new Text({
    text: 'Tokens: --',
    style: {
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    }
  });

  const costLabel = new Text({
    text: 'Cost: --',
    style: {
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    }
  });

  const tokenBarBg = new Graphics();
  const tokenBarFill = new Graphics();
  const costBarBg = new Graphics();
  const costBarFill = new Graphics();

  const alertText = new Text({
    text: '',
    style: {
      fontSize: 10,
      fill: 0xffc247,
      wordWrap: true,
      wordWrapWidth: 260,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    }
  });

  overlayContainer.addChild(
    panelBg,
    panelTitle,
    wsStatus,
    tokenLabel,
    costLabel,
    tokenBarBg,
    tokenBarFill,
    costBarBg,
    costBarFill,
    alertText
  );

  const views = new Map<AgentId, AgentView>();
  let positions = defaultPositions();

  let viewportW = 1920;
  let viewportH = 1080;
  let connected = false;
  let panelDirty = true;
  let heatDirty = true;
  let heatAccumMs = 0;

  let state: EconomyState | null = null;
  let latestAlerts: BudgetAlert[] = [];

  const stats = {
    heatmapRedraws: 0,
    agentRedraws: 0,
    panelRedraws: 0
  };

  for (const id of AGENT_ORDER) {
    const container = new Container();
    const ringBg = new Graphics();
    const ring = new Graphics();
    const sparkBg = new Graphics();
    const spark = new Graphics();

    const label = new Text({
      text: '--',
      style: {
        fontSize: 10,
        fill: 0xffffff,
        align: 'center',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      }
    });
    label.anchor.set(0.5, 0.5);

    const alertIcon = new Text({
      text: '⚠',
      style: {
        fontSize: 12,
        fill: 0xffc247,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      }
    });
    alertIcon.anchor.set(0.5, 0.5);
    alertIcon.visible = false;

    container.addChild(ringBg, ring, sparkBg, spark, label, alertIcon);
    agentsContainer.addChild(container);

    views.set(id, {
      container,
      ringBg,
      ring,
      sparkBg,
      spark,
      label,
      alertIcon,
      pos: positions[id],
      signature: '',
      pulsePhase: Math.random() * Math.PI * 2,
      dirty: true
    });
  }

  function layoutPanel() {
    const panelW = 280;
    const panelH = 120;
    const x = Math.max(8, viewportW - panelW - 12);
    const y = Math.max(50, Math.round(viewportH * 0.06));

    panelBg.clear();
    panelBg
      .roundRect(0, 0, panelW, panelH, 8)
      .fill({ color: 0x05070d, alpha: 0.74 })
      .stroke({ width: 1, color: 0x2d507a, alpha: 0.55 });

    overlayContainer.position.set(x, y);

    panelTitle.position.set(10, 8);
    wsStatus.position.set(panelW - wsStatus.width - 10, 9);

    tokenLabel.position.set(10, 30);
    tokenBarBg.clear();
    tokenBarBg.roundRect(10, 47, panelW - 20, 8, 3).fill({ color: 0x000000, alpha: 0.58 });

    costLabel.position.set(10, 62);
    costBarBg.clear();
    costBarBg.roundRect(10, 79, panelW - 20, 8, 3).fill({ color: 0x000000, alpha: 0.58 });

    alertText.position.set(10, 92);
    alertText.style.wordWrapWidth = panelW - 20;

    panelDirty = true;
  }

  function redrawPanel() {
    if (!state) return;

    const tokenRemaining = state.pool.tokenQuotaRemainingRatio;
    const costRemaining = state.pool.costRemainingRatio;

    const tokenColor = healthToColor(tokenRemaining <= 0.15 ? 'red' : tokenRemaining <= 0.3 ? 'yellow' : 'green');
    const costColor = healthToColor(costRemaining <= 0.15 ? 'red' : costRemaining <= 0.3 ? 'yellow' : 'green');

    tokenLabel.text = `Tokens: ${fmtInt(state.pool.tokenQuotaRemaining)} / ${fmtInt(state.pool.tokenQuotaTotal)} (${pct(tokenRemaining)})`;
    costLabel.text = `Cost: ${fmtUsd(state.pool.costRemainingUsd)} / ${fmtUsd(state.pool.costBudgetUsd)} (${pct(costRemaining)})`;

    wsStatus.text = connected ? 'Realtime: online' : 'Realtime: reconnecting';
    wsStatus.style.fill = connected ? 0x39e58c : 0xffc247;
    wsStatus.position.set(280 - wsStatus.width - 10, 9);

    const tokenW = (280 - 20) * clamp01(1 - tokenRemaining);
    tokenBarFill.clear();
    tokenBarFill.roundRect(10, 47, tokenW, 8, 3).fill({ color: tokenColor, alpha: 0.92 });

    const costW = (280 - 20) * clamp01(1 - costRemaining);
    costBarFill.clear();
    costBarFill.roundRect(10, 79, costW, 8, 3).fill({ color: costColor, alpha: 0.92 });

    const topAlerts = latestAlerts.slice(-2).map((a) => a.message);
    alertText.text = topAlerts.length > 0 ? topAlerts.join('\n') : 'Alerts: nominal';
    alertText.style.fill = topAlerts.length > 0 ? 0xffc247 : 0x88aacc;

    panelDirty = false;
    stats.panelRedraws += 1;
  }

  function agentSignature(agent: EconomyState['agents'][AgentId]): string {
    const last = agent.history[agent.history.length - 1];
    return [
      agent.tokenBudget,
      agent.tokensUsed,
      agent.tokensRemaining,
      agent.costUsd.toFixed(3),
      agent.burnRateUsdPerHour.toFixed(3),
      agent.quotaRemainingRatio.toFixed(4),
      agent.health,
      agent.history.length,
      last?.ts ?? 0,
      last?.costUsd ?? 0
    ].join('|');
  }

  function redrawAgent(id: AgentId) {
    if (!state) return;

    const view = views.get(id);
    if (!view) return;

    const agent = state.agents[id];
    const ringRadius = ECONOMY.INDICATOR_RING_RADIUS;

    const color = healthToColor(agent.health);
    const usageRatio = clamp01(agent.usageRatio);

    view.ringBg.clear();
    view.ringBg.circle(0, 0, ringRadius).stroke({ width: 2, color: 0x0f1c2f, alpha: 0.86 });

    view.ring.clear();
    if (usageRatio > 0.001) {
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * usageRatio;
      view.ring.arc(0, 0, ringRadius, start, end).stroke({ width: 4, color, alpha: 0.95 });
    }

    const sparkW = ECONOMY.SPARKLINE_WIDTH;
    const sparkH = ECONOMY.SPARKLINE_HEIGHT;
    const sparkX = -sparkW / 2;
    const sparkY = ringRadius + 10;

    view.sparkBg.clear();
    view.sparkBg
      .roundRect(sparkX, sparkY, sparkW, sparkH, 3)
      .fill({ color: 0x01040a, alpha: 0.78 })
      .stroke({ width: 1, color, alpha: 0.35 });

    const values = agent.history.map((p) => p.costUsd);
    drawSparkline(view.spark, values, color, sparkX, sparkY, sparkW, sparkH);

    view.label.text = `${fmtInt(agent.tokensRemaining)} tok • ${fmtUsd(agent.costUsd)}`;
    view.label.position.set(0, -(ringRadius + 10));

    const showAlert = agent.health !== 'green';
    view.alertIcon.visible = showAlert;
    view.alertIcon.style.fill = agent.health === 'red' ? 0xff3b3b : 0xffc247;
    view.alertIcon.position.set(ringRadius + 12, -(ringRadius + 8));

    view.dirty = false;
    stats.agentRedraws += 1;
  }

  function redrawHeatmap() {
    if (!state) return;

    heatMap.clear();

    for (const id of AGENT_ORDER) {
      const p = positions[id];
      const a = state.agents[id];

      const burnNorm = clamp01(a.burnRateUsdPerHour / 12);
      const intensity = clamp01(a.usageRatio * 0.6 + burnNorm * 0.4);
      const color = heatIntensityToColor(intensity);
      const radius = 60 + intensity * 45;
      const alpha = 0.06 + intensity * 0.18;

      for (let i = 0; i < 3; i++) {
        const r = radius * (1 - i * 0.22);
        const aLayer = alpha * (1 - i * 0.30);
        heatMap.circle(p.x, p.y, r).fill({ color, alpha: aLayer });
      }
    }

    heatDirty = false;
    stats.heatmapRedraws += 1;
  }

  function setViewport(width: number, height: number) {
    viewportW = width;
    viewportH = height;
    layoutPanel();
  }

  function setAgentPositions(next: Record<AgentId, Point>) {
    positions = next;

    for (const id of AGENT_ORDER) {
      const view = views.get(id);
      if (!view) continue;
      const p = positions[id];
      view.pos = p;
      view.container.position.set(p.x, p.y);
    }

    heatDirty = true;
  }

  function setEconomyState(next: EconomyState) {
    state = next;

    for (const id of AGENT_ORDER) {
      const view = views.get(id);
      if (!view) continue;
      const sig = agentSignature(next.agents[id]);
      if (sig !== view.signature) {
        view.signature = sig;
        view.dirty = true;
      }
    }

    panelDirty = true;
    heatDirty = true;
  }

  function setConnectionStatus(next: boolean) {
    if (connected === next) return;
    connected = next;
    panelDirty = true;
  }

  function setAlerts(alerts: BudgetAlert[]) {
    latestAlerts = alerts.slice(-4);
    panelDirty = true;
  }

  function update(elapsedMs: number) {
    for (const id of AGENT_ORDER) {
      const view = views.get(id);
      if (!view) continue;

      if (view.dirty) redrawAgent(id);

      if (view.alertIcon.visible) {
        view.pulsePhase += (elapsedMs / 1000) * 7;
        view.alertIcon.alpha = 0.55 + Math.sin(view.pulsePhase) * 0.45;
      }
    }

    heatAccumMs += elapsedMs;
    if (heatDirty && heatAccumMs >= ECONOMY.HEATMAP_REDRAW_MS) {
      heatAccumMs = 0;
      redrawHeatmap();
    }

    if (panelDirty) redrawPanel();
  }

  // initialize once
  setViewport(viewportW, viewportH);
  setAgentPositions(positions);

  return {
    worldContainer,
    overlayContainer,
    setViewport,
    setAgentPositions,
    setEconomyState,
    setConnectionStatus,
    setAlerts,
    update,
    getDrawStats: () => ({ ...stats })
  };
}
