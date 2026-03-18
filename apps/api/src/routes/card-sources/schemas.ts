import { z } from "zod";

import {
  cardFieldRules,
  cardSourceFieldRules,
  printingFieldRules,
  printingSourceFieldRules,
  setFieldRules,
} from "../../db/schemas.js";

export { cardFieldRules, printingFieldRules } from "../../db/schemas.js";

export const checkAllPrintingSourcesSchema = z.object({
  printingId: z.string(),
  extraIds: z.array(z.string()).optional(),
});

export const patchPrintingSourceSchema = z.object({
  artVariant: printingSourceFieldRules.artVariant.optional(),
  isSigned: z.boolean().optional(),
  finish: printingSourceFieldRules.finish.optional(),
  collectorNumber: printingSourceFieldRules.collectorNumber.optional(),
  setId: printingSourceFieldRules.setId.optional(),
  sourceId: printingSourceFieldRules.sourceId.optional(),
  rarity: printingSourceFieldRules.rarity.optional(),
});

export const copyPrintingSourceSchema = z.object({
  printingId: z.string(),
});

export const linkPrintingSourcesSchema = z.object({
  printingSourceIds: z.array(z.string()),
  printingId: z.string().nullable(),
});

export const renameSchema = z.object({
  newId: z.string(),
});

export const acceptFieldSchema = z.object({
  field: z.string(),
  value: z.unknown(),
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
    rulesText: cardFieldRules.rulesText.optional(),
    effectText: cardFieldRules.effectText.optional(),
    tags: cardFieldRules.tags.optional(),
  }),
});

export const linkUnmatchedSchema = z.object({
  cardId: z.string(),
});

export const acceptPrintingSchema = z.object({
  printingFields: z.object({
    id: z.string().optional(),
    sourceId: printingFieldRules.sourceId,
    setId: setFieldRules.slug.optional(),
    setName: setFieldRules.name.optional().nullable(),
    collectorNumber: printingFieldRules.collectorNumber,
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
    imageUrl: printingSourceFieldRules.imageUrl.optional(),
  }),
  printingSourceIds: z.array(z.string()),
});

export const setImageSchema = z.object({
  mode: z.enum(["main", "additional"]),
});

export const activateImageSchema = z.object({
  active: z.boolean(),
});

export const addImageUrlSchema = z.object({
  url: z.string(),
  source: z.string().optional(),
  mode: z.enum(["main", "additional"]).optional(),
});

export const uploadImageFormSchema = z.object({
  file: z.instanceof(File),
  source: z.string().optional(),
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
/** Nullable number that defaults to null when missing from JSON. */
const nullNum = z.number().nullable().optional().default(null);

const ingestPrintingSchema = z.object({
  source_id: z.string(),
  set_id: nullStr,
  set_name: nullStr,
  collector_number: nullNum,
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
  source_entity_id: z.string(),
  extra_data: z.unknown().nullable().optional().default(null),
});

const ingestCardFieldsSchema = z.object({
  name: cardSourceFieldRules.name,
  type: cardSourceFieldRules.type.optional().default(null),
  super_types: z.array(z.string()).optional().default([]),
  domains: z.array(z.string()).optional().default([]),
  might: cardSourceFieldRules.might.optional().default(null),
  energy: cardSourceFieldRules.energy.optional().default(null),
  power: cardSourceFieldRules.power.optional().default(null),
  might_bonus: cardSourceFieldRules.mightBonus.optional().default(null),
  rules_text: cardSourceFieldRules.rulesText.optional().default(null),
  effect_text: cardSourceFieldRules.effectText.optional().default(null),
  tags: z.array(z.string()).optional().default([]),
  source_id: cardSourceFieldRules.sourceId.optional().default(null),
  source_entity_id: cardSourceFieldRules.sourceEntityId,
  extra_data: cardSourceFieldRules.extraData.optional().default(null),
});

export type IngestPrinting = z.infer<typeof ingestPrintingSchema>;
export type IngestCard = z.infer<typeof ingestCardFieldsSchema> & {
  printings: IngestPrinting[];
};

export const uploadCardSourcesSchema = z.object({
  source: z.string().min(1),
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
