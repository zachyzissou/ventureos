/**
 * /observations Command Handler — Phase 4 (#233)
 *
 * Formats observational memory state for Discord (≤ 2000 chars).
 * Supports priority + since filters.
 *
 * Usage:
 *   /observations                    — Show all active observations
 *   /observations --priority high    — Filter by priority
 *   /observations --since 24h        — Only observations from the last 24 hours
 *   /observations --priority high --since 7d
 */

import { ObservationStore } from './observation-store';
import { PRIORITY_EMOJI } from './types/observation';
import type { Observation, ObservationPriority, MemoryStateSnapshot } from './types/observation';
import structuredLogger from './structured-logger';

const { logInfo, OBSERVATION_EVENTS } = structuredLogger;

/** Maximum Discord message length. */
const DISCORD_MAX_CHARS = 2000;

/** Maximum observations to include in output. */
const MAX_DISPLAY_OBSERVATIONS = 25;

export interface ObservationsCommandOptions {
  /** Agent ID to query. */
  agentId: string;
  /** Filter by priority level. */
  priority?: ObservationPriority;
  /** Time filter: '1h', '24h', '7d', or ISO date string. */
  since?: string;
  /** Path to the observations database. */
  dbPath: string;
}

export interface ObservationsCommandResult {
  /** Formatted output string (≤ 2000 chars for Discord). */
  output: string;
  /** Number of observations returned. */
  count: number;
  /** Whether observational memory is enabled. */
  enabled: boolean;
  /** The memory state snapshot (for programmatic use). */
  snapshot: MemoryStateSnapshot | null;
}

/**
 * Parse a relative time string like '24h', '7d', '1h' into an ISO date string.
 * Returns null if parsing fails.
 */
export function parseSinceFilter(since: string): string | null {
  if (!since) return null;

  // Already an ISO date?
  if (/^\d{4}-\d{2}-\d{2}/.test(since)) return since;

  const match = since.match(/^(\d+)\s*(h|d|m)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const now = Date.now();
  let offsetMs: number;
  switch (unit) {
    case 'h':
      offsetMs = value * 3600_000;
      break;
    case 'd':
      offsetMs = value * 86400_000;
      break;
    case 'm':
      offsetMs = value * 60_000;
      break;
    default:
      return null;
  }

  return new Date(now - offsetMs).toISOString();
}

/**
 * Format a relative time string from an ISO date.
 */
function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format an observation for display.
 */
function formatObservation(obs: Observation): string {
  const emoji = obs.priority ? PRIORITY_EMOJI[obs.priority] : '⚪';
  const age = timeAgo(obs.createdAt);
  // Truncate content to keep output compact
  const content = obs.content.length > 120
    ? obs.content.slice(0, 117) + '...'
    : obs.content;
  return `${emoji} ${content} _(${age})_`;
}

/**
 * Execute the /observations command.
 *
 * Opens a temporary store connection, queries, formats, and closes.
 * Returns a Discord-safe string ≤ 2000 chars.
 */
export function executeObservationsCommand(
  opts: ObservationsCommandOptions,
): ObservationsCommandResult {
  const { agentId, priority, since, dbPath } = opts;

  logInfo('observations', OBSERVATION_EVENTS.COMMAND_INVOKED, '/observations command', {
    agentId,
    priority: priority ?? null,
    since: since ?? null,
  });

  let store: ObservationStore;
  try {
    store = new ObservationStore(dbPath);
  } catch {
    // Database doesn't exist or can't be opened — observational memory not set up
    logInfo('observations', OBSERVATION_EVENTS.COMMAND_EMPTY, 'Observation store unavailable');
    return {
      output: '🧠 **Observational Memory**\n\n_Observational memory is not configured for this agent. No observations database found._',
      count: 0,
      enabled: false,
      snapshot: null,
    };
  }

  try {
    // Build snapshot
    const snapshot = store.getMemoryStateSnapshot(agentId);

    // If no observations at all, give a friendly message
    if (snapshot.observationCount === 0) {
      logInfo('observations', OBSERVATION_EVENTS.COMMAND_EMPTY, 'No observations found', { agentId });
      return {
        output: '🧠 **Observational Memory**\n\n_No observations recorded yet for this agent. Observations are captured automatically during conversations._',
        count: 0,
        enabled: true,
        snapshot,
      };
    }

    // Resolve since filter
    const sinceIso = since ? parseSinceFilter(since) : undefined;

    // Query active observations
    const observations = store.queryActiveObservations({
      agentId,
      limit: MAX_DISPLAY_OBSERVATIONS,
      priority,
      since: sinceIso ?? undefined,
    });

    // Build header
    const lines: string[] = [];
    lines.push('🧠 **Observational Memory**');
    lines.push('');

    // Summary line
    const { high, medium, info } = snapshot.priorityCounts;
    const summaryParts: string[] = [];
    if (high > 0) summaryParts.push(`🔴 ${high} high`);
    if (medium > 0) summaryParts.push(`🟡 ${medium} medium`);
    if (info > 0) summaryParts.push(`🟢 ${info} info`);
    const summaryStr = summaryParts.length > 0
      ? summaryParts.join(' · ')
      : '_none_';

    lines.push(`**${snapshot.observationCount}** observations stored | ${summaryStr}`);

    // Last activity
    if (snapshot.lastObservationAt) {
      lines.push(`Last observed: ${timeAgo(snapshot.lastObservationAt)}`);
    }

    // Filter info
    const filterParts: string[] = [];
    if (priority) filterParts.push(`priority=${priority}`);
    if (since) filterParts.push(`since=${since}`);
    if (filterParts.length > 0) {
      lines.push(`Filter: ${filterParts.join(', ')}`);
    }

    lines.push('');

    if (observations.length === 0) {
      lines.push('_No observations match the current filters._');
    } else {
      // Add observations, respecting Discord char limit
      lines.push(`**Active observations** (${observations.length}${observations.length >= MAX_DISPLAY_OBSERVATIONS ? '+' : ''}):`);

      for (const obs of observations) {
        const formatted = formatObservation(obs);
        const tentative = lines.join('\n') + '\n' + formatted;
        if (tentative.length > DISCORD_MAX_CHARS - 50) {
          // Reserve space for the "and N more" footer
          const remaining = observations.length - lines.filter(l => l.startsWith('🔴') || l.startsWith('🟡') || l.startsWith('🟢') || l.startsWith('⚪')).length;
          if (remaining > 0) {
            lines.push(`_...and ${remaining} more observations_`);
          }
          break;
        }
        lines.push(formatted);
      }
    }

    const output = lines.join('\n').slice(0, DISCORD_MAX_CHARS);

    logInfo('observations', OBSERVATION_EVENTS.COMMAND_RESULT, 'Command completed', {
      agentId,
      count: observations.length,
      totalObservations: snapshot.observationCount,
    });

    return {
      output,
      count: observations.length,
      enabled: true,
      snapshot,
    };
  } finally {
    store.close();
  }
}

export default { executeObservationsCommand, parseSinceFilter };
