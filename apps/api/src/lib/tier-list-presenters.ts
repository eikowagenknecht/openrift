import type {
  PublicTierListResponse,
  TierListResponse,
  TierListSummaryResponse,
} from "@openrift/shared";

import type { TierList } from "../repositories/tier-lists.js";

/** Cards shown in the index page's preview strip for a list. */
const PREVIEW_CARD_COUNT = 6;

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
    tiers: row.tiers.map((tier) => ({ label: tier.label, cardIds: [...tier.cardIds] })),
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
  const firstFilled = row.tiers.find((tier) => tier.cardIds.length > 0);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    setId: row.setId,
    tierCount: row.tiers.length,
    cardCount: row.tiers.reduce((sum, tier) => sum + tier.cardIds.length, 0),
    previewCardIds: firstFilled ? firstFilled.cardIds.slice(0, PREVIEW_CARD_COUNT) : [],
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
    tiers: row.tiers.map((tier) => ({ label: tier.label, cardIds: [...tier.cardIds] })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
