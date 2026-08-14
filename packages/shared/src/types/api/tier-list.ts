import type {
  publicTierListDetailResponseSchema,
  publicTierListResponseSchema,
} from "@openrift/shared/contracts/public-tier-lists";
import type {
  tierListListResponseSchema,
  tierListResponseSchema,
  tierListShareResponseSchema,
  tierListSummaryResponseSchema,
  tierCardResponseSchema,
  tierRowResponseSchema,
} from "@openrift/shared/contracts/tier-lists";
import type { z } from "zod";

/** One ranked entry: the card, plus the printing whose art the tile shows. */
export type TierCard = z.infer<typeof tierCardResponseSchema>;

/** One row of a tier list: a label plus the cards ranked into it, in order. */
export type TierRow = z.infer<typeof tierRowResponseSchema>;

export type TierListResponse = z.infer<typeof tierListResponseSchema>;
export type TierListSummaryResponse = z.infer<typeof tierListSummaryResponseSchema>;
export type TierListListResponse = z.infer<typeof tierListListResponseSchema>;
export type TierListShareResponse = z.infer<typeof tierListShareResponseSchema>;

export type PublicTierListResponse = z.infer<typeof publicTierListResponseSchema>;
export type PublicTierListDetailResponse = z.infer<typeof publicTierListDetailResponseSchema>;
