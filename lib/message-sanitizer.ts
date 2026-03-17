/**
 * Message Sanitizer — VentureOS Security Infrastructure (Track 4)
 *
 * Provides input and output sanitization for inter-agent messages:
 * - System prompt fragment detection and removal
 * - Credential/secret redaction (paths, tokens, API keys, passwords)
 * - Prompt injection detection (pattern-based scoring)
 * - Message length enforcement
 * - HTML/XSS sanitization (tag stripping for safe rendering)
 * - Special character / markdown / code block safety
 * - Structural validation before processing
 *
 * All redactions are logged for audit trail.
 */

import { KNOWN_AGENT_IDS } from './agent-identity';

// ─── Types ────────────────────────────────────────────────────────────────

export interface Redaction {
  /** What was redacted. */
  type: 'secret' | 'system_prompt' | 'path' | 'injection' | 'length' | 'control_char';
  /** Character offset where redaction starts in original text. */
  offset: number;
  /** Length of redacted content. */
  length: number;
  /** Replacement text used. */
  replacement: string;
  /** Human-readable reason. */
  reason: string;
}

export interface SanitizedMessage {
  /** The sanitized content. */
  content: string;
  /** Whether any modifications were made. */
  modified: boolean;
  metadata: {
    /** Length of the original message. */
    originalLength: number;
    /** Length of the sanitized message. */
    sanitizedLength: number;
    /** All redactions applied. */
    redactions: Redaction[];
    /** Prompt injection score (0-1). 0 = clean, 1 = definitely injection. */
    injectionScore: number;
    /** Whether the message was truncated due to length. */
    truncated: boolean;
  };
}

export interface SanitizerConfig {
  /** Maximum message length in characters. Default: 4000 */
  maxLength: number;
  /** Whether to redact file system paths. Default: true */
  redactPaths: boolean;
  /** Whether to check for prompt injection patterns. Default: true */
  detectInjection: boolean;
  /** Whether to strip control characters. Default: true */
  stripControlChars: boolean;
  /** Whether to normalize dangerous unicode. Default: true */
  normalizeUnicode: boolean;
  /** Whether to escape HTML for safe rendering. Default: true */
  escapeHtmlContent: boolean;
  /** Custom secret patterns (regex strings). */
  customSecretPatterns: RegExp[];
  /** Custom injection patterns (regex strings). */
  customInjectionPatterns: Array<{ pattern: RegExp; weight: number }>;
  /** Max number of code blocks allowed. Default: 5 */
  maxCodeBlocks: number;
  /** Max nested markdown depth. Default: 6 */
  maxMarkdownDepth: number;
}

export interface MessageStructure {
  /** Agent ID of the sender. */
  from: string;
  /** Agent ID(s) of the recipient(s). */
  to: string | string[];
  /** The message content. */
  content: string;
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
}

export interface StructureValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────

const VALID_AGENT_IDS = new Set(KNOWN_AGENT_IDS);

const DEFAULT_CONFIG: SanitizerConfig = {
  maxLength: 4000,
  redactPaths: true,
  detectInjection: true,
  stripControlChars: true,
  normalizeUnicode: true,
  escapeHtmlContent: true,
  customSecretPatterns: [],
  customInjectionPatterns: [],
  maxCodeBlocks: 5,
  maxMarkdownDepth: 6,
};

// ─── Secret Detection Patterns ────────────────────────────────────────────

