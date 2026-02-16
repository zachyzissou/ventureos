/**
 * Replay & History Types — Phase 5.8
 *
 * Core type definitions for session recording, replay, comparison,
 * and export on the Tactical Map.
 *
 * Protoss lore: The Preservers keep the memories of the Protoss race —
 * every battle, every sacrifice, every triumph. Through the Khala's
 * temporal echoes, past events can be witnessed anew.
 *
 * @see docs/PHASE5.8_REPLAY_HISTORY.md for full architecture.
 */

import type { AgentId, Point } from '@/config';
import type { BuildingState, AgentSession, MapState } from '@/state/types';
import type { CameraState } from '@/interaction/camera';
import type {
  EconomyState,
  AgentEconomyState,
  ResourcePoolState,
  BudgetHealth,
} from '@/economy/types';
import type {
  HealthState,
  AgentHealthState,
  SystemHealthState,
  HealthAlert,
  HealthStatus,
  PerformanceMetrics,
} from '@/health/types';

// ═══════════════════════════════════════════
// Schema Version
// ═══════════════════════════════════════════

/** Current schema version for replay data. Increment on breaking changes. */
export const REPLAY_SCHEMA_VERSION = 1;

// ═══════════════════════════════════════════
// Session Metadata
// ═══════════════════════════════════════════

export interface SessionMeta {
  /** Unique session ID (UUID v4). */
  id: string;
  /** Human-readable session name. */
  name: string;
  /** Optional description/notes. */
  description?: string;
  /** Recording start time (epoch ms). */
  startedAt: number;
  /** Recording end time (epoch ms). Null if still recording. */
  endedAt: number | null;
  /** Duration in ms (derived: endedAt - startedAt). */
  durationMs: number;
  /** Total event count. */
  eventCount: number;
  /** Total checkpoint count. */
  checkpointCount: number;
  /** Number of event chunks stored. */
  chunkCount: number;
  /** Compressed size in bytes (total across all chunks). */
  compressedBytes: number;
  /** Schema version for forward compatibility. */
  schemaVersion: number;
  /** Tags for filtering/organization. */
  tags: string[];
  /** Which stores were captured. */
  capturedStores: CapturedStore[];
}

export type CapturedStore = 'map' | 'economy' | 'health';

// ═══════════════════════════════════════════
// Event Envelope
// ═══════════════════════════════════════════

/** Discriminated union tag for all replay events. */
export type ReplayEventType =
  | 'checkpoint'
  | 'map.full'
  | 'map.agent'
  | 'economy.full'
  | 'economy.agent'
  | 'economy.pool'
  | 'health.full'
  | 'health.agent'
  | 'health.alert'
  | 'health.system'
  | 'user.camera'
  | 'user.tab'
  | 'user.annotation'
  | 'marker.phase'
  | 'marker.incident';

/** Base fields shared by all replay events. */
export interface ReplayEventBase {
  /** Monotonic sequence number within the session. */
  seq: number;
  /** Wall-clock timestamp (epoch ms). */
  ts: number;
  /** Event type discriminator. */
  type: ReplayEventType;
}

// ═══════════════════════════════════════════
// Checkpoint (Full State Snapshot)
// ═══════════════════════════════════════════

/** Data captured in a checkpoint — full state of all stores. */
export interface CheckpointData {
  map: MapState;
  economy: EconomyState;
  health: HealthState;
  camera: CameraState;
}

export interface CheckpointEvent extends ReplayEventBase {
  type: 'checkpoint';
  data: CheckpointData;
}

// ═══════════════════════════════════════════
// Map Events
// ═══════════════════════════════════════════

export interface MapFullEvent extends ReplayEventBase {
  type: 'map.full';
  data: MapState;
}

export interface MapAgentEventData {
  agentId: AgentId;
  state: BuildingState;
  sessions?: number;
  activeSessions?: AgentSession[];
}

export interface MapAgentEvent extends ReplayEventBase {
  type: 'map.agent';
  data: MapAgentEventData;
}

