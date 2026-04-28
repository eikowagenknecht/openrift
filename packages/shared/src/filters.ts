import type {
  CardFilters,
  DistributionChannel,
  EnumOrders,
  FilterRange,
  Marker,
  Printing,
  SearchField,
  SortDirection,
  SortOption,
} from "./types/index.js";
import { ALL_SEARCH_FIELDS, NONE, SEARCH_PREFIX_MAP } from "./types/index.js";
import { boundsOf, unique } from "./utils.js";
import { WellKnown } from "./well-known.js";

interface ParsedSearchTerm {
  field: SearchField | null;
  text: string;
}

/**
 * Tokenizes a raw search string into structured terms, supporting prefix syntax
 * like "n:Fireball" or "t:spell" so the UI can target specific card fields.
 * Terms are split on whitespace; use quotes to include spaces in a term.
 *
 * @returns An array of parsed terms, each with an optional field qualifier and the search text.
 *
 * @example
 * ```ts
 * parseSearchTerms('n:Dragon fire')
 * // => [{ field: "name", text: "Dragon" }, { field: null, text: "fire" }]
 *
 * parseSearchTerms('n:"Fire Dragon"')
 * // => [{ field: "name", text: "Fire Dragon" }]
 * ```
 */
export function parseSearchTerms(raw: string): ParsedSearchTerm[] {
  const terms: ParsedSearchTerm[] = [];
  const regex = /(?:(id|ty|[ndktaf]):(?:"([^"]*)"|([\S]*)))|(?:"([^"]*)")|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const prefix = match[1];
    if (prefix) {
      const text = (match[2] ?? match[3] ?? "").trim();
      if (text) {
        terms.push({ field: SEARCH_PREFIX_MAP[prefix] ?? null, text });
      }
    } else {
      const text = (match[4] ?? match[5] ?? "").trim();
      if (text) {
        terms.push({ field: null, text });
      }
    }
  }
  return terms;
}

/**
 * Checks whether a single printing matches a search term against a specific field.
 * Used by both prefixed searches (e.g. "n:dragon") and un-prefixed broad searches.
 *
 * @returns `true` if the printing's field value contains the search text (case-insensitive).
 *
 * @example
 * ```ts
 * printingMatchesField(printing, "name", "dragon") // true if card name contains "dragon"
 * ```
 */
function printingMatchesField(
  printing: Printing,
  field: SearchField,
  text: string,
  keywordReverseMap?: Map<string, string>,
): boolean {
  const { card } = printing;
  const lower = text.toLowerCase();
  if (field === "name") {
    return (
      card.name.toLowerCase().includes(lower) ||
      (printing.printedName?.toLowerCase().includes(lower) ?? false)
    );
  }
  if (field === "cardText") {
    return (
      (card.errata?.correctedRulesText?.toLowerCase().includes(lower) ?? false) ||
      (card.errata?.correctedEffectText?.toLowerCase().includes(lower) ?? false) ||
      (printing.printedRulesText?.toLowerCase().includes(lower) ?? false) ||
      (printing.printedEffectText?.toLowerCase().includes(lower) ?? false)
    );
  }
  if (field === "keywords") {
    // Match against canonical keywords directly
    if (card.keywords.some((kw) => kw.toLowerCase().includes(lower))) {
      return true;
    }
    // Also try resolving the search term via the translation reverse map
    if (keywordReverseMap) {
      const canonical = keywordReverseMap.get(lower);
      if (canonical) {
        return card.keywords.some((kw) => kw.toLowerCase() === canonical.toLowerCase());
      }
    }
    return false;
  }
  if (field === "tags") {
    return card.tags.some((tag) => tag.toLowerCase().includes(lower));
  }
  if (field === "artist") {
    return printing.artist.toLowerCase().includes(lower);
  }
  if (field === "flavorText") {
    return printing.flavorText?.toLowerCase().includes(lower) ?? false;
  }
  if (field === "type") {
    return (
      card.type.toLowerCase().includes(lower) ||
      card.superTypes.some((st) => st.toLowerCase().includes(lower))
    );
  }
  return printing.shortCode.toLowerCase().includes(lower);
}

