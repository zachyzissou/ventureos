/**
 * Mission Tracker — Phase 5.5 Integration Controller
 *
 * Central orchestrator that ties together all mission visualization
 * components. This is the main entry point for the tactical map to
 * render mission tracking overlays.
 *
 * Responsibilities:
 * - Manages the MissionDataProvider lifecycle
 * - Coordinates card layout calculation
 * - Drives the AnimationManager based on state changes
 * - Delegates rendering to individual components
 * - Tracks performance metrics
 *
 * Usage:
 *   const tracker = new MissionTracker(config);
 *   tracker.connect();
 *   // Each frame:
 *   tracker.render(ctx, agentPositions, time);
 */

import type {
  MissionData,
  MissionDependency,
  MissionCardLayout,
  MissionTrackingConfig,
  Point,
  ArrowPath,
} from './types';
import { DEFAULT_CONFIG } from './types';

import type { MissionDataProvider } from './mission-data-provider';
import { MockMissionDataProvider } from './mission-data-provider';

import { calculateCardLayouts, renderAllMissionCards } from './mission-card';
import { renderAllQueueDepthBars, type QueueDepthConfig, DEFAULT_QUEUE_CONFIG } from './task-queue-viz';
import { calculateArrowPaths, renderAllArrows, type ArrowStyleConfig, DEFAULT_ARROW_CONFIG } from './dependency-arrows';
import {
  AnimationManager,
  createCompletionParticles,
  updateParticles,
  renderParticles,
  renderPhaseTransitionRipple,
  type Particle,
} from './completion-animations';

// ═══════════════════════════════════════════
// Performance Metrics
// ═══════════════════════════════════════════

export interface PerformanceMetrics {
  lastFrameMs: number;
  avgFrameMs: number;
  missionCount: number;
  animationCount: number;
  particleCount: number;
}

// ═══════════════════════════════════════════
// Mission Tracker
// ═══════════════════════════════════════════

export interface MissionTrackerConfig {
  tracking: MissionTrackingConfig;
  queue: QueueDepthConfig;
  arrows: ArrowStyleConfig;
  provider?: MissionDataProvider;
}

export class MissionTracker {
  private readonly config: MissionTrackingConfig;
  private readonly queueConfig: QueueDepthConfig;
  private readonly arrowConfig: ArrowStyleConfig;
  private readonly provider: MissionDataProvider;
  private readonly animationManager: AnimationManager;

  private missions: MissionData[] = [];
  private dependencies: MissionDependency[] = [];
  private cardLayouts: MissionCardLayout[] = [];
  private arrowPaths: ArrowPath[] = [];
  private particles: Particle[] = [];

  // State change detection
  private previousPhases: Map<string, string> = new Map();
  private previousMissionIds: Set<string> = new Set();

  // Performance tracking
  private frameTimings: number[] = [];
  private lastFrameTime = 0;

  constructor(config?: Partial<MissionTrackerConfig>) {
    this.config = config?.tracking ?? DEFAULT_CONFIG;
    this.queueConfig = config?.queue ?? DEFAULT_QUEUE_CONFIG;
    this.arrowConfig = config?.arrows ?? DEFAULT_ARROW_CONFIG;
    this.provider = config?.provider ?? new MockMissionDataProvider();
    this.animationManager = new AnimationManager(this.config.animationThreshold * 3);
  }

  /**
   * Start the data provider and begin receiving updates.
   */
  connect(): void {
    this.provider.onUpdate(this.handleDataUpdate);
    this.provider.connect();
  }

  /**
   * Stop the data provider.
   */
  disconnect(): void {
    this.provider.offUpdate(this.handleDataUpdate);
    this.provider.disconnect();

    // Reset render + animation state so a future reconnect starts cleanly.
    this.animationManager.clear();
    this.particles = [];
    this.missions = [];
    this.dependencies = [];
    this.cardLayouts = [];
    this.arrowPaths = [];

    // Reset change detection caches.
    this.previousPhases = new Map();
    this.previousMissionIds = new Set();

    // Reset performance metrics.
    this.frameTimings = [];
    this.lastFrameTime = 0;
  }

