import type { Card, Printing } from "@openrift/shared";
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

  const { data: rawPrintings } = useLiveSuspenseQuery((q) => q.from({ printing: printings }));
  const { data: rawCards } = useLiveSuspenseQuery((q) => q.from({ card: cards }));
  const { data: rawSets } = useLiveSuspenseQuery((q) => q.from({ set: sets }));

  return enrichFromCollections(rawPrintings, rawCards, rawSets);
}

function enrichFromCollections(
  rawPrintings: readonly CatalogPrintingItem[],
  rawCards: readonly CatalogCardItem[],
  rawSets: readonly CatalogSetItem[],
): UseCardsResult {
  const slugById = new Map(rawSets.map((s) => [s.id, s.slug]));

  const cardsById: Record<string, Card> = {};
  for (const { id, ...card } of rawCards) {
    cardsById[id] = card;
  }

  const allPrintings: Printing[] = [];
  const printingsById: Record<string, Printing> = {};
  for (const raw of rawPrintings) {
    const setSlug = slugById.get(raw.setId);
    const card = cardsById[raw.cardId];
    if (setSlug && card) {
      const printing: Printing = { ...raw, setSlug, card };
      allPrintings.push(printing);
      printingsById[raw.id] = printing;
    }
  }

  const printingsByCardId = Map.groupBy(allPrintings, (p) => p.cardId);
  const setOrderMap = new Map(rawSets.map((s, i) => [s.id, i]));

  return {
    allPrintings,
    cardsById,
    printingsById,
    printingsByCardId,
    setOrderMap,
    sets: [...rawSets],
  };
}
