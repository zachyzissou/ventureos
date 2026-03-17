/**
 * VentureOS Agent Identity Helpers
 *
 * Canonical capability identifiers live here so shared libs can default to
 * VentureOS-native IDs while still accepting legacy aliases where compatibility
 * is required.
 */

export const CANONICAL_CAPABILITY_IDS = [
  'venture_research',
  'venture_infrastructure',
  'venture_security',
  'venture_evidence',
  'venture_memory',
  'venture_delivery',
  'venture_strategy',
  'venture_control',
  'venture_signals',
  'venture_comms',
] as const;

export type CanonicalCapabilityId = (typeof CANONICAL_CAPABILITY_IDS)[number];

export const MISSION_CAPABILITY_IDS = [
  'venture_research',
  'venture_infrastructure',
  'venture_security',
  'venture_evidence',
  'venture_memory',
  'venture_delivery',
] as const;

export type MissionCapabilityId = (typeof MISSION_CAPABILITY_IDS)[number];

export const LEGACY_CAPABILITY_ALIASES: Record<string, CanonicalCapabilityId> = {
  oracle: 'venture_research',
  atlas: 'venture_infrastructure',
  sentinel: 'venture_security',
  verifier: 'venture_evidence',
  archivist: 'venture_memory',
  synth: 'venture_delivery',
  echo: 'venture_strategy',
  nexus: 'venture_control',
  scout: 'venture_signals',
  liaison: 'venture_comms',
};

export const CANONICAL_TO_LEGACY_CAPABILITY_IDS: Record<CanonicalCapabilityId, string> = {
  venture_research: 'oracle',
  venture_infrastructure: 'atlas',
  venture_security: 'sentinel',
  venture_evidence: 'verifier',
  venture_memory: 'archivist',
  venture_delivery: 'synth',
  venture_strategy: 'echo',
  venture_control: 'nexus',
  venture_signals: 'scout',
  venture_comms: 'liaison',
};

export const AGENT_DISPLAY_NAMES: Record<CanonicalCapabilityId, string> = {
  venture_research: 'Venture Research',
  venture_infrastructure: 'Venture Infrastructure',
  venture_security: 'Venture Security',
  venture_evidence: 'Venture Evidence',
  venture_memory: 'Venture Memory',
  venture_delivery: 'Venture Delivery',
  venture_strategy: 'Venture Strategy',
  venture_control: 'Venture Control',
  venture_signals: 'Venture Signals',
  venture_comms: 'Venture Comms',
};

export const AUXILIARY_AGENT_IDS = [
  'curator',
  'user',
  'system',
  'broadcast',
] as const;

export type AuxiliaryAgentId = (typeof AUXILIARY_AGENT_IDS)[number];

export const KNOWN_AGENT_IDS: readonly string[] = [
  ...CANONICAL_CAPABILITY_IDS,
  ...Object.keys(LEGACY_CAPABILITY_ALIASES),
  ...AUXILIARY_AGENT_IDS,
] as const;

export function normalizeCapabilityId(value: string | null | undefined): CanonicalCapabilityId | null {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return null;
  if ((CANONICAL_CAPABILITY_IDS as readonly string[]).includes(trimmed)) {
    return trimmed as CanonicalCapabilityId;
  }
  return LEGACY_CAPABILITY_ALIASES[trimmed] ?? null;
}

export function isKnownAgentId(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if ((AUXILIARY_AGENT_IDS as readonly string[]).includes(trimmed)) {
    return true;
  }
  return normalizeCapabilityId(trimmed) !== null;
}

export function getAgentDisplayName(value: string | null | undefined): string | null {
  const canonical = normalizeCapabilityId(value);
  if (!canonical) return null;
  return AGENT_DISPLAY_NAMES[canonical];
}
