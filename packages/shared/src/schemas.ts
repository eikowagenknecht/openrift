import { z } from "zod";

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
  rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Showcase"]),
  collectorNumber: z.number(),
  faction: z.string(),
  stats: cardStatsSchema,
  keywords: z.array(z.string()),
  description: z.string(),
  flavorText: z.string(),
  set: z.string(),
  art: cardArtSchema,
  tags: z.array(z.string()),
});

export const contentSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  cards: z.array(cardSchema),
});

export const contentSchema = z.object({
  game: z.string(),
  version: z.string(),
  lastUpdated: z.string(),
  sets: z.array(contentSetSchema),
});
