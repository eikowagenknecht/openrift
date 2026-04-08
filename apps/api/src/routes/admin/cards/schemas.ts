import { z } from "zod";

import {
  cardFieldRules,
  cardErrataFieldRules,
  candidateCardFieldRules,
  printingFieldRules,
  candidatePrintingFieldRules,
  setFieldRules,
} from "../../../db/schemas.js";

export { cardFieldRules, printingFieldRules } from "../../../db/schemas.js";

export const checkAllCandidatePrintingsSchema = z.object({
  printingId: z.string().optional(),
  extraIds: z.array(z.string()).optional(),
});

export const patchCandidatePrintingSchema = z.object({
  artVariant: candidatePrintingFieldRules.artVariant.optional(),
  isSigned: z.boolean().optional(),
  finish: candidatePrintingFieldRules.finish.optional(),
  setId: candidatePrintingFieldRules.setId.optional(),
  shortCode: candidatePrintingFieldRules.shortCode.optional(),
  rarity: candidatePrintingFieldRules.rarity.optional(),
});

export const copyCandidatePrintingSchema = z.object({
  printingId: z.string(),
});

export const linkCandidatePrintingsSchema = z.object({
  candidatePrintingIds: z.array(z.string()),
  printingId: z.string().nullable(),
});

export const renameSchema = z.object({
  newId: z.string(),
});

export const acceptFieldSchema = z.object({
  field: z.string(),
  value: z.unknown(),
  source: z.enum(["provider", "manual"]).default("manual"),
});

export const acceptNewCardSchema = z.object({
  cardFields: z.object({
    id: cardFieldRules.slug,
    name: cardFieldRules.name,
    type: cardFieldRules.type,
    superTypes: cardFieldRules.superTypes.optional(),
    domains: cardFieldRules.domains,
    might: cardFieldRules.might.optional(),
    energy: cardFieldRules.energy.optional(),
    power: cardFieldRules.power.optional(),
    mightBonus: cardFieldRules.mightBonus.optional(),
    tags: cardFieldRules.tags.optional(),
  }),
});

export const upsertErrataSchema = z.object({
  correctedRulesText: cardErrataFieldRules.correctedRulesText,
  correctedEffectText: cardErrataFieldRules.correctedEffectText,
  source: cardErrataFieldRules.source,
  sourceUrl: cardErrataFieldRules.sourceUrl.optional().default(null),
  effectiveDate: cardErrataFieldRules.effectiveDate.optional().default(null),
});

export const linkUnmatchedSchema = z.object({
  cardId: z.string(),
});

export const acceptPrintingSchema = z.object({
  printingFields: z.object({
    id: z.string().optional(),
    shortCode: printingFieldRules.shortCode,
    setId: setFieldRules.slug.optional(),
    setName: setFieldRules.name.optional().nullable(),
    rarity: printingFieldRules.rarity.optional().nullable(),
    artVariant: printingFieldRules.artVariant.optional(),
    isSigned: z.boolean().optional(),
    promoTypeId: z.string().nullable().optional(),
    finish: printingFieldRules.finish.optional(),
    artist: printingFieldRules.artist,
    publicCode: printingFieldRules.publicCode,
    printedRulesText: printingFieldRules.printedRulesText.optional(),
    printedEffectText: printingFieldRules.printedEffectText.optional(),
    flavorText: printingFieldRules.flavorText.optional(),
    imageUrl: candidatePrintingFieldRules.imageUrl.optional(),
    language: z.string().min(1).max(5).optional(),
    printedName: z.string().min(1).optional().nullable(),
  }),
  candidatePrintingIds: z.array(z.string()),
});

export const setImageSchema = z.object({
  mode: z.enum(["main", "additional"]),
});

export const activateImageSchema = z.object({
  active: z.boolean(),
});

export const addImageUrlSchema = z.object({
  url: z.string(),
  provider: z.string().optional(),
  mode: z.enum(["main", "additional"]).optional(),
});

