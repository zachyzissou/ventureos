/**
 * Mission History Timeline — Phase 5.5
 *
 * Renders a vertical timeline showing mission phase transitions.
 * Features:
 * - Chronological phase entries with timestamps
 * - Color-coded phase dots
 * - Duration between phases
 * - Scrollable for long histories
 * - Compact mode for inline card usage
 *
 * Protoss lore: The Khaydarin Chronicle — a living record of
 * psionic events etched into the crystalline memory lattice.
 */

import type {
  MissionHistoryEntry,
  MissionPhase,
  MissionData,
  ColorScheme,
} from './types';
import { PHASE_COLORS } from './types';

// ═══════════════════════════════════════════
// Timeline Configuration
// ═══════════════════════════════════════════

export interface TimelineConfig {
  /** Entry height in pixels */
  entryHeight: number;
  /** Left margin for the timeline rail */
  railX: number;
  /** Dot radius on the rail */
  dotRadius: number;
  /** Rail line width */
  railWidth: number;
  /** Max entries to display (0 = unlimited) */
  maxEntries: number;
  /** Show duration labels between entries */
  showDurations: boolean;
  /** Compact mode (smaller, less detail) */
  compact: boolean;
}

export const DEFAULT_TIMELINE_CONFIG: TimelineConfig = {
  entryHeight: 36,
  railX: 16,
  dotRadius: 5,
  railWidth: 2,
  maxEntries: 50,
  showDurations: true,
  compact: false,
};

export const COMPACT_TIMELINE_CONFIG: TimelineConfig = {
  entryHeight: 20,
  railX: 10,
  dotRadius: 3,
  railWidth: 1,
  maxEntries: 8,
  showDurations: false,
  compact: true,
};

// ═══════════════════════════════════════════
// Duration Formatting
// ═══════════════════════════════════════════

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

/**
 * Format an ISO timestamp to a short display string.
 */
export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  } catch {
    return '—';
  }
}

/**
 * Format an ISO timestamp to a date + time string.
 */
export function formatDatetime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  } catch {
    return '—';
  }
}

// ═══════════════════════════════════════════
// Timeline Data Processing
// ═══════════════════════════════════════════

export interface TimelineEntry {
  phase: MissionPhase;
  timestamp: string;
  note: string;
  durationFromPrevMs: number | null;
  colors: ColorScheme;
}

/**
 * Transform raw history entries into renderable timeline entries.
 */
export function processTimelineEntries(
  history: MissionHistoryEntry[],
  maxEntries: number = 50
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const sorted = [...history].sort(
    (a, b) => new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime()
  );

  // Take the most recent entries if exceeding max
  const trimmed = maxEntries > 0 && sorted.length > maxEntries
    ? sorted.slice(sorted.length - maxEntries)
    : sorted;

  for (let i = 0; i < trimmed.length; i++) {
    const entry = trimmed[i];
    const prevEntry = i > 0 ? trimmed[i - 1] : null;

    let durationFromPrevMs: number | null = null;
    if (prevEntry) {
      const prevTime = new Date(prevEntry.enteredAt).getTime();
      const currTime = new Date(entry.enteredAt).getTime();
      if (!isNaN(prevTime) && !isNaN(currTime)) {
        durationFromPrevMs = currTime - prevTime;
      }
    }

    entries.push({
      phase: entry.phase,
      timestamp: entry.enteredAt,
      note: entry.note ?? '',
      durationFromPrevMs,
      colors: PHASE_COLORS[entry.phase],
    });
  }

  return entries;
}

// ═══════════════════════════════════════════
// Timeline Rendering
// ═══════════════════════════════════════════

/**
 * Render a mission's history timeline on canvas.
 */
