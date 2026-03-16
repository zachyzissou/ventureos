/**
 * Voice Rules — VentureOS Multi-Agent Communication Standards
 *
 * Enforces two core rules for agent-to-agent and agent-to-user messages:
 *
 * 1. **Fact+Action Format**: Messages must separate observed facts from
 *    actions taken/planned. No hedging mixed into factual claims.
 *
 * 2. **Anti-Filler Validation**: Detects and flags sycophantic/filler
 *    phrases that violate SOUL.md directness rules.
 *
 * Integrates with the role-card enforcement system as Tier 2 heuristic checks.
 */

// ─── Fact+Action Message Schema ───────────────────────────────────────────

export interface Fact {
  /** What was observed, measured, or confirmed. Must be verifiable. */
  observation: string;
  /** Where this fact came from (log, metric, file, agent output, etc.) */
  source?: string;
  /** Confidence: 1.0 = verified, 0.7+ = high, 0.4-0.7 = medium, <0.4 = low */
  confidence?: number;
}

export interface Action {
  /** What the agent did or will do. Use past tense for completed, future for planned. */
  description: string;
  /** 'completed' | 'in_progress' | 'planned' | 'blocked' */
  status: ActionStatus;
  /** If blocked, why. */
  blockedReason?: string;
  /** Target agent or system this action affects. */
  target?: string;
}

export type ActionStatus = 'completed' | 'in_progress' | 'planned' | 'blocked';

export interface VoiceMessage {
  /** Who sent this message. Must match a valid agentId. */
  from: string;
  /** Who this message is for. Agent ID, 'user', or 'broadcast'. */
  to: string;
  /** Observed facts — what is true right now. */
  facts: Fact[];
  /** Actions taken or planned — what the agent did/will do. */
  actions: Action[];
  /** Optional free-text summary. Subject to anti-filler validation. */
  summary?: string;
  /** ISO 8601 timestamp. */
  timestamp?: string;
}

// ─── Validation Results ───────────────────────────────────────────────────

export type VoiceViolationSeverity = 'warning' | 'block';

export interface VoiceViolation {
  rule: string;
  field: string;
  severity: VoiceViolationSeverity;
  details: string;
  /** The exact text that triggered the violation. */
  match?: string;
}

export interface VoiceValidationResult {
  valid: boolean;
  violations: VoiceViolation[];
  /** Message with filler phrases stripped (if any were found). */
  cleaned?: VoiceMessage;
}

// ─── Anti-Filler Rules ───────────────────────────────────────────────────

/**
 * Filler phrase categories with patterns.
 *
 * Each pattern is tested case-insensitively against the start or body of text.
 * Patterns are grouped so we can report which category triggered.
 */
export interface FillerRule {
  category: string;
  /** Human description of what this catches. */
  description: string;
  /** Regex patterns to detect. Tested with 'i' flag. */
  patterns: RegExp[];
  /** 'warning' = flag it, 'block' = reject the message. */
  severity: VoiceViolationSeverity;
}

/**
 * Core filler rules derived from SOUL.md:
 * "Never open with 'Great question', 'I'd be happy to help', or 'Absolutely.' Just answer."
 */
