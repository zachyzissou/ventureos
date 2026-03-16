/**
 * Types & Constants Tests — Phase 5.5
 */
import { describe, it, expect } from 'vitest';
import {
  PHASE_PROGRESS,
  PHASE_COLORS,
  MISSION_PHASE_ORDER,
  ROLE_DISPLAY_NAMES,
  TIER_COLORS,
  DEFAULT_CONFIG,
} from '../../../src/missions/types';
import type { MissionPhase, ColorScheme } from '../../../src/missions/types';

describe('PHASE_PROGRESS', () => {
  it('maps all phases to numeric values', () => {
    const phases: MissionPhase[] = ['brief', 'plan', 'execute', 'verify', 'deliver', 'closed', 'error'];
    for (const phase of phases) {
      expect(typeof PHASE_PROGRESS[phase]).toBe('number');
    }
  });

  it('progress increases through normal phases', () => {
    const ordered: MissionPhase[] = ['brief', 'plan', 'execute', 'verify', 'deliver', 'closed'];
    for (let i = 1; i < ordered.length; i++) {
      expect(PHASE_PROGRESS[ordered[i]]).toBeGreaterThan(PHASE_PROGRESS[ordered[i - 1]]);
    }
  });

  it('brief starts at 0, closed ends at 100', () => {
    expect(PHASE_PROGRESS.brief).toBe(0);
    expect(PHASE_PROGRESS.closed).toBe(100);
  });

  it('error has negative progress (sentinel value)', () => {
    expect(PHASE_PROGRESS.error).toBeLessThan(0);
  });
});

describe('PHASE_COLORS', () => {
  it('provides colors for all phases', () => {
    const phases: MissionPhase[] = ['brief', 'plan', 'execute', 'verify', 'deliver', 'closed', 'error'];
    for (const phase of phases) {
      const scheme = PHASE_COLORS[phase];
      expect(scheme).toBeDefined();
      expect(scheme.primary).toBeTruthy();
      expect(scheme.secondary).toBeTruthy();
      expect(scheme.glow).toBeTruthy();
      expect(scheme.text).toBeTruthy();
    }
  });

  it('all primary colors are valid hex', () => {
    for (const colors of Object.values(PHASE_COLORS)) {
      expect(colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('error phase uses red tones', () => {
    expect(PHASE_COLORS.error.primary).toContain('E5');
  });
});

describe('MISSION_PHASE_ORDER', () => {
  it('contains 6 phases (excludes error)', () => {
    expect(MISSION_PHASE_ORDER).toHaveLength(6);
    expect(MISSION_PHASE_ORDER).not.toContain('error');
  });

  it('starts with brief and ends with closed', () => {
    expect(MISSION_PHASE_ORDER[0]).toBe('brief');
    expect(MISSION_PHASE_ORDER[MISSION_PHASE_ORDER.length - 1]).toBe('closed');
  });
});

describe('ROLE_DISPLAY_NAMES', () => {
  it('maps all squad roles', () => {
    const roles = ['echo', 'nexus', 'oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth'];
    for (const role of roles) {
      expect(ROLE_DISPLAY_NAMES[role as keyof typeof ROLE_DISPLAY_NAMES]).toBeTruthy();
    }
  });

  it('oracle maps to Oracle', () => {
    expect(ROLE_DISPLAY_NAMES.oracle).toBe('Oracle');
  });
});

describe('TIER_COLORS', () => {
  it('provides colors for P0-P3', () => {
    expect(TIER_COLORS.P0).toBeTruthy();
    expect(TIER_COLORS.P1).toBeTruthy();
    expect(TIER_COLORS.P2).toBeTruthy();
    expect(TIER_COLORS.P3).toBeTruthy();
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has reasonable card dimensions', () => {
    expect(DEFAULT_CONFIG.cardWidth).toBeGreaterThan(100);
    expect(DEFAULT_CONFIG.cardHeight).toBeGreaterThan(40);
    expect(DEFAULT_CONFIG.expandedCardHeight).toBeGreaterThan(DEFAULT_CONFIG.cardHeight);
  });

  it('supports at least 50 missions', () => {
    expect(DEFAULT_CONFIG.maxVisibleMissions).toBeGreaterThanOrEqual(50);
  });

  it('has positive animation parameters', () => {
    expect(DEFAULT_CONFIG.bobAmplitude).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.bobPeriod).toBeGreaterThan(0);
  });
});