/**
 * Tests whether a nullable numeric value falls within a FilterRange. An empty
 * range (both bounds null) passes everything; a null value fails any non-empty
 * range unless `min` is `NONE` (-1), which opts null-stat cards in. When `max`
 * is `NONE`, no real numeric value can pass (only null values match when `min`
 * is also `NONE`).
 *
 * @returns `true` if the value satisfies the range constraints (or the range is empty).
 *
 * @example
 * ```ts
 * matchesRange(3, { min: 1, max: 5 })        // => true
 * matchesRange(null, { min: 1, max: null })   // => false
 * matchesRange(7, { min: null, max: null })   // => true  (empty range)
 * matchesRange(null, { min: -1, max: 5 })     // => true  (NONE includes nulls)
 * matchesRange(null, { min: -1, max: -1 })    // => true  (only nulls)
 * matchesRange(3, { min: -1, max: -1 })       // => false (only nulls)
 * ```
 */
function matchesRange(value: number | null, range: FilterRange): boolean {
  if (range.min === null && range.max === null) {
    return true;
  }
  if (value === null) {
    return range.min === NONE;
  }
  if (range.max === NONE) {
    return false;
  }
  if (range.min !== null && range.min !== NONE && value < range.min) {
    return false;
  }
  if (range.max !== null && value > range.max) {
    return false;
  }
  return true;
}

function includes<T>(allowed: T[], value: T): boolean {
  return allowed.length === 0 || allowed.includes(value);
}

function overlaps<T>(allowed: T[], values: T[]): boolean {
  return allowed.length === 0 || values.some((v) => allowed.includes(v));
}

/**
 * Domain filter: 0 selected = all, 1 selected = any card with that domain,
 * 2+ selected = card's domains must all be within the selected set.
 * @returns Whether the card matches the domain filter.
 */
function matchesDomains<T>(allowed: T[], values: T[]): boolean {
  if (allowed.length === 0) {
    return true;
  }
  if (allowed.length === 1) {
    return values.some((v) => allowed.includes(v));
  }
  return values.every((v) => allowed.includes(v));
}

function matchesFlag(filter: boolean | null, actual: boolean): boolean {
  return filter === null || actual === filter;
}

function matchesMarkers(
  hasAnyMarker: boolean | null,
  markerSlugs: string[],
  actualSlugs: string[],
): boolean {
  const hasMarker = actualSlugs.length > 0;
  if (hasAnyMarker === false) {
    return !hasMarker;
  }
  if (hasAnyMarker === true && !hasMarker) {
    return false;
  }
  if (markerSlugs.length === 0) {
    return true;
  }
  return markerSlugs.some((slug) => actualSlugs.includes(slug));
}

function matchesDistributionChannels(channelSlugs: string[], actualSlugs: string[]): boolean {
  if (channelSlugs.length === 0) {
    return true;
  }
  return channelSlugs.some((slug) => actualSlugs.includes(slug));
}

/**
 * Compares by a nullable numeric value. Nulls are always pushed to the end,
 * the primary comparison respects `dir`, and the tiebreaker (shortCode) is
 * always ascending.
 *
 * @returns A negative, zero, or positive number for sort ordering.
 */
function compareWithFallback(
  a: Printing,
  b: Printing,
  getValue: (p: Printing) => number | null | undefined,
  dir: 1 | -1,
): number {
  const va = getValue(a);
  const vb = getValue(b);
  const aNullish = va === null || va === undefined;
  const bNullish = vb === null || vb === undefined;
  if (aNullish && bNullish) {
    return a.shortCode.localeCompare(b.shortCode);
  }
  if (aNullish) {
    return 1;
  }
  if (bNullish) {
    return -1;
  }
  return dir * (va - vb) || a.shortCode.localeCompare(b.shortCode);
}

function matchesSearch(
  printing: Printing,
  terms: ParsedSearchTerm[],
  hasPrefixes: boolean,
  searchScope: SearchField[],
  keywordReverseMap?: Map<string, string>,
): boolean {
  if (terms.length === 0) {
    return true;
  }
  return terms.every((term) => {
    if (term.field) {
      return printingMatchesField(printing, term.field, term.text, keywordReverseMap);
    }
    // Un-prefixed terms widen to all fields when any prefix is present (e.g. "n:Dragon fire"
    // searches "fire" everywhere), but respect the user's search scope when no prefixes are used.
    const fields = hasPrefixes ? ALL_SEARCH_FIELDS : searchScope;
    return fields.some((f) => printingMatchesField(printing, f, term.text, keywordReverseMap));
  });
}

