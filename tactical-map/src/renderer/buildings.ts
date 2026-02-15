import { BlurFilter, Container, Graphics, Text } from 'pixi.js';
import { AGENTS, AGENT_COLORS } from '@/config';
import type { AgentId, Point } from '@/config';
import type { BuildingState } from '@/state/types';
import { hexagonPoints, toPixiPolygon } from '@/renderer/primitives';
import { BUILDING_STATE_CONFIG, BUILDING_VISUALS, agentGlowColor } from '@/renderer/building-states';

export const RING_AGENT_IDS: AgentId[] = [
  'oracle',
  'atlas',
  'sentinel',
  'verifier',
  'archivist',
  'synth',
  'echo'
];

type Crossfade = {
  from: BuildingState;
  to: BuildingState;
  tMs: number;
};

export type BuildingView = {
  id: AgentId;
  container: Container;
  setState: (state: BuildingState) => void;
  setPosition: (p: Point) => void;
  /** per-frame update */
  update: (elapsedMs: number) => void;
};

export type BuildingsLayer = {
  container: Container;
  buildings: Record<string, BuildingView>;
  update: (elapsedMs: number) => void;
};

function drawBody(g: Graphics, pts: number[], fill: number) {
  g.clear();
  g.poly(pts, true).fill({ color: fill, alpha: 0.95 });
}

function createBuilding(id: AgentId, initialState: BuildingState): BuildingView {
  const container = new Container();
  container.eventMode = 'static';
  container.cursor = 'pointer';

  const size = AGENTS.BUILDING_SIZE;
  const r = size * 0.48;
  const pts = toPixiPolygon(hexagonPoints(r));

  // Glow plate
  const glow = new Graphics();
  glow.poly(pts, true).fill({ color: agentGlowColor(id), alpha: BUILDING_VISUALS[id][initialState].glowAlpha });
  const glowBlur = new BlurFilter({ strength: BUILDING_VISUALS[id][initialState].glowBlur });
  glow.filters = [glowBlur];
  glow.scale.set(1.12);

  // Two bodies for crossfade
  let bodyFront = new Graphics();
  let bodyBack = new Graphics();
  drawBody(bodyFront, pts, BUILDING_VISUALS[id][initialState].bodyFill);
  drawBody(bodyBack, pts, BUILDING_VISUALS[id][initialState].bodyFill);
  bodyFront.alpha = 1;
  bodyBack.alpha = 0;

  // Outline
  const outline = new Graphics();
  outline.poly(pts, true).stroke({ width: 2, color: AGENT_COLORS[id], alpha: BUILDING_VISUALS[id][initialState].outlineAlpha });

  // Inner detail
  const inner = new Graphics();
  inner
    .poly(toPixiPolygon(hexagonPoints(r * 0.62)), true)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.08 });

  const label = new Text({
    text: id.toUpperCase(),
    style: {
      fontSize: 14,
      fill: 0xffffff,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    }
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, r + 10);
  label.alpha = 0.9;

  container.addChild(glow, bodyFront, bodyBack, outline, inner, label);

  let state: BuildingState = initialState;
  let crossfade: Crossfade | null = null;
  let timeS = 0;
  let basePos: Point = { x: 0, y: 0 };

  function applyStateStyles(s: BuildingState) {
    const v = BUILDING_VISUALS[id][s];
    glow.clear();
    glow.poly(pts, true).fill({ color: agentGlowColor(id), alpha: v.glowAlpha });
    // Update blur strength defensively (Pixi types differ between mocks/real).
    const f = glowBlur as unknown as { strength?: number };
    if (typeof f.strength === 'number') f.strength = v.glowBlur;

    outline.clear();
    outline.poly(pts, true).stroke({ width: 2, color: AGENT_COLORS[id], alpha: v.outlineAlpha });
  }

  function setState(next: BuildingState) {
    if (next === state && !crossfade) return;

    // Start a new crossfade.
    crossfade = { from: state, to: next, tMs: 0 };

    // Ensure the back buffer renders above the front buffer for a true crossfade.
    const c = container as unknown as {
      swapChildren?: (a: unknown, b: unknown) => void;
      getChildIndex?: (a: unknown) => number;
    };
    if (c.swapChildren && c.getChildIndex) {
      try {
        const iFront = c.getChildIndex(bodyFront);
        const iBack = c.getChildIndex(bodyBack);
        if (iBack < iFront) c.swapChildren(bodyFront, bodyBack);
      } catch {
        // ignore
      }
    }

    // Draw new target into the back buffer.
    drawBody(bodyBack, pts, BUILDING_VISUALS[id][next].bodyFill);
    bodyBack.alpha = 0;
    bodyFront.alpha = 1;

    // Apply state styles for the target (glow/outline will animate in update).
    applyStateStyles(next);

    state = next;
  }

  function update(elapsedMs: number) {
    timeS += elapsedMs / 1000;

    // Crossfade alpha update
    if (crossfade) {
      crossfade.tMs += elapsedMs;
      const t = Math.min(1, crossfade.tMs / BUILDING_STATE_CONFIG.crossfadeMs);
      bodyFront.alpha = 1 - t;
      bodyBack.alpha = t;
      if (t >= 1) {
        // Swap buffers.
        const tmp = bodyFront;
        bodyFront = bodyBack;
        bodyBack = tmp;
        bodyBack.alpha = 0;
        bodyFront.alpha = 1;
        crossfade = null;
      }
    }

    // Procedural per-state animation (frame-rate independent).
    const v = BUILDING_VISUALS[id][state];

    // Pulse glow scale/alpha.
    const pulse = Math.sin(timeS * (1.2 + v.pulse)) * 0.5 + 0.5; // 0..1
    const glowScale = 1.10 + pulse * 0.06 * v.pulse;
    glow.scale.set(glowScale);
    glow.alpha = 0.75 + pulse * 0.25;

    // Active: rotate inner detail subtly.
    inner.rotation = state === 'ACTIVE' ? timeS * 0.35 : timeS * 0.08;

    // Overload/Error: jitter.
    if (v.jitter > 0) {
      const jx = Math.sin(timeS * 17) * v.jitter;
      const jy = Math.cos(timeS * 13) * v.jitter;
      container.position.set(basePos.x + jx, basePos.y + jy);
    } else {
      container.position.set(basePos.x, basePos.y);
    }

    // Error flicker (avoid fighting crossfade)
    if (!crossfade && v.flicker > 0) {
      const flick = (Math.sin(timeS * 23) * 0.5 + 0.5) * v.flicker;
      bodyFront.alpha = Math.max(0.15, bodyFront.alpha * (1 - flick));
    }
  }

  function setPosition(p: Point) {
    basePos = p;
    container.position.set(p.x, p.y);
  }

  return { id, container, setState, setPosition, update };
}

export function createBuildingsLayer(): BuildingsLayer {
  const container = new Container();
  const buildings: Record<string, BuildingView> = {};

  for (let i = 0; i < RING_AGENT_IDS.length; i++) {
    const id = RING_AGENT_IDS[i];
    const view = createBuilding(id, 'IDLE');
    const pos = AGENTS.POSITIONS[i];
    view.setPosition(pos);
    buildings[id] = view;
    container.addChild(view.container);
  }

  function update(elapsedMs: number) {
    for (const b of Object.values(buildings)) b.update(elapsedMs);
  }

  return { container, buildings, update };
}
