/**
 * VoiceLineEngine — Phase 5.9 (#209)
 *
 * Orchestrates voice-line playback for agent events on the tactical map.
 * Sits between the trigger-rule system and the AudioManager from #208.
 *
 * Responsibilities:
 *   1. Maintain a VoiceLineCatalog (agent → trigger → variant[])
 *   2. Evaluate VoiceTriggerRules against incoming VoiceMapEvents
 *   3. Enforce cooldowns (per-rule, per-agent, global) to prevent spam
 *   4. Queue / preempt voice lines (max 1 concurrent by default)
 *   5. Expose observable VoiceLineState for subtitle UI
 *
 * Graceful degradation:
 *   - If AudioManager is unavailable or voice bus is muted, the engine
 *     still tracks state (subtitles work without audio).
 *   - If the catalog has no entry for a trigger, it silently skips.
 *   - Feature flag `enabled: false` turns the entire engine into a no-op.
 */

import type { AgentId } from '@/config';
import type { IAudioManager, PlaybackHandle, PlayOptions } from './types';
import type {
  VoiceLineEntry,
  VoiceLineCatalog,
  VoiceLineTrigger,
  VoiceTriggerRule,
  VoiceMapEvent,
  VoiceLineEngineConfig,
  VoiceLineState,
} from './voice-types';
import {
  DEFAULT_VOICE_ENGINE_CONFIG,
  INITIAL_VOICE_LINE_STATE,
  voiceEventId,
} from './voice-types';

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

type CooldownKey = string; // `${agentId}:${trigger}`
type StateListener = (state: VoiceLineState) => void;

interface QueuedLine {
  entry: VoiceLineEntry;
  priority: number;
  timestamp: number;
}

// ═══════════════════════════════════════════
// Engine
// ═══════════════════════════════════════════

export class VoiceLineEngine {
  private config: VoiceLineEngineConfig;
  private audioManager: IAudioManager | null;
  private catalog: VoiceLineCatalog = new Map();
  private rules: VoiceTriggerRule[] = [];

  // Cooldown tracking
  private cooldowns: Map<CooldownKey, number> = new Map();
  private lastGlobalPlay = 0;

  // Playback tracking
  private currentHandle: PlaybackHandle | null = null;
  private currentEntry: VoiceLineEntry | null = null;
  private queue: QueuedLine[] = [];
  private subtitleTimer: ReturnType<typeof setTimeout> | null = null;

  // Round-robin variant index per agent+trigger
  private variantIndex: Map<CooldownKey, number> = new Map();

  // Observable state
  private _state: VoiceLineState = { ...INITIAL_VOICE_LINE_STATE };
  private listeners: Set<StateListener> = new Set();

  private _disposed = false;

  constructor(
    audioManager: IAudioManager | null,
    config: Partial<VoiceLineEngineConfig> = {},
  ) {
    this.audioManager = audioManager;
    this.config = { ...DEFAULT_VOICE_ENGINE_CONFIG, ...config };
  }

  // ── Catalog Management ─────────────────────

  /**
   * Register a voice line entry. Appends to existing variants for
   * the same agent+trigger pair.
   */
  registerLine(entry: VoiceLineEntry): void {
    let agentMap = this.catalog.get(entry.agentId);
    if (!agentMap) {
      agentMap = new Map();
      this.catalog.set(entry.agentId, agentMap);
    }
    let variants = agentMap.get(entry.trigger);
    if (!variants) {
      variants = [];
      agentMap.set(entry.trigger, variants);
    }
    variants.push(entry);

    // Also register the sound with AudioManager for buffer decoding
    if (this.audioManager) {
      this.audioManager.register({
        eventId: voiceEventId(entry.agentId, entry.trigger) as any,
        src: entry.src,
        defaults: { bus: 'voice', volume: 1.0 },
      });
    }
  }

  /**
   * Bulk-register voice line entries.
   */
  registerLines(entries: VoiceLineEntry[]): void {
    for (const entry of entries) {
      this.registerLine(entry);
    }
  }

