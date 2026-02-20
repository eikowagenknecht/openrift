import { z } from "zod";

export const cardStatsSchema = z.object({
  attack: z.number(),
  health: z.number(),
});

export const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["Champion", "Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]),
  rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Showcase"]),
  cost: z.number(),
  stats: cardStatsSchema.nullable(),
  keywords: z.array(z.string()),
  description: z.string(),
  flavorText: z.string(),
  domain: z.string(),
  set: z.string(),
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
