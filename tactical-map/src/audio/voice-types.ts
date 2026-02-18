/**
 * Voice Line Types — Phase 5.9 (#209)
 *
 * Type definitions for the agent voice-line / TTS system.
 * Builds on top of the AudioManager from #208 to play contextual
 * agent voice lines when map events occur.
 *
 * Design:
 *   MapEvent → TriggerRule → VoiceLineEntry → AudioManager.play('voice' bus)
 *
 * Protoss lore: Each agent's psionic signature resonates with a unique
 * harmonic — their voice in the Khala, speaking truth without filler.
 */

import type { AgentId } from '@/config';
import type { BuildingState } from '@/state/types';
import type { SoundEventId } from './types';

// ═══════════════════════════════════════════
// Voice Line Identifiers
// ═══════════════════════════════════════════

/**
 * Agent-scoped voice line event.
 *
 * Convention: `voice:<agentId>:<trigger>`
 * The trigger portion maps 1:1 to a VoiceLineTrigger.
 */
export type VoiceLineEventId =
  | `voice:${AgentId}:spawn`
  | `voice:${AgentId}:idle`
  | `voice:${AgentId}:active`
  | `voice:${AgentId}:overloaded`
  | `voice:${AgentId}:error`
  | `voice:${AgentId}:paused`
  | `voice:${AgentId}:resumed`
  | `voice:${AgentId}:mission-complete`
  | `voice:${AgentId}:mission-failed`
  | `voice:${AgentId}:selected`;

/**
 * The triggering condition that causes a voice line to play.
 */
export type VoiceLineTrigger =
  | 'spawn'
  | 'idle'
  | 'active'
  | 'overloaded'
  | 'error'
  | 'paused'
  | 'resumed'
  | 'mission-complete'
  | 'mission-failed'
  | 'selected';

/**
 * All supported triggers, exported for iteration and validation.
 */
export const ALL_VOICE_TRIGGERS: readonly VoiceLineTrigger[] = [
  'spawn', 'idle', 'active', 'overloaded', 'error',
  'paused', 'resumed', 'mission-complete', 'mission-failed', 'selected',
] as const;

// ═══════════════════════════════════════════
// Voice Line Catalog Entry
// ═══════════════════════════════════════════

/**
 * A single voice line entry in the catalog.
 *
 * Each agent × trigger can have multiple variants; the engine
 * picks one at random (or round-robin) to avoid repetition.
 */
export interface VoiceLineEntry {
  /** Which agent this line belongs to. */
  agentId: AgentId;
  /** What trigger plays this line. */
  trigger: VoiceLineTrigger;
  /** Audio source URL or data URI. */
  src: string;
  /** Display subtitle text (shown in HUD if subtitles enabled). */
  subtitle: string;
  /** Duration hint in ms (for subtitle timing; optional). */
  durationMs?: number;
  /** Priority 0..10; higher wins when multiple fire simultaneously. */
  priority?: number;
}

/**
 * The full voice-line catalog: agent → trigger → variant entries.
 */
export type VoiceLineCatalog = Map<AgentId, Map<VoiceLineTrigger, VoiceLineEntry[]>>;

// ═══════════════════════════════════════════
// Trigger Rules
// ═══════════════════════════════════════════

/**
 * A trigger rule maps a domain event to a voice line lookup.
 *
 * Rules are evaluated by the VoiceLineEngine when a MapEvent fires.
 * The first matching rule wins (rules are priority-sorted).
 */
export interface VoiceTriggerRule {
  /** Unique rule id for logging/debugging. */
  id: string;
  /** Higher priority rules are evaluated first. 0 = default. */
  priority: number;
  /** Predicate: does this rule match the given event? */
  matches: (event: VoiceMapEvent) => boolean;
  /** If matched, which agent speaks and which trigger to look up. */
  resolve: (event: VoiceMapEvent) => { agentId: AgentId; trigger: VoiceLineTrigger } | null;
  /**
   * Cooldown in ms — suppress re-triggering for the same agent+trigger
   * within this window. Prevents rapid-fire on state flapping.
   * Default: 5000ms.
   */
  cooldownMs?: number;
}

