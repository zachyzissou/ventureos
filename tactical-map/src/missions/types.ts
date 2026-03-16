/**
 * Mission Tracking Types — Phase 5.5
 *
 * Core type definitions for mission visualization on the tactical map.
 * These mirror the backend MissionRecord / QueueTask schemas but are
 * tailored for the rendering pipeline (canvas coordinates, colors, timing).
 */

// ═══════════════════════════════════════════
// Mission Lifecycle
// ═══════════════════════════════════════════

export type MissionPhase =
  | 'brief'
  | 'plan'
  | 'execute'
  | 'verify'
  | 'deliver'
  | 'closed'
  | 'error';

export const MISSION_PHASE_ORDER: readonly MissionPhase[] = [
  'brief',
  'plan',
  'execute',
  'verify',
  'deliver',
  'closed',
] as const;

/**
 * Map each phase to a numeric progress value (0-100).
 * Used for progress indicators.
 */
export const PHASE_PROGRESS: Record<MissionPhase, number> = {
  brief: 0,
  plan: 15,
  execute: 40,
  verify: 70,
  deliver: 90,
  closed: 100,
  error: -1,
};

// ═══════════════════════════════════════════
// Color palette
// ═══════════════════════════════════════════

export interface ColorScheme {
  primary: string;
  secondary: string;
  glow: string;
  text: string;
}

export const PHASE_COLORS: Record<MissionPhase, ColorScheme> = {
  brief: { primary: '#4FC3F7', secondary: '#0288D1', glow: 'rgba(79,195,247,0.3)', text: '#E1F5FE' },
  plan: { primary: '#81C784', secondary: '#388E3C', glow: 'rgba(129,199,132,0.3)', text: '#E8F5E9' },
  execute: { primary: '#FFB74D', secondary: '#F57C00', glow: 'rgba(255,183,77,0.3)', text: '#FFF3E0' },
  verify: { primary: '#BA68C8', secondary: '#7B1FA2', glow: 'rgba(186,104,200,0.3)', text: '#F3E5F5' },
  deliver: { primary: '#4DB6AC', secondary: '#00796B', glow: 'rgba(77,182,172,0.3)', text: '#E0F2F1' },
  closed: { primary: '#AED581', secondary: '#689F38', glow: 'rgba(174,213,129,0.4)', text: '#F1F8E9' },
  error: { primary: '#E57373', secondary: '#D32F2F', glow: 'rgba(229,115,115,0.4)', text: '#FFEBEE' },
};

// ═══════════════════════════════════════════
// Agent Role Types
// ═══════════════════════════════════════════

export type SquadRole = 'oracle' | 'atlas' | 'sentinel' | 'verifier' | 'archivist' | 'synth' | 'echo' | 'nexus';

export const ROLE_DISPLAY_NAMES: Record<SquadRole, string> = {
  echo: 'Echo',
  nexus: 'Nexus',
  oracle: 'Oracle',
  atlas: 'Atlas',
  sentinel: 'Sentinel',
  verifier: 'Verifier',
  archivist: 'Archivist',
  synth: 'Synth',
};

// ═══════════════════════════════════════════
// Task Types
// ═══════════════════════════════════════════

export type TaskTier = 'P0' | 'P1' | 'P2' | 'P3';
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

export const TIER_COLORS: Record<TaskTier, string> = {
  P0: '#FF1744',
  P1: '#FF9100',
  P2: '#FFEA00',
  P3: '#76FF03',
};

export interface TaskSummary {
  id: string;
  title: string;
  tier: TaskTier;
  status: TaskStatus;
  role?: string;
  progress?: number;
}

// ═══════════════════════════════════════════
// Mission Data (Visualization Model)
// ═══════════════════════════════════════════

export interface MissionDependency {
  /** Source mission ID */
  from: string;
  /** Target mission ID */
  to: string;
  /** Dependency type: blocks, informs, feeds */
  type: 'blocks' | 'informs' | 'feeds';
}

export interface MissionHistoryEntry {
  phase: MissionPhase;
  enteredAt: string;
  note?: string;
}

export interface MissionData {
  missionId: string;
  title: string;
  description: string;
  phase: MissionPhase;
  progress: number; // 0-100
  assignedTo: SquadRole[];
  tasks: TaskSummary[];
  dependencies: string[]; // mission IDs this depends on
  history: MissionHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  /** Computed: number of tasks in queue */
  queueDepth: number;
  /** Optional error info */
  error?: { message: string; code?: string };
}

// ═══════════════════════════════════════════
// Rendering Types
// ═══════════════════════════════════════════

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MissionCardLayout {
  missionId: string;
  position: Point;
  size: { width: number; height: number };
  /** Opacity for fade animations (0-1) */
  opacity: number;
  /** Vertical offset from agent for floating effect */
  floatOffset: number;
  /** Whether the card is expanded (showing tasks) */
  expanded: boolean;
}

export interface ArrowPath {
  from: Point;
  to: Point;
  controlPoints: Point[];
  color: string;
  dashPattern?: number[];
  /** Arrow type determines rendering style */
  type: MissionDependency['type'];
}

// ═══════════════════════════════════════════
// Animation Types
// ═══════════════════════════════════════════

export type AnimationType =
  | 'card_appear'
  | 'card_disappear'
  | 'phase_transition'
  | 'completion_burst'
  | 'progress_tick'
  | 'error_shake'
  | 'float_bob';

export interface Animation {
  id: string;
  type: AnimationType;
  targetId: string;
  startTime: number;
  duration: number;
  /** 0-1, updated each frame */
  progress: number;
  /** Custom parameters per animation type */
  params: Record<string, number | string>;
}

// ═══════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════

export interface MissionTrackingConfig {
  /** Max missions to render simultaneously */
  maxVisibleMissions: number;
  /** Card dimensions */
  cardWidth: number;
  cardHeight: number;
  /** Expanded card height (with task list) */
  expandedCardHeight: number;
  /** Vertical offset above agent sprite */
  floatHeight: number;
  /** Animation: bob amplitude in pixels */
  bobAmplitude: number;
  /** Animation: bob period in ms */
  bobPeriod: number;
  /** Whether to show dependency arrows */
  showDependencies: boolean;
  /** Whether to show task queue indicators */
  showQueueDepth: boolean;
  /** Performance: skip animations when > this many missions */
  animationThreshold: number;
  /** Timeline: max history entries to show */
  timelineMaxEntries: number;
}

export const DEFAULT_CONFIG: MissionTrackingConfig = {
  maxVisibleMissions: 50,
  cardWidth: 220,
  cardHeight: 80,
  expandedCardHeight: 200,
  floatHeight: 60,
  bobAmplitude: 3,
  bobPeriod: 2000,
  showDependencies: true,
  showQueueDepth: true,
  animationThreshold: 30,
  timelineMaxEntries: 50,
};
