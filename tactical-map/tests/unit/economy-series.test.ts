import { describe, it, expect } from 'vitest';
import { buildSparklinePoints } from '@/economy/sparkline';
import { deriveBurnRateUsdPerHour, pushTrendPoint } from '@/economy/time-series';

describe('economy/time-series + sparkline', () => {
  it('pushTrendPoint trims by age and count', () => {
    let points = [
      { ts: 0, tokensUsed: 10, costUsd: 1 },
      { ts: 1_000, tokensUsed: 20, costUsd: 2 },
      { ts: 2_000, tokensUsed: 30, costUsd: 3 }
    ];

    points = pushTrendPoint(points, { ts: 3_000, tokensUsed: 40, costUsd: 4 }, { maxPoints: 3, maxAgeMs: 2_500 });
    expect(points).toHaveLength(3);
    expect(points[0].ts).toBe(1_000);
  });

  it('derives burn rate from latest points', () => {
    const rate = deriveBurnRateUsdPerHour([
      { ts: 0, tokensUsed: 0, costUsd: 0 },
      { ts: 60_000, tokensUsed: 200, costUsd: 2 }
    ]);

    expect(rate).toBeCloseTo(120, 3); // $2/min => $120/hour
  });

  it('buildSparklinePoints generates drawable geometry', () => {
    const pts = buildSparklinePoints([1, 2, 3, 2, 4], 50, 12);
    expect(pts.length).toBe(5);
    expect(pts[0].x).toBeGreaterThanOrEqual(0);
    expect(pts[pts.length - 1].x).toBeGreaterThan(pts[0].x);
  });
});