// ═══════════════════════════════════════════
// Economy Events
// ═══════════════════════════════════════════

export interface EconomyFullEvent extends ReplayEventBase {
  type: 'economy.full';
  data: EconomyState;
}

export interface EconomyAgentEvent extends ReplayEventBase {
  type: 'economy.agent';
  data: AgentEconomyState;
}

export interface EconomyPoolEvent extends ReplayEventBase {
  type: 'economy.pool';
  data: ResourcePoolState;
}

// ═══════════════════════════════════════════
// Health Events
// ═══════════════════════════════════════════

export interface HealthFullEvent extends ReplayEventBase {
  type: 'health.full';
  data: HealthState;
}

export interface HealthAgentEvent extends ReplayEventBase {
  type: 'health.agent';
  data: AgentHealthState;
}

export interface HealthAlertEvent extends ReplayEventBase {
  type: 'health.alert';
  data: HealthAlert;
}

export interface HealthSystemEvent extends ReplayEventBase {
  type: 'health.system';
  data: SystemHealthState;
}

// ═══════════════════════════════════════════
// User Interaction Events
// ═══════════════════════════════════════════

export interface CameraEvent extends ReplayEventBase {
  type: 'user.camera';
  data: CameraState;
}

export interface TabEvent extends ReplayEventBase {
  type: 'user.tab';
  data: { tabId: string };
}

export interface AnnotationData {
  id: string;
  text: string;
  position?: Point;
  agentId?: AgentId;
  color?: string;
}

export interface AnnotationEvent extends ReplayEventBase {
  type: 'user.annotation';
  data: AnnotationData;
}

// ═══════════════════════════════════════════
// Marker Events (Auto-Detected)
// ═══════════════════════════════════════════

export interface PhaseMarkerData {
  agentId: AgentId;
  fromState: BuildingState;
  toState: BuildingState;
}

export interface PhaseMarkerEvent extends ReplayEventBase {
  type: 'marker.phase';
  data: PhaseMarkerData;
}

export interface IncidentMarkerData {
  agentId: AgentId | 'system';
  severity: 'warning' | 'critical';
  message: string;
}

export interface IncidentMarkerEvent extends ReplayEventBase {
  type: 'marker.incident';
  data: IncidentMarkerData;
}

// ═══════════════════════════════════════════
// Union Type — All Replay Events
// ═══════════════════════════════════════════

export type ReplayEvent =
  | CheckpointEvent
  | MapFullEvent
  | MapAgentEvent
  | EconomyFullEvent
  | EconomyAgentEvent
  | EconomyPoolEvent
  | HealthFullEvent
  | HealthAgentEvent
  | HealthAlertEvent
  | HealthSystemEvent
  | CameraEvent
  | TabEvent
  | AnnotationEvent
  | PhaseMarkerEvent
  | IncidentMarkerEvent;

// ═══════════════════════════════════════════
// Storage Types (IndexedDB)
// ═══════════════════════════════════════════

/** A chunk of compressed events stored in IndexedDB. */
export interface EventChunk {
  /** Session this chunk belongs to. */
  sessionId: string;
  /** Chunk sequence index (0-based). */
  chunkIndex: number;
  /** First event seq number in this chunk. */
  startSeq: number;
  /** Last event seq number in this chunk. */
  endSeq: number;
  /** Timestamp of first event. */
  startTs: number;
  /** Timestamp of last event. */
  endTs: number;
  /** Number of events in this chunk. */
  eventCount: number;
  /** gzip-compressed NDJSON payload. */
  data: Uint8Array;
}

/** Checkpoint index entry for fast seeking. */
export interface CheckpointIndex {
  /** Session this checkpoint belongs to. */
  sessionId: string;
  /** Sequence number of the checkpoint event. */
  seq: number;
  /** Timestamp of the checkpoint. */
  ts: number;
  /** Which chunk contains this checkpoint. */
  chunkIndex: number;
  /** Byte offset within decompressed chunk data (for fast parse). */
  offsetInChunk: number;
  /** Full checkpoint data for instant restore. */
  data: CheckpointData;
}

