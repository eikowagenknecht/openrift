import { z } from "zod";

export const cardStatsSchema = z.object({
  attack: z.number(),
  health: z.number(),
});

export const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["Champion", "Unit", "Spell", "Landmark"]),
  rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Legendary"]),
  cost: z.number(),
  stats: cardStatsSchema.nullable(),
  keywords: z.array(z.string()),
  description: z.string(),
  flavorText: z.string(),
  faction: z.string(),
  set: z.string(),
  collectorNumber: z.number(),
  artist: z.string(),
  imageUrl: z.string(),
  thumbnailUrl: z.string(),
});

export const cardSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  releaseDate: z.string(),
  cardCount: z.number(),
});

export const cardsDataSchema = z.array(cardSchema);
export const setsDataSchema = z.array(cardSetSchema);
