import { Container, Graphics, Text } from 'pixi.js';
import { AGENTS, AGENT_COLORS } from '@/config';
import type { AgentId, Point } from '@/config';
import type { AgentSession, BuildingState } from '@/state/types';
import { ActivityType, classifyActivity } from '@/data/activity-mapper';
import { sanitizePlainText } from '@/utils/sanitize';

export type UnitViewModel = {
  id: string;
  label: string;
  startedAt: string;
  estimatedMs?: number;
  progress?: number;
};

export type UnitsLayer = {
  container: Container;
  setAgent: (agentId: AgentId, buildingPos: Point, state: BuildingState, sessions?: number, activeSessions?: AgentSession[]) => void;
  update: (elapsedMs: number) => void;
};

type UnitView = {
  container: Container;
  dot: Graphics;
  progress: Graphics;
  label: Text;
  orbitAngle: number;
  orbitSpeed: number;
  orbitRadius: number;
  agentId: AgentId;
  pos: Point;
  session?: UnitViewModel;
};

function progressColor(ratio: number): number {
  // <1.0 green, 1.0-1.5 yellow, >1.5 red (spec)
  if (ratio <= 1.0) return 0x33ff88;
  if (ratio <= 1.5) return 0xf6c445;
  return 0xff3333;
}

function activitySpeed(activity: ActivityType, state: BuildingState): number {
  if (state === 'ERROR') return 0.15;
  if (state === 'OVERLOADED') return 0.9;

  switch (activity) {
    case ActivityType.ATLAS_DEPLOY:
    case ActivityType.ECHO_ORCHESTRATE:
      return 1.1;
    case ActivityType.SENTINEL_SCAN:
    case ActivityType.VERIFIER_TEST:
      return 0.95;
    case ActivityType.SYNTH_CODE:
      return 1.0;
    default:
      return state === 'ACTIVE' ? 0.75 : 0.25;
  }
}

export function createUnitsLayer(agentIds: AgentId[]): UnitsLayer {
  const container = new Container();
  const unitsByAgent = new Map<AgentId, UnitView[]>();

  for (const id of agentIds) unitsByAgent.set(id, []);

  let tS = 0;

  function ensureCount(agentId: AgentId, count: number) {
    const list = unitsByAgent.get(agentId);
    if (!list) return [];

    while (list.length < count) {
      const u = createUnit(agentId, list.length);
      list.push(u);
      container.addChild(u.container);
    }

    while (list.length > count) {
      const u = list.pop();
      if (u) u.container.removeFromParent();
    }

    return list;
  }

  function createUnit(agentId: AgentId, index: number): UnitView {
    const unit = new Container();

    const dot = new Graphics();
    dot.circle(0, 0, AGENTS.UNIT_SIZE * 0.14).fill({ color: AGENT_COLORS[agentId], alpha: 0.92 });

    const glow = new Graphics();
    glow.circle(0, 0, AGENTS.UNIT_SIZE * 0.28).fill({ color: AGENT_COLORS[agentId], alpha: 0.10 });

    const progress = new Graphics();

    const label = new Text({
      text: '',
      style: {
        fontSize: 10,
        fill: 0xffffff,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      }
    });
    label.anchor.set(0.5, 1);
    label.alpha = 0.0;

    unit.addChild(glow, dot, progress, label);

    return {
      container: unit,
      dot,
      progress,
      label,
      orbitAngle: (index / 6) * Math.PI * 2,
      orbitSpeed: 0.6,
      orbitRadius: AGENTS.UNIT_ORBIT_RADIUS,
      agentId,
      pos: { x: 0, y: 0 }
    };
  }

  function setAgent(agentId: AgentId, buildingPos: Point, state: BuildingState, sessions?: number, activeSessions?: AgentSession[]) {
    const sessionCount = activeSessions?.length ?? Math.max(0, sessions ?? 0);
    const list = ensureCount(agentId, sessionCount);

    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      u.pos = buildingPos;
      u.orbitRadius = AGENTS.UNIT_ORBIT_RADIUS + i * 6;

      const label = activeSessions?.[i]?.label ?? '';
      const activity = label ? classifyActivity(label, agentId) : ActivityType.IDLE;
      u.orbitSpeed = activitySpeed(activity, state);

      // Session/progress
      const s = activeSessions?.[i];
      if (s) {
        u.session = {
          id: s.id,
          label: sanitizePlainText(s.label, 200),
          startedAt: s.startedAt,
          estimatedMs: s.estimatedMs,
          progress: s.progress
        };
      } else {
        u.session = undefined;
      }

      // subtle visibility based on state
      u.container.alpha = state === 'IDLE' ? 0.0 : 1.0;
    }
  }

  function updateUnit(u: UnitView, elapsedMs: number) {
    const dt = elapsedMs / 1000;
    u.orbitAngle += dt * u.orbitSpeed;

    const x = u.pos.x + Math.cos(u.orbitAngle) * u.orbitRadius;
    const y = u.pos.y + Math.sin(u.orbitAngle) * u.orbitRadius;
    u.container.position.set(x, y);

    // Progress bar
    u.progress.clear();

    const pbW = 40;
    const pbH = 4;
    const yOff = -16;

    let p = u.session?.progress;

    // If explicit progress isn't provided, compute time ratio for coloring (if estimate exists).
    if (p == null && u.session?.estimatedMs && u.session.startedAt) {
      const start = Date.parse(u.session.startedAt);
      if (!Number.isNaN(start)) {
        const elapsed = Date.now() - start;
        p = Math.max(0, Math.min(1.5, elapsed / u.session.estimatedMs));
      }
    }

    if (typeof p === 'number') {
      const ratio = Math.max(0, p);
      const color = progressColor(ratio <= 1 ? 0.9 : ratio);
      u.progress
        .roundRect(-pbW / 2, yOff, pbW, pbH, 2)
        .fill({ color: 0x000000, alpha: 0.55 });
      u.progress
        .roundRect(-pbW / 2 + 1, yOff + 1, (pbW - 2) * Math.min(1, ratio), pbH - 2, 2)
        .fill({ color, alpha: 0.95 });
    }

    // Optional label on hover later; for now keep hidden.
    u.label.alpha = 0;
  }

  function update(elapsedMs: number) {
    tS += elapsedMs / 1000;
    for (const units of unitsByAgent.values()) {
      for (const u of units) updateUnit(u, elapsedMs);
    }
  }

  return { container, setAgent, update };
}