export const FILLER_RULES: FillerRule[] = [
  {
    category: 'sycophantic_opener',
    description: 'Sycophantic opening phrases that add no information',
    patterns: [
      /^great question/i,
      /^good question/i,
      /^excellent question/i,
      /^wonderful question/i,
      /^that'?s a (?:great|good|excellent|wonderful|fantastic|interesting) (?:question|point|observation)/i,
      /^what a (?:great|good|excellent) question/i,
    ],
    severity: 'block',
  },
  {
    category: 'happy_to_help',
    description: 'Performative willingness declarations',
    patterns: [
      /^i'?d be happy to/i,
      /^i'?d love to help/i,
      /^i'?m happy to help/i,
      /^i'?m glad you asked/i,
      /^happy to help/i,
      /^glad to help/i,
      /^glad you asked/i,
      /^i'?d be glad to/i,
      /^i'?d be delighted to/i,
    ],
    severity: 'block',
  },
  {
    category: 'filler_acknowledgment',
    description: 'Empty acknowledgment without substance',
    patterns: [
      /^absolutely[.!]?\s*$/i,
      /^definitely[.!]?\s*$/i,
      /^of course[.!]?\s*$/i,
      /^sure thing[.!]?\s*$/i,
      /^no problem[.!]?\s*$/i,
      /^you got it[.!]?\s*$/i,
    ],
    severity: 'warning',
  },
  {
    category: 'thinking_stall',
    description: 'Stalling phrases that simulate thinking without adding content',
    patterns: [
      /^let me think about that/i,
      /^let me consider/i,
      /^hmm,? let me/i,
      /^that'?s an interesting/i,
      /^interesting(?:ly)?[,.]?\s/i,
      /^well,?\s/i,
      /^so,?\s/i,
    ],
    severity: 'warning',
  },
  {
    category: 'hedge_phrase',
    description: 'Hedging that weakens factual statements (use confidence scores instead)',
    patterns: [
      /\bi think (?:that )?(?:maybe|perhaps)\b/i,
      /\bit seems like it (?:might|could) be\b/i,
      /\bif i'?m not mistaken\b/i,
      /\bi believe (?:that )?(?:it )?(?:might|could|may)\b/i,
      /\bcorrect me if i'?m wrong\b/i,
      /\bi could be wrong,? but\b/i,
    ],
    severity: 'warning',
  },
  {
    category: 'corporate_filler',
    description: 'Corporate-speak that adds no signal',
    patterns: [
      /\bat the end of the day\b/i,
      /\bin terms of\b/i,
      /\bmoving forward\b/i,
      /\bgoing forward\b/i,
      /\bwith that (?:being )?said\b/i,
      /\bhaving said that\b/i,
      /\bit'?s worth (?:noting|mentioning) that\b/i,
      /\bi want to (?:emphasize|highlight|point out) that\b/i,
      /\bas (?:a matter of fact|previously mentioned)\b/i,
      /\bin today'?s (?:world|landscape|environment)\b/i,
    ],
    severity: 'warning',
  },
  {
    category: 'meta_narration',
    description: 'Narrating what the agent is about to do instead of doing it',
    patterns: [
      /^(?:first,? )?(?:i'?ll |let me )(?:start by |begin by )/i,
      /^i'?m going to (?:go ahead and |now )/i,
      /^(?:ok(?:ay)?,? )?(?:so )?(?:what i'?ll do is|here'?s what i'?ll do)/i,
      /^allow me to/i,
    ],
    severity: 'warning',
  },
];

// ─── Validation Functions ─────────────────────────────────────────────────

const VALID_ACTION_STATUSES: ActionStatus[] = ['completed', 'in_progress', 'planned', 'blocked'];

/**
 * Validate the structural integrity of a VoiceMessage.
 * Checks required fields, types, and logical consistency.
 */
export function validateStructure(msg: Partial<VoiceMessage>): VoiceViolation[] {
  const violations: VoiceViolation[] = [];

  if (!msg.from || typeof msg.from !== 'string' || !msg.from.trim()) {
    violations.push({
      rule: 'required_field',
      field: 'from',
      severity: 'block',
      details: '"from" is required and must be a non-empty string.',
    });
  }

  if (!msg.to || typeof msg.to !== 'string' || !msg.to.trim()) {
    violations.push({
      rule: 'required_field',
      field: 'to',
      severity: 'block',
      details: '"to" is required and must be a non-empty string.',
    });
  }

  if (!Array.isArray(msg.facts)) {
    violations.push({
      rule: 'required_field',
      field: 'facts',
      severity: 'block',
      details: '"facts" must be an array.',
    });
  } else {
    for (let i = 0; i < msg.facts.length; i++) {
      const f = msg.facts[i];
      if (!f || typeof f.observation !== 'string' || !f.observation.trim()) {
        violations.push({
          rule: 'fact_observation_required',
          field: `facts[${i}].observation`,
          severity: 'block',
          details: 'Each fact must have a non-empty observation string.',
        });
      }
      if (f && f.confidence !== undefined) {
        if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) {
          violations.push({
            rule: 'fact_confidence_range',
            field: `facts[${i}].confidence`,
            severity: 'warning',
            details: 'Confidence must be a number between 0 and 1.',
          });
        }
      }
    }
  }

  if (!Array.isArray(msg.actions)) {
    violations.push({
      rule: 'required_field',
      field: 'actions',
      severity: 'block',
      details: '"actions" must be an array.',
    });
  } else {
    for (let i = 0; i < msg.actions.length; i++) {
      const a = msg.actions[i];
      if (!a || typeof a.description !== 'string' || !a.description.trim()) {
        violations.push({
          rule: 'action_description_required',
          field: `actions[${i}].description`,
          severity: 'block',
          details: 'Each action must have a non-empty description string.',
        });
      }
      if (a && !VALID_ACTION_STATUSES.includes(a.status)) {
        violations.push({
          rule: 'action_status_invalid',
          field: `actions[${i}].status`,
          severity: 'block',
          details: `Action status must be one of: ${VALID_ACTION_STATUSES.join(', ')}. Got: "${a.status}"`,
        });
      }
      if (a && a.status === 'blocked' && (!a.blockedReason || !a.blockedReason.trim())) {
        violations.push({
          rule: 'blocked_requires_reason',
          field: `actions[${i}].blockedReason`,
          severity: 'warning',
          details: 'Blocked actions should include a blockedReason.',
        });
      }
    }
  }

  // At least one fact or action required (empty messages are noise).
  if (
    Array.isArray(msg.facts) &&
    Array.isArray(msg.actions) &&
    msg.facts.length === 0 &&
    msg.actions.length === 0
  ) {
    violations.push({
      rule: 'empty_message',
      field: 'facts+actions',
      severity: 'block',
      details: 'Message must contain at least one fact or one action.',
    });
  }

  if (msg.timestamp !== undefined) {
    if (typeof msg.timestamp !== 'string' || isNaN(Date.parse(msg.timestamp))) {
      violations.push({
        rule: 'invalid_timestamp',
        field: 'timestamp',
        severity: 'warning',
        details: 'Timestamp must be a valid ISO 8601 string.',
      });
    }
  }

  return violations;
}

/**
 * Scan text for filler phrases. Returns all matches.
 */
export function detectFiller(
  text: string,
  rules: FillerRule[] = FILLER_RULES
): VoiceViolation[] {
  if (!text || !text.trim()) return [];

  const violations: VoiceViolation[] = [];
  const trimmed = text.trim();

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        violations.push({
          rule: `filler_${rule.category}`,
          field: 'text',
          severity: rule.severity,
          details: rule.description,
          match: match[0],
        });
        // One match per category is enough — don't spam.
        break;
      }
    }
  }

  return violations;
}

