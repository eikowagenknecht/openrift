import type {
  PublicTierListResponse,
  TierListResponse,
  TierListSummaryResponse,
} from "@openrift/shared";

import type { TierListCard, TierListRow } from "../db/index.js";
import type { TierList } from "../repositories/tier-lists.js";

/** Cards shown in the index page's preview strip for a list. */
const PREVIEW_CARD_COUNT = 6;

/** @returns One ranked entry as its response shape, detached from the row. */
function toTierCard(card: TierListCard): { cardId: string; printingId: string | null } {
  return { cardId: card.cardId, printingId: card.printingId };
}

/** @returns One board row as its response shape, detached from the row. */
function toTierRow(tier: TierListRow) {
  return { label: tier.label, cards: tier.cards.map(toTierCard) };
}

/**
 * Maps a tier list row to the owner-facing response.
 * @returns The list as a `TierListResponse`.
 */
export function toTierList(row: TierList): TierListResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    setId: row.setId,
    tiers: row.tiers.map(toTierRow),
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Maps a tier list row to the index-page projection: counts plus a short
 * preview strip, without shipping every board in full.
 *
 * The preview comes from the first row that actually holds cards, not from row
 * zero — a creator who has started ranking into A while S is still empty should
 * still see their work on the index.
 * @returns The list as a `TierListSummaryResponse`.
 */
export function toTierListSummary(row: TierList): TierListSummaryResponse {
  const firstFilled = row.tiers.find((tier) => tier.cards.length > 0);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    setId: row.setId,
    tierCount: row.tiers.length,
    cardCount: row.tiers.reduce((sum, tier) => sum + tier.cards.length, 0),
    previewCards: firstFilled
      ? firstFilled.cards.slice(0, PREVIEW_CARD_COUNT).map((card) => toTierCard(card))
      : [],
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
 * @returns The list as a `PublicTierListResponse`.
 */
export function toPublicTierList(row: TierList): PublicTierListResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    setId: row.setId,
    tiers: row.tiers.map(toTierRow),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
