/**
 * Default Voice Trigger Rules — Phase 5.9 (#209)
 *
 * Predefined rules that map tactical-map domain events to voice line
 * lookups.  These are the "factory defaults" — callers can add/override.
 *
 * Rule evaluation order is by priority (desc).  First match wins.
 *
 * Cooldowns prevent spam from state flapping (e.g., agent toggling
 * ACTIVE ↔ IDLE rapidly).
 */

import type { VoiceTriggerRule, VoiceMapEvent } from './voice-types';
import { stateToTrigger } from './voice-types';

// ═══════════════════════════════════════════
// Rule Definitions
// ═══════════════════════════════════════════

/**
 * Error state transition — highest priority.
 * Agents entering ERROR state should always announce.
 */
const errorStateRule: VoiceTriggerRule = {
  id: 'state:error',
  priority: 100,
  cooldownMs: 30_000,
  matches: (e: VoiceMapEvent) =>
    e.type === 'state-change' && e.newState === 'ERROR',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'error',
  }),
};

/**
 * Overload state transition — high priority.
 */
const overloadStateRule: VoiceTriggerRule = {
  id: 'state:overloaded',
  priority: 90,
  cooldownMs: 30_000,
  matches: (e: VoiceMapEvent) =>
    e.type === 'state-change' && e.newState === 'OVERLOADED',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'overloaded',
  }),
};

/**
 * Mission completed event.
 */
const missionCompleteRule: VoiceTriggerRule = {
  id: 'mission:completed',
  priority: 80,
  cooldownMs: 10_000,
  matches: (e: VoiceMapEvent) => e.type === 'mission-completed',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'mission-complete',
  }),
};

/**
 * Mission failed event.
 */
const missionFailedRule: VoiceTriggerRule = {
  id: 'mission:failed',
  priority: 85,
  cooldownMs: 10_000,
  matches: (e: VoiceMapEvent) => e.type === 'mission-failed',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'mission-failed',
  }),
};

/**
 * Agent spawned event.
 */
const agentSpawnedRule: VoiceTriggerRule = {
  id: 'agent:spawned',
  priority: 70,
  cooldownMs: 60_000,
  matches: (e: VoiceMapEvent) => e.type === 'agent-spawned',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'spawn',
  }),
};

/**
 * Agent paused by operator.
 */
const agentPausedRule: VoiceTriggerRule = {
  id: 'agent:paused',
  priority: 60,
  cooldownMs: 15_000,
  matches: (e: VoiceMapEvent) => e.type === 'agent-paused',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'paused',
  }),
};

/**
 * Agent resumed by operator.
 */
const agentResumedRule: VoiceTriggerRule = {
  id: 'agent:resumed',
  priority: 60,
  cooldownMs: 15_000,
  matches: (e: VoiceMapEvent) => e.type === 'agent-resumed',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'resumed',
  }),
};

/**
 * Agent selected (clicked) by user.
 * Low priority, long cooldown — informational, not urgent.
 */
const agentSelectedRule: VoiceTriggerRule = {
  id: 'agent:selected',
  priority: 20,
  cooldownMs: 20_000,
  matches: (e: VoiceMapEvent) => e.type === 'agent-selected',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'selected',
  }),
};

/**
 * Agent becoming active (IDLE → ACTIVE transition).
 * Only triggers on the specific transition to avoid noise.
 */
const activeTransitionRule: VoiceTriggerRule = {
  id: 'state:active',
  priority: 30,
  cooldownMs: 30_000,
  matches: (e: VoiceMapEvent) =>
    e.type === 'state-change' &&
    e.newState === 'ACTIVE' &&
    e.previousState === 'IDLE',
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'active',
  }),
};

/**
 * Agent becoming idle (ACTIVE → IDLE transition).
 * Lowest priority, longest cooldown — purely ambient flavor.
 */
const idleTransitionRule: VoiceTriggerRule = {
  id: 'state:idle',
  priority: 10,
  cooldownMs: 60_000,
  matches: (e: VoiceMapEvent) =>
    e.type === 'state-change' &&
    e.newState === 'IDLE' &&
    (e.previousState === 'ACTIVE' || e.previousState === 'OVERLOADED'),
  resolve: (e: VoiceMapEvent) => ({
    agentId: e.agentId,
    trigger: 'idle',
  }),
};

// ═══════════════════════════════════════════
// Export
// ═══════════════════════════════════════════

/**
 * All default trigger rules, sorted by priority (desc).
 *
 * Usage:
 *   engine.addRules(DEFAULT_VOICE_TRIGGER_RULES);
 */
export const DEFAULT_VOICE_TRIGGER_RULES: VoiceTriggerRule[] = [
  errorStateRule,
  overloadStateRule,
  missionFailedRule,
  missionCompleteRule,
  agentSpawnedRule,
  agentPausedRule,
  agentResumedRule,
  activeTransitionRule,
  agentSelectedRule,
  idleTransitionRule,
];
