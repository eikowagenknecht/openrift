import { createContext, useContext } from "react";
import { z } from "zod";

/**
 * Search param schema for routes that use the card filter system.
 * Applied individually to /cards, /collections, and /decks routes.
 * @returns Zod schema for filter search params.
 */
export const filterSearchSchema = z.object({
  search: z.string().optional(),
  sets: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  rarities: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  superTypes: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  artVariants: z.array(z.string()).optional(),
  finishes: z.array(z.string()).optional(),
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
