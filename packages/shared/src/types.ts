export type CardType = "Champion" | "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield";

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";

export type Domain = "Fury" | "Calm" | "Mind" | "Body" | "Chaos" | "Order";

export const RARITY_ORDER: Record<Rarity, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Showcase: 4,
} as const;

export type SortOption = "name" | "collectorNumber" | "cost" | "rarity";

export interface CardStats {
  attack: number;
  health: number;
}

export interface Card {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  cost: number;
  stats: CardStats | null;
  keywords: string[];
  description: string;
  flavorText: string;
  domain: string;
  set: string;
  collectorNumber: number;
  artist: string;
  imageUrl: string;
  thumbnailUrl: string;
}

export interface CardSet {
  id: string;
  name: string;
  code: string;
  releaseDate: string;
  cardCount: number;
}

export interface CardFilters {
  search: string;
  sets: string[];
  rarities: Rarity[];
  types: CardType[];
  domains: string[];
  costMin: number | null;
  costMax: number | null;
}
