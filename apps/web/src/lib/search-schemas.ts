import { createContext, useContext } from "react";
import { z } from "zod";

// query-string's `arrayFormat: "comma"` returns a single string (not an array)
// when only one value is present, e.g. `?languages=EN` → `"EN"`. Coerce to an
// array so schemas validating `z.array(z.string())` still accept these URLs.
const stringArray = () =>
  z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string())).optional();

/**
 * Search param schema for routes that use the card filter system.
 * Applied individually to /cards, /collections, and /decks routes.
 * @returns Zod schema for filter search params.
 */
export const filterSearchSchema = z.object({
  search: z.string().optional(),
  sets: stringArray(),
  languages: stringArray(),
  rarities: stringArray(),
  types: stringArray(),
  superTypes: stringArray(),
  domains: stringArray(),
  artVariants: stringArray(),
  finishes: stringArray(),
  energyMin: z.number().optional(),
  energyMax: z.number().optional(),
  mightMin: z.number().optional(),
  mightMax: z.number().optional(),
  powerMin: z.number().optional(),
  powerMax: z.number().optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  owned: z.string().optional(),
  signed: z.string().optional(),
  promo: z.string().optional(),
  banned: z.string().optional(),
  errata: z.string().optional(),
  sort: z.string().optional(),
  sortDir: z.string().optional(),
  view: z.string().optional(),
  groupBy: z.string().optional(),
  groupDir: z.string().optional(),
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
