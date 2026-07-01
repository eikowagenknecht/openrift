import { z } from "zod";

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

export type GroupByField =
  | "none"
  | "set"
  | "type"
  | "superType"
  | "domain"
  | "rarity"
  | "channel"
  | "year"
  | "marker";

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

const filterRangeSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
});

// Open string-enum dims (sets, languages, rarities, types, …) validate as plain
// strings: the valid values are DB-driven, so the canonical types are open
// strings (see types/enums.ts). The inferred field types are therefore
// `string[]`, which is mutually assignable with the named enum arrays.
const stringArray = () => z.array(z.string());

/**
 * The complete card-filter predicate. Single source of truth: the runtime Zod
 * schema (used to validate persisted list rules, ADR-034) and the `CardFilters`
 * type are one definition — `CardFilters` is `z.infer<typeof cardFiltersSchema>`.
 */
export const cardFiltersSchema = z.object({
  search: z.string(),
  searchScope: z.array(z.enum(ALL_SEARCH_FIELDS as [SearchField, ...SearchField[]])),
  sets: stringArray(),
  languages: stringArray(),
  rarities: stringArray(),
  types: stringArray(),
  superTypes: stringArray(),
  domains: stringArray(),
  energy: filterRangeSchema,
  might: filterRangeSchema,
  power: filterRangeSchema,
  price: filterRangeSchema,
  artVariants: stringArray(),
  finishes: stringArray(),
  // Filter to printings of these physical sizes (e.g. `standard`, `oversized`).
  cardSizes: stringArray(),
  isSigned: z.boolean().nullable(),
  // Replaces the old `isPromo` boolean. `true` = printing has at least one
  // marker (any stamp); `false` = unmarked printing; `null` = no constraint.
  hasAnyMarker: z.boolean().nullable(),
  // Filter to printings that have at least one of these marker slugs.
  markerSlugs: stringArray(),
  // Filter to printings distributed through at least one of these channel slugs.
  distributionChannelSlugs: stringArray(),
  // Filter to cards that carry at least one of these custom-tag slugs.
  // Admin-curated tags only relevant in the freeform deck builder; standard
  // filtering should leave this empty.
  customTagSlugs: stringArray(),
  isBanned: z.boolean().nullable(),
  hasErrata: z.boolean().nullable(),
  // ── Negation companions (ADR-034) ─────────────────────────────────────────
  // A row is rejected if it matches ANY excluded value.
  // Scalar dims (sets, languages, rarities, types, artVariants, finishes):
  //   value ∈ exclude.
  // Array dims (superTypes, domains, markerSlugs, distributionChannelSlugs,
  //   customTagSlugs): the row's array ∩ exclude ≠ ∅.
  setsExclude: stringArray(),
  languagesExclude: stringArray(),
  raritiesExclude: stringArray(),
  typesExclude: stringArray(),
  superTypesExclude: stringArray(),
  domainsExclude: stringArray(),
  artVariantsExclude: stringArray(),
  finishesExclude: stringArray(),
  markerSlugsExclude: stringArray(),
  distributionChannelSlugsExclude: stringArray(),
  customTagSlugsExclude: stringArray(),
  // Derived tri-state "standard printing" constraint (ADR-034).
  // null = no constraint; true = standard only; false = non-standard only.
  isStandard: z.boolean().nullable(),
});

export type CardFilters = z.infer<typeof cardFiltersSchema>;

/**
 * A blank filter set: nothing selected, no constraints. Use this everywhere a
 * fresh `CardFilters` is constructed (spread then override) so new dimensions
 * stay in one place and never get forgotten at a call site.
 */
export const EMPTY_CARD_FILTERS: CardFilters = {
  search: "",
  searchScope: [...DEFAULT_SEARCH_SCOPE],
  sets: [],
  languages: [],
  rarities: [],
  types: [],
  superTypes: [],
  domains: [],
  energy: { min: null, max: null },
  might: { min: null, max: null },
  power: { min: null, max: null },
  price: { min: null, max: null },
  artVariants: [],
  finishes: [],
  cardSizes: [],
  isSigned: null,
  hasAnyMarker: null,
  markerSlugs: [],
  distributionChannelSlugs: [],
  customTagSlugs: [],
  isBanned: null,
  hasErrata: null,
  setsExclude: [],
  languagesExclude: [],
  raritiesExclude: [],
  typesExclude: [],
  superTypesExclude: [],
  domainsExclude: [],
  artVariantsExclude: [],
  finishesExclude: [],
  markerSlugsExclude: [],
  distributionChannelSlugsExclude: [],
  customTagSlugsExclude: [],
  isStandard: null,
};
