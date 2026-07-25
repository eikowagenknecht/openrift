import { squashForSearch } from "@openrift/shared";

/**
 * Splits a free-text search query into normalized, punctuation-stripped tokens.
 * Each whitespace-separated word is run through `squashForSearch`, so commas,
 * apostrophes, casing and accents all drop out (e.g. "Annie, Dark" → ["annie",
 * "dark"]). Empty/punctuation-only words are discarded.
 *
 * Folds via `squashForSearch` rather than `normalizeNameForMatching`: the latter
 * strips everything outside `[a-z0-9]`, which deletes non-ASCII instead of
 * folding it, so `unité` collapsed to `unit` and a CJK name to the empty string.
 *
 * @returns The lowercased tokens (empty when the query has none).
 */
export function searchTokens(query: string): string[] {
  return query
    .split(/\s+/u)
    .map((part) => squashForSearch(part))
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
  const normalized = haystacks.map((haystack) => squashForSearch(haystack));
  return tokens.every((token) => normalized.some((haystack) => haystack.includes(token)));
}

/**
 * Whether `text` starts with `query` once both are normalized (punctuation and
 * spacing removed). Used to bubble prefix matches to the top of search results.
 * @returns True when the normalized text begins with the normalized query.
 */
export function normalizedStartsWith(text: string, query: string): boolean {
  const normalizedQuery = squashForSearch(query);
  if (normalizedQuery.length === 0) {
    return false;
  }
  return squashForSearch(text).startsWith(normalizedQuery);
}
