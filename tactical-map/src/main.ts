import { Application, Container } from 'pixi.js';
import { AGENT_ORDER, AGENTS, CANVAS, ECONOMY, HEALTH, FEATURES } from '@/config';
import type { AgentId, Point } from '@/config';
import { createApiClient } from '@/data/api-client';
import { createEconomyClient } from '@/data/economy-client';
import { createHealthClient } from '@/data/health-client';
import { classifyActivity, ActivityType } from '@/data/activity-mapper';
import { createCameraController } from '@/interaction/camera';
import { createSelectionRing } from '@/interaction/selection';
import { createTooltipOverlay } from '@/interaction/tooltip';
import { createDetailPanel } from '@/interaction/detail-panel';
import { createMinimap } from '@/interaction/minimap';
import { createKeyboardManager } from '@/interaction/keyboard';
import { createHelpOverlay } from '@/interaction/help-overlay';
import { createBuildingsLayer, RING_AGENT_IDS } from '@/renderer/buildings';
import { createHud, pollKpis } from '@/renderer/hud';
import { createNexus } from '@/renderer/nexus';
import { createTerrain } from '@/renderer/terrain';
import { createHealthBarsLayer } from '@/renderer/health-bars';
import { createUnitsLayer } from '@/renderer/units';
import { createParticleSystem } from '@/renderer/particles';
import { createKhalaNetworkLayer } from '@/renderer/khala-network';
import { createResourceEconomyLayer } from '@/renderer/resource-economy';
import { createHealthDiagnosticsLayer } from '@/renderer/health-diagnostics';
import { createHealthDashboard } from '@/renderer/health-dashboard';
import { deriveBuildingState } from '@/renderer/building-states';
import { BudgetAlertManager } from '@/economy/alerts';
import { AlertRouter } from '@/health/alert-router';
import { createConnectivityMonitor } from '@/health/connectivity';
import {
  createEmptyHealthState,
  applyAgentHealthUpdate,
  applyAlertEvent,
  applyAlertResolvedEvent,
  applyDiagnosticsUpdate
} from '@/health/normalize';
import type { HealthState } from '@/health/types';
import {
  applyAgentEconomyUpdate,
  applyEconomySnapshot,
  applyPoolEconomyUpdate,
  createEmptyEconomyState
} from '@/economy/state';
import type { EconomyState } from '@/economy/types';
import { createStore } from '@/state/store';
import type { MapState, SelectionState } from '@/state/types';

function createInitialMapState(): MapState {
  const agents = {} as MapState['agents'];
  for (let i = 0; i < AGENT_ORDER.length; i++) {
    const id = AGENT_ORDER[i];
    agents[id] = {
      id,
      position: id === 'nexus' ? { x: 0, y: 0 } : AGENTS.POSITIONS[i] ?? { x: 0, y: 0 },
      state: 'IDLE'
    };
  }
  return { updatedAt: new Date().toISOString(), agents };
}

const mapStore = createStore<MapState>(createInitialMapState());
const economyStore = createStore<EconomyState>(createEmptyEconomyState());
const healthStore = createStore<HealthState>(createEmptyHealthState());
const selectionStore = createStore<SelectionState>({ selectedId: null, hoveredId: null });

