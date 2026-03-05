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
  imageURL: z.string(),
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
