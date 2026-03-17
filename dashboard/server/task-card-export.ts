/**
 * Task Card Export — CSV/JSON download for task board card data.
 * Issue #219 — Phase 26: Task board data export.
 *
 * Provides read-only export of task card data with:
 * - Conservative field allowlist (no internal IDs, file paths, or secrets)
 * - Same filter set as the task board REST API (status, agentId, priority, search)
 * - Bounded export size (max 500 cards per export)
 * - CSV and JSON format support
 *
 * No schema changes. No new dependencies. Additive only.
 */

import type {
  TaskCard,
  TaskStatus,
  TaskPriority,
  TaskAssigneeType,
} from './types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Maximum number of cards allowed in a single export.
 * Prevents unbounded memory/CPU usage on export requests.
 */
export const CARD_EXPORT_MAX_ITEMS = 500;

/** Supported export formats. */
export type CardExportFormat = 'csv' | 'json';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Query parameters for card export. */
export interface CardExportQuery {
  format?: CardExportFormat;
  limit?: number;
  status?: string | null;
  agentId?: string | null;
  priority?: string | null;
  missionId?: string | null;
  assigneeType?: string | null;
  search?: string | null;
}

/** Result of a card export operation. */
export interface CardExportResult {
  /** The serialized export content (CSV string or JSON string). */
  content: string;
  /** MIME type for the response Content-Type header. */
  contentType: string;
  /** Suggested filename for the Content-Disposition header. */
  filename: string;
  /** Number of cards included in the export. */
  count: number;
}

// ─── Allowlist & Sanitization ────────────────────────────────────────────────

/**
 * Conservative field allowlist for task card export.
 * Explicitly enumerates safe, user-facing fields only.
 *
 * Included fields:
 * - id: stable card identifier for cross-referencing (UUIDs leak no secrets)
 * - title, description, status, priority, agentId: user-facing metadata
 * - missionId, missionBrief, assigneeType, assigneeId: mission/owner metadata
 * - createdAt, queuedAt, startedAt, completedAt, runtimeMs: timing info
 * - resultSummary: user-facing execution summary
 * - dependencies, artifactLinks, replaySessionId: linkage metadata
 *
 * Excluded fields and rationale:
 * - error: may contain stack traces or internal paths
 * - tokensUsed: internal resource accounting
 * - costEstimate: internal cost tracking
 */
const EXPORT_FIELDS = [
  'id',
  'title',
  'description',
  'status',
  'priority',
  'agentId',
  'missionId',
  'missionBrief',
  'assigneeType',
  'assigneeId',
  'createdAt',
  'queuedAt',
  'startedAt',
  'completedAt',
  'runtimeMs',
  'resultSummary',
  'dependencies',
  'artifactLinks',
  'replaySessionId',
] as const;

type ExportField = typeof EXPORT_FIELDS[number];

/**
 * Sanitize a task card for export using the conservative allowlist.
 * Returns a plain object with only the allowed fields.
 * Timestamps are formatted as ISO 8601 strings.
 * Pure function — no side effects.
 */
