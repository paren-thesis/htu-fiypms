import { describe, it, expect } from 'vitest';
import {
  normaliseTags,
  tagOverlap,
  capacityScore,
  matchScore,
} from './jaccard';

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
      const a = ['React', 'Next.js', 'TypeScript'];
      const b = ['React', 'Python', 'Fast-API'];
      expect(tagOverlap(a, b)).toBeCloseTo(0.2, 5);
    });

    it('correctly calculates 50% overlap', () => {
      expect(tagOverlap(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
    });

    it('handles case and whitespace normalisation', () => {
      const a = [' Machine Learning ', 'AI '];
      const b = ['ai', 'machine learning'];
      expect(tagOverlap(a, b)).toBe(1.0);
    });
  });

  describe('capacityScore', () => {
    it('calculates expected capacity ratio for normal loads', () => {
      // 1 - 2/5 = 0.6
      expect(capacityScore(2, 5)).toBeCloseTo(0.6, 5);
      // 1 - 0/5 = 1.0
      expect(capacityScore(0, 5)).toBe(1.0);
      // 1 - 4/5 = 0.2
      expect(capacityScore(4, 5)).toBeCloseTo(0.2, 5);
      // 1 - 5/5 = 0.0
      expect(capacityScore(5, 5)).toBe(0.0);
    });

    it('returns 0.0 when curr is above max (never negative)', () => {
      expect(capacityScore(6, 5)).toBe(0.0);
      expect(capacityScore(10, 5)).toBe(0.0);
    });

    it('handles max = 0 without producing NaN or dividing by zero', () => {
      // max(1, 0) = 1 -> 1 - 0/1 = 1.0
      expect(capacityScore(0, 0)).toBe(1.0);
      expect(Number.isNaN(capacityScore(0, 0))).toBe(false);

      // 1 - 2/1 = -1 -> clamped to 0.0
      expect(capacityScore(2, 0)).toBe(0.0);
      expect(Number.isNaN(capacityScore(2, 0))).toBe(false);
    });

    it('handles negative or invalid inputs safely', () => {
      expect(capacityScore(-2, 5)).toBe(1.0);
      expect(capacityScore(NaN, 5)).toBe(1.0);
    });
  });

  describe('matchScore', () => {
    it('matches the exact prompt test vector: T={a,b}, S={b,c}, curr 2, max 5 -> ~0.4133', () => {
      // Overlap: {b} / {a, b, c} = 1/3
      // Capacity: 1 - 2/5 = 0.6
      // Match: (1/3) * 0.7 + 0.6 * 0.3 = 0.233333... + 0.18 = 0.413333...
      const score = matchScore(['a', 'b'], ['b', 'c'], 2, 5);
      expect(score).toBeCloseTo(0.4133, 4);
    });

    it('evaluates empty tags using capacity score alone', () => {
      // Overlap = 0; Capacity = 1.0 -> 0.7 * 0 + 0.3 * 1.0 = 0.3
      expect(matchScore([], [], 0, 5)).toBeCloseTo(0.3, 5);
    });

    it('evaluates disjoint tags', () => {
      // Overlap = 0; Capacity = 0.6 -> 0.7 * 0 + 0.3 * 0.6 = 0.18
      expect(matchScore(['a'], ['b'], 2, 5)).toBeCloseTo(0.18, 5);
    });

    it('evaluates identical tags with full capacity', () => {
      // Overlap = 1.0; Capacity = 1.0 -> 0.7 * 1 + 0.3 * 1 = 1.0
      expect(matchScore(['a', 'b'], ['a', 'b'], 0, 5)).toBe(1.0);
    });

    it('evaluates identical tags with zero capacity', () => {
      // Overlap = 1.0; Capacity = 0.0 -> 0.7 * 1 + 0.3 * 0 = 0.7
      expect(matchScore(['a', 'b'], ['a', 'b'], 5, 5)).toBe(0.7);
    });
  });
});
