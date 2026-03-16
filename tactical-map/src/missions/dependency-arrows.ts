/**
 * Dependency Arrow Renderer — Phase 5.5
 *
 * Renders curved arrows between mission cards to visualize dependencies.
 * Supports three dependency types:
 * - blocks: Solid arrow, red-orange (critical path)
 * - informs: Dashed arrow, blue (information flow)
 * - feeds: Dotted arrow, green (data pipeline)
 *
 * Arrows are Bézier curves that route around obstacles and
 * animate with flowing particles along the path.
 */

import type {
  MissionDependency,
  MissionCardLayout,
  ArrowPath,
  Point,
} from './types';

// ═══════════════════════════════════════════
// Arrow Style Configuration
// ═══════════════════════════════════════════

export interface ArrowStyleConfig {
  /** Line width for arrows */
  lineWidth: number;
  /** Arrowhead size in pixels */
  arrowheadSize: number;
  /** Curvature factor (0 = straight, 1 = very curved) */
  curvature: number;
  /** Whether to show flowing particles */
  showParticles: boolean;
  /**
   * Particle speed as a normalized fraction of curve progress per second.
   * Unitless factor; higher values move particles farther along the path.
   */
  particleSpeed: number;
  /** Number of particles per arrow */
  particleCount: number;
}

export const DEFAULT_ARROW_CONFIG: ArrowStyleConfig = {
  lineWidth: 1.5,
  arrowheadSize: 8,
  curvature: 0.3,
  showParticles: true,
  particleSpeed: 60,
  particleCount: 3,
};

const DEPENDENCY_STYLES: Record<MissionDependency['type'], {
  color: string;
  dashPattern: number[];
  glowColor: string;
  particleColor: string;
}> = {
  blocks: {
    color: '#FF7043',
    dashPattern: [],
    glowColor: 'rgba(255, 112, 67, 0.3)',
    particleColor: '#FFAB91',
  },
  informs: {
    color: '#42A5F5',
    dashPattern: [6, 4],
    glowColor: 'rgba(66, 165, 245, 0.3)',
    particleColor: '#90CAF9',
  },
  feeds: {
    color: '#66BB6A',
    dashPattern: [2, 3],
    glowColor: 'rgba(102, 187, 106, 0.3)',
    particleColor: '#A5D6A7',
  },
};

// ═══════════════════════════════════════════
// Arrow Path Calculation
// ═══════════════════════════════════════════

/**
 * Calculate arrow paths from dependency data and card layouts.
 * Returns renderable ArrowPath objects with Bézier control points.
 */
export function calculateArrowPaths(
  dependencies: MissionDependency[],
  cardLayouts: Map<string, MissionCardLayout>,
  config: ArrowStyleConfig = DEFAULT_ARROW_CONFIG
): ArrowPath[] {
  const paths: ArrowPath[] = [];

  for (const dep of dependencies) {
    const fromLayout = cardLayouts.get(dep.from);
    const toLayout = cardLayouts.get(dep.to);

    if (!fromLayout || !toLayout) continue;

    const fromPoint = getConnectionPoint(fromLayout, 'right');
    const toPoint = getConnectionPoint(toLayout, 'left');

    const controlPoints = calculateControlPoints(
      fromPoint,
      toPoint,
      config.curvature
    );

    const style = DEPENDENCY_STYLES[dep.type];

    paths.push({
      from: fromPoint,
      to: toPoint,
      controlPoints,
      color: style.color,
      dashPattern: style.dashPattern.length > 0 ? style.dashPattern : undefined,
      type: dep.type,
    });
  }

  return paths;
}

/**
 * Get the connection point on a card edge for arrow attachment.
 */
function getConnectionPoint(
  layout: MissionCardLayout,
  side: 'left' | 'right' | 'top' | 'bottom'
): Point {
  const { position, size, floatOffset } = layout;
  const centerX = position.x + size.width / 2;
  const centerY = position.y + size.height / 2 + floatOffset;

  switch (side) {
    case 'left':
      return { x: position.x, y: centerY };
    case 'right':
      return { x: position.x + size.width, y: centerY };
    case 'top':
      return { x: centerX, y: position.y + floatOffset };
    case 'bottom':
      return { x: centerX, y: position.y + size.height + floatOffset };
  }
}

/**
 * Calculate Bézier control points for a curved arrow.
 * Uses horizontal offset proportional to distance and curvature factor.
 */
