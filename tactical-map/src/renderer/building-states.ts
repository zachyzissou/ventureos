import { AGENT_COLORS, ANIMATION, CAPACITY, COLORS } from '@/config';
import type { AgentId } from '@/config';
import type { BuildingState } from '@/state/types';

export const BUILDING_STATES: BuildingState[] = ['IDLE', 'ACTIVE', 'OVERLOADED', 'ERROR'];

export type BuildingVisual = {
  /** Body fill color. */
  bodyFill: number;
  /** Outline alpha multiplier. */
  outlineAlpha: number;
  /** Glow alpha (plate behind the building). */
  glowAlpha: number;
  /** Blur strength suggestion. */
  glowBlur: number;
  /** Pulse intensity (0-1). */
  pulse: number;
  /** Jitter amount in pixels (overload). */
  jitter: number;
  /** Flicker amount (error). */
  flicker: number;
};

export type BuildingStateConfig = {
  crossfadeMs: number;
};

export const BUILDING_STATE_CONFIG: BuildingStateConfig = {
  crossfadeMs: ANIMATION.STATE_CROSSFADE_MS
};

/**
 * Derive a visual building state.
 *
 * API may already send a state, but we also apply capacity-based overload.
 */
export function deriveBuildingState(agentId: AgentId, raw: BuildingState, sessions?: number): BuildingState {
  if (raw === 'ERROR') return 'ERROR';

  const max = CAPACITY.MAX_SESSIONS[agentId] ?? 1;
  const active = Math.max(0, sessions ?? 0);
  const ratio = active / max;

  // Prefer overload if we're above threshold.
  if (raw === 'OVERLOADED') return 'OVERLOADED';
  if (ratio >= CAPACITY.OVERLOAD_THRESHOLD) return 'OVERLOADED';

  // ACTIVE if sessions present or API says so.
  if (raw === 'ACTIVE') return 'ACTIVE';
  if (active > 0) return 'ACTIVE';

  return 'IDLE';
}

export function capacityRatio(agentId: AgentId, sessions?: number): number {
  const max = CAPACITY.MAX_SESSIONS[agentId] ?? 1;
  return Math.max(0, (sessions ?? 0) / max);
}

function makeVisual(state: BuildingState): Omit<BuildingVisual, 'bodyFill'> {
  switch (state) {
    case 'ACTIVE':
      return { outlineAlpha: 1.0, glowAlpha: 0.32, glowBlur: 14, pulse: 1.0, jitter: 0, flicker: 0 };
    case 'OVERLOADED':
      return { outlineAlpha: 1.0, glowAlpha: 0.45, glowBlur: 16, pulse: 1.25, jitter: 2.0, flicker: 0.1 };
    case 'ERROR':
      return { outlineAlpha: 0.9, glowAlpha: 0.22, glowBlur: 10, pulse: 0.75, jitter: 0.6, flicker: 0.7 };
    case 'IDLE':
    default:
      return { outlineAlpha: 0.85, glowAlpha: 0.18, glowBlur: 10, pulse: 0.35, jitter: 0, flicker: 0 };
  }
}

function stateBodyFill(state: BuildingState): number {
  switch (state) {
    case 'ACTIVE':
      return COLORS.STATE_ACTIVE;
    case 'OVERLOADED':
      return COLORS.STATE_OVERLOADED;
    case 'ERROR':
      return COLORS.STATE_ERROR;
    case 'IDLE':
    default:
      return COLORS.STATE_IDLE;
  }
}

/**
 * Visual presets for all 8 agents × 4 states (32 combos).
 *
 * Mostly state-driven; agent-specific color is applied in the building renderer.
 */
