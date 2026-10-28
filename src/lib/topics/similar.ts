/**
 * Topic Similarity Detection (Spec FR-03.5, FR-11.3, A5)
 * Token Jaccard similarity on title + tech_stack/keywords against approved topics
 * and archived projects from earlier academic years.
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
 * Combines title tokens and tech_stack / keywords into a comprehensive token set.
 */
export function extractTopicTokens(topic: {
  title: string;
  tech_stack?: string[];
  keywords?: string[];
}): Set<string> {
  const tokens = tokenizeText(topic.title);

  const tagSources = [
    ...(Array.isArray(topic.tech_stack) ? topic.tech_stack : []),
    ...(Array.isArray(topic.keywords) ? topic.keywords : []),
  ];

  for (const tech of tagSources) {
    if (typeof tech === 'string') {
      const cleanTech = tech.toLowerCase().trim();
      if (cleanTech.length > 0 && !STOPWORDS.has(cleanTech)) {
        tokens.add(cleanTech);
        // Also tokenize compound tech names like "react native" or "next.js"
        for (const sub of tokenizeText(cleanTech)) {
          tokens.add(sub);
        }
      }
    }
  }

  return tokens;
}

/**
 * Calculates token Jaccard similarity between two topic/project representations:
 * J(A, B) = |A ∩ B| / |A ∪ B|
 */
export function computeTopicSimilarity(
  topicA: { title: string; tech_stack?: string[]; keywords?: string[] },
  topicB: { title: string; tech_stack?: string[]; keywords?: string[] }
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
  tech_stack?: string[];
  keywords?: string[];
  academic_year_id?: string;
}

export interface ArchivedProjectCandidate {
  id: string;
  title: string;
  keywords: string[];
  search_tokens?: string[];
  academic_year_id?: string;
}

/**
 * Finds topics/projects from existing approved topics AND archived_projects whose similarity >= threshold (default 0.6).
 * Returns array of warnings sorted descending by similarity score.
 */
export function findSimilarTopics(
  candidate: { title: string; tech_stack: string[] },
  approvedTopics: ApprovedTopicCandidate[],
  thresholdOrArchived: number | ArchivedProjectCandidate[] = 0.6,
  maybeArchivedOrThreshold?: ArchivedProjectCandidate[] | number
): SimilarTopicWarning[] {
  let threshold = 0.6;
  let archivedProjects: ArchivedProjectCandidate[] = [];

  if (typeof thresholdOrArchived === 'number') {
    threshold = thresholdOrArchived;
    if (Array.isArray(maybeArchivedOrThreshold)) {
      archivedProjects = maybeArchivedOrThreshold;
    }
  } else if (Array.isArray(thresholdOrArchived)) {
    archivedProjects = thresholdOrArchived;
    if (typeof maybeArchivedOrThreshold === 'number') {
      threshold = maybeArchivedOrThreshold;
    }
  }

  const bestByTopicId = new Map<string, SimilarTopicWarning>();

  const evaluateCandidate = (prev: ApprovedTopicCandidate | ArchivedProjectCandidate) => {
    const score = computeTopicSimilarity(candidate, prev);
    if (score >= threshold) {
      const existing = bestByTopicId.get(prev.id);
      if (!existing || score > existing.score) {
        bestByTopicId.set(prev.id, {
          topic_id: prev.id,
          title: prev.title,
          score,
        });
      }
    }
  };

  for (const prev of approvedTopics) {
    evaluateCandidate(prev);
  }

  for (const arch of archivedProjects) {
    evaluateCandidate(arch);
  }

  return Array.from(bestByTopicId.values()).sort((a, b) => b.score - a.score);
}