/** Marker index entry for timeline decoration. */
export interface MarkerIndex {
  /** Session this marker belongs to. */
  sessionId: string;
  /** Sequence number of the marker event. */
  seq: number;
  /** Timestamp of the marker. */
  ts: number;
  /** Marker type. */
  type: 'marker.phase' | 'marker.incident' | 'user.annotation';
  /** Marker payload. */
  data: PhaseMarkerData | IncidentMarkerData | AnnotationData;
}

// ═══════════════════════════════════════════
// Event Buffer Configuration
// ═══════════════════════════════════════════

export interface EventBufferConfig {
  /** Max events before auto-flushing to storage. Default: 500. */
  flushThreshold: number;
  /** Max time between flushes in ms. Default: 10_000. */
  flushIntervalMs: number;
  /** Checkpoint interval in ms. Default: 30_000. */
  checkpointIntervalMs: number;
  /** Checkpoint interval in events. Default: 200. */
  checkpointIntervalEvents: number;
}

export const DEFAULT_EVENT_BUFFER_CONFIG: EventBufferConfig = {
  flushThreshold: 500,
  flushIntervalMs: 10_000,
  checkpointIntervalMs: 30_000,
  checkpointIntervalEvents: 200,
};

// ═══════════════════════════════════════════
// Recorder Types
// ═══════════════════════════════════════════

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface RecorderConfig {
  /** Stores to record. Default: all. */
  capturedStores?: CapturedStore[];
  /** Event buffer configuration. */
  bufferConfig?: Partial<EventBufferConfig>;
  /** Diff threshold: if more than this many agents changed, emit full event. */
  fullEventThreshold?: number;
  /** Throttle camera events to at most one per this many ms. Default: 500. */
  cameraThrottleMs?: number;
}

export const DEFAULT_RECORDER_CONFIG: Required<RecorderConfig> = {
  capturedStores: ['map', 'economy', 'health'],
  bufferConfig: DEFAULT_EVENT_BUFFER_CONFIG,
  fullEventThreshold: 4,
  cameraThrottleMs: 500,
};

// ═══════════════════════════════════════════
// Replay Engine Types
// ═══════════════════════════════════════════

export type ReplayEngineState = 'empty' | 'loaded' | 'playing' | 'paused' | 'seeking';

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16;

export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

export interface ReplayEngineCallbacks {
  /** Callback when playback time changes. */
  onTimeUpdate: (timeMs: number) => void;
  /** Callback when an event is applied during playback. */
  onEvent: (event: ReplayEvent) => void;
  /** Callback when engine state changes. */
  onStateChange: (state: ReplayEngineState) => void;
  /** Callback when playback reaches the end. */
  onEnd: () => void;
}

/** Chunk cache for efficient playback. */
export interface ChunkCache {
  /** Currently active chunk. */
  current: { index: number; events: ReplayEvent[] } | null;
  /** Next chunk, pre-fetched. */
  next: { index: number; events: ReplayEvent[] } | null;
  /** Previous chunk (for reverse). */
  prev: { index: number; events: ReplayEvent[] } | null;
}

// ═══════════════════════════════════════════
// Snapshot Comparison Types
// ═══════════════════════════════════════════

export interface MapAgentDiff {
  agentId: AgentId;
  field: string;
  before: unknown;
  after: unknown;
}

export interface EconomyAgentDiff {
  agentId: AgentId;
  tokensDelta: number;
  costDelta: number;
  healthChange?: { from: BudgetHealth; to: BudgetHealth };
}

export interface EconomyPoolDiff {
  tokensDelta: number;
  costDelta: number;
}

export interface HealthAgentDiff {
  agentId: AgentId;
  statusChange?: { from: HealthStatus; to: HealthStatus };
  metricsDelta: Partial<PerformanceMetrics>;
}