export const BUILDING_VISUALS: Record<AgentId, Record<BuildingState, BuildingVisual>> = {
  venture_research: {
    IDLE: { bodyFill: stateBodyFill('IDLE'), ...makeVisual('IDLE') },
    ACTIVE: { bodyFill: stateBodyFill('ACTIVE'), ...makeVisual('ACTIVE') },
    OVERLOADED: { bodyFill: stateBodyFill('OVERLOADED'), ...makeVisual('OVERLOADED') },
    ERROR: { bodyFill: stateBodyFill('ERROR'), ...makeVisual('ERROR') }
  },
  venture_infrastructure: {
    IDLE: { bodyFill: stateBodyFill('IDLE'), ...makeVisual('IDLE') },
    ACTIVE: { bodyFill: stateBodyFill('ACTIVE'), ...makeVisual('ACTIVE') },
    OVERLOADED: { bodyFill: stateBodyFill('OVERLOADED'), ...makeVisual('OVERLOADED') },
    ERROR: { bodyFill: stateBodyFill('ERROR'), ...makeVisual('ERROR') }
  },
  venture_security: {
    IDLE: { bodyFill: stateBodyFill('IDLE'), ...makeVisual('IDLE') },
    ACTIVE: { bodyFill: stateBodyFill('ACTIVE'), ...makeVisual('ACTIVE') },
    OVERLOADED: { bodyFill: stateBodyFill('OVERLOADED'), ...makeVisual('OVERLOADED') },
    ERROR: { bodyFill: stateBodyFill('ERROR'), ...makeVisual('ERROR') }
  },
  venture_evidence: {
    IDLE: { bodyFill: stateBodyFill('IDLE'), ...makeVisual('IDLE') },
    ACTIVE: { bodyFill: stateBodyFill('ACTIVE'), ...makeVisual('ACTIVE') },
    OVERLOADED: { bodyFill: stateBodyFill('OVERLOADED'), ...makeVisual('OVERLOADED') },
    ERROR: { bodyFill: stateBodyFill('ERROR'), ...makeVisual('ERROR') }
  },
  venture_memory: {
    IDLE: { bodyFill: stateBodyFill('IDLE'), ...makeVisual('IDLE') },
    ACTIVE: { bodyFill: stateBodyFill('ACTIVE'), ...makeVisual('ACTIVE') },
    OVERLOADED: { bodyFill: stateBodyFill('OVERLOADED'), ...makeVisual('OVERLOADED') },
    ERROR: { bodyFill: stateBodyFill('ERROR'), ...makeVisual('ERROR') }
  },
  venture_delivery: {
    IDLE: { bodyFill: stateBodyFill('IDLE'), ...makeVisual('IDLE') },
    ACTIVE: { bodyFill: stateBodyFill('ACTIVE'), ...makeVisual('ACTIVE') },
    OVERLOADED: { bodyFill: stateBodyFill('OVERLOADED'), ...makeVisual('OVERLOADED') },
    ERROR: { bodyFill: stateBodyFill('ERROR'), ...makeVisual('ERROR') }
  },
  venture_strategy: {
    IDLE: { bodyFill: stateBodyFill('IDLE'), ...makeVisual('IDLE') },
    ACTIVE: { bodyFill: stateBodyFill('ACTIVE'), ...makeVisual('ACTIVE') },
    OVERLOADED: { bodyFill: stateBodyFill('OVERLOADED'), ...makeVisual('OVERLOADED') },
    ERROR: { bodyFill: stateBodyFill('ERROR'), ...makeVisual('ERROR') }
  },
  venture_control: {
    IDLE: { bodyFill: stateBodyFill('IDLE'), ...makeVisual('IDLE') },
    ACTIVE: { bodyFill: stateBodyFill('ACTIVE'), ...makeVisual('ACTIVE') },
    OVERLOADED: { bodyFill: stateBodyFill('OVERLOADED'), ...makeVisual('OVERLOADED') },
    ERROR: { bodyFill: stateBodyFill('ERROR'), ...makeVisual('ERROR') }
  }
};

export function agentGlowColor(agentId: AgentId): number {
  return AGENT_COLORS[agentId];
}
