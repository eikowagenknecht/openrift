import { z } from "zod";

import {
  cardFieldRules,
  printingFieldRules,
  printingSourceFieldRules,
  setFieldRules,
} from "../../db/schemas.js";

export { cardFieldRules, printingFieldRules } from "../../db/schemas.js";

export const cardSourcesQuerySchema = z.object({
  filter: z.string().optional(),
  source: z.string().optional(),
});

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
    isPromo: z.boolean().optional(),
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

export const uploadCardSourcesSchema = z.object({
  source: z.string(),
  candidates: z.array(
    z.object({
      card: z.record(z.string(), z.unknown()),
      printings: z.array(z.record(z.string(), z.unknown())),
    }),
  ),
});
