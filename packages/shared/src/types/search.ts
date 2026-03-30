import type { ArtVariant, CardType, Domain, Finish, Rarity, SuperType } from "./enums.js";

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

export type GroupByField =
  | "none"
  | "set"
  | "type"
  | "superType"
  | "domain"
  | "rarity"
  | "artVariant";

export type SortOption = "id" | "name" | "energy" | "rarity" | "price";

export type SortDirection = "asc" | "desc";

/**
 * Sentinel value for "None" in a FilterRange. When used as `min`, null-stat
 * cards are included. When used as `max`, only null-stat cards can match.
 */
export const NONE = -1;

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
  promoTypes: string[];
}
