/**
 * Conversation Engine Core — VentureOS Conversation Orchestration (Track 5)
 *
 * Core responsibilities:
 * - Message routing between agents (role-card handoff contracts)
 * - Turn management (prevent interruptions)
 * - Context window management (summaries when needed)
 * - State persistence (history, participants, metadata)
 * - Integration hooks for Affinity + Security pipelines
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { loadRoleCard } from './role-cards';
import { isWildcardTarget } from './contract-wildcards';
import { validateHandoff, type HandoffResult } from './handoff-validator';
import { AffinityManager } from './affinity-manager';
import { runOutboundSecurityPipeline, type OutboundSecurityDeps, type OutboundSecurityConfig } from './conversation-security';
import { RateLimiter } from './rate-limiter';
import { createDiscordAlertHandler, HITLEngine } from './hitl';

export type AgentId = string;
export type ConversationId = string;
export type MessageId = string;

export type ConversationStatus = 'active' | 'paused' | 'require_approval' | 'closed';

export interface ConversationEngineConfig {
  /** Directory to persist conversations to disk. */
  persistDir: string;

  /** Turn control (prevents interruptions). Default: true */
  enforceTurns: boolean;

  /** Maximum number of recent messages returned for context (not the persisted history). Default: 25 */
  maxContextMessages: number;

  /** When the *persisted* messages exceed this, generate a summary chunk. Default: 60 */
  summaryTriggerMessageCount: number;

  /** How many old messages to summarize in one chunk. Default: 30 */
  summaryChunkSize: number;

  /** If true, remove content of summarized messages to reduce storage. Default: false */
  discardSummarizedMessageContent: boolean;

  /** Approximate token estimator divisor. Default: 4 chars/token */
  charsPerToken: number;

  /** Low affinity threshold for Echo mediation. Default: 0.5 */
  mediationAffinityThreshold: number;

  /** Agent ID used for mediation. Default: 'echo' */
  mediatorAgentId: AgentId;

  /** Optional Discord channel for HITL alerts. */
  discordAlertChannelId?: string;
}

const DEFAULT_CONFIG: ConversationEngineConfig = {
  persistDir: path.resolve(process.env.HOME ?? '~', 'clawd/ventureos/runtime/conversations'),
  enforceTurns: true,
  maxContextMessages: 25,
  summaryTriggerMessageCount: 60,
  summaryChunkSize: 30,
  discardSummarizedMessageContent: false,
  charsPerToken: 4,
  mediationAffinityThreshold: 0.5,
  mediatorAgentId: 'echo',
};

export interface ConversationSummary {
  summaryId: string;
  createdAt: string;
  /** IDs of messages covered by this summary chunk. */
  coversMessageIds: MessageId[];
  content: string;
}

export interface ConversationMessage {
  messageId: MessageId;
  conversationId: ConversationId;
  from: AgentId;
  /** Intended recipients. */
  to: AgentId[];
  /** Final recipients after routing/mediation. */
  deliveredTo: AgentId[];
  content: string;
  createdAt: string;

  // Optional envelope for handoff validation.
  payload?: { type?: string; format?: string; data?: unknown };

  // Pipeline artifacts
  handoff?: HandoffResult;
  mediation?: { required: boolean; routedVia?: AgentId; originalTo?: AgentId[]; affinity?: number };

  security?: {
    injectionScore: number;
    structureValid: boolean;
    structureErrors: string[];
    sanitizedModified: boolean;
    redactionCount: number;
    rateLimitAllowed: boolean;
    rateLimitType?: string;
    policyWarningCount: number;
    voiceViolationCount: number;
    hitlAction: string;
    hitlTriggered: boolean;
    hitlUrgency: string;
    hitlMatchedTriggerIds: string[];
  };

  status: 'delivered' | 'blocked' | 'rejected';
  blockedReason?: string;
}

export interface ConversationState {
  conversationId: ConversationId;
  createdAt: string;
  updatedAt: string;
  status: ConversationStatus;
  statusReason?: string;