/**
 * Strip detected filler phrases from text.
 * Returns the cleaned text. If the entire text is filler, returns empty string.
 */
export function stripFiller(text: string, rules: FillerRule[] = FILLER_RULES): string {
  if (!text || !text.trim()) return '';

  let cleaned = text.trim();
  const original = cleaned;

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      // Only strip opener-style fillers (patterns that match at start of text).
      // Body-level fillers (hedge phrases, corporate filler) are flagged but not stripped
      // because removing them mid-sentence could break grammar.
      if (pattern.source.startsWith('^')) {
        cleaned = cleaned.replace(pattern, '').trim();
      }
    }
  }

  // Clean up leading punctuation/whitespace artifacts (!, ?, ., commas, semicolons).
  cleaned = cleaned.replace(/^[,;.!?\s]+/, '').trim();

  // Capitalize first letter if we stripped a prefix.
  if (cleaned.length > 0 && cleaned !== original) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Detect hedging language mixed into fact observations.
 * Facts should use confidence scores, not weasel words.
 */
export function detectFactHedging(facts: Fact[]): VoiceViolation[] {
  const violations: VoiceViolation[] = [];

  const hedgePatterns: Array<{ pattern: RegExp; suggestion: string }> = [
    { pattern: /\bprobably\b/i, suggestion: 'Use confidence: 0.7 instead of "probably"' },
    { pattern: /\bmight be\b/i, suggestion: 'Use confidence: 0.5 instead of "might be"' },
    { pattern: /\bcould be\b/i, suggestion: 'Use confidence: 0.5 instead of "could be"' },
    { pattern: /\bseems like\b/i, suggestion: 'Use confidence: 0.6 instead of "seems like"' },
    { pattern: /\bmaybe\b/i, suggestion: 'Use confidence: 0.5 instead of "maybe"' },
    { pattern: /\bperhaps\b/i, suggestion: 'Use confidence: 0.5 instead of "perhaps"' },
    { pattern: /\bi think\b/i, suggestion: 'State the observation directly, use confidence score for uncertainty' },
    { pattern: /\bi believe\b/i, suggestion: 'State the observation directly, use confidence score for uncertainty' },
    { pattern: /\bappears to\b/i, suggestion: 'Use confidence: 0.7 instead of "appears to"' },
    { pattern: /\blikely\b/i, suggestion: 'Use confidence: 0.75 instead of "likely"' },
    { pattern: /\bunlikely\b/i, suggestion: 'Use confidence: 0.25 instead of "unlikely"' },
    { pattern: /\bpossibly\b/i, suggestion: 'Use confidence: 0.4 instead of "possibly"' },
  ];

  for (let i = 0; i < facts.length; i++) {
    const fact = facts[i];
    for (const { pattern, suggestion } of hedgePatterns) {
      const match = fact.observation.match(pattern);
      if (match) {
        violations.push({
          rule: 'fact_hedging',
          field: `facts[${i}].observation`,
          severity: 'warning',
          details: suggestion,
          match: match[0],
        });
      }
    }
  }

  return violations;
}

