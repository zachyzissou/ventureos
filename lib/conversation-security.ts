/**
 * Conversation Security Pipeline Wrapper — VentureOS (Track 5)
 *
 * Wraps Track 4 security infrastructure for use by the conversation engine.
 *
 * Responsibilities:
 * - Sanitize outbound content
 * - Enforce rate limits
 * - Run role-card heuristic enforcement
 * - Run Voice RULES validation
 * - Run HITL checks and optionally trigger alert handlers
 */

import { sanitizeAgentMessage, type SanitizerConfig, type SanitizedMessage } from './message-sanitizer';
import { RateLimiter, type RateLimitResult, type RateLimitConfig } from './rate-limiter';
import { enforceHeuristicBans, type Warning } from './role-card-enforcement';
import { validateRawText, type VoiceViolation } from './voice-rules';
import { HITLEngine, type HITLCheckResult, type ConversationState as HITLConversationState } from './hitl';

export interface OutboundSecurityConfig {
  sanitizer?: Partial<SanitizerConfig>;
  rateLimiter?: Partial<RateLimitConfig>;
}

export interface OutboundSecurityDeps {
  rateLimiter: RateLimiter;
  hitl: HITLEngine;
}

export interface OutboundSecurityInput {
  conversationId: string;
  from: string;
  to: string | string[];
  content: string;
  /** Used for rate limiting. */
  isChallenge?: boolean;
  challengeTarget?: string;
  /** Conversation state used for HITL checks. */
  conversationState: HITLConversationState;
}

export interface OutboundSecurityResult {
  sanitized: SanitizedMessage & { structureValid: boolean; structureErrors: string[] };
  rateLimit: RateLimitResult;
  policyWarnings: Warning[];
  voiceViolations: VoiceViolation[];
  hitl: HITLCheckResult;
}

export function createDefaultSecurityDeps(config: OutboundSecurityConfig = {}): OutboundSecurityDeps {
  return {
    rateLimiter: new RateLimiter(config.rateLimiter),
    hitl: new HITLEngine(),
  };
}

export async function runOutboundSecurityPipeline(
  input: OutboundSecurityInput,
  deps: OutboundSecurityDeps,
  config: OutboundSecurityConfig = {}
): Promise<OutboundSecurityResult> {
  const sanitized = sanitizeAgentMessage(input.from, input.to, input.content, config.sanitizer);

  // Rate limit checks: use sender agent ID and conversation ID.
  const rateLimit = deps.rateLimiter.checkAll(
    input.from,
    input.conversationId,
    { isChallenge: input.isChallenge, challengeTarget: input.challengeTarget },
    Date.now()
  );

  // Role-card heuristic enforcement (Tier 2). Infrastructure bans are action-specific and
  // enforced elsewhere; for messages we focus on heuristic output checks.
  // Skip role-card enforcement for non-agent senders (system, user, broadcast) that don't have role cards.
  const NON_AGENT_SENDERS = new Set(['system', 'user', 'broadcast']);
  const policyWarnings = NON_AGENT_SENDERS.has(input.from)
    ? []
    : await enforceHeuristicBans(input.from, sanitized.content);

  // Voice rules: raw text validation (anti-filler). More structured Fact+Action validation can be
  // plugged in later once agents standardize outputs.
  const voiceViolations = validateRawText(sanitized.content).violations;

  const hitl = await deps.hitl.checkMessage({
    agentId: input.from,
    conversationState: input.conversationState,
    injectionScore: sanitized.metadata.injectionScore,
    policyViolations: policyWarnings.map((w) => ({ tier: 'heuristic', rule: w.rule, severity: w.severity })),
    voiceViolations: voiceViolations.map((v) => ({ rule: v.rule, severity: v.severity })),
    rateLimitResult: rateLimit,
    context: {
      conversationId: input.conversationId,
      agentId: input.from,
      messageContent: sanitized.content,
      injectionScore: sanitized.metadata.injectionScore,
    },
  });

  return {
    sanitized,
    rateLimit,
    policyWarnings,
    voiceViolations,
    hitl,
  };
}