  participants: AgentId[];
  currentTurn: AgentId;

  tokenBudget: number;
  tokensUsed: number;

  messageCount: number;
  challengeCount: number;
  consecutiveChallenges: number;

  // rolling signals
  injectionScores: number[];
  policyViolationCount: number;
  voiceRuleViolationCount: number;

  affinity: {
    averageAffinity: number;
    lowestAffinity: number;
    lowestAffinityPair: [AgentId, AgentId];
  };

  summaries: ConversationSummary[];
  messages: ConversationMessage[];
  metadata: Record<string, unknown>;
}

export interface StartConversationParams {
  conversationId?: ConversationId;
  participants: AgentId[];
  /** Who gets first turn. Default: first participant */
  currentTurn?: AgentId;
  tokenBudget?: number;
  metadata?: Record<string, unknown>;
}

export interface SendMessageParams {
  conversationId: ConversationId;
  from: AgentId;
  to?: AgentId | AgentId[];
  content: string;
  payload?: { type?: string; format?: string; data?: unknown };

  /** For rate limiting / HITL escalation accounting */
  isChallenge?: boolean;

  /** bypass turn enforcement (system-only) */
  overrideTurn?: boolean;
}

export interface ContextBundle {
  conversationId: ConversationId;
  participants: AgentId[];
  status: ConversationStatus;
  currentTurn: AgentId;
  summaries: ConversationSummary[];
  recentMessages: Array<Pick<ConversationMessage, 'from' | 'deliveredTo' | 'content' | 'createdAt' | 'status'>>;
}

export interface ConversationStore {
  load(conversationId: ConversationId): Promise<ConversationState | null>;
  save(state: ConversationState): Promise<void>;
  list(): Promise<ConversationId[]>;
}

export class FileConversationStore implements ConversationStore {
  constructor(private dir: string) {}

  private filePath(conversationId: ConversationId): string {
    return path.join(this.dir, `${conversationId}.json`);
  }

  async load(conversationId: ConversationId): Promise<ConversationState | null> {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath(conversationId), 'utf8');
      return JSON.parse(raw) as ConversationState;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(state: ConversationState): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.filePath(state.conversationId), JSON.stringify(state, null, 2), 'utf8');
  }

  async list(): Promise<ConversationId[]> {
    await fs.mkdir(this.dir, { recursive: true });
    const entries = await fs.readdir(this.dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => path.basename(e.name, '.json'))
      .sort();
  }
}

export interface ContextSummarizer {
  summarize(messages: ConversationMessage[]): Promise<string>;
}

export class SimpleHeuristicSummarizer implements ContextSummarizer {
  async summarize(messages: ConversationMessage[]): Promise<string> {
    const lines: string[] = [];
    lines.push(`Summary of ${messages.length} messages:`);

    const byAgent = new Map<string, number>();
    for (const m of messages) byAgent.set(m.from, (byAgent.get(m.from) ?? 0) + 1);

    lines.push(`Participants observed: ${[...byAgent.entries()].map(([a, c]) => `${a}(${c})`).join(', ')}`);

    const head = messages.slice(0, 3).map((m) => `- ${m.from} → ${m.deliveredTo.join(', ')}: ${truncate(m.content, 120)}`);
    const tail = messages.slice(-3).map((m) => `- ${m.from} → ${m.deliveredTo.join(', ')}: ${truncate(m.content, 120)}`);

    if (head.length) {
      lines.push('First messages:');
      lines.push(...head);
    }

    if (messages.length > 6) {
      lines.push(`… (${messages.length - 6} messages omitted) …`);
    }

    if (tail.length) {
      lines.push('Most recent messages in chunk:');
      lines.push(...tail);
    }

    return lines.join('\n');
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
}

function estimateTokens(content: string, charsPerToken: number): number {
  return Math.max(1, Math.ceil(content.length / Math.max(1, charsPerToken)));
}

export class ConversationEngine {
  private readonly config: ConversationEngineConfig;
  private readonly store: ConversationStore;
  private readonly affinity: AffinityManager;
  private readonly summarizer: ContextSummarizer;
  private readonly securityDeps: OutboundSecurityDeps;
  private readonly securityConfig: OutboundSecurityConfig;
  private affinityFallbackLogged = false;