async function bootstrap() {
  const app = new Application();
  await app.init({
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    backgroundColor: CANVAS.BG_COLOR,
    resizeTo: window
  });

  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) throw new Error('Missing #app mount');
  mount.appendChild(app.canvas);

  // Enable event system across the full screen.
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  // World container (camera transforms applied here)
  const world = new Container();
  app.stage.addChild(world);

  const terrain = createTerrain();
  world.addChild(terrain.container);

  const khala = createKhalaNetworkLayer();
  world.addChild(khala.container);

  const particles = createParticleSystem({ seed: 1337 });
  world.addChild(particles.container);

  const buildingsLayer = createBuildingsLayer();
  world.addChild(buildingsLayer.container);

  const unitsLayer = createUnitsLayer(RING_AGENT_IDS);
  world.addChild(unitsLayer.container);

  const nexus = createNexus();
  world.addChild(nexus.container);

  const healthBars = createHealthBarsLayer(RING_AGENT_IDS);
  world.addChild(healthBars.container);

  const resourceEconomy = createResourceEconomyLayer();
  world.addChild(resourceEconomy.worldContainer);

  const healthDiagnostics = createHealthDiagnosticsLayer();
  world.addChild(healthDiagnostics.worldContainer);

  // HUD overlays
  const hud = createHud();
  app.stage.addChild(hud.container);
  app.stage.addChild(resourceEconomy.overlayContainer);
  app.stage.addChild(healthDiagnostics.alertContainer);
  app.stage.addChild(healthDiagnostics.connectivityContainer);

  const healthDashboard = createHealthDashboard();
  app.stage.addChild(healthDashboard.container);

  // Phase 5.7: Interactive Controls
  const getAgentPosition = (id: AgentId): Point => mapStore.get().agents[id]?.position ?? { x: 0, y: 0 };

  const selectionRing = createSelectionRing(selectionStore, getAgentPosition);
  world.addChild(selectionRing.container);

  const tooltip = createTooltipOverlay(selectionStore, getAgentPosition);
  app.stage.addChild(tooltip.container);

  const detailPanel = createDetailPanel(selectionStore);
  app.stage.addChild(detailPanel.container);

  const minimap = createMinimap(selectionStore);
  app.stage.addChild(minimap.container);

  const helpOverlay = createHelpOverlay();
  app.stage.addChild(helpOverlay.container);

  const alertManager = new BudgetAlertManager({
    warningRatio: ECONOMY.WARNING_THRESHOLD,
    criticalRatio: ECONOMY.CRITICAL_THRESHOLD,
    cooldownMs: ECONOMY.ALERT_COOLDOWN_MS
  });

  const healthAlertRouter = new AlertRouter();
  const connectivityMonitor = createConnectivityMonitor();

  let cameraHome = { x: app.screen.width / 2, y: app.screen.height / 2 };
  world.position.set(cameraHome.x, cameraHome.y);
  world.scale.set(1);

  const camera = createCameraController({
    world,
    canvas: app.canvas,
    setCursor: (c) => {
      terrain.hit.cursor = c;
    },
    onDoubleClick: () => camera.reset()
  });

  camera.setHome(cameraHome);
  camera.setState({ x: cameraHome.x, y: cameraHome.y, zoom: 1 });

  function layout() {
    // Camera "home" is screen center.
    const cx = app.screen.width / 2;
    const cy = app.screen.height / 2;

    // If the camera is effectively still at home, keep it centered on resize.
    if (
      Math.abs(camera.getState().x - cameraHome.x) < 0.001 &&
      Math.abs(camera.getState().y - cameraHome.y) < 0.001
    ) {
      world.position.set(cx, cy);
      camera.setState({ x: cx, y: cy, zoom: camera.getState().zoom });
    }

    cameraHome = { x: cx, y: cy };
    camera.setHome(cameraHome);

    hud.setSize(app.screen.width, app.screen.height);
    resourceEconomy.setViewport(app.screen.width, app.screen.height);
    healthDiagnostics.setViewport(app.screen.width, app.screen.height);

    // Position health dashboard on the right, below HUD bar
    const dashX = Math.max(8, app.screen.width - HEALTH.DASHBOARD_WIDTH - 12);
    const dashY = Math.max(50, Math.round(app.screen.height * 0.06) + 130);
    healthDashboard.setPosition(dashX, dashY);

    // Phase 5.7: Layout interactive controls
    detailPanel.setViewport(app.screen.width, app.screen.height);
    minimap.setViewport(app.screen.width, app.screen.height);
    helpOverlay.setViewport(app.screen.width, app.screen.height);
  }

  // Pan only when dragging on the terrain surface.
  terrain.hit.on('pointerdown', (e) => camera.onPanDown(e));
  app.stage.on('pointermove', (e) => camera.onPanMove(e));
  app.stage.on('pointerup', (e) => camera.onPanUp(e));
  app.stage.on('pointerupoutside', (e) => camera.onPanUp(e));

  // Double-click reset only when on terrain.
  let lastTap = 0;
  terrain.hit.on('pointertap', () => {
    const now = performance.now();
    if (now - lastTap < 280) camera.reset();
    lastTap = now;
  });

  // Phase 5.7: Wire building click and hover events to selection store
  for (const id of RING_AGENT_IDS) {
    const view = buildingsLayer.buildings[id];
    if (!view) continue;
    view.container.eventMode = 'static';
    view.container.cursor = 'pointer';
    view.container.on('pointertap', () => {
      selectionStore.update((s) => ({
        ...s,
        selectedId: s.selectedId === id ? null : id
      }));
    });
    view.container.on('pointerenter', () => {
      selectionStore.update((s) => ({ ...s, hoveredId: id }));
    });
    view.container.on('pointerleave', () => {
      selectionStore.update((s) => {
        if (s.hoveredId === id) return { ...s, hoveredId: null };
        return s;
      });
    });
  }

  // Nexus click support
  nexus.container.eventMode = 'static';
  nexus.container.cursor = 'pointer';
  nexus.container.on('pointertap', () => {
    selectionStore.update((s) => ({
      ...s,
      selectedId: s.selectedId === 'nexus' ? null : 'nexus'
    }));
  });
  nexus.container.on('pointerenter', () => {
    selectionStore.update((s) => ({ ...s, hoveredId: 'nexus' }));
  });
  nexus.container.on('pointerleave', () => {
    selectionStore.update((s) => {
      if (s.hoveredId === 'nexus') return { ...s, hoveredId: null };
      return s;
    });
  });

  // Keep nexus centered in world space.
  nexus.container.position.set(0, 0);

  // Store → view binding
  mapStore.subscribe((s) => {
    // Khala bonds + resource overlays follow agent positions.
    const pos = {} as Record<AgentId, Point>;
    for (const id of AGENT_ORDER) pos[id] = s.agents[id].position;
    khala.setAgentPositions(pos);
    resourceEconomy.setAgentPositions(pos);

    // Ring buildings + units + health bars
    for (const id of RING_AGENT_IDS) {
      const node = s.agents[id];
      const view = buildingsLayer.buildings[id];
      if (!view) continue;

      const derived = deriveBuildingState(id, node.state, node.sessions);

      view.setState(derived);
      view.setPosition(node.position);
      unitsLayer.setAgent(id, node.position, derived, node.sessions, node.activeSessions);
      healthBars.setAgent(id, node.position, derived, node.sessions);
    }

    // Nexus color reflects overall system health.
    const anyError = (Object.entries(s.agents) as [AgentId, MapState['agents'][AgentId]][]).some(
      ([id, a]) => deriveBuildingState(id, a.state, a.sessions) === 'ERROR'
    );
    const anyOverload = (Object.entries(s.agents) as [AgentId, MapState['agents'][AgentId]][]).some(
      ([id, a]) => deriveBuildingState(id, a.state, a.sessions) === 'OVERLOADED'
    );
    if (anyError) nexus.setStateColor(0xff3366);
    else if (anyOverload) nexus.setStateColor(0xff9500);
    else nexus.setStateColor(0xffd700);
  });

  economyStore.subscribe((next) => {
    resourceEconomy.setEconomyState(next);

    const alerts = alertManager.evaluate(next);
    if (alerts.length > 0) {
      resourceEconomy.setAlerts(alerts);
      for (const alert of alerts) {
        console.warn('[tactical-map] budget alert', alert.message);
      }
    }
  });

  // Health store → renderers binding (Phase 5.6)
  healthStore.subscribe((next) => {
    // Update health diagnostics overlay
    healthDiagnostics.setHealthState(next);
    healthDiagnostics.setAlerts(next.alerts);

    // Update dashboard panel
    healthDashboard.setHealthState(next);
    healthDashboard.setAlerts(next.alerts);

    // Run client-side alert evaluation
    const healthAlerts = healthAlertRouter.evaluate(next);
    if (healthAlerts.length > 0) {
      for (const alert of healthAlerts) {
        console.warn('[tactical-map] health alert', alert.severity, alert.message);
      }
    }
  });

  // Connectivity monitor → health store
  connectivityMonitor.onStatusChange((conn) => {
    healthStore.update((curr) => ({
      ...curr,
      connectivity: conn
    }));
  });

  // API polling
  const api = createApiClient({
    onMapState: (s) => mapStore.set(s),
    onError: (e) => console.warn('[tactical-map] api error', e)
  });
  api.start();

  const economyClient = createEconomyClient({
    onSnapshot: (snapshot) => {
      economyStore.update((curr) =>
        applyEconomySnapshot(
          curr,
          snapshot,
          { historyMaxPoints: ECONOMY.HISTORY_MAX_POINTS, historyMaxAgeMs: ECONOMY.HISTORY_MAX_AGE_MS },
          Date.now()
        )
      );
    },
    onAgentUpdate: (agent) => {
      economyStore.update((curr) =>
        applyAgentEconomyUpdate(
          curr,
          agent,
          { historyMaxPoints: ECONOMY.HISTORY_MAX_POINTS, historyMaxAgeMs: ECONOMY.HISTORY_MAX_AGE_MS },
          Date.now()
        )
      );
    },
    onPoolUpdate: (pool) => {
      economyStore.update((curr) => applyPoolEconomyUpdate(curr, pool, Date.now()));
    },
    onConnectionChange: (connected) => resourceEconomy.setConnectionStatus(connected),
    onError: (e) => console.warn('[tactical-map] economy stream error', e)
  });
  economyClient.start();

  // Health client (Phase 5.6)
  const healthClient = createHealthClient({
    onSnapshot: (snapshot) => {
      healthStore.set(snapshot);
    },
    onAgentUpdate: (agentId, health) => {
      healthStore.update((curr) => applyAgentHealthUpdate(curr, { ...health, agentId }, Date.now()));
    },
    onAlert: (alert) => {
      healthStore.update((curr) => applyAlertEvent(curr, alert, HEALTH.MAX_ALERTS, Date.now()));
    },
    onAlertResolved: (alertId, resolvedAt) => {
      healthStore.update((curr) => applyAlertResolvedEvent(curr, alertId, resolvedAt));
    },
    onDiagnostics: (diagnostics) => {
      healthStore.update((curr) => applyDiagnosticsUpdate(curr, diagnostics, Date.now()));
    },
    onConnectionChange: (connected) => {
      connectivityMonitor.setWsConnected(connected);
    },
    onError: (e) => console.warn('[tactical-map] health stream error', e)
  });
  healthClient.start();
  connectivityMonitor.start();

  // Phase 5.7: Keyboard manager
  const keyboard = createKeyboardManager(selectionStore, {
    onToggleHealthDashboard: () => healthDashboard.setVisible(!healthDashboard.isVisible()),
    onToggleMinimap: () => minimap.setVisible(!minimap.isVisible()),
    onToggleDetailPanel: () => {
      // If no agent selected, select first one; otherwise toggle detail panel visibility
      const sel = selectionStore.get();
      if (!sel.selectedId) {
        selectionStore.update((s) => ({ ...s, selectedId: 'oracle' }));
      } else {
        selectionStore.update((s) => ({ ...s, selectedId: null }));
      }
    },
    onToggleHelp: () => helpOverlay.toggle()
  });

  // Phase 5.7: Minimap navigation
  minimap.onNavigate((worldX, worldY) => {
    // Center camera on the clicked world coordinate
    const cx = app.screen.width / 2;
    const cy = app.screen.height / 2;
    camera.setState({
      x: cx - worldX * camera.getState().zoom,
      y: cy - worldY * camera.getState().zoom,
      zoom: camera.getState().zoom
    });
  });

  // HUD tab click handler (Phase 5.6 + 5.7)
  hud.onTabClick((tabName) => {
    if (tabName === 'Health') {
      healthDashboard.setVisible(!healthDashboard.isVisible());
    }
  });

  // KPI ticker
  void pollKpis(() => api.fetchRpgStats(), (t) => hud.setKpiText(t));

  // Render loop
  app.ticker.add((ticker) => {
    const elapsedMs = ticker.deltaMS;

    camera.update(elapsedMs);
    hud.update(elapsedMs);
    khala.update(elapsedMs);
    buildingsLayer.update(elapsedMs);
    unitsLayer.update(elapsedMs);
    nexus.update(elapsedMs);

    // Emit activity particles (rate-based, capped by PARTICLES.MAX).
    const s = mapStore.get();
    for (const id of RING_AGENT_IDS) {
      const node = s.agents[id];
      const derived = deriveBuildingState(id, node.state, node.sessions);
      const origin = node.position;

      if (derived === 'ACTIVE') {
        // Use label of first active session if available.
        const label = (node.activeSessions?.[0]?.label ?? '').slice(0, 200);
        const activity = label ? classifyActivity(label, id) : ActivityType.IDLE;

        // MVP mapping: activity → particle kind
        switch (activity) {
          case ActivityType.ATLAS_DEPLOY:
            particles.emitRate('DEPLOY', origin, 6, elapsedMs);
            break;
          case ActivityType.SENTINEL_SCAN:
          case ActivityType.ATLAS_MONITOR:
            particles.emitRate('SCAN', origin, 5, elapsedMs);
            break;
          case ActivityType.VERIFIER_TEST:
          case ActivityType.SYNTH_CODE:
            particles.emitRate('COMPILING', origin, 5, elapsedMs);
            break;
          case ActivityType.SENTINEL_BLOCK:
          case ActivityType.SENTINEL_ESCALATE:
          case ActivityType.VERIFIER_BUG:
          case ActivityType.ECHO_ESCALATE:
            particles.emitRate('ERROR', origin, 4, elapsedMs);
            break;
          case ActivityType.ORACLE_RESEARCH:
          case ActivityType.ORACLE_ANALYZE:
          case ActivityType.ARCHIVIST_RETRIEVE:
            particles.emitRate('SPARK', origin, 4, elapsedMs);
            break;
          default:
            particles.emitRate('TYPING', origin, 4, elapsedMs);
            break;
        }
      } else if (derived === 'OVERLOADED') {
        particles.emitRate('SPARK', origin, 10, elapsedMs);
        particles.emitRate('ERROR', origin, 3, elapsedMs);
      } else if (derived === 'ERROR') {
        particles.emitRate('SMOKE', origin, 3, elapsedMs);
        particles.emitRate('ERROR', origin, 4, elapsedMs);
      }
    }

    particles.update(elapsedMs);
    healthBars.update(elapsedMs);
    resourceEconomy.update(elapsedMs);

    // Health renderers (Phase 5.6)
    healthDiagnostics.setZoom(camera.getState().zoom);
    healthDiagnostics.update(elapsedMs);
    healthDashboard.update(elapsedMs);

    // Interactive controls (Phase 5.7)
    selectionRing.update(elapsedMs);

    const camState = camera.getState();
    tooltip.setWorldTransform(camState.x, camState.y, camState.zoom);
    tooltip.setHealthData(healthStore.get().agents);
    tooltip.setMapData(s);
    tooltip.update(elapsedMs);

    detailPanel.setHealthData(healthStore.get().agents);
    detailPanel.setMapData(s);
    detailPanel.setAlerts(healthStore.get().alerts);
    detailPanel.update(elapsedMs);

    minimap.setCameraState(camState);
    const agentStatuses: Record<string, string> = {};
    for (const id of AGENT_ORDER) {
      const ah = healthStore.get().agents[id];
      if (ah) agentStatuses[id] = ah.status;
    }
    minimap.setAgentStatuses(agentStatuses as Record<string, import('@/health/types').AgentStatus>);
    minimap.update(elapsedMs);
  });

  window.addEventListener('resize', layout);
  window.addEventListener('beforeunload', () => {
    api.stop();
    economyClient.stop();
    healthClient.stop();
    connectivityMonitor.stop();
    // Phase 5.7 cleanup
    keyboard.destroy();
    selectionRing.destroy();
    tooltip.destroy();
    detailPanel.destroy();
    minimap.destroy();
  });

  layout();

  // Helpful dev surface
  // @ts-expect-error - for debugging
  window.__TACTICAL_MAP__ = {
    app,
    mapStore,
    economyStore,
    healthStore,
    selectionStore,
    api,
    economyClient,
    healthClient,
    camera,
    pause: () => app.ticker.stop(),
    resume: () => app.ticker.start(),
    setMapState: (next: MapState) => mapStore.set(next),
    setEconomyState: (next: EconomyState) => economyStore.set(next),
    setHealthState: (next: HealthState) => healthStore.set(next),
    // deterministic snapshot helper
    snapshot: () => {
      app.render();
    }
  };
}

bootstrap().catch((e) => console.error('[tactical-map] bootstrap failed', e));
