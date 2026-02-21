export type CardType = "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield";

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";

export type Domain = "Fury" | "Calm" | "Mind" | "Body" | "Chaos" | "Order" | "Colorless";

export type CardVariant = "Normal" | "Alt Art" | "Overnumbered" | "Signed";

export const RARITY_ORDER: Record<Rarity, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Showcase: 4,
} as const;

export type SortOption = "id" | "name" | "energy" | "rarity";

export type SortDirection = "asc" | "desc";

export interface CardStats {
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
  superTypes: string[];
  rarity: Rarity;
  collectorNumber: number;
  faction: string;
  stats: CardStats;
  keywords: string[];
  description: string;
  effect: string;
  mightBonus: number;
  set: string;
  art: CardArt;
  tags: string[];
  orientation: "portrait" | "landscape";
  publicCode: string;
  variant?: CardVariant;
}

export interface ContentSet {
  id: string;
  name: string;
  totalCards: number;
  cards: Card[];
}

export interface RiftboundContent {
  game: string;
  version: string;
  lastUpdated: string;
  sets: ContentSet[];
}

export type SearchField = "name" | "cardText" | "keywords" | "tags" | "artist" | "id";

export const ALL_SEARCH_FIELDS: SearchField[] = [
  "name",
  "cardText",
  "keywords",
  "tags",
  "artist",
  "id",
];

export const DEFAULT_SEARCH_SCOPE: SearchField[] = ["name"];

export const SEARCH_PREFIX_MAP: Record<string, SearchField> = {
  n: "name",
  d: "cardText",
  k: "keywords",
  t: "tags",
  a: "artist",
  id: "id",
};

export interface CardFilters {
  search: string;
  searchScope: SearchField[];
  sets: string[];
  rarities: Rarity[];
  types: CardType[];
  superTypes: string[];
  domains: string[];
  energyMin: number | null;
  energyMax: number | null;
  mightMin: number | null;
  mightMax: number | null;
  powerMin: number | null;
  powerMax: number | null;
  variants: CardVariant[];
}