/**
 * Full validation pipeline for a VoiceMessage.
 *
 * Runs:
 * 1. Structural validation (required fields, types)
 * 2. Fact hedging detection
 * 3. Anti-filler scanning on summary
 * 4. Anti-filler scanning on fact observations
 * 5. Anti-filler scanning on action descriptions
 *
 * Returns a VoiceValidationResult with all violations and an optional
 * cleaned version of the message.
 */
export function validateVoiceMessage(
  msg: Partial<VoiceMessage>,
  options: { rules?: FillerRule[]; autoClean?: boolean } = {}
): VoiceValidationResult {
  const rules = options.rules ?? FILLER_RULES;
  const autoClean = options.autoClean ?? false;
  const violations: VoiceViolation[] = [];

  // 1. Structural validation
  violations.push(...validateStructure(msg));

  // If structure is fundamentally broken, bail early.
  if (violations.some((v) => v.severity === 'block')) {
    return { valid: false, violations };
  }

  const message = msg as VoiceMessage;

  // 2. Fact hedging detection
  violations.push(...detectFactHedging(message.facts));

  // 3. Anti-filler on summary
  if (message.summary) {
    const summaryViolations = detectFiller(message.summary, rules);
    for (const v of summaryViolations) {
      v.field = 'summary';
    }
    violations.push(...summaryViolations);
  }

  // 4. Anti-filler on fact observations
  for (let i = 0; i < message.facts.length; i++) {
    const factViolations = detectFiller(message.facts[i].observation, rules);
    for (const v of factViolations) {
      v.field = `facts[${i}].observation`;
    }
    violations.push(...factViolations);
  }

  // 5. Anti-filler on action descriptions
  for (let i = 0; i < message.actions.length; i++) {
    const actionViolations = detectFiller(message.actions[i].description, rules);
    for (const v of actionViolations) {
      v.field = `actions[${i}].description`;
    }
    violations.push(...actionViolations);
  }

  const hasStructuralBlocking = violations.some(
    (v) => v.severity === 'block' && !v.rule.startsWith('filler_')
  );
  const hasFillerViolations = violations.some(
    (v) => v.rule.startsWith('filler_') || v.rule === 'fact_hedging'
  );
  const result: VoiceValidationResult = {
    valid: violations.length === 0,
    violations,
  };

  // Auto-clean: strip filler from text fields if requested, there are filler violations,
  // and no blocking structural errors (filler blocks are strippable, structural blocks are not).
  if (autoClean && hasFillerViolations && !hasStructuralBlocking) {
    result.cleaned = {
      ...message,
      facts: message.facts.map((f) => ({
        ...f,
        observation: stripFiller(f.observation, rules) || f.observation,
      })),
      actions: message.actions.map((a) => ({
        ...a,
        description: stripFiller(a.description, rules) || a.description,
      })),
      summary: message.summary ? stripFiller(message.summary, rules) || message.summary : undefined,
    };
  }

  return result;
}

