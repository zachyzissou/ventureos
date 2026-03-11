/**
 * Mission Card Renderer — Phase 5.5
 *
 * Renders floating mission cards above agent sprites on the tactical map.
 * Each card shows:
 * - Mission title + phase badge
 * - Progress bar (0-100%)
 * - Assigned role icons
 * - Task queue depth indicator
 * - Error state styling
 *
 * Cards float above agents with a gentle bobbing animation and
 * glow effect matching the current phase color.
 *
 * Protoss lore: These are Khaydarin Crystal projections — holographic
 * mission briefings visible to the Executor on the command interface.
 */

import type {
  MissionData,
  MissionCardLayout,
  Point,
  MissionTrackingConfig,
  ColorScheme,
} from './types';
import { PHASE_COLORS, DEFAULT_CONFIG, ROLE_DISPLAY_NAMES, TIER_COLORS } from './types';

// ═══════════════════════════════════════════
// Card Layout Calculator
// ═══════════════════════════════════════════

/**
 * Calculate layout positions for mission cards relative to agent positions.
 * Handles stacking when multiple missions are assigned to the same agent.
 */
export function calculateCardLayouts(
  missions: MissionData[],
  agentPositions: Map<string, Point>,
  config: MissionTrackingConfig = DEFAULT_CONFIG,
  time: number = Date.now()
): MissionCardLayout[] {
  const layouts: MissionCardLayout[] = [];

  // Group missions by primary agent
  const agentMissions = new Map<string, MissionData[]>();
  for (const mission of missions) {
    const primaryAgent = mission.assignedTo[0];
    if (!primaryAgent) continue;

    const existing = agentMissions.get(primaryAgent) ?? [];
    existing.push(mission);
    agentMissions.set(primaryAgent, existing);
  }

  for (const [agentRole, agentMissionList] of agentMissions) {
    const agentPos = agentPositions.get(agentRole);
    if (!agentPos) continue;

    // Stack cards vertically above agent
    for (let i = 0; i < agentMissionList.length && i < 3; i++) {
      const mission = agentMissionList[i];
      const stackOffset = i * (config.cardHeight + 8);

      // Bob animation
      const bobPhase = (time % config.bobPeriod) / config.bobPeriod;
      const bobOffset = Math.sin(bobPhase * Math.PI * 2) * config.bobAmplitude;

      const height = mission.phase === 'execute' && agentMissionList.length === 1
        ? config.expandedCardHeight
        : config.cardHeight;

      layouts.push({
        missionId: mission.missionId,
        position: {
          x: agentPos.x - config.cardWidth / 2,
          y: agentPos.y - config.floatHeight - stackOffset - height,
        },
        size: { width: config.cardWidth, height },
        opacity: 1 - i * 0.15, // Cards further back are slightly transparent
        floatOffset: bobOffset,
        expanded: height > config.cardHeight,
      });
    }
  }

  return layouts;
}

// ═══════════════════════════════════════════
// Canvas Rendering
// ═══════════════════════════════════════════

/**
 * Render a single mission card to a canvas context.
 */
export function renderMissionCard(
  ctx: CanvasRenderingContext2D,
  mission: MissionData,
  layout: MissionCardLayout,
  config: MissionTrackingConfig = DEFAULT_CONFIG
): void {
  const { position, size, opacity, floatOffset } = layout;
  const colors = PHASE_COLORS[mission.phase];
  const x = position.x;
  const y = position.y + floatOffset;

  ctx.save();
  ctx.globalAlpha = opacity;

  // ── Card Background with Glow ─────────────────────────
  drawCardBackground(ctx, x, y, size.width, size.height, colors);

  // ── Phase Badge ───────────────────────────────────────
  drawPhaseBadge(ctx, x + 6, y + 6, mission.phase, colors);

  // ── Title ─────────────────────────────────────────────
  ctx.fillStyle = colors.text;
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  const titleX = x + 60;
  const maxTitleWidth = size.width - 68;
  const truncatedTitle = truncateText(ctx, mission.title, maxTitleWidth);
  ctx.fillText(truncatedTitle, titleX, y + 18);

  // ── Progress Bar ──────────────────────────────────────
  const barY = y + 28;
  const barWidth = size.width - 16;
  drawProgressBar(ctx, x + 8, barY, barWidth, 8, mission.progress, colors);

  // ── Progress Text ─────────────────────────────────────
  ctx.fillStyle = colors.text;
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.fillText(`${mission.progress}%`, x + 8, barY + 20);

  // ── Queue Depth Indicator ─────────────────────────────
  if (config.showQueueDepth && mission.queueDepth > 0) {
    drawQueueDepthBadge(ctx, x + size.width - 30, y + 44, mission.queueDepth);
  }

  // ── Assigned Roles ────────────────────────────────────
  const roleY = y + size.height - 20;
  drawAssignedRoles(ctx, x + 8, roleY, mission.assignedTo, colors);

  // ── Error Indicator ───────────────────────────────────
  if (mission.phase === 'error' && mission.error) {
    drawErrorIndicator(ctx, x, y, size.width, size.height, mission.error.message);
  }

  // ── Expanded: Task List ───────────────────────────────
  if (layout.expanded) {
    drawTaskList(ctx, x + 8, y + 60, size.width - 16, mission.tasks, colors);
  }

  ctx.restore();
}

