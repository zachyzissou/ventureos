/**
 * Tactical Map Configuration
 *
 * This file is the single source of truth for all visual constants.
 * Update this file instead of hardcoding values.
 */

export type Point = { x: number; y: number };

export const CANVAS = {
  /** Canvas width in pixels (design reference size). */
  WIDTH: 1920,
  /** Canvas height in pixels (design reference size). */
  HEIGHT: 1080,
  /** Background color (dark stone). */
  BG_COLOR: 0x0a0a0f
} as const;

export const AGENTS = {
  /** Building size (width and height). */
  BUILDING_SIZE: 96,
  /** Distance from center (pixels). */
  RING_RADIUS: 350,
  /** Building positions (calculated, 8 agents in circle). */
  POSITIONS: calculateCirclePositions(8, 350),
  /** Unit size (orbiting around building). */
  UNIT_SIZE: 32,
  /** Unit orbit radius from building center. */
  UNIT_ORBIT_RADIUS: 64
} as const;

export const COLORS = {
  /** Protoss blue (primary). */
  PROTOSS_BLUE: 0x00d4ff,
  /** Protoss gold (accent). */
  PROTOSS_GOLD: 0xffd700,
  /** Building states. */
  STATE_IDLE: 0x4a6fa5,
  STATE_ACTIVE: 0x00d4ff,
  STATE_OVERLOADED: 0xff9500,
  STATE_ERROR: 0xff3366,
  /** HUD palette. */
  HUD_BG: 0x000000,
  HUD_BG_ALPHA: 0.66,
  HUD_TEXT: 0xffffff
} as const;

export const BONDS = {
  /** Base bond line width in pixels. */
  BASE_WIDTH: 2,
  /** Additional width (px) added per affinity tier. */
  WIDTH_MULTIPLIER: 1.5,

  /** Tier breakpoints (affinity 0..1). */
  TIER_1_MAX: 0.5,
  TIER_2_MAX: 0.6,
  TIER_3_MAX: 0.75,
  TIER_4_MAX: 0.85,

  /**
   * 5-tier affinity palette (per Phase 5.3 spec).
   * - Tier 1 (nascent): dim blue
   * - Tier 2 (forming): cyan
   * - Tier 3 (active): green
   * - Tier 4 (strong): yellow
   * - Tier 5 (synergistic): gold/orange
   */
  TIER_COLORS: [0x1b3b7a, 0x00d4ff, 0x2dff7a, 0xffe45a, 0xffb000],

  /** Alpha mapping for bonds (strength → alpha). */
  ALPHA_MIN: 0.12,
  ALPHA_MAX: 0.85,
  /** How quickly lines fade toward new target strength. */
  ALPHA_LERP_MS: 350,

  /** Curvature factor (fraction of chord length). */
  CURVATURE: 0.22,
  /** Bezier polyline segments for drawing + length estimate. */
  SEGMENTS: 16,

  /**
   * Collision avoidance
   * We treat buildings as circles for path repulsion.
   */
  OBSTACLE_RADIUS_MULT: 0.70,
  OBSTACLE_PADDING: 18,
  AVOID_ITERS: 4,

  /**
   * Organic motion
   *
   * - Pulse: subtle alpha modulation
   * - Drift: control point wobble (keeps endpoints stable)
   */
  PULSE_HZ: 0.30,
  DRIFT_HZ: 0.22,
  DRIFT_PX: 8,
  /** How often we rebuild line geometry (ms). Lower = smoother drift, higher = faster. */
  LINE_REDRAW_MS: 100,

  /** Collaboration particle visuals */
  PARTICLE_SIZE: 4,
  PARTICLE_GLOW_BLUR: 2,
  /** Particle speeds in px/s by tier (1..5). */
  PARTICLE_SPEED_BY_TIER: [28, 44, 62, 84, 110],
  /** Particle count per bond by tier (1..5). */
  PARTICLE_COUNT_BY_TIER: [1, 2, 3, 4, 5]
} as const;

export const CAMERA = {
  /** Min zoom level. */
  MIN_ZOOM: 0.5,
  /** Max zoom level. */
  MAX_ZOOM: 2.0,
  /** Zoom step per wheel tick. */
  ZOOM_STEP: 0.1,
  /** Pan speed multiplier (pixels per drag pixel). */
  PAN_SPEED: 1.0,
  /** Reset animation duration in ms. */
  RESET_MS: 350
} as const;

