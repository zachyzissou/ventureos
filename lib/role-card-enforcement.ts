import { loadRoleCard, type RoleCard } from './role-cards';

export interface Violation {
  tier: 'infrastructure' | 'heuristic' | 'quality';
  rule: string;
  enforcement: string;
  details?: string;
}

export interface Warning {
  rule: string;
  enforcement: string;
  severity: 'warning' | 'block' | 'escalate';
  details?: string;
}

export interface EnforcementResult {
  tier: 'infrastructure' | 'heuristic' | 'quality';
  passed: boolean;
  violations: Violation[];
  severity: 'block' | 'warn' | 'log';
}

export interface Logger {
  debug?: (msg: string, meta?: Record<string, unknown>) => void;
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
  error?: (msg: string, meta?: Record<string, unknown>) => void;
}

const defaultLogger: Logger = {
  warn: (msg, meta) => console.warn(msg, meta ?? ''),
  error: (msg, meta) => console.error(msg, meta ?? ''),
  info: (msg, meta) => console.info(msg, meta ?? ''),
  debug: (msg, meta) => {
    if (process.env.ROLE_CARD_DEBUG) console.debug(msg, meta ?? '');
  }
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function parseActionTokens(rule: string): string[] {
  // Allow embedding machine-readable tags into the free-text rule without changing schema.
  // Supported patterns:
  //   @action:db_write
  //   [action=db_write]
  //   action=db_write
  const tokens = new Set<string>();
  const patterns: RegExp[] = [
    /@action:([a-z0-9_\-]+)/gi,
    /\[action=([a-z0-9_\-]+)\]/gi,
    /\baction=([a-z0-9_\-]+)\b/gi
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(rule))) tokens.add(m[1]);
  }
  return [...tokens];
}

function ruleLikelyAppliesToAction(rule: string, action: string): boolean {
  const actionNorm = normalize(action);
  const ruleNorm = normalize(rule);

  const tokens = parseActionTokens(ruleNorm);
  if (tokens.length) return tokens.some((t) => normalize(t) === actionNorm);

  // Best-effort keyword matching.
  const keywordBuckets: Array<{ action: RegExp; keywords: RegExp[] }> = [
    {
      action: /\bdb(_|-)write\b|\bdatabase(_|-)write\b|\bsql(_|-)write\b|\bwrite_db\b/i,
      keywords: [/database/i, /db\b/i, /sql/i, /write/i]
    },
    {
      action: /\bdeploy\b|\bdeployment\b/i,
      keywords: [/deploy/i, /deployment/i, /production/i, /release/i]
    },
    {
      action: /\bnetwork(_|-)external\b|\bexternal(_|-)request\b|\bhttp(_|-)request\b/i,
      keywords: [/external/i, /network/i, /internet/i, /http/i, /request/i]
    },
    {
      action: /\bfile(_|-)write\b|\bwrite_file\b/i,
      keywords: [/file/i, /write/i, /filesystem/i]
    }
  ];

  for (const bucket of keywordBuckets) {
    if (bucket.action.test(actionNorm)) {
      return bucket.keywords.some((k) => k.test(ruleNorm));
    }
  }

  // Fallback: substring match if action itself appears.
  if (ruleNorm.includes(actionNorm)) return true;

  return false;
}

function looksLikeHasCitation(text: string): boolean {
  const t = text;
  // URLs or markdown links.
  if (/https?:\/\//i.test(t)) return true;
  if (/\[[^\]]+\]\([^\)]+\)/.test(t)) return true;
  if (/\bsource(s)?:\b/i.test(t)) return true;
  if (/\bcitation(s)?:\b/i.test(t)) return true;
  return false;
}

function extractNumbers(text: string): string[] {
  // Capture integers/decimals/percentages.
  const matches = text.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b/g);
  return matches ?? [];
}

function looksLikeComparativeClaim(text: string): boolean {
  return /\b(better|worse|faster|slower|higher|lower|more|less|best|worst)\b/i.test(text);
}

function applyPatternMatcher(rule: string, message: string): boolean {
  // Supported in rule:
  //  regex:/.../flags
  //  /.../flags
  const trimmed = rule.trim();

  // regex:/.../g
  const regexPrefix = /^regex:\s*(\/.*\/[gimsuy]*)\s*$/i;
  const m1 = trimmed.match(regexPrefix);
  const literal = m1?.[1] ?? (trimmed.startsWith('/') ? trimmed : null);

  if (!literal) return false;

  const lastSlash = literal.lastIndexOf('/');
  if (lastSlash <= 0) return false;
  const body = literal.slice(1, lastSlash);
  const flags = literal.slice(lastSlash + 1);

  try {
    const re = new RegExp(body, flags);
    return re.test(message);
  } catch {
    return false;
  }
}

