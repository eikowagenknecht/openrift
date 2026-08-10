import type { Card, CardType, DeckListItemResponse, Domain } from "@openrift/shared";
import {
  descriptionSnippet,
  requiredZoneProgress,
  validateDeck,
  WellKnown,
} from "@openrift/shared";

import { toDeckBuilderCard, toRuleEngineCard } from "@/lib/deck-builder-card";
import type { LocalDeck } from "@/stores/local-decks-store";

/** Catalog/enum data needed to derive a list item from a local deck's cards. */
export interface LocalDeckListItemContext {
  cardsById: Record<string, Card>;
  cardTypeOrder: readonly string[];
  domainOrder: readonly string[];
}

// Mirror the server list endpoint (apps/api/.../decks.ts `list`): type/domain
// stats come from the main + champion zones, and Legend/Rune/Battlefield types
// don't count toward the unit/spell/gear breakdown.
const EXCLUDED_TYPES = new Set<string>([
  WellKnown.cardType.LEGEND,
  WellKnown.cardType.RUNE,
  WellKnown.cardType.BATTLEFIELD,
]);
const COUNTED_ZONES = new Set<string>([WellKnown.deckZone.MAIN, WellKnown.deckZone.CHAMPION]);

/**
 * Synthesize the server `DeckListItemResponse` shape for a browser-local deck
 * (ADR-035) so it flows through the same sort / filter / group / tile code as
 * server decks. Derivation matches the server list endpoint; owner-only and
 * server-computed fields are constants (`isPinned`/`archivedAt`/value).
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

  const legend = builderCards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const champion = builderCards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);

  const totalCards = builderCards
    .filter((card) => card.zone !== WellKnown.deckZone.OVERFLOW)
    .reduce((sum, card) => sum + card.quantity, 0);

  const { progress: requiredProgress, total: requiredTotal } = requiredZoneProgress(
    builderCards,
    localDeck.format,
  );

  const typeCountMap = new Map<CardType, number>();
  const domainCountMap = new Map<Domain, number>();
  for (const card of builderCards) {
    if (!COUNTED_ZONES.has(card.zone)) {
      continue;
    }
    for (const cardType of card.cardTypes) {
      if (!EXCLUDED_TYPES.has(cardType)) {
        typeCountMap.set(cardType, (typeCountMap.get(cardType) ?? 0) + card.quantity);
      }
    }
    for (const domain of card.domains) {
      domainCountMap.set(domain, (domainCountMap.get(domain) ?? 0) + card.quantity);
    }
  }
  const typeCounts = ctx.cardTypeOrder
    .filter((type) => typeCountMap.has(type as CardType))
    .map((type) => ({
      cardType: type as CardType,
      count: typeCountMap.get(type as CardType) ?? 0,
    }));
  const domainDistribution = ctx.domainOrder
    .filter((domain) => domainCountMap.has(domain as Domain))
    .map((domain) => ({
      domain: domain as Domain,
      count: domainCountMap.get(domain as Domain) ?? 0,
    }));

  // Mirror the server: only Constructed reports a real pass/fail in the list;
  // other formats show valid there and surface violations on the deck page.
  const isValid =
    localDeck.format === WellKnown.deckFormat.CONSTRUCTED
      ? validateDeck({
          format: WellKnown.deckFormat.CONSTRUCTED,
          formatConfig: null,
          cards: builderCards.map((card) => toRuleEngineCard(card, {})),
        }).length === 0
      : true;

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
    },
    legendCardId: legend?.cardId ?? null,
    championCardId: champion?.cardId ?? null,
    totalCards,
    typeCounts,
    domainDistribution,
    isValid,
    requiredProgress,
    requiredTotal,
    totalValueCents: null,
    // Browser-local decks (ADR-035) have no server inventory to diff against.
    missingCount: null,
  };
}
