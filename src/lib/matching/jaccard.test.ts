import { describe, it, expect } from 'vitest';
import { normaliseTags, tagOverlap } from './jaccard';

describe('Jaccard Tag Matching (normaliseTags & tagOverlap)', () => {
  describe('normaliseTags', () => {
    it('trims, lowercases, collapses whitespace and deduplicates tags', () => {
      const raw = [' Next.js ', 'FIREBASE', 'next.js', ' React Native ', '  '];
      const result = normaliseTags(raw);
      expect(result).toEqual(['firebase', 'next.js', 'react native']);
    });

    it('handles empty or malformed inputs gracefully', () => {
      expect(normaliseTags([])).toEqual([]);
      // @ts-expect-error test invalid input
      expect(normaliseTags(null)).toEqual([]);
      // @ts-expect-error test non-string elements
      expect(normaliseTags([123, undefined, ' valid '])).toEqual(['valid']);
    });
  });

  describe('tagOverlap', () => {
    it('returns 1.0 for identical sets', () => {
      const a = ['React', 'Next.js', 'TypeScript'];
      const b = ['typescript', 'react', 'next.js'];
      expect(tagOverlap(a, b)).toBe(1.0);
    });

    it('returns 0.0 for disjoint sets', () => {
      const a = ['React', 'Next.js'];
      const b = ['Django', 'Python'];
      expect(tagOverlap(a, b)).toBe(0.0);
    });

    it('returns 0.0 if both sets are empty', () => {
      expect(tagOverlap([], [])).toBe(0.0);
    });

    it('computes exact intersection over union for overlapping sets', () => {
      // A: [react, next.js, typescript] (size 3)
      // B: [react, python, fast-api] (size 3)
      // Intersection: [react] (size 1)
      // Union: [react, next.js, typescript, python, fast-api] (size 5)
      // J = 1 / 5 = 0.2
      const a = ['React', 'Next.js', 'TypeScript'];
      const b = ['React', 'Python', 'Fast-API'];
      expect(tagOverlap(a, b)).toBeCloseTo(0.2, 5);
    });

    it('correctly calculates 50% overlap', () => {
      // A: [a, b, c]
      // B: [b, c, d]
      // Intersection: 2 (b, c)
      // Union: 4 (a, b, c, d)
      // J = 2/4 = 0.5
      expect(tagOverlap(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
    });
  });
});
