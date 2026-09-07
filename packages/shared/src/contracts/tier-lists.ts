import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const MAX_TIER_ROWS = 12;
export const MAX_CARDS_PER_TIER = 400;
export const MAX_TIER_LIST_CARDS = 1000;
export const DEFAULT_TIER_LABELS = ["S", "A", "B", "C", "D"] as const;

/** `printingId` null means the reader's default printing for that card. */
export const tierCardSchema = z.object({
  cardId: z.uuid(),
  printingId: z.uuid().nullable().default(null),
});

export const tierRowSchema = z.object({
  label: z.string().trim().min(1).max(24),
  cards: z.array(tierCardSchema).max(MAX_CARDS_PER_TIER),
  unranked: z.boolean().optional(),
});

export const tiersSchema = z
  .array(tierRowSchema)
  .max(MAX_TIER_ROWS)
  .refine(
    (rows) => rows.reduce((sum, row) => sum + row.cards.length, 0) <= MAX_TIER_LIST_CARDS,
    `A tier list can hold at most ${MAX_TIER_LIST_CARDS} cards`,
  )
  .refine((rows) => {
    const all = rows.flatMap((row) => row.cards.map((card) => card.cardId));
    return new Set(all).size === all.length;
  }, "A card can only sit in one tier")
  .refine(
    (rows) => rows.filter((row) => row.unranked).length <= 1,
    "A tier list can have at most one unranked row",
  )
  .refine(
    // The board is drawn from this array in reading order, so an unranked
    // row anywhere but last would sort above a real tier.
    (rows) => rows.every((row, index) => !row.unranked || index === rows.length - 1),
    "The unranked row has to be the last one",
  );

const tierListFieldRules = {
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
};

export const createTierListSchema = z.object({
  title: tierListFieldRules.title,
  description: tierListFieldRules.description.nullish(),
  tiers: tiersSchema.optional(),
});

// isPublic is left out on purpose, matching decks: public state is owned by
// the /share sub-resource alone, so a PATCH can never desync it from the token.
export const updateTierListSchema = z.object({
  title: tierListFieldRules.title.optional(),
  description: tierListFieldRules.description.nullish(),
  tiers: tiersSchema.optional(),
});

export const tierCardResponseSchema = z
  .object({ cardId: z.string(), printingId: z.string().nullable() })
  .openapi("TierCardResponse");

export const tierRowResponseSchema = z
  .object({
    label: z.string(),
    cards: z.array(tierCardResponseSchema),
    unranked: z.boolean().optional(),
  })
  .openapi("TierRowResponse");

export const tierListResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    tiers: z.array(tierRowResponseSchema),
    isPublic: z.boolean(),
    shareToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TierListResponse");

/** `rowIndex` is the row's board position, not its position in the preview:
 * empty tiers are skipped, and colour is derived from board position. */
export const tierPreviewRowResponseSchema = z
  .object({
    rowIndex: z.number().int().nonnegative(),
    label: z.string(),
    cards: z.array(tierCardResponseSchema),
    unranked: z.boolean().optional(),
  })
  .openapi("TierPreviewRowResponse");

export const tierListSummaryResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    tierCount: z.number().int().nonnegative(),
    cardCount: z.number().int().nonnegative(),
    previewRows: z.array(tierPreviewRowResponseSchema),
    isPublic: z.boolean(),
    shareToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TierListSummaryResponse");

export const tierListListResponseSchema = z
  .object({ items: z.array(tierListSummaryResponseSchema) })
  .openapi("TierListListResponse");

export const tierListShareResponseSchema = z
  .object({
    shareToken: z.string().nullable(),
    isPublic: z.boolean(),
  })
  .openapi("TierListShareResponse");

const TAG = "Tier lists";
const NOT_FOUND = { NOT_FOUND: { message: "Tier list not found" } };

// Every route is session-gated and user-scoped: an id belonging to
// someone else returns NOT_FOUND, not FORBIDDEN.
export const tierListsContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/tier-lists", tags: [TAG] })
    .output(tierListListResponseSchema),
  get: authedRoute
    .route({ method: "GET", path: "/api/v1/tier-lists/{id}", tags: [TAG] })
    .input(idParamSchema)
    .errors(NOT_FOUND)
    .output(tierListResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: "/api/v1/tier-lists", tags: [TAG], successStatus: 201 })
    .input(createTierListSchema)
    .output(tierListResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: "/api/v1/tier-lists/{id}", tags: [TAG] })
    .input(withParams(idParamSchema, updateTierListSchema))
    .errors(NOT_FOUND)
    .output(tierListResponseSchema),
  remove: authedRoute
    .route({
      method: "DELETE",
      path: "/api/v1/tier-lists/{id}",
      tags: [TAG],
      successStatus: 204,
    })
    .input(idParamSchema)
    .errors(NOT_FOUND),
  share: authedRoute
    .route({ method: "POST", path: "/api/v1/tier-lists/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .errors(NOT_FOUND)
    .output(tierListShareResponseSchema),
  unshare: authedRoute
    .route({
      method: "DELETE",
      path: "/api/v1/tier-lists/{id}/share",
      tags: [TAG],
      successStatus: 204,
    })
    .input(idParamSchema)
    .errors(NOT_FOUND),
};

export type TierListsContract = typeof tierListsContract;