export interface SnapshotDiff {
  timestamp: { before: number; after: number };
  map: {
    changed: MapAgentDiff[];
  };
  economy: {
    agents: EconomyAgentDiff[];
    pool: EconomyPoolDiff;
  };
  health: {
    agents: HealthAgentDiff[];
    alertsAdded: HealthAlert[];
    alertsResolved: HealthAlert[];
  };
}

// ═══════════════════════════════════════════
// Time Scrubber UI Types
// ═══════════════════════════════════════════

export interface TimeScrubberConfig {
  /** Total height in pixels. */
  height: number;
  /** Padding from bottom of screen. */
  bottomPadding: number;
  /** Timeline bar height. */
  barHeight: number;
  /** Marker diamond height. */
  markerHeight: number;
  /** Number of heatmap buckets for event density minimap. */
  heatmapBuckets: number;
  /** Colors. */
  colors: TimeScrubberColors;
}

export interface TimeScrubberColors {
  background: number;
  bar: number;
  played: number;
  playhead: number;
  checkpoint: number;
  incident: number;
  phase: number;
  annotation: number;
  heatmapLow: number;
  heatmapHigh: number;
}

export const DEFAULT_TIME_SCRUBBER_CONFIG: TimeScrubberConfig = {
  height: 80,
  bottomPadding: 8,
  barHeight: 24,
  markerHeight: 16,
  heatmapBuckets: 200,
  colors: {
    background: 0x0a0a1a,
    bar: 0x1a1a2e,
    played: 0x00d4ff,
    playhead: 0xffd700,
    checkpoint: 0x4a6fa5,
    incident: 0xff3366,
    phase: 0x00e1c3,
    annotation: 0xffd700,
    heatmapLow: 0x0a0a2e,
    heatmapHigh: 0x00d4ff,
  },
};

// ═══════════════════════════════════════════
// Event Log Panel Types
// ═══════════════════════════════════════════

export interface EventLogConfig {
  /** Max events to keep in the visible buffer. */
  maxVisible: number;
  /** Events to pre-fetch ahead of current time (ms). */
  lookAheadMs: number;
  /** Events to pre-fetch behind current time (ms). */
  lookBehindMs: number;
  /** Auto-scroll: keep current event centered. */
  autoScroll: boolean;
  /** Highlight duration for the current event (ms). */
  highlightMs: number;
}

export const DEFAULT_EVENT_LOG_CONFIG: EventLogConfig = {
  maxVisible: 100,
  lookAheadMs: 30_000,
  lookBehindMs: 30_000,
  autoScroll: true,
  highlightMs: 2_000,
};

export type EventLogFilter = {
  types?: ReplayEventType[];
  agentIds?: AgentId[];
  severities?: Array<'warning' | 'critical'>;
  searchText?: string;
};

// ═══════════════════════════════════════════
// Metrics Overlay Types
// ═══════════════════════════════════════════

export interface MetricSeries {
  /** Display label (e.g., "System CPU"). */
  label: string;
  /** Unit string (e.g., "%", "ms", "$/h"). */
  unit: string;
  /** Line color (PIXI hex). */
  color: number;
  /** Data points (ts → value). */
  points: Array<{ ts: number; value: number }>;
}

export type MetricExtractor = (event: ReplayEvent) => number | null;

/** Built-in metric IDs. */
export type BuiltinMetricId =
  | 'system.cpu'
  | 'system.memory'
  | 'system.latency'
  | 'system.errorRate'
  | 'pool.tokenUsage'
  | 'pool.costUsed'
  | `agent.${AgentId}.cpu`
  | `agent.${AgentId}.memory`
  | `agent.${AgentId}.latency`
  | `agent.${AgentId}.tokenUsage`;

