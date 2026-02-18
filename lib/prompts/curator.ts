/**
 * Curator Prompt Template — VentureOS Daily Roundtable (Phase 5)
 *
 * Structured prompts for the Curator Agent LLM synthesis call.
 * The system prompt is static (cache-friendly); only the user content
 * varies per daily run.
 *
 * Issue #245 — Phase 5 of #217: Curator Agent Template + Daily Roundtable
 */

// ─── System Prompt (Static — prompt-cache friendly) ─────────────────────────

export const CURATOR_SYSTEM_PROMPT = `You are a cross-agent synthesis engine. Your job is to read all agent outputs for a given day and produce a concise daily roundtable summary document.

## Rules

1. **Synthesize, don't concatenate.** Merge overlapping work, highlight dependencies, surface conflicts.
2. **Structure the output** using the exact markdown template below. Do not add extra sections.
3. **Extract priorities.** Identify the top 3-5 priorities for the next day based on today's work.
4. **Flag blockers.** If any agent's output mentions blockers, risks, or unresolved issues, surface them prominently.
5. **Be concise.** The entire roundtable document MUST be under 5000 bytes (roughly 4KB of text). Prefer bullet points over paragraphs.
6. **Attribute work.** When referencing work, mention the agent that produced it.
7. **Preserve specifics.** Keep issue numbers, PR numbers, commit SHAs, deadlines, and metric values.
8. **Handle sparse days.** If only one agent produced output, still produce a valid roundtable — just note limited activity.

## Output Template

\`\`\`markdown
# Daily Roundtable — {DATE}

## Summary
{1-3 sentence overview of the day's collective progress}

## Agent Activity
{For each agent that produced output:}
- **{agent-name}**: {1-2 sentence summary of their work}

## Key Decisions & Outcomes
- {Bullet list of important decisions, completions, or milestones}

## Blockers & Risks
- {Bullet list of open blockers, risks, or concerns — or "None identified."}

## Tomorrow's Priorities
1. {Top priority}
2. {Second priority}
3. {Third priority}
\`\`\`

Respond with ONLY the markdown document. No JSON wrapping, no code fences around the whole thing, no preamble.`;

// ─── Priority Extraction Prompt ─────────────────────────────────────────────

export const CURATOR_PRIORITY_SYSTEM_PROMPT = `You are a priority extraction engine. Given a daily roundtable summary, extract an updated priority stack as a markdown document.

## Rules

1. Output a numbered list of 3-7 priorities, ordered by urgency/impact.
2. Each priority should be one clear sentence.
3. Include the source (which agent/roundtable insight) in parentheses.
4. If no clear priorities emerged, output "No priority changes identified."

## Output Format

\`\`\`markdown
# Team Priorities

_Updated: {DATE}_

1. {Priority description} (source: {agent/roundtable})
2. ...
\`\`\`

Respond with ONLY the markdown. No fences, no preamble.`;

// ─── User Prompt Builders ───────────────────────────────────────────────────

export interface CuratorAgentOutput {
  /** Agent identifier (e.g. 'nexus', 'oracle', 'synth'). */
  agentId: string;
  /** Filename of the output. */
  filename: string;
  /** File content (text). */
  content: string;
}

/**
 * Build the user prompt for the daily roundtable synthesis.
 * Only the agent outputs vary — the system prompt is static
 * for maximum prompt-cache reuse.
 */
export function buildCuratorUserPrompt(
  date: string,
  agentOutputs: CuratorAgentOutput[],
): string {
  const lines: string[] = [];
  lines.push(`Date: ${date}`);
  lines.push(`Agent count: ${agentOutputs.length}`);
  lines.push('');

  for (const output of agentOutputs) {
    lines.push(`--- BEGIN ${output.agentId.toUpperCase()} OUTPUT (${output.filename}) ---`);
    lines.push(output.content);
    lines.push(`--- END ${output.agentId.toUpperCase()} OUTPUT ---`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the user prompt for priority extraction from a roundtable.
 */
export function buildCuratorPriorityPrompt(
  date: string,
  roundtableContent: string,
): string {
  return `Date: ${date}\n\n--- ROUNDTABLE ---\n${roundtableContent}\n--- END ROUNDTABLE ---`;
}

export default {
  CURATOR_SYSTEM_PROMPT,
  CURATOR_PRIORITY_SYSTEM_PROMPT,
  buildCuratorUserPrompt,
  buildCuratorPriorityPrompt,
};