export const API = {
  /** Base URL for tactical map APIs. */
  BASE_URL: '/api/tactical-map',
  /** Polling interval (ms). */
  POLL_INTERVAL: 15_000,
  /** KPI polling interval for HUD ticker (ms). */
  KPI_POLL_INTERVAL: 30_000,
  /** Resource economy snapshot endpoint. */
  RESOURCE_BASE_URL: '/api/tactical-map/resources',
  /** Resource economy websocket stream endpoint. */
  RESOURCE_WS_URL: '/api/tactical-map/resources/stream',
  /** Fallback poll cadence while websocket is disconnected. */
  REALTIME_FALLBACK_POLL_MS: 2_000,
  /** Reconnect backoff base in ms. */
  WS_RECONNECT_BASE_MS: 1_000,
  /** Reconnect backoff cap in ms. */
  WS_RECONNECT_MAX_MS: 30_000,
  /** Default fetch timeout in ms. */
  TIMEOUT_MS: 8_000,
  /** Health snapshot endpoint. */
  HEALTH_BASE_URL: '/api/tactical-map/health',
  /** Health WebSocket stream endpoint. */
  HEALTH_WS_URL: '/api/tactical-map/health/stream',
  /** Diagnostics endpoint. */
  HEALTH_DIAGNOSTICS_URL: '/api/tactical-map/diagnostics'
} as const;

export const CAPACITY = {
  /** Per-agent max sessions (from phase5-ambiguities-resolved.md). */
  MAX_SESSIONS: {
    oracle: 3,
    atlas: 5,
    sentinel: 3,
    verifier: 4,
    archivist: 3,
    synth: 3,
    echo: 5,
    nexus: 5
  },
  /** Overload threshold (% of max). */
  OVERLOAD_THRESHOLD: 0.8,
  /** Clear overload when capacity drops below this. */
  CLEAR_THRESHOLD: 0.7
} as const;

export const ANIMATION = {
  /** Building state crossfade duration in ms. */
  STATE_CROSSFADE_MS: 500
} as const;

export const HEALTH_BARS = {
  /** Width in pixels. */
  WIDTH: 54,
  /** Height in pixels. */
  HEIGHT: 6,
  /** Vertical offset from building center (negative = above). */
  OFFSET_Y: -70
} as const;

export const PARTICLES = {
  /** Hard cap for performance. */
  MAX: 500,
  /** Persistent ambient particles. */
  AMBIENT_TARGET: 120
} as const;

export const HEALTH = {
  /** Poll interval when WebSocket is connected (diagnostics only). */
  DIAGNOSTICS_POLL_MS: 30_000,
  /** Fallback poll cadence while WebSocket is disconnected. */
  FALLBACK_POLL_MS: 3_000,
  /** Maximum age before marking agent as "stale" (no heartbeat). */
  STALE_THRESHOLD_MS: 30_000,
  /** Maximum age before marking agent as "offline". */
  OFFLINE_THRESHOLD_MS: 60_000,
  /** Performance SLA: health check round-trip budget. */
  HEALTH_CHECK_BUDGET_MS: 50,
  /** Alert visibility SLA — from event to rendered overlay. */
  ALERT_VISIBILITY_MS: 5_000,
  /** Max alerts retained in state. */
  MAX_ALERTS: 50,
  /** Alert cooldown to prevent spam. */
  ALERT_COOLDOWN_MS: 30_000,
  /** CPU threshold for warning (%). */
  CPU_WARNING_PCT: 70,
  /** CPU threshold for critical (%). */
  CPU_CRITICAL_PCT: 90,
  /** Memory threshold for warning (% of limit). */
  MEMORY_WARNING_PCT: 75,
  /** Memory threshold for critical (% of limit). */
  MEMORY_CRITICAL_PCT: 90,
  /** Latency threshold for warning (ms). */
  LATENCY_WARNING_MS: 150,
  /** Latency threshold for critical (ms). */
  LATENCY_CRITICAL_MS: 500,
  /** Error rate threshold for warning (per min). */
  ERROR_RATE_WARNING: 5,
  /** Error rate threshold for critical (per min). */
  ERROR_RATE_CRITICAL: 20,
  /** Health indicator ring radius (px, around agent building). */
  INDICATOR_RING_RADIUS: 52,
  /** Pulse animation speed for error state (Hz). */
  ERROR_PULSE_HZ: 2.0,
  /** Pulse animation speed for warning state (Hz). */
  WARNING_PULSE_HZ: 1.0,
  /** Dashboard panel width (px). */
  DASHBOARD_WIDTH: 320,
  /** Dashboard panel max height (px). */
  DASHBOARD_MAX_HEIGHT: 460,
  /** Sparkline dimensions for dashboard. */
  SPARKLINE_WIDTH: 80,
  SPARKLINE_HEIGHT: 20,
  /** History points retained per agent for sparklines. */
  HISTORY_MAX_POINTS: 120
} as const;

export const CONNECTIVITY = {
  /** Connectivity check interval (ms). */
  CHECK_INTERVAL_MS: 10_000,
  /** Response time for "degraded" classification (ms). */
  DEGRADED_THRESHOLD_MS: 200,
  /** Consecutive failures before "offline" status. */
  OFFLINE_FAILURES: 3
} as const;

export const SELECTION = {
  /** Selection ring radius around building (px). */
  RING_RADIUS: 62,
  /** Selection ring color (Protoss gold). */
  RING_COLOR: 0xffd700,
  /** Selection ring alpha. */
  RING_ALPHA: 0.9,
  /** Selection ring stroke width (px). */
  RING_WIDTH: 3,
  /** Selection ring pulse frequency (Hz). */
  PULSE_HZ: 0.8,
  /** Glow blur radius for selection ring. */
  GLOW_BLUR: 6
} as const;