export interface MetricsOverlayConfig {
  /** Max data points per series before down-sampling. */
  maxPointsPerSeries: number;
  /** Chart width in pixels. */
  chartWidth: number;
  /** Chart height per metric in pixels. */
  chartHeight: number;
  /** Padding between charts. */
  chartSpacing: number;
  /** Default metrics to show. */
  defaultMetrics: BuiltinMetricId[];
}

export const DEFAULT_METRICS_OVERLAY_CONFIG: MetricsOverlayConfig = {
  maxPointsPerSeries: 500,
  chartWidth: 300,
  chartHeight: 80,
  chartSpacing: 8,
  defaultMetrics: ['system.cpu', 'system.memory', 'pool.tokenUsage'],
};

// ═══════════════════════════════════════════
// Export Types
// ═══════════════════════════════════════════

export type ExportFormat = 'webm' | 'mp4' | 'gif' | 'png-sequence';

export type ExportFps = 15 | 30 | 60;

export interface ExportConfig {
  /** Output format. */
  format: ExportFormat;
  /** Frame rate. */
  fps: ExportFps;
  /** Output resolution width. */
  width: number;
  /** Output resolution height. */
  height: number;
  /** Time range: start (epoch ms). */
  startMs: number;
  /** Time range: end (epoch ms). */
  endMs: number;
  /** Playback speed during export (1x = realtime, 2x = double speed). */
  speed: number;
  /** Include event log panel in export? */
  includeEventLog: boolean;
  /** Include metrics overlay in export? */
  includeMetrics: boolean;
  /** Include time scrubber in export? */
  includeTimeScrubber: boolean;
  /** Quality (0-1, for lossy formats). */
  quality: number;
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  format: 'webm',
  fps: 30,
  width: 1920,
  height: 1080,
  startMs: 0,
  endMs: 0,
  speed: 1,
  includeEventLog: false,
  includeMetrics: false,
  includeTimeScrubber: true,
  quality: 0.85,
};

export type ExportState = 'idle' | 'encoding' | 'finalizing' | 'complete' | 'error' | 'cancelled';

export interface ExportProgress {
  state: ExportState;
  /** Current frame number. */
  currentFrame: number;
  /** Total frames to encode. */
  totalFrames: number;
  /** Progress ratio (0-1). */
  ratio: number;
  /** Estimated time remaining in ms. */
  estimatedRemainingMs: number;
  /** Error message if state is 'error'. */
  error?: string;
}

// ═══════════════════════════════════════════
// Server Sync Types (Optional)
// ═══════════════════════════════════════════

/** Session listing response from server. */
export interface SessionListResponse {
  sessions: SessionMeta[];
  totalCount: number;
  pageSize: number;
  page: number;
}

/** Session list query parameters. */
export interface SessionListQuery {
  page?: number;
  pageSize?: number;
  tags?: string[];
  startAfter?: number;
  startBefore?: number;
  sort?: `${keyof SessionMeta}:${'asc' | 'desc'}`;
}

/** NDJSON archive line types for import/export. */
export type ArchiveLine =
  | { type: 'meta'; data: SessionMeta }
  | { type: 'event'; data: ReplayEvent };

// ═══════════════════════════════════════════
// Component Interfaces
// ═══════════════════════════════════════════

/** Storage abstraction for replay sessions. */
export interface SessionStorage {
  /** Create or update session metadata. */
  putSession(meta: SessionMeta): Promise<void>;
  /** Get session metadata by ID. */
  getSession(id: string): Promise<SessionMeta | null>;
  /** List all sessions, ordered by startedAt descending. */
  listSessions(): Promise<SessionMeta[]>;
  /** Delete a session and all its chunks/checkpoints. */
  deleteSession(id: string): Promise<void>;

  /** Write a chunk of compressed events. */
  putChunk(chunk: EventChunk): Promise<void>;
  /** Get a specific chunk. */
  getChunk(sessionId: string, chunkIndex: number): Promise<EventChunk | null>;
  /** Get all chunk metadata for a session (without data payloads). */
  getChunkManifest(sessionId: string): Promise<Array<Omit<EventChunk, 'data'>>>;