  /**
   * Main render method. Call once per frame.
   * Renders all mission tracking overlays onto the canvas.
   */
  render(
    ctx: CanvasRenderingContext2D,
    agentPositions: Map<string, Point>,
    time: number = Date.now()
  ): void {
    const frameStart = performance.now();

    // Update animation state once per frame and reuse the snapshot.
    const activeAnimations = this.animationManager.update(frameStart);

    // Calculate layouts
    const visibleMissions = this.missions.slice(0, this.config.maxVisibleMissions);
    this.cardLayouts = calculateCardLayouts(visibleMissions, agentPositions, this.config, time);

    // Build layout map for arrow calculations
    const layoutMap = new Map<string, MissionCardLayout>();
    for (const layout of this.cardLayouts) {
      layoutMap.set(layout.missionId, layout);
    }

    // Calculate arrow paths
    if (this.config.showDependencies) {
      this.arrowPaths = calculateArrowPaths(this.dependencies, layoutMap, this.arrowConfig);
    }

    // ── Render layers (back to front) ───────────────────

    // Layer 1: Dependency arrows (behind cards)
    if (this.config.showDependencies && this.arrowPaths.length > 0) {
      renderAllArrows(ctx, this.arrowPaths, this.arrowConfig, time);
    }

    // Layer 2: Mission cards
    renderAllMissionCards(ctx, visibleMissions, this.cardLayouts, this.config);

    // Layer 3: Queue depth bars
    if (this.config.showQueueDepth) {
      renderAllQueueDepthBars(ctx, visibleMissions, agentPositions, this.queueConfig, time);
    }

    // Layer 4: Particles (on top of everything)
    if (this.particles.length > 0) {
      const delta = this.lastFrameTime > 0 ? (frameStart - this.lastFrameTime) / 1000 : 0.016;
      this.particles = updateParticles(this.particles, delta);
      renderParticles(ctx, this.particles);
    }

    // Layer 5: Phase transition ripples
    for (const anim of activeAnimations) {
      if (anim.type === 'phase_transition' || anim.type === 'completion_burst') {
        const layout = layoutMap.get(anim.targetId);
        if (layout) {
          const center: Point = {
            x: layout.position.x + layout.size.width / 2,
            y: layout.position.y + layout.size.height / 2,
          };
          const color = anim.params['color'] as string ?? '#4FC3F7';
          renderPhaseTransitionRipple(ctx, center, anim.progress, color);
        }
      }
    }

    // Track performance
    const frameEnd = performance.now();
    const frameMs = frameEnd - frameStart;
    this.frameTimings.push(frameMs);
    if (this.frameTimings.length > 60) this.frameTimings.shift();
    this.lastFrameTime = frameStart;
  }

  /**
   * Get current performance metrics.
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const sum = this.frameTimings.reduce((a, b) => a + b, 0);
    return {
      lastFrameMs: this.frameTimings[this.frameTimings.length - 1] ?? 0,
      avgFrameMs: this.frameTimings.length > 0 ? sum / this.frameTimings.length : 0,
      missionCount: this.missions.length,
      animationCount: this.animationManager.count,
      particleCount: this.particles.length,
    };
  }

  /**
   * Get current missions snapshot.
   */
  getMissions(): MissionData[] {
    return [...this.missions];
  }

  /**
   * Get current card layouts.
   */
  getCardLayouts(): MissionCardLayout[] {
    return [...this.cardLayouts];
  }

  /**
   * Force a data refresh.
   */
  async refresh(): Promise<void> {
    return this.provider.refresh();
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private handleDataUpdate = (missions: MissionData[], dependencies: MissionDependency[]): void => {
    // Detect changes for animations
    this.detectChanges(missions);

    this.missions = missions;
    this.dependencies = dependencies;
  };

  private detectChanges(newMissions: MissionData[]): void {
    const newIds = new Set(newMissions.map((m) => m.missionId));

    // Detect new missions (appear animation)
    for (const m of newMissions) {
      if (!this.previousMissionIds.has(m.missionId)) {
        this.animationManager.create('card_appear', m.missionId, 500);
      }
    }

    // Detect removed missions (disappear animation)
    for (const prevId of this.previousMissionIds) {
      if (!newIds.has(prevId)) {
        this.animationManager.create('card_disappear', prevId, 400);
      }
    }

    // Detect phase transitions
    for (const m of newMissions) {
      const prevPhase = this.previousPhases.get(m.missionId);
      if (prevPhase && prevPhase !== m.phase) {
        if (m.phase === 'closed') {
          // Completion celebration!
          this.triggerCompletionCelebration(m);
        } else if (m.phase === 'error') {
          this.animationManager.create('error_shake', m.missionId, 600);
        } else {
          this.animationManager.create('phase_transition', m.missionId, 800, {
            color: m.phase === 'execute' ? '#FFB74D' : '#4FC3F7',
          });
        }
      }
    }

    // Update tracking state
    this.previousMissionIds = newIds;
    this.previousPhases = new Map(newMissions.map((m) => [m.missionId, m.phase]));
  }

  private triggerCompletionCelebration(mission: MissionData): void {
    this.animationManager.create('completion_burst', mission.missionId, 1500);

    // Find the card layout for this mission to position particles
    const layout = this.cardLayouts.find((l) => l.missionId === mission.missionId);
    if (layout) {
      const center: Point = {
        x: layout.position.x + layout.size.width / 2,
        y: layout.position.y + layout.size.height / 2,
      };
      const newParticles = createCompletionParticles(center);
      this.particles.push(...newParticles);
    }
  }
}
