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
    .map((card) => ({
      card,
      folded: foldForSearch(card.name),
      codes: (printingsByCardId.get(card.id) ?? []).flatMap((printing) => [
        squashForSearch(printing.shortCode),
        squashForSearch(printing.publicCode),
      ]),
    }))
    .toSorted((a, b) => a.card.name.localeCompare(b.card.name));
  return { entries, bySlug: new Map(cards.map((card) => [card.slug, card])) };
}

/**
 * Ranks cards against a free-text query: exact folded name match first, then
 * exact printing-code matches, then name prefix, code prefix, and name
 * substring matches, each tier alphabetical (the index order). Names use the
 * same `foldForSearch` folding as the site, so apostrophes and typographic
 * punctuation never decide a match.
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
  const tiers: TCard[][] = [[], [], [], [], []];
  for (const entry of index.entries) {
    if (entry.folded === folded) {
      tiers[0]?.push(entry.card);
    } else if (squashed && entry.codes.includes(squashed)) {
      tiers[1]?.push(entry.card);
    } else if (entry.folded.startsWith(folded)) {
      tiers[2]?.push(entry.card);
    } else if (squashed && entry.codes.some((code) => code.startsWith(squashed))) {
      tiers[3]?.push(entry.card);
    } else if (entry.folded.includes(folded)) {
      tiers[4]?.push(entry.card);
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