  /** Write a checkpoint index entry. */
  putCheckpoint(cp: CheckpointIndex): Promise<void>;
  /** Get all checkpoints for a session, ordered by seq. */
  getCheckpoints(sessionId: string): Promise<CheckpointIndex[]>;
  /** Get the checkpoint nearest to (but not after) a given timestamp. */
  getCheckpointBefore(sessionId: string, ts: number): Promise<CheckpointIndex | null>;

  /** Get total storage usage in bytes. */
  getStorageUsage(): Promise<number>;
}

/** Event buffer for batching events during recording. */
export interface EventBuffer {
  /** Push a single event. May trigger flush or checkpoint. */
  push(event: ReplayEvent): void;
  /** Force flush all buffered events to storage. */
  flush(): Promise<void>;
  /** Force a checkpoint at the current position. */
  checkpoint(state: CheckpointData): void;
  /** Total events buffered (not yet flushed). */
  readonly pendingCount: number;
  /** Destroy: flush + clear timers. */
  destroy(): Promise<void>;
}

/** Session recorder. */
export interface SessionRecorder {
  /** Current recorder state. */
  readonly state: RecorderState;
  /** Current session metadata (null if idle). */
  readonly session: SessionMeta | null;
  /** Start recording a new session. */
  start(name?: string): Promise<SessionMeta>;
  /** Pause recording. */
  pause(): void;
  /** Resume recording. */
  resume(): void;
  /** Stop recording and finalize the session. */
  stop(): Promise<SessionMeta>;
  /** Add a user annotation at the current time. */
  annotate(text: string, options?: { position?: Point; agentId?: AgentId; color?: string }): void;
  /** Destroy the recorder and release resources. */
  destroy(): Promise<void>;
}

/** Replay engine for playback control. */
export interface ReplayEngine {
  /** Load a session by ID from storage. */
  load(sessionId: string): Promise<SessionMeta>;
  /** Unload the current session, freeing memory. */
  unload(): void;

  /** Start or resume playback. */
  play(): void;
  /** Pause playback. */
  pause(): void;
  /** Seek to a specific time (epoch ms). Returns actual landed time. */
  seek(timeMs: number): Promise<number>;

  /** Set playback speed multiplier. */
  setSpeed(multiplier: PlaybackSpeed): void;
  /** Get current playback speed. */
  getSpeed(): PlaybackSpeed;

  /** Get current playback time (epoch ms). */
  getCurrentTime(): number;
  /** Get session start time. */
  getStartTime(): number;
  /** Get session end time. */
  getEndTime(): number;
  /** Get session duration in ms. */
  getDuration(): number;

  /** Get current engine state. */
  getState(): ReplayEngineState;
  /** Get the loaded session metadata. */
  getSessionMeta(): SessionMeta | null;

  /** Step forward by N events (for export mode). */
  stepForward(count: number): Promise<void>;
  /** Step to the next event's timestamp. Returns the event or null if at end. */
  stepToNextEvent(): Promise<ReplayEvent | null>;

  /** Get all events in a time range (for event log panel). */
  getEventsInRange(startMs: number, endMs: number): Promise<ReplayEvent[]>;

  /** Get checkpoint markers (for timeline decoration). */
  getCheckpoints(): Array<{ seq: number; ts: number }>;
  /** Get incident/phase markers (for timeline decoration). */
  getMarkers(): MarkerIndex[];

  /** Called from the PIXI ticker each frame. */
  update(elapsedMs: number): void;

  /** Destroy and release resources. */
  destroy(): void;
}

