import { Application, Container } from 'pixi.js';
import { AGENT_ORDER, AGENTS, CANVAS, ECONOMY } from '@/config';
import type { AgentId, Point } from '@/config';
import type { UserRole } from '@/interaction';
import { createApiClient } from '@/data/api-client';
import { createEconomyClient } from '@/data/economy-client';
import { createHealthClient } from '@/data/health-client';
import { classifyActivity, ActivityType } from '@/data/activity-mapper';
import { createCameraController } from '@/interaction/camera';
import { createEventBus, createInteractionController } from '@/interaction';
import { createControlClient } from '@/data/control-client';
import { createBuildingsLayer, RING_AGENT_IDS } from '@/renderer/buildings';
import { createHud, pollKpis } from '@/renderer/hud';
import { createNexus } from '@/renderer/nexus';
import { createTerrain } from '@/renderer/terrain';
import { createHealthBarsLayer } from '@/renderer/health-bars';
import { createUnitsLayer } from '@/renderer/units';
import { createParticleSystem } from '@/renderer/particles';
import { createAffinityNetworkLayer } from '@/renderer/affinity-network';
import { createResourceEconomyLayer } from '@/renderer/resource-economy';
import { createHealthIndicatorsLayer } from '@/renderer/health-indicators';
import { createAlertOverlay } from '@/renderer/alert-overlay';
import { createHealthDashboard } from '@/renderer/health-dashboard';
import { createAgentDetailPanel } from '@/renderer/agent-detail-panel';
import { createMissionSpawnModal } from '@/renderer/mission-spawn-modal';
import { createConfirmationDialog } from '@/renderer/confirmation-dialog';
import { createCommandPalette } from '@/renderer/command-palette';
import { createBudgetSlider } from '@/renderer/budget-slider';
import { createTourOverlay } from '@/renderer/tour-overlay';
import { createHelpOverlay } from '@/renderer/help-overlay';
import { createTourController } from '@/tour/controller';
import { DEFAULT_TOUR_STEPS, HELP_ENTRIES } from '@/tour/steps';
import { deriveBuildingState } from '@/renderer/building-states';
import { BudgetAlertManager } from '@/economy/alerts';
import { HealthAlertManager } from '@/health/alerts';
import {
  applyAgentEconomyUpdate,
  applyEconomySnapshot,
  applyPoolEconomyUpdate,
  createEmptyEconomyState
} from '@/economy/state';
import {
  applyHealthSnapshot,
  applyAgentHealthUpdate,
  addHealthAlert,
  createEmptyHealthState,
  expireAlerts,
} from '@/health/state';
import type { HealthState } from '@/health/types';
import type { EconomyState } from '@/economy/types';
import { createStore } from '@/state/store';
import type { MapState } from '@/state/types';

function createInitialMapState(): MapState {
  const agents = {} as MapState['agents'];
  for (let i = 0; i < AGENT_ORDER.length; i++) {
    const id = AGENT_ORDER[i];
    agents[id] = {
      id,
      position: id === 'nexus' ? { x: 0, y: 0 } : AGENTS.POSITIONS[i] ?? { x: 0, y: 0 },
      state: 'IDLE',
      paused: false,
    };
  }
  return { updatedAt: new Date().toISOString(), agents };
}

