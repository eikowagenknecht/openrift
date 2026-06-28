import { normalizeNameForMatching } from "@openrift/shared";

/**
 * Splits a free-text search query into normalized, punctuation-stripped tokens.
 * Each whitespace-separated word is run through `normalizeNameForMatching`, so
 * commas, apostrophes, and casing drop out (e.g. "Annie, Dark" → ["annie",
 * "dark"]). Empty/punctuation-only words are discarded.
 * @returns The lowercased alphanumeric tokens (empty when the query has none).
 */
export function searchTokens(query: string): string[] {
  return query
    .split(/\s+/u)
    .map((part) => normalizeNameForMatching(part))
    .filter((token) => token.length > 0);
}

/**
 * Tests whether every token appears in at least one haystack. Haystacks are
 * normalized the same way as the tokens, so punctuation and spacing differences
 * (e.g. the comma in "Annie, Dark Child" vs the query "annie dark") never block
 * a match. Tokens may match across different haystacks — e.g. a name word plus a
 * short-code word. Returns false when there are no tokens, so a punctuation-only
 * query yields nothing rather than everything.
 * @returns True when all tokens match, false otherwise.
 */
export function matchesAllTokens(tokens: readonly string[], ...haystacks: string[]): boolean {
  if (tokens.length === 0) {
    return false;
  }
  const normalized = haystacks.map((haystack) => normalizeNameForMatching(haystack));
  return tokens.every((token) => normalized.some((haystack) => haystack.includes(token)));
}

/**
 * Whether `text` starts with `query` once both are normalized (punctuation and
 * spacing removed). Used to bubble prefix matches to the top of search results.
 * @returns True when the normalized text begins with the normalized query.
 */
export function normalizedStartsWith(text: string, query: string): boolean {
  const normalizedQuery = normalizeNameForMatching(query);
  if (normalizedQuery.length === 0) {
    return false;
  }
  return normalizeNameForMatching(text).startsWith(normalizedQuery);
}
