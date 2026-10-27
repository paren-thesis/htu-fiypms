/**
 * Topic Similarity Detection (Spec FR-03.5)
 * Token Jaccard similarity on title + tech_stack against approved topics from earlier academic years.
 * Warns if similarity >= 0.6 (never blocks submission).
 */

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'in',
  'for',
  'to',
  'with',
  'on',
  'at',
  'by',
  'from',
  'as',
  'into',
  'using',
  'based',
  'via',
  'system',
  'application',
  'app',
  'platform',
]);

/**
 * Tokenizes text into normalized keywords, filtering out common stopwords.
 */
export function tokenizeText(text: string): Set<string> {
  if (!text || typeof text !== 'string') return new Set();

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  return new Set(words);
}

/**
 * Combines title tokens and tech_stack keywords into a comprehensive token set.
 */
export function extractTopicTokens(topic: {
  title: string;
  tech_stack: string[];
}): Set<string> {
  const tokens = tokenizeText(topic.title);

  if (Array.isArray(topic.tech_stack)) {
    for (const tech of topic.tech_stack) {
      if (typeof tech === 'string') {
        const cleanTech = tech.toLowerCase().trim();
        if (cleanTech.length > 0) {
          tokens.add(cleanTech);
          // Also tokenize compound tech names like "react native" or "next.js"
          for (const sub of tokenizeText(cleanTech)) {
            tokens.add(sub);
          }
        }
      }
    }
  }

  return tokens;
}

/**
 * Calculates token Jaccard similarity between two topic representations:
 * J(A, B) = |A ∩ B| / |A ∪ B|
 */
export function computeTopicSimilarity(
  topicA: { title: string; tech_stack: string[] },
  topicB: { title: string; tech_stack: string[] }
): number {
  const tokensA = extractTopicTokens(topicA);
  const tokensB = extractTopicTokens(topicB);

  if (tokensA.size === 0 && tokensB.size === 0) return 0;

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = tokensA.size + tokensB.size - intersectionCount;
  if (unionSize === 0) return 0;

  return Number((intersectionCount / unionSize).toFixed(4));
}

export interface SimilarTopicWarning {
  topic_id: string;
  title: string;
  score: number;
}

export interface ApprovedTopicCandidate {
  id: string;
  title: string;
  tech_stack: string[];
  academic_year_id?: string;
}

/**
 * Finds topics from a collection of existing approved topics whose similarity >= threshold (default 0.6).
 * Returns array of warnings sorted descending by similarity score.
 */
export function findSimilarTopics(
  candidate: { title: string; tech_stack: string[] },
  approvedTopics: ApprovedTopicCandidate[],
  threshold = 0.6
): SimilarTopicWarning[] {
  const warnings: SimilarTopicWarning[] = [];

  for (const prev of approvedTopics) {
    const score = computeTopicSimilarity(candidate, prev);
    if (score >= threshold) {
      warnings.push({
        topic_id: prev.id,
        title: prev.title,
        score,
      });
    }
  }

  return warnings.sort((a, b) => b.score - a.score);
}