/** Frame capturer for export. */
export interface FrameCapturer {
  /** Capture the current canvas as an ImageBitmap. */
  capture(): Promise<ImageBitmap>;
  /** Capture the current canvas as a Blob. */
  captureBlob(type?: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob>;
}

/** Video/GIF encoder. */
export interface VideoEncoder {
  /** Initialize the encoder. */
  init(config: ExportConfig): Promise<void>;
  /** Push a frame. */
  pushFrame(frame: ImageBitmap, timestampUs: number): Promise<void>;
  /** Finalize and return the encoded output. */
  finalize(): Promise<Blob>;
  /** Get current progress. */
  getProgress(): ExportProgress;
  /** Cancel encoding. */
  cancel(): void;
  /** Set progress callback. */
  onProgress: ((progress: ExportProgress) => void) | null;
}

/** Snapshot comparator. */
export interface SnapshotComparator {
  /** Compare two checkpoint states and return a structured diff. */
  compare(before: CheckpointData, after: CheckpointData): SnapshotDiff;
}

// ═══════════════════════════════════════════
// Utility Types
// ═══════════════════════════════════════════

/** Type guard for checkpoint events. */
export function isCheckpoint(event: ReplayEvent): event is CheckpointEvent {
  return event.type === 'checkpoint';
}

/** Type guard for marker events. */
export function isMarker(event: ReplayEvent): event is PhaseMarkerEvent | IncidentMarkerEvent {
  return event.type === 'marker.phase' || event.type === 'marker.incident';
}

/** Type guard for user events. */
export function isUserEvent(event: ReplayEvent): event is CameraEvent | TabEvent | AnnotationEvent {
  return event.type === 'user.camera' || event.type === 'user.tab' || event.type === 'user.annotation';
}

/** Type guard for map events. */
export function isMapEvent(event: ReplayEvent): event is MapFullEvent | MapAgentEvent {
  return event.type === 'map.full' || event.type === 'map.agent';
}

/** Type guard for economy events. */
export function isEconomyEvent(
  event: ReplayEvent,
): event is EconomyFullEvent | EconomyAgentEvent | EconomyPoolEvent {
  return event.type === 'economy.full' || event.type === 'economy.agent' || event.type === 'economy.pool';
}

/** Type guard for health events. */
export function isHealthEvent(
  event: ReplayEvent,
): event is HealthFullEvent | HealthAgentEvent | HealthAlertEvent | HealthSystemEvent {
  return (
    event.type === 'health.full' ||
    event.type === 'health.agent' ||
    event.type === 'health.alert' ||
    event.type === 'health.system'
  );
}

/**
 * Human-readable label for a replay event.
 * Used in the event log panel and tooltips.
 */
export function eventLabel(event: ReplayEvent): string {
  switch (event.type) {
    case 'checkpoint':
      return 'Checkpoint (full state snapshot)';
    case 'map.full':
      return 'Map state updated';
    case 'map.agent':
      return `${event.data.agentId}: state → ${event.data.state}`;
    case 'economy.full':
      return 'Economy snapshot';
    case 'economy.agent':
      return `${event.data.agentId}: $${event.data.costUsd.toFixed(2)} spent`;
    case 'economy.pool':
      return `Pool: ${(event.data.tokenQuotaRemainingRatio * 100).toFixed(0)}% remaining`;
    case 'health.full':
      return 'Health snapshot';
    case 'health.agent':
      return `${event.data.agentId}: ${event.data.status} (${event.data.connectivity})`;
    case 'health.alert':
      return `${event.data.severity}: ${event.data.message}`;
    case 'health.system':
      return `System: ${event.data.overallStatus}`;
    case 'user.camera':
      return `Camera: zoom ${event.data.zoom.toFixed(2)}`;
    case 'user.tab':
      return `Tab: ${event.data.tabId}`;
    case 'user.annotation':
      return `📝 ${event.data.text}`;
    case 'marker.phase':
      return `${event.data.agentId}: ${event.data.fromState} → ${event.data.toState}`;
    case 'marker.incident':
      return `${event.data.severity === 'critical' ? '🔴' : '🟡'} ${event.data.message}`;
  }
}

/**
 * Format a duration in ms to HH:MM:SS or MM:SS.
 */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format an epoch timestamp to HH:MM:SS (local time).
 */
export function formatTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString('en-US', { hour12: false });
}
