import { foldForSearch, squashCached, squashForSearch } from "./search-fold.js";

/**
 * The default shortest query a card picker searches on. One letter matches most
 * of any catalog, so a broad picker waits for two.
 *
 * A surface may pass its own floor, but only with a comment saying why. The
 * established exception is a picker over a small fixed set (one deck zone, one
 * import's rows) or a command palette, where one letter is a useful filter
 * rather than a flood.
 */
export const CARD_SEARCH_MIN_QUERY_LENGTH = 2;

/**
 * The default number of hits a card picker dropdown shows. Surfaces with wider
 * or shorter rows override it (the marketplace assign dropdowns show 10, a deck
 * zone allows 50), again with a comment saying why.
 */
export const CARD_SEARCH_RESULT_LIMIT = 20;

/**
 * The minimal card shape the index needs. Callers pass their own richer row
 * type and get it back out of the ranking, so the Discord bot's catalog cards
 * and the API's lean lookup rows share one implementation.
 */
export interface SearchableCard {
  id: string;
  slug: string;
  name: string;
  /**
   * Every other name this card answers to, matched exactly like `name`. This is
   * the one place the app's several "the card is also called…" rules meet:
   *
   * - the colloquial Legend form (`"Azir, Emperor of the Sands"` for a card
   *   named `"Emperor of the Sands"` tagged `Azir`) via `legendDisplayName`,
   * - a printing's localized `printedName`,
   * - the curated `card_name_aliases` keys, where the server has them.
   *
   * Alias keys arrive already normalized (spaceless, lowercase). Squashing them
   * again is a no-op beyond accent folding, so they can be mixed in with real
   * display names without a separate code path.
   */
  altNames?: readonly string[];
}

/** The minimal printing shape the index reads lookup codes from. */
export interface SearchablePrintingCodes {
  shortCode: string;
  publicCode: string;
}

/** One name a card answers to, pre-folded on both axes. */
interface IndexedName {
  folded: string;
  /** The folded name's words, for "any word starts with the query" matches. */
  words: string[];
  /** The squashed name, so a query can match across the name's punctuation. */
  squashed: string;
}

interface IndexedCard<TCard extends SearchableCard> {
  card: TCard;
  /** The canonical name first, then `altNames` in the order given. */
  names: IndexedName[];
  /** Squashed printing codes (short + public), for `ogn202`-style lookups. */
  codes: string[];
}

export interface CardSearchIndex<TCard extends SearchableCard> {
  entries: IndexedCard<TCard>[];
  bySlug: Map<string, TCard>;
}

/**
 * Folds one name on both axes.
 * @returns The indexed forms of the name.
 */
function indexName(name: string): IndexedName {
  const folded = foldForSearch(name);
  return {
    folded,
    words: folded.split(" ").filter((word) => word.length > 0),
    squashed: squashForSearch(name),
  };
}

/**
 * Precomputes folded card names and squashed printing codes once per catalog
 * refresh so every lookup is a scan over ready-made strings. Codes go through
 * `squashForSearch` — the same folding the site's search uses — so `ogn202`
 * matches `OGN-202` and `ogn202298` matches `OGN-202/298`.
 *
 * Each card is indexed under its canonical name plus every entry in
 * {@link SearchableCard.altNames}, and scores as the best tier any of them
 * reaches. That is what lets one matcher serve surfaces that used to carry
 * their own legend-name and alias lookups.
 *
 * @returns The search index for the given cards.
 */
export function buildCardIndex<TCard extends SearchableCard>(
  cards: readonly TCard[],
  printingsByCardId: ReadonlyMap<string, readonly SearchablePrintingCodes[]>,
): CardSearchIndex<TCard> {
  const entries = cards
    .map((card) => ({
      card,
      names: [card.name, ...(card.altNames ?? [])].map((name) => indexName(name)),
      codes: (printingsByCardId.get(card.id) ?? []).flatMap((printing) => [
        squashForSearch(printing.shortCode),
        squashForSearch(printing.publicCode),
      ]),
    }))
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
    (token) =>
      entry.names.some((name) => name.squashed.includes(token)) ||
      entry.codes.some((code) => code.includes(token)),
  );
}

/**
 * Whether any of a card's names matches on either axis, folded or squashed.
 * The squashed axis is what lets `quickdraw` reach `Quick-Draw` and an already
 * normalized alias key match a query typed with spaces and punctuation. It is
 * the same tolerance `looselyContains` grants identifier-like fields in
 * `filters.ts`, including its tradeoff: squashing joins words, so a substring
 * can straddle a word boundary.
 *
 * @returns True when at least one name satisfies the test on either axis.
 */
