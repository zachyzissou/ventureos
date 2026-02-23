export function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lerp between two 0xRRGGBB colors in sRGB space (good enough for UI). */
export function lerpColor(a: number, b: number, t: number): number {
  const tt = clamp01(t);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;

  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;

  const rr = Math.round(lerp(ar, br, tt));
  const rg = Math.round(lerp(ag, bg, tt));
  const rb = Math.round(lerp(ab, bb, tt));

  return (rr << 16) | (rg << 8) | rb;
}