export function sanitizeCardForExport(card: TaskCard): Record<string, unknown> {
  return {
    id: card.id,
    title: card.title ?? '',
    description: card.description ?? '',
    status: card.status,
    priority: card.priority,
    agentId: card.agentId ?? '',
    missionId: card.missionId ?? '',
    missionBrief: card.missionBrief ?? '',
    assigneeType: card.assigneeType ?? '',
    assigneeId: card.assigneeId ?? '',
    createdAt: formatExportTs(card.createdAt),
    queuedAt: formatExportTs(card.queuedAt),
    startedAt: formatExportTs(card.startedAt),
    completedAt: formatExportTs(card.completedAt),
    runtimeMs: card.runtimeMs,
    resultSummary: card.resultSummary ?? '',
    dependencies: Array.isArray(card.dependencies) ? card.dependencies.join('; ') : '',
    artifactLinks: Array.isArray(card.artifactLinks) ? card.artifactLinks.join('; ') : '',
    replaySessionId: card.replaySessionId ?? '',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format a timestamp as ISO 8601 string for export.
 * Returns empty string for null/undefined/0.
 */
function formatExportTs(ts: number | null | undefined): string {
  if (ts == null || ts === 0) return '';
  return new Date(ts).toISOString();
}

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 * Pure function.
 */
export function csvEscapeCard(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ─── Filter ──────────────────────────────────────────────────────────────────

const VALID_STATUSES: TaskStatus[] = [
  'backlog',
  'queued',
  'running',
  'blocked',
  'review',
  'done',
  'failed',
];
const VALID_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
const VALID_ASSIGNEE_TYPES: TaskAssigneeType[] = ['human', 'control_plane', 'nexus', 'agent'];

function normalizeAssigneeType(value: string | null | undefined, fallback: TaskAssigneeType = 'agent'): TaskAssigneeType {
  if (!value) return fallback;
  if (value === 'nexus') return 'control_plane';
  return VALID_ASSIGNEE_TYPES.includes(value as TaskAssigneeType) ? (value as TaskAssigneeType) : fallback;
}

/**
 * Filter task cards for export.
 * Mirrors the filter logic in task-board.ts filterTasks() with an
 * additional search parameter for title/description substring match.
 * Pure function.
 */
export function filterCardsForExport(
  tasks: TaskCard[],
  opts: {
    status?: string | null;
    agentId?: string | null;
    priority?: string | null;
    missionId?: string | null;
    assigneeType?: string | null;
    search?: string | null;
  },
): TaskCard[] {
  let out = tasks;

  if (opts.status && VALID_STATUSES.includes(opts.status as TaskStatus)) {
    out = out.filter((t) => t.status === opts.status);
  }
  if (opts.agentId) {
    out = out.filter((t) => t.agentId === opts.agentId);
  }
  if (opts.priority && VALID_PRIORITIES.includes(opts.priority as TaskPriority)) {
    out = out.filter((t) => t.priority === opts.priority);
  }
  if (opts.missionId) {
    out = out.filter((t) => t.missionId === opts.missionId);
  }
  if (opts.assigneeType && VALID_ASSIGNEE_TYPES.includes(opts.assigneeType as TaskAssigneeType)) {
    const requestedType = normalizeAssigneeType(opts.assigneeType, 'agent');
    out = out.filter((t) => normalizeAssigneeType(t.assigneeType ?? 'agent', 'agent') === requestedType);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    out = out.filter((t) =>
      (t.title ?? '').toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q),
    );
  }

  return out;
}

// ─── CSV Formatter ───────────────────────────────────────────────────────────

/** CSV column headers for task card export. */
const CARD_CSV_HEADERS: ExportField[] = [...EXPORT_FIELDS];

/**
 * Convert task cards to CSV format.
 * Pure function — no I/O, bounded by input array length.
 */
export function cardsToCsv(cards: TaskCard[]): string {
  const rows: string[] = [CARD_CSV_HEADERS.join(',')];

  for (const card of cards) {
    const safe = sanitizeCardForExport(card);
    const row = CARD_CSV_HEADERS.map((h) =>
      csvEscapeCard(safe[h] as string | number | boolean | null),
    );
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

// ─── JSON Formatter ──────────────────────────────────────────────────────────

/**
 * Convert task cards to a safe JSON export format.
 * Returns a JSON string with sanitized cards (conservative allowlist).
 * Pure function.
 */
export function cardsToJson(cards: TaskCard[]): string {
  const safeCards = cards.map(sanitizeCardForExport);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: 'ventureos-task-cards-export-v1',
    count: safeCards.length,
    cards: safeCards,
  }, null, 2);
}

// ─── Main Export Function ────────────────────────────────────────────────────

/**
 * Export task cards with filtering and format selection.
 * Returns formatted content (CSV or JSON), content type, and suggested filename.
 *
 * Secret-safe: all cards pass through sanitizeCardForExport() which applies
 * a conservative field allowlist. Only user-facing task data is included —
 * no internal fields, file paths, error traces, or cost/token data leak through.
 *
 * Bounded: max CARD_EXPORT_MAX_ITEMS cards per export.
 */
export function exportTaskCards(
  tasks: TaskCard[],
  opts: CardExportQuery = {},
): CardExportResult {
  const format: CardExportFormat = opts.format === 'csv' ? 'csv' : 'json';

  // Apply filters (same as task board REST API)
  let filtered = filterCardsForExport(tasks, {
    status: opts.status,
    agentId: opts.agentId,
    priority: opts.priority,
    missionId: opts.missionId,
    assigneeType: opts.assigneeType,
    search: opts.search,
  });

  // Apply bounded limit
  const limit = Math.max(1, Math.min(opts.limit ?? CARD_EXPORT_MAX_ITEMS, CARD_EXPORT_MAX_ITEMS));
  if (filtered.length > limit) {
    filtered = filtered.slice(0, limit);
  }

  const dateSuffix = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    return {
      content: cardsToCsv(filtered),
      contentType: 'text/csv; charset=utf-8',
      filename: `task-cards-${dateSuffix}.csv`,
      count: filtered.length,
    };
  }

  return {
    content: cardsToJson(filtered),
    contentType: 'application/json; charset=utf-8',
    filename: `task-cards-${dateSuffix}.json`,
    count: filtered.length,
  };
}
