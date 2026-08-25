import { WellKnown } from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries, useQuery } from "@tanstack/react-query";

import { useCards } from "@/hooks/use-cards";
import { deckDetailQueryOptions } from "@/hooks/use-decks";
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
  deckId: string,
  cards: readonly DeckBuilderCard[],
  homeCollectionId: string | null | undefined,
  pinnedCopyIds?: ReadonlySet<string>,
): DeckBoxPlan | undefined {
  const userId = useUserId();
  const enabled = Boolean(userId) && Boolean(homeCollectionId);
  const copiesCollection = useCopiesCollection();
  const { printingsByCardId, printingsById } = useCards();
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

  // Another deck may live in the same box. Its cards belong there too, so the
  // sweep has to know what they are before calling anything surplus.
  const sharingDeckIds =
    collections
      ?.find((collection) => collection.id === homeCollectionId)
      ?.homeDecks.filter((deck) => deck.id !== deckId)
      .map((deck) => deck.id) ?? [];
  const sharingDecks = useQueries({
    queries: sharingDeckIds.map((id) => ({
      ...deckDetailQueryOptions(userId ?? "", id),
      enabled,
    })),
  });

  if (!homeCollectionId || !copies || !collections) {
    return undefined;
  }

  const otherDeckNeeds = new Map<string, number>();
  for (const query of sharingDecks) {
    for (const card of query.data?.cards ?? []) {
      if (card.zone === WellKnown.deckZone.OVERFLOW) {
        continue;
      }
      otherDeckNeeds.set(card.cardId, (otherDeckNeeds.get(card.cardId) ?? 0) + card.quantity);
    }
  }

  return computeDeckBoxPlan({
    cards,
    copies,
    homeCollectionId,
    printingsByCardId,
    printingsById,
    collectionNameById: new Map(collections.map((collection) => [collection.id, collection.name])),
    otherDeckNeeds,
    languageOrder,
    conditionOrder: conditions.map((condition) => condition.slug),
    pinnedCopyIds,
  });
}
