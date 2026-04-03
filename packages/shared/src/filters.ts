import type {
  ArtVariant,
  CardFilters,
  CardType,
  Domain,
  Finish,
  FilterRange,
  Printing,
  PromoType,
  Rarity,
  SearchField,
  SortDirection,
  SortOption,
  SuperType,
} from "./types/index.js";
import {
  ALL_SEARCH_FIELDS,
  ART_VARIANT_ORDER,
  DOMAIN_ORDER,
  FINISH_ORDER,
  NONE,
  RARITY_ORDER,
  SEARCH_PREFIX_MAP,
} from "./types/index.js";
import { boundsOf, unique } from "./utils.js";

export interface ParsedSearchTerm {
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
function printingMatchesField(printing: Printing, field: SearchField, text: string): boolean {
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
      (card.rulesText?.toLowerCase().includes(lower) ?? false) ||
      (card.effectText?.toLowerCase().includes(lower) ?? false) ||
      (printing.printedRulesText?.toLowerCase().includes(lower) ?? false) ||
      (printing.printedEffectText?.toLowerCase().includes(lower) ?? false)
    );
  }
  if (field === "keywords") {
    return card.keywords.some((kw) => kw.toLowerCase().includes(lower));
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

function matchesFlag(filter: boolean | null, actual: boolean): boolean {
  return filter === null || actual === filter;
}

function matchesPromo(
  isPromo: boolean | null,
  promoTypes: string[],
  actualSlug: string | null,
): boolean {
  if (isPromo === null && promoTypes.length === 0) {
    return true;
  }
  if (isPromo === false) {
    return actualSlug === null;
  }
  if (isPromo === true) {
    if (actualSlug === null) {
      return false;
    }
    return promoTypes.length === 0 || promoTypes.includes(actualSlug);
  }
  // isPromo is null but promoTypes has values — filter by type
  return actualSlug !== null && promoTypes.includes(actualSlug);
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
): boolean {
  if (terms.length === 0) {
    return true;
  }
  return terms.every((term) => {
    if (term.field) {
      return printingMatchesField(printing, term.field, term.text);
    }
    // Un-prefixed terms widen to all fields when any prefix is present (e.g. "n:Dragon fire"
    // searches "fire" everywhere), but respect the user's search scope when no prefixes are used.
    const fields = hasPrefixes ? ALL_SEARCH_FIELDS : searchScope;
    return fields.some((f) => printingMatchesField(printing, f, term.text));
  });
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
 * const results = filterCards(allPrintings, { ...defaultFilters, sets: ["Origins"], rarities: ["Rare"] });
 * ```
 */
export function filterCards(printings: Printing[], filters: CardFilters): Printing[] {
  const terms = filters.search ? parseSearchTerms(filters.search) : [];
  const hasPrefixes = terms.some((t) => t.field !== null);

  return printings.filter((printing) => {
    const { card } = printing;
    return (
      matchesSearch(printing, terms, hasPrefixes, filters.searchScope) &&
      includes(filters.sets, printing.setSlug) &&
      overlaps(filters.domains, card.domains) &&
      includes(filters.types, card.type) &&
      overlaps(filters.superTypes, card.superTypes) &&
      includes(filters.rarities, printing.rarity) &&
      includes(filters.artVariants, printing.artVariant || "normal") &&
      includes(filters.finishes, printing.finish) &&
      matchesFlag(filters.isSigned, printing.isSigned) &&
      matchesPromo(filters.isPromo, filters.promoTypes, printing.promoType?.slug ?? null) &&
      matchesRange(card.energy, filters.energy) &&
      matchesRange(card.might, filters.might) &&
      matchesRange(card.power, filters.power) &&
      matchesRange(printing.marketPrice ?? null, filters.price) &&
      matchesFlag(filters.isBanned, card.bans.length > 0) &&
      matchesFlag(
        filters.hasErrata,
        card.rulesText !== null &&
          printing.printedRulesText !== null &&
          printing.printedRulesText !== undefined &&
          printing.printedRulesText !== card.rulesText,
      )
    );
  });
}

export interface AvailableFilters {
  sets: string[];
  domains: Domain[];
  types: CardType[];
  superTypes: SuperType[];
  rarities: Rarity[];
  artVariants: ArtVariant[];
  finishes: Finish[];
  hasSigned: boolean;
  hasPromo: boolean;
  hasBanned: boolean;
  hasErrata: boolean;
  hasNullEnergy: boolean;
  hasNullMight: boolean;
  hasNullPower: boolean;
  promoTypes: PromoType[];
  energy: { min: number; max: number };
  might: { min: number; max: number };
  power: { min: number; max: number };
  price: { min: number; max: number };
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
export function getAvailableFilters(printings: Printing[]): AvailableFilters {
  // Sets are not sorted but shown in insertion order.
  const sets = unique(printings.map((p) => p.setSlug));
  const domains = unique(printings.flatMap((p) => p.card.domains)).sort(
    (a, b) => DOMAIN_ORDER.indexOf(a) - DOMAIN_ORDER.indexOf(b),
  );
  const types = unique(printings.map((p) => p.card.type)).sort();
  const superTypes = unique(printings.flatMap((p) => p.card.superTypes))
    .filter((st) => st !== "Basic")
    .sort();
  const rarities = unique(printings.map((p) => p.rarity)).sort(
    (a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b),
  ) as Rarity[];
  const artVariants = unique(printings.map((p) => p.artVariant || "normal")).sort(
    (a, b) => ART_VARIANT_ORDER.indexOf(a) - ART_VARIANT_ORDER.indexOf(b),
  );
  const finishes = unique(printings.map((p) => p.finish)).sort(
    (a, b) => FINISH_ORDER.indexOf(a) - FINISH_ORDER.indexOf(b),
  );

  const energies = printings.flatMap((p) => p.card.energy ?? []);
  const mights = printings.flatMap((p) => p.card.might ?? []);
  const powers = printings.flatMap((p) => p.card.power ?? []);
  const prices = printings.flatMap((p) => p.marketPrice ?? []);

  return {
    sets,
    domains,
    types,
    superTypes,
    rarities,
    artVariants,
    finishes,
    hasSigned: printings.some((p) => p.isSigned),
    hasPromo: printings.some((p) => p.promoType !== null),
    hasBanned: printings.some((p) => p.card.bans.length > 0),
    hasErrata: printings.some(
      (p) =>
        p.card.rulesText !== null &&
        p.printedRulesText !== null &&
        p.printedRulesText !== undefined &&
        p.printedRulesText !== p.card.rulesText,
    ),
    hasNullEnergy: printings.some((p) => p.card.energy === null),
    hasNullMight: printings.some((p) => p.card.might === null),
    hasNullPower: printings.some((p) => p.card.power === null),
    promoTypes: [
      ...new Map(
        printings
          .filter(
            (p): p is typeof p & { promoType: NonNullable<typeof p.promoType> } =>
              p.promoType !== null,
          )
          .map((p) => [p.promoType.slug, p.promoType]),
      ).values(),
    ].sort((a, b) => a.slug.localeCompare(b.slug)),
    energy: boundsOf(energies),
    might: boundsOf(mights),
    power: boundsOf(powers),
    price: boundsOf(prices),
  };
}

export interface SortCardsOptions {
  sortDir?: SortDirection;
  /** Override the price used for sorting (e.g. stack min/max in cards view). */
  getPrice?: (p: Printing) => number | null | undefined;
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
    return printings.toSorted(
      (a, b) =>
        dir * (RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)) ||
        a.shortCode.localeCompare(b.shortCode),
    );
  }
  const getPrice = options.getPrice ?? ((p: Printing) => p.marketPrice);
  return printings.toSorted((a, b) => compareWithFallback(a, b, getPrice, dir));
}