export const uploadImageFormSchema = z.object({
  file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
  provider: z.string().optional(),
  mode: z.enum(["main", "additional"]).optional(),
});

// ---------------------------------------------------------------------------
// Upload / ingest schemas — coerce incoming JSON into typed shapes
// ---------------------------------------------------------------------------
// These handle type coercion and undefined→null defaults for upload payloads.
// Value constraints (min, positive, enums) are validated per-card in the
// ingestion service so that individual bad cards can be skipped gracefully.

/** Nullable string that defaults to null when missing from JSON. */
const nullStr = z.string().nullable().optional().default(null);

const ingestPrintingSchema = z.object({
  short_code: z.string(),
  set_id: nullStr,
  set_name: nullStr,
  rarity: nullStr,
  art_variant: nullStr,
  is_signed: z.boolean().optional().default(false),
  is_promo: z.boolean().optional().default(false), // kept for backward compat in uploads; resolved to promo_type_id during ingest
  finish: nullStr,
  artist: nullStr,
  public_code: nullStr,
  printed_rules_text: nullStr,
  printed_effect_text: nullStr,
  image_url: nullStr,
  flavor_text: nullStr,
  external_id: z.string(),
  extra_data: z.unknown().nullable().optional().default(null),
  language: nullStr,
  printed_name: nullStr,
});

const ingestCardFieldsSchema = z.object({
  name: candidateCardFieldRules.name,
  type: candidateCardFieldRules.type.optional().default(null),
  super_types: z.array(z.string()).optional().default([]),
  domains: z.array(z.string()).optional().default([]),
  might: candidateCardFieldRules.might.optional().default(null),
  energy: candidateCardFieldRules.energy.optional().default(null),
  power: candidateCardFieldRules.power.optional().default(null),
  might_bonus: candidateCardFieldRules.mightBonus.optional().default(null),
  rules_text: candidateCardFieldRules.rulesText.optional().default(null),
  effect_text: candidateCardFieldRules.effectText.optional().default(null),
  tags: z.array(z.string()).optional().default([]),
  short_code: candidateCardFieldRules.shortCode.optional().default(null),
  external_id: candidateCardFieldRules.externalId,
  extra_data: candidateCardFieldRules.extraData.optional().default(null),
});

export type IngestPrinting = z.infer<typeof ingestPrintingSchema>;
export type IngestCard = z.infer<typeof ingestCardFieldsSchema> & {
  printings: IngestPrinting[];
};

// ── Bans ───────────────────────────────────────────────────────────────────

export const createBanSchema = z.object({
  formatId: z.string().min(1),
  bannedAt: z.string().date(),
  reason: z.string().min(1).nullable().optional(),
});

export const updateBanSchema = z.object({
  formatId: z.string().min(1),
  bannedAt: z.string().date().optional(),
  reason: z.string().min(1).nullable().optional(),
});

export const removeBanSchema = z.object({
  formatId: z.string().min(1),
});

export const banResponseSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  formatId: z.string(),
  formatName: z.string(),
  bannedAt: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

// ── Queries ────────────────────────────────────────────────────────────────

export const candidateCardSummarySchema = z.object({
  cardSlug: z.string().nullable(),
  name: z.string(),
  normalizedName: z.string(),
  shortCodes: z.array(z.string()),
  stagingShortCodes: z.array(z.string()),
  candidateCount: z.number(),
  uncheckedCardCount: z.number(),
  uncheckedPrintingCount: z.number(),
  hasFavorite: z.boolean(),
  hasFavoriteStagingPrintings: z.boolean(),
  suggestedCardSlug: z.string().nullable(),
});

// ── Upload / Ingest ────────────────────────────────────────────────────────

export const uploadCandidatesSchema = z.object({
  provider: z.string().min(1),
  candidates: z
    .array(
      z
        .object({
          card: ingestCardFieldsSchema,
          printings: z.array(ingestPrintingSchema),
        })
        .transform(({ card, printings }) => ({ ...card, printings })),
    )
    .min(1),
});
