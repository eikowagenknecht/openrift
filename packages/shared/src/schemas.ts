import { z } from "zod";

// Field rules inlined from api/db/schemas — mirrors DB CHECK constraints for
// the subset needed by shared request-validation schemas.
const collectionFieldRules = {
  name: z.string().min(1).max(200),
};
const deckFieldRules = {
  name: z.string().min(1).max(200),
  format: z.enum(["standard", "freeform"]),
};
const deckCardFieldRules = {
  zone: z.enum(["main", "sideboard"]),
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

export const activitiesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const decksQuerySchema = z.object({
  wanted: z.string().optional(),
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

export const createSourceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullish(),
});

export const updateSourceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullish(),
});

export const addCopiesSchema = z.object({
  copies: z
    .array(
      z.object({
        printingId: z.uuid(),
        collectionId: z.uuid().optional(),
        sourceId: z.uuid().optional(),
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
  cards: z.array(
    z.object({
      cardId: z.string(),
      zone: deckCardFieldRules.zone,
      quantity: deckCardFieldRules.quantity,
    }),
  ),
});

export const createWishListSchema = z.object({
  name: z.string().min(1).max(200),
  rules: z.unknown().optional(),
});

export const updateWishListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  rules: z.unknown().optional(),
});

export const createWishListItemSchema = z
  .object({
    cardId: z.string().optional(),
    printingId: z.string().optional(),
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
  rules: z.unknown().optional(),
});

export const updateTradeListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  rules: z.unknown().optional(),
});

export const createTradeListItemSchema = z.object({
  copyId: z.uuid(),
});