/**
 * Render all mission cards in a batch.
 * Sorts by z-order (expanded cards on top) for proper layering.
 */
export function renderAllMissionCards(
  ctx: CanvasRenderingContext2D,
  missions: MissionData[],
  layouts: MissionCardLayout[],
  config: MissionTrackingConfig = DEFAULT_CONFIG
): void {
  // Create a map for quick lookup
  const missionMap = new Map(missions.map((m) => [m.missionId, m]));

  // Sort: non-expanded first, then expanded (so expanded renders on top)
  const sorted = [...layouts].sort((a, b) => {
    if (a.expanded === b.expanded) return 0;
    return a.expanded ? 1 : -1;
  });

  for (const layout of sorted) {
    const mission = missionMap.get(layout.missionId);
    if (!mission) continue;
    renderMissionCard(ctx, mission, layout, config);
  }
}

// ═══════════════════════════════════════════
// Drawing Primitives
// ═══════════════════════════════════════════

function drawCardBackground(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: ColorScheme
): void {
  const radius = 6;

  // Glow effect
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  // Background
  ctx.fillStyle = 'rgba(10, 15, 30, 0.88)';
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();

  // Reset shadow for border
  ctx.shadowBlur = 0;

  // Border
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();

  // Top accent line
  ctx.strokeStyle = colors.secondary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.stroke();
}

function drawPhaseBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  phase: string,
  colors: ColorScheme
): void {
  const badgeWidth = 48;
  const badgeHeight = 16;
  const radius = 3;

  ctx.fillStyle = colors.secondary;
  roundRect(ctx, x, y, badgeWidth, badgeHeight, radius);
  ctx.fill();

  ctx.fillStyle = colors.text;
  ctx.font = 'bold 9px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(phase.toUpperCase(), x + badgeWidth / 2, y + 12);
  ctx.textAlign = 'left';
}

export function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  colors: ColorScheme
): void {
  const radius = height / 2;
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const fillWidth = (width * clampedProgress) / 100;

  // Background track
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  roundRect(ctx, x, y, width, height, radius);
  ctx.fill();

  // Fill bar
  if (fillWidth > 0) {
    const gradient = ctx.createLinearGradient(x, y, x + fillWidth, y);
    gradient.addColorStop(0, colors.secondary);
    gradient.addColorStop(1, colors.primary);
    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, Math.max(fillWidth, height), height, radius);
    ctx.fill();
  }
}

function drawQueueDepthBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  depth: number
): void {
  const size = 18;

  // Circle background
  ctx.fillStyle = depth > 5 ? '#FF5722' : depth > 2 ? '#FF9800' : '#607D8B';
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Depth text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 9px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(depth), x + size / 2, y + size / 2 + 3);
  ctx.textAlign = 'left';
}

function drawAssignedRoles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  roles: string[],
  colors: ColorScheme
): void {
  ctx.font = '8px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

  const roleLabels = roles
    .slice(0, 3)
    .map((r) => ROLE_DISPLAY_NAMES[r as keyof typeof ROLE_DISPLAY_NAMES] ?? r);

  const text = roleLabels.join(' · ') + (roles.length > 3 ? ` +${roles.length - 3}` : '');
  ctx.fillText(text, x, y);
}

function drawErrorIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  message: string
): void {
  // Red overlay
  ctx.fillStyle = 'rgba(229, 57, 53, 0.15)';
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();

  // Error icon (⚠)
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#E53935';
  ctx.fillText('⚠', x + w - 22, y + 18);

  // Error message (truncated)
  ctx.font = '8px "Segoe UI", sans-serif';
  ctx.fillStyle = '#FFCDD2';
  const truncated = truncateText(ctx, message, w - 20);
  ctx.fillText(truncated, x + 8, y + h - 6);
}

function drawTaskList(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  tasks: MissionData['tasks'],
  colors: ColorScheme
): void {
  const lineHeight = 16;
  const maxVisible = 6;

  ctx.font = '9px "Segoe UI", sans-serif';

  for (let i = 0; i < Math.min(tasks.length, maxVisible); i++) {
    const task = tasks[i];
    const ty = y + i * lineHeight;

    // Status icon
    const icon = task.status === 'succeeded' ? '✓'
      : task.status === 'running' ? '►'
      : task.status === 'failed' ? '✗'
      : '○';

    const iconColor = task.status === 'succeeded' ? '#4CAF50'
      : task.status === 'running' ? '#2196F3'
      : task.status === 'failed' ? '#F44336'
      : 'rgba(255,255,255,0.4)';

    ctx.fillStyle = iconColor;
    ctx.fillText(icon, x, ty + 10);

    // Tier badge
    ctx.fillStyle = TIER_COLORS[task.tier] ?? '#FFF';
    ctx.fillText(task.tier, x + 14, ty + 10);

    // Title
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const titleTruncated = truncateText(ctx, task.title, width - 70);
    ctx.fillText(titleTruncated, x + 34, ty + 10);

    // Mini progress
    if (task.status === 'running' && task.progress !== undefined) {
      const barX = x + width - 40;
      drawProgressBar(ctx, barX, ty + 3, 36, 4, task.progress, colors);
    }
  }

  if (tasks.length > maxVisible) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`+${tasks.length - maxVisible} more`, x, y + maxVisible * lineHeight + 10);
  }
}

// ═══════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════

export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
