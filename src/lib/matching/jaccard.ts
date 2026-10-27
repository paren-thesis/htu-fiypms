/**
 * Jaccard Tag Overlap and Normalisation (Spec FR-04.1, FR-03.5)
 * Pure set operations on tags and technical keywords.
 */

/**
 * Normalises tags: lowercased, trimmed, whitespace collapsed, deduplicated.
 */
export function normaliseTags(tags: string[]): string[] {
  if (!tags || !Array.isArray(tags)) return [];

  const seen = new Set<string>();
  const normalised: string[] = [];

  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const clean = raw
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');

    if (clean.length > 0 && !seen.has(clean)) {
      seen.add(clean);
      normalised.push(clean);
    }
  }

  return normalised.sort();
}

/**
 * Computes Jaccard tag overlap coefficient between two tag collections:
 * J(A, B) = |A ∩ B| / |A ∪ B|
 * Returns 0 if both sets are empty.
 */
export function tagOverlap(tagsA: string[], tagsB: string[]): number {
  const setA = new Set(normaliseTags(tagsA));
  const setB = new Set(normaliseTags(tagsB));

  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }

  let intersectionCount = 0;
  for (const tag of setA) {
    if (setB.has(tag)) {
      intersectionCount++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionCount;
  if (unionSize === 0) return 0;

  return intersectionCount / unionSize;
}

/**
 * Computes workload capacity metric (Spec FR-04.1, §4.1).
 * CapacityScore(C_curr, C_max) = max(0.0, 1.0 - C_curr / max(1, C_max))
 * Evaluates cleanly in [0.0, 1.0]; returns 0.0 when curr >= max.
 */
export function capacityScore(curr: number, max: number): number {
  const safeCurr = Number.isFinite(curr) ? Math.max(0, curr) : 0;
  const safeMax = Number.isFinite(max) ? Math.max(0, max) : 0;
  return Math.max(0, 1 - safeCurr / Math.max(1, safeMax));
}

/**
 * Computes composite supervisor match score combining tag overlap and capacity (Spec FR-04.1, §4.1).
 * MatchScore = (TagOverlap * 0.7) + (CapacityScore * 0.3)
 * Strictly bounded in [0.0, 1.0]. Default max capacity is 5.
 */
export function matchScore(
  teamTags: string[],
  supervisorTags: string[],
  curr: number,
  max = 5
): number {
  const overlap = tagOverlap(teamTags, supervisorTags);
  const capacity = capacityScore(curr, max);
  return overlap * 0.7 + capacity * 0.3;
}

