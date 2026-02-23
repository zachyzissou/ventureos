import { describe, it, expect } from 'vitest';
import { BUILDING_VISUALS, BUILDING_STATES, deriveBuildingState, capacityRatio } from '@/renderer/building-states';
import { AGENT_ORDER, CAPACITY } from '@/config';
import type { AgentId } from '@/config';

describe('building-states', () => {
  it('exports exactly 4 building states', () => {
    expect(BUILDING_STATES).toEqual(['IDLE', 'ACTIVE', 'OVERLOADED', 'ERROR']);
  });

  it('defines visuals for all 8 agents × 4 states (32 combos)', () => {
    for (const agentId of AGENT_ORDER) {
      const agentVisuals = BUILDING_VISUALS[agentId];
      expect(agentVisuals).toBeTruthy();
      for (const state of BUILDING_STATES) {
        const v = agentVisuals[state];
        expect(v).toBeTruthy();
        expect(typeof v.bodyFill).toBe('number');
        expect(v.glowAlpha).toBeGreaterThanOrEqual(0);
        expect(v.glowBlur).toBeGreaterThan(0);
      }
    }
  });

  it('derives overload by capacity threshold (>= 0.8)', () => {
    const id: AgentId = 'oracle';
    const max = CAPACITY.MAX_SESSIONS[id];
    expect(deriveBuildingState(id, 'IDLE', Math.ceil(max * 0.8))).toBe('OVERLOADED');
  });

  it('keeps ERROR sticky', () => {
    expect(deriveBuildingState('atlas', 'ERROR', 0)).toBe('ERROR');
    expect(deriveBuildingState('atlas', 'ERROR', 999)).toBe('ERROR');
  });

  it('makes ACTIVE when sessions > 0', () => {
    expect(deriveBuildingState('verifier', 'IDLE', 1)).toBe('ACTIVE');
  });

  it('respects explicit OVERLOADED state', () => {
    expect(deriveBuildingState('echo', 'OVERLOADED', 0)).toBe('OVERLOADED');
  });

  it('computes capacity ratio from MAX_SESSIONS', () => {
    const r = capacityRatio('atlas', 3);
    expect(r).toBeCloseTo(3 / CAPACITY.MAX_SESSIONS.atlas);
  });
});
