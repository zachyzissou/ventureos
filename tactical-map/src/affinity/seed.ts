import type { AgentId } from '@/config';

export type BondSeed = {
  a: AgentId;
  b: AgentId;
  /** 0..1 affinity strength */
  affinity: number;
};

/**
 * Phase 5.3 seed data: fully-connected 8-agent Affinity Network (C(8,2)=28).
 * Source of truth: ~/clawd/scripts/seed-affinity-network.sh
 */
export const AFFINITY_SEED_BONDS: BondSeed[] = [
  { a: 'venture_memory', b: 'venture_infrastructure', affinity: 0.8 },
  { a: 'venture_memory', b: 'venture_strategy', affinity: 0.75 },
  { a: 'venture_memory', b: 'venture_control', affinity: 0.75 },
  { a: 'venture_memory', b: 'venture_research', affinity: 0.8 },
  { a: 'venture_memory', b: 'venture_security', affinity: 0.8 },
  { a: 'venture_memory', b: 'venture_delivery', affinity: 0.65 },
  { a: 'venture_memory', b: 'venture_evidence', affinity: 0.8 },

  { a: 'venture_infrastructure', b: 'venture_strategy', affinity: 0.7 },
  { a: 'venture_infrastructure', b: 'venture_control', affinity: 0.7 },
  { a: 'venture_infrastructure', b: 'venture_research', affinity: 0.7 },
  { a: 'venture_infrastructure', b: 'venture_security', affinity: 0.7 },
  { a: 'venture_infrastructure', b: 'venture_delivery', affinity: 0.55 },
  { a: 'venture_infrastructure', b: 'venture_evidence', affinity: 0.75 },

  { a: 'venture_strategy', b: 'venture_control', affinity: 0.85 },
  { a: 'venture_strategy', b: 'venture_research', affinity: 0.8 },
  { a: 'venture_strategy', b: 'venture_security', affinity: 0.75 },
  { a: 'venture_strategy', b: 'venture_delivery', affinity: 0.65 },
  { a: 'venture_strategy', b: 'venture_evidence', affinity: 0.75 },

  { a: 'venture_control', b: 'venture_research', affinity: 0.8 },
  { a: 'venture_control', b: 'venture_security', affinity: 0.75 },
  { a: 'venture_control', b: 'venture_delivery', affinity: 0.65 },
  { a: 'venture_control', b: 'venture_evidence', affinity: 0.75 },

  { a: 'venture_research', b: 'venture_security', affinity: 0.65 },
  { a: 'venture_research', b: 'venture_delivery', affinity: 0.6 },
  { a: 'venture_research', b: 'venture_evidence', affinity: 0.8 },

  { a: 'venture_security', b: 'venture_delivery', affinity: 0.4 },
  { a: 'venture_security', b: 'venture_evidence', affinity: 0.85 },

  { a: 'venture_delivery', b: 'venture_evidence', affinity: 0.65 }
];
