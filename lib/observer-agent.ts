/**
 * Observer Agent — VentureOS Observational Memory (Phase 2)
 *
 * Async process that compresses raw conversation messages into
 * prioritized observations using the three-date model. Fires when
 * the token counter hook signals threshold breach. Runs outside
 * the main conversation loop (non-blocking).
 *
 * Architecture:
 * - Subscribes to `observation:threshold_reached` events
 * - Collects raw messages since last observation pass
 * - Single LLM call with structured prompt → compressed observations
 * - Writes to ObservationStore + updates memory_state
 * - Mutex prevents concurrent runs
 * - 1 retry on LLM failure, then skip + log warning
 *
 * Issue #231 — Phase 2 of #218: Observer Agent
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ConversationMessage } from './conversation-engine';
import type { ObservationStore } from './observation-store';
import type {
  Observation,
  ObserverAgentConfig,
  ObserverLLMObservation,
  ObservationPriority,
  MemoryState,
} from './types/observation';
import {
  OBSERVER_SYSTEM_PROMPT,
  buildObserverUserPrompt,
  type ObserverMessageInput,
} from './prompts/observer';

// ─── Types ──────────────────────────────────────────────────────────────────

/** LLM call interface — injected for testability. */
export interface ObserverLLMClient {
  /**
   * Send a chat completion request and return the response text.
   * The observer agent handles JSON parsing of the response.
   */
  chatCompletion(params: {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}

/** Event payload emitted by the token counter when threshold is reached. */
export interface ThresholdReachedEvent {
  agentId: string;
  conversationId: string;
  rawBufferTokens: number;
  thresholdTokens: number;
}

/** Metrics exposed by the observer agent. */
export interface ObserverAgentMetrics {
  /** Total observation passes attempted. */
  passesAttempted: number;
  /** Total observation passes completed successfully. */
  passesCompleted: number;
  /** Total observations produced across all passes. */
  observationsProduced: number;
  /** Total LLM calls made. */
  llmCalls: number;
  /** Total LLM call failures (after retries). */
  llmFailures: number;
  /** Total messages compressed across all passes. */
  messagesCompressed: number;
  /** Number of times a pass was skipped due to mutex lock. */
  skippedDueToLock: number;
  /** Timestamp of last successful pass. */
  lastPassAt: string | null;
  /** Timestamp of last error. */
  lastErrorAt: string | null;
}

/** Result of a single observation pass. */
export interface ObservationPassResult {
  /** Whether the pass was successful. */
  success: boolean;
  /** Number of observations created. */
  observationsCreated: number;
  /** Number of source messages compressed. */
  messagesCompressed: number;
  /** Error message if unsuccessful. */
  error?: string;
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ObserverAgentConfig = {
  enabled: true,
  charsPerToken: 4,
  thresholdTokens: 30_000,
  maxRetries: 1,
  modelId: 'gpt-4o-mini',
  silent: false,
  trimAfterObservation: false,
};

// ─── Observer Agent ─────────────────────────────────────────────────────────

function genObservationId(): string {
  return `obs_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
}

function estimateTokens(content: string, charsPerToken: number): number {
  return Math.max(1, Math.ceil(content.length / Math.max(1, charsPerToken)));
}

const VALID_PRIORITIES: Set<string> = new Set(['high', 'medium', 'info']);

/**
 * Validate and normalize a single LLM-produced observation.
 * Returns null if the observation is malformed.
 */
function validateLLMObservation(raw: unknown): ObserverLLMObservation | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.content !== 'string' || obj.content.trim().length === 0) return null;
  if (typeof obj.priority !== 'string' || !VALID_PRIORITIES.has(obj.priority)) return null;

  const referencedDate = obj.referenced_date === null || obj.referenced_date === undefined
    ? null
    : typeof obj.referenced_date === 'string' ? obj.referenced_date : null;

  const sourceMessageIds = Array.isArray(obj.source_message_ids)
    ? obj.source_message_ids.filter((id): id is string => typeof id === 'string')
    : [];

  return {
    content: obj.content.trim(),
    priority: obj.priority as ObservationPriority,
    referenced_date: referencedDate,
    source_message_ids: sourceMessageIds,
  };
}

/**
 * Parse the LLM response text into validated observations.
 * Handles common LLM quirks: markdown fences, extra whitespace, partial arrays.
 */
function parseLLMResponse(responseText: string): ObserverLLMObservation[] {
  // Strip markdown code fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from the response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const validated: ObserverLLMObservation[] = [];
  for (const item of parsed) {
    const obs = validateLLMObservation(item);
    if (obs) validated.push(obs);
  }

  return validated;
}

/**
 * Observer Agent — compresses raw conversation messages into prioritized
 * observations using an LLM call.
 *
 * Usage:
 * ```ts
 * const observer = new ObserverAgent(store, llmClient, { enabled: true });
 * observer.attach(eventBus);
 * // ... events flow ...
 * observer.detach();
 * ```
 */
export class ObserverAgent {
  private readonly config: ObserverAgentConfig;
  private readonly store: ObservationStore;
  private readonly llm: ObserverLLMClient;
  private eventBus: EventEmitter | null = null;
  private boundHandler: ((event: ThresholdReachedEvent) => void) | null = null;

  /** Mutex: true when an observation pass is running. */
  private running = false;

  /** Raw message buffer: messages accumulated since last observation pass. */
  private messageBuffer: Map<string, ConversationMessage[]> = new Map();

  private metrics: ObserverAgentMetrics = {
    passesAttempted: 0,
    passesCompleted: 0,
    observationsProduced: 0,
    llmCalls: 0,
    llmFailures: 0,
    messagesCompressed: 0,
    skippedDueToLock: 0,
    lastPassAt: null,
    lastErrorAt: null,
  };

  constructor(
    store: ObservationStore,
    llm: ObserverLLMClient,
    config: Partial<ObserverAgentConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
    this.llm = llm;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Attach the observer to an event bus.
   * Listens for `observation:threshold_reached` events.
   */
  attach(eventBus: EventEmitter): void {
    if (!this.config.enabled) return;
    if (this.eventBus) this.detach();

    this.eventBus = eventBus;
    this.boundHandler = (event) => this.onThresholdReached(event);
    this.eventBus.on('observation:threshold_reached', this.boundHandler);
  }

  /**
   * Detach from the event bus.
   */
  detach(): void {
    if (this.eventBus && this.boundHandler) {
      this.eventBus.removeListener('observation:threshold_reached', this.boundHandler);
    }
    this.eventBus = null;
    this.boundHandler = null;
  }

  /**
   * Check if the observer is currently attached and enabled.
   */
  isActive(): boolean {
    return this.config.enabled && this.eventBus !== null;
  }

  /**
   * Check if an observation pass is currently in progress.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): Readonly<ObserverAgentMetrics> {
    return { ...this.metrics };
  }

  /**
   * Get the current message buffer for an agent.
   */
  getBufferedMessages(agentId: string): ConversationMessage[] {
    return this.messageBuffer.get(agentId) ?? [];
  }

  // ─── Message Buffering ──────────────────────────────────────────────

  /**
   * Add a message to the raw buffer for an agent.
   * Called by the integration layer when messages flow through
   * the conversation pipeline.
   */
  bufferMessage(agentId: string, message: ConversationMessage): void {
    if (!this.config.enabled) return;
    const buffer = this.messageBuffer.get(agentId) ?? [];
    buffer.push(message);
    this.messageBuffer.set(agentId, buffer);
  }

  /**
   * Get the estimated token count of buffered messages for an agent.
   */
  getBufferTokenCount(agentId: string): number {
    const buffer = this.messageBuffer.get(agentId) ?? [];
    return buffer.reduce(
      (sum, msg) => sum + estimateTokens(msg.content, this.config.charsPerToken),
      0,
    );
  }

  /**
   * Clear the message buffer for an agent.
   */
  clearBuffer(agentId: string): void {
    this.messageBuffer.delete(agentId);
  }

  // ─── Observation Pass ───────────────────────────────────────────────

  /**
   * Run an observation pass for the specified agent.
   * This is the core compression pipeline:
   * 1. Collect buffered messages
   * 2. Call LLM with observer prompt
   * 3. Parse + validate response
   * 4. Write observations to store
   * 5. Update memory_state
   *
   * Exposed publicly for direct invocation in tests or manual triggers.
   */
  async runObservationPass(agentId: string): Promise<ObservationPassResult> {
    // Mutex: prevent concurrent observation runs
    if (this.running) {
      this.metrics.skippedDueToLock++;
      return { success: false, observationsCreated: 0, messagesCompressed: 0, error: 'Observation pass already in progress' };
    }

    this.running = true;
    this.metrics.passesAttempted++;

    try {
      const buffer = this.messageBuffer.get(agentId) ?? [];
      if (buffer.length === 0) {
        return { success: true, observationsCreated: 0, messagesCompressed: 0 };
      }

      // Build LLM input
      const messageInputs: ObserverMessageInput[] = buffer.map((msg) => ({
        messageId: msg.messageId,
        from: msg.from,
        content: msg.content,
        createdAt: msg.createdAt,
      }));

      const currentDate = new Date().toISOString().split('T')[0];
      const userPrompt = buildObserverUserPrompt(messageInputs, currentDate);

      // Call LLM with retry
      let responseText: string | null = null;
      let lastError: string | null = null;

      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          this.metrics.llmCalls++;
          responseText = await this.llm.chatCompletion({
            model: this.config.modelId,
            messages: [
              { role: 'system', content: OBSERVER_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            maxTokens: 2000,
          });
          break; // Success
        } catch (err: unknown) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt < this.config.maxRetries) {
            // Brief delay before retry
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }

      if (responseText === null) {
        this.metrics.llmFailures++;
        this.metrics.lastErrorAt = new Date().toISOString();
        const errMsg = `LLM call failed after ${this.config.maxRetries + 1} attempts: ${lastError}`;
        if (!this.config.silent) console.warn(`[observer-agent] ${errMsg}`);
        return { success: false, observationsCreated: 0, messagesCompressed: buffer.length, error: errMsg };
      }

      // Parse and validate LLM response
      const llmObservations = parseLLMResponse(responseText);

      if (llmObservations.length === 0) {
        // LLM returned no valid observations — still count as success (low-signal batch)
        this.clearBuffer(agentId);
        this.metrics.passesCompleted++;
        this.metrics.messagesCompressed += buffer.length;
        this.metrics.lastPassAt = new Date().toISOString();
        return { success: true, observationsCreated: 0, messagesCompressed: buffer.length };
      }

      // Transform LLM observations into full Observation records
      const now = new Date().toISOString();
      const observations: Observation[] = llmObservations.map((llmObs) => ({
        id: genObservationId(),
        createdAt: now,
        category: 'fact' as const, // Default category — could be enriched later
        content: llmObs.content,
        source: {
          agentId,
          conversationId: buffer[0]?.conversationId,
        },
        status: 'processed' as const,
        priority: llmObs.priority,
        referencedDate: llmObs.referenced_date ?? undefined,
        sourceMessageIds: llmObs.source_message_ids,
        metadata: {
          observerModel: this.config.modelId,
          sourceBatchSize: buffer.length,
        },
      }));

      // Persist observations
      this.store.insertBatch(observations);

      // Calculate token budget for memory_state update
      const observationsTokens = observations.reduce(
        (sum, obs) => sum + estimateTokens(obs.content, this.config.charsPerToken),
        0,
      );

      // Get existing memory state or create new
      const existingState = this.store.getMemoryState(agentId);
      const newState: MemoryState = {
        agentId,
        observationsTokens: (existingState?.observationsTokens ?? 0) + observationsTokens,
        rawBufferTokens: 0, // Reset after observation pass
        lastObservationAt: now,
        lastReflectionAt: existingState?.lastReflectionAt ?? null,
        observationCount: (existingState?.observationCount ?? 0) + observations.length,
      };
      this.store.upsertMemoryState(newState);

      // Clear the buffer for this agent
      this.clearBuffer(agentId);

      // Update metrics
      this.metrics.passesCompleted++;
      this.metrics.observationsProduced += observations.length;
      this.metrics.messagesCompressed += buffer.length;
      this.metrics.lastPassAt = now;

      return {
        success: true,
        observationsCreated: observations.length,
        messagesCompressed: buffer.length,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.metrics.lastErrorAt = new Date().toISOString();
      if (!this.config.silent) console.warn(`[observer-agent] Observation pass error: ${errMsg}`);
      return { success: false, observationsCreated: 0, messagesCompressed: 0, error: errMsg };
    } finally {
      this.running = false;
    }
  }

  // ─── Event Handler ──────────────────────────────────────────────────

  /**
   * Handle threshold_reached events.
   * Runs the observation pass asynchronously (non-blocking).
   */
  private onThresholdReached(event: ThresholdReachedEvent): void {
    // Run async — never block the event emitter
    setTimeout(() => {
      this.runObservationPass(event.agentId).catch((err) => {
        if (!this.config.silent) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[observer-agent] Async observation pass failed: ${errMsg}`);
        }
      });
    }, 0);
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  parseLLMResponse,
  validateLLMObservation,
  estimateTokens as observerEstimateTokens,
};

export default ObserverAgent;