/**
 * Patterns that match common secrets, tokens, credentials.
 * Each pattern has a name for audit logging.
 */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  // API keys (generic)
  {
    name: 'api_key_generic',
    pattern: /\b(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
    replacement: '[REDACTED_API_KEY]',
  },
  // Bearer tokens
  {
    name: 'bearer_token',
    pattern: /\bBearer\s+[a-zA-Z0-9_\-.]{20,}/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  // OpenAI keys
  {
    name: 'openai_key',
    pattern: /\bsk-[a-zA-Z0-9]{20,}/g,
    replacement: '[REDACTED_OPENAI_KEY]',
  },
  // Anthropic keys
  {
    name: 'anthropic_key',
    pattern: /\bsk-ant-[a-zA-Z0-9_\-]{20,}/g,
    replacement: '[REDACTED_ANTHROPIC_KEY]',
  },
  // AWS keys
  {
    name: 'aws_access_key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  // GitHub tokens
  {
    name: 'github_token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  // Connection strings (before generic secret_assignment)
  {
    name: 'connection_string',
    pattern: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s]{10,}/gi,
    replacement: '[REDACTED_CONNECTION_STRING]',
  },
  // JWT tokens (before generic secret_assignment)
  {
    name: 'jwt_token',
    pattern: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    replacement: '[REDACTED_JWT]',
  },
  // Discord webhook URLs (before generic secret_assignment)
  {
    name: 'discord_webhook',
    pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/gi,
    replacement: '[REDACTED_DISCORD_WEBHOOK]',
  },
  // Private keys (PEM)
  {
    name: 'private_key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  // Generic secrets in key=value pairs (LAST — catch-all after specific patterns)
  // Negative lookahead avoids re-redacting already-replaced [REDACTED_*] placeholders.
  {
    name: 'secret_assignment',
    pattern: /\b(?:password|passwd|secret|token|credential|private[_-]?key)\s*[:=]\s*['"]?(?!\[REDACTED)([^\s'"]{8,})['"]?/gi,
    replacement: '[REDACTED_SECRET]',
  },
];

// ─── Path Detection ───────────────────────────────────────────────────────

const PATH_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  // Absolute Unix paths with home directory
  {
    name: 'home_path',
    pattern: /(?:\/Users\/[a-zA-Z0-9_.-]+|\/home\/[a-zA-Z0-9_.-]+|~)\/(?:[a-zA-Z0-9_.\-/]+)/g,
    replacement: '[REDACTED_PATH]',
  },
  // .env file references
  {
    name: 'env_file',
    pattern: /\.env(?:\.[a-zA-Z]+)?\b/g,
    replacement: '[ENV_FILE]',
  },
  // Credentials directory references
  {
    name: 'credentials_path',
    pattern: /(?:credentials|secrets|\.ssh|\.gnupg|\.aws)\/[a-zA-Z0-9_.\-/]*/gi,
    replacement: '[REDACTED_CREDENTIALS_PATH]',
  },
];

// ─── Prompt Injection Patterns ────────────────────────────────────────────

/**
 * Weighted patterns for prompt injection detection.
 * Weight indicates severity: higher = more suspicious.
 * Total injection score is sum of matched weights, capped at 1.0.
 */
const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp; weight: number }> = [
  // Direct instruction override attempts
  {
    name: 'ignore_instructions',
    pattern: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|earlier|your)\s+(?:instructions?|rules?|constraints?|guidelines?|directives?|prompts?)\b/i,
    weight: 0.45,
  },
  // System prompt extraction
  {
    name: 'system_prompt_extraction',
    pattern: /\b(?:reveal|show|display|print|output|repeat|echo)\s+(?:\w+\s+)*(?:your\s+)?(?:system\s+)?(?:prompt|instructions?|rules?|configuration|initial\s+message)\b/i,
    weight: 0.40,
  },
  // Role-play jailbreak
  {
    name: 'roleplay_jailbreak',
    pattern: /\b(?:pretend|act\s+as\s+if|imagine|you\s+are\s+now|from\s+now\s+on\s+you\s+are|roleplay\s+as)\s+(?:you(?:'re|\s+are)?\s+)?(?:an?\s+)?(?:unrestricted|uncensored|unfiltered|jailbroken)\b/i,
    weight: 0.50,
  },
  // DAN-style jailbreak
  {
    name: 'dan_jailbreak',
    pattern: /\bDAN\b.*\b(?:do\s+anything\s+now|jailbreak)\b/i,
    weight: 0.50,
  },
  // Encoding-based evasion
  {
    name: 'encoding_evasion',
    pattern: /\b(?:base64|rot13|hex|encode|decode)\s+(?:the\s+)?(?:following|this|previous)\b/i,
    weight: 0.20,
  },
  // Instruction injection delimiters
  {
    name: 'delimiter_injection',
    pattern: /(?:###\s*(?:SYSTEM|INSTRUCTION|NEW\s+PROMPT)|<\|(?:system|im_start|endoftext)\|>|\[INST\]|\[\/INST\]|<<SYS>>)/i,
    weight: 0.50,
  },
  // Multi-step manipulation
  {
    name: 'multi_step_manipulation',
    pattern: /\b(?:step\s+1|first|now)\s*:?\s*(?:ignore|forget|disregard)\b/i,
    weight: 0.30,
  },
  // Claiming special authority
  {
    name: 'authority_claim',
    pattern: /\b(?:i\s+am\s+(?:your|the)\s+(?:admin|developer|creator|owner|operator)|admin\s+override|sudo|root\s+access)\b/i,
    weight: 0.35,
  },
  // Asking to bypass safety
  {
    name: 'safety_bypass',
    pattern: /\b(?:bypass|disable|turn\s+off|deactivate|remove)\s+(?:(?:all|your|my|the|any)\s+)*(?:\w+\s+)*?(?:safety|security|filters?|guards?|restrictions?|limits?|constraints?|moderation|limitations?)\b/i,
    weight: 0.45,
  },
  // Nested prompt injection (message within a message)
  {
    name: 'nested_injection',
    pattern: /\b(?:the\s+(?:real|actual|true|hidden)\s+(?:instruction|prompt|message)\s+is|IMPORTANT:\s*(?:ignore|disregard))\b/i,
    weight: 0.40,
  },
];

// ─── System Prompt Fragment Detection ─────────────────────────────────────

const SYSTEM_PROMPT_MARKERS: RegExp[] = [
  /\bYou\s+are\s+a\s+helpful\s+(?:AI\s+)?assistant\b/i,
  /\bSystem\s+prompt\s*:/i,
  /\bINSTRUCTION(?:S)?\s*:/i,
  /<\|?system\|?>/i,
  /\bAs\s+an\s+AI\s+language\s+model\b/i,
  /\bYour\s+role\s+is\s+to\b/i,
  /\bYou\s+must\s+always\b/i,
  /\bCore\s+directives?\s*:/i,
  /\bSOUL\.md\b/i,
  /\bAGENTS\.md\b/i,
];

// ─── Control Character / Unicode Patterns ─────────────────────────────────

/** Control characters that should be stripped (except \n, \r, \t). */
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Zero-width and directional override characters used for evasion. */
const DANGEROUS_UNICODE = /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/g;

// ─── HTML / XSS Sanitization ──────────────────────────────────────────────

/** Map of characters that must be escaped in HTML context. */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const HTML_ESCAPE_RE = /[&<>"']/g;

/**
 * Escape HTML special characters so that the string is safe to embed
 * inside innerHTML, attribute values, etc.
 */
export function escapeHtml(text: string): string {
  return text.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Strip all HTML/XML tags from the string, returning only text content.
 * Handles self-closing tags, attributes with quotes, and nested angle brackets.
 */
export function stripHtmlTags(text: string): string {
  // Remove HTML comments first
  let result = text.replace(/<!--[\s\S]*?-->/g, '');
  // Remove all tags (including self-closing, with attributes)
  result = result.replace(/<\/?[a-zA-Z][^>]*\/?>/g, '');
  // Clean up any remaining orphaned closing angle brackets
  return result;
}

/**
 * Detect potentially dangerous HTML content in a string.
 * Returns matched dangerous patterns for audit trail.
 */
export function detectHtmlXss(text: string): { dangerous: boolean; patterns: string[] } {
  const patterns: string[] = [];

  const XSS_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
    { name: 'script_tag', pattern: /<script[\s>]/i },
    { name: 'event_handler', pattern: /\bon\w+\s*=/i },
    { name: 'javascript_uri', pattern: /javascript\s*:/i },
    { name: 'data_uri_html', pattern: /data\s*:\s*text\/html/i },
    { name: 'vbscript_uri', pattern: /vbscript\s*:/i },
    { name: 'iframe_tag', pattern: /<iframe[\s>]/i },
    { name: 'object_tag', pattern: /<object[\s>]/i },
    { name: 'embed_tag', pattern: /<embed[\s>]/i },
    { name: 'svg_script', pattern: /<svg[\s\S]*?on\w+\s*=/i },
    { name: 'img_onerror', pattern: /<img[^>]*onerror/i },
    { name: 'body_onload', pattern: /<body[^>]*onload/i },
    { name: 'meta_refresh', pattern: /<meta[^>]*http-equiv\s*=\s*['"]?refresh/i },
    { name: 'base_tag', pattern: /<base[\s>]/i },
    { name: 'form_action', pattern: /<form[^>]*action/i },
    { name: 'expression_css', pattern: /expression\s*\(/i },
    { name: 'import_css', pattern: /@import\s/i },
  ];

  for (const { name, pattern } of XSS_PATTERNS) {
    if (pattern.test(text)) {
      patterns.push(name);
    }
  }

  return { dangerous: patterns.length > 0, patterns };
}

// ─── Core Functions ───────────────────────────────────────────────────────

/**
 * Validate the structure of a message before processing.
 */
export function validateMessageStructure(msg: Partial<MessageStructure>): StructureValidationResult {
  const errors: string[] = [];

  if (!msg.from || typeof msg.from !== 'string') {
    errors.push('"from" is required and must be a string.');
  } else if (!VALID_AGENT_IDS.has(msg.from)) {
    errors.push(`Unknown sender agent: "${msg.from}". Valid: ${[...VALID_AGENT_IDS].join(', ')}`);
  }

  if (!msg.to) {
    errors.push('"to" is required.');
  } else {
    const targets = Array.isArray(msg.to) ? msg.to : [msg.to];
    for (const t of targets) {
      if (typeof t !== 'string') {
        errors.push(`"to" entries must be strings, got ${typeof t}.`);
      } else if (!VALID_AGENT_IDS.has(t)) {
        errors.push(`Unknown recipient agent: "${t}". Valid: ${[...VALID_AGENT_IDS].join(', ')}`);
      }
    }
  }

  if (msg.content === undefined || msg.content === null) {
    errors.push('"content" is required.');
  } else if (typeof msg.content !== 'string') {
    errors.push('"content" must be a string.');
  } else if (msg.content.trim().length === 0) {
    errors.push('"content" must not be empty.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute a prompt injection score for the given text.
 * Returns a value between 0 (clean) and 1 (definite injection).
 */
export function computeInjectionScore(
  text: string,
  customPatterns: Array<{ pattern: RegExp; weight: number; name?: string }> = []
): { score: number; matches: string[] } {
  let totalWeight = 0;
  const matches: string[] = [];

  for (const { name, pattern, weight } of INJECTION_PATTERNS) {
    // Reset lastIndex for global regex
    if (pattern.global) pattern.lastIndex = 0;
    if (pattern.test(text)) {
      totalWeight += weight;
      matches.push(name);
    }
  }

  for (const cp of customPatterns) {
    if (cp.pattern.global) cp.pattern.lastIndex = 0;
    if (cp.pattern.test(text)) {
      totalWeight += cp.weight;
      matches.push(cp.name ?? 'custom');
    }
  }

  return {
    score: Math.min(1, totalWeight),
    matches,
  };
}

/**
 * Redact secrets from text.
 */
export function redactSecrets(
  text: string,
  customPatterns: RegExp[] = []
): { text: string; redactions: Redaction[] } {
  let result = text;
  const redactions: Redaction[] = [];

  for (const { name, pattern, replacement } of SECRET_PATTERNS) {
    // Reset lastIndex for global regex
    if (pattern.global) pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    // Work on a copy of the regex to avoid mutation issues
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(text)) !== null) {
      redactions.push({
        type: 'secret',
        offset: match.index,
        length: match[0].length,
        replacement,
        reason: `Secret pattern matched: ${name}`,
      });
    }
    result = result.replace(pattern, replacement);
  }

  // Apply custom patterns
  for (const pattern of customPatterns) {
    if (pattern.global) pattern.lastIndex = 0;
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      redactions.push({
        type: 'secret',
        offset: match.index,
        length: match[0].length,
        replacement: '[REDACTED]',
        reason: 'Custom secret pattern matched',
      });
    }
    result = result.replace(pattern, '[REDACTED]');
  }

  return { text: result, redactions };
}

/**
 * Redact filesystem paths from text.
 */
export function redactPaths(text: string): { text: string; redactions: Redaction[] } {
  let result = text;
  const redactions: Redaction[] = [];

  for (const { name, pattern, replacement } of PATH_PATTERNS) {
    if (pattern.global) pattern.lastIndex = 0;
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      redactions.push({
        type: 'path',
        offset: match.index,
        length: match[0].length,
        replacement,
        reason: `Path pattern matched: ${name}`,
      });
    }
    result = result.replace(pattern, replacement);
  }

  return { text: result, redactions };
}

/**
 * Detect and redact system prompt fragments from text.
 */
export function redactSystemPromptFragments(text: string): { text: string; redactions: Redaction[] } {
  let result = text;
  const redactions: Redaction[] = [];

  for (const marker of SYSTEM_PROMPT_MARKERS) {
    const re = new RegExp(marker.source, marker.flags);
    const match = re.exec(text);
    if (match) {
      redactions.push({
        type: 'system_prompt',
        offset: match.index,
        length: match[0].length,
        replacement: '[REDACTED_SYSTEM_FRAGMENT]',
        reason: 'System prompt fragment detected',
      });
      result = result.replace(marker, '[REDACTED_SYSTEM_FRAGMENT]');
    }
  }

  return { text: result, redactions };
}

/**
 * Strip control characters and dangerous unicode.
 */
export function sanitizeControlChars(text: string, normalizeUnicode: boolean): { text: string; redactions: Redaction[] } {
  const redactions: Redaction[] = [];

  let match: RegExpExecArray | null;
  const controlRe = new RegExp(CONTROL_CHAR_PATTERN.source, 'g');
  while ((match = controlRe.exec(text)) !== null) {
    redactions.push({
      type: 'control_char',
      offset: match.index,
      length: 1,
      replacement: '',
      reason: `Control character U+${match[0].charCodeAt(0).toString(16).padStart(4, '0')}`,
    });
  }

  let result = text.replace(CONTROL_CHAR_PATTERN, '');

  if (normalizeUnicode) {
    const unicodeRe = new RegExp(DANGEROUS_UNICODE.source, 'g');
    while ((match = unicodeRe.exec(result)) !== null) {
      redactions.push({
        type: 'control_char',
        offset: match.index,
        length: 1,
        replacement: '',
        reason: `Dangerous unicode U+${match[0].charCodeAt(0).toString(16).padStart(4, '0')}`,
      });
    }
    result = result.replace(DANGEROUS_UNICODE, '');
  }

  return { text: result, redactions };
}

/**
 * Enforce safe markdown / code block limits.
 * Closes unclosed code blocks and limits nesting.
 */
export function sanitizeMarkdown(text: string, config: Pick<SanitizerConfig, 'maxCodeBlocks' | 'maxMarkdownDepth'>): string {
  let result = text;

  // Count and limit code blocks
  const codeBlockPattern = /```/g;
  const matches = text.match(codeBlockPattern);
  const codeBlockCount = matches ? Math.floor(matches.length / 2) : 0;

  if (codeBlockCount > config.maxCodeBlocks) {
    // Truncate excess code blocks by removing content after the limit
    let count = 0;
    let lastIdx = 0;
    const re = /```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(result)) !== null) {
      count++;
      if (count > config.maxCodeBlocks * 2) {
        result = result.slice(0, m.index) + '\n[Code blocks truncated - limit exceeded]';
        break;
      }
      lastIdx = m.index;
    }
  }

  // Ensure code blocks are properly closed
  const openBlocks = (result.match(/```/g) || []).length;
  if (openBlocks % 2 !== 0) {
    result += '\n```';
  }

  // Limit heading depth
  result = result.replace(/^(#{7,})\s/gm, '###### ');

  return result;
}

/**
 * Truncate message if exceeds max length.
 */
export function truncateMessage(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, maxLength - 50) + '\n\n[Message truncated — exceeded max length]',
    truncated: true,
  };
}

// ─── Main Sanitization Pipeline ───────────────────────────────────────────

/**
 * Sanitize an inter-agent message.
 *
 * Pipeline:
 * 1. Strip control characters and dangerous unicode
 * 2. Redact system prompt fragments
 * 3. Redact secrets (API keys, tokens, passwords, connection strings)
 * 4. Redact filesystem paths (optional)
 * 5. Compute prompt injection score
 * 6. Sanitize markdown (close code blocks, limit depth)
 * 7. Enforce message length limit
 *
 * All redactions are recorded for audit.
 */
export function sanitizeMessage(
  content: string,
  config: Partial<SanitizerConfig> = {}
): SanitizedMessage {
  const cfg: SanitizerConfig = { ...DEFAULT_CONFIG, ...config };
  const originalLength = content.length;
  const allRedactions: Redaction[] = [];
  let text = content;

  // 1. Strip control characters
  if (cfg.stripControlChars) {
    const ctrl = sanitizeControlChars(text, cfg.normalizeUnicode);
    text = ctrl.text;
    allRedactions.push(...ctrl.redactions);
  }

  // 1.5. Escape HTML to prevent XSS when rendered in browser
  if (cfg.escapeHtmlContent) {
    const xssCheck = detectHtmlXss(text);
    if (xssCheck.dangerous) {
      for (const pattern of xssCheck.patterns) {
        allRedactions.push({
          type: 'injection',
          offset: 0,
          length: 0,
          replacement: '[HTML escaped]',
          reason: `Dangerous HTML pattern detected: ${pattern}`,
        });
      }
    }
    const escaped = escapeHtml(text);
    if (escaped !== text) {
      text = escaped;
    }
  }

  // 2. Redact system prompt fragments
  const sysprompt = redactSystemPromptFragments(text);
  text = sysprompt.text;
  allRedactions.push(...sysprompt.redactions);

  // 3. Redact secrets
  const secrets = redactSecrets(text, cfg.customSecretPatterns);
  text = secrets.text;
  allRedactions.push(...secrets.redactions);

  // 4. Redact paths (optional)
  if (cfg.redactPaths) {
    const paths = redactPaths(text);
    text = paths.text;
    allRedactions.push(...paths.redactions);
  }

  // 5. Compute injection score
  const injection = computeInjectionScore(text, cfg.customInjectionPatterns);

  // 6. Sanitize markdown
  text = sanitizeMarkdown(text, cfg);

  // 7. Enforce length limit
  const truncResult = truncateMessage(text, cfg.maxLength);
  text = truncResult.text;
  if (truncResult.truncated) {
    allRedactions.push({
      type: 'length',
      offset: cfg.maxLength - 50,
      length: originalLength - (cfg.maxLength - 50),
      replacement: '[Message truncated — exceeded max length]',
      reason: `Message exceeded max length of ${cfg.maxLength}`,
    });
  }

  return {
    content: text,
    modified: text !== content,
    metadata: {
      originalLength,
      sanitizedLength: text.length,
      redactions: allRedactions,
      injectionScore: injection.score,
      truncated: truncResult.truncated,
    },
  };
}

/**
 * Sanitize an agent message for inter-agent communication.
 * Convenience wrapper that validates structure + sanitizes content.
 */
export function sanitizeAgentMessage(
  fromAgent: string,
  toAgent: string | string[],
  content: string,
  config: Partial<SanitizerConfig> = {}
): SanitizedMessage & { structureValid: boolean; structureErrors: string[] } {
  const structureResult = validateMessageStructure({ from: fromAgent, to: toAgent, content });
  const sanitized = sanitizeMessage(content, config);

  return {
    ...sanitized,
    structureValid: structureResult.valid,
    structureErrors: structureResult.errors,
  };
}

/**
 * Sanitize output before delivery to external channels (Discord, etc.).
 * More aggressive: also strips mentions, embeds, and webhook-triggering content.
 */
export function sanitizeForExternalChannel(
  content: string,
  channel: 'discord' | 'slack' | 'generic' = 'generic',
  config: Partial<SanitizerConfig> = {}
): SanitizedMessage {
  // Run the standard pipeline WITHOUT HTML escaping first,
  // so channel-specific replacements can match raw content.
  const sanitized = sanitizeMessage(content, { ...config, escapeHtmlContent: false });
  let text = sanitized.content;
  const extraRedactions: Redaction[] = [];

  if (channel === 'discord' || channel === 'generic') {
    // Strip @everyone and @here to prevent mass pings
    const everyonePattern = /@(?:everyone|here)\b/g;
    let m: RegExpExecArray | null;
    const re = new RegExp(everyonePattern.source, 'g');
    while ((m = re.exec(text)) !== null) {
      extraRedactions.push({
        type: 'injection',
        offset: m.index,
        length: m[0].length,
        replacement: '[mention]',
        reason: 'Mass mention stripped for external channel safety',
      });
    }
    text = text.replace(everyonePattern, '[mention]');

    // Strip role pings <@&id>
    text = text.replace(/<@&\d+>/g, '[role-mention]');

    // Limit embed-like content
    // Discord auto-embeds URLs, wrap in <> to suppress
    text = text.replace(/((?:^|\s))(https?:\/\/\S+)/g, '$1<$2>');
  }

  if (channel === 'slack') {
    // Strip Slack-specific injection patterns
    text = text.replace(/<!(?:everyone|here|channel)>/g, '[mention]');
  }

  // HTML escaping:
  // - For Discord/Slack delivery, we generally want to preserve literal `<...>` wrappers
  //   (e.g. `<https://...>` to suppress embeds) and other non-dangerous angle brackets.
  // - If we detect dangerous HTML/XSS patterns (e.g. <script>, onerror=), we MUST escape.
  // - Callers can also force escaping via `config.escapeHtmlContent: true`.
  const xssCheck = detectHtmlXss(text);
  if (xssCheck.dangerous) {
    for (const pattern of xssCheck.patterns) {
      extraRedactions.push({
        type: 'injection',
        offset: 0,
        length: 0,
        replacement: '[HTML escaped]',
        reason: `Dangerous HTML pattern detected: ${pattern}`,
      });
    }
  }

  const shouldEscapeHtml = config.escapeHtmlContent === true || xssCheck.dangerous;
  if (shouldEscapeHtml) {
    text = escapeHtml(text);
  }

  return {
    content: text,
    modified: sanitized.modified || extraRedactions.length > 0,
    metadata: {
      ...sanitized.metadata,
      redactions: [...sanitized.metadata.redactions, ...extraRedactions],
      sanitizedLength: text.length,
    },
  };
}

// ─── Exports for testing ──────────────────────────────────────────────────

export const _testing = {
  SECRET_PATTERNS,
  PATH_PATTERNS,
  INJECTION_PATTERNS,
  SYSTEM_PROMPT_MARKERS,
  VALID_AGENT_IDS,
  DEFAULT_CONFIG,
  HTML_ESCAPE_MAP,
};
