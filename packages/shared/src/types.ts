export type CardType = "Champion" | "Unit" | "Spell" | "Landmark";

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export const RARITY_ORDER: Record<Rarity, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
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
  faction: string;
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
  factions: string[];
  costMin: number | null;
  costMax: number | null;
}
