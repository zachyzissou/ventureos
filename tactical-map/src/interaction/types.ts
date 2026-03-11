/**
 * Interactive Controls Types — Phase 5.7
 *
 * Core type definitions for user-driven control actions
 * on the Tactical Map: agent detail panels, mission spawning,
 * pause/resume, budget adjustment, command palette, and undo/redo.
 *
 * Protoss lore: The Executor's interface — channeling the Khala's
 * will into precise commands. Each gesture resonates through the
 * psionic network, shaping fleet operations in real time.
 */

import type { AgentId } from '@/config';
import type { BuildingState } from '@/state/types';
import type { HealthStatus, ConnectivityStatus, PerformanceMetrics } from '@/health/types';
import type { AgentEconomyState } from '@/economy/types';

// ═══════════════════════════════════════════
// Permissions
// ═══════════════════════════════════════════

/** User roles that govern what actions are available. */
export type UserRole = 'viewer' | 'operator' | 'admin';

/** Maps actions to minimum required role. */
export type PermissionMap = Record<ControlActionType, UserRole>;

export const DEFAULT_PERMISSIONS: PermissionMap = {
  'agent:view': 'viewer',
  'agent:pause': 'operator',
  'agent:resume': 'operator',
  'mission:spawn': 'operator',
  'mission:priority': 'operator',
  'budget:adjust': 'admin',
  'config:edit': 'admin',
  'command:execute': 'operator',
};

/** Role hierarchy for permission checks. */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

// ═══════════════════════════════════════════
// Control Actions
// ═══════════════════════════════════════════

export type ControlActionType =
  | 'agent:view'
  | 'agent:pause'
  | 'agent:resume'
  | 'mission:spawn'
  | 'mission:priority'
  | 'budget:adjust'
  | 'config:edit'
  | 'command:execute';

export interface ControlAction {
  type: ControlActionType;
  /** Target agent or 'system' for global actions. */
  target: AgentId | 'system';
  /** Action payload — varies by type. */
  payload: Record<string, unknown>;
  /** ISO timestamp when action was created. */
  createdAt: string;
}

export interface ControlActionResult {
  ok: boolean;
  action: ControlAction;
  error?: string;
  /** Previous state for undo support. */
  previousState?: Record<string, unknown>;
}

// ═══════════════════════════════════════════
// Agent Detail Panel
// ═══════════════════════════════════════════

export interface AgentDetailData {
  id: AgentId;
  label: string;
  state: BuildingState;
  healthStatus: HealthStatus;
  connectivity: ConnectivityStatus;
  metrics: PerformanceMetrics;
  economy: AgentEconomyState | null;
  sessions: number;
  /** Whether agent is paused. */
  paused: boolean;
  /** Uptime as human-readable string. */
  uptimeStr: string;
}

// ═══════════════════════════════════════════
// Mission Spawn
// ═══════════════════════════════════════════

export type MissionPriority = 'low' | 'normal' | 'high' | 'critical';

export interface MissionSpawnRequest {
  title: string;
  description: string;
  assignee: AgentId;
  priority: MissionPriority;
  /** Optional budget token limit. */
  tokenBudget?: number;
  /** Optional tags for categorization. */
  tags?: string[];
}

export interface MissionSpawnResult {
  ok: boolean;
  missionId?: string;
  error?: string;
}

// ═══════════════════════════════════════════
// Budget Adjustment
// ═══════════════════════════════════════════

export interface BudgetAdjustment {
  agentId: AgentId;
  /** New token budget (absolute value). */
  newBudget: number;
  /** Previous budget for undo. */
  previousBudget: number;
}

// ═══════════════════════════════════════════
// Command Palette
// ═══════════════════════════════════════════

export interface PaletteCommand {
  /** Unique command id. */
  id: string;
  /** Display label. */
  label: string;
  /** Keyboard shortcut (for display). */
  shortcut?: string;
  /** Grouping category. */
  category: 'agent' | 'mission' | 'system' | 'view';
  /** Minimum role to execute. */
  requiredRole: UserRole;
  /** Execute action. */
  execute: () => void;
  /** Search keywords (beyond label). */
  keywords?: string[];
}

// ═══════════════════════════════════════════
// Undo / Redo
// ═══════════════════════════════════════════

export interface UndoEntry {
  id: string;
  action: ControlAction;
  /** State before the action was applied. */
  previousState: Record<string, unknown>;
  /** Timestamp. */
  createdAt: number;
}

export interface UndoStack {
  entries: UndoEntry[];
  /** Index of next undo position (-1 = nothing to undo). */
  cursor: number;
  /** Max entries before eviction. */
  maxSize: number;
}

// ═══════════════════════════════════════════
// Event System
// ═══════════════════════════════════════════

export type InteractionEventType =
  | 'agent:click'
  | 'agent:hover'
  | 'agent:hover-end'
  | 'terrain:click'
  | 'palette:open'
  | 'palette:close'
  | 'panel:open'
  | 'panel:close'
  | 'tour:start'
  | 'tour:next'
  | 'tour:back'
  | 'tour:dismiss'
  | 'tour:complete'
  | 'help:toggle';

export interface InteractionEvent {
  type: InteractionEventType;
  agentId?: AgentId;
  position?: { x: number; y: number };
  timestamp: number;
}

export type InteractionHandler = (event: InteractionEvent) => void;

// ═══════════════════════════════════════════
// Confirmation Dialog
// ═══════════════════════════════════════════

export interface ConfirmationRequest {
  id: string;
  title: string;
  message: string;
  /** Label for confirm button. */
  confirmLabel: string;
  /** Label for cancel button. */
  cancelLabel: string;
  /** Visual severity. */
  severity: 'info' | 'warning' | 'danger';
  /** Callback on confirm. */
  onConfirm: () => void;
  /** Callback on cancel. */
  onCancel: () => void;
}

// ═══════════════════════════════════════════
// UI State
// ═══════════════════════════════════════════

export interface InteractiveUIState {
  /** Currently selected agent (detail panel open). */
  selectedAgent: AgentId | null;
  /** Hovered agent (tooltip or highlight). */
  hoveredAgent: AgentId | null;
  /** Whether the command palette is open. */
  paletteOpen: boolean;
  /** Active confirmation dialog. */
  confirmation: ConfirmationRequest | null;
  /** Whether mission spawn modal is open. */
  missionSpawnOpen: boolean;
  /** Whether config editor is open. */
  configEditorOpen: boolean;
  /** Whether mission list panel is open. */
  missionListOpen: boolean;
  /** Whether mission edit modal is open. */
  missionEditOpen: boolean;
  /** Whether the onboarding tour is active (Issue #210). */
  tourActive: boolean;
  /** Whether the help overlay is visible (Issue #210). */
  helpOverlayOpen: boolean;
  /** Current user role. */
  userRole: UserRole;
}

export function createInitialUIState(): InteractiveUIState {
  return {
    selectedAgent: null,
    hoveredAgent: null,
    paletteOpen: false,
    confirmation: null,
    missionSpawnOpen: false,
    configEditorOpen: false,
    missionListOpen: false,
    missionEditOpen: false,
    tourActive: false,
    helpOverlayOpen: false,
    userRole: 'operator',
  };
}
