/**
 * Fuzzy Search — Phase 5.7
 *
 * Lightweight fuzzy string matching for the command palette.
 * Scores results based on consecutive character matches,
 * prefix bonuses, and word-boundary bonuses.
 */

export interface FuzzyResult<T> {
  item: T;
  score: number;
  /** Matched character indices in the target string. */
  matches: number[];
}

/**
 * Score a single string against a query.
 * Returns score (0 = no match, higher = better) and matched indices.
 */
export function fuzzyScore(query: string, target: string): { score: number; matches: number[] } {
  if (!query) return { score: 1, matches: [] };
  if (!target) return { score: 0, matches: [] };

  const qLower = query.toLowerCase();
  const tLower = target.toLowerCase();

  // Quick rejection: every query char must exist in target
  for (let i = 0; i < qLower.length; i++) {
    if (!tLower.includes(qLower[i])) return { score: 0, matches: [] };
  }

  const matches: number[] = [];
  let score = 0;
  let qi = 0;
  let consecutive = 0;
  let prevMatchIdx = -2;

  for (let ti = 0; ti < tLower.length && qi < qLower.length; ti++) {
    if (tLower[ti] === qLower[qi]) {
      matches.push(ti);

      // Base point for match
      score += 1;

      // Consecutive bonus
      if (ti === prevMatchIdx + 1) {
        consecutive++;
        score += consecutive * 2;
      } else {
        consecutive = 0;
      }

      // Prefix bonus (matching at start)
      if (ti === qi) score += 3;

      // Word boundary bonus (after space, -, _, :)
      if (ti > 0 && /[\s\-_:]/.test(target[ti - 1])) score += 2;

      // Exact case match bonus
      if (target[ti] === query[qi]) score += 0.5;

      prevMatchIdx = ti;
      qi++;
    }
  }

  // All query chars matched?
  if (qi < qLower.length) return { score: 0, matches: [] };

  // Normalize by target length to prefer shorter matches
  score = score / (1 + target.length * 0.1);

  return { score, matches };
}

/**
 * Search a list of items using fuzzy matching.
 * Returns items sorted by score (descending), filtered to score > 0.
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  options?: { maxResults?: number },
): FuzzyResult<T>[] {
  if (!query.trim()) {
    return items.map((item) => ({ item, score: 1, matches: [] }));
  }

  const results: FuzzyResult<T>[] = [];

  for (const item of items) {
    const text = getText(item);
    const { score, matches } = fuzzyScore(query, text);
    if (score > 0) {
      results.push({ item, score, matches });
    }
  }

  results.sort((a, b) => b.score - a.score);

  const max = options?.maxResults ?? results.length;
  return results.slice(0, max);
}

/**
 * Search across multiple fields per item.
 * Scores are summed across fields (primary field gets 2x weight).
 */
export function fuzzySearchMulti<T>(
  query: string,
  items: T[],
  getFields: (item: T) => string[],
  options?: { maxResults?: number },
): FuzzyResult<T>[] {
  if (!query.trim()) {
    return items.map((item) => ({ item, score: 1, matches: [] }));
  }

  const results: FuzzyResult<T>[] = [];

  for (const item of items) {
    const fields = getFields(item);
    let totalScore = 0;
    let bestMatches: number[] = [];
    let bestFieldScore = 0;

    for (let fi = 0; fi < fields.length; fi++) {
      const weight = fi === 0 ? 2 : 1;
      const { score, matches } = fuzzyScore(query, fields[fi]);
      const weighted = score * weight;
      totalScore += weighted;
      if (weighted > bestFieldScore) {
        bestFieldScore = weighted;
        bestMatches = matches;
      }
    }

    if (totalScore > 0) {
      results.push({ item, score: totalScore, matches: bestMatches });
    }
  }

  results.sort((a, b) => b.score - a.score);

  const max = options?.maxResults ?? results.length;
  return results.slice(0, max);
}
