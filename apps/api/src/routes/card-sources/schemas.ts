import { z } from "zod";

export const cardSourcesQuerySchema = z.object({
  filter: z.string().optional(),
  source: z.string().optional(),
});

export const checkAllPrintingSourcesSchema = z.object({
  printingId: z.string(),
  extraIds: z.array(z.string()).optional(),
});

/** Mirrors DB CHECK constraints on the printings table — single source of truth. */
export const printingFieldRules = {
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  collectorNumber: z.number().int().positive(),
  rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Showcase"]),
  artVariant: z.enum(["normal", "altart", "overnumbered"]),
  finish: z.enum(["normal", "foil"]),
  artist: z.string().min(1),
  publicCode: z.string().min(1),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  comment: z.string().min(1).nullable(),
} satisfies Record<string, z.ZodType>;

/** Reusable rule: DB rejects '{}' and 'null'::jsonb but allows SQL NULL. */
const noEmptyJsonb = z
  .unknown()
  .nullable()
  .refine(
    (v) =>
      v === null ||
      v === undefined ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0),
    "Must be null or a non-empty object",
  );

/** Mirrors DB CHECK constraints on the card_sources table — single source of truth. */
export const cardSourceFieldRules = {
  source: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1).nullable(),
  might: z.number().min(0).nullable(),
  energy: z.number().min(0).nullable(),
  power: z.number().min(0).nullable(),
  mightBonus: z.number().min(0).nullable(),
  rulesText: z.string().min(1).nullable(),
  effectText: z.string().min(1).nullable(),
  sourceId: z.string().min(1).nullable(),
  sourceEntityId: z.string().min(1).nullable(),
  extraData: noEmptyJsonb,
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the printing_sources table — single source of truth. */
export const printingSourceFieldRules = {
  sourceId: z.string().min(1),
  setId: z.string().min(1).nullable(),
  setName: z.string().min(1).nullable(),
  collectorNumber: z.number().int().positive().nullable(),
  rarity: z.string().min(1).nullable(),
  artVariant: z.string().min(1).nullable(),
  finish: z.string().min(1).nullable(),
  artist: z.string().min(1).nullable(),
  publicCode: z.string().min(1).nullable(),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  imageUrl: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  sourceEntityId: z.string().min(1).nullable(),
  extraData: noEmptyJsonb,
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the printing_images table — single source of truth. */
export const printingImageFieldRules = {
  face: z.enum(["front", "back"]),
  source: z.string().min(1),
  originalUrl: z.string().min(1).nullable(),
  rehostedUrl: z.string().min(1).nullable(),
} satisfies Record<string, z.ZodType>;

export const patchPrintingSourceSchema = z.object({
  artVariant: z.string().min(1).optional(),
  isSigned: z.boolean().optional(),
  finish: z.string().min(1).optional(),
  collectorNumber: z.number().int().positive().optional(),
  setId: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  rarity: z.string().min(1).optional(),
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

/** Mirrors DB CHECK constraints on the cards table — single source of truth. */
export const cardFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]),
  superTypes: z.array(z.string()),
  domains: z.array(z.string()).min(1),
  might: z.number().min(0).nullable(),
  energy: z.number().min(0).nullable(),
  power: z.number().min(0).nullable(),
  mightBonus: z.number().min(0).nullable(),
  rulesText: z.string().min(1).nullable(),
  effectText: z.string().min(1).nullable(),
  tags: z.array(z.string()),
} satisfies Record<string, z.ZodType>;

export const acceptFieldSchema = z.object({
  field: z.string(),
  value: z.unknown(),
});

export const acceptNewCardSchema = z.object({
  cardFields: z.object({
    id: z.string().min(1),
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
    setId: z.string().min(1).optional(),
    setName: z.string().optional().nullable(),
    collectorNumber: printingFieldRules.collectorNumber.optional(),
    rarity: z.string().min(1).optional().nullable(),
    artVariant: printingFieldRules.artVariant.optional(),
    isSigned: z.boolean().optional(),
    isPromo: z.boolean().optional(),
    finish: printingFieldRules.finish.optional(),
    artist: printingFieldRules.artist.optional(),
    publicCode: printingFieldRules.publicCode.optional(),
    printedRulesText: printingFieldRules.printedRulesText.optional(),
    printedEffectText: printingFieldRules.printedEffectText.optional(),
    flavorText: printingFieldRules.flavorText.optional(),
    imageUrl: z.string().min(1).optional().nullable(),
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
