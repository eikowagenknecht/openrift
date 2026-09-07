import { descriptionSnippet } from "@openrift/shared/description-snippet";
import type {
  DeckCardResponse,
  DeckPlanResponse,
  DeckResponse,
  DeckSummaryResponse,
  PublicDeckCardResponse,
  PublicDeckResponse,
} from "@openrift/shared/types/api/deck";
import type { CardType, Domain, SuperType } from "@openrift/shared/types/enums";
import type { Selectable } from "kysely";

import type { DecksTable } from "../../../db/tables/decks.js";
import type { DeckPlanData } from "../repositories/deck-plans.js";

export function toDeck(row: Selectable<DecksTable>): DeckResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    format: row.format,
    formatConfig: row.formatConfig,
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
    links: row.links,
    collectionId: row.collectionId,
    familyId: row.familyId,
    predecessorDeckId: row.predecessorDeckId,
    isPrimary: row.isPrimary,
    isDraft: row.isDraft,
  };
}

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
    collectionId: row.collectionId,
    familyId: row.familyId,
    predecessorDeckId: row.predecessorDeckId,
    isPrimary: row.isPrimary,
    isDraft: row.isDraft,
  };
}

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
    links: row.links,
  };
}

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

/** `banned` is precomputed by the caller; the share page's rule engine can't see bans on its own. */
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
