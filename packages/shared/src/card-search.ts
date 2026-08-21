import { foldForSearch, squashForSearch } from "./search-fold.js";

/**
 * The minimal card shape the index needs. Callers pass their own richer row
 * type and get it back out of the ranking, so the Discord bot's catalog cards
 * and the API's lean lookup rows share one implementation.
 */
export interface SearchableCard {
  id: string;
  slug: string;
  name: string;
}

/** The minimal printing shape the index reads lookup codes from. */
export interface SearchablePrintingCodes {
  shortCode: string;
  publicCode: string;
}

interface IndexedCard<TCard extends SearchableCard> {
  card: TCard;
  folded: string;
  /** The folded name's words, for "any word starts with the query" matches. */
  words: string[];
  /** The squashed name, so a token can match across the name's punctuation. */
  squashed: string;
  /** Squashed printing codes (short + public), for `ogn202`-style lookups. */
  codes: string[];
}

export interface CardSearchIndex<TCard extends SearchableCard> {
  entries: IndexedCard<TCard>[];
  bySlug: Map<string, TCard>;
}

/**
 * Precomputes folded card names and squashed printing codes once per catalog
 * refresh so every lookup is a scan over ready-made strings. Codes go through
 * `squashForSearch` — the same folding the site's search uses — so `ogn202`
 * matches `OGN-202` and `ogn202298` matches `OGN-202/298`.
 *
 * @returns The search index for the given cards.
 */
export function buildCardIndex<TCard extends SearchableCard>(
  cards: readonly TCard[],
  printingsByCardId: ReadonlyMap<string, readonly SearchablePrintingCodes[]>,
): CardSearchIndex<TCard> {
  const entries = cards
    .map((card) => {
      const folded = foldForSearch(card.name);
      return {
        card,
        folded,
        words: folded.split(" ").filter((word) => word.length > 0),
        squashed: squashForSearch(card.name),
        codes: (printingsByCardId.get(card.id) ?? []).flatMap((printing) => [
          squashForSearch(printing.shortCode),
          squashForSearch(printing.publicCode),
        ]),
      };
    })
    .toSorted((a, b) => a.card.name.localeCompare(b.card.name));
  return { entries, bySlug: new Map(cards.map((card) => [card.slug, card])) };
}

/**
 * Match tiers, best first. Everything above {@link TIER_TOKENS} matches the
 * query as one contiguous run; the last tier is the out-of-order fallback.
 */
const TIER_EXACT_NAME = 0;
const TIER_EXACT_CODE = 1;
const TIER_NAME_PREFIX = 2;
const TIER_WORD_PREFIX = 3;
const TIER_CODE_PREFIX = 4;
const TIER_NAME_SUBSTRING = 5;
const TIER_CODE_SUBSTRING = 6;
const TIER_TOKENS = 7;
const TIER_COUNT = 8;

/**
 * Splits a query into squashed tokens for the out-of-order tier. Whitespace is
 * the only separator that matters here; punctuation inside a token is squashed
 * away so `kai'sa` and `kaisa` produce the same token.
 *
 * @returns The non-empty squashed tokens, in query order.
 */
function queryTokens(query: string): string[] {
  return query
    .split(/\s+/u)
    .map((part) => squashForSearch(part))
    .filter((token) => token.length > 0);
}

/**
 * Whether every token appears somewhere in the entry, each token free to land
 * in the name or in any printing code. This is what lets `dark annie` and
 * `annie dark` both find "Annie, Dark Child", and `annie ogn202` match a name
 * word against one haystack and a code against another.
 *
 * @returns True when all tokens match.
 */
function matchesEveryToken(entry: IndexedCard<SearchableCard>, tokens: string[]): boolean {
  return tokens.every(
    (token) => entry.squashed.includes(token) || entry.codes.some((code) => code.includes(token)),
  );
}

/**
 * Scores one entry against a prepared query.
 *
 * @returns The best tier the entry reaches, or null when it does not match.
 */
function tierFor<TCard extends SearchableCard>(
  entry: IndexedCard<TCard>,
  folded: string,
  squashed: string,
  tokens: string[],
): number | null {
  if (entry.folded === folded) {
    return TIER_EXACT_NAME;
  }
  if (squashed && entry.codes.includes(squashed)) {
    return TIER_EXACT_CODE;
  }
  if (entry.folded.startsWith(folded)) {
    return TIER_NAME_PREFIX;
  }
  // A word-boundary hit beats a mid-word one: typing "jinx" should offer
  // "Mecha Jinx" above a card that merely contains the letters.
  if (entry.words.some((word) => word.startsWith(folded))) {
    return TIER_WORD_PREFIX;
  }
  if (squashed && entry.codes.some((code) => code.startsWith(squashed))) {
    return TIER_CODE_PREFIX;
  }
  if (entry.folded.includes(folded)) {
    return TIER_NAME_SUBSTRING;
  }
  if (squashed && entry.codes.some((code) => code.includes(squashed))) {
    return TIER_CODE_SUBSTRING;
  }
  // Last resort: the words are all there but not in the order or adjacency the
  // tiers above require.
  if (tokens.length > 0 && matchesEveryToken(entry, tokens)) {
    return TIER_TOKENS;
  }
  return null;
}

/**
 * Ranks cards against a free-text query. Contiguous matches come first (exact
 * name, exact code, name prefix, word prefix, code prefix, name substring, code
 * substring), then an out-of-order tier where every whitespace-separated token
 * has to appear somewhere in the name or a printing code. Each tier is
 * alphabetical, which is the index's own order.
 *
 * Names use the same `foldForSearch` folding as the site, so apostrophes and
 * typographic punctuation never decide a match.
 *
 * This is the app's only card matcher. Every picker, palette, the Discord bot
 * and the chat lookup rank through it, so the same query cannot order results
 * one way in the deck builder and another in the collection import.
 *
 * @returns Up to `limit` matching cards, best first.
 */
export function searchCards<TCard extends SearchableCard>(
  index: CardSearchIndex<TCard>,
  query: string,
  limit: number,
): TCard[] {
  const folded = foldForSearch(query);
  if (!folded) {
    return [];
  }
  const squashed = squashForSearch(query);
  const tokens = queryTokens(query);
  const tiers: TCard[][] = Array.from({ length: TIER_COUNT }, () => []);
  for (const entry of index.entries) {
    const tier = tierFor(entry, folded, squashed, tokens);
    if (tier !== null) {
      tiers[tier]?.push(entry.card);
    }
  }
  return tiers.flat().slice(0, limit);
}

/**
 * Resolves a query to a single card: an exact slug hit (the Discord slash
 * command's autocomplete round-trips slugs) or the best free-text match.
 *
 * @returns The matched card, or undefined when nothing matches.
 */
export function findCard<TCard extends SearchableCard>(
  index: CardSearchIndex<TCard>,
  query: string,
): TCard | undefined {
  return index.bySlug.get(query.trim()) ?? searchCards(index, query, 1)[0];
}
