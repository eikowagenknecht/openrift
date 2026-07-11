/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { GROUP_BY_FIELDS, SORT_DIRECTIONS, SORT_OPTIONS } from "@openrift/shared";
import { createContext, useContext } from "react";
import { z } from "zod";

// Each field uses `.catch(undefined)` so malformed URL values (wrong type,
// unparseable) are silently dropped rather than crashing the route. Unknown
// keys are stripped by zod's default object parsing.
const stringField = () => z.string().optional().catch(undefined);
const numberField = () => z.number().optional().catch(undefined);
const stringArray = () => z.array(z.string()).optional().catch(undefined);
const boolFlag = () => z.boolean().optional().catch(undefined);
const presenceField = () => z.enum(["any", "none"]).optional().catch(undefined);

// Every group-by axis accepted at the URL level. The shared axes cover
// /cards, /collections, and /decks; /promos additionally groups by "card".
// An unknown value (an old bookmark after a rename, a hand-edited URL)
// coerces to undefined — the surface's default — instead of reaching the
// grouping code, where it would crash the grid.
const URL_GROUP_BY_VALUES = [...GROUP_BY_FIELDS, "card"] as const;
const ownedFilter = () =>
  z
    .array(z.enum(["none", "partial", "full", "extra"]))
    .optional()
    .catch(undefined);

export type OwnedBucket = "none" | "partial" | "full" | "extra";

/**
 * Search param schema for routes that use the card filter system.
 * Applied individually to /cards, /collections, /decks, and /promos routes.
 * Routes that don't expose every facet should pass `hiddenSections` to the
 * filter UI components.
 * @returns Zod schema for filter search params.
 */
export const filterSearchSchema = z.object({
  search: stringField(),
  sets: stringArray(),
  languages: stringArray(),
  rarities: stringArray(),
  types: stringArray(),
  superTypes: stringArray(),
  domains: stringArray(),
  artVariants: stringArray(),
  finishes: stringArray(),
  cardSizes: stringArray(),
  markers: stringArray(),
  channels: stringArray(),
  customTags: stringArray(),
  keywords: stringArray(),
  tags: stringArray(),
  // Negation companions (ADR-034): exclude params per multi-select facet.
  setsEx: stringArray(),
  languagesEx: stringArray(),
  raritiesEx: stringArray(),
  typesEx: stringArray(),
  superTypesEx: stringArray(),
  domainsEx: stringArray(),
  artVariantsEx: stringArray(),
  finishesEx: stringArray(),
  markersEx: stringArray(),
  channelsEx: stringArray(),
  customTagsEx: stringArray(),
  keywordsEx: stringArray(),
  tagsEx: stringArray(),
  // Tri-state "standard printing" constraint (ADR-034).
  standard: boolFlag(),
  energyMin: numberField(),
  energyMax: numberField(),
  mightMin: numberField(),
  mightMax: numberField(),
  powerMin: numberField(),
  powerMax: numberField(),
  priceMin: numberField(),
  priceMax: numberField(),
  ownedCountMin: numberField(),
  ownedCountMax: numberField(),
  owned: ownedFilter(),
  signed: boolFlag(),
  // Generic presence (any/none) params, one per PRESENCE_DIMENSIONS entry.
  // `markersPresence` supersedes the old `promo` boolean flag.
  markersPresence: presenceField(),
  superTypesPresence: presenceField(),
  customTagsPresence: presenceField(),
  channelsPresence: presenceField(),
  keywordsPresence: presenceField(),
  tagsPresence: presenceField(),
  banned: boolFlag(),
  errata: boolFlag(),
  sort: z.enum(SORT_OPTIONS).optional().catch(undefined),
  sortDir: z.enum(SORT_DIRECTIONS).optional().catch(undefined),
  view: z.enum(["cards", "printings", "copies"]).optional().catch(undefined),
  groupBy: z.enum(URL_GROUP_BY_VALUES).optional().catch(undefined),
  groupDir: z.enum(SORT_DIRECTIONS).optional().catch(undefined),
});

export type FilterSearch = z.infer<typeof filterSearchSchema>;

/**
 * Re-validates `search` and reports whether the raw URL carries keys the
 * schema would drop. TanStack merges raw URL keys onto the validated search
 * (Object.assign in buildLocation), so unknown keys survive into the
 * validated object — re-parsing with the schema yields the clean set. Used by
 * the card-browser routes' beforeLoad to canonicalize bookmarked/shared URLs.
 * @returns The cleaned search params when the raw URL has extraneous keys (the
 *   caller should redirect to them), or null when the URL is already clean.
 */
export function cleanedSearchForRedirect<Output extends Record<string, unknown>>(
  schema: z.ZodType<Output>,
  search: unknown,
  searchStr: string,
): Output | null {
  const parsed = schema.safeParse(search);
  const cleaned = parsed.success ? parsed.data : ({} as Output);
  const rawKeys = new Set(new URLSearchParams(searchStr).keys());
  const cleanedKeys = new Set(
    Object.entries(cleaned)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
  );
  const hasExtraneous =
    rawKeys.size !== cleanedKeys.size || [...rawKeys].some((key) => !cleanedKeys.has(key));
  return hasExtraneous ? cleaned : null;
}

const FilterSearchContext = createContext<FilterSearch | null>(null);

export const FilterSearchProvider = FilterSearchContext;

/**
 * Read filter search params provided by the nearest FilterSearchProvider.
 * Must be called within a route that wraps its content with the provider.
 * @returns The current filter search params.
 */
export function useFilterSearch(): FilterSearch {
  const value = useContext(FilterSearchContext);
  if (value === null) {
    throw new Error("useFilterSearch must be used within a <FilterSearchProvider>");
  }
  return value;
}