interface FilterCardsOptions {
  /** Reverse map from translated keyword labels to canonical names, for cross-language search. */
  keywordReverseMap?: Map<string, string>;
  /**
   * Resolves the latest market price for a printing. Defaults to a no-op that returns
   * `undefined`, which means the price filter only matches printings with no price
   * (when the filter range is non-empty). Wire this to a {@link PriceLookup}-backed
   * resolver to filter on the user's selected marketplace.
   */
  getPrice?: (printing: Printing) => number | undefined;
}

/**
 * Core filtering pipeline — applies every active filter (search, sets, rarities,
 * types, stats, price, etc.) to the full printings list and returns only matches.
 * Used by the web client for instant local filtering.
 *
 * @returns The subset of printings that satisfy all active filter criteria.
 *
 * @example
 * ```ts
 * const results = filterCards(allPrintings, { ...defaultFilters, sets: ["Origins"] });
 * ```
 */
export function filterCards(
  printings: Printing[],
  filters: CardFilters,
  options: FilterCardsOptions = {},
): Printing[] {
  const terms = filters.search ? parseSearchTerms(filters.search) : [];
  const hasPrefixes = terms.some((t) => t.field !== null);
  const getPrice = options.getPrice;

  return printings.filter((printing) => {
    const { card } = printing;
    return (
      matchesSearch(printing, terms, hasPrefixes, filters.searchScope, options.keywordReverseMap) &&
      includes(filters.sets, printing.setSlug) &&
      includes(filters.languages, printing.language) &&
      matchesDomains(filters.domains, card.domains) &&
      includes(filters.types, card.type) &&
      overlaps(filters.superTypes, card.superTypes) &&
      includes(filters.rarities, printing.rarity) &&
      includes(filters.artVariants, printing.artVariant || "normal") &&
      includes(filters.finishes, printing.finish) &&
      matchesFlag(filters.isSigned, printing.isSigned) &&
      matchesMarkers(
        filters.hasAnyMarker,
        filters.markerSlugs,
        printing.markers.map((m) => m.slug),
      ) &&
      matchesDistributionChannels(
        filters.distributionChannelSlugs,
        printing.distributionChannels.map((dc) => dc.channel.slug),
      ) &&
      matchesRange(card.energy, filters.energy) &&
      matchesRange(card.might, filters.might) &&
      matchesRange(card.power, filters.power) &&
      matchesRange(getPrice?.(printing) ?? null, filters.price) &&
      matchesFlag(filters.isBanned, card.bans.length > 0) &&
      matchesFlag(filters.hasErrata, card.errata !== null)
    );
  });
}

/**
 * Returns the index of `value` in `order`, or `Infinity` for unknown values (sorts to end).
 * @returns The index, or `Infinity` if not found.
 */
function orderIndex(order: readonly string[], value: string): number {
  const idx = order.indexOf(value);
  return idx === -1 ? Infinity : idx;
}

export interface AvailableFilters {
  sets: string[];
  /** Set slugs that are supplemental (not main expansions). Used for dimmed styling in filters. */
  supplementalSets: ReadonlySet<string>;
  domains: string[];
  types: string[];
  superTypes: string[];
  rarities: string[];
  artVariants: string[];
  finishes: string[];
  hasSigned: boolean;
  hasAnyMarker: boolean;
  hasBanned: boolean;
  hasErrata: boolean;
  hasNullEnergy: boolean;
  hasNullMight: boolean;
  hasNullPower: boolean;
  markers: Marker[];
  distributionChannels: DistributionChannel[];
  energy: { min: number; max: number };
  might: { min: number; max: number };
  power: { min: number; max: number };
  price: { min: number; max: number };
}

interface GetAvailableFiltersOptions {
  /**
   * Sort orders for the enum dimensions of the result. Required — pass the
   * live orders from `/api/enums` (`useEnumOrders().orders`) so admin
   * re-ordering (especially of the finishes table) takes effect.
   */
  orders: EnumOrders;
  /**
   * Set metadata used to sort sets (main before supplemental) and to mark
   * supplemental sets for dimmed styling. When omitted, sets appear in
   * insertion order and `supplementalSets` is empty.
   */
  sets?: readonly { slug: string; setType?: string }[];
  /**
   * Resolves the latest market price for a printing. Used to compute the
   * available price range. Defaults to `() => undefined` (no prices known),
   * which yields a `{ min: 0, max: 0 }` range.
   */
  getPrice?: (printing: Printing) => number | undefined;
}