function anyName(
  entry: IndexedCard<SearchableCard>,
  folded: string,
  squashed: string,
  test: (haystack: string, needle: string) => boolean,
): boolean {
  return entry.names.some(
    (name) => test(name.folded, folded) || (squashed.length > 0 && test(name.squashed, squashed)),
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
  if (anyName(entry, folded, squashed, (hay, needle) => hay === needle)) {
    return TIER_EXACT_NAME;
  }
  if (squashed && entry.codes.includes(squashed)) {
    return TIER_EXACT_CODE;
  }
  if (anyName(entry, folded, squashed, (hay, needle) => hay.startsWith(needle))) {
    return TIER_NAME_PREFIX;
  }
  // A word-boundary hit beats a mid-word one: typing "jinx" should offer
  // "Mecha Jinx" above a card that merely contains the letters.
  if (entry.names.some((name) => name.words.some((word) => word.startsWith(folded)))) {
    return TIER_WORD_PREFIX;
  }
  if (squashed && entry.codes.some((code) => code.startsWith(squashed))) {
    return TIER_CODE_PREFIX;
  }
  if (anyName(entry, folded, squashed, (hay, needle) => hay.includes(needle))) {
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

/** The outcome of resolving one written card name against the catalogue. */
export type CardResolution<TCard extends SearchableCard> =
  | { status: "matched"; card: TCard }
  | { status: "ambiguous"; candidates: TCard[] }
  | { status: "unmatched" };

/**
 * Resolves a written card name to one card, for importers and deck check.
 *
 * The rule is "unambiguous best tier": whatever the strongest tier any card
 * reaches, exactly one card has to reach it. Several cards tied at the top are
 * `ambiguous` and belong in front of the user, not silently collapsed to the
 * first one.
 *
 * This deliberately does no approximate matching. The importers used to accept
 * any name whose normalized form overlapped a catalogue name by more than 70%,
 * which is not typo tolerance (there is no edit distance in it) but truncation
 * tolerance, and it resolved "Annie" onto whichever longer name happened to
 * sort first without saying so. Both importers already render an `ambiguous`
 * outcome as a review prompt, so surfacing the tie costs a click and removes a
 * class of wrong-card-imported bug.
 *
 * @param index The catalogue index; `altNames` carry legend forms and aliases.
 * @param query One written card name.
 * @returns Which card the name means, or why it could not be decided.
 */
export function resolveCard<TCard extends SearchableCard>(
  index: CardSearchIndex<TCard>,
  query: string,
): CardResolution<TCard> {
  const folded = foldForSearch(query);
  if (!folded) {
    return { status: "unmatched" };
  }
  const squashed = squashForSearch(query);
  const tokens = queryTokens(query);

  let bestTier = TIER_COUNT;
  let candidates: TCard[] = [];
  for (const entry of index.entries) {
    const tier = tierFor(entry, folded, squashed, tokens);
    if (tier === null || tier > bestTier) {
      continue;
    }
    if (tier < bestTier) {
      bestTier = tier;
      candidates = [];
    }
    candidates.push(entry.card);
  }

  if (candidates.length === 0) {
    return { status: "unmatched" };
  }
  const only = candidates[0];
  if (candidates.length === 1 && only) {
    return { status: "matched", card: only };
  }
  return { status: "ambiguous", candidates };
}

/**
 * Whether a free-text query matches any of a card's identifier-like values
 * (names, printing codes, tags). Every whitespace-separated token has to land
 * in at least one of the values, in any order, which is the same rule as
 * {@link searchCards}'s out-of-order tier.
 *
 * This is the unranked counterpart to {@link searchCards}, for callers that
 * need a per-row boolean rather than a top-N list: a table's global filter, a
 * list `.filter()`. It exists so those callers stop hand-rolling
 * `name.toLowerCase().includes(query)`, which misses every card whose stored
 * name carries typographic punctuation (`Doran’s Shield` against a typed
 * `Doran's`).
 *
 * **Identifier-like values only.** Values are squashed, so passing rules or
 * flavor text here invents matches across word boundaries — see
 * {@link squashForSearch}.
 *
 * @param query What the user typed. An empty or punctuation-only query matches
 *   everything, so a cleared filter shows the full list.
 * @param values The card's searchable short strings; nullish entries are skipped.
 * @returns True when every query token appears in at least one value.
 *
 * @example
 * ```ts
 * matchesCardQuery("doran's", ["Doran’s Shield"])   // => true
 * matchesCardQuery("dark annie", ["Annie, Dark Child"]) // => true
 * matchesCardQuery("ogn202", ["Annie", "OGN-202"])  // => true
 * ```
 */
export function matchesCardQuery(
  query: string,
  values: readonly (string | null | undefined)[],
): boolean {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return true;
  }
  const haystacks: string[] = [];
  for (const value of values) {
    if (value) {
      haystacks.push(squashCached(value));
    }
  }
  return tokens.every((token) => haystacks.some((hay) => hay.includes(token)));
}
