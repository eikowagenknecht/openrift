import { foldForSearch } from "@openrift/shared";

import type { CatalogCard } from "./catalog-cache.js";

interface IndexedCard {
  card: CatalogCard;
  folded: string;
}

export interface CardIndex {
  entries: IndexedCard[];
  bySlug: Map<string, CatalogCard>;
}

/**
 * Precomputes the folded card names once per catalog refresh so every lookup
 * is a scan over ready-made strings.
 *
 * @returns The search index for the given cards.
 */
export function buildCardIndex(cards: CatalogCard[]): CardIndex {
  const entries = cards
    .map((card) => ({ card, folded: foldForSearch(card.name) }))
    .toSorted((a, b) => a.card.name.localeCompare(b.card.name));
  return { entries, bySlug: new Map(cards.map((card) => [card.slug, card])) };
}

/**
 * Ranks cards against a free-text query: exact folded match first, then
 * prefix matches, then substring matches, each tier alphabetical (the index
 * order). Uses the same `foldForSearch` folding as the site, so apostrophes
 * and typographic punctuation never decide a match.
 *
 * @returns Up to `limit` matching cards, best first.
 */
export function searchCards(index: CardIndex, query: string, limit: number): CatalogCard[] {
  const folded = foldForSearch(query);
  if (!folded) {
    return [];
  }
  const exact: CatalogCard[] = [];
  const prefix: CatalogCard[] = [];
  const substring: CatalogCard[] = [];
  for (const entry of index.entries) {
    if (entry.folded === folded) {
      exact.push(entry.card);
    } else if (entry.folded.startsWith(folded)) {
      prefix.push(entry.card);
    } else if (entry.folded.includes(folded)) {
      substring.push(entry.card);
    }
  }
  return [...exact, ...prefix, ...substring].slice(0, limit);
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
