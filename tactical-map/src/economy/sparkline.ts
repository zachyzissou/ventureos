import type { Point } from '@/config';

export function buildSparklinePoints(values: number[], width: number, height: number, pad = 1): Point[] {
  const w = Math.max(2, width);
  const h = Math.max(2, height);
  const left = pad;
  const top = pad;
  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);

  if (values.length === 0) {
    const y = top + innerH * 0.5;
    return [
      { x: left, y },
      { x: left + innerW, y }
    ];
  }

  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    const y = top + innerH * 0.5;
    return [
      { x: left, y },
      { x: left + innerW, y }
    ];
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = Math.max(1e-6, max - min);

  const out: Point[] = [];
  const n = values.length;

  for (let i = 0; i < n; i++) {
    const v = Number.isFinite(values[i]) ? values[i] : min;
    const t = n === 1 ? 0 : i / (n - 1);
    const x = left + innerW * t;
    const yn = (v - min) / span;
    const y = top + innerH * (1 - yn);
    out.push({ x, y });
  }

  return out;
}
