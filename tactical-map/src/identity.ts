export const CANONICAL_AGENT_ORDER = [
  'venture_research',
  'venture_infrastructure',
  'venture_security',
  'venture_evidence',
  'venture_memory',
  'venture_delivery',
  'venture_strategy',
  'venture_control',
] as const;

export type AgentId = (typeof CANONICAL_AGENT_ORDER)[number];

export const CONTROL_HUB_AGENT_ID: AgentId = 'venture_control';

export const LEGACY_AGENT_ID_ALIASES: Record<string, AgentId> = {
  oracle: 'venture_research',
  atlas: 'venture_infrastructure',
  sentinel: 'venture_security',
  verifier: 'venture_evidence',
  archivist: 'venture_memory',
  synth: 'venture_delivery',
  echo: 'venture_strategy',
  nexus: 'venture_control',
};

export const CANONICAL_TO_LEGACY_AGENT_IDS: Record<AgentId, string> = {
  venture_research: 'oracle',
  venture_infrastructure: 'atlas',
  venture_security: 'sentinel',
  venture_evidence: 'verifier',
  venture_memory: 'archivist',
  venture_delivery: 'synth',
  venture_strategy: 'echo',
  venture_control: 'nexus',
};

export const AGENT_DISPLAY_NAMES: Record<AgentId, string> = {
  venture_research: 'Venture Research',
  venture_infrastructure: 'Venture Infrastructure',
  venture_security: 'Venture Security',
  venture_evidence: 'Venture Evidence',
  venture_memory: 'Venture Memory',
  venture_delivery: 'Venture Delivery',
  venture_strategy: 'Venture Strategy',
  venture_control: 'Venture Control',
};

export const RING_AGENT_ORDER = CANONICAL_AGENT_ORDER.filter((id) => id !== CONTROL_HUB_AGENT_ID) as AgentId[];

export function normalizeAgentId(value: string | null | undefined): AgentId | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if ((CANONICAL_AGENT_ORDER as readonly string[]).includes(lower)) {
    return lower as AgentId;
  }
  return LEGACY_AGENT_ID_ALIASES[lower] ?? null;
}

export function toLegacyAgentId(value: AgentId | string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? normalizeAgentId(value) : value;
  if (!normalized) return null;
  return CANONICAL_TO_LEGACY_AGENT_IDS[normalized];
}

export function getAgentDisplayName(agentId: AgentId): string {
  return AGENT_DISPLAY_NAMES[agentId];
}
