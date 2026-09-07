/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { GROUP_BY_FIELDS, SORT_DIRECTIONS, SORT_OPTIONS } from "@openrift/shared/types/search";
import { createContext, useContext } from "react";
import { z } from "zod";

// `.catch(undefined)` drops malformed URL values silently; it does not throw.
const stringField = () => z.string().optional().catch(undefined);
const numberField = () => z.number().optional().catch(undefined);
const stringArray = () => z.array(z.string()).optional().catch(undefined);
const boolFlag = () => z.boolean().optional().catch(undefined);
const presenceField = () => z.enum(["any", "none"]).optional().catch(undefined);

const URL_GROUP_BY_VALUES = [...GROUP_BY_FIELDS, "card"] as const;
const ownedFilter = () =>
  z
    .array(z.enum(["none", "partial", "full", "extra"]))
    .optional()
    .catch(undefined);

export type OwnedBucket = "none" | "partial" | "full" | "extra";

/**
 * Applied individually to /cards, /collections, /decks, and /promos routes.
 * Routes that don't expose every facet pass `hiddenSections` to the filter UI.
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
  overnumbered: boolFlag(),
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
 * `wanted` narrows a group "bulk box" to printings the viewer's wish lists
 * still want; absent (not `false`) when off, so the URL stays clean.
 */
export const collectionDetailSearchSchema = filterSearchSchema.extend({
  wanted: boolFlag(),
});

/**
 * TanStack merges raw URL keys onto the validated search (Object.assign in
 * buildLocation), so re-parsing with the schema is needed to get the clean set.
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

export function useFilterSearch(): FilterSearch {
  const value = useContext(FilterSearchContext);
  if (value === null) {
    throw new Error("useFilterSearch must be used within a <FilterSearchProvider>");
  }
  return value;
}