// ═══════════════════════════════════════════
// Map Events (input to the trigger system)
// ═══════════════════════════════════════════

/**
 * Domain events from the tactical map that can trigger voice lines.
 *
 * These are a superset of InteractionEventType + state-change events.
 * The voice-event bridge translates low-level events into these.
 */
export type VoiceMapEventType =
  | 'state-change'
  | 'agent-selected'
  | 'agent-spawned'
  | 'agent-paused'
  | 'agent-resumed'
  | 'mission-completed'
  | 'mission-failed';

export interface VoiceMapEvent {
  type: VoiceMapEventType;
  agentId: AgentId;
  /** For state-change: the new building state. */
  newState?: BuildingState;
  /** For state-change: the previous building state. */
  previousState?: BuildingState;
  /** Event timestamp (Date.now()). */
  timestamp: number;
}

// ═══════════════════════════════════════════
// Engine Configuration
// ═══════════════════════════════════════════

/**
 * Configuration for the VoiceLineEngine.
 */
export interface VoiceLineEngineConfig {
  /** Feature flag: master enable/disable for voice lines. */
  enabled: boolean;
  /** Show subtitle text in HUD when a voice line plays. */
  subtitlesEnabled: boolean;
  /** Global cooldown between any voice line playback (ms). */
  globalCooldownMs: number;
  /** Per-agent+trigger cooldown (ms). Overridden by rule-level cooldown. */
  defaultCooldownMs: number;
  /** Max concurrent voice lines (prevents cacophony). */
  maxConcurrent: number;
}

export const DEFAULT_VOICE_ENGINE_CONFIG: VoiceLineEngineConfig = {
  enabled: true,
  subtitlesEnabled: true,
  globalCooldownMs: 2000,
  defaultCooldownMs: 15000,
  maxConcurrent: 1,
};

// ═══════════════════════════════════════════
// Engine State (observable)
// ═══════════════════════════════════════════

/**
 * Observable state emitted by the engine for UI binding
 * (e.g., subtitle overlay).
 */
export interface VoiceLineState {
  /** Currently playing voice line (null = silence). */
  current: {
    agentId: AgentId;
    trigger: VoiceLineTrigger;
    subtitle: string;
    startedAt: number;
    durationMs: number;
  } | null;
  /** Queue depth (lines waiting to play). */
  queueDepth: number;
}

export const INITIAL_VOICE_LINE_STATE: VoiceLineState = {
  current: null,
  queueDepth: 0,
};

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

/**
 * Build a SoundEventId from an agent + trigger pair.
 *
 * The voice line system registers sounds under the `agent:*` namespace
 * of SoundEventId. Since SoundEventId is a union, voice lines use
 * the existing agent lifecycle events where they overlap, and we
 * store the full voice-line event id internally.
 */
export function voiceEventId(agentId: AgentId, trigger: VoiceLineTrigger): string {
  return `voice:${agentId}:${trigger}`;
}

/**
 * Map a BuildingState transition to a VoiceLineTrigger (if applicable).
 */
export function stateToTrigger(state: BuildingState): VoiceLineTrigger | null {
  switch (state) {
    case 'IDLE': return 'idle';
    case 'ACTIVE': return 'active';
    case 'OVERLOADED': return 'overloaded';
    case 'ERROR': return 'error';
    default: return null;
  }
}

/**
 * Map a VoiceLineTrigger to a SoundEventId for AudioManager registration.
 *
 * Voice lines are registered as agent lifecycle events when they map cleanly.
 * Otherwise we return the closest match.
 */
export function triggerToSoundEvent(trigger: VoiceLineTrigger): SoundEventId {
  switch (trigger) {
    case 'spawn': return 'agent:spawn';
    case 'idle': return 'agent:idle';
    case 'active': return 'agent:active';
    case 'overloaded': return 'agent:overloaded';
    case 'error': return 'agent:error';
    case 'paused': return 'agent:paused';
    case 'resumed': return 'agent:resumed';
    case 'mission-complete': return 'mission:completed';
    case 'mission-failed': return 'mission:failed';
    case 'selected': return 'agent:active'; // closest match
  }
}