// ─── Integration with Role Card Enforcement ───────────────────────────────

/**
 * Bridge function: converts voice rule violations into the Warning format
 * used by the role-card enforcement system (Tier 2 heuristic layer).
 *
 * This allows voice rules to be enforced alongside existing heuristic bans
 * (citation_detector, number_source_tracker, etc.).
 */
export function voiceViolationsToEnforcementWarnings(
  violations: VoiceViolation[]
): Array<{ rule: string; enforcement: string; severity: 'warning' | 'block' | 'escalate'; details?: string }> {
  return violations.map((v) => ({
    rule: v.rule,
    enforcement: 'voice_rules',
    severity: v.severity === 'block' ? 'block' : 'warning',
    details: v.details + (v.match ? ` (matched: "${v.match}")` : ''),
  }));
}

/**
 * Convenience: validate a raw text string (not a structured VoiceMessage)
 * for filler phrases. Useful for validating free-form agent output before
 * it gets structured into Fact+Action format.
 */
export function validateRawText(text: string, rules: FillerRule[] = FILLER_RULES): VoiceValidationResult {
  const violations = detectFiller(text, rules);
  return {
    valid: violations.length === 0,
    violations,
  };
}

// ─── Message Builders ─────────────────────────────────────────────────────

/**
 * Helper to construct a valid VoiceMessage with validation.
 * Throws if the message fails structural validation.
 */
export function createVoiceMessage(
  from: string,
  to: string,
  facts: Fact[],
  actions: Action[],
  options?: { summary?: string; timestamp?: string }
): VoiceMessage {
  const msg: VoiceMessage = {
    from,
    to,
    facts,
    actions,
    summary: options?.summary,
    timestamp: options?.timestamp ?? new Date().toISOString(),
  };

  const structuralViolations = validateStructure(msg);
  const blocking = structuralViolations.filter((v) => v.severity === 'block');
  if (blocking.length > 0) {
    throw new Error(
      `Invalid VoiceMessage: ${blocking.map((v) => v.details).join('; ')}`
    );
  }

  return msg;
}

/**
 * Shorthand for creating a simple status update message.
 */
export function createStatusUpdate(
  from: string,
  to: string,
  factObservations: string[],
  actionDescriptions: Array<{ description: string; status: ActionStatus }>,
  options?: { summary?: string }
): VoiceMessage {
  return createVoiceMessage(
    from,
    to,
    factObservations.map((obs) => ({ observation: obs })),
    actionDescriptions.map((a) => ({ description: a.description, status: a.status })),
    options
  );
}
