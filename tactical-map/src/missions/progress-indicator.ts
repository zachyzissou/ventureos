/**
 * Progress Indicators — Phase 5.5
 *
 * Multiple progress visualization styles for missions and tasks:
 * - Linear bar (horizontal)
 * - Circular/radial gauge
 * - Step indicator (phase dots)
 * - Compact inline badge
 *
 * All renderers target Canvas2D for integration with the tactical map
 * rendering pipeline.
 */

import type {
  MissionPhase,
  ColorScheme,
} from './types';
import { PHASE_COLORS, MISSION_PHASE_ORDER } from './types';

// ═══════════════════════════════════════════
// Linear Progress Bar
// ═══════════════════════════════════════════

export interface LinearProgressConfig {
  width: number;
  height: number;
  borderRadius: number;
  showLabel: boolean;
  labelPosition: 'inside' | 'right' | 'above';
  animated: boolean;
}

export const DEFAULT_LINEAR_CONFIG: LinearProgressConfig = {
  width: 200,
  height: 10,
  borderRadius: 5,
  showLabel: true,
  labelPosition: 'right',
  animated: true,
};

/**
 * Render a linear progress bar with gradient fill and optional label.
 */
export function renderLinearProgress(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  colors: ColorScheme,
  config: LinearProgressConfig = DEFAULT_LINEAR_CONFIG,
  time: number = Date.now()
): void {
  const { width, height, borderRadius, showLabel, labelPosition, animated } = config;
  const clamped = Math.max(0, Math.min(100, progress));
  const fillWidth = (width * clamped) / 100;

  ctx.save();

  // Background track
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundRect(ctx, x, y, width, height, borderRadius);
  ctx.fill();

  // Fill bar with gradient
  if (fillWidth > 0) {
    const gradient = ctx.createLinearGradient(x, y, x + fillWidth, y);
    gradient.addColorStop(0, colors.secondary);
    gradient.addColorStop(1, colors.primary);
    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, Math.max(fillWidth, height), height, borderRadius);
    ctx.fill();

    // Animated shimmer effect
    if (animated && clamped < 100 && clamped > 0) {
      const shimmerX = x + ((time / 15) % (fillWidth + 20)) - 20;
      const shimmerGradient = ctx.createLinearGradient(shimmerX, y, shimmerX + 20, y);
      shimmerGradient.addColorStop(0, 'rgba(255,255,255,0)');
      shimmerGradient.addColorStop(0.5, 'rgba(255,255,255,0.15)');
      shimmerGradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.save();
      // Clip to the fill area
      roundRect(ctx, x, y, Math.max(fillWidth, height), height, borderRadius);
      ctx.clip();
      ctx.fillStyle = shimmerGradient;
      ctx.fillRect(shimmerX, y, 20, height);
      ctx.restore();
    }
  }

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 0.5;
  roundRect(ctx, x, y, width, height, borderRadius);
  ctx.stroke();

  // Label
  if (showLabel) {
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.fillStyle = colors.text;

    const label = `${Math.round(clamped)}%`;

    if (labelPosition === 'right') {
      ctx.fillText(label, x + width + 6, y + height - 1);
    } else if (labelPosition === 'above') {
      ctx.fillText(label, x, y - 4);
    } else {
      // inside
      ctx.textAlign = 'center';
      ctx.fillText(label, x + width / 2, y + height - 2);
      ctx.textAlign = 'left';
    }
  }

  ctx.restore();
}

// ═══════════════════════════════════════════
// Circular/Radial Progress Gauge
// ═══════════════════════════════════════════

export interface CircularProgressConfig {
  radius: number;
  lineWidth: number;
  showLabel: boolean;
  showPhaseIcon: boolean;
}

export const DEFAULT_CIRCULAR_CONFIG: CircularProgressConfig = {
  radius: 24,
  lineWidth: 4,
  showLabel: true,
  showPhaseIcon: false,
};

/**
 * Render a circular progress gauge.
 * Used for prominent mission status on dashboard panels.
 */
