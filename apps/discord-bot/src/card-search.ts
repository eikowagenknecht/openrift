import { foldForSearch, squashForSearch } from "@openrift/shared";

import type { CatalogCard, CatalogPrinting } from "./catalog-cache.js";

interface IndexedCard {
  card: CatalogCard;
  folded: string;
  /** Squashed printing codes (short + public), for `ogn202`-style lookups. */
  codes: string[];
}

export interface CardIndex {
  entries: IndexedCard[];
  bySlug: Map<string, CatalogCard>;
}

/**
 * Precomputes folded card names and squashed printing codes once per catalog
 * refresh so every lookup is a scan over ready-made strings. Codes go through
 * `squashForSearch` — the same folding the site's search uses — so `ogn202`
 * matches `OGN-202` and `ogn202298` matches `OGN-202/298`.
 *
 * @returns The search index for the given cards.
 */
export function buildCardIndex(
  cards: CatalogCard[],
  printingsByCardId: Map<string, CatalogPrinting[]>,
): CardIndex {
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
export function searchCards(index: CardIndex, query: string, limit: number): CatalogCard[] {
  const folded = foldForSearch(query);
  if (!folded) {
    return [];
  }
  const squashed = squashForSearch(query);
  const tiers: CatalogCard[][] = [[], [], [], [], []];
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
 * Resolves a query to a single card: an exact slug hit (the slash command's
 * autocomplete round-trips slugs) or the best free-text match.
 *
 * @returns The matched card, or undefined when nothing matches.
 */
export function findCard(index: CardIndex, query: string): CatalogCard | undefined {
  return index.bySlug.get(query.trim()) ?? searchCards(index, query, 1)[0];
}
