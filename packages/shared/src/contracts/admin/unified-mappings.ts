import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  artVariantSchema,
  cardSizeSchema,
  cardTypeSchema,
  domainSchema,
  finishSchema,
  raritySchema,
  superTypeSchema,
} from "@openrift/shared/response-schemas";
import { marketplaceEnum } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

extendZodWithOpenApi(z);

const marketplaceGroupKindSchema = z.enum(["basic", "special"]);

// One staged/assigned/unmatched marketplace product (a SKU + its latest prices
// and group provenance). `groupKind` / `groupSetSlug` drive the suggester.
export const stagedProductResponseSchema = z
  .object({
    externalId: z.number().openapi({ example: 748_215 }),
    productName: z.string().openapi({ example: "Jinx, Rebel (Foil)" }),
    finish: z.string().openapi({ example: "foil" }),
    /**
     * `null` when the marketplace doesn't expose language as a SKU dimension
     * (Cardmarket's cross-language price guide, TCGPlayer's English-only
     * catalog). A real language code otherwise (CardTrader).
     */
    language: z.string().nullable().openapi({ example: "EN" }),
    marketCents: z.number().nullable().openapi({ example: 452 }),
    lowCents: z.number().nullable().openapi({ example: 325 }),
    currency: z.string().openapi({ example: "USD" }),
    recordedAt: z.string().openapi({ example: "2026-04-01T12:00:00.000Z" }),
    midCents: z.number().nullable().openapi({ example: 400 }),
    highCents: z.number().nullable().openapi({ example: 600 }),
    trendCents: z.number().nullable().openapi({ example: 430 }),
    avg1Cents: z.number().nullable().openapi({ example: 445 }),
    avg7Cents: z.number().nullable().openapi({ example: 460 }),
    avg30Cents: z.number().nullable().openapi({ example: 470 }),
    isOverride: z.boolean().optional().openapi({ example: false }),
    groupId: z.number().optional().openapi({ example: 23_482 }),
    groupName: z.string().optional().openapi({ example: "Origins" }),
    /**
     * Admin-assigned tag for the marketplace group this product belongs to.
     * Drives the suggestion scorer: `basic` penalises promo/special printings,
     * `special` prefers them. Omitted for products whose group resolution
     * wasn't needed (unassigned staging without a group).
     */
    groupKind: marketplaceGroupKindSchema.optional().openapi({ example: "basic" }),
    /**
     * Slug of the OpenRift set this product's marketplace group is scoped to,
     * if any. When non-null, the suggester only proposes printings whose
     * `setId` (slug) matches. `null` means no scoping (default).
     */
    groupSetSlug: z.string().nullable().optional().openapi({ example: null }),
  })
  .openapi("StagedProductResponse");

// A single (product × printing) mapping row.
const marketplaceAssignmentResponseSchema = z
  .object({
    externalId: z.number().openapi({ example: 748_215 }),
    printingId: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
    finish: z.string().openapi({ example: "foil" }),
    language: z.string().nullable().openapi({ example: "EN" }),
  })
  .openapi("MarketplaceAssignmentResponse");

const unifiedMappingPrintingResponseSchema = z
  .object({
    printingId: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
    /** Slug of the printing's set, used by the suggester to scope by group.setId. */
    setId: z.string().openapi({ example: "OGN" }),
    shortCode: z.string().openapi({ example: "OGN-202" }),
    rarity: raritySchema,
    artVariant: artVariantSchema,
    isSigned: z.boolean().openapi({ example: false }),
    markerSlugs: z.array(z.string()).openapi({ example: [] }),
    finish: finishSchema,
    size: cardSizeSchema,
    language: z.string().openapi({ example: "EN" }),
    imageUrl: z.string().nullable().openapi({ example: null }),
    tcgExternalId: z.number().nullable().openapi({ example: 582_391 }),
    cmExternalId: z.number().nullable().openapi({ example: 748_215 }),
    ctExternalId: z.number().nullable().openapi({ example: null }),
  })
  .openapi("UnifiedMappingPrintingResponse");

const assignableCardResponseSchema = z
  .object({
    cardId: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
    cardSlug: z.string().openapi({ example: "jinx-rebel" }),
    cardName: z.string().openapi({ example: "Jinx, Rebel" }),
    setName: z.string().openapi({ example: "Origins" }),
    /** Short codes of this card's printings (first one, sorted, is shown in the assign dropdown). */
    shortCodes: z.array(z.string()).openapi({ example: ["OGN-202"] }),
  })
  .openapi("AssignableCardResponse");

