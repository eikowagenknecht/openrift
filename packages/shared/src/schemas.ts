import { z } from "zod";

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
// Field rules — mirror DB CHECK constraints, single source of truth
// ---------------------------------------------------------------------------

/** Mirrors DB CHECK constraints on the collections table. */
export const collectionFieldRules = {
  name: z.string().min(1).max(200),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the sets table. */
export const setFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the decks table. */
export const deckFieldRules = {
  name: z.string().min(1).max(200),
  format: z.enum(["standard", "freeform"]),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the deck_cards table. */
export const deckCardFieldRules = {
  zone: z.enum(["main", "sideboard"]),
  quantity: z.number().int().positive(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the wish_list_items table. */
export const wishListItemFieldRules = {
  quantityDesired: z.number().int().positive(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the marketplace_snapshots table. */
export const marketplaceSnapshotFieldRules = {
  marketCents: z.number().int().min(0),
  lowCents: z.number().int().min(0).nullable(),
  midCents: z.number().int().min(0).nullable(),
  highCents: z.number().int().min(0).nullable(),
  trendCents: z.number().int().min(0).nullable(),
  avg1Cents: z.number().int().min(0).nullable(),
  avg7Cents: z.number().int().min(0).nullable(),
  avg30Cents: z.number().int().min(0).nullable(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the marketplace_sources table. */
export const marketplaceSourceFieldRules = {
  marketplace: z.string().min(1),
  externalId: z.number().int().positive(),
  productName: z.string().min(1),
} satisfies Record<string, z.ZodType>;

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
