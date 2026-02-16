/**
 * Task Queue Visualization — Phase 5.5
 *
 * Renders task queue depth indicators and queue status panels.
 * Visualizes the backlog pressure on each agent using:
 * - Depth bars (vertical pillars showing queue depth)
 * - Color-coded urgency (green → yellow → red)
 * - Animated fill for active processing
 *
 * Integrates with the task-queue.ts backend model via MissionDataProvider.
 */

import type {
  MissionData,
  TaskSummary,
  Point,
  TaskTier,
} from './types';
import { TIER_COLORS } from './types';

// ═══════════════════════════════════════════
// Queue Depth Visualization
// ═══════════════════════════════════════════

export interface QueueDepthConfig {
  /** Max bar height in pixels */
  maxBarHeight: number;
  /** Bar width in pixels */
  barWidth: number;
  /** Maximum depth before the bar is "full" */
  maxDepth: number;
  /** Position offset from agent center */
  offsetX: number;
  offsetY: number;
  /** Show numeric label */
  showLabel: boolean;
}

export const DEFAULT_QUEUE_CONFIG: QueueDepthConfig = {
  maxBarHeight: 40,
  barWidth: 12,
  maxDepth: 20,
  offsetX: 50,
  offsetY: -10,
  showLabel: true,
};

/**
 * Aggregate queue statistics per agent role.
 */
export interface AgentQueueStats {
  role: string;
  totalQueued: number;
  totalRunning: number;
  totalFailed: number;
  tierBreakdown: Record<TaskTier, number>;
}

/**
 * Calculate per-agent queue statistics from mission data.
 */
export function calculateAgentQueueStats(
  missions: MissionData[]
): Map<string, AgentQueueStats> {
  const statsMap = new Map<string, AgentQueueStats>();

  for (const mission of missions) {
    for (const task of mission.tasks) {
      const role = task.role ?? mission.assignedTo[0] ?? 'unknown';

      let stats = statsMap.get(role);
      if (!stats) {
        stats = {
          role,
          totalQueued: 0,
          totalRunning: 0,
          totalFailed: 0,
          tierBreakdown: { P0: 0, P1: 0, P2: 0, P3: 0 },
        };
        statsMap.set(role, stats);
      }

      if (task.status === 'queued') {
        stats.totalQueued++;
        stats.tierBreakdown[task.tier]++;
      } else if (task.status === 'running') {
        stats.totalRunning++;
      } else if (task.status === 'failed') {
        stats.totalFailed++;
      }
    }
  }

  return statsMap;
}

/**
 * Render a queue depth indicator bar next to an agent.
 */
export function renderQueueDepthBar(
  ctx: CanvasRenderingContext2D,
  agentPos: Point,
  stats: AgentQueueStats,
  config: QueueDepthConfig = DEFAULT_QUEUE_CONFIG,
  time: number = Date.now()
): void {
  const x = agentPos.x + config.offsetX;
  const y = agentPos.y + config.offsetY;
  const { barWidth, maxBarHeight, maxDepth } = config;

  const totalActive = stats.totalQueued + stats.totalRunning;
  if (totalActive === 0) return;

  const fillRatio = Math.min(totalActive / maxDepth, 1);
  const fillHeight = fillRatio * maxBarHeight;

  ctx.save();

  // ── Background Track ──────────────────────────────────
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(x, y - maxBarHeight, barWidth, maxBarHeight);

  // ── Fill bar (bottom-up) ──────────────────────────────
  const urgencyColor = getUrgencyColor(fillRatio);

  // Animated pulse for active processing
  const pulseAlpha = stats.totalRunning > 0
    ? 0.7 + Math.sin(time / 300) * 0.3
    : 1;

  ctx.globalAlpha = pulseAlpha;
  ctx.fillStyle = urgencyColor;
  ctx.fillRect(x, y - fillHeight, barWidth, fillHeight);
  ctx.globalAlpha = 1;

  // ── Tier segments within the bar ──────────────────────
  drawTierSegments(ctx, x, y, barWidth, maxBarHeight, stats, totalActive, maxDepth);

  // ── Border ────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y - maxBarHeight, barWidth, maxBarHeight);

  // ── Label ─────────────────────────────────────────────
  if (config.showLabel) {
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.fillStyle = urgencyColor;
    ctx.textAlign = 'center';
    ctx.fillText(String(totalActive), x + barWidth / 2, y + 12);
    ctx.textAlign = 'left';
  }

  // ── Running indicator (spinning dots) ─────────────────
  if (stats.totalRunning > 0) {
    drawRunningIndicator(ctx, x + barWidth / 2, y - maxBarHeight - 6, time);
  }

  ctx.restore();
}

/**
 * Render queue depth bars for all agents.
 */
export function renderAllQueueDepthBars(
  ctx: CanvasRenderingContext2D,
  missions: MissionData[],
  agentPositions: Map<string, Point>,
  config: QueueDepthConfig = DEFAULT_QUEUE_CONFIG,
  time: number = Date.now()
): void {
  const statsMap = calculateAgentQueueStats(missions);

  for (const [role, stats] of statsMap) {
    const pos = agentPositions.get(role);
    if (!pos) continue;
    renderQueueDepthBar(ctx, pos, stats, config, time);
  }
}

