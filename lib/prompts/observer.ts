/**
 * Observer Prompt Template — VentureOS Observational Memory (Phase 2)
 *
 * Structured prompts for the Observer Agent LLM call.
 * The system prompt is static (cache-friendly); only the user
 * content varies per batch.
 *
 * Issue #231 — Phase 2 of #218: Observer Agent
 */

// ─── System Prompt (Static — prompt-cache friendly) ─────────────────────────

export const OBSERVER_SYSTEM_PROMPT = `You are an observation compression engine. Your job is to distill raw conversation messages into discrete, high-quality observations.

## Rules

1. **Compress, don't copy.** Each observation should capture ONE distinct fact, decision, preference, commitment, or action. Remove redundancy.
2. **Assign priority:**
   - 🔴 high — Actionable commitments, deadlines, decisions, blockers, critical facts
   - 🟡 medium — User preferences, notable context, important background, recurring themes
   - 🟢 info — General context, minor details worth noting but low urgency
3. **Extract temporal references.** When a message refers to a specific date, deadline, or time-bound event, extract it as \`referenced_date\` in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ). Use null if no temporal reference.
4. **Track source messages.** List the message IDs that contributed to each observation in \`source_message_ids\`.
5. **Preserve specifics.** Keep proper nouns, numbers, URLs, version numbers, code identifiers, and exact commitments.
6. **Drop noise.** Omit pleasantries, filler, repeated greetings, acknowledgments that add no information.
7. **Be concise.** Each observation content should be 1-3 sentences max.
8. **Target 5-15 observations** per batch of 30+ messages. Fewer is fine if messages are low-signal.

## Output Format

Respond with ONLY a JSON array. No markdown fences, no explanation.

[
  {
    "content": "User decided to use PostgreSQL instead of MongoDB for the analytics service.",
    "priority": "high",
    "referenced_date": "2026-02-15",
    "source_message_ids": ["msg_abc123", "msg_def456"]
  }
]`;

// ─── User Prompt Builder ────────────────────────────────────────────────────

export interface ObserverMessageInput {
  /** Message ID for source tracking. */
  messageId: string;
  /** Who sent the message. */
  from: string;
  /** Message content. */
  content: string;
  /** ISO timestamp. */
  createdAt: string;
}

/**
 * Build the user prompt from a batch of raw messages.
 * Only the message content varies — the system prompt is static
 * for maximum prompt-cache reuse.
 */
export function buildObserverUserPrompt(
  messages: ObserverMessageInput[],
  currentDate: string,
): string {
  const lines: string[] = [];
  lines.push(`Current date: ${currentDate}`);
  lines.push(`Message count: ${messages.length}`);
  lines.push('');
  lines.push('--- BEGIN MESSAGES ---');

  for (const msg of messages) {
    lines.push(`[${msg.messageId}] ${msg.createdAt} | ${msg.from}: ${msg.content}`);
  }

  lines.push('--- END MESSAGES ---');

  return lines.join('\n');
}

export default { OBSERVER_SYSTEM_PROMPT, buildObserverUserPrompt };
