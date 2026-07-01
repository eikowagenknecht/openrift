import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  cardTypeSchema,
  deckFormatSchema,
  deckPlanResponseSchema,
  deckZoneSchema,
  domainSchema,
  formatConfigResponseSchema,
} from "@openrift/shared/response-schemas";
import { idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const deckFieldRules = {
  name: z.string().min(1).max(200),
  format: z.string().min(1),
};

const deckCardFieldRules = {
  zone: z.string().min(1),
  quantity: z.number().int().positive(),
};

export const decksQuerySchema = z.object({
  wanted: z.enum(["true", "false"]).optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
});

/**
 * Free-form per-deck format config. Each format owns its shape; the schema
 * stays loose because the column is jsonb and validation lives in the route
 * handler (which knows the format). Pass `null` to clear.
 */
const formatConfigSchema = z.record(z.string(), z.unknown()).nullable();

export const createDeckSchema = z.object({
  name: deckFieldRules.name,
  description: z.string().max(2000).nullish(),
  format: deckFieldRules.format,
  formatConfig: formatConfigSchema.optional(),
  isWanted: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

// isPublic is intentionally absent: a deck's public state is controlled only by
// the /decks/{id}/share sub-resource, not by PATCH, so the two can't desync.
export const updateDeckSchema = z.object({
  name: deckFieldRules.name.optional(),
  description: z.string().max(2000).nullish(),
  format: deckFieldRules.format.optional(),
  formatConfig: formatConfigSchema.optional(),
  isWanted: z.boolean().optional(),
});

export const updateDeckCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        cardId: z.uuid(),
        zone: deckCardFieldRules.zone,
        quantity: deckCardFieldRules.quantity,
        preferredPrintingId: z.uuid().nullish(),
      }),
    )
    .max(500),
});

const deckMatchupSwapSchema = z.object({
  cardId: z.uuid(),
  direction: z.enum(["in", "out"]),
  quantity: z.number().int().positive().max(99),
});

const deckMatchupPlanSchema = z
  .object({
    // The opponent identity card (any type) — optional. Null for a matchup
    // identified only by its free-text label (an archetype, a domain, …).
    opponentCardId: z.uuid().nullable().default(null),
    // Free-text opponent label; carries archetype/domain/build names.
    opponentLabel: z.string().max(120).default(""),
    notes: z.string().max(4000).default(""),
    swaps: z.array(deckMatchupSwapSchema).max(40),
  })
  // A matchup must be identifiable by at least one of card / label.
  .refine((matchup) => matchup.opponentCardId !== null || matchup.opponentLabel.trim() !== "", {
    message: "A matchup needs an opponent: link a card or enter a name",
    path: ["opponentLabel"],
  });

/** PUT /decks/{id}/plan body — the whole plan, saved as a unit. */
export const updateDeckPlanSchema = z.object({
  generalStrategy: z.string().max(8000).default(""),
  mulliganSplit: z.boolean().default(false),
  mulliganGeneral: z.string().max(4000).default(""),
  mulliganFirst: z.string().max(4000).default(""),
  mulliganSecond: z.string().max(4000).default(""),
  battlefieldGame1CardId: z.uuid().nullable().default(null),
  battlefieldFirstCardId: z.uuid().nullable().default(null),
  battlefieldSecondCardId: z.uuid().nullable().default(null),
  battlefieldCustom: z.boolean().default(false),
  battlefieldNote: z.string().max(4000).default(""),
  matchups: z.array(deckMatchupPlanSchema).max(40),
});

export const deckExportQuerySchema = z.object({
  format: z.enum(["piltover", "text", "tts"]).default("piltover"),
});

