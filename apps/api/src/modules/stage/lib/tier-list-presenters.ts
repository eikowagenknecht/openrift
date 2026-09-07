import type {
  PublicTierListResponse,
  TierListResponse,
  TierListSummaryResponse,
} from "@openrift/shared/types/api/tier-list";

import type { TierListCard, TierListRow } from "../../../db/tables/stage.js";
import type { TierList } from "../repositories/tier-lists.js";

const PREVIEW_ROW_COUNT = 4;
const PREVIEW_ROW_CARD_COUNT = 14;

function toTierCard(card: TierListCard): { cardId: string; printingId: string | null } {
  return { cardId: card.cardId, printingId: card.printingId };
}

function toTierRow(tier: TierListRow) {
  const row: { label: string; cards: ReturnType<typeof toTierCard>[]; unranked?: boolean } = {
    label: tier.label,
    cards: tier.cards.map(toTierCard),
  };
  if (tier.unranked === true) {
    row.unranked = true;
  }
  return row;
}

export function toTierList(row: TierList): TierListResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tiers: row.tiers.map(toTierRow),
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Preview rows keep their real board index (not the post-filter position): the tier colour is derived from it. */
export function toTierListSummary(row: TierList): TierListSummaryResponse {
  const previewRows = row.tiers
    .map((tier, rowIndex) => ({ tier, rowIndex }))
    .filter(({ tier }) => tier.cards.length > 0)
    .slice(0, PREVIEW_ROW_COUNT)
    .map(({ tier, rowIndex }) => {
      const preview: TierListSummaryResponse["previewRows"][number] = {
        rowIndex,
        label: tier.label,
        cards: tier.cards.slice(0, PREVIEW_ROW_CARD_COUNT).map((card) => toTierCard(card)),
      };
      if (tier.unranked === true) {
        preview.unranked = true;
      }
      return preview;
    });

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tierCount: row.tiers.length,
    cardCount: row.tiers.reduce((sum, tier) => sum + tier.cards.length, 0),
    previewRows,
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Drops `shareToken` and `isPublic`: the viewer already holds the token, and the flag is the owner's business. */
export function toPublicTierList(row: TierList): PublicTierListResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tiers: row.tiers.map(toTierRow),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
