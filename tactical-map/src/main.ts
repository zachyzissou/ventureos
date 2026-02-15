import { Application, Container } from 'pixi.js';
import { AGENT_ORDER, AGENTS, CANVAS } from '@/config';
import type { AgentId, Point } from '@/config';
import { createApiClient } from '@/data/api-client';
import { classifyActivity, ActivityType } from '@/data/activity-mapper';
import { createCameraController } from '@/interaction/camera';
import { createBuildingsLayer, RING_AGENT_IDS } from '@/renderer/buildings';
import { createHud, pollKpis } from '@/renderer/hud';
import { createNexus } from '@/renderer/nexus';
import { createTerrain } from '@/renderer/terrain';
import { createHealthBarsLayer } from '@/renderer/health-bars';
import { createUnitsLayer } from '@/renderer/units';
import { createParticleSystem } from '@/renderer/particles';
import { createKhalaNetworkLayer } from '@/renderer/khala-network';
import { deriveBuildingState } from '@/renderer/building-states';
import { createStore } from '@/state/store';
import type { MapState } from '@/state/types';

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

  // HUD overlays
  const hud = createHud();
  app.stage.addChild(hud.container);

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

  // Keep nexus centered in world space.
  nexus.container.position.set(0, 0);

  // Store → view binding
  mapStore.subscribe((s) => {
    // Khala bonds follow agent positions.
    const pos = {} as Record<AgentId, Point>;
    for (const id of AGENT_ORDER) pos[id] = s.agents[id].position;
    khala.setAgentPositions(pos);

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

  // API polling
  const api = createApiClient({
    onMapState: (s) => mapStore.set(s),
    onError: (e) => console.warn('[tactical-map] api error', e)
  });
  api.start();

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
  });

  window.addEventListener('resize', layout);
  layout();

  // Helpful dev surface
  // @ts-expect-error - for debugging
  window.__TACTICAL_MAP__ = {
    app,
    mapStore,
    api,
    camera,
    pause: () => app.ticker.stop(),
    resume: () => app.ticker.start(),
    setMapState: (next: MapState) => mapStore.set(next),
    // deterministic snapshot helper
    snapshot: () => {
      app.render();
    }
  };
}

bootstrap().catch((e) => console.error('[tactical-map] bootstrap failed', e));
