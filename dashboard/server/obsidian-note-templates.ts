export type ObsidianNoteTemplateKind =
  | 'mission'
  | 'pr-review'
  | 'decision-log'
  | 'blocker-log';

export interface ObsidianTemplateFrontmatter {
  missionId: string;
  prNumber: number | null;
  status: string;
  owner: string;
  updatedAt: string;
}

export interface ObsidianStructuredSections {
  decisions: string[];
  risks: string[];
  nextActions: string[];
}

interface ObsidianTemplateContext {
  title?: string;
  summary?: string;
}

function yamlScalar(value: string | number | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (/^[a-zA-Z0-9_.:/-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function renderList(items: string[], fallback: string): string[] {
  if (!items.length) return [`- ${fallback}`];
  return items.map((item) => `- ${normalizeLine(item) || fallback}`);
}

export function isObsidianTemplateKind(value: string): value is ObsidianNoteTemplateKind {
  return value === 'mission'
    || value === 'pr-review'
    || value === 'decision-log'
    || value === 'blocker-log';
}

export function renderObsidianTemplateNote(
  kind: ObsidianNoteTemplateKind,
  frontmatter: ObsidianTemplateFrontmatter,
  context: ObsidianTemplateContext = {},
): string {
  const missionId = normalizeLine(frontmatter.missionId) || 'mission-unknown';
  const owner = normalizeLine(frontmatter.owner) || 'nexus';
  const status = normalizeLine(frontmatter.status) || 'open';
  const updatedAt = normalizeLine(frontmatter.updatedAt) || new Date().toISOString();
  const title = normalizeLine(context.title || '') || missionId;
  const summary = context.summary?.trim() || '_Pending mission context._';

  const head = [
    '---',
    `missionId: ${yamlScalar(missionId)}`,
    `prNumber: ${yamlScalar(frontmatter.prNumber)}`,
    `status: ${yamlScalar(status)}`,
    `owner: ${yamlScalar(owner)}`,
    `updatedAt: ${yamlScalar(updatedAt)}`,
    '---',
    '',
  ];

  if (kind === 'pr-review') {
    return [
      ...head,
      `# PR Review: ${title}`,
      '',
      '## Summary',
      summary,
      '',
      '## Decisions',
      '- _Pending decision_',
      '',
      '## Risks',
      '- _No risks logged_',
      '',
      '## Next Actions',
      '- _Assign reviewer and follow-up date_',
      '',
    ].join('\n');
  }

  if (kind === 'decision-log') {
    return [
      ...head,
      `# Decision Log: ${title}`,
      '',
      '## Decision',
      summary,
      '',
      '## Risks',
      '- _No risks logged_',
      '',
      '## Next Actions',
      '- _Track adoption + outcomes_',
      '',
    ].join('\n');
  }

  if (kind === 'blocker-log') {
    return [
      ...head,
      `# Blocker Log: ${title}`,
      '',
      '## Blocker',
      summary,
      '',
      '## Risks',
      '- _Impact not yet assessed_',
      '',
      '## Next Actions',
      '- _Escalate owner + unblock path_',
      '',
    ].join('\n');
  }

  return [
    ...head,
    `# Mission: ${title}`,
    '',
    '## Overview',
    summary,
    '',
    '## Decisions',
    '- _No decisions logged_',
    '',
    '## Risks',
    '- _No risks logged_',
    '',
    '## Next Actions',
    '- _Add immediate next action_',
    '',
  ].join('\n');
}

export function renderObsidianStructuredAppend(
  sections: ObsidianStructuredSections,
  updatedAtIso: string,
): string {
  const stamp = normalizeLine(updatedAtIso) || new Date().toISOString();
  const decisions = sections.decisions.map(normalizeLine).filter(Boolean);
  const risks = sections.risks.map(normalizeLine).filter(Boolean);
  const nextActions = sections.nextActions.map(normalizeLine).filter(Boolean);

  return [
    `## Update (${stamp})`,
    '',
    '### Decisions',
    ...renderList(decisions, '_No decision update_'),
    '',
    '### Risks',
    ...renderList(risks, '_No risk update_'),
    '',
    '### Next Actions',
    ...renderList(nextActions, '_No next-action update_'),
    '',
  ].join('\n');
}
