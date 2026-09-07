import { foldForSearch, squashCached, squashForSearch } from "./search-fold.js";

export const CARD_SEARCH_MIN_QUERY_LENGTH = 2;

export const CARD_SEARCH_RESULT_LIMIT = 20;

export interface SearchableCard {
  id: string;
  slug: string;
  name: string;
  altNames?: readonly string[];
}

export interface SearchablePrintingCodes {
  shortCode: string;
  publicCode: string;
}

interface IndexedName {
  folded: string;
  words: string[];
  squashed: string;
}

interface IndexedCard<TCard extends SearchableCard> {
  card: TCard;
  names: IndexedName[];
  codes: string[];
}

export interface CardSearchIndex<TCard extends SearchableCard> {
  entries: IndexedCard<TCard>[];
  bySlug: Map<string, TCard>;
}

function indexName(name: string): IndexedName {
  const folded = foldForSearch(name);
  return {
    folded,
    words: folded.split(" ").filter((word) => word.length > 0),
    squashed: squashForSearch(name),
  };
}

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

const TIER_EXACT_NAME = 0;
const TIER_EXACT_CODE = 1;
const TIER_NAME_PREFIX = 2;
const TIER_WORD_PREFIX = 3;
const TIER_CODE_PREFIX = 4;
const TIER_NAME_SUBSTRING = 5;
const TIER_CODE_SUBSTRING = 6;
const TIER_TOKENS = 7;
const TIER_COUNT = 8;

function queryTokens(query: string): string[] {
  return query
    .split(/\s+/u)
    .map((part) => squashForSearch(part))
    .filter((token) => token.length > 0);
}

function matchesEveryToken(entry: IndexedCard<SearchableCard>, tokens: string[]): boolean {
  return tokens.every(
    (token) =>
      entry.names.some((name) => name.squashed.includes(token)) ||
      entry.codes.some((code) => code.includes(token)),
  );
}

/** Squashing joins words, so a substring can straddle a word boundary. */
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
  if (tokens.length > 0 && matchesEveryToken(entry, tokens)) {
    return TIER_TOKENS;
  }
  return null;
}

/** The app's only card matcher: every picker, palette, the Discord bot, and the chat lookup rank through it. */
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

/** Tries an exact slug hit first (the Discord slash command round-trips slugs), then the best free-text match. */
export function findCard<TCard extends SearchableCard>(
  index: CardSearchIndex<TCard>,
  query: string,
): TCard | undefined {
  return index.bySlug.get(query.trim()) ?? searchCards(index, query, 1)[0];
}

export type CardResolution<TCard extends SearchableCard> =
  | { status: "matched"; card: TCard }
  | { status: "ambiguous"; candidates: TCard[] }
  | { status: "unmatched" };

/** Does no fuzzy matching: cards tied at the best tier are reported `ambiguous`, never picked arbitrarily. */
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
 * Identifier-like values only: values are squashed, so passing rules or
 * flavor text here invents matches across word boundaries.
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
