import { z } from "zod";

// ---------------------------------------------------------------------------
// Collection tracking schemas
// ---------------------------------------------------------------------------

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullish(),
  availableForDeckbuilding: z.boolean().optional(),
});

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
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

const deckFormatSchema = z.enum(["standard", "freeform"]);
const deckZoneSchema = z.enum(["main", "sideboard"]);

export const createDeckSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  format: deckFormatSchema,
  isWanted: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const updateDeckSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  format: deckFormatSchema.optional(),
  isWanted: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const updateDeckCardsSchema = z.object({
  cards: z.array(
    z.object({
      cardId: z.string(),
      zone: deckZoneSchema,
      quantity: z.number().int().positive(),
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

export const createWishListItemSchema = z.object({
  cardId: z.string().optional(),
  printingId: z.string().optional(),
  quantityDesired: z.number().int().positive().default(1),
});

export const updateWishListItemSchema = z.object({
  quantityDesired: z.number().int().positive(),
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