  // Serialize per-conversation mutations.
  private locks = new Map<ConversationId, Promise<void>>();

  constructor(params: {
    config?: Partial<ConversationEngineConfig>;
    store?: ConversationStore;
    affinityManager?: AffinityManager;
    summarizer?: ContextSummarizer;
    securityDeps: OutboundSecurityDeps;
    securityConfig?: OutboundSecurityConfig;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...(params.config ?? {}) };
    this.store = params.store ?? new FileConversationStore(this.config.persistDir);
    this.affinity = params.affinityManager ?? this.createDefaultAffinityManager();
    this.summarizer = params.summarizer ?? new SimpleHeuristicSummarizer();
    this.securityDeps = params.securityDeps;
    this.securityConfig = params.securityConfig ?? {};

    // Wire Discord alert handler if requested.
    if (this.config.discordAlertChannelId) {
      this.securityDeps.hitl.onAlert(createDiscordAlertHandler(this.config.discordAlertChannelId));
    }
  }

  private createDefaultAffinityManager(): AffinityManager {
    const lowAffinityThreshold = this.config.mediationAffinityThreshold;
    try {
      return new AffinityManager({ lowAffinityThreshold });
    } catch (error) {
      if (!this.affinityFallbackLogged) {
        this.affinityFallbackLogged = true;
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[conversation-engine] Affinity DB unavailable (${msg}); falling back to in-memory affinity manager.`,
        );
      }
      return new AffinityManager({
        dbPath: ':memory:',
        lowAffinityThreshold,
      });
    }
  }

  /** Convenience builder for default deps (rate limiter + HITL). */
  static createWithDefaults(params: {
    config?: Partial<ConversationEngineConfig>;
    securityConfig?: OutboundSecurityConfig;
    store?: ConversationStore;
    affinityManager?: AffinityManager;
    summarizer?: ContextSummarizer;
    hitl?: HITLEngine;
  } = {}): ConversationEngine {
    const hitl = params.hitl ?? new HITLEngine();

    const rateLimiter = new RateLimiter(params.securityConfig?.rateLimiter);

    return new ConversationEngine({
      config: params.config,
      store: params.store,
      affinityManager: params.affinityManager,
      summarizer: params.summarizer,
      securityDeps: { rateLimiter, hitl },
      securityConfig: params.securityConfig,
    });
  }

  async startConversation(params: StartConversationParams): Promise<ConversationState> {
    const conversationId = params.conversationId ?? genId('conv');

    const participants = [...new Set(params.participants)].filter(Boolean);
    if (participants.length === 0) throw new Error('participants must be non-empty');

    const currentTurn = params.currentTurn ?? participants[0];

    const affinityStats = this.affinity.computeStats(participants);

    const state: ConversationState = {
      conversationId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'active',
      participants,
      currentTurn,
      tokenBudget: params.tokenBudget ?? 10_000,
      tokensUsed: 0,
      messageCount: 0,
      challengeCount: 0,
      consecutiveChallenges: 0,
      injectionScores: [],
      policyViolationCount: 0,
      voiceRuleViolationCount: 0,
      affinity: {
        averageAffinity: affinityStats.average,
        lowestAffinity: affinityStats.lowest,
        lowestAffinityPair: affinityStats.lowestPair,
      },
      summaries: [],
      messages: [],
      metadata: params.metadata ?? {},
    };

    await this.store.save(state);
    return state;
  }

  async listConversations(): Promise<ConversationId[]> {
    return this.store.list();
  }

  async getConversation(conversationId: ConversationId): Promise<ConversationState> {
    const state = await this.store.load(conversationId);
    if (!state) throw new Error(`Conversation not found: ${conversationId}`);
    return state;
  }

  async getContext(conversationId: ConversationId, opts: { maxMessages?: number } = {}): Promise<ContextBundle> {
    const state = await this.getConversation(conversationId);
    const maxMessages = opts.maxMessages ?? this.config.maxContextMessages;

    const recent = state.messages
      .slice(-maxMessages)
      .map((m) => ({ from: m.from, deliveredTo: m.deliveredTo, content: m.content, createdAt: m.createdAt, status: m.status }));

    return {
      conversationId: state.conversationId,
      participants: state.participants,
      status: state.status,
      currentTurn: state.currentTurn,
      summaries: state.summaries,
      recentMessages: recent,
    };
  }

  async addParticipant(conversationId: ConversationId, agentId: AgentId): Promise<ConversationState> {
    return this.withLock(conversationId, async () => {
      const state = await this.getConversation(conversationId);
      if (!state.participants.includes(agentId)) state.participants.push(agentId);

      const stats = this.affinity.computeStats(state.participants);
      state.affinity.averageAffinity = stats.average;
      state.affinity.lowestAffinity = stats.lowest;
      state.affinity.lowestAffinityPair = stats.lowestPair;
      state.updatedAt = nowIso();
      await this.store.save(state);
      return state;
    });
  }

  async setStatus(conversationId: ConversationId, status: ConversationStatus, reason?: string): Promise<ConversationState> {
    return this.withLock(conversationId, async () => {
      const state = await this.getConversation(conversationId);
      state.status = status;
      state.statusReason = reason;
      state.updatedAt = nowIso();
      await this.store.save(state);
      return state;
    });
  }

  async sendMessage(params: SendMessageParams): Promise<ConversationMessage> {
    return this.withLock(params.conversationId, async () => {
      const state = await this.getConversation(params.conversationId);

      // Status gating
      if (state.status === 'closed') {
        return this.blockedMessage(params, state, 'Conversation is closed');
      }
      if ((state.status === 'paused' || state.status === 'require_approval') && params.from !== 'system') {
        return this.blockedMessage(params, state, `Conversation is ${state.status}`);
      }

      // Turn management
      if (this.config.enforceTurns && !params.overrideTurn && params.from !== 'user' && params.from !== 'system') {
        if (params.from !== state.currentTurn) {
          return this.rejectedMessage(params, state, `Out of turn: currentTurn=${state.currentTurn}`);
        }
      }

      // Resolve recipients.
      const intendedTo = await this.resolveRecipients(params.from, params.to, params.payload, state.participants);
      const toList = Array.isArray(intendedTo) ? intendedTo : [intendedTo];

      // Affinity-based mediation (agent↔agent only).
      let deliveredTo = [...toList];
      let mediation: ConversationMessage['mediation'] = { required: false };

      const agentRecipients = toList.filter((t) => t !== 'user' && t !== 'system' && t !== 'broadcast');
      if (params.from !== 'user' && params.from !== 'system' && agentRecipients.length > 0) {
        // Take the *lowest* affinity among pairs from->recipient.
        let lowest = 1;
        for (const r of agentRecipients) {
          const a = this.affinity.getAffinity(params.from, r);
          if (a < lowest) lowest = a;
        }

        if (lowest < this.config.mediationAffinityThreshold && !agentRecipients.includes(this.config.mediatorAgentId)) {
          mediation = { required: true, routedVia: this.config.mediatorAgentId, originalTo: deliveredTo, affinity: lowest };
          deliveredTo = [this.config.mediatorAgentId];
        }
      }

      // Build HITL conversation state from current state.
      const hitlConversationState = this.toHITLConversationState(state);

      // Security pipeline.
      const security = await runOutboundSecurityPipeline(
        {
          conversationId: state.conversationId,
          from: params.from,
          to: deliveredTo,
          content: params.content,
          isChallenge: params.isChallenge,
          challengeTarget: params.isChallenge ? deliveredTo[0] : undefined,
          conversationState: hitlConversationState,
        },
        this.securityDeps,
        this.securityConfig
      );

      // If structure is invalid, block.
      if (!security.sanitized.structureValid) {
        return this.blockedMessage(params, state, `Invalid message structure: ${security.sanitized.structureErrors.join('; ')}`);
      }

      // If rate-limited, block (and let HITL notify).
      if (!security.rateLimit.allowed) {
        // Still persist the message as blocked for audit.
        const blocked = this.blockedMessage(params, state, `Rate limited: ${security.rateLimit.limitType}`);
        blocked.security = this.securitySummary(security);
        blocked.to = toList;
        blocked.deliveredTo = deliveredTo;
        blocked.mediation = mediation;
        this.appendMessage(state, blocked, security);
        await this.store.save(state);
        return blocked;
      }

      // Handoff validation (role card contracts).
      // Notes:
      // - Skip validation for user/system/broadcast targets.
      // - For affinity-based mediation to Echo, we treat the hop into the mediator as allowed
      //   even if role cards don't explicitly define universal Echo inbox contracts.
      const payloadEnvelope = params.payload ?? { data: params.content };

      let handoff: HandoffResult | undefined;
      let handoffInvalidReasons: string[] = [];

      const nonExternalRecipients = deliveredTo.filter((t) => t !== 'user' && t !== 'system' && t !== 'broadcast');

      if (mediation.required && deliveredTo.length === 1 && deliveredTo[0] === this.config.mediatorAgentId) {
        handoff = {
          valid: true,
          reason: 'Mediated hop into Echo allowed by engine policy',
          contract: {
            from: { agentId: params.from, outputType: 'mediation_message', format: payloadEnvelope.format ?? 'natural_language' },
            to: { agentId: this.config.mediatorAgentId, inputType: 'mediation_message', format: payloadEnvelope.format ?? 'natural_language' },
          },
        };
      } else if (params.from !== 'user' && params.from !== 'system' && nonExternalRecipients.length > 0) {
        // Validate each agent recipient; block if any invalid.
        const results: HandoffResult[] = [];
        for (const r of nonExternalRecipients) {
          results.push(await validateHandoff(params.from, r, payloadEnvelope));
        }
        handoff = results[0];
        handoffInvalidReasons = results
          .filter((r) => !r.valid)
          .flatMap((r) => (r.errors?.length ? r.errors : [r.reason ?? 'invalid handoff']));

        // Drift: treat invalid handoff as failure (skip mediation).
        if (!mediation.required && deliveredTo.length === 1) {
          this.affinity.recordHandoffOutcome({ from: params.from, to: deliveredTo[0], success: results.every((r) => r.valid) });
        }

        // Enforce: invalid handoff blocks delivery.
        if (handoffInvalidReasons.length > 0) {
          const blocked = this.blockedMessage(params, state, `Invalid handoff: ${handoffInvalidReasons.join('; ')}`);
          blocked.to = toList;
          blocked.deliveredTo = deliveredTo;
          blocked.mediation = mediation;
          blocked.handoff = handoff;
          blocked.security = this.securitySummary(security);
          this.appendMessage(state, blocked, security);
          await this.store.save(state);
          return blocked;
        }
      }

      // If HITL says pause/require approval, block delivery and update status.
      let status: ConversationMessage['status'] = 'delivered';
      let blockedReason: string | undefined;

      if (security.hitl.action === 'pause') {
        status = 'blocked';
        blockedReason = 'HITL pause';
        state.status = 'paused';
        state.statusReason = security.hitl.matchedTriggers.map((t) => `${t.id}: ${t.reason}`).join(' | ');
      }
      if (security.hitl.action === 'require_approval') {
        status = 'blocked';
        blockedReason = 'HITL require_approval';
        state.status = 'require_approval';
        state.statusReason = security.hitl.matchedTriggers.map((t) => `${t.id}: ${t.reason}`).join(' | ');
      }

      const msg: ConversationMessage = {
        messageId: genId('msg'),
        conversationId: state.conversationId,
        from: params.from,
        to: toList,
        deliveredTo,
        content: security.sanitized.content,
        createdAt: nowIso(),
        payload: params.payload,
        handoff,
        mediation,
        security: this.securitySummary(security),
        status,
        blockedReason,
      };

      this.appendMessage(state, msg, security);

      // If delivered, record in rate limiter and advance turn.
      if (msg.status === 'delivered') {
        this.securityDeps.rateLimiter.recordMessage(params.from, state.conversationId);
        if (params.isChallenge && deliveredTo[0]) {
          this.securityDeps.rateLimiter.recordChallenge(params.from, deliveredTo[0]);
          state.challengeCount += 1;
          state.consecutiveChallenges += 1;
        } else {
          state.consecutiveChallenges = 0;
        }

        // Advance turn to the first delivered recipient if they are a participant.
        const next = deliveredTo.find((a) => state.participants.includes(a));
        if (next) state.currentTurn = next;
      }

      // Refresh affinity stats (participants only)
      const stats = this.affinity.computeStats(state.participants);
      state.affinity.averageAffinity = stats.average;
      state.affinity.lowestAffinity = stats.lowest;
      state.affinity.lowestAffinityPair = stats.lowestPair;

      // Context summarization maintenance
      await this.maybeSummarize(state);

      state.updatedAt = nowIso();
      await this.store.save(state);
      return msg;
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────────

  private async resolveRecipients(
    from: AgentId,
    to: SendMessageParams['to'],
    payload?: SendMessageParams['payload'],
    participants: AgentId[] = []
  ): Promise<AgentId | AgentId[]> {
    if (to) return to;

    // Route based on role-card outputs if type is provided.
    const type = payload?.type;
    if (!type) throw new Error('sendMessage requires `to` or payload.type for routing');

    const card = await loadRoleCard(from);
    const outputs = card.outputs.filter((o) => o.type === type);
    if (outputs.length === 0) {
      throw new Error(`No role-card output contract for from=${from} type=${type}`);
    }

    // If multiple targets exist for same type, send to all.
    // '*' and 'broadcast' resolve to all non-user/system participants.
    const resolved = new Set<AgentId>();
    for (const o of outputs) {
      if (isWildcardTarget(o.target)) {
        for (const p of participants) {
          if (p !== from && p !== 'user' && p !== 'system') resolved.add(p);
        }
      } else {
        resolved.add(o.target);
      }
    }

    const toList = [...resolved];
    if (!toList.length) {
      throw new Error(
        `No valid recipients for from=${from} type=${type} (found ${outputs.length} outputs, ${participants.length} participants, ${resolved.size} after filtering)`
      );
    }
    return toList;
  }

  private toHITLConversationState(state: ConversationState) {
    return {
      conversationId: state.conversationId,
      participants: state.participants,
      messageCount: state.messageCount,
      challengeCount: state.challengeCount,
      consecutiveChallenges: state.consecutiveChallenges,
      averageAffinity: state.affinity.averageAffinity,
      lowestAffinity: state.affinity.lowestAffinity,
      lowestAffinityPair: state.affinity.lowestAffinityPair,
      tokenBudget: state.tokenBudget,
      tokensUsed: state.tokensUsed,
      injectionScores: state.injectionScores,
      policyViolationCount: state.policyViolationCount,
      voiceRuleViolationCount: state.voiceRuleViolationCount,
      lastMessageTimestamp: state.messages.length ? Date.parse(state.messages[state.messages.length - 1].createdAt) : undefined,
    };
  }

  private securitySummary(security: Awaited<ReturnType<typeof runOutboundSecurityPipeline>>): ConversationMessage['security'] {
    return {
      injectionScore: security.sanitized.metadata.injectionScore,
      structureValid: security.sanitized.structureValid,
      structureErrors: security.sanitized.structureErrors,
      sanitizedModified: security.sanitized.modified,
      redactionCount: security.sanitized.metadata.redactions.length,
      rateLimitAllowed: security.rateLimit.allowed,
      rateLimitType: security.rateLimit.limitType,
      policyWarningCount: security.policyWarnings.length,
      voiceViolationCount: security.voiceViolations.length,
      hitlAction: security.hitl.action,
      hitlTriggered: security.hitl.triggered,
      hitlUrgency: security.hitl.urgency,
      hitlMatchedTriggerIds: security.hitl.matchedTriggers.map((t) => t.id),
    };
  }

  private appendMessage(
    state: ConversationState,
    msg: ConversationMessage,
    security?: Awaited<ReturnType<typeof runOutboundSecurityPipeline>>
  ): void {
    state.messages.push(msg);
    state.messageCount += 1;

    const injection = security?.sanitized.metadata.injectionScore ?? msg.security?.injectionScore ?? 0;
    state.injectionScores.push(injection);
    if (state.injectionScores.length > 50) state.injectionScores = state.injectionScores.slice(-50);

    if ((security?.policyWarnings.length ?? 0) > 0) state.policyViolationCount += (security?.policyWarnings.length ?? 0);
    if ((security?.voiceViolations.length ?? 0) > 0) state.voiceRuleViolationCount += (security?.voiceViolations.length ?? 0);

    state.tokensUsed += estimateTokens(msg.content, this.config.charsPerToken);
  }

  private async maybeSummarize(state: ConversationState): Promise<void> {
    if (state.messages.length < this.config.summaryTriggerMessageCount) return;

    // Determine which messages are already covered by summaries.
    const covered = new Set<MessageId>();
    for (const s of state.summaries) for (const mid of s.coversMessageIds) covered.add(mid);

    const unsummarized = state.messages.filter((m) => !covered.has(m.messageId));
    if (unsummarized.length < this.config.summaryChunkSize) return;

    const chunk = unsummarized.slice(0, this.config.summaryChunkSize);
    const content = await this.summarizer.summarize(chunk);

    const summary: ConversationSummary = {
      summaryId: genId('sum'),
      createdAt: nowIso(),
      coversMessageIds: chunk.map((m) => m.messageId),
      content,
    };

    state.summaries.push(summary);

    if (this.config.discardSummarizedMessageContent) {
      const coveredSet = new Set(summary.coversMessageIds);
      for (const m of state.messages) {
        if (coveredSet.has(m.messageId)) {
          m.content = '';
        }
      }
    }
  }

  private blockedMessage(params: SendMessageParams, state: ConversationState, reason: string): ConversationMessage {
    return {
      messageId: genId('msg'),
      conversationId: state.conversationId,
      from: params.from,
      to: Array.isArray(params.to) ? params.to : params.to ? [params.to] : [],
      deliveredTo: Array.isArray(params.to) ? params.to : params.to ? [params.to] : [],
      content: params.content,
      createdAt: nowIso(),
      payload: params.payload,
      status: 'blocked',
      blockedReason: reason,
    };
  }

  private rejectedMessage(params: SendMessageParams, state: ConversationState, reason: string): ConversationMessage {
    return {
      messageId: genId('msg'),
      conversationId: state.conversationId,
      from: params.from,
      to: Array.isArray(params.to) ? params.to : params.to ? [params.to] : [],
      deliveredTo: Array.isArray(params.to) ? params.to : params.to ? [params.to] : [],
      content: params.content,
      createdAt: nowIso(),
      payload: params.payload,
      status: 'rejected',
      blockedReason: reason,
    };
  }

  private async withLock<T>(conversationId: ConversationId, fn: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(conversationId) ?? Promise.resolve();

    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    this.locks.set(conversationId, prior.then(() => gate));

    await prior;
    try {
      return await fn();
    } finally {
      release();
      // Cleanup if no queued work.
      if (this.locks.get(conversationId) === prior.then(() => gate)) {
        // no-op; best-effort cleanup handled by overwrites
      }
    }
  }
}