const unifiedMappingMarketplaceSchema = z.object({
  stagedProducts: z.array(stagedProductResponseSchema),
  assignedProducts: z.array(stagedProductResponseSchema),
  assignments: z.array(marketplaceAssignmentResponseSchema),
});

export const unifiedMappingGroupResponseSchema = z
  .object({
    cardId: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
    cardSlug: z.string().openapi({ example: "jinx-rebel" }),
    cardName: z.string().openapi({ example: "Jinx, Rebel" }),
    cardType: cardTypeSchema,
    superTypes: z.array(superTypeSchema).openapi({ example: ["Champion"] }),
    domains: z.array(domainSchema).openapi({ example: ["Chaos"] }),
    energy: z.number().nullable().openapi({ example: 5 }),
    might: z.number().nullable().openapi({ example: 5 }),
    setId: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
    setName: z.string().openapi({ example: "Origins" }),
    printings: z.array(unifiedMappingPrintingResponseSchema),
    primaryShortCode: z.string().openapi({ example: "OGN-202" }),
    tcgplayer: unifiedMappingMarketplaceSchema,
    cardmarket: unifiedMappingMarketplaceSchema,
    cardtrader: unifiedMappingMarketplaceSchema,
  })
  .openapi("UnifiedMappingGroupResponse");

export const unifiedMappingsResponseSchema = z
  .object({
    groups: z.array(unifiedMappingGroupResponseSchema),
    unmatchedProducts: z.object({
      tcgplayer: z.array(stagedProductResponseSchema),
      cardmarket: z.array(stagedProductResponseSchema),
      cardtrader: z.array(stagedProductResponseSchema),
    }),
    allCards: z.array(assignableCardResponseSchema),
  })
  .openapi("UnifiedMappingsResponse");

/** Single-card variant of {@link unifiedMappingsResponseSchema}. */
export const unifiedMappingsCardResponseSchema = z
  .object({
    /** Null when the card has no printings or no marketplace activity. */
    group: unifiedMappingGroupResponseSchema.nullable(),
    allCards: z.array(assignableCardResponseSchema),
  })
  .openapi("UnifiedMappingsCardResponse");

const TAG = "Admin - Mappings";

const MM = "/api/admin/v1/marketplace-mappings";

const saveMappingsBody = z.object({
  mappings: z.array(
    z.object({
      printingId: z.uuid(),
      externalId: z.number(),
      // The marketplace's own view of the SKU finish — always `normal` / `foil`.
      finish: z.string(),
      // `null` for marketplaces that don't expose language as a SKU dimension (CM/TCG).
      language: z.string().nullable(),
    }),
  ),
});

const saveMappingsResult = z.object({
  saved: z.number(),
  skipped: z.array(z.object({ externalId: z.number(), reason: z.string() })),
});

/**
 * oRPC contract for the admin unified marketplace-mappings (mounted under
 * `/api/admin/v1/marketplace-mappings`, admin-gated by the mount). Reuses the
 * shared response schemas. `save` carries a `marketplace` query alongside its
 * body, and `unmap` addresses the SKU via query params — both use detailed
 * input structure since oRPC compact mode does not read query params on these.
 * All procedures are session-gated (UNAUTHORIZED + FORBIDDEN from `authedRoute`);
 * no domain error codes are declared.
 */
export const adminUnifiedMappingsContract = {
  list: authedRoute
    .route({ method: "GET", path: MM, tags: [TAG] })
    .output(unifiedMappingsResponseSchema),
  card: authedRoute
    .route({ method: "GET", path: `${MM}/card/{cardId}`, tags: [TAG] })
    .input(z.object({ cardId: z.string() }))
    .output(unifiedMappingsCardResponseSchema),
  save: authedRoute
    .route({ method: "POST", path: MM, tags: [TAG], inputStructure: "detailed" })
    .input(z.object({ query: z.object({ marketplace: marketplaceEnum }), body: saveMappingsBody }))
    .output(saveMappingsResult),
  unmap: authedRoute
    .route({
      method: "DELETE",
      path: MM,
      tags: [TAG],
      successStatus: 204,
      inputStructure: "detailed",
    })
    .input(
      z.object({
        query: z.object({
          marketplace: marketplaceEnum,
          printingId: z.uuid(),
          externalId: z.coerce.number().int(),
          finish: z.string(),
          language: z.string().optional(),
        }),
      }),
    ),
};

export type AdminUnifiedMappingsContract = typeof adminUnifiedMappingsContract;
export type UnifiedMappingsResponse = z.infer<typeof unifiedMappingsResponseSchema>;
export type UnifiedMappingsCardResponse = z.infer<typeof unifiedMappingsCardResponseSchema>;
