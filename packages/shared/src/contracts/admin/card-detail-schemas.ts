import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { cardFaceSchema } from "@openrift/shared/response-schemas";
import { marketplaceEnum } from "@openrift/shared/schemas";
import { z } from "zod";

extendZodWithOpenApi(z);

// Response schemas for the admin card-detail surfaces (getCardDetail /
// getUnmatchedDetail). These mirror the shapes the candidate-queries services
// build; the routes still output `z.unknown()` until each is wired to its
// schema and verified against real data (see the handoff). Deriving the
// types/api/admin.ts interfaces from these makes the schema the single source.

export const cardErrataSchema = z
  .object({
    correctedRulesText: z.string().nullable(),
    correctedEffectText: z.string().nullable(),
    source: z.string(),
    sourceUrl: z.string().nullable(),
    effectiveDate: z.string().nullable(),
  })
  .openapi("CardErrata");

export const adminCardResponseSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    types: z.array(z.string()),
    superTypes: z.array(z.string()),
    domains: z.array(z.string()),
    might: z.number().nullable(),
    energy: z.number().nullable(),
    power: z.number().nullable(),
    mightBonus: z.number().nullable(),
    keywords: z.array(z.string()),
    errata: cardErrataSchema.nullable(),
    tags: z.array(z.string()),
    /** Deck copy-limit override: null = normal rules, 0 = unlimited, positive = cap. */
    maxCopiesOverride: z.number().nullable(),
    comment: z.string().nullable(),
  })
  .openapi("AdminCardResponse");

export const candidateCardResponseSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    externalId: z.string(),
    shortCode: z.string().nullable(),
    energy: z.number().nullable(),
    power: z.number().nullable(),
    might: z.number().nullable(),
    superTypes: z.array(z.string()),
    types: z.array(z.string()),
    name: z.string(),
    domains: z.array(z.string()),
    rulesText: z.string().nullable(),
    effectText: z.string().nullable(),
    mightBonus: z.number().nullable(),
    tags: z.array(z.string()),
    extraData: z.unknown().nullable(),
    checkedAt: z.string().nullable(),
  })
  .openapi("CandidateCardResponse");

export const candidatePrintingResponseSchema = z
  .object({
    id: z.string(),
    candidateCardId: z.string(),
    printingId: z.string().nullable(),
    shortCode: z.string(),
    setId: z.string().nullable(),
    setName: z.string().nullable(),
    rarity: z.string().nullable(),
    artVariant: z.string().nullable(),
    isSigned: z.boolean().nullable(),
    markerSlugs: z.array(z.string()),
    distributionChannelSlugs: z.array(z.string()),
    finish: z.string().nullable(),
    size: z.string().nullable(),
    artist: z.string().nullable(),
    publicCode: z.string().nullable(),
    printedRulesText: z.string().nullable(),
    printedEffectText: z.string().nullable(),
    imageUrl: z.string().nullable(),
    flavorText: z.string().nullable(),
    externalId: z.string(),
    extraData: z.unknown().nullable(),
    language: z.string().nullable(),
    printedName: z.string().nullable(),
    checkedAt: z.string().nullable(),
  })
  .openapi("CandidatePrintingResponse");

export const candidatePrintingGroupResponseSchema = z
  .object({
    mostCommonShortCode: z.string(),
    shortCodes: z.array(z.string()),
    expectedPrintingId: z.string(),
    language: z.string().nullable(),
  })
  .openapi("CandidatePrintingGroupResponse");

export const adminPrintingImageResponseSchema = z
  .object({
    id: z.string(),
    printingId: z.string(),
    face: cardFaceSchema,
    originalUrl: z.string().nullable(),
    rehostedUrl: z.string().nullable(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    needsTrim: z.boolean(),
    isActive: z.boolean(),
  })
  .openapi("AdminPrintingImageResponse");

export const adminPrintingDistributionChannelResponseSchema = z
  .object({
    channelId: z.string(),
    channelSlug: z.string(),
    distributionNote: z.string().nullable(),
  })
  .openapi("AdminPrintingDistributionChannelResponse");

export const adminPrintingResponseSchema = z
  .object({
    id: z.string(),
    cardId: z.string(),
    setId: z.string(),
    setName: z.string().nullable(),
    setSlug: z.string(),
    shortCode: z.string(),
    rarity: z.string(),
    artVariant: z.string(),
    isSigned: z.boolean(),
    markerSlugs: z.array(z.string()),
    /** Flat list of channel slugs the printing is currently linked to. */
    distributionChannelSlugs: z.array(z.string()),
    /** Optional: only populated by endpoints that need the channel admin UI. */
    markerIds: z.array(z.string()).optional(),
    /** Optional: only populated by endpoints that need the channel admin UI. */
    distributionChannels: z.array(adminPrintingDistributionChannelResponseSchema).optional(),
    finish: z.string(),
    /** Physical card size (`standard` / `oversized`); distinguishes same-art prints. */
    size: z.string(),
    artist: z.string(),
    publicCode: z.string(),
    printedRulesText: z.string().nullable(),
    printedEffectText: z.string().nullable(),
    flavorText: z.string().nullable(),
    printedName: z.string().nullable(),
    /** Year stamped on the physical card; differs from set release for reprints. */
    printedYear: z.number().nullable(),
    language: z.string(),
    comment: z.string().nullable(),
    expectedPrintingId: z.string(),
    canonicalRank: z.number(),
  })
  .openapi("AdminPrintingResponse");

export const adminPrintingMarketplaceMappingResponseSchema = z
  .object({
    targetPrintingId: z.string(),
    marketplace: marketplaceEnum,
    externalId: z.number(),
    productName: z.string(),
    finish: z.string(),
    variantLanguage: z.string().nullable(),
    ownerPrintingId: z.string(),
    ownerLanguage: z.string(),
  })
  .openapi("AdminPrintingMarketplaceMappingResponse");

export const adminCardDetailResponseSchema = z
  .object({
    card: adminCardResponseSchema.nullable(),
    displayName: z.string(),
    sources: z.array(candidateCardResponseSchema),
    printings: z.array(adminPrintingResponseSchema),
    candidatePrintings: z.array(candidatePrintingResponseSchema),
    candidatePrintingGroups: z.array(candidatePrintingGroupResponseSchema),
    expectedCardId: z.string(),
    printingImages: z.array(adminPrintingImageResponseSchema),
    setTotals: z.record(z.string(), z.number()),
    marketplaceMappings: z.array(adminPrintingMarketplaceMappingResponseSchema),
  })
  .openapi("AdminCardDetailResponse");

export const unmatchedCardDetailResponseSchema = z
  .object({
    displayName: z.string(),
    sources: z.array(candidateCardResponseSchema),
    candidatePrintings: z.array(candidatePrintingResponseSchema),
    candidatePrintingGroups: z.array(candidatePrintingGroupResponseSchema),
    defaultCardId: z.string(),
    setTotals: z.record(z.string(), z.number()),
  })
  .openapi("UnmatchedCardDetailResponse");