function calculateControlPoints(
  from: Point,
  to: Point,
  curvature: number
): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = dist * curvature;

  // If cards are roughly horizontal, curve vertically
  // If cards are roughly vertical, curve horizontally
  const isHorizontal = Math.abs(dx) > Math.abs(dy);

  if (isHorizontal) {
    return [
      { x: from.x + offset, y: from.y },
      { x: to.x - offset, y: to.y },
    ];
  } else {
    return [
      { x: from.x, y: from.y + (dy > 0 ? offset : -offset) },
      { x: to.x, y: to.y + (dy > 0 ? -offset : offset) },
    ];
  }
}

// ═══════════════════════════════════════════
// Arrow Rendering
// ═══════════════════════════════════════════

/**
 * Render a single dependency arrow with its arrowhead and optional particles.
 */
export function renderArrow(
  ctx: CanvasRenderingContext2D,
  path: ArrowPath,
  config: ArrowStyleConfig = DEFAULT_ARROW_CONFIG,
  time: number = Date.now()
): void {
  const style = DEPENDENCY_STYLES[path.type];

  ctx.save();

  // ── Glow effect ───────────────────────────────────────
  ctx.shadowColor = style.glowColor;
  ctx.shadowBlur = 6;

  // ── Main curve ────────────────────────────────────────
  ctx.strokeStyle = style.color;
  ctx.lineWidth = config.lineWidth;

  if (path.dashPattern && path.dashPattern.length > 0) {
    ctx.setLineDash(path.dashPattern);
  }

  ctx.beginPath();
  ctx.moveTo(path.from.x, path.from.y);

  if (path.controlPoints.length === 2) {
    ctx.bezierCurveTo(
      path.controlPoints[0].x, path.controlPoints[0].y,
      path.controlPoints[1].x, path.controlPoints[1].y,
      path.to.x, path.to.y
    );
  } else {
    ctx.lineTo(path.to.x, path.to.y);
  }

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // ── Arrowhead ─────────────────────────────────────────
  drawArrowhead(ctx, path, config.arrowheadSize, style.color);

  // ── Flowing particles ─────────────────────────────────
  if (config.showParticles) {
    drawFlowingParticles(ctx, path, config, style.particleColor, time);
  }

  ctx.restore();
}

/**
 * Render all dependency arrows.
 */
export function renderAllArrows(
  ctx: CanvasRenderingContext2D,
  paths: ArrowPath[],
  config: ArrowStyleConfig = DEFAULT_ARROW_CONFIG,
  time: number = Date.now()
): void {
  for (const path of paths) {
    renderArrow(ctx, path, config, time);
  }
}

// ═══════════════════════════════════════════
// Arrowhead Drawing
// ═══════════════════════════════════════════

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  path: ArrowPath,
  size: number,
  color: string
): void {
  // Calculate angle at the endpoint
  const cp = path.controlPoints;
  let angle: number;

  if (cp.length >= 2) {
    // Angle from last control point to endpoint
    angle = Math.atan2(
      path.to.y - cp[cp.length - 1].y,
      path.to.x - cp[cp.length - 1].x
    );
  } else {
    angle = Math.atan2(
      path.to.y - path.from.y,
      path.to.x - path.from.x
    );
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(path.to.x, path.to.y);
  ctx.lineTo(
    path.to.x - size * Math.cos(angle - Math.PI / 6),
    path.to.y - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    path.to.x - size * Math.cos(angle + Math.PI / 6),
    path.to.y - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

// ═══════════════════════════════════════════
// Flowing Particles
// ═══════════════════════════════════════════

/**
 * Draw animated particles flowing along the arrow path.
 * Creates a visual sense of data/dependency flow direction.
 */
function drawFlowingParticles(
  ctx: CanvasRenderingContext2D,
  path: ArrowPath,
  config: ArrowStyleConfig,
  color: string,
  time: number
): void {
  const { particleCount, particleSpeed } = config;

  for (let i = 0; i < particleCount; i++) {
    // Stagger particles evenly along the path
    const baseT = (i / particleCount);
    // Animate position over time
    const animT = ((time * particleSpeed) / 100000 + baseT) % 1;

    const point = getPointOnCubicBezier(
      path.from,
      path.controlPoints[0] ?? path.from,
      path.controlPoints[1] ?? path.to,
      path.to,
      animT
    );

    // Particle with fade at endpoints
    const edgeFade = Math.min(animT * 4, (1 - animT) * 4, 1);

    ctx.globalAlpha = edgeFade * 0.8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/**
 * Evaluate a point on a cubic Bézier curve at parameter t.
 */
export function getPointOnCubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}
