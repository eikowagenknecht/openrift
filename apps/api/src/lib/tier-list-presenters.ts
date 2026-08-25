import type {
  PublicTierListResponse,
  TierListResponse,
  TierListSummaryResponse,
} from "@openrift/shared";

import type { TierListCard, TierListRow } from "../db/index.js";
import type { TierList } from "../repositories/tier-lists.js";

/**
 * How much board the index page previews: the leading filled rows, and the
 * leading cards in each. Enough that the preview reads as a ranking rather than
 * a strip of art, and bounded so a listing of twenty lists stays a small
 * response — a board can hold hundreds of cards and the index draws none of
 * them past this.
 */
const PREVIEW_ROW_COUNT = 4;
const PREVIEW_ROW_CARD_COUNT = 14;

function toTierCard(card: TierListCard): { cardId: string; printingId: string | null } {
  return { cardId: card.cardId, printingId: card.printingId };
}

// The unranked flag is sent only when set, so an ordinary board stays as
// small on the wire as it was before the row existed.
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

/**
 * Maps a tier list row to the index-page projection: counts plus the top of the
 * board, without shipping every board in full.
 *
 * Empty tiers are skipped rather than previewed as blank rows — a creator who
 * has started ranking into A while S is still empty should see their work, not
 * the gap above it. Each row keeps its real board index, because that is what
 * the tier colour is derived from.
 */
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

/**
 * Maps a tier list row to the anonymous share view. Drops `shareToken` and
 * `isPublic`: the viewer already holds the token, and the flag is the owner's
 * business.
 */
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
