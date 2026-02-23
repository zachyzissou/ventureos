export const WILDCARD_TARGETS = ['*', 'broadcast', 'all'] as const;

export function isWildcardTarget(value: string | undefined | null): boolean {
  if (!value) return false;
  return WILDCARD_TARGETS.includes(value as (typeof WILDCARD_TARGETS)[number]);
}
