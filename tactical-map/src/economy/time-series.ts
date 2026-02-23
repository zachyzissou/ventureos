import type { TrendPoint } from '@/economy/types';

export type TimeSeriesOptions = {
  maxPoints: number;
  maxAgeMs: number;
};

export const DEFAULT_TIME_SERIES_OPTIONS: TimeSeriesOptions = {
  maxPoints: 64,
  maxAgeMs: 1000 * 60 * 60 * 6
};

export function pushTrendPoint(
  points: TrendPoint[],
  next: TrendPoint,
  options: TimeSeriesOptions = DEFAULT_TIME_SERIES_OPTIONS
): TrendPoint[] {
  const maxPoints = Math.max(2, options.maxPoints);
  const maxAgeMs = Math.max(1_000, options.maxAgeMs);

  const out = points.slice();

  // Coalesce duplicate timestamps to avoid jagged synthetic updates.
  if (out.length > 0 && out[out.length - 1].ts === next.ts) {
    out[out.length - 1] = next;
  } else {
    out.push(next);
  }

  const floorTs = next.ts - maxAgeMs;
  let start = 0;
  while (start < out.length && out[start].ts < floorTs) start++;

  const trimmedByAge = start > 0 ? out.slice(start) : out;
  if (trimmedByAge.length <= maxPoints) return trimmedByAge;

  return trimmedByAge.slice(trimmedByAge.length - maxPoints);
}

export function deriveBurnRateUsdPerHour(points: TrendPoint[]): number {
  if (points.length < 2) return 0;

  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const dtMs = b.ts - a.ts;
  if (dtMs <= 0) return 0;

  const delta = b.costUsd - a.costUsd;
  if (!Number.isFinite(delta)) return 0;

  return Math.max(0, (delta / dtMs) * 3_600_000);
}