// ═══════════════════════════════════════════
// Queue Summary Panel
// ═══════════════════════════════════════════

export interface QueuePanelConfig {
  x: number;
  y: number;
  width: number;
  maxRows: number;
}

/**
 * Render a compact queue summary panel (for dashboard sidebar).
 * Shows aggregated stats across all agents.
 */
export function renderQueueSummaryPanel(
  ctx: CanvasRenderingContext2D,
  missions: MissionData[],
  panelConfig: QueuePanelConfig
): void {
  const { x, y, width, maxRows } = panelConfig;

  // Aggregate all tasks
  const allTasks: TaskSummary[] = [];
  for (const m of missions) {
    allTasks.push(...m.tasks);
  }

  const queued = allTasks.filter((t) => t.status === 'queued');
  const running = allTasks.filter((t) => t.status === 'running');
  const failed = allTasks.filter((t) => t.status === 'failed');

  ctx.save();

  // Panel background
  ctx.fillStyle = 'rgba(10, 15, 30, 0.9)';
  ctx.fillRect(x, y, width, 24 + Math.min(queued.length, maxRows) * 14 + 4);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, 24 + Math.min(queued.length, maxRows) * 14 + 4);

  // Header
  ctx.font = 'bold 10px "Segoe UI", sans-serif';
  ctx.fillStyle = '#B0BEC5';
  ctx.fillText('TASK QUEUE', x + 8, y + 14);

  // Stats badges
  const statsX = x + width - 8;
  ctx.textAlign = 'right';
  ctx.font = '9px "Segoe UI", sans-serif';

  ctx.fillStyle = '#4CAF50';
  ctx.fillText(`${running.length} running`, statsX, y + 14);

  ctx.fillStyle = '#FFC107';
  ctx.fillText(`${queued.length} queued`, statsX - 65, y + 14);

  if (failed.length > 0) {
    ctx.fillStyle = '#F44336';
    ctx.fillText(`${failed.length} failed`, statsX - 130, y + 14);
  }

  ctx.textAlign = 'left';

  // Queue items
  const sortedQueue = [...queued].sort((a, b) => {
    const tierOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
  });

  for (let i = 0; i < Math.min(sortedQueue.length, maxRows); i++) {
    const task = sortedQueue[i];
    const rowY = y + 28 + i * 14;

    // Tier badge
    ctx.fillStyle = TIER_COLORS[task.tier];
    ctx.font = 'bold 8px "Segoe UI", sans-serif';
    ctx.fillText(task.tier, x + 8, rowY);

    // Title
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '8px "Segoe UI", sans-serif';
    ctx.fillText(task.title.slice(0, 30), x + 28, rowY);

    // Role
    if (task.role) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillText(task.role, x + width - 50, rowY);
    }
  }

  if (sortedQueue.length > maxRows) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '8px "Segoe UI", sans-serif';
    ctx.fillText(
      `+${sortedQueue.length - maxRows} more`,
      x + 8,
      y + 28 + maxRows * 14
    );
  }

  ctx.restore();
}

// ═══════════════════════════════════════════
// Internal Drawing Helpers
// ═══════════════════════════════════════════

function getUrgencyColor(fillRatio: number): string {
  if (fillRatio >= 0.8) return '#F44336'; // Critical
  if (fillRatio >= 0.5) return '#FF9800'; // Warning
  if (fillRatio >= 0.3) return '#FFC107'; // Moderate
  return '#4CAF50'; // Healthy
}

function drawTierSegments(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  barWidth: number,
  maxBarHeight: number,
  stats: AgentQueueStats,
  totalActive: number,
  maxDepth: number
): void {
  const tiers: TaskTier[] = ['P0', 'P1', 'P2', 'P3'];
  const clampedActiveDepth = Math.min(totalActive, maxDepth);
  const clampedQueuedDepth = Math.min(stats.totalQueued, clampedActiveDepth);

  if (stats.totalQueued <= 0 || clampedQueuedDepth <= 0) return;

  const totalQueueHeight = (clampedQueuedDepth / maxDepth) * maxBarHeight;
  let currentY = y;
  let remainingHeight = totalQueueHeight;

  for (const tier of tiers) {
    const count = stats.tierBreakdown[tier];
    if (count === 0 || remainingHeight <= 0) continue;

    const segmentHeight = Math.min(
      (count / stats.totalQueued) * totalQueueHeight,
      remainingHeight
    );

    ctx.fillStyle = TIER_COLORS[tier] + '40'; // 25% opacity overlay
    ctx.fillRect(x, currentY - segmentHeight, barWidth, segmentHeight);
    currentY -= segmentHeight;
    remainingHeight -= segmentHeight;
  }
}

function drawRunningIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number
): void {
  const dotCount = 3;
  const radius = 2;
  const spacing = 5;

  for (let i = 0; i < dotCount; i++) {
    const phase = ((time / 400) + i * 0.3) % 1;
    const alpha = 0.3 + Math.sin(phase * Math.PI) * 0.7;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#64B5F6';
    ctx.beginPath();
    ctx.arc(x + (i - 1) * spacing, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
