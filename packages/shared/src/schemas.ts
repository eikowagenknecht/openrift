import { z } from "zod";

/**
 * Field rules inlined from api/db/schemas — mirrors DB CHECK constraints for
 * the subset needed by shared request-validation schemas.
 */
const collectionFieldRules = {
  name: z.string().min(1).max(200),
};
const deckFieldRules = {
  name: z.string().min(1).max(200),
  format: z.string().min(1),
};
const deckCardFieldRules = {
  zone: z.string().min(1),
  quantity: z.number().int().positive(),
};
const wishListItemFieldRules = {
  quantityDesired: z.number().int().positive(),
};

// ---------------------------------------------------------------------------
// Common param & query schemas (used by zValidator("param"//"query"))
// ---------------------------------------------------------------------------

export const idParamSchema = z.object({ id: z.uuid() });

export const idAndItemIdParamSchema = z.object({ id: z.uuid(), itemId: z.uuid() });

export const slugParamSchema = z.object({ id: z.string().min(1) });

export const keyParamSchema = z.object({ key: z.string().min(1) });

export const providerParamSchema = z.object({ provider: z.string().min(1) });

export const marketplaceGroupParamSchema = z.object({
  marketplace: z.string().min(1),
  id: z.coerce.number().int(),
});

export const collectionEventsQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const copiesQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const decksQuerySchema = z.object({
  wanted: z.enum(["true", "false"]).optional(),
});

// ---------------------------------------------------------------------------
// Collection tracking schemas
// ---------------------------------------------------------------------------

export const createCollectionSchema = z.object({
  name: collectionFieldRules.name,
  description: z.string().max(1000).nullish(),
  availableForDeckbuilding: z.boolean().optional(),
});

export const updateCollectionSchema = z.object({
  name: collectionFieldRules.name.optional(),
  description: z.string().max(1000).nullish(),
  availableForDeckbuilding: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const addCopiesSchema = z.object({
  copies: z
    .array(
      z.object({
        printingId: z.uuid(),
        collectionId: z.uuid().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const moveCopiesSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
  toCollectionId: z.uuid(),
});

export const disposeCopiesSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
});

export const createDeckSchema = z.object({
  name: deckFieldRules.name,
  description: z.string().max(2000).nullish(),
  format: deckFieldRules.format,
  isWanted: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const updateDeckSchema = z.object({
  name: deckFieldRules.name.optional(),
  description: z.string().max(2000).nullish(),
  format: deckFieldRules.format.optional(),
  isWanted: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const updateDeckCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        cardId: z.uuid(),
        zone: deckCardFieldRules.zone,
        quantity: deckCardFieldRules.quantity,
      }),
    )
    .max(500),
});

// ---------------------------------------------------------------------------
// Deck import/export schemas
// ---------------------------------------------------------------------------

export const deckExportQuerySchema = z.object({
  format: z.enum(["piltover", "text", "tts"]).default("piltover"),
});

export const deckImportPreviewSchema = z.object({
  code: z.string().min(1).max(10_000),
  format: z.enum(["piltover", "text", "tts"]).default("piltover"),
});

// ---------------------------------------------------------------------------
// Wish list schemas
// ---------------------------------------------------------------------------

/** Flat key-value map for wish/trade list filter rules. */
const listRulesSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullable())
  .optional();

export const createWishListSchema = z.object({
  name: z.string().min(1).max(200),
  rules: listRulesSchema,
});

export const updateWishListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  rules: listRulesSchema,
});

export const createWishListItemSchema = z
  .object({
    cardId: z.uuid().optional(),
    printingId: z.uuid().optional(),
    quantityDesired: wishListItemFieldRules.quantityDesired.default(1),
  })
  .refine((data) => Boolean(data.cardId) !== Boolean(data.printingId), {
    message: "Exactly one of cardId or printingId must be provided",
  });

export const updateWishListItemSchema = z.object({
  quantityDesired: wishListItemFieldRules.quantityDesired,
});

export const createTradeListSchema = z.object({
  name: z.string().min(1).max(200),
  rules: listRulesSchema,
});

export const updateTradeListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  rules: listRulesSchema.nullable(),
});

export const createTradeListItemSchema = z.object({
  copyId: z.uuid(),
});

const marketplaceEnum = z.enum(["tcgplayer", "cardmarket", "cardtrader"]);

const themeEnum = z.enum(["light", "dark", "auto"]);

export const updatePreferencesSchema = z.object({
  showImages: z.boolean().nullable().optional(),
  fancyFan: z.boolean().nullable().optional(),
  foilEffect: z.boolean().nullable().optional(),
  cardTilt: z.boolean().nullable().optional(),
  theme: themeEnum.nullable().optional(),
  marketplaceOrder: z
    .array(marketplaceEnum)
    .max(3)
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate marketplaces" })
    .nullable()
    .optional(),
  languages: z
    .array(z.string().min(1).max(5))
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate languages" })
    .nullable()
    .optional(),
});
