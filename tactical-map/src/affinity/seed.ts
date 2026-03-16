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
  { a: 'archivist', b: 'atlas', affinity: 0.8 },
  { a: 'archivist', b: 'echo', affinity: 0.75 },
  { a: 'archivist', b: 'nexus', affinity: 0.75 },
  { a: 'archivist', b: 'oracle', affinity: 0.8 },
  { a: 'archivist', b: 'sentinel', affinity: 0.8 },
  { a: 'archivist', b: 'synth', affinity: 0.65 },
  { a: 'archivist', b: 'verifier', affinity: 0.8 },

  { a: 'atlas', b: 'echo', affinity: 0.7 },
  { a: 'atlas', b: 'nexus', affinity: 0.7 },
  { a: 'atlas', b: 'oracle', affinity: 0.7 },
  { a: 'atlas', b: 'sentinel', affinity: 0.7 },
  { a: 'atlas', b: 'synth', affinity: 0.55 },
  { a: 'atlas', b: 'verifier', affinity: 0.75 },

  { a: 'echo', b: 'nexus', affinity: 0.85 },
  { a: 'echo', b: 'oracle', affinity: 0.8 },
  { a: 'echo', b: 'sentinel', affinity: 0.75 },
  { a: 'echo', b: 'synth', affinity: 0.65 },
  { a: 'echo', b: 'verifier', affinity: 0.75 },

  { a: 'nexus', b: 'oracle', affinity: 0.8 },
  { a: 'nexus', b: 'sentinel', affinity: 0.75 },
  { a: 'nexus', b: 'synth', affinity: 0.65 },
  { a: 'nexus', b: 'verifier', affinity: 0.75 },

  { a: 'oracle', b: 'sentinel', affinity: 0.65 },
  { a: 'oracle', b: 'synth', affinity: 0.6 },
  { a: 'oracle', b: 'verifier', affinity: 0.8 },

  { a: 'sentinel', b: 'synth', affinity: 0.4 },
  { a: 'sentinel', b: 'verifier', affinity: 0.85 },

  { a: 'synth', b: 'verifier', affinity: 0.65 }
];
