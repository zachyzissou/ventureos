/**
 * Mission Tracking & Workflows — Phase 5.5
 *
 * Public API for the mission tracking visualization system.
 * Import from this module to integrate with the tactical map.
 *
 * @example
 *   import { MissionTracker, MockMissionDataProvider } from './missions';
 *   const tracker = new MissionTracker();
 *   tracker.connect();
 */

// Core types
export type {
  MissionPhase,
  MissionData,
  MissionDependency,
  MissionHistoryEntry,
  MissionCardLayout,
  MissionTrackingConfig,
  TaskSummary,
  TaskTier,
  TaskStatus,
  SquadRole,
  Point,
  Rect,
  ArrowPath,
  Animation,
  AnimationType,
  ColorScheme,
} from './types';

export {
  PHASE_PROGRESS,
  PHASE_COLORS,
  MISSION_PHASE_ORDER,
  ROLE_DISPLAY_NAMES,
  TIER_COLORS,
  DEFAULT_CONFIG,
} from './types';

// Data provider
export type { MissionDataProvider, MissionUpdateCallback } from './mission-data-provider';
export { MockMissionDataProvider, ApiMissionDataProvider } from './mission-data-provider';

// Mission cards
export {
  calculateCardLayouts,
  renderMissionCard,
  renderAllMissionCards,
  drawProgressBar,
  truncateText,
} from './mission-card';

// Task queue visualization
export {
  calculateAgentQueueStats,
  renderQueueDepthBar,
  renderAllQueueDepthBars,
  renderQueueSummaryPanel,
  DEFAULT_QUEUE_CONFIG,
} from './task-queue-viz';
export type { AgentQueueStats, QueueDepthConfig, QueuePanelConfig } from './task-queue-viz';

// Progress indicators
export {
  renderLinearProgress,
  renderCircularProgress,
  renderPhaseSteps,
  renderProgressBadge,
  DEFAULT_LINEAR_CONFIG,
  DEFAULT_CIRCULAR_CONFIG,
  DEFAULT_PHASE_STEP_CONFIG,
} from './progress-indicator';
export type { LinearProgressConfig, CircularProgressConfig, PhaseStepConfig } from './progress-indicator';

// Dependency arrows
export {
  calculateArrowPaths,
  renderArrow,
  renderAllArrows,
  getPointOnCubicBezier,
  DEFAULT_ARROW_CONFIG,
} from './dependency-arrows';
export type { ArrowStyleConfig } from './dependency-arrows';

// Completion animations
export {
  AnimationManager,
  createCompletionParticles,
  updateParticles,
  renderParticles,
  renderPhaseTransitionRipple,
  applyAnimation,
  easeOutCubic,
  easeInOutCubic,
  easeOutElastic,
  easeOutBounce,
} from './completion-animations';
export type { Particle } from './completion-animations';

// Mission timeline
export {
  processTimelineEntries,
  renderTimeline,
  renderTimelinePanel,
  formatDuration,
  formatTimestamp,
  formatDatetime,
  DEFAULT_TIMELINE_CONFIG,
  COMPACT_TIMELINE_CONFIG,
} from './mission-timeline';
export type { TimelineConfig, TimelineEntry, TimelinePanelConfig } from './mission-timeline';

// Main tracker (integration controller)
export { MissionTracker } from './mission-tracker';
export type { MissionTrackerConfig, PerformanceMetrics } from './mission-tracker';
