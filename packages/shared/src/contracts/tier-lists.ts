import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

/** Rows a single tier list may hold. Enough for a granular ranking, far short
 * of anything that would make the board unreadable or the image untenable. */
export const MAX_TIER_ROWS = 12;

/** Cards a single row may hold. A full-set review row is dozens, not hundreds. */
export const MAX_CARDS_PER_TIER = 400;

/** Cards a whole list may rank. Bounds the render cost of the share image. */
export const MAX_TIER_LIST_CARDS = 1000;

/** The default board a new list starts from. */
export const DEFAULT_TIER_LABELS = ["S", "A", "B", "C", "D"] as const;

/**
 * One ranked entry. Ranking is per card — a card sits in exactly one tier
 * however many printings it has — but the creator picks which printing supplies
 * the tile art, so an alt art they dragged in is the one the board shows.
 * `printingId` null means "whatever the reader's default printing is", which is
 * what an entry ranked from the card view stays on.
 */
export const tierCardSchema = z.object({
  cardId: z.uuid(),
  // Defaulted rather than optional so the parsed board is always storable as
  // written: the route never has to fill a hole before it hits the jsonb column.
  printingId: z.uuid().nullable().default(null),
});

export const tierRowSchema = z.object({
  // Trim before min(1): a whitespace-only label must fail validation here,
  // not surface later as a DB constraint violation.
  label: z.string().trim().min(1).max(24),
  cards: z.array(tierCardSchema).max(MAX_CARDS_PER_TIER),
  /**
   * The "considered and cut" row: drawn grey, off the ranking ramp, and pinned
   * to the bottom of the board.
   *
   * Optional rather than defaulted, unlike `printingId` above: a board has at
   * most one of these and most have none, so stamping `false` onto every row
   * would grow every stored board for a flag almost none of them use. An absent
   * flag and a false one mean the same thing everywhere that reads it.
   */
  unranked: z.boolean().optional(),
});

/**
 * The whole board. Validated as a unit (rather than per row) because the
 * cross-row rules — no card in two rows, a total card cap — only exist at this
 * level. A card appearing twice would render twice and rank ambiguously, so it
 * is rejected rather than silently deduplicated.
 */
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
    // Enforced here rather than left to the builder: the board is drawn from
    // this array in reading order, and an unranked row anywhere but the bottom
    // would put "did not make the cut" above a real tier.
    (rows) => rows.every((row, index) => !row.unranked || index === rows.length - 1),
    "The unranked row has to be the last one",
  );

const tierListFieldRules = {
  // Trim before min(1), same as the row label above.
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
};

export const createTierListSchema = z.object({
  title: tierListFieldRules.title,
  description: tierListFieldRules.description.nullish(),
  /** Omitted on create, which starts the list on {@link DEFAULT_TIER_LABELS}. */
  tiers: tiersSchema.optional(),
});

// isPublic is deliberately absent, matching decks: public state is owned by the
// /share sub-resource alone, so a PATCH can never desync it from the token.
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
    /** True on the grey "considered and cut" row, which is always the last one. */
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

/**
 * List-page projection. Carries the ranked-card count and the first row's
 * leading cards so the index can draw a preview strip without shipping every
 * board in full.
 */
export const tierListSummaryResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    tierCount: z.number().int().nonnegative(),
    cardCount: z.number().int().nonnegative(),
    /** Leading entries of the top non-empty row, for the index preview strip. */
    previewCards: z.array(tierCardResponseSchema),
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
    // Nullable so GET .../share reports an owned-but-unshared list as
    // { shareToken: null, isPublic: false } rather than 404ing.
    shareToken: z.string().nullable(),
    isPublic: z.boolean(),
  })
  .openapi("TierListShareResponse");

const TAG = "Tier lists";
const NOT_FOUND = { NOT_FOUND: { message: "Tier list not found" } };

/**
 * oRPC contract for creator-authored tier lists (migration 237), mounted at
 * `/api/v1/tier-lists`. Every route is session-gated and user-scoped, so an id
 * belonging to someone else reads as NOT_FOUND rather than FORBIDDEN — the
 * caller learns nothing about lists that aren't theirs.
 */
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
