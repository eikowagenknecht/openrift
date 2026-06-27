import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  cardTypeSchema,
  deckFormatSchema,
  deckPlanResponseSchema,
  deckZoneSchema,
  domainSchema,
  formatConfigResponseSchema,
  superTypeSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const publicDeckResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    format: deckFormatSchema,
    formatConfig: formatConfigResponseSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PublicDeckResponse");

const publicDeckCardResponseSchema = z
  .object({
    cardId: z.string(),
    zone: deckZoneSchema,
    quantity: z.number(),
    preferredPrintingId: z.string().nullable(),
    cardName: z.string(),
    cardSlug: z.string(),
    cardType: cardTypeSchema,
    superTypes: z.array(superTypeSchema),
    domains: z.array(domainSchema),
    tags: z.array(z.string()),
    keywords: z.array(z.string()),
    energy: z.number().nullable(),
    might: z.number().nullable(),
    power: z.number().nullable(),
    resolvedPrintingId: z.string().nullable(),
    shortCode: z.string().nullable(),
    imageId: z.string().nullable(),
  })
  .openapi("PublicDeckCardResponse");

const deckPlanCardMetaResponseSchema = z.object({
  cardId: z.string(),
  cardName: z.string(),
  cardSlug: z.string(),
  cardType: cardTypeSchema,
  imageId: z.string().nullable(),
});

export const publicDeckDetailResponseSchema = z
  .object({
    deck: publicDeckResponseSchema,
    cards: z.array(publicDeckCardResponseSchema),
    owner: z.object({ displayName: z.string(), gravatarHash: z.string().nullable() }),
    plan: deckPlanResponseSchema.nullable(),
    planCardMeta: z.array(deckPlanCardMetaResponseSchema),
    customTagAssignments: z.record(z.string(), z.array(z.string())).openapi({ example: {} }),
  })
  .openapi("PublicDeckDetailResponse");

/**
 * oRPC contract for the public (share-token) deck view.
 * `GET /api/v1/decks/share/{token}` — anonymous, denormalized view of a shared
 * deck, or a typed NOT_FOUND for an unknown / non-public token.
 */
export const publicDecksContract = {
  share: oc
    .route({ method: "GET", path: "/api/v1/decks/share/{token}", tags: ["Decks"] })
    .meta({ auth: "public" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicDeckDetailResponseSchema),
};

export type PublicDecksContract = typeof publicDecksContract;
