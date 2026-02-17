/**
 * RPG API TypeScript Interfaces — VentureOS RPG System
 *
 * Type contracts for all RPG HTTP API request/response shapes.
 * Used by lib/rpg-http.ts and dashboard/server/routes/rpg.ts.
 *
 * Issue #78 — API Integration
 */

// ─── Psionic Stats ──────────────────────────────────────────────────────────

/** A single snapshot row from the psionic_stats table. */
export interface PsionicStatSnapshot {
  snapshot_date: string;
  agent_id: string;
  psionic_mastery: number;
  energy: number;
  shields: number;
  warp_technology: number;
  psi_reach: number;
  memory_count: number;
  unique_domains: number;
  canonical_edits: number;
  p95_latency_s: number;
  mttr_minutes: number;
  acceptance_rate: number;
  success_rate: number;
  approval_accuracy: number;
  tasks_completed: number;
  warp_tech_inputs: string | null;
}

/** GET /api/rpg/stats response. */
export interface RpgStatsResponse {
  stats: Record<string, number>;
  snapshots?: PsionicStatSnapshot[];
}

/** GET /api/rpg/stats/:agentId response. */
export interface RpgAgentStatsResponse {
  agentId: string;
  stats: Record<string, number>;
  interactions: InteractionLogEntry[];
}

// ─── Interaction Logs ────────────────────────────────────────────────────────

/** A single row from the interaction_logs table. */
export interface InteractionLogEntry {
  created_at: string;
  agent_id: string | null;
  event_type: string | null;
  duration_ms: number;
}

// ─── Khala Network ──────────────────────────────────────────────────────────

/** A single row from the khala_network table. */
export interface KhalaNetworkEdge {
  id: number;
  agent_a: string;
  agent_b: string;
  affinity: number;
  seed_value: number;
  last_interaction_at: string | null;
  interaction_count: number;
  updated_at: string;
}

/** GET /api/rpg/khala-network response. */
export interface KhalaNetworkResponse {
  edges: KhalaNetworkEdge[];
  nodeCount: number;
  edgeCount: number;
}

// ─── Tactical Overlay ───────────────────────────────────────────────────────

/** GET /api/rpg/tactical-overlay/:view response. */
export interface TacticalOverlayResponse {
  view: string;
  stats: RpgStatsResponse;
  network: KhalaNetworkResponse;
  interactions: InteractionLogEntry[];
}

// ─── Protocols ──────────────────────────────────────────────────────────────

/** A protocol summary derived from interaction logs. */
export interface ProtocolSummary {
  event_type: string;
  count: number;
  avg_duration_ms: number;
  last_seen: string;
}

/** GET /api/rpg/protocols response. */
export interface ProtocolsResponse {
  protocols: ProtocolSummary[];
}

// ─── Escalations ────────────────────────────────────────────────────────────

/** An escalation event derived from interaction logs. */
export interface EscalationEntry {
  created_at: string;
  agent_id: string | null;
  event_type: string | null;
  duration_ms: number;
}

/** GET /api/rpg/escalations response. */
export interface EscalationsResponse {
  escalations: EscalationEntry[];
  total: number;
}

// ─── Shared ─────────────────────────────────────────────────────────────────

/** Options passed to RPG route handler. */
export interface RpgHandlerOptions {
  dbPath: string;
}

/** RPG module interface for dashboard integration. */
export interface RpgModule {
  handleRpgApi: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    opts: RpgHandlerOptions,
  ) => boolean;
}
