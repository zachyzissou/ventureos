import { describe, it, expect } from 'vitest';
import { fuzzyScore, fuzzySearch, fuzzySearchMulti } from '@/interaction/fuzzy-search';

describe('interaction/fuzzy-search', () => {
  describe('fuzzyScore', () => {
    it('returns score > 0 for matching strings', () => {
      const result = fuzzyScore('syn', 'Synth Agent');
      expect(result.score).toBeGreaterThan(0);
      expect(result.matches.length).toBe(3);
    });

    it('returns 0 for non-matching strings', () => {
      const result = fuzzyScore('xyz', 'Synth Agent');
      expect(result.score).toBe(0);
      expect(result.matches).toHaveLength(0);
    });

    it('empty query matches everything', () => {
      const result = fuzzyScore('', 'anything');
      expect(result.score).toBe(1);
    });

    it('empty target never matches (except empty query)', () => {
      expect(fuzzyScore('a', '').score).toBe(0);
    });

    it('prefix matches score higher', () => {
      const prefix = fuzzyScore('pa', 'Pause Agent');
      const middle = fuzzyScore('pa', 'Agent Pause');
      expect(prefix.score).toBeGreaterThan(middle.score);
    });

    it('consecutive matches score higher', () => {
      const consecutive = fuzzyScore('syn', 'synth');
      const scattered = fuzzyScore('syn', 's_y_n_th');
      expect(consecutive.score).toBeGreaterThan(scattered.score);
    });

    it('case insensitive matching', () => {
      const result = fuzzyScore('SYN', 'synth');
      expect(result.score).toBeGreaterThan(0);
    });

    it('word boundary bonus', () => {
      const wordBound = fuzzyScore('vm', 'view-mission');
      const noWordBound = fuzzyScore('vm', 'evermotion');
      // Both may match, but word boundary should score higher
      if (noWordBound.score > 0) {
        expect(wordBound.score).toBeGreaterThan(noWordBound.score);
      }
    });

    it('exact case match gets bonus', () => {
      const exact = fuzzyScore('S', 'Synth');
      const lower = fuzzyScore('s', 'Synth');
      expect(exact.score).toBeGreaterThanOrEqual(lower.score);
    });

    it('returns correct match indices', () => {
      const result = fuzzyScore('sth', 'synth');
      expect(result.matches).toEqual([0, 3, 4]);
    });
  });

  describe('fuzzySearch', () => {
    const items = ['Pause Oracle', 'Resume Atlas', 'Spawn Mission', 'View Synth', 'Undo'];

    it('returns all items for empty query', () => {
      const results = fuzzySearch('', items, (x) => x);
      expect(results).toHaveLength(5);
    });

    it('filters by matching query', () => {
      const results = fuzzySearch('pau', items, (x) => x);
      expect(results).toHaveLength(1);
      expect(results[0].item).toBe('Pause Oracle');
    });

    it('sorts by score descending', () => {
      const results = fuzzySearch('s', items, (x) => x);
      // All items with 's' should appear, sorted by score
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('respects maxResults', () => {
      const results = fuzzySearch('a', items, (x) => x, { maxResults: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('returns empty for no matches', () => {
      const results = fuzzySearch('zzz', items, (x) => x);
      expect(results).toHaveLength(0);
    });
  });

  describe('fuzzySearchMulti', () => {
    const items = [
      { label: 'Pause Oracle', keywords: ['stop', 'halt'] },
      { label: 'Resume Atlas', keywords: ['start', 'continue'] },
      { label: 'Spawn Mission', keywords: ['create', 'new', 'task'] },
    ];

    it('searches across multiple fields', () => {
      const results = fuzzySearchMulti(
        'stop',
        items,
        (item) => [item.label, ...item.keywords],
      );
      expect(results).toHaveLength(1);
      expect(results[0].item.label).toBe('Pause Oracle');
    });

    it('primary field (label) gets higher weight', () => {
      // "at" matches "Atlas" in label and "start" in keywords
      // Atlas label match should score higher
      const results = fuzzySearchMulti(
        'at',
        items,
        (item) => [item.label, ...item.keywords],
      );
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.label).toBe('Resume Atlas');
    });

    it('returns all for empty query', () => {
      const results = fuzzySearchMulti('', items, (item) => [item.label]);
      expect(results).toHaveLength(3);
    });
  });
});