  /**
   * Get catalog size (total variant entries across all agents).
   */
  get catalogSize(): number {
    let count = 0;
    for (const agentMap of this.catalog.values()) {
      for (const variants of agentMap.values()) {
        count += variants.length;
      }
    }
    return count;
  }

  // ── Rule Management ────────────────────────

  /**
   * Add a trigger rule. Rules are sorted by priority (desc) on add.
   */
  addRule(rule: VoiceTriggerRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Bulk-add trigger rules.
   */
  addRules(rules: VoiceTriggerRule[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  /**
   * Get registered rule count.
   */
  get ruleCount(): number {
    return this.rules.length;
  }

  // ── Event Processing ───────────────────────

  /**
   * Process a map event through the trigger rules.
   *
   * Returns true if a voice line was queued/played, false if suppressed
   * (disabled, on cooldown, no match, no catalog entry).
   */
  handleEvent(event: VoiceMapEvent): boolean {
    if (this._disposed || !this.config.enabled) return false;

    // Evaluate rules in priority order
    for (const rule of this.rules) {
      if (!rule.matches(event)) continue;

      const resolution = rule.resolve(event);
      if (!resolution) continue;

      const { agentId, trigger } = resolution;

      // Check cooldowns
      if (this.isOnCooldown(agentId, trigger, rule.cooldownMs)) return false;
      if (this.isOnGlobalCooldown()) return false;

      // Look up catalog entry
      const entry = this.pickVariant(agentId, trigger);
      if (!entry) return false;

      // Queue or play
      this.enqueue(entry);
      this.setCooldown(agentId, trigger, rule.cooldownMs);
      return true;
    }

    return false;
  }

  // ── Playback ───────────────────────────────

  private enqueue(entry: VoiceLineEntry): void {
    const priority = entry.priority ?? 5;
    const item: QueuedLine = { entry, priority, timestamp: Date.now() };

    if (!this.currentEntry) {
      // Nothing playing — play immediately
      this.playLine(item);
    } else if (priority > (this.currentEntry.priority ?? 5)) {
      // Higher priority — preempt current
      this.stopCurrent();
      this.playLine(item);
    } else if (this.queue.length < 3) {
      // Queue it (cap queue at 3 to prevent buildup)
      this.queue.push(item);
      this.queue.sort((a, b) => b.priority - a.priority);
      this.emitState();
    }
    // else: drop the line silently (queue full, lower priority)
  }

  private playLine(item: QueuedLine): void {
    const { entry } = item;
    this.currentEntry = entry;
    const durationMs = entry.durationMs ?? 3000;

    // Attempt audio playback via AudioManager
    let handle: PlaybackHandle | null = null;
    if (this.audioManager?.ready) {
      const eventId = voiceEventId(entry.agentId, entry.trigger);
      // Use direct play with voice bus options
      handle = this.audioManager.play(eventId as any, {
        bus: 'voice',
        volume: 1.0,
      });
    }
    this.currentHandle = handle;
    this.lastGlobalPlay = Date.now();

    // Update observable state (subtitles)
    this._state = {
      current: {
        agentId: entry.agentId,
        trigger: entry.trigger,
        subtitle: entry.subtitle,
        startedAt: Date.now(),
        durationMs,
      },
      queueDepth: this.queue.length,
    };
    this.emitState();

    // Auto-advance after duration
    this.subtitleTimer = setTimeout(() => {
      this.onLineFinished();
    }, durationMs);
  }

  private onLineFinished(): void {
    this.currentEntry = null;
    this.currentHandle = null;
    this.subtitleTimer = null;

    // Play next in queue if any
    const next = this.queue.shift();
    if (next) {
      this.playLine(next);
    } else {
      this._state = { current: null, queueDepth: 0 };
      this.emitState();
    }
  }

  /**
   * Stop the currently playing voice line (if any).
   */
  stopCurrent(): void {
    if (this.subtitleTimer) {
      clearTimeout(this.subtitleTimer);
      this.subtitleTimer = null;
    }
    if (this.currentHandle && !this.currentHandle.ended) {
      this.currentHandle.fadeOut(150);
    }
    this.currentHandle = null;
    this.currentEntry = null;
    this._state = { current: null, queueDepth: this.queue.length };
    this.emitState();
  }

  /**
   * Stop everything and clear the queue.
   */
  stopAll(): void {
    this.stopCurrent();
    this.queue = [];
    this._state = { ...INITIAL_VOICE_LINE_STATE };
    this.emitState();
  }

  // ── Cooldown Logic ─────────────────────────

  private cooldownKey(agentId: AgentId, trigger: VoiceLineTrigger): CooldownKey {
    return `${agentId}:${trigger}`;
  }

  private isOnCooldown(
    agentId: AgentId,
    trigger: VoiceLineTrigger,
    ruleCooldownMs?: number,
  ): boolean {
    const key = this.cooldownKey(agentId, trigger);
    const lastPlay = this.cooldowns.get(key);
    if (lastPlay === undefined) return false;
    const cooldown = ruleCooldownMs ?? this.config.defaultCooldownMs;
    return Date.now() - lastPlay < cooldown;
  }

  private isOnGlobalCooldown(): boolean {
    return Date.now() - this.lastGlobalPlay < this.config.globalCooldownMs;
  }

  private setCooldown(
    agentId: AgentId,
    trigger: VoiceLineTrigger,
    _ruleCooldownMs?: number,
  ): void {
    const key = this.cooldownKey(agentId, trigger);
    this.cooldowns.set(key, Date.now());
  }

  /**
   * Clear all cooldowns (useful for testing or user-triggered reset).
   */
  clearCooldowns(): void {
    this.cooldowns.clear();
    this.lastGlobalPlay = 0;
  }

  // ── Variant Selection ──────────────────────

  private pickVariant(agentId: AgentId, trigger: VoiceLineTrigger): VoiceLineEntry | null {
    const agentMap = this.catalog.get(agentId);
    if (!agentMap) return null;
    const variants = agentMap.get(trigger);
    if (!variants || variants.length === 0) return null;

    if (variants.length === 1) return variants[0];

    // Round-robin to avoid repetition
    const key = this.cooldownKey(agentId, trigger);
    const idx = this.variantIndex.get(key) ?? 0;
    const entry = variants[idx % variants.length];
    this.variantIndex.set(key, idx + 1);
    return entry;
  }

  // ── Observable State ───────────────────────

  /**
   * Get current voice line state snapshot.
   */
  getState(): VoiceLineState {
    return { ...this._state };
  }

  /**
   * Subscribe to state changes. Returns unsubscribe function.
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this._state);
    return () => this.listeners.delete(listener);
  }

  private emitState(): void {
    for (const fn of this.listeners) {
      fn(this._state);
    }
  }

  // ── Configuration ──────────────────────────

  /**
   * Update engine configuration at runtime.
   * Merges with existing config (partial update).
   */
  updateConfig(patch: Partial<VoiceLineEngineConfig>): void {
    this.config = { ...this.config, ...patch };
    if (!this.config.enabled) {
      this.stopAll();
    }
  }

  /**
   * Get current configuration snapshot.
   */
  getConfig(): VoiceLineEngineConfig {
    return { ...this.config };
  }

  /**
   * Whether the engine is currently enabled.
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  // ── Lifecycle ──────────────────────────────

  /**
   * Dispose the engine — stop playback, clear all state, unsubscribe listeners.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.stopAll();
    this.catalog.clear();
    this.rules = [];
    this.cooldowns.clear();
    this.variantIndex.clear();
    this.listeners.clear();
  }

  get disposed(): boolean {
    return this._disposed;
  }
}

// ═══════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════

/**
 * Create a new VoiceLineEngine.
 *
 * Pass `null` for audioManager to run in subtitle-only mode
 * (graceful fallback when audio is unavailable).
 */
export function createVoiceLineEngine(
  audioManager: IAudioManager | null,
  config?: Partial<VoiceLineEngineConfig>,
): VoiceLineEngine {
  return new VoiceLineEngine(audioManager, config);
}
