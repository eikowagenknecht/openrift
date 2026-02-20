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
  cost: z.number(),
  might: z.number(),
  energy: z.number(),
  power: z.number(),
});

export const cardArtSchema = z.object({
  thumbnailURL: z.string(),
  fullURL: z.string(),
  artist: z.string(),
});

export const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]),
  superTypes: z.array(z.string()).default([]),
  rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Showcase"]),
  collectorNumber: z.number(),
  faction: z.string(),
  stats: cardStatsSchema,
  keywords: z.array(z.string()),
  description: z.string(),
  effect: z.string().default(""),
  mightBonus: z.number().default(0),
  flavorText: z.string(),
  set: z.string(),
  art: cardArtSchema,
  tags: z.array(z.string()),
  orientation: z.enum(["portrait", "landscape"]),
  publicCode: z.string(),
});

export const contentSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  totalCards: z.number(),
  cards: z.array(cardSchema),
});

export const contentSchema = z.object({
  game: z.string(),
  version: z.string(),
  lastUpdated: z.string(),
  sets: z.array(contentSetSchema),
});
