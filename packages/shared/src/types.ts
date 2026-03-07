// If you add a value here, also update the CHECK constraint in a new migration
// (see 009_check_constraints.ts — chk_cards_type).
export type CardType = "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield";

// If you add a value here, also update the CHECK constraint in a new migration
// (see 009_check_constraints.ts — chk_printings_rarity).
export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";

export type Domain = "Fury" | "Calm" | "Mind" | "Body" | "Chaos" | "Order" | "Colorless";

export const RARITY_ORDER: Record<Rarity, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Showcase: 4,
} as const;

export type SortOption = "id" | "name" | "energy" | "rarity" | "price";

export type SortDirection = "asc" | "desc";

export interface CardPrice {
  productId: number;
  low: number;
  mid: number;
  high: number;
  market: number;
}

export interface PricesData {
  source: string;
  fetchedAt: string;
  cards: Record<string, CardPrice>;
}

export interface CardStats {
  might: number | null;
  energy: number | null;
  power: number | null;
}

export interface CardArt {
  imageURL: string;
  artist: string;
}

export interface Card {
  // Printing identity
  id: string;
  cardId: string;
  sourceId: string;

  // Game card fields
  name: string;
  type: CardType;
  superTypes: string[];
  domains: string[];
  stats: CardStats;
  keywords: string[];
  tags: string[];
  mightBonus: number | null;

  // Printing fields
  set: string;
  collectorNumber: number;
  rarity: Rarity;
  artVariant: string;
  isSigned: boolean;
  isPromo: boolean;
  finish: string;
  art: CardArt;
  description: string;
  effect: string;
  printedDescription?: string;
  printedEffect?: string;
  publicCode: string;

  // Runtime (merged from prices)
  price?: CardPrice;
}

export function getOrientation(type: CardType): "portrait" | "landscape" {
  return type === "Battlefield" ? "landscape" : "portrait";
}

export interface ContentSet {
  id: string;
  name: string;
  printedTotal: number;
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

// Price history types
export type PriceSource = "tcgplayer" | "cardmarket";
export type TimeRange = "7d" | "30d" | "90d" | "all";

export interface TcgplayerSnapshot {
  date: string;
  market: number;
  low: number | null;
  mid: number | null;
  high: number | null;
}

export interface CardmarketSnapshot {
  date: string;
  market: number;
  low: number | null;
  trend: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
}

export interface PriceHistoryResponse {
  printingId: string;
  tcgplayer: {
    available: boolean;
    currency: "USD";
    productId: number | null;
    snapshots: TcgplayerSnapshot[];
  };
  cardmarket: {
    available: boolean;
    currency: "EUR";
    productId: number | null;
    snapshots: CardmarketSnapshot[];
  };
}

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
  priceMin: number | null;
  priceMax: number | null;
  artVariants: string[];
  finishes: string[];
  isSigned: boolean | null;
  isPromo: boolean | null;
}
