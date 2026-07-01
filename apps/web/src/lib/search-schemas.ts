/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { createContext, useContext } from "react";
import { z } from "zod";

// Each field uses `.catch(undefined)` so malformed URL values (wrong type,
// unparseable) are silently dropped rather than crashing the route. Unknown
// keys are stripped by zod's default object parsing.
const stringField = () => z.string().optional().catch(undefined);
const numberField = () => z.number().optional().catch(undefined);
const stringArray = () => z.array(z.string()).optional().catch(undefined);
const boolFlag = () => z.boolean().optional().catch(undefined);
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
  promo: boolFlag(),
  banned: boolFlag(),
  errata: boolFlag(),
  sort: stringField(),
  sortDir: stringField(),
  view: stringField(),
  groupBy: stringField(),
  groupDir: stringField(),
});

export type FilterSearch = z.infer<typeof filterSearchSchema>;

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