/**
 * Scans the full printings list to derive every distinct filter value (sets, rarities,
 * stat ranges, etc.) so the UI can populate dropdowns and sliders with only values
 * that actually exist in the data.
 *
 * @returns An object describing every filterable dimension and its observed range/values.
 *
 * @example
 * ```ts
 * const available = getAvailableFilters(allPrintings);
 * // available.energy => { min: 0, max: 8 }
 * // available.rarities => ["common", "uncommon", "rare", "mythic"]
 * ```
 */
export function getAvailableFilters(
  printings: Printing[],
  options: GetAvailableFiltersOptions,
): AvailableFilters {
  const orders = options.orders;
  const getPrice = options.getPrice;
  const setMeta = options.sets;
  const sets = unique(printings.map((p) => p.setSlug));
  if (setMeta) {
    const setSlugOrder = new Map(
      setMeta
        .toSorted((a, b) =>
          a.setType === b.setType ? 0 : a.setType === WellKnown.setType.MAIN ? -1 : 1,
        )
        .map((s, i) => [s.slug, i]),
    );
    sets.sort((a, b) => (setSlugOrder.get(a) ?? Infinity) - (setSlugOrder.get(b) ?? Infinity));
  }
  const domains = unique(printings.flatMap((p) => p.card.domains)).sort(
    (a, b) => orderIndex(orders.domains, a) - orderIndex(orders.domains, b),
  );
  const types = unique(printings.map((p) => p.card.type)).sort();
  const superTypes = unique(printings.flatMap((p) => p.card.superTypes))
    .filter((st) => st !== "Basic")
    .sort();
  const rarities = unique(printings.map((p) => p.rarity)).sort(
    (a, b) => orderIndex(orders.rarities, a) - orderIndex(orders.rarities, b),
  );
  const artVariants = unique(printings.map((p) => p.artVariant || "normal")).sort(
    (a, b) => orderIndex(orders.artVariants, a) - orderIndex(orders.artVariants, b),
  );
  const finishes = unique(printings.map((p) => p.finish)).sort(
    (a, b) => orderIndex(orders.finishes, a) - orderIndex(orders.finishes, b),
  );

  const energies = printings.flatMap((p) => p.card.energy ?? []);
  const mights = printings.flatMap((p) => p.card.might ?? []);
  const powers = printings.flatMap((p) => p.card.power ?? []);
  const prices = getPrice ? printings.flatMap((p) => getPrice(p) ?? []) : [];

  return {
    sets,
    supplementalSets: setMeta
      ? new Set(
          setMeta.filter((s) => s.setType === WellKnown.setType.SUPPLEMENTAL).map((s) => s.slug),
        )
      : new Set<string>(),
    domains,
    types,
    superTypes,
    rarities,
    artVariants,
    finishes,
    hasSigned: printings.some((p) => p.isSigned),
    hasAnyMarker: printings.some((p) => p.markers.length > 0),
    hasBanned: printings.some((p) => p.card.bans.length > 0),
    hasErrata: printings.some((p) => p.card.errata !== null),
    hasNullEnergy: printings.some((p) => p.card.energy === null),
    hasNullMight: printings.some((p) => p.card.might === null),
    hasNullPower: printings.some((p) => p.card.power === null),
    markers: [
      ...new Map(printings.flatMap((p) => p.markers.map((m) => [m.slug, m] as const))).values(),
    ].sort((a, b) => a.slug.localeCompare(b.slug)),
    distributionChannels: [
      ...new Map(
        printings.flatMap((p) =>
          p.distributionChannels.map((dc) => [dc.channel.slug, dc.channel] as const),
        ),
      ).values(),
    ].sort((a, b) => a.slug.localeCompare(b.slug)),
    energy: boundsOf(energies),
    might: boundsOf(mights),
    power: boundsOf(powers),
    price: boundsOf(prices),
  };
}

