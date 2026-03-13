// If you add a value here, also update the CHECK constraint in a new migration
// (see 001-core-schema.ts — chk_cards_type).
export type CardType = "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield";

// If you add a value here, also update the CHECK constraint in a new migration
// (see 001-core-schema.ts — chk_printings_rarity).
export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";

export type Domain = "Fury" | "Calm" | "Mind" | "Body" | "Chaos" | "Order" | "Colorless";

export type SuperType = "Basic" | "Champion" | "Signature" | "Token";

export type CardFace = "front" | "back";

export const DOMAIN_ORDER: readonly Domain[] = [
  "Fury",
  "Calm",
  "Mind",
  "Body",
  "Chaos",
  "Order",
  "Colorless",
] as const;

export const RARITY_ORDER: readonly Rarity[] = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Showcase",
] as const;

export type ArtVariant = "normal" | "altart" | "overnumbered";

export const ART_VARIANT_ORDER: readonly ArtVariant[] = [
  "normal",
  "altart",
  "overnumbered",
] as const;

export type Finish = "normal" | "foil";

export const FINISH_ORDER: readonly Finish[] = ["normal", "foil"] as const;

export type SortOption = "id" | "name" | "energy" | "rarity" | "price";

export type SortDirection = "asc" | "desc";

export interface PricesData {
  source: string;
  fetchedAt: string;
  prices: Record<string, number>;
}

export interface CardStats {
  might: number | null;
  energy: number | null;
  power: number | null;
}

export interface Card {
  id: string;
  name: string;
  type: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  stats: CardStats;
  keywords: string[];
  tags: string[];
  mightBonus: number | null;
  description: string;
  effect: string;
}

export interface PrintingImage {
  face: CardFace;
  url: string;
}

export interface Printing {
  id: string;
  sourceId: string;
  set: string;
  collectorNumber: number;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  isPromo: boolean;
  finish: Finish;
  images: PrintingImage[];
  artist: string;
  publicCode: string;
  printedDescription?: string;
  printedEffect?: string;
  flavorText?: string;
  marketPrice?: number;
  card: Card;
}

export function getOrientation(type: CardType): "portrait" | "landscape" {
  return type === "Battlefield" ? "landscape" : "portrait";
}

export interface ContentSet {
  id: string;
  name: string;
  printedTotal: number;
  printings: Printing[];
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

// ─── Card sources ────────────────────────────────────────────────────────────

export interface CardSource {
  id: string;
  cardId: string | null;
  source: string;
  name: string;
  type: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  rulesText: string;
  effectText: string;
  tags: string[];
  sourceId: string | null;
  sourceEntityId: string | null;
  extraData: unknown | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrintingSource {
  id: string;
  cardSourceId: string;
  printingId: string | null;
  sourceId: string;
  setId: string | null;
  setName: string | null;
  collectorNumber: number;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  isPromo: boolean;
  finish: Finish;
  artist: string;
  publicCode: string;
  printedRulesText: string;
  printedEffectText: string;
  imageUrl: string | null;
  flavorText: string;
  extraData: unknown | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPrintingImage {
  id: string;
  printingId: string;
  face: CardFace;
  source: string;
  originalUrl: string | null;
  rehostedUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CardSourceSummary {
  cardId: string | null;
  name: string;
  sourceCount: number;
  uncheckedCardCount: number;
  uncheckedPrintingCount: number;
  hasGallery: boolean;
}

export interface SourceStats {
  source: string;
  cardCount: number;
  printingCount: number;
  lastUpdated: string;
}

export interface CardSourceUploadUpdatedCard {
  name: string;
  sourceId: string | null;
  fields: { field: string; from: unknown; to: unknown }[];
}

export interface CardSourceUploadResult {
  newCards: number;
  updates: number;
  unchanged: number;
  errors: string[];
  updatedCards: CardSourceUploadUpdatedCard[];
}

// ─── Card filters ───────────────────────────────────────────────────────────

export interface FilterRange {
  min: number | null;
  max: number | null;
}

export type RangeKey = "energy" | "might" | "power" | "price";

export interface CardFilters {
  search: string;
  searchScope: SearchField[];
  sets: string[];
  rarities: Rarity[];
  types: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  energy: FilterRange;
  might: FilterRange;
  power: FilterRange;
  price: FilterRange;
  artVariants: ArtVariant[];
  finishes: Finish[];
  isSigned: boolean | null;
  isPromo: boolean | null;
}
