import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  cardTypeSchema,
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
  deckFormatSchema,
  deckLinkSchema,
  deckPlanResponseSchema,
  deckZoneSchema,
  domainSchema,
  formatConfigResponseSchema,
  superTypeSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { deckExportResponseSchema, deckOddsConfigSchema } from "./decks.js";

extendZodWithOpenApi(z);

/** Per-card input for the public deck-code encoder (no server deck row). */
const encodeDeckCardSchema = z.object({
  cardId: z.string(),
  zone: deckZoneSchema,
  quantity: z.number().int().positive(),
  preferredPrintingId: z.string().nullable(),
  cardName: z.string(),
  cardType: cardTypeSchema,
  superTypes: z.array(superTypeSchema),
  domains: z.array(domainSchema),
});

const encodeDeckInputSchema = z.object({
  format: z.enum(["piltover", "text", "tts"]).optional(),
  cards: z.array(encodeDeckCardSchema),
});

export const publicDeckResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    format: deckFormatSchema,
    formatConfig: formatConfigResponseSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    oddsConfig: deckOddsConfigSchema.nullable(),
    coverCardId: z.string().nullable(),
    coverPrintingId: z.string().nullable(),
    coverPosition: z.number().int().nullable(),
    links: z.array(deckLinkSchema),
  })
  .openapi("PublicDeckResponse");

export const publicDeckCardResponseSchema = z
  .object({
    cardId: z.string(),
    zone: deckZoneSchema,
    quantity: z.number(),
    preferredPrintingId: z.string().nullable(),
    cardName: z.string(),
    cardSlug: z.string(),
    cardType: cardTypeSchema,
    cardTypes: z.array(cardTypeSchema).nonempty(),
    superTypes: z.array(superTypeSchema),
    domains: z.array(domainSchema),
    tags: z.array(z.string()),
    keywords: z.array(z.string()),
    maxCopiesOverride: z.number().nullable(),
    /** True when the card is on the base banlist; drives the deck's CARD_BANNED violation. */
    banned: z.boolean(),
    energy: z.number().nullable(),
    might: z.number().nullable(),
    power: z.number().nullable(),
    resolvedPrintingId: z.string().nullable(),
    shortCode: z.string().nullable(),
    imageId: z.string().nullable(),
  })
  .openapi("PublicDeckCardResponse");

export const deckPlanCardMetaResponseSchema = z.object({
  cardId: z.string(),
  cardName: z.string(),
  cardSlug: z.string(),
  cardTypes: z.array(cardTypeSchema).nonempty(),
  imageId: z.string().nullable(),
});

/**
 * The slice of the catalogue a deck page renders from: every printing of the
 * deck's cards plus the printings of the tokens they create, the cards behind
 * those printings, and the sets they belong to. Same shapes `/catalog` serves,
 * so a page hands them to the shared catalogue helpers unchanged and never
 * downloads the whole catalogue.
 */
export const deckCatalogSubsetSchema = z
  .object({
    sets: z.array(catalogSetResponseSchema),
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
  })
  .openapi("DeckCatalogSubset");

export const publicDeckDetailResponseSchema = z
  .object({
    deck: publicDeckResponseSchema,
    cards: z.array(publicDeckCardResponseSchema),
    owner: z.object({ displayName: z.string(), gravatarHash: z.string().nullable() }),
    plan: deckPlanResponseSchema.nullable(),
    planCardMeta: z.array(deckPlanCardMetaResponseSchema),
    customTagAssignments: z.record(z.string(), z.array(z.string())).openapi({ example: {} }),
    catalog: deckCatalogSubsetSchema,
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
    .meta({ auth: "public", cache: "short" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicDeckDetailResponseSchema),

  // Stateless deck-code encoder for logged-out (local) decks, which have no
  // server row. Pure compute over public catalog data — no DB write — so it
  // opens no anonymous write surface. Reuses the same codecs as the by-id
  // authenticated `export`.
  encode: oc
    .route({ method: "POST", path: "/api/v1/decks/encode", tags: ["Decks"] })
    .meta({ auth: "public" })
    .input(encodeDeckInputSchema)
    .output(deckExportResponseSchema),
};

export type PublicDecksContract = typeof publicDecksContract;
