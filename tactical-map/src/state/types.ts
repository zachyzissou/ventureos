import type { AgentId, Point } from '@/config';

// Re-export health types for convenience (Phase 5.6)
export type {
  AgentHealthState,
  AgentStatus,
  AlertSeverity,
  ConnectivityState,
  HealthAlert,
  HealthMetrics,
  HealthState,
  SystemDiagnostics
} from '@/health/types';

export type BuildingState = 'IDLE' | 'ACTIVE' | 'OVERLOADED' | 'ERROR';

export type AgentSession = {
  /** Stable id if known. */
  id: string;
  /** Untrusted label/description (sanitize before display). */
  label: string;
  /** ISO string. */
  startedAt: string;
  /** Optional estimate in ms (for progress coloring). */
  estimatedMs?: number;
  /** Optional progress ratio (0..1). */
  progress?: number;
};

export type AgentNode = {
  id: AgentId;
  /** World-space position (center). */
  position: Point;
  /** Current building state. */
  state: BuildingState;
  /** Current sessions count (optional; used for overload display). */
  sessions?: number;
  /** Optional active sessions (if server exposes them). */
  activeSessions?: AgentSession[];
};

/**
 * Minimal map state used by the foundation renderer.
 * Keep this aligned with API_CONTRACTS.md as it evolves.
 */
export type MapState = {
  updatedAt: string;
  agents: Record<AgentId, AgentNode>;
};

export type RpgStats = Record<string, number>;

// ── Selection state (Phase 5.7) ─────────────────────────────────

export type SelectionState = {
  /** Currently selected agent id (null = none). */
  selectedId: AgentId | null;
  /** Currently hovered agent id (null = none). */
  hoveredId: AgentId | null;
};
