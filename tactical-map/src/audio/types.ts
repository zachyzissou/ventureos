/**
 * Audio Engine Types — Phase 5.9 (#208a)
 *
 * Type definitions for the tactical map audio system.
 * Covers channel topology (master → bus → source), event triggers,
 * and configuration surface.
 */

// ═══════════════════════════════════════════
// Channel / Bus topology
// ═══════════════════════════════════════════

/**
 * Audio channel (bus) identifiers.
 *
 * The gain graph is: source → bus gain → master gain → destination.
 * Each bus can be independently muted/levelled.
 */
export type AudioBusId = 'master' | 'sfx' | 'ambient' | 'ui' | 'voice';

/**
 * Per-bus volume and mute state.
 * Volume is linear 0..1; `muted` silences without changing the stored volume.
 */
export interface BusState {
  volume: number;
  muted: boolean;
}

/**
 * Full mixer snapshot — one entry per bus.
 */
export type MixerState = Record<AudioBusId, BusState>;

// ═══════════════════════════════════════════
// Sound events
// ═══════════════════════════════════════════

/**
 * Named event triggers that map to concrete audio playback.
 *
 * This union grows as we add sound packs; the AudioManager
 * silently ignores unknown events for forward-compat.
 */
export type SoundEventId =
  // UI chrome
  | 'ui:click'
  | 'ui:hover'
  | 'ui:open'
  | 'ui:close'
  | 'ui:error'
  // Agent lifecycle
  | 'agent:spawn'
  | 'agent:idle'
  | 'agent:active'
  | 'agent:overloaded'
  | 'agent:error'
  | 'agent:paused'
  | 'agent:resumed'
  // Alerts
  | 'alert:warning'
  | 'alert:critical'
  | 'alert:resolved'
  // Economy
  | 'economy:budget-warning'
  | 'economy:budget-critical'
  // Missions
  | 'mission:spawned'
  | 'mission:completed'
  | 'mission:failed'
  // Affinity network
  | 'affinity:bond-formed'
  | 'affinity:bond-broken'
  // Ambient loops
  | 'ambient:base-hum'
  | 'ambient:data-stream';

/**
 * Options for a single playback invocation.
 */
export interface PlayOptions {
  /** Override bus (defaults to 'sfx'). */
  bus?: AudioBusId;
  /** Volume multiplier 0..1 (applied on top of bus volume). */
  volume?: number;
  /** Loop the sound (for ambient layers). */
  loop?: boolean;
  /** Playback rate (1.0 = normal). */
  rate?: number;
}

/**
 * A registered sound definition.
 */
export interface SoundDef {
  /** Event this sound maps to. */
  eventId: SoundEventId;
  /** URL or base64 data URI. */
  src: string;
  /** Default play options. */
  defaults?: Partial<PlayOptions>;
}

// ═══════════════════════════════════════════
// Active playback handle
// ═══════════════════════════════════════════

/**
 * Opaque handle returned when a sound starts playing.
 * Allows callers to stop/fade individual playback instances.
 */
export interface PlaybackHandle {
  /** Unique instance id. */
  readonly id: string;
  /** Stop immediately. */
  stop: () => void;
  /** Fade out over `ms` then stop. */
  fadeOut: (ms: number) => void;
  /** Whether playback has finished or been stopped. */
  readonly ended: boolean;
}

// ═══════════════════════════════════════════
// Manager interface
// ═══════════════════════════════════════════

/**
 * Public surface of the audio manager.
 *
 * Designed so the rest of the codebase can depend on this interface
 * without coupling to Web Audio internals.
 */
export interface IAudioManager {
  // ── Lifecycle ──────────────────────────────
  /**
   * Attempt to initialise (or resume) the AudioContext.
   * Must be called from a user-gesture handler to satisfy
   * browser autoplay policies. Safe to call multiple times.
   *
   * Returns true if the context is now running.
   */
  init(): Promise<boolean>;

  /** Whether the context is currently in the 'running' state. */
  readonly ready: boolean;

  /** Suspend the context (free resources when tab hidden). */
  suspend(): Promise<void>;

  /** Fully tear down — disconnect nodes, close context. */
  dispose(): void;

  // ── Mixer ──────────────────────────────────
  /** Get a snapshot of all bus volumes/mute states. */
  getMixer(): MixerState;

  /** Set bus volume (0..1). Clamps out-of-range. */
  setBusVolume(bus: AudioBusId, volume: number): void;

  /** Toggle mute on a bus. */
  setBusMuted(bus: AudioBusId, muted: boolean): void;

  /** Set master volume. Sugar for `setBusVolume('master', v)`. */
  setMasterVolume(volume: number): void;

  // ── Sound registration ─────────────────────
  /**
   * Register a sound definition. If `eventId` already has a
   * registration it is replaced (last-write-wins).
   */
  register(def: SoundDef): void;

  // ── Playback ───────────────────────────────
  /**
   * Fire-and-forget playback. Returns a handle for early stop/fade,
   * or null if audio is unavailable or the event is unregistered.
   */
  play(eventId: SoundEventId, opts?: PlayOptions): PlaybackHandle | null;

  /** Stop all active playback. */
  stopAll(): void;

  /** Number of currently playing instances. */
  readonly activeCount: number;
}

// ═══════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════

/**
 * User-facing audio preferences (persisted to localStorage).
 */
export interface AudioPreferences {
  /** Global enable/disable. */
  enabled: boolean;
  /** Per-bus volumes (missing keys → default 0.8). */
  volumes: Partial<Record<AudioBusId, number>>;
  /** Per-bus mute flags. */
  muted: Partial<Record<AudioBusId, boolean>>;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  enabled: true,
  volumes: {
    master: 0.8,
    sfx: 0.7,
    ambient: 0.4,
    ui: 0.6,
    voice: 1.0,
  },
  muted: {},
};

export const ALL_BUS_IDS: readonly AudioBusId[] = [
  'master', 'sfx', 'ambient', 'ui', 'voice',
] as const;
