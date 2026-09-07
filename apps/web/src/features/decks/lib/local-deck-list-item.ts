import { isValidInDeckList, summarizeDeckCards } from "@openrift/shared/deck-list-summary";
import { requiredZoneProgress } from "@openrift/shared/deck-zones";
import { descriptionSnippet } from "@openrift/shared/description-snippet";
import type { DeckListItemResponse } from "@openrift/shared/types/api/deck";
import type { Card } from "@openrift/shared/types/catalog";

import { toDeckBuilderCard, toRuleEngineCard } from "@/features/decks/lib/deck-builder-card";
import type { LocalDeck } from "@/features/decks/lib/local-deck";

export interface LocalDeckListItemContext {
  cardsById: Record<string, Card>;
  cardTypeOrder: readonly string[];
  domainOrder: readonly string[];
}

/** Synthesizes the server `DeckListItemResponse` shape so a local deck flows through the same sort/filter/group/tile code as server decks. */
export function localDeckToListItem(
  localDeck: LocalDeck,
  ctx: LocalDeckListItemContext,
): DeckListItemResponse {
  const builderCards = localDeck.cards
    .map((card) => toDeckBuilderCard(card, ctx.cardsById))
    .filter((card): card is NonNullable<typeof card> => card !== null);

  const stats = summarizeDeckCards(builderCards, {
    cardTypes: ctx.cardTypeOrder,
    domains: ctx.domainOrder,
  });

  const { progress: requiredProgress, total: requiredTotal } = requiredZoneProgress(
    builderCards,
    localDeck.format,
  );

  const isValid = isValidInDeckList(
    localDeck.format,
    builderCards.map((card) => toRuleEngineCard(card, {})),
  );

  return {
    deck: {
      id: localDeck.id,
      name: localDeck.name,
      descriptionSnippet: descriptionSnippet(localDeck.description),
      format: localDeck.format,
      formatConfig: localDeck.formatConfig,
      isPinned: false,
      archivedAt: null,
      coverCardId: localDeck.coverCardId,
      coverPrintingId: localDeck.coverPrintingId,
      coverPosition: localDeck.coverPosition,
      createdAt: localDeck.createdAt,
      updatedAt: localDeck.updatedAt,
      // A browser-local deck can't reference a server collection.
      collectionId: null,
      // Variant families are server-only; local decks are standalone.
      familyId: null,
      predecessorDeckId: null,
      isPrimary: false,
      isDraft: false,
    },
    ...stats,
    isValid,
    requiredProgress,
    requiredTotal,
    totalValueCents: null,
    // Browser-local decks have no server inventory to diff against.
    missingCount: null,
    // Folders are a server-side, per-user feature; a browser-local deck is
    // never filed in one.
    folderIds: [],
  };
}
