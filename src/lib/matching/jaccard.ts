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
