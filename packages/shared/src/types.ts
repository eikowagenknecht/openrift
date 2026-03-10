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
  imageURL: string | null;
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

// ─── Collection tracking ────────────────────────────────────────────────────

export type ActivityType = "acquisition" | "disposal" | "trade" | "reorganization";
export type ActivityAction = "added" | "removed" | "moved";
export type DeckFormat = "standard" | "freeform";
export type DeckZone = "main" | "sideboard";

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  availableForDeckbuilding: boolean;
  isInbox: boolean;
  sortOrder: number;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Copy {
  id: string;
  printingId: string;
  collectionId: string;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  type: ActivityType;
  name: string | null;
  date: string;
  description: string | null;
  isAuto: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  activityId: string;
  activityType: ActivityType;
  copyId: string | null;
  printingId: string;
  action: ActivityAction;
  fromCollectionId: string | null;
  fromCollectionName: string | null;
  toCollectionId: string | null;
  toCollectionName: string | null;
  metadataSnapshot: unknown;
  createdAt: string;
}

export interface Deck {
  id: string;
  name: string;
  description: string | null;
  format: DeckFormat;
  isWanted: boolean;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCard {
  id: string;
  deckId: string;
  cardId: string;
  zone: DeckZone;
  quantity: number;
}

export interface WishList {
  id: string;
  name: string;
  rules: unknown;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WishListItem {
  id: string;
  wishListId: string;
  cardId: string | null;
  printingId: string | null;
  quantityDesired: number;
}

export interface TradeList {
  id: string;
  name: string;
  rules: unknown;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradeListItem {
  id: string;
  tradeListId: string;
  copyId: string;
}

// ─── Candidate import ────────────────────────────────────────────────────────

export type CandidateStatus = "pending" | "accepted" | "rejected";

export interface CandidatePrinting {
  id: string;
  sourceId: string;
  setId: string;
  setName: string | null;
  collectorNumber: number;
  rarity: Rarity;
  artVariant: string;
  isSigned: boolean;
  isPromo: boolean;
  finish: string;
  artist: string;
  publicCode: string;
  printedRulesText: string;
  printedEffectText: string;
  imageUrl: string | null;
}

export interface CandidateCard {
  id: string;
  status: CandidateStatus;
  source: string;
  matchCardId: string | null;
  sourceId: string;
  name: string;
  type: CardType;
  superTypes: string[];
  domains: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  keywords: string[];
  rulesText: string;
  effectText: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  printings: CandidatePrinting[];
  matchedCard?: {
    id: string;
    name: string;
  };
}

export interface CandidateUploadResult {
  newCards: number;
  updates: number;
  errors: string[];
}

// ─── Card filters ───────────────────────────────────────────────────────────

export interface FilterRange {
  min: number | null;
  max: number | null;
}

export interface CardFilters {
  search: string;
  searchScope: SearchField[];
  sets: string[];
  rarities: Rarity[];
  types: CardType[];
  superTypes: string[];
  domains: string[];
  energy: FilterRange;
  might: FilterRange;
  power: FilterRange;
  price: FilterRange;
  artVariants: string[];
  finishes: string[];
  isSigned: boolean | null;
  isPromo: boolean | null;
}
