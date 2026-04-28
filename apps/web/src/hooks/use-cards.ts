import type { Card, Printing } from "@openrift/shared";
import { sortByLanguageAndCanonicalRank } from "@openrift/shared";
import { useLiveSuspenseQuery } from "@tanstack/react-db";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import type {
  CatalogCardItem,
  CatalogPrintingItem,
  CatalogSetItem,
} from "@/lib/catalog-collections";
import { getCatalogCollections } from "@/lib/catalog-collections";
import type { UseCardsResult } from "@/lib/catalog-query";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { useDisplayStore } from "@/stores/display-store";

// Re-export for consumers that import catalogQueryOptions from here
// (landing-page.tsx uses it for the totalCopies stat).
export { catalogQueryOptions } from "@/lib/catalog-query";

export function useCards(): UseCardsResult {
  const queryClient = useQueryClient();
  const { sets, cards, printings } = getCatalogCollections(queryClient);

  // query-db-collection marks the collection ready even on query error (see
  // query.ts in @tanstack/query-db-collection), so useLiveSuspenseQuery alone
  // cannot surface a failed catalog fetch — it would render with empty data.
  // Drive error propagation through useSuspenseQuery on the same query key;
  // the underlying fetch is shared via queryClient cache, so no extra request.
  useSuspenseQuery(catalogQueryOptions);

  // Live query sorts by `canonicalRank` — the single-integer sort key computed
  // by the `printings_ordered` DB view (see migration 096). That encodes the
  // DB-default canonical order including language. Users with a language
  // preference re-sort post-query below.
  const { data: rawPrintings } = useLiveSuspenseQuery((q) =>
    q.from({ printing: printings }).orderBy(({ printing }) => printing.canonicalRank),
  );
  const { data: rawCards } = useLiveSuspenseQuery((q) => q.from({ card: cards }));
  // Without an explicit orderBy, the live query iterates the collection by
  // its uuidv7 key (creation time), not by `sets.sort_order`. Sort by the
  // injected `sortOrder` so the live grid groups sets in the same order the
  // API returned them.
  const { data: rawSets } = useLiveSuspenseQuery((q) =>
    q.from({ set: sets }).orderBy(({ set }) => set.sortOrder),
  );

  const userLanguages = useDisplayStore((state) => state.languages);

  return enrichFromCollections(rawPrintings, rawCards, rawSets, userLanguages);
}

export function enrichFromCollections(
  rawPrintings: readonly CatalogPrintingItem[],
  rawCards: readonly CatalogCardItem[],
  rawSets: readonly CatalogSetItem[],
  userLanguages: readonly string[],
): UseCardsResult {
  const orderedSets = rawSets.toSorted((a, b) => a.sortOrder - b.sortOrder);
  const setsById = new Map(orderedSets.map((s) => [s.id, s]));

  const cardsById: Record<string, Card> = {};
  for (const { id, ...card } of rawCards) {
    cardsById[id] = card;
  }

  const allPrintings: Printing[] = [];
  const printingsById: Record<string, Printing> = {};
  for (const raw of rawPrintings) {
    const set = setsById.get(raw.setId);
    const card = cardsById[raw.cardId];
    if (set && card) {
      const printing: Printing = { ...raw, setSlug: set.slug, setReleased: set.released, card };
      allPrintings.push(printing);
      printingsById[raw.id] = printing;
    }
  }

  // If the user has a language preference, re-sort by (userLangRank, canonicalRank).
  // Within each language bucket, canonicalRank preserves the remaining canonical
  // axes (set, shortCode, marker, finish). Default users (no preference) get the
  // DB order from the live query's orderBy above — no JS sort needed.
  const sortedPrintings =
    userLanguages.length > 0
      ? sortByLanguageAndCanonicalRank(allPrintings, userLanguages)
      : allPrintings;

  const printingsByCardId = Map.groupBy(sortedPrintings, (p) => p.cardId);

  return {
    allPrintings: sortedPrintings,
    cardsById,
    printingsById,
    printingsByCardId,
    sets: orderedSets,
  };
}
