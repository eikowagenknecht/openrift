import type {
  CardType,
  DeckCardResponse,
  DeckPlanResponse,
  DeckResponse,
  DeckSummaryResponse,
  Domain,
  PublicDeckCardResponse,
  PublicDeckResponse,
  SuperType,
} from "@openrift/shared";
import { descriptionSnippet } from "@openrift/shared";
import type { Selectable } from "kysely";

import type { DecksTable } from "../db/index.js";
import type { DeckPlanData } from "../repositories/deck-plans.js";

export function toDeck(row: Selectable<DecksTable>): DeckResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    format: row.format,
    formatConfig: row.formatConfig,
    isWanted: row.isWanted,
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    isPinned: row.isPinned,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    oddsConfig: row.oddsConfig,
    coverCardId: row.coverCardId,
    coverPrintingId: row.coverPrintingId,
    coverPosition: row.coverPosition,
  };
}

/** @returns Slimmed-down deck fields for the list view. */
export function toDeckSummary(row: Selectable<DecksTable>): DeckSummaryResponse {
  return {
    id: row.id,
    name: row.name,
    descriptionSnippet: descriptionSnippet(row.description),
    format: row.format,
    formatConfig: row.formatConfig,
    isPinned: row.isPinned,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    coverCardId: row.coverCardId,
    coverPrintingId: row.coverPrintingId,
    coverPosition: row.coverPosition,
  };
}

/** @returns Public-facing deck fields — excludes shareToken, isPublic, and userId. */
export function toPublicDeck(row: Selectable<DecksTable>): PublicDeckResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    format: row.format,
    formatConfig: row.formatConfig,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    oddsConfig: row.oddsConfig,
    coverCardId: row.coverCardId,
    coverPrintingId: row.coverPrintingId,
    coverPosition: row.coverPosition,
  };
}

/**
 * Maps a deck's stored plan data to the wire shape; deck-level fields default
 * to empty when no row exists.
 *
 * @returns The plan response.
 */
export function toDeckPlan(data: DeckPlanData): DeckPlanResponse {
  const { plan, matchups } = data;
  return {
    generalStrategy: plan?.generalStrategy ?? "",
    mulliganSplit: plan?.mulliganSplit ?? false,
    mulliganGeneral: plan?.mulliganGeneral ?? "",
    mulliganFirst: plan?.mulliganFirst ?? "",
    mulliganSecond: plan?.mulliganSecond ?? "",
    battlefieldGame1CardId: plan?.battlefieldG1CardId ?? null,
    battlefieldFirstCardId: plan?.battlefieldFirstCardId ?? null,
    battlefieldSecondCardId: plan?.battlefieldSecondCardId ?? null,
    battlefieldCustom: plan?.battlefieldCustom ?? false,
    battlefieldNote: plan?.battlefieldNote ?? "",
    matchups: matchups.map((matchup) => ({
      id: matchup.id,
      opponentCardId: matchup.opponentCardId,
      opponentLabel: matchup.opponentLabel,
      notes: matchup.notes,
      swaps: matchup.swaps.map((swap) => ({
        cardId: swap.cardId,
        direction: swap.direction,
        quantity: swap.quantity,
      })),
    })),
  };
}

/**
 * True when a plan has no deck-level content and no matchups — the public page
 * renders nothing for it.
 *
 * @returns Whether the plan is empty.
 */
export function isEmptyDeckPlan(plan: DeckPlanResponse): boolean {
  return (
    plan.generalStrategy === "" &&
    plan.mulliganGeneral === "" &&
    plan.mulliganFirst === "" &&
    plan.mulliganSecond === "" &&
    plan.battlefieldGame1CardId === null &&
    plan.battlefieldFirstCardId === null &&
    plan.battlefieldSecondCardId === null &&
    plan.battlefieldNote === "" &&
    plan.matchups.length === 0
  );
}

/**
 * Maps a denormalized deck card row to DeckCardResponse.
 * @returns The serialized deck card response.
 */
export function toDeckCard(row: {
  cardId: string;
  zone: string;
  quantity: number;
  preferredPrintingId: string | null;
}): DeckCardResponse {
  return {
    cardId: row.cardId,
    zone: row.zone as DeckCardResponse["zone"],
    quantity: row.quantity,
    preferredPrintingId: row.preferredPrintingId,
  };
}

/**
 * Composes an enriched public-deck card from the raw deck-card row, the
 * card's catalog row, and the resolved printing meta. The public share-deck
 * endpoint denormalizes this so the share page can SSR without pulling the
 * global catalog.
 *
 * @param deckCard The raw deck-card row.
 * @param cardMeta The card's catalog row.
 * @param printingMeta The resolved printing meta.
 * @param banned Whether the card is on the base banlist. The share page feeds
 *   this into the rule engine, which otherwise can't see bans.
 * @returns The serialized public deck card response.
 */
export function toPublicDeckCard(
  deckCard: { cardId: string; zone: string; quantity: number; preferredPrintingId: string | null },
  cardMeta: {
    name: string;
    slug: string;
    type: CardType;
    types: CardType[];
    superTypes: SuperType[];
    domains: Domain[];
    tags: string[];
    keywords: string[];
    maxCopiesOverride: number | null;
    energy: number | null;
    might: number | null;
    power: number | null;
  },
  printingMeta: {
    resolvedPrintingId: string | null;
    shortCode: string | null;
    imageId: string | null;
  },
  banned: boolean,
): PublicDeckCardResponse {
  return {
    cardId: deckCard.cardId,
    zone: deckCard.zone as PublicDeckCardResponse["zone"],
    quantity: deckCard.quantity,
    preferredPrintingId: deckCard.preferredPrintingId,
    cardName: cardMeta.name,
    cardSlug: cardMeta.slug,
    cardType: cardMeta.type,
    cardTypes: cardMeta.types as PublicDeckCardResponse["cardTypes"],
    superTypes: cardMeta.superTypes,
    domains: cardMeta.domains,
    tags: cardMeta.tags,
    keywords: cardMeta.keywords,
    maxCopiesOverride: cardMeta.maxCopiesOverride,
    banned,
    energy: cardMeta.energy,
    might: cardMeta.might,
    power: cardMeta.power,
    resolvedPrintingId: printingMeta.resolvedPrintingId,
    shortCode: printingMeta.shortCode,
    imageId: printingMeta.imageId,
  };
}
