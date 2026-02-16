import type { Point } from '@/config';

export type CircleObstacle = {
  center: Point;
  radius: number;
  /** optional id for debugging */
  id?: string;
};

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k };
}

export function len(v: Point): number {
  return Math.hypot(v.x, v.y);
}

export function norm(v: Point): Point {
  const l = len(v);
  if (l <= 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

export function perp(v: Point): Point {
  return { x: -v.y, y: v.x };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function quadraticBezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const tt = clamp(t, 0, 1);
  const a = (1 - tt) * (1 - tt);
  const b = 2 * (1 - tt) * tt;
  const c = tt * tt;
  return { x: p0.x * a + p1.x * b + p2.x * c, y: p0.y * a + p1.y * b + p2.y * c };
}

export function quadraticBezierPolyline(p0: Point, p1: Point, p2: Point, segments: number): Point[] {
  const seg = Math.max(2, Math.floor(segments));
  const pts: Point[] = [];
  for (let i = 0; i <= seg; i++) {
    pts.push(quadraticBezierPoint(p0, p1, p2, i / seg));
  }
  return pts;
}

export function toPixiPoly(points: Point[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

export function hashString(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type BondPathInput = {
  a: Point;
  b: Point;
  key: string;
  obstacles: CircleObstacle[];
  obstaclePadding: number;
  /** initial curvature proportional to distance (0..1). */
  curvature: number;
  /** max iterations for collision avoidance repulsion. */
  iterations: number;
};

/**
 * Generate a curved path between two points with basic obstacle avoidance.
 *
 * The result is a quadratic Bezier (p0=a, p2=b, p1=control).
 */
export function generateBondControlPoint(inp: BondPathInput): Point {
  const { a, b, key, obstacles, obstaclePadding, curvature, iterations } = inp;

  const ab = sub(b, a);
  const d = len(ab);
  const dir = norm(ab);
  const p = norm(perp(dir));
  const mid = midpoint(a, b);

  // Deterministic side + magnitude.
  const h = hashString(key);
  const side = h % 2 === 0 ? 1 : -1;
  const variance = ((h >>> 1) % 1000) / 1000; // 0..0.999
  const baseMag = clamp(d * curvature, 30, 220) * (0.65 + variance * 0.7);

  let control = add(mid, mul(p, baseMag * side));

  // Push control away from obstacles by sampling the curve.
  for (let iter = 0; iter < iterations; iter++) {
    let rep: Point = { x: 0, y: 0 };
    let hits = 0;

    for (let s = 1; s <= 13; s++) {
      const t = s / 14;
      const pt = quadraticBezierPoint(a, control, b, t);

      for (const o of obstacles) {
        const minDist = o.radius + obstaclePadding;
        const dist = distance(pt, o.center);
        if (dist < minDist && dist > 1e-6) {
          const away = norm(sub(pt, o.center));
          const overlap = minDist - dist;
          // Overlap-proportional repulsion: stronger when deeply intersecting.
          rep = add(rep, mul(away, overlap * 0.9));
          hits++;
        }
      }
    }

    if (hits === 0) break;

    // Reduce repulsion component along the segment to avoid over-stretching.
    const along = mul(dir, dot(rep, dir));
    const lateral = sub(rep, along);
    control = add(control, lateral);

    // Clamp control point to a sane region around mid.
    const offset = sub(control, mid);
    const offLen = len(offset);
    const maxOff = clamp(d * 0.65, 120, 420);
    if (offLen > maxOff) control = add(mid, mul(norm(offset), maxOff));
  }

  return control;
}

export function estimatePolylineLength(points: Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += distance(points[i - 1], points[i]);
  return sum;
}
