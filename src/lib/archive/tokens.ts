/**
 * Pure tokenization and keyword extraction for Archived Projects (Spec FR-11, A5)
 */

export const MAX_SEARCH_TOKENS = 40;
export const MAX_QUERY_TOKENS = 10;

export const ARCHIVE_STOPWORDS = new Set([
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
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'but',
  'if',
  'then',
  'else',
  'when',
  'where',
  'why',
  'how',
  'all',
  'any',
  'both',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'can',
  'will',
  'just',
  'should',
  'now',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'their',
  'his',
  'her',
  'our',
  'your',
  'my',
  'we',
  'they',
  'them',
  'project',
  'study',
  'between',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'over',
  'under',
  'again',
  'further',
  'once',
  'here',
  'there',
  'about',
  'against',
  'within',
  'without',
  'across',
  'towards',
  'toward',
  'upon',
  'also',
  'however',
  'therefore',
  'thus',
  'hence',
  'which',
  'who',
  'whom',
  'whose',
  'what',
]);

/**
 * Extracts normalized lowercase alphanumeric words (length >= 2) excluding stopwords.
 */
export function extractWords(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !ARCHIVE_STOPWORDS.has(w));
}

/**
 * Rank words by frequency (with optional weight boost) and order of first appearance.
 */
function rankTerms(titleWords: string[], abstractWords: string[]): string[] {
  const counts = new Map<string, number>();
  const firstIndex = new Map<string, number>();
  let idx = 0;

  for (const w of titleWords) {
    counts.set(w, (counts.get(w) ?? 0) + 2);
    if (!firstIndex.has(w)) firstIndex.set(w, idx++);
  }

  for (const w of abstractWords) {
    counts.set(w, (counts.get(w) ?? 0) + 1);
    if (!firstIndex.has(w)) firstIndex.set(w, idx++);
  }

  return Array.from(counts.keys()).sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (diff !== 0) return diff;
    return (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0);
  });
}

/**
 * Builds up to 40 unique lowercase search tokens from title, abstract, and tech_stack,
 * stripping common stopwords.
 */
export function buildSearchTokens(
  title: string,
  abstract: string,
  tech_stack: string[] = []
): string[] {
  const seen = new Set<string>();
  const addToken = (tok: string) => {
    const clean = tok.toLowerCase().trim();
    if (clean.length >= 2 && !ARCHIVE_STOPWORDS.has(clean) && !seen.has(clean)) {
      seen.add(clean);
    }
  };

  // 1. Tech stack tokens (both full normalized string and alphanumeric parts)
  if (Array.isArray(tech_stack)) {
    for (const rawTech of tech_stack) {
      if (typeof rawTech !== 'string') continue;
      const cleanTech = rawTech.toLowerCase().trim();
      if (!cleanTech) continue;
      addToken(cleanTech);
      for (const part of extractWords(cleanTech)) {
        addToken(part);
      }
    }
  }

  // 2. Title words in appearance order
  const titleWords = extractWords(title);
  for (const w of titleWords) {
    addToken(w);
  }

  // 3. Ranked abstract terms
  const abstractWords = extractWords(abstract);
  const ranked = rankTerms(titleWords, abstractWords);
  for (const w of ranked) {
    addToken(w);
  }

  return Array.from(seen).slice(0, MAX_SEARCH_TOKENS);
}

/**
 * Builds keywords array = normalized tech_stack plus top terms from title and abstract.
 */
export function buildKeywords(
  title: string,
  abstract: string,
  tech_stack: string[] = [],
  maxKeywords = 12
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  if (Array.isArray(tech_stack)) {
    for (const rawTech of tech_stack) {
      if (typeof rawTech !== 'string') continue;
      const clean = rawTech.toLowerCase().trim();
      if (clean.length > 0 && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    }
  }

  const titleWords = extractWords(title);
  const abstractWords = extractWords(abstract);
  const topTerms = rankTerms(titleWords, abstractWords);

  for (const term of topTerms) {
    if (result.length >= maxKeywords) break;
    if (!seen.has(term)) {
      seen.add(term);
      result.push(term);
    }
  }

  return result;
}

/**
 * Tokenizes a user search query into up to 10 lowercase tokens for Firestore array-contains-any.
 */
export function tokenizeSearchQuery(
  query: string,
  maxTokens = MAX_QUERY_TOKENS
): string[] {
  if (!query || typeof query !== 'string') return [];

  const seen = new Set<string>();
  const addToken = (tok: string) => {
    const clean = tok.toLowerCase().trim();
    if (clean.length >= 2 && !ARCHIVE_STOPWORDS.has(clean) && !seen.has(clean)) {
      seen.add(clean);
    }
  };

  // Preserve compound punctuation tokens like "next.js" if typed directly
  const rawParts = query
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(Boolean);

  for (const part of rawParts) {
    addToken(part);
    for (const sub of extractWords(part)) {
      addToken(sub);
    }
  }

  return Array.from(seen).slice(0, maxTokens);
}

