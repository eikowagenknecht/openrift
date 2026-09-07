import { WellKnown } from "@openrift/shared/well-known";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries, useQuery } from "@tanstack/react-query";

import { useCards } from "@/features/cards/hooks/use-cards";
import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { useCopiesCollection } from "@/features/collections/lib/copies-collection";
import { deckDetailQueryOptions } from "@/features/decks/hooks/use-decks";
import type { DeckBoxPlan } from "@/features/decks/lib/deck-box";
import { computeDeckBoxPlan } from "@/features/decks/lib/deck-box";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useConditionList } from "@/hooks/use-enums";
import { useUserId } from "@/lib/auth-session";

/** SSR-unsafe (reads the copies collection through `useLiveQuery`); mount consumers behind `useHydrated`. */
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
  const { data: copies } = useLiveQuery({
    query: (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
  });

  // Cards claimed by another deck sharing this box must be excluded before computing surplus.
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