export function renderCircularProgress(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number,
  colors: ColorScheme,
  config: CircularProgressConfig = DEFAULT_CIRCULAR_CONFIG
): void {
  const { radius, lineWidth, showLabel, showPhaseIcon } = config;
  const clamped = Math.max(0, Math.min(100, progress));
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (Math.PI * 2 * clamped) / 100;

  ctx.save();

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Progress arc
  if (clamped > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Center label
  if (showLabel) {
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(clamped)}%`, cx, cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore();
}

// ═══════════════════════════════════════════
// Phase Step Indicator
// ═══════════════════════════════════════════

export interface PhaseStepConfig {
  dotRadius: number;
  spacing: number;
  lineWidth: number;
  showLabels: boolean;
}

export const DEFAULT_PHASE_STEP_CONFIG: PhaseStepConfig = {
  dotRadius: 6,
  spacing: 36,
  lineWidth: 2,
  showLabels: true,
};

/**
 * Render a horizontal phase step indicator showing mission progression.
 * Each phase is a dot connected by lines. Completed phases are filled,
 * current phase pulses, future phases are outlined.
 */
export function renderPhaseSteps(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  currentPhase: MissionPhase,
  config: PhaseStepConfig = DEFAULT_PHASE_STEP_CONFIG,
  time: number = Date.now()
): void {
  const phases = MISSION_PHASE_ORDER;
  const currentIdx = phases.indexOf(currentPhase);
  const { dotRadius, spacing, lineWidth, showLabels } = config;

  ctx.save();

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const cx = x + i * spacing;
    const cy = y;
    const colors = PHASE_COLORS[phase];
    const isCompleted = i < currentIdx;
    const isCurrent = i === currentIdx;
    const isFuture = i > currentIdx;

    // Connection line to next dot
    if (i < phases.length - 1) {
      const nextX = x + (i + 1) * spacing;
      ctx.strokeStyle = isCompleted
        ? colors.primary
        : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(cx + dotRadius + 2, cy);
      ctx.lineTo(nextX - dotRadius - 2, cy);
      ctx.stroke();
    }

    // Dot
    ctx.beginPath();
    ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);

    if (isCompleted) {
      ctx.fillStyle = colors.primary;
      ctx.fill();
      // Checkmark
      ctx.strokeStyle = '#0A0F1E';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy);
      ctx.lineTo(cx - 1, cy + 2);
      ctx.lineTo(cx + 3, cy - 2);
      ctx.stroke();
    } else if (isCurrent) {
      // Pulsing glow
      const pulseAlpha = 0.4 + Math.sin(time / 500) * 0.3;
      ctx.fillStyle = colors.glow.replace(/[\d.]+\)$/, `${pulseAlpha})`);
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius + 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = colors.primary;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Label
    if (showLabels) {
      ctx.font = '7px "Segoe UI", sans-serif';
      ctx.fillStyle = isCurrent ? colors.text : 'rgba(255, 255, 255, 0.4)';
      ctx.textAlign = 'center';
      ctx.fillText(phase.toUpperCase(), cx, cy + dotRadius + 12);
    }
  }

  ctx.textAlign = 'left';
  ctx.restore();
}

// ═══════════════════════════════════════════
// Compact Progress Badge
// ═══════════════════════════════════════════

/**
 * Render a tiny inline progress badge (for use in lists/tables).
 * Shows a colored chip with percentage.
 */
export function renderProgressBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  phase: MissionPhase
): void {
  const colors = PHASE_COLORS[phase];
  const clamped = Math.max(0, Math.min(100, progress));
  const badgeWidth = 36;
  const badgeHeight = 14;
  const radius = 3;

  ctx.save();

  // Background
  ctx.fillStyle = colors.secondary + '80';
  roundRect(ctx, x, y, badgeWidth, badgeHeight, radius);
  ctx.fill();

  // Text
  ctx.font = 'bold 8px "Segoe UI", sans-serif';
  ctx.fillStyle = colors.text;
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(clamped)}%`, x + badgeWidth / 2, y + 10);
  ctx.textAlign = 'left';

  ctx.restore();
}

// ═══════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════

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