export function renderTimeline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  history: MissionHistoryEntry[],
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG
): number {
  const entries = processTimelineEntries(history, config.maxEntries);
  if (entries.length === 0) return 0;

  ctx.save();

  const totalHeight = entries.length * config.entryHeight;
  const railCenterX = x + config.railX;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryY = y + i * config.entryHeight;

    // ── Rail line (connecting dots) ─────────────────────
    if (i < entries.length - 1) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = config.railWidth;
      ctx.beginPath();
      ctx.moveTo(railCenterX, entryY + config.dotRadius);
      ctx.lineTo(railCenterX, entryY + config.entryHeight - config.dotRadius);
      ctx.stroke();
    }

    // ── Phase dot ───────────────────────────────────────
    ctx.fillStyle = entry.colors.primary;
    ctx.beginPath();
    ctx.arc(railCenterX, entryY, config.dotRadius, 0, Math.PI * 2);
    ctx.fill();

    // ── Timestamp ───────────────────────────────────────
    const textX = railCenterX + config.dotRadius + 8;

    if (config.compact) {
      ctx.font = '8px "Segoe UI", sans-serif';
      ctx.fillStyle = entry.colors.text;
      ctx.fillText(
        `${entry.phase.toUpperCase()} ${formatTimestamp(entry.timestamp)}`,
        textX,
        entryY + 3
      );
    } else {
      // Phase label
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.fillStyle = entry.colors.text;
      ctx.fillText(entry.phase.toUpperCase(), textX, entryY + 4);

      // Timestamp
      ctx.font = '8px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(formatDatetime(entry.timestamp), textX + 55, entryY + 4);

      // Note
      if (entry.note) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '8px "Segoe UI", sans-serif';
        const noteText = entry.note.length > 40 ? entry.note.slice(0, 40) + '…' : entry.note;
        ctx.fillText(noteText, textX, entryY + 16);
      }

      // Duration from previous
      if (config.showDurations && entry.durationFromPrevMs !== null && i > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '7px "Segoe UI", sans-serif';
        ctx.fillText(
          `↑ ${formatDuration(entry.durationFromPrevMs)}`,
          railCenterX - config.dotRadius - 4,
          entryY - config.entryHeight / 2 + 3
        );
        ctx.textAlign = 'left';
      }
    }
  }

  ctx.restore();
  return totalHeight;
}

// ═══════════════════════════════════════════
// Timeline Panel
// ═══════════════════════════════════════════

export interface TimelinePanelConfig {
  x: number;
  y: number;
  width: number;
  maxHeight: number;
  title?: string;
}

/**
 * Render a self-contained timeline panel with header and background.
 * Returns the actual rendered height.
 */
export function renderTimelinePanel(
  ctx: CanvasRenderingContext2D,
  missions: MissionData[],
  panelConfig: TimelinePanelConfig,
  timelineConfig: TimelineConfig = DEFAULT_TIMELINE_CONFIG
): number {
  const { x, y, width, maxHeight, title } = panelConfig;

  // Merge all history entries from all missions
  const allHistory: (MissionHistoryEntry & { missionTitle: string })[] = [];
  for (const m of missions) {
    for (const h of m.history) {
      allHistory.push({ ...h, missionTitle: m.title });
    }
  }

  // Sort by time descending (most recent first)
  allHistory.sort(
    (a, b) => new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime()
  );

  const visibleEntries = timelineConfig.maxEntries > 0
    ? allHistory.slice(0, timelineConfig.maxEntries)
    : allHistory;
  const contentHeight = Math.min(
    visibleEntries.length * timelineConfig.entryHeight + 30,
    maxHeight
  );

  ctx.save();

  // Panel background
  ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
  ctx.fillRect(x, y, width, contentHeight);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, contentHeight);

  // Header
  ctx.font = 'bold 10px "Segoe UI", sans-serif';
  ctx.fillStyle = '#B0BEC5';
  ctx.fillText(title ?? 'MISSION TIMELINE', x + 8, y + 16);

  // Timeline entries (convert back to MissionHistoryEntry format)
  const historyForRender: MissionHistoryEntry[] = visibleEntries.map((h) => ({
    phase: h.phase,
    enteredAt: h.enteredAt,
    note: `[${h.missionTitle}] ${h.note ?? ''}`.trim(),
  }));

  renderTimeline(ctx, x + 4, y + 30, historyForRender, timelineConfig);

  ctx.restore();
  return contentHeight;
}
