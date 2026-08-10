import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";

import { useCards } from "@/hooks/use-cards";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useConditionList } from "@/hooks/use-enums";
import { useUserId } from "@/lib/auth-session";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { useCopiesCollection } from "@/lib/copies-collection";
import type { DeckBoxPlan } from "@/lib/deck-box";
import { computeDeckBoxPlan } from "@/lib/deck-box";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * What it takes to put this deck in its box, recomputed from the live copies
 * feed so a move is reflected the moment it lands.
 *
 * SSR-unsafe (it reads the copies collection through `useLiveQuery`), so mount
 * consumers behind `useHydrated` — see the Box tab.
 * @returns The plan, or undefined while the data loads or when the deck has no
 *   box to fill.
 */
export function useDeckBox(
  cards: readonly DeckBuilderCard[],
  homeCollectionId: string | null | undefined,
  overrides?: ReadonlyMap<string, string>,
): DeckBoxPlan | undefined {
  const userId = useUserId();
  const enabled = Boolean(userId) && Boolean(homeCollectionId);
  const copiesCollection = useCopiesCollection();
  const { printingsByCardId } = useCards();
  const languageOrder = useEffectiveLanguageOrder();
  const conditions = useConditionList();

  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled,
  });
  const { data: copies } = useLiveQuery(
    (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
    [enabled, copiesCollection],
  );

  if (!homeCollectionId || !copies || !collections) {
    return undefined;
  }

  return computeDeckBoxPlan({
    cards,
    copies,
    homeCollectionId,
    printingsByCardId,
    collectionNameById: new Map(collections.map((collection) => [collection.id, collection.name])),
    languageOrder,
    conditionOrder: conditions.map((condition) => condition.slug),
    overrides,
  });
}
