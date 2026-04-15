import type { ArtVariant, CardType, Domain, Finish, Rarity, SuperType } from "./enums.js";

export type SearchField =
  | "name"
  | "cardText"
  | "keywords"
  | "tags"
  | "artist"
  | "flavorText"
  | "type"
  | "id";

export const ALL_SEARCH_FIELDS: SearchField[] = [
  "name",
  "cardText",
  "keywords",
  "tags",
  "artist",
  "flavorText",
  "type",
  "id",
];

export const DEFAULT_SEARCH_SCOPE: SearchField[] = [...ALL_SEARCH_FIELDS];

export const SEARCH_PREFIX_MAP: Record<string, SearchField> = {
  n: "name",
  d: "cardText",
  k: "keywords",
  t: "tags",
  a: "artist",
  f: "flavorText",
  ty: "type",
  id: "id",
};

export type GroupByField = "none" | "set" | "type" | "superType" | "domain" | "rarity";

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
  languages: string[];
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
  /**
   * Replaces the old `isPromo` boolean. `true` = printing has at least one
   * marker (any stamp); `false` = unmarked printing; `null` = no constraint.
   */
  hasAnyMarker: boolean | null;
  /** Filter to printings that have at least one of these marker slugs. */
  markerSlugs: string[];
  /** Filter to printings distributed through at least one of these channel slugs. */
  distributionChannelSlugs: string[];
  isBanned: boolean | null;
  hasErrata: boolean | null;
}