const mapStore = createStore<MapState>(createInitialMapState());
const economyStore = createStore<EconomyState>(createEmptyEconomyState());
const healthStore = createStore<HealthState>(createEmptyHealthState());

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
  app.canvas.tabIndex = 0;
  app.canvas.addEventListener('pointerdown', () => app.canvas.focus());

  // Enable event system across the full screen.
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  const interactionBus = createEventBus();

  // World container (camera transforms applied here)
  const world = new Container();
  app.stage.addChild(world);

  const terrain = createTerrain();
  world.addChild(terrain.container);

  const affinityNetwork = createAffinityNetworkLayer();
  world.addChild(affinityNetwork.container);

  const particles = createParticleSystem({ seed: 1337 });
  world.addChild(particles.container);

  const buildingsLayer = createBuildingsLayer();
  world.addChild(buildingsLayer.container);

  const unitsLayer = createUnitsLayer(RING_AGENT_IDS);
  world.addChild(unitsLayer.container);

  for (const id of RING_AGENT_IDS) {
    const building = buildingsLayer.buildings[id];
    building?.container.on('pointertap', (evt) => {
      evt.stopPropagation();
      interactionBus.emit({
        type: 'agent:click',
        agentId: id,
        timestamp: performance.now(),
      });
    });
  }

  const nexus = createNexus();
  world.addChild(nexus.container);

  const healthBars = createHealthBarsLayer(RING_AGENT_IDS);
  world.addChild(healthBars.container);

  const healthIndicators = createHealthIndicatorsLayer();
  world.addChild(healthIndicators.container);

  const resourceEconomy = createResourceEconomyLayer();
  world.addChild(resourceEconomy.worldContainer);

  // HUD overlays
  const hud = createHud();
  app.stage.addChild(hud.container);
  app.stage.addChild(resourceEconomy.overlayContainer);

  const alertOverlay = createAlertOverlay();
  app.stage.addChild(alertOverlay.container);

  const healthDashboard = createHealthDashboard();
  app.stage.addChild(healthDashboard.container);

  // Interactive controls overlays (Phase 5.7)
  const detailPanel = createAgentDetailPanel(interactionBus);
  const missionSpawnModal = createMissionSpawnModal();
  const confirmationDialog = createConfirmationDialog();
  const commandPalette = createCommandPalette();
  const budgetSlider = createBudgetSlider();

  budgetSlider.container.position.set(0, 0);

  const tourOverlay = createTourOverlay();
  const helpOverlay = createHelpOverlay(HELP_ENTRIES);

  app.stage.addChild(detailPanel.container);
  app.stage.addChild(budgetSlider.container);
  app.stage.addChild(missionSpawnModal.container);
  app.stage.addChild(confirmationDialog.container);
  app.stage.addChild(commandPalette.container);
  app.stage.addChild(helpOverlay.container);
  app.stage.addChild(tourOverlay.container);

  const controlClient = createControlClient({
    onError: (e) => console.warn('[tactical-map] control api error', e)
  });

  const interactionController = createInteractionController({
    eventBus: interactionBus,
    mapStore,
    healthStore,
    economyStore,
    controlClient,
    detailPanel,
    confirmDialog: confirmationDialog,
    missionModal: missionSpawnModal,
    commandPalette,
    budgetSlider,
    canvas: app.canvas,
  });

  const tourController = createTourController({
    eventBus: interactionBus, tourOverlay, helpOverlay, steps: DEFAULT_TOUR_STEPS,
  });
  if (!tourController.hasCompleted()) setTimeout(() => tourController.start(), 800);

  // Default to admin controls in tactical view unless explicitly overridden.
  const roleParam = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('role')
    : null;
  const requestedRole = roleParam === 'viewer' || roleParam === 'operator' || roleParam === 'admin'
    ? roleParam
    : null;
  interactionController.setUserRole((requestedRole ?? 'admin') as UserRole);

  const alertManager = new BudgetAlertManager({
    warningRatio: ECONOMY.WARNING_THRESHOLD,
    criticalRatio: ECONOMY.CRITICAL_THRESHOLD,
    cooldownMs: ECONOMY.ALERT_COOLDOWN_MS
  });

  const healthAlertManager = new HealthAlertManager();

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
    alertOverlay.setViewport(app.screen.width, app.screen.height);
    healthDashboard.setViewport(app.screen.width, app.screen.height);

    detailPanel.setViewport(app.screen.width, app.screen.height);
    missionSpawnModal.setViewport(app.screen.width, app.screen.height);
    confirmationDialog.setViewport(app.screen.width, app.screen.height);
    commandPalette.setViewport(app.screen.width, app.screen.height);
    tourOverlay.setViewport(app.screen.width, app.screen.height);
    helpOverlay.setViewport(app.screen.width, app.screen.height);

    // Align budget slider near the lower portion of detail panel.
    const panelX = app.screen.width - 320 - 20;
    const panelY = 20;
    budgetSlider.container.position.set(panelX + 16, panelY + 330);
  }

  function onTourKeyDown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    if (e.key === '?' && !meta) { e.preventDefault(); tourController.toggleHelp(); return; }
    if (meta && e.key === '/') { e.preventDefault(); tourController.start(); return; }
    if (e.key === 'Escape' && helpOverlay.isVisible()) { helpOverlay.hide(); return; }
  }
  window.addEventListener('keydown', onTourKeyDown);

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

    interactionBus.emit({ type: 'terrain:click', timestamp: performance.now() });
  });

  // Keep nexus centered in world space.
  nexus.container.position.set(0, 0);
  nexus.container.eventMode = 'static';
  nexus.container.cursor = 'pointer';
  nexus.container.on('pointertap', (evt) => {
    evt.stopPropagation();
    interactionBus.emit({ type: 'agent:click', agentId: 'nexus', timestamp: performance.now() });
  });

  // ── Accessibility: screen reader announcements ──────────────────
  const srAnnouncements = document.getElementById('sr-announcements');
  const srSummary = document.getElementById('sr-agent-summary');
  let prevStates: Record<string, string> = {};

  function announceStateChanges(s: MapState) {
    const changes: string[] = [];
    for (const id of AGENT_ORDER) {
      const curr = s.agents[id].state;
      if (prevStates[id] && prevStates[id] !== curr) {
        changes.push(`${id} is now ${curr.toLowerCase()}`);
      }
      prevStates[id] = curr;
    }
    if (changes.length > 0 && srAnnouncements) {
      srAnnouncements.textContent = changes.join('. ') + '.';
    }
    if (srSummary) {
      const counts: Record<string, number> = {};
      for (const id of AGENT_ORDER) {
        const st = s.agents[id].state;
        counts[st] = (counts[st] || 0) + 1;
      }
      const parts = Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase()}`);
      srSummary.textContent = `Agent status: ${parts.join(', ')}. Keyboard: R reset, +/- zoom, arrows pan.`;
    }
  }

  // Accessible label on canvas element
  if (app.canvas) {
    app.canvas.setAttribute('role', 'img');
    app.canvas.setAttribute('aria-label', 'Tactical map visualization showing agent positions, states, and network connections');
  }

  // Store → view binding
  mapStore.subscribe((s) => {
    announceStateChanges(s);
    // affinity links + resource overlays follow agent positions.
    const pos = {} as Record<AgentId, Point>;
    for (const id of AGENT_ORDER) pos[id] = s.agents[id].position;
    affinityNetwork.setAgentPositions(pos);
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

  healthStore.subscribe((next) => {
    // Update per-agent health indicators
    const mapState = mapStore.get();
    for (const id of AGENT_ORDER) {
      const agent = next.agents[id];
      const pos = mapState.agents[id]?.position ?? { x: 0, y: 0 };
      healthIndicators.setAgentHealth(
        id,
        pos,
        agent.status,
        agent.connectivity,
        agent.metrics.cpuUsage,
        agent.metrics.memoryUsage,
        agent.metrics.latencyMs
      );
    }

    // Update alert overlay
    alertOverlay.setAlerts(next.alerts);

    // Update health dashboard
    healthDashboard.setHealthState(next);

    // Evaluate alerts
    const agentAlerts = healthAlertManager.evaluate(next);
    const systemAlerts = healthAlertManager.evaluateSystemAlerts(next);
    const allAlerts = [...agentAlerts, ...systemAlerts];

    if (allAlerts.length > 0) {
      healthStore.update((curr) => {
        let state = curr;
        for (const alert of allAlerts) {
          state = addHealthAlert(state, alert);
          console.warn('[tactical-map] health alert', alert.message);
        }
        return state;
      });
    }

    // Expire old alerts
    const nowMs = Date.now();
    const expired = expireAlerts(next, nowMs);
    if (expired !== next) {
      healthStore.set(expired);
    }
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

  const healthClient = createHealthClient({
    onSnapshot: (snapshot) => {
      healthStore.update((curr) =>
        applyHealthSnapshot(curr, snapshot, undefined, undefined, Date.now())
      );
    },
    onAgentUpdate: (agent) => {
      healthStore.update((curr) =>
        applyAgentHealthUpdate(curr, agent, undefined, undefined, Date.now())
      );
    },
    onAlert: (rawAlert) => {
      if (!rawAlert) return;
      const alert = {
        id: rawAlert.id ?? `server-alert-${Date.now()}`,
        severity: (rawAlert.severity === 'P0' ? 'P0' : 'P1') as 'P0' | 'P1',
        state: 'active' as const,
        agentId: (rawAlert.agentId ?? 'system') as AgentId | 'system',
        title: rawAlert.severity === 'P0' ? '🔴 Critical Alert' : '🟡 Warning',
        message: rawAlert.message ?? rawAlert.title ?? 'Health alert',
        metric: rawAlert.metric,
        value: rawAlert.value,
        threshold: rawAlert.threshold,
        createdAt: typeof rawAlert.createdAt === 'number' ? rawAlert.createdAt : Date.now(),
        ttlMs: rawAlert.ttlMs ?? 0,
      };
      healthStore.update((curr) => addHealthAlert(curr, alert));
    },
    onConnectionChange: (connected) => {
      console.log(`[tactical-map] health WS ${connected ? 'connected' : 'disconnected'}`);
    },
    onError: (e) => console.warn('[tactical-map] health stream error', e),
  });
  healthClient.start();

  // KPI ticker
  void pollKpis(() => api.fetchRpgStats(), (t) => hud.setKpiText(t));

  // Render loop
  app.ticker.add((ticker) => {
    const elapsedMs = ticker.deltaMS;

    camera.update(elapsedMs);
    hud.update(elapsedMs);
    affinityNetwork.update(elapsedMs);
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
    healthIndicators.update(elapsedMs);
    alertOverlay.update(elapsedMs);
    healthDashboard.update(elapsedMs);
    detailPanel.update(elapsedMs);
    missionSpawnModal.update(elapsedMs);
    confirmationDialog.update(elapsedMs);
    commandPalette.update(elapsedMs);
    budgetSlider.update(elapsedMs);
    tourOverlay.update(elapsedMs);
    helpOverlay.update(elapsedMs);
    resourceEconomy.update(elapsedMs);
  });

  window.addEventListener('resize', layout);
  window.addEventListener('beforeunload', () => {
    api.stop();
    economyClient.stop();
    healthClient.stop();
    interactionController.destroy();
    tourController.destroy();
    window.removeEventListener('keydown', onTourKeyDown);
  });

  layout();

  // Helpful dev surface
  // @ts-expect-error - for debugging
  window.__TACTICAL_MAP__ = {
    app,
    mapStore,
    economyStore,
    healthStore,
    api,
    economyClient,
    healthClient,
    camera,
    interactionController,
    interactionBus,
    controlClient,
    pause: () => app.ticker.stop(),
    resume: () => app.ticker.start(),
    resetVisualState: () => {
      // Deterministic reset for visual regression tests.
      particles.reset();
      affinityNetwork.reset();
      app.render();
    },
    setMapState: (next: MapState) => mapStore.set(next),
    setEconomyState: (next: EconomyState) => economyStore.set(next),
    setHealthState: (next: HealthState) => healthStore.set(next),
    toggleHealthDashboard: () => healthDashboard.setVisible(!healthDashboard.isVisible()),
    setUserRole: (role: UserRole) => interactionController.setUserRole(role),
    tourController,
    startTour: () => tourController.start(),
    toggleHelp: () => tourController.toggleHelp(),
    // deterministic snapshot helper
    snapshot: () => {
      app.render();
    }
  };
}

bootstrap().catch((e) => console.error('[tactical-map] bootstrap failed', e));
