import type {
  CardFilters,
  CardType,
  Domain,
  FilterRange,
  Printing,
  Rarity,
  SearchField,
  SortOption,
  SuperType,
} from "./types.js";
import { ALL_SEARCH_FIELDS, RARITY_ORDER, SEARCH_PREFIX_MAP } from "./types.js";

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
  const regex = /(?:(id|[ndkta]):(?:"([^"]*)"|([\S]*)))|(?:"([^"]*)")|(\S+)/g;
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
  switch (field) {
    case "name": {
      return card.name.toLowerCase().includes(lower);
    }
    case "cardText": {
      return (
        card.description.toLowerCase().includes(lower) || card.effect.toLowerCase().includes(lower)
      );
    }
    case "keywords": {
      return card.keywords.some((kw) => kw.toLowerCase().includes(lower));
    }
    case "tags": {
      return card.tags.some((tag) => tag.toLowerCase().includes(lower));
    }
    case "artist": {
      return printing.artist.toLowerCase().includes(lower);
    }
    case "id": {
      return printing.sourceId.toLowerCase().includes(lower);
    }
  }
}

/**
 * Normalizes market price access to a consistent number | null, since the
 * underlying field may be undefined depending on whether pricing data exists.
 *
 * @returns The market price in dollars, or `null` if no pricing data is available.
 *
 * @example
 * ```ts
 * getMarketPrice(printing) // => 2.49 or null
 * ```
 */
function getMarketPrice(printing: Printing): number | null {
  return printing.marketPrice ?? null;
}

/**
 * Tests whether a nullable numeric value falls within a FilterRange. An empty
 * range (both bounds null) passes everything; a null value fails any non-empty range.
 *
 * @returns `true` if the value satisfies the range constraints (or the range is empty).
 *
 * @example
 * ```ts
 * matchesRange(3, { min: 1, max: 5 }) // => true
 * matchesRange(null, { min: 1, max: null }) // => false
 * matchesRange(7, { min: null, max: null }) // => true (empty range)
 * ```
 */
function matchesRange(value: number | null, range: FilterRange): boolean {
  if (range.min === null && range.max === null) {
    return true;
  }
  if (value === null) {
    return false;
  }
  if (range.min !== null && value < range.min) {
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
      includes(filters.sets, printing.set) &&
      overlaps(filters.domains, card.domains) &&
      includes(filters.types, card.type) &&
      overlaps(filters.superTypes, card.superTypes) &&
      includes(filters.rarities, printing.rarity) &&
      includes(filters.artVariants, printing.artVariant) &&
      includes(filters.finishes, printing.finish) &&
      matchesFlag(filters.isSigned, printing.isSigned) &&
      matchesFlag(filters.isPromo, printing.isPromo) &&
      matchesRange(card.stats.energy, filters.energy) &&
      matchesRange(card.stats.might, filters.might) &&
      matchesRange(card.stats.power, filters.power) &&
      matchesRange(getMarketPrice(printing), filters.price)
    );
  });
}

export interface AvailableFilters {
  sets: string[];
  domains: Domain[];
  types: CardType[];
  superTypes: SuperType[];
  rarities: Rarity[];
  artVariants: string[];
  finishes: string[];
  hasSigned: boolean;
  hasPromo: boolean;
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
  const sets = [...new Set(printings.map((p) => p.set))];
  const rarities = [...new Set(printings.map((p) => p.rarity))].sort(
    (a, b) => RARITY_ORDER[a] - RARITY_ORDER[b],
  ) as Rarity[];
  const types = [...new Set(printings.map((p) => p.card.type))].sort();
  const superTypes = [...new Set(printings.flatMap((p) => p.card.superTypes))]
    .filter((st) => st !== "Basic")
    .sort();
  const domains = [...new Set(printings.flatMap((p) => p.card.domains))]
    .sort()
    .sort((a, b) => (a === "Colorless" ? 1 : b === "Colorless" ? -1 : 0));
  const artVariants = [...new Set(printings.map((p) => p.artVariant))];
  const variantOrder = ["normal", "altart", "overnumbered"];
  artVariants.sort((a, b) => {
    const ai = variantOrder.indexOf(a);
    const bi = variantOrder.indexOf(b);
    return (ai === -1 ? variantOrder.length : ai) - (bi === -1 ? variantOrder.length : bi);
  });
  const finishes = [...new Set(printings.map((p) => p.finish))];
  const finishOrder = ["normal", "foil"];
  finishes.sort((a, b) => {
    const ai = finishOrder.indexOf(a);
    const bi = finishOrder.indexOf(b);
    return (ai === -1 ? finishOrder.length : ai) - (bi === -1 ? finishOrder.length : bi);
  });
  const energies = printings.map((p) => p.card.stats.energy).filter((v): v is number => v !== null);
  const mights = printings.map((p) => p.card.stats.might).filter((v): v is number => v !== null);
  const powers = printings.map((p) => p.card.stats.power).filter((v): v is number => v !== null);
  const prices = printings.map((p) => getMarketPrice(p)).filter((v): v is number => v !== null);
  const minMax = (vals: number[]) => ({
    min: vals.length > 0 ? vals.reduce((a, b) => Math.min(a, b)) : 0,
    max: vals.length > 0 ? vals.reduce((a, b) => Math.max(a, b)) : 0,
  });

  return {
    sets,
    rarities,
    types,
    superTypes,
    domains,
    artVariants,
    finishes,
    energy: minMax(energies),
    might: minMax(mights),
    power: minMax(powers),
    price: {
      min: prices.length > 0 ? Math.floor(prices.reduce((a, b) => Math.min(a, b))) : 0,
      max: prices.length > 0 ? Math.ceil(prices.reduce((a, b) => Math.max(a, b))) : 0,
    },
    hasSigned: printings.some((p) => p.isSigned),
    hasPromo: printings.some((p) => p.isPromo),
  };
}

/**
 * Sorts a printings array by the given sort option. Each sort mode uses a
 * secondary sort on card name for stable ordering when primary values tie.
 * Null stats/prices are pushed to the end.
 *
 * @returns A new sorted array (does not mutate the input).
 *
 * @example
 * ```ts
 * const byPrice = sortCards(filteredPrintings, "price");
 * ```
 */
export function sortCards(printings: Printing[], sortBy: SortOption): Printing[] {
  const sorted = [...printings];
  switch (sortBy) {
    case "name": {
      sorted.sort((a, b) => a.card.name.localeCompare(b.card.name));
      break;
    }
    case "id": {
      sorted.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
      break;
    }
    case "energy": {
      sorted.sort((a, b) => {
        const ae = a.card.stats.energy;
        const be = b.card.stats.energy;
        if (ae === null && be === null) {
          return a.card.name.localeCompare(b.card.name);
        }
        if (ae === null) {
          return 1;
        }
        if (be === null) {
          return -1;
        }
        return ae - be || a.card.name.localeCompare(b.card.name);
      });
      break;
    }
    case "rarity": {
      sorted.sort(
        (a, b) =>
          RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.card.name.localeCompare(b.card.name),
      );
      break;
    }
    case "price": {
      sorted.sort((a, b) => {
        const pa = getMarketPrice(a);
        const pb = getMarketPrice(b);
        if (pa === null && pb === null) {
          return a.card.name.localeCompare(b.card.name);
        }
        if (pa === null) {
          return 1;
        }
        if (pb === null) {
          return -1;
        }
        return pa - pb || a.card.name.localeCompare(b.card.name);
      });
      break;
    }
  }
  return sorted;
}
