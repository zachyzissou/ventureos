/**
 * Reflector Agent — VentureOS Observation GC + Memory Consolidation (Phase 3)
 *
 * Periodic garbage collector that evaluates accumulated observations and
 * decides which to keep, merge, or discard. Runs when the observation
 * token budget exceeds a configurable threshold.
 *
 * Architecture:
 * - Loads active (non-reflected) observations from the store
 * - Single LLM call evaluates each observation: keep / merge / discard
 * - Discarded observations are soft-deleted via `reflected_at` (no hard deletes)
 * - Merged observations combine content into the target observation
 * - High-priority observations are preserved unless explicitly contradicted
 * - Minimum retained floor prevents over-aggressive GC
 * - Mutex guard prevents concurrent reflector runs
 * - Each run is logged in `reflection_log` for audit trail
 * - memory_state tokens recalculated after each pass
 *
 * Issue #232 — Phase 3 of #218: Reflector Agent GC + Prompt Cache
 */

import crypto from 'node:crypto';
import type { ObservationStore } from './observation-store';
import type { ObservationCache } from './observation-cache';
import type {
  Observation,
  ReflectorAgentConfig,
  ReflectionLogEntry,
  ReflectionLLMResult,
  ReflectionObservationDecision,
  MemoryState,
} from './types/observation';

// ─── Types ──────────────────────────────────────────────────────────────────

