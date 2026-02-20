export type CardType = "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield";

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";

export type Domain = "Fury" | "Calm" | "Mind" | "Body" | "Chaos" | "Order" | "Colorless";

export const RARITY_ORDER: Record<Rarity, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Showcase: 4,
} as const;

export type SortOption = "name" | "collectorNumber" | "cost" | "rarity";

export interface CardStats {
  cost: number;
  might: number;
  energy: number;
  power: number;
}

export interface CardArt {
  thumbnailURL: string;
  fullURL: string;
  artist: string;
}

export interface Card {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  collectorNumber: number;
  faction: string;
  stats: CardStats;
  keywords: string[];
  description: string;
  flavorText: string;
  set: string;
  art: CardArt;
  tags: string[];
  orientation: "portrait" | "landscape";
}

export interface ContentSet {
  id: string;
  name: string;
  cards: Card[];
}

export interface RiftboundContent {
  game: string;
  version: string;
  lastUpdated: string;
  sets: ContentSet[];
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