export async function enforceInfrastructureBans(agentId: string, action: string): Promise<boolean> {
  const card = await loadRoleCard(agentId);

  // If any infra ban plausibly applies to this action, block.
  for (const ban of card.hardBans.infrastructure) {
    if (ruleLikelyAppliesToAction(ban.rule, action)) {
      defaultLogger.warn?.('Infrastructure ban triggered', { agentId, action, rule: ban.rule, enforcement: ban.enforcement });
      return false;
    }
  }

  return true;
}

export async function enforceHeuristicBans(agentId: string, message: string): Promise<Warning[]> {
  const card = await loadRoleCard(agentId);
  const warnings: Warning[] = [];

  const hasCitation = looksLikeHasCitation(message);
  const numbers = extractNumbers(message);
  const comparative = looksLikeComparativeClaim(message);

  for (const ban of card.hardBans.heuristic) {
    switch (ban.enforcement) {
      case 'citation_detector': {
        if (!hasCitation) {
          warnings.push({
            rule: ban.rule,
            enforcement: ban.enforcement,
            severity: ban.severity,
            details: 'No obvious citation markers (URL, markdown link, or “Source:”) detected.'
          });
        }
        break;
      }
      case 'number_source_tracker': {
        if (numbers.length && !hasCitation) {
          warnings.push({
            rule: ban.rule,
            enforcement: ban.enforcement,
            severity: ban.severity,
            details: `Detected numbers without obvious citations: ${numbers.slice(0, 10).join(', ')}`
          });
        }
        break;
      }
      case 'comparison_verifier': {
        if (comparative && !hasCitation) {
          warnings.push({
            rule: ban.rule,
            enforcement: ban.enforcement,
            severity: ban.severity,
            details: 'Comparative language detected without citations.'
          });
        }
        break;
      }
      case 'pattern_matcher': {
        if (applyPatternMatcher(ban.rule, message)) {
          warnings.push({
            rule: ban.rule,
            enforcement: ban.enforcement,
            severity: ban.severity,
            details: 'Pattern matcher triggered.'
          });
        }
        break;
      }
      default: {
        const never: never = ban.enforcement;
        void never;
      }
    }
  }

  return warnings;
}

export function logQualityViolations(agentId: string, message: string): void {
  // Tier 3 is explicitly non-blocking; we log to support training + periodic review.
  void (async () => {
    const card = await loadRoleCard(agentId);

    for (const ban of card.hardBans.quality) {
      const examples = ban.examples ?? [];
      const hit = examples.find((ex) => ex && message.toLowerCase().includes(ex.toLowerCase()));
      if (hit) {
        defaultLogger.info?.('Quality guideline violation', {
          agentId,
          rule: ban.rule,
          enforcement: ban.enforcement,
          example: hit
        });
      }
    }
  })().catch((err) => {
    defaultLogger.error?.('Failed to log quality violations', { agentId, error: String(err) });
  });
}

export async function enforceAllTiers(agentId: string, action: string, message: string): Promise<EnforcementResult[]> {
  const results: EnforcementResult[] = [];

  const infraAllowed = await enforceInfrastructureBans(agentId, action);
  results.push({
    tier: 'infrastructure',
    passed: infraAllowed,
    violations: infraAllowed
      ? []
      : [
          {
            tier: 'infrastructure',
            rule: `Action blocked: ${action}`,
            enforcement: 'infrastructure',
            details: 'Matched an infrastructure hard ban'
          }
        ],
    severity: 'block'
  });

  const warnings = await enforceHeuristicBans(agentId, message);
  results.push({
    tier: 'heuristic',
    passed: warnings.length === 0,
    violations: warnings.map((w) => ({ tier: 'heuristic', rule: w.rule, enforcement: w.enforcement, details: w.details })),
    severity: warnings.some((w) => w.severity === 'block') ? 'block' : warnings.length ? 'warn' : 'warn'
  });

  logQualityViolations(agentId, message);
  results.push({ tier: 'quality', passed: true, violations: [], severity: 'log' });

  return results;
}

export function evaluateEscalationTriggers(card: RoleCard, contextText: string): Array<{ condition: string; action: string; target?: string; priority?: string }> {
  const matches: Array<{ condition: string; action: string; target?: string; priority?: string }> = [];
  const haystack = contextText.toLowerCase();

  // Minimal baseline: treat condition as a substring (teams can later replace with a real rule language).
  for (const t of card.escalation.triggers) {
    const needle = t.condition.toLowerCase();
    if (needle && haystack.includes(needle)) {
      matches.push({ condition: t.condition, action: t.action, target: t.target, priority: t.priority });
    }
  }
  return matches;
}