/** LLM call interface — injected for testability (same pattern as ObserverAgent). */
export interface ReflectorLLMClient {
  chatCompletion(params: {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}

/** Metrics exposed by the reflector agent. */
export interface ReflectorAgentMetrics {
  passesAttempted: number;
  passesCompleted: number;
  observationsEvaluated: number;
  observationsKept: number;
  observationsMerged: number;
  observationsDiscarded: number;
  llmCalls: number;
  llmFailures: number;
  skippedDueToLock: number;
  lastPassAt: string | null;
  lastErrorAt: string | null;
}

/** Result of a single reflection pass. */
export interface ReflectionPassResult {
  success: boolean;
  observationsEvaluated: number;
  kept: number;
  merged: number;
  discarded: number;
  tokensBefore: number;
  tokensAfter: number;
  error?: string;
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ReflectorAgentConfig = {
  enabled: true,
  charsPerToken: 4,
  tokenBudgetThreshold: 50_000,
  minRetainedObservations: 5,
  maxRetries: 1,
  modelId: 'gpt-4o-mini',
  silent: false,
};

// ─── Prompt Templates ───────────────────────────────────────────────────────

const REFLECTOR_SYSTEM_PROMPT = `You are a memory reflection agent for an AI assistant system. Your job is to evaluate a set of stored observations and decide which ones to keep, merge, or discard.

Rules:
1. HIGH PRIORITY observations (🔴) should almost always be kept, unless they are clearly contradicted by a newer observation or are provably stale/completed.
2. MEDIUM PRIORITY observations (🟡) should be kept if still relevant. Merge duplicates.
3. INFO PRIORITY observations (🟢) are candidates for discard if they add little value or are subsumed by other observations.
4. Never discard an observation that contains an active commitment, deadline, or open question unless it has been explicitly resolved.
5. When merging, combine the content into a single clear statement and specify which observation to merge INTO (the one to keep) and which to discard.
6. Preserve temporal context — if an observation references a specific date that is still in the future, keep it.

Output Format — respond ONLY with a JSON object:
{
  "decisions": [
    {
      "observationId": "<id>",
      "decision": "keep" | "merge" | "discard",
      "reason": "<brief reason>",
      "mergeIntoId": "<id of target observation, only if decision=merge>",
      "mergedContent": "<combined text, only if decision=merge>"
    }
  ],
  "summary": "<optional one-line summary of what you did>"
}`;

function buildReflectorUserPrompt(observations: Observation[], currentDate: string): string {
  const lines: string[] = [
    `Current date: ${currentDate}`,
    `Total observations to evaluate: ${observations.length}`,
    '',
    'Observations:',
  ];

  for (const obs of observations) {
    const priority = obs.priority ?? 'info';
    const emoji = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';
    const dateRef = obs.referencedDate ? ` | ref_date: ${obs.referencedDate}` : '';
    const created = obs.createdAt ? ` | created: ${obs.createdAt.split('T')[0]}` : '';
    lines.push(`[${obs.id}] ${emoji} ${priority.toUpperCase()}${created}${dateRef}`);
    lines.push(`  ${obs.content}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Response Parsing ───────────────────────────────────────────────────────

const VALID_DECISIONS = new Set(['keep', 'merge', 'discard']);

function parseReflectorResponse(responseText: string): ReflectionLLMResult | null {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.decisions)) return null;

  const decisions: ReflectionObservationDecision[] = [];
  for (const raw of obj.decisions) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;

    if (typeof d.observationId !== 'string') continue;
    if (typeof d.decision !== 'string' || !VALID_DECISIONS.has(d.decision)) continue;

    decisions.push({
      observationId: d.observationId,
      decision: d.decision as 'keep' | 'merge' | 'discard',
      reason: typeof d.reason === 'string' ? d.reason : '',
      mergeIntoId: typeof d.mergeIntoId === 'string' ? d.mergeIntoId : undefined,
      mergedContent: typeof d.mergedContent === 'string' ? d.mergedContent : undefined,
    });
  }

  return {
    decisions,
    summary: typeof obj.summary === 'string' ? obj.summary : undefined,
  };
}

// ─── Utility ────────────────────────────────────────────────────────────────

function genLogId(): string {
  return `refl_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
}

function estimateTokens(content: string, charsPerToken: number): number {
  return Math.max(1, Math.ceil(content.length / Math.max(1, charsPerToken)));
}

// ─── Reflector Agent ────────────────────────────────────────────────────────

export class ReflectorAgent {
  private readonly config: ReflectorAgentConfig;
  private readonly store: ObservationStore;
  private readonly llm: ReflectorLLMClient;
  private readonly cache: ObservationCache | null;

  /** Mutex: true when a reflection pass is running. */
  private running = false;

  private metrics: ReflectorAgentMetrics = {
    passesAttempted: 0,
    passesCompleted: 0,
    observationsEvaluated: 0,
    observationsKept: 0,
    observationsMerged: 0,
    observationsDiscarded: 0,
    llmCalls: 0,
    llmFailures: 0,
    skippedDueToLock: 0,
    lastPassAt: null,
    lastErrorAt: null,
  };

  constructor(
    store: ObservationStore,
    llm: ReflectorLLMClient,
    config: Partial<ReflectorAgentConfig> = {},
    cache?: ObservationCache | null,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
    this.llm = llm;
    this.cache = cache ?? null;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  isRunning(): boolean {
    return this.running;
  }

  getMetrics(): Readonly<ReflectorAgentMetrics> {
    return { ...this.metrics };
  }

  // ─── Threshold Check ────────────────────────────────────────────────

  /**
   * Check whether reflection should be triggered for an agent.
   * Returns true if observations token count exceeds threshold.
   */
  shouldReflect(agentId: string): boolean {
    if (!this.config.enabled) return false;
    const state = this.store.getMemoryState(agentId);
    if (!state) return false;
    return state.observationsTokens > this.config.tokenBudgetThreshold;
  }

  // ─── Reflection Pass ────────────────────────────────────────────────

  /**
   * Run a reflection pass for the specified agent.
   *
   * Pipeline:
   * 1. Acquire mutex
   * 2. Load active observations
   * 3. Check minimum floor (skip if already at/below)
   * 4. Call LLM for decisions
   * 5. Apply decisions: soft-delete discards, update merges
   * 6. Enforce minimum retained floor
   * 7. Recalculate memory_state tokens
   * 8. Log the reflection run
   * 9. Invalidate prompt cache
   */
  async runReflectionPass(agentId: string): Promise<ReflectionPassResult> {
    if (this.running) {
      this.metrics.skippedDueToLock++;
      return {
        success: false,
        observationsEvaluated: 0,
        kept: 0,
        merged: 0,
        discarded: 0,
        tokensBefore: 0,
        tokensAfter: 0,
        error: 'Reflection pass already in progress',
      };
    }

    this.running = true;
    this.metrics.passesAttempted++;
    const startTime = Date.now();

    try {
      // 1. Load active observations
      const activeObs = this.store.getActiveObservations(agentId);

      if (activeObs.length === 0) {
        return this.completePass(agentId, {
          success: true,
          observationsEvaluated: 0,
          kept: 0, merged: 0, discarded: 0,
          tokensBefore: 0, tokensAfter: 0,
        }, startTime);
      }

      // 2. Check minimum floor
      if (activeObs.length <= this.config.minRetainedObservations) {
        return this.completePass(agentId, {
          success: true,
          observationsEvaluated: activeObs.length,
          kept: activeObs.length, merged: 0, discarded: 0,
          tokensBefore: this.calcTokens(activeObs),
          tokensAfter: this.calcTokens(activeObs),
        }, startTime);
      }

      const tokensBefore = this.calcTokens(activeObs);

      // 3. Call LLM
      const currentDate = new Date().toISOString().split('T')[0];
      const userPrompt = buildReflectorUserPrompt(activeObs, currentDate);

      let responseText: string | null = null;
      let lastError: string | null = null;

      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          this.metrics.llmCalls++;
          responseText = await this.llm.chatCompletion({
            model: this.config.modelId,
            messages: [
              { role: 'system', content: REFLECTOR_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            maxTokens: 4000,
          });
          break;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt < this.config.maxRetries) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }

      if (responseText === null) {
        this.metrics.llmFailures++;
        this.metrics.lastErrorAt = new Date().toISOString();
        const errMsg = `LLM call failed after ${this.config.maxRetries + 1} attempts: ${lastError}`;
        if (!this.config.silent) console.warn(`[reflector-agent] ${errMsg}`);

        this.logReflection(agentId, {
          observationsEvaluated: activeObs.length,
          kept: activeObs.length, merged: 0, discarded: 0,
          tokensBefore, tokensAfter: tokensBefore,
          error: errMsg,
        }, startTime);

        return {
          success: false,
          observationsEvaluated: activeObs.length,
          kept: activeObs.length, merged: 0, discarded: 0,
          tokensBefore, tokensAfter: tokensBefore,
          error: errMsg,
        };
      }

      // 4. Parse response
      const llmResult = parseReflectorResponse(responseText);
      if (!llmResult || llmResult.decisions.length === 0) {
        const errMsg = 'Failed to parse LLM reflection response';
        if (!this.config.silent) console.warn(`[reflector-agent] ${errMsg}`);

        this.logReflection(agentId, {
          observationsEvaluated: activeObs.length,
          kept: activeObs.length, merged: 0, discarded: 0,
          tokensBefore, tokensAfter: tokensBefore,
          error: errMsg,
        }, startTime);

        return {
          success: false,
          observationsEvaluated: activeObs.length,
          kept: activeObs.length, merged: 0, discarded: 0,
          tokensBefore, tokensAfter: tokensBefore,
          error: errMsg,
        };
      }

      // 5. Apply decisions
      const result = this.applyDecisions(activeObs, llmResult.decisions);

      // 6. Recalculate memory_state
      const remainingObs = this.store.getActiveObservations(agentId);
      const tokensAfter = this.calcTokens(remainingObs);
      this.updateMemoryState(agentId, tokensAfter, remainingObs.length);

      // 7. Invalidate cache
      if (this.cache) {
        this.cache.invalidate();
      }

      const passResult: ReflectionPassResult = {
        success: true,
        observationsEvaluated: activeObs.length,
        kept: result.kept,
        merged: result.merged,
        discarded: result.discarded,
        tokensBefore,
        tokensAfter,
      };

      return this.completePass(agentId, passResult, startTime);

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.metrics.lastErrorAt = new Date().toISOString();
      if (!this.config.silent) console.warn(`[reflector-agent] Reflection pass error: ${errMsg}`);
      return {
        success: false,
        observationsEvaluated: 0,
        kept: 0, merged: 0, discarded: 0,
        tokensBefore: 0, tokensAfter: 0,
        error: errMsg,
      };
    } finally {
      this.running = false;
    }
  }

  // ─── Decision Application ───────────────────────────────────────────

  private applyDecisions(
    activeObs: Observation[],
    decisions: ReflectionObservationDecision[],
  ): { kept: number; merged: number; discarded: number } {
    const obsMap = new Map(activeObs.map((o) => [o.id, o]));
    const now = new Date().toISOString();

    // Build decision map (only for IDs that exist in active observations)
    const decisionMap = new Map<string, ReflectionObservationDecision>();
    for (const d of decisions) {
      if (obsMap.has(d.observationId)) {
        decisionMap.set(d.observationId, d);
      }
    }

    // Count planned actions
    let keepCount = 0;
    let mergeCount = 0;
    let discardCount = 0;

    const toDiscard: string[] = [];
    const mergeOps: Array<{ targetId: string; content: string; sourceId: string }> = [];

    for (const obs of activeObs) {
      const decision = decisionMap.get(obs.id);
      if (!decision || decision.decision === 'keep') {
        keepCount++;
        continue;
      }

      if (decision.decision === 'discard') {
        discardCount++;
        toDiscard.push(obs.id);
      } else if (decision.decision === 'merge') {
        if (decision.mergeIntoId && decision.mergedContent && obsMap.has(decision.mergeIntoId)) {
          mergeCount++;
          toDiscard.push(obs.id);
          mergeOps.push({
            targetId: decision.mergeIntoId,
            content: decision.mergedContent,
            sourceId: obs.id,
          });
        } else {
          // Invalid merge target — keep the observation instead
          keepCount++;
        }
      }
    }

    // Enforce minimum retained floor
    const totalAfter = keepCount; // merges reduce count because source is discarded
    if (totalAfter < this.config.minRetainedObservations) {
      // Rescue observations from the discard list (lowest-impact first = info priority)
      const rescueNeeded = this.config.minRetainedObservations - totalAfter;
      // Sort toDiscard by priority — rescue info-priority first (they were less aggressively removed)
      const discardedWithPriority = toDiscard
        .map((id) => ({ id, priority: obsMap.get(id)?.priority ?? 'info' }))
        .sort((a, b) => {
          // Rescue in reverse priority: info last to discard → first to rescue
          const pa = a.priority === 'high' ? 0 : a.priority === 'medium' ? 1 : 2;
          const pb = b.priority === 'high' ? 0 : b.priority === 'medium' ? 1 : 2;
          return pb - pa; // Higher rank = rescued first
        });

      const rescued = new Set<string>();
      for (let i = 0; i < Math.min(rescueNeeded, discardedWithPriority.length); i++) {
        rescued.add(discardedWithPriority[i].id);
      }

      // Remove rescued IDs from discard list
      const filteredDiscard = toDiscard.filter((id) => !rescued.has(id));
      const actualDiscarded = filteredDiscard.length;
      const actualMerged = mergeOps.filter((op) => !rescued.has(op.sourceId)).length;
      const actualKept = activeObs.length - actualDiscarded - actualMerged;

      // Apply merge content updates (only non-rescued merges)
      for (const op of mergeOps) {
        if (!rescued.has(op.sourceId)) {
          this.store.updateContent(op.targetId, op.content);
        }
      }

      // Apply soft-deletes
      if (filteredDiscard.length > 0) {
        this.store.markReflected(filteredDiscard, now);
      }

      return { kept: actualKept, merged: actualMerged, discarded: actualDiscarded - actualMerged };
    }

    // Apply merge content updates
    for (const op of mergeOps) {
      this.store.updateContent(op.targetId, op.content);
    }

    // Apply soft-deletes (both discards and merge sources)
    if (toDiscard.length > 0) {
      this.store.markReflected(toDiscard, now);
    }

    return { kept: keepCount, merged: mergeCount, discarded: discardCount };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private calcTokens(observations: Observation[]): number {
    return observations.reduce(
      (sum, obs) => sum + estimateTokens(obs.content, this.config.charsPerToken),
      0,
    );
  }

  private updateMemoryState(agentId: string, tokensAfter: number, obsCount: number): void {
    const existing = this.store.getMemoryState(agentId);
    const now = new Date().toISOString();
    const newState: MemoryState = {
      agentId,
      observationsTokens: tokensAfter,
      rawBufferTokens: existing?.rawBufferTokens ?? 0,
      lastObservationAt: existing?.lastObservationAt ?? null,
      lastReflectionAt: now,
      observationCount: obsCount,
    };
    this.store.upsertMemoryState(newState);
  }

  private logReflection(
    agentId: string,
    data: {
      observationsEvaluated: number;
      kept: number;
      merged: number;
      discarded: number;
      tokensBefore: number;
      tokensAfter: number;
      error?: string;
    },
    startTime: number,
  ): void {
    const entry: ReflectionLogEntry = {
      id: genLogId(),
      agentId,
      runAt: new Date().toISOString(),
      observationsEvaluated: data.observationsEvaluated,
      observationsKept: data.kept,
      observationsMerged: data.merged,
      observationsDiscarded: data.discarded,
      tokensBefore: data.tokensBefore,
      tokensAfter: data.tokensAfter,
      modelUsed: this.config.modelId,
      durationMs: Date.now() - startTime,
      error: data.error,
    };
    this.store.insertReflectionLog(entry);
  }

  private completePass(
    agentId: string,
    result: ReflectionPassResult,
    startTime: number,
  ): ReflectionPassResult {
    const now = new Date().toISOString();

    this.metrics.passesCompleted++;
    this.metrics.observationsEvaluated += result.observationsEvaluated;
    this.metrics.observationsKept += result.kept;
    this.metrics.observationsMerged += result.merged;
    this.metrics.observationsDiscarded += result.discarded;
    this.metrics.lastPassAt = now;

    this.logReflection(agentId, {
      observationsEvaluated: result.observationsEvaluated,
      kept: result.kept,
      merged: result.merged,
      discarded: result.discarded,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
    }, startTime);

    return result;
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { parseReflectorResponse, buildReflectorUserPrompt, REFLECTOR_SYSTEM_PROMPT };
export default ReflectorAgent;
