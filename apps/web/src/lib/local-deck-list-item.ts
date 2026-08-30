import type { Card, DeckListItemResponse } from "@openrift/shared";
import {
  descriptionSnippet,
  isValidInDeckList,
  requiredZoneProgress,
  summarizeDeckCards,
} from "@openrift/shared";

import { toDeckBuilderCard, toRuleEngineCard } from "@/lib/deck-builder-card";
import type { LocalDeck } from "@/stores/local-decks-store";

/** Catalog/enum data needed to derive a list item from a local deck's cards. */
export interface LocalDeckListItemContext {
  cardsById: Record<string, Card>;
  cardTypeOrder: readonly string[];
  domainOrder: readonly string[];
}

/**
 * Synthesize the server `DeckListItemResponse` shape for a browser-local deck
 * (ADR-035) so it flows through the same sort / filter / group / tile code as
 * server decks. Owner-only and server-computed fields are constants
 * (`isPinned`/`archivedAt`/value).
 *
 * @returns A list item for the local deck.
 */
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
      // A browser-local deck can't reference a server collection (ADR-035),
      // so it never has a deck box.
      collectionId: null,
      // Variant families (ADR-042) are server-only; local decks are standalone.
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
    // Browser-local decks (ADR-035) have no server inventory to diff against.
    missingCount: null,
    // Folders are a server-side, per-user feature (migration 231); a
    // browser-local deck is never filed in one. The deck list hides the folder
    // controls entirely while signed out.
    folderIds: [],
  };
}