export interface FilterCounts {
  sets: Map<string, number>;
  languages: Map<string, number>;
  domains: Map<string, number>;
  types: Map<string, number>;
  superTypes: Map<string, number>;
  rarities: Map<string, number>;
  artVariants: Map<string, number>;
  finishes: Map<string, number>;
  /**
   * Counts for the single-chip "More"-section flags. Each value reflects the
   * count *if the chip's currently-displayed state were applied*, combined
   * with all other active filters. `owned` is left as `undefined` here — it
   * lives in `useCardData` because computing it requires the user's
   * collection counts and the active view, neither of which `filterCards`
   * consumes.
   */
  flags: {
    signed: number;
    promo: number;
    banned: number;
    errata: number;
    owned?: number;
  };
  /**
   * Bounds for each range slider, faceted to the subset that matches every
   * other active filter (the slider's own filter is excluded so the user can
   * still drag the handles outward to widen). `hasNullStat` mirrors
   * `availableFilters.hasNullEnergy/Might/Power` but on the filtered subset.
   */
  ranges: {
    energy: { min: number; max: number; hasNullStat: boolean };
    might: { min: number; max: number; hasNullStat: boolean };
    power: { min: number; max: number; hasNullStat: boolean };
    price: { min: number; max: number };
  };
}

interface ComputeFilterCountsOptions extends FilterCardsOptions {
  /**
   * Whether each tally counts one per printing (e.g. "Common (200)" = 200
   * Common-rarity printings) or one per unique card (200 distinct cardIds).
   * Should mirror the active view so the badge counts match the grid total.
   */
  countBy: "printing" | "card";
}

interface CountableDimension {
  key: Exclude<keyof FilterCounts, "flags" | "ranges">;
  filterField: keyof CardFilters;
  values: (printing: Printing) => readonly string[];
}

const COUNTABLE_DIMENSIONS: readonly CountableDimension[] = [
  { key: "sets", filterField: "sets", values: (p) => [p.setSlug] },
  { key: "languages", filterField: "languages", values: (p) => [p.language] },
  { key: "domains", filterField: "domains", values: (p) => p.card.domains },
  { key: "types", filterField: "types", values: (p) => [p.card.type] },
  { key: "superTypes", filterField: "superTypes", values: (p) => p.card.superTypes },
  { key: "rarities", filterField: "rarities", values: (p) => [p.rarity] },
  { key: "artVariants", filterField: "artVariants", values: (p) => [p.artVariant || "normal"] },
  { key: "finishes", filterField: "finishes", values: (p) => [p.finish] },
];

interface FlagDimension {
  key: keyof Omit<FilterCounts["flags"], "owned">;
  filterField: "isSigned" | "hasAnyMarker" | "isBanned" | "hasErrata";
}

const FLAG_DIMENSIONS: readonly FlagDimension[] = [
  { key: "signed", filterField: "isSigned" },
  { key: "promo", filterField: "hasAnyMarker" },
  { key: "banned", filterField: "isBanned" },
  { key: "errata", filterField: "hasErrata" },
];

function countMatches(matched: Printing[], countBy: "printing" | "card"): number {
  if (countBy === "card") {
    return new Set(matched.map((p) => p.cardId)).size;
  }
  return matched.length;
}

/**
 * For each filterable dimension, returns a `value -> count` map showing how
 * many printings (or distinct cards) would match if that one option were
 * selected — combined with every *other* active filter. The dimension being
 * counted ignores its own current selection so multi-select still widens
 * results (e.g. picking `language=EN` doesn't make every other language drop
 * to zero).
 *
 * Use the result to render faceted dropdowns: append `(n)` to each option
 * label, and dim or disable options where `n === 0`.
 *
 * @returns A `FilterCounts` object with one count map per dimension.
 *
 * @example
 * ```ts
 * const counts = computeFilterCounts(allPrintings, filters, { countBy: "printing" });
 * counts.rarities.get("Common"); // => 42
 * ```
 */
const EMPTY_RANGE: FilterRange = { min: null, max: null };

