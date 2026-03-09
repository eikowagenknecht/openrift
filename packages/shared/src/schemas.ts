import { z } from "zod";

// ---------------------------------------------------------------------------
// Gallery source schema — models the raw __NEXT_DATA__ card structure from
// riftbound.leagueoflegends.com/en-us/card-gallery/
// ---------------------------------------------------------------------------

const galleryImageSchema = z.object({
  url: z.string(),
  mimeType: z.string().optional(),
  dimensions: z
    .object({
      height: z.number(),
      width: z.number(),
      aspectRatio: z.number(),
    })
    .optional(),
});

const galleryIconRefSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: galleryImageSchema.optional(),
});

const galleryStatValueSchema = z.object({
  id: z.number(),
  label: z.string(),
  icon: galleryImageSchema.optional(),
});

export const galleryCardSchema = z.object({
  // Always present
  collectorNumber: z.number(),
  id: z.string(),
  name: z.string(),
  set: z.object({
    label: z.string(),
    value: z.object({ id: z.string(), label: z.string() }),
  }),
  domain: z.object({
    label: z.string(),
    values: z.array(galleryIconRefSchema),
  }),
  rarity: z.object({
    label: z.string(),
    value: galleryIconRefSchema,
  }),
  cardType: z.object({
    label: z.string(),
    type: z.array(galleryIconRefSchema),
    superType: z.array(galleryIconRefSchema).optional(),
  }),
  cardImage: galleryImageSchema.extend({
    accessibilityText: z.string().optional(),
  }),
  illustrator: z.object({
    label: z.string(),
    values: z.array(galleryIconRefSchema),
  }),
  text: z.object({
    label: z.string(),
    richText: z.object({ type: z.string(), body: z.string() }),
  }),
  orientation: z.enum(["portrait", "landscape"]),
  publicCode: z.string(),

  // Optional fields (not all card types have these)
  energy: z
    .object({ label: z.string(), value: z.object({ id: z.number(), label: z.string() }) })
    .optional(),
  might: z.object({ label: z.string(), value: galleryStatValueSchema }).optional(),
  power: z.object({ label: z.string(), value: galleryStatValueSchema }).optional(),
  mightBonus: z.object({ label: z.string(), value: galleryStatValueSchema }).optional(),
  effect: z
    .object({
      label: z.string(),
      richText: z.object({ type: z.string(), body: z.string() }),
    })
    .optional(),
  tags: z.object({ label: z.string(), tags: z.array(z.string()) }).optional(),
});

export type GalleryCard = z.infer<typeof galleryCardSchema>;

// ---------------------------------------------------------------------------
// App content schemas — the normalised format used by the web app
// ---------------------------------------------------------------------------

export const cardStatsSchema = z.object({
  might: z.number().nullable(),
  energy: z.number().nullable(),
  power: z.number().nullable(),
});

export const cardArtSchema = z.object({
  imageURL: z.string().nullable(),
  artist: z.string(),
});

export const cardSchema = z.object({
  // Printing identity
  id: z.string(),
  cardId: z.string(),
  sourceId: z.string(),

  // Game card fields
  name: z.string(),
  type: z.enum(["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]),
  superTypes: z.array(z.string()).default([]),
  domains: z.array(z.string()),
  stats: cardStatsSchema,
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  mightBonus: z.number().nullable().default(null),

  // Printing fields
  set: z.string(),
  collectorNumber: z.number(),
  rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Showcase"]),
  artVariant: z.string(),
  isSigned: z.boolean(),
  isPromo: z.boolean(),
  finish: z.string(),
  art: cardArtSchema,
  description: z.string(),
  effect: z.string().default(""),
  publicCode: z.string(),
});

export const contentSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  printedTotal: z.number(),
  cards: z.array(cardSchema),
});

export const contentSchema = z.object({
  game: z.string(),
  version: z.string(),
  lastUpdated: z.string(),
  sets: z.array(contentSetSchema),
});

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
        printingId: z.string(),
        collectionId: z.string().uuid().optional(),
        sourceId: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const moveCopiesSchema = z.object({
  copyIds: z.array(z.string().uuid()).min(1).max(500),
  toCollectionId: z.string().uuid(),
});

export const disposeCopiesSchema = z.object({
  copyIds: z.array(z.string().uuid()).min(1).max(500),
});

const activityTypeSchema = z.enum(["acquisition", "disposal", "trade", "reorganization"]);
const activityActionSchema = z.enum(["added", "removed", "moved"]);

export const createActivitySchema = z.object({
  type: activityTypeSchema,
  name: z.string().min(1).max(200).optional(),
  date: z.string().date().optional(),
  description: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        printingId: z.string(),
        action: activityActionSchema,
        copyId: z.string().uuid().optional(),
        fromCollectionId: z.string().uuid().optional(),
        toCollectionId: z.string().uuid().optional(),
      }),
    )
    .min(1),
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
  copyId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Candidate import schemas
// ---------------------------------------------------------------------------

const candidateCardTypeSchema = z.enum(["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]);

const candidateRaritySchema = z.enum(["Common", "Uncommon", "Rare", "Epic", "Showcase"]);

const candidateFinishSchema = z.enum(["normal", "foil"]);

export const candidatePrintingSchema = z.object({
  source_id: z.string().min(1),
  set_id: z.string().min(1),
  set_name: z.string().optional(),
  collector_number: z.number().int(),
  rarity: candidateRaritySchema,
  art_variant: z.string(),
  is_signed: z.boolean().default(false),
  is_promo: z.boolean().default(false),
  finish: candidateFinishSchema,
  artist: z.string(),
  public_code: z.string(),
  printed_rules_text: z.string(),
  printed_effect_text: z.string().default(""),
  image_url: z.string().optional(),
});

export const candidateCardSchema = z.object({
  card: z.object({
    source_id: z.string().min(1),
    name: z.string().min(1),
    type: candidateCardTypeSchema,
    super_types: z.array(z.string()).default([]),
    domains: z.array(z.string()),
    might: z.number().int().nullable(),
    energy: z.number().int().nullable(),
    power: z.number().int().nullable(),
    might_bonus: z.number().int().nullable().default(null),
    keywords: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    rules_text: z.string(),
    effect_text: z.string().default(""),
  }),
  printings: z.array(candidatePrintingSchema).min(1),
});

export const candidateUploadSchema = z.object({
  source: z.string().default(""),
  candidates: z.array(candidateCardSchema).min(1),
});
