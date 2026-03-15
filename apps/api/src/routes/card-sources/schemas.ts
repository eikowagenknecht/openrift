import { z } from "zod";

export const cardSourcesQuerySchema = z.object({
  filter: z.string().optional(),
  source: z.string().optional(),
});

export const checkAllPrintingSourcesSchema = z.object({
  printingId: z.string(),
  extraIds: z.array(z.string()).optional(),
});

export const patchPrintingSourceSchema = z.object({
  artVariant: z.string().optional(),
  isSigned: z.boolean().optional(),
  finish: z.string().optional(),
  collectorNumber: z.number().optional(),
  setId: z.string().optional(),
  sourceId: z.string().optional(),
  rarity: z.string().optional(),
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
    id: z.string(),
    name: z.string(),
    type: z.enum(["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]),
    superTypes: z.array(z.string()).optional(),
    domains: z.array(z.string()).min(1),
    might: z.number().optional(),
    energy: z.number().optional(),
    power: z.number().optional(),
    mightBonus: z.number().optional(),
    rulesText: z.string().min(1).optional(),
    effectText: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const linkUnmatchedSchema = z.object({
  cardId: z.string(),
});

export const acceptPrintingSchema = z.object({
  printingFields: z.object({
    id: z.string().optional(),
    sourceId: z.string(),
    setId: z.string().optional(),
    setName: z.string().optional().nullable(),
    collectorNumber: z.number().optional(),
    rarity: z.string().optional().nullable(),
    artVariant: z.string().optional(),
    isSigned: z.boolean().optional(),
    isPromo: z.boolean().optional(),
    finish: z.string().optional(),
    artist: z.string().optional(),
    publicCode: z.string().optional(),
    printedRulesText: z.string().optional(),
    printedEffectText: z.string().optional().nullable(),
    flavorText: z.string().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
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