export function computeFilterCounts(
  printings: Printing[],
  filters: CardFilters,
  options: ComputeFilterCountsOptions,
): FilterCounts {
  const result = {
    flags: { signed: 0, promo: 0, banned: 0, errata: 0 },
    ranges: {
      energy: { min: 0, max: 0, hasNullStat: false },
      might: { min: 0, max: 0, hasNullStat: false },
      power: { min: 0, max: 0, hasNullStat: false },
      price: { min: 0, max: 0 },
    },
  } as FilterCounts;
  for (const dim of COUNTABLE_DIMENSIONS) {
    const filtersWithoutDim = { ...filters, [dim.filterField]: [] };
    const matched = filterCards(printings, filtersWithoutDim, options);
    const counts = new Map<string, number>();
    if (options.countBy === "card") {
      const seen = new Set<string>();
      for (const printing of matched) {
        for (const value of dim.values(printing)) {
          const seenKey = `${printing.cardId}|${value}`;
          if (seen.has(seenKey)) {
            continue;
          }
          seen.add(seenKey);
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
    } else {
      for (const printing of matched) {
        for (const value of dim.values(printing)) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
    }
    result[dim.key] = counts;
  }
  // Each flag chip cycles null → true → false → null. The displayed label
  // reads "Signed" for null/true and "Not Signed" for false; the count
  // reflects whichever state the label currently advertises.
  for (const { key, filterField } of FLAG_DIMENSIONS) {
    const targetValue = filters[filterField] !== false;
    const matched = filterCards(printings, { ...filters, [filterField]: targetValue }, options);
    result.flags[key] = countMatches(matched, options.countBy);
  }
  // Per-dimension faceted slider bounds: filter with this dim's range
  // cleared, then derive bounds from what's left. The user's selected range
  // stays in URL state; if it falls outside the new bounds, the slider
  // visually clamps to the new bounds and a subsequent drag rewrites the
  // value within range — same tradeoff as a faceted-search range slider
  // anywhere else.
  const statDims: { key: "energy" | "might" | "power"; pick: (p: Printing) => number | null }[] = [
    { key: "energy", pick: (p) => p.card.energy },
    { key: "might", pick: (p) => p.card.might },
    { key: "power", pick: (p) => p.card.power },
  ];
  for (const { key, pick } of statDims) {
    const matched = filterCards(printings, { ...filters, [key]: EMPTY_RANGE }, options);
    const values = matched.flatMap((p) => {
      const v = pick(p);
      return v === null ? [] : [v];
    });
    result.ranges[key] = {
      ...boundsOf(values),
      hasNullStat: matched.some((p) => pick(p) === null),
    };
  }
  if (options.getPrice) {
    const matchedForPrice = filterCards(printings, { ...filters, price: EMPTY_RANGE }, options);
    const priceGetter = options.getPrice;
    const prices = matchedForPrice.flatMap((p) => {
      const price = priceGetter(p);
      return price === undefined ? [] : [price];
    });
    result.ranges.price = boundsOf(prices);
  }
  return result;
}

export interface SortCardsOptions {
  sortDir?: SortDirection;
  /**
   * Resolves the price used for sorting. Required for `sortBy === "price"` to
   * produce meaningful results — without it, all printings appear price-less
   * and fall back to shortCode order.
   */
  getPrice?: (p: Printing) => number | null | undefined;
  /**
   * Live rarity sort order from `/api/enums`. Required when `sortBy === "rarity"`;
   * ignored otherwise.
   */
  rarityOrder?: readonly string[];
}

/**
 * Sorts a printings array by the given sort option. Direction applies only to
 * the primary key; the tiebreaker (shortCode) is always ascending. Null
 * stats/prices are always pushed to the end.
 *
 * @returns A new sorted array (does not mutate the input).
 *
 * @example
 * ```ts
 * const byPrice = sortCards(filteredPrintings, "price", { sortDir: "desc" });
 * ```
 */
export function sortCards(
  printings: Printing[],
  sortBy: SortOption,
  options: SortCardsOptions = {},
): Printing[] {
  const dir: 1 | -1 = options.sortDir === "desc" ? -1 : 1;
  if (sortBy === "name") {
    return printings.toSorted(
      (a, b) =>
        dir * a.card.name.localeCompare(b.card.name) || a.shortCode.localeCompare(b.shortCode),
    );
  }
  if (sortBy === "id") {
    return printings.toSorted((a, b) => dir * a.shortCode.localeCompare(b.shortCode));
  }
  if (sortBy === "energy") {
    return printings.toSorted((a, b) => compareWithFallback(a, b, (p) => p.card.energy, dir));
  }
  if (sortBy === "rarity") {
    if (!options.rarityOrder) {
      throw new Error("sortCards: `rarityOrder` is required when sortBy is 'rarity'");
    }
    const rarityOrder = options.rarityOrder;
    return printings.toSorted(
      (a, b) =>
        dir * (orderIndex(rarityOrder, a.rarity) - orderIndex(rarityOrder, b.rarity)) ||
        a.shortCode.localeCompare(b.shortCode),
    );
  }
  // oxlint-disable-next-line unicorn/no-useless-undefined -- returning undefined satisfies the getPrice contract
  const getPrice = options.getPrice ?? (() => undefined);
  return printings.toSorted((a, b) => compareWithFallback(a, b, getPrice, dir));
}