export const deckResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    format: deckFormatSchema,
    formatConfig: formatConfigResponseSchema,
    isWanted: z.boolean(),
    isPublic: z.boolean(),
    shareToken: z.string().nullable(),
    isPinned: z.boolean(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DeckResponse");

export const deckShareResponseSchema = z
  .object({
    // Nullable so GET /decks/:id/share can report an owned-but-unshared deck
    // as { shareToken: null, isPublic: false } rather than 404ing. Share /
    // rotate always populate a string token.
    shareToken: z.string().nullable(),
    isPublic: z.boolean(),
  })
  .openapi("DeckShareResponse");

export const deckCloneResponseSchema = z
  .object({
    deckId: z.string(),
  })
  .openapi("DeckCloneResponse");

export const deckSummaryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    format: deckFormatSchema,
    formatConfig: formatConfigResponseSchema,
    isPinned: z.boolean(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DeckSummaryResponse");

export const deckListItemResponseSchema = z
  .object({
    deck: deckSummaryResponseSchema,
    legendCardId: z.string().nullable(),
    championCardId: z.string().nullable(),
    totalCards: z.number(),
    typeCounts: z.array(z.object({ cardType: cardTypeSchema, count: z.number() })),
    domainDistribution: z.array(z.object({ domain: domainSchema, count: z.number() })),
    isValid: z.boolean(),
    totalValueCents: z.number().int().nullable(),
  })
  .openapi("DeckListItemResponse");

export const deckListResponseSchema = z
  .object({ items: z.array(deckListItemResponseSchema) })
  .openapi("DeckListResponse");

export const deckCardResponseSchema = z
  .object({
    cardId: z.string(),
    zone: deckZoneSchema,
    quantity: z.number(),
    // Optional pin to a specific printing for display. Null means "default art".
    // The handlers already return this; the schema had drifted behind the type.
    preferredPrintingId: z.string().nullable(),
  })
  .openapi("DeckCardResponse");

export const deckDetailResponseSchema = z
  .object({
    deck: deckResponseSchema,
    cards: z.array(deckCardResponseSchema),
  })
  .openapi("DeckDetailResponse");

export const deckPlanDetailResponseSchema = z
  .object({ plan: deckPlanResponseSchema })
  .openapi("DeckPlanDetailResponse");

export const deckAvailabilityItemResponseSchema = z.object({
  cardId: z.string(),
  zone: deckZoneSchema,
  needed: z.number(),
  owned: z.number(),
  shortfall: z.number(),
});

export const deckAvailabilityResponseSchema = z
  .object({ items: z.array(deckAvailabilityItemResponseSchema) })
  .openapi("DeckAvailabilityResponse");

export const deckCardsResponseSchema = z
  .object({ cards: z.array(deckCardResponseSchema) })
  .openapi("DeckCardsResponse");

export const deckExportResponseSchema = z
  .object({
    code: z.string(),
    warnings: z.array(z.string()),
  })
  .openapi("DeckExportResponse");

const TAG = "Decks";

const shareTokenParamSchema = z.object({ token: z.string().min(1) });
const pinDeckBodySchema = z.object({ isPinned: z.boolean() });
const archiveDeckBodySchema = z.object({ archived: z.boolean() });

/**
 * oRPC contract for the authenticated decks endpoints (mounted at
 * `/api/v1/decks`). All require a session, so they share the `authedRoute`
 * base (UNAUTHORIZED + FORBIDDEN). Domain codes per route: `create` →
 * BAD_REQUEST (unknown format or invalid format config); `get`, `remove`,
 * `replaceCards`, `getPlan`, `clone`, `availability`, `export`, `setPinned`,
 * `setArchived`, `getShare`, `share`, `rotateShare`, `unshare` →
 * NOT_FOUND; `update` → NOT_FOUND + BAD_REQUEST; `replacePlan` → NOT_FOUND +
 * BAD_REQUEST (invalid plan content); `cloneShared` → NOT_FOUND (unknown
 * share token).
 */
export const decksContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/decks", tags: [TAG] })
    .input(decksQuerySchema)
    .output(deckListResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: "/api/v1/decks", tags: [TAG], successStatus: 201 })
    .input(createDeckSchema)
    .errors({ BAD_REQUEST: { message: "Unknown format or invalid format config" } })
    .output(deckResponseSchema),
  get: authedRoute
    .route({ method: "GET", path: "/api/v1/decks/{id}", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckDetailResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: "/api/v1/decks/{id}", tags: [TAG] })
    .input(withParams(idParamSchema, updateDeckSchema))
    .errors({
      NOT_FOUND: { message: "Deck not found" },
      BAD_REQUEST: { message: "Unknown format or invalid format config" },
    })
    .output(deckResponseSchema),
  remove: authedRoute
    .route({ method: "DELETE", path: "/api/v1/decks/{id}", tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .input(idParamSchema),
  replaceCards: authedRoute
    .route({ method: "PUT", path: "/api/v1/decks/{id}/cards", tags: [TAG] })
    .input(withParams(idParamSchema, updateDeckCardsSchema))
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckCardsResponseSchema),
  getPlan: authedRoute
    .route({ method: "GET", path: "/api/v1/decks/{id}/plan", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckPlanDetailResponseSchema),
  replacePlan: authedRoute
    .route({ method: "PUT", path: "/api/v1/decks/{id}/plan", tags: [TAG] })
    .input(withParams(idParamSchema, updateDeckPlanSchema))
    .errors({
      NOT_FOUND: { message: "Deck not found" },
      BAD_REQUEST: { message: "Invalid plan content" },
    })
    .output(deckPlanDetailResponseSchema),
  clone: authedRoute
    .route({ method: "POST", path: "/api/v1/decks/{id}/clone", tags: [TAG], successStatus: 201 })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckResponseSchema),
  availability: authedRoute
    .route({ method: "GET", path: "/api/v1/decks/{id}/availability", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckAvailabilityResponseSchema),
  export: authedRoute
    .route({ method: "GET", path: "/api/v1/decks/{id}/export", tags: [TAG] })
    .input(withParams(idParamSchema, deckExportQuerySchema))
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckExportResponseSchema),
  setPinned: authedRoute
    .route({ method: "PATCH", path: "/api/v1/decks/{id}/pin", tags: [TAG] })
    .input(withParams(idParamSchema, pinDeckBodySchema))
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckResponseSchema),
  setArchived: authedRoute
    .route({ method: "PATCH", path: "/api/v1/decks/{id}/archive", tags: [TAG] })
    .input(withParams(idParamSchema, archiveDeckBodySchema))
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckResponseSchema),
  getShare: authedRoute
    .route({ method: "GET", path: "/api/v1/decks/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckShareResponseSchema),
  share: authedRoute
    .route({ method: "POST", path: "/api/v1/decks/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckShareResponseSchema),
  rotateShare: authedRoute
    .route({ method: "POST", path: "/api/v1/decks/{id}/share/rotate", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckShareResponseSchema),
  unshare: authedRoute
    .route({ method: "DELETE", path: "/api/v1/decks/{id}/share", tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .input(idParamSchema),
  cloneShared: authedRoute
    .route({
      method: "POST",
      path: "/api/v1/decks/share/{token}/clone",
      tags: [TAG],
      successStatus: 201,
    })
    .input(shareTokenParamSchema)
    .errors({ NOT_FOUND: { message: "Shared deck not found" } })
    .output(deckCloneResponseSchema),
};

export type DecksContract = typeof decksContract;