export const TOOLTIP = {
  /** Tooltip width (px). */
  WIDTH: 200,
  /** Tooltip inner padding (px). */
  PADDING: 10,
  /** Tooltip vertical offset from building center (px, negative = above). */
  OFFSET_Y: -90,
  /** Delay before tooltip appears (ms). */
  SHOW_DELAY_MS: 300,
  /** Tooltip background color. */
  BG_COLOR: 0x0a0a1a,
  /** Tooltip background alpha. */
  BG_ALPHA: 0.92,
  /** Tooltip border color. */
  BORDER_COLOR: 0x00d4ff,
  /** Tooltip border alpha. */
  BORDER_ALPHA: 0.6
} as const;

export const DETAIL_PANEL = {
  /** Detail panel width (px). */
  WIDTH: 340,
  /** Slide animation duration (ms). */
  ANIM_MS: 200,
  /** Panel background color. */
  BG_COLOR: 0x05070d,
  /** Panel background alpha. */
  BG_ALPHA: 0.94,
  /** Panel border color. */
  BORDER_COLOR: 0x00d4ff,
  /** Panel border alpha. */
  BORDER_ALPHA: 0.3,
  /** Section heading color. */
  HEADING_COLOR: 0xffd700,
  /** Sparkline dimensions. */
  SPARKLINE_WIDTH: 120,
  SPARKLINE_HEIGHT: 28,
  /** Max sessions shown in list. */
  MAX_SESSIONS_SHOWN: 5,
  /** Max errors shown in list. */
  MAX_ERRORS_SHOWN: 3
} as const;

export const MINIMAP = {
  /** Minimap size (px, square). */
  SIZE: 160,
  /** Margin from viewport edge (px). */
  MARGIN: 12,
  /** Background color. */
  BG_COLOR: 0x05070d,
  /** Background alpha. */
  BG_ALPHA: 0.80,
  /** Agent dot radius (px). */
  DOT_RADIUS: 5,
  /** Selected agent dot radius (px). */
  SELECTED_DOT_RADIUS: 7,
  /** Camera viewport rect color. */
  VIEWPORT_COLOR: 0xffd700,
  /** Camera viewport rect alpha. */
  VIEWPORT_ALPHA: 0.5,
  /** Border color. */
  BORDER_COLOR: 0x00d4ff,
  /** Border alpha. */
  BORDER_ALPHA: 0.3,
  /** Scale factor: how much of the world to show. */
  WORLD_EXTENT: 500
} as const;

export const FEATURES = {
  HEALTH_INDICATORS: true,
  HEALTH_DASHBOARD: true,
  ALERT_OVERLAYS: true,
  CONNECTIVITY_BADGE: true,
  INTERACTIVE_SELECTION: true,
  TOOLTIP: true,
  DETAIL_PANEL: true,
  MINIMAP: true
} as const;

export const ECONOMY = {
  /** Trigger warning alerts at <= 30% remaining budget. */
  WARNING_THRESHOLD: 0.30,
  /** Trigger critical alerts at <= 15% remaining budget. */
  CRITICAL_THRESHOLD: 0.15,
  /** Alert resend cooldown for persistent low budget states. */
  ALERT_COOLDOWN_MS: 45_000,
  /** Maximum trend points retained per agent. */
  HISTORY_MAX_POINTS: 64,
  /** Maximum trend history age retained (ms). */
  HISTORY_MAX_AGE_MS: 1000 * 60 * 60 * 6,
  /** Indicator ring radius around each agent building. */
  INDICATOR_RING_RADIUS: 60,
  /** Sparkline width in pixels. */
  SPARKLINE_WIDTH: 52,
  /** Sparkline height in pixels. */
  SPARKLINE_HEIGHT: 14,
  /** Heat map redraw throttle in milliseconds. */
  HEATMAP_REDRAW_MS: 90
} as const;

export const AGENT_ORDER = [
  'oracle',
  'atlas',
  'sentinel',
  'verifier',
  'archivist',
  'synth',
  'echo',
  'nexus'
] as const;

export type AgentId = (typeof AGENT_ORDER)[number];

export const AGENT_COLORS: Record<AgentId, number> = {
  /** Oracle: icy blue */
  oracle: 0x7bdcff,
  /** Atlas: primary Protoss blue */
  atlas: 0x00d4ff,
  /** Sentinel: guardian blue */
  sentinel: 0x4aa0ff,
  /** Verifier: violet-blue */
  verifier: 0x7a7dff,
  /** Archivist: teal */
  archivist: 0x67ffd1,
  /** Synth: aqua */
  synth: 0x00e1c3,
  /** Echo: gold accent */
  echo: 0xffd700,
  /** Nexus: Protoss gold */
  nexus: 0xffd700
} as const;

/**
 * Calculate evenly spaced points around a circle.
 *
 * Angle starts at the top (-90°), rotating clockwise.
 */
export function calculateCirclePositions(count: number, radius: number): Point[] {
  const positions: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    positions.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return positions;
}
