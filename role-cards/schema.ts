/**
 * Role Card Schema — VentureOS Agent Identity System
 *
 * Structured role cards define operating scope, handoff contracts,
 * escalation policy, and behavioral constraints for each agent.
 */

export type OperatingStyle = 'strategic' | 'control' | 'delivery' | 'security';

export interface OperatingChannel {
  type: 'task' | 'query' | 'event' | 'artifact';
  format: string;
  description: string;
}

export interface Metric {
  name: string;
  measurement: string;
  target: string;
}

export interface AgentRoleCard {
  id: string;
  name: string;
  title: string;
  glyph: string;
  operatingStyle: OperatingStyle;

  domainScope: {
    domain: string;
    jurisdiction: string[];
    boundaries: string[];
  };

  operatingChannels: {
    inputs: OperatingChannel[];
    outputs: OperatingChannel[];
  };

  completionContract: {
    conditions: string[];
    qualityGate: string;
    handoffFormat: string;
  };

  hardBoundaries: {
    hardBans: string[];
    failureModes: string[];
    rationale: string[];
  };

  escalationPolicy: {
    escalateTo: string[];
    escalateTriggers: string[];
    timeout: string;
    fallback: string;
  };

  performanceMetrics: {
    metrics: Metric[];
    healthCheck: string;
    sla: string;
  };

  voiceProfile: {
    voice: string;
    personality: string[];
    conflictPattern: string;
    catchphrase?: string;
  };

  affinityMap: Record<string, number>;
  toolAccess: string[];
  stateModel: {
    persists: string[];
    volatiles: string[];
  };
}

export function validateCard(card: AgentRoleCard): AgentRoleCard {
  for (const [agent, score] of Object.entries(card.affinityMap)) {
    if (score < 0.1 || score > 0.95) {
      throw new Error(`${card.id}: Affinity with ${agent} is ${score}, must be 0.10-0.95`);
    }
  }

  if (card.hardBoundaries.hardBans.length !== card.hardBoundaries.rationale.length) {
    throw new Error(
      `${card.id}: hardBans count (${card.hardBoundaries.hardBans.length}) != rationale count (${card.hardBoundaries.rationale.length})`
    );
  }

  if (card.id in card.affinityMap) {
    throw new Error(`${card.id}: Cannot have affinity with self`);
  }

  return card;
}

function ensureSentencePeriod(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function stripLeadingImperativeNegation(s: string): string {
  const match = s.match(/^(?:do\s+not|don't|dont)\b[,:]?\s*(.*)$/i);
  if (!match) return s;

  const rest = (match[1] ?? '').trim();
  if (!rest || !/[\p{L}\p{N}]/u.test(rest)) return s;
  return rest;
}

function formatNeverRule(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  if (/^never\b/i.test(trimmed)) {
    return ensureSentencePeriod(trimmed.replace(/^never\b/i, 'Never'));
  }

  return ensureSentencePeriod(`Never ${stripLeadingImperativeNegation(trimmed)}`);
}

function formatOperatingChannel(channel: OperatingChannel): string {
  return `- **${channel.type}** (_${channel.format}_): ${channel.description}`;
}

function formatMetric(metric: Metric): string {
  return `- **${metric.name}:** ${metric.measurement} (target: ${metric.target})`;
}

export function generateSoulMd(card: AgentRoleCard): string {
  const sections: string[] = [];

  sections.push(`# SOUL.md — ${card.name} (${card.title})`);
  sections.push('');

  sections.push('## Identity');
  sections.push(`${card.glyph} **${card.name}** — ${card.title} (${card.operatingStyle} operating style).`);
  sections.push(`> ${card.domainScope.domain}`);
  sections.push('');

  sections.push('## Jurisdiction');
  card.domainScope.jurisdiction.forEach((item) => sections.push(`- ${item}`));
  sections.push('');

  sections.push('## NOT My Domain');
  card.domainScope.boundaries.forEach((item) => sections.push(`- ${item}`));
  sections.push('');

  sections.push('## How I Work');
  sections.push('### Inputs I Accept');
  card.operatingChannels.inputs.forEach((item) => sections.push(formatOperatingChannel(item)));
  sections.push('');

  sections.push('### What I Produce');
  card.operatingChannels.outputs.forEach((item) => sections.push(formatOperatingChannel(item)));
  sections.push('');

  sections.push('### When I\'m Done');
  card.completionContract.conditions.forEach((item) => sections.push(`- ${item}`));
  sections.push('');
  sections.push(`**Quality Gate:** ${card.completionContract.qualityGate}`);
  sections.push(`**Handoff Format:** ${card.completionContract.handoffFormat}`);
  sections.push('');

  sections.push('## Voice');
  sections.push(card.voiceProfile.voice);
  sections.push('');

  sections.push('### Personality');
  card.voiceProfile.personality.forEach((item) => sections.push(`- ${item}`));
  sections.push('');

  sections.push('### Conflict Pattern');
  sections.push(card.voiceProfile.conflictPattern);
  if (card.voiceProfile.catchphrase) {
    sections.push('');
    sections.push(`> *"${card.voiceProfile.catchphrase}"*`);
  }
  sections.push('');

  sections.push('## Non-Negotiables');
  card.hardBoundaries.hardBans
    .map(formatNeverRule)
    .filter(Boolean)
    .forEach((item) => sections.push(`- ${item}`));
  sections.push('');

  sections.push('## When to Escalate');
  sections.push(`**Escalate to:** ${card.escalationPolicy.escalateTo.join(', ')}`);
  card.escalationPolicy.escalateTriggers.forEach((item) => sections.push(`- ${item}`));
  sections.push('');
  sections.push(`**Timeout:** ${card.escalationPolicy.timeout}`);
  sections.push(`**Fallback:** ${card.escalationPolicy.fallback}`);
  sections.push('');

  sections.push('## My Standards');
  sections.push('### Metrics');
  card.performanceMetrics.metrics.forEach((item) => sections.push(formatMetric(item)));
  sections.push('');
  sections.push(`**Health Check:** ${card.performanceMetrics.healthCheck}`);
  sections.push(`**SLA:** ${card.performanceMetrics.sla}`);
  sections.push('');

  sections.push('## Tools I Can Use');
  card.toolAccess.forEach((item) => sections.push(`- ${item}`));
  sections.push('');

  sections.push('## State');
  sections.push('### Persists');
  card.stateModel.persists.forEach((item) => sections.push(`- ${item}`));
  sections.push('');
  sections.push('### Volatiles');
  card.stateModel.volatiles.forEach((item) => sections.push(`- ${item}`));

  return sections.join('\n');
}
