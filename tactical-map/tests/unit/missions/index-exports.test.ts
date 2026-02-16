/**
 * Index Module Exports Tests — Phase 5.5
 *
 * Verify that all public API surface is correctly exported.
 */
import { describe, it, expect } from 'vitest';
import * as missions from '../../../src/missions/index';

describe('missions module exports', () => {
  // Types / constants
  it('exports PHASE_PROGRESS', () => {
    expect(missions.PHASE_PROGRESS).toBeDefined();
  });

  it('exports PHASE_COLORS', () => {
    expect(missions.PHASE_COLORS).toBeDefined();
  });

  it('exports MISSION_PHASE_ORDER', () => {
    expect(missions.MISSION_PHASE_ORDER).toBeDefined();
  });

  it('exports ROLE_DISPLAY_NAMES', () => {
    expect(missions.ROLE_DISPLAY_NAMES).toBeDefined();
  });

  it('exports TIER_COLORS', () => {
    expect(missions.TIER_COLORS).toBeDefined();
  });

  it('exports DEFAULT_CONFIG', () => {
    expect(missions.DEFAULT_CONFIG).toBeDefined();
  });

  // Data providers
  it('exports MockMissionDataProvider', () => {
    expect(missions.MockMissionDataProvider).toBeDefined();
  });

  it('exports ApiMissionDataProvider', () => {
    expect(missions.ApiMissionDataProvider).toBeDefined();
  });

  // Mission cards
  it('exports calculateCardLayouts', () => {
    expect(typeof missions.calculateCardLayouts).toBe('function');
  });

  it('exports renderMissionCard', () => {
    expect(typeof missions.renderMissionCard).toBe('function');
  });

  it('exports renderAllMissionCards', () => {
    expect(typeof missions.renderAllMissionCards).toBe('function');
  });

  // Task queue
  it('exports calculateAgentQueueStats', () => {
    expect(typeof missions.calculateAgentQueueStats).toBe('function');
  });

  it('exports renderQueueDepthBar', () => {
    expect(typeof missions.renderQueueDepthBar).toBe('function');
  });

  // Progress
  it('exports renderLinearProgress', () => {
    expect(typeof missions.renderLinearProgress).toBe('function');
  });

  it('exports renderCircularProgress', () => {
    expect(typeof missions.renderCircularProgress).toBe('function');
  });

  it('exports renderPhaseSteps', () => {
    expect(typeof missions.renderPhaseSteps).toBe('function');
  });

  it('exports renderProgressBadge', () => {
    expect(typeof missions.renderProgressBadge).toBe('function');
  });

  // Arrows
  it('exports calculateArrowPaths', () => {
    expect(typeof missions.calculateArrowPaths).toBe('function');
  });

  it('exports getPointOnCubicBezier', () => {
    expect(typeof missions.getPointOnCubicBezier).toBe('function');
  });

  // Animations
  it('exports AnimationManager', () => {
    expect(missions.AnimationManager).toBeDefined();
  });

  it('exports easing functions', () => {
    expect(typeof missions.easeOutCubic).toBe('function');
    expect(typeof missions.easeInOutCubic).toBe('function');
    expect(typeof missions.easeOutElastic).toBe('function');
    expect(typeof missions.easeOutBounce).toBe('function');
  });

  // Timeline
  it('exports processTimelineEntries', () => {
    expect(typeof missions.processTimelineEntries).toBe('function');
  });

  it('exports formatDuration', () => {
    expect(typeof missions.formatDuration).toBe('function');
  });

  it('exports DEFAULT_TIMELINE_CONFIG', () => {
    expect(missions.DEFAULT_TIMELINE_CONFIG).toBeDefined();
  });

  // Tracker
  it('exports MissionTracker', () => {
    expect(missions.MissionTracker).toBeDefined();
  });
});
