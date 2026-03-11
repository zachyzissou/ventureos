export function sanitizeStringList(
  value: unknown,
  opts: { maxItems: number; maxLen: number },
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    out.push(s.slice(0, opts.maxLen));
    if (out.length >= opts.maxItems) break;
  }
  return out;
}
