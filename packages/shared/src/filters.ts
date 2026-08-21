import { foldCached, foldForSearch, squashCached, squashForSearch } from "./search-fold.js";
import type { SetOrderInfo } from "./set-order.js";
import { orderSetsMainFirst, setIndexById, UNKNOWN_SET_INDEX } from "./set-order.js";
import { isStandardPrinting } from "./standard.js";
import type {
  CardFilters,
  DistributionChannel,
  EnumOrders,
  FilterRange,
  Marker,
  PresenceDimension,
  Printing,
  SearchField,
  SortDirection,
  SortOption,
} from "./types/index.js";
import {
  ALL_SEARCH_FIELDS,
  EMPTY_CARD_FILTERS,
  NONE,
  PRESENCE_DIMENSIONS,
  SEARCH_PREFIX_MAP,
} from "./types/index.js";
import { WellKnown } from "./well-known.js";

interface ParsedSearchTerm {
  field: SearchField | null;
  text: string;
  /** `text` run through `foldForSearch`, computed once per term rather than per printing. */
  folded: string;
  /** `text` run through `squashForSearch`, for the identifier-like fields only. */
  squashed: string;
}

/**
 * Wraps a raw term with its folded forms, or returns null when the term folds
 * away to nothing.
 *
 * A term folds to empty only when it is made entirely of characters the fold
 * deletes, i.e. apostrophes and quote marks (hyphens and dots survive). Dropping
 * it keeps such a term equivalent to an empty search, which is what a user
 * half-way through typing `"a phrase"` expects. Keeping it would be worse in
 * both directions: an empty needle makes `includes` return true for every card,
 * and rejecting it outright would blank the grid.
 *
 * @returns The parsed term, or null if it carries no searchable characters.
 */
function toTerm(field: SearchField | null, text: string): ParsedSearchTerm | null {
  const folded = foldForSearch(text);
  if (folded === "") {
    return null;
  }
  return { field, text, folded, squashed: squashForSearch(text) };
}

/**
 * One search token: a prefixed term (`n:Dragon`, `n:"Fire Dragon"`), a quoted
 * phrase, or a bare word. Kept as a source string so each scan builds its own
 * stateful `g` regex from it and the two readers can never drift apart.
 */
const SEARCH_TERM_PATTERN =
  /(?:(?<prefix>id|ty|[ndktaf]):(?:"(?<quoted>[^"]*)"|(?<bare>[\S]*)))|(?:"(?<looseQuoted>[^"]*)")|(?<loose>\S+)/u
    .source;

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
 * // => [{ field: "name", text: "Dragon", ... }, { field: null, text: "fire", ... }]
 *
 * parseSearchTerms('n:"Fire Dragon"')
 * // => [{ field: "name", text: "Fire Dragon", ... }]
 * ```
 */
export function parseSearchTerms(raw: string): ParsedSearchTerm[] {
  const terms: ParsedSearchTerm[] = [];
  const regex = new RegExp(SEARCH_TERM_PATTERN, "gu");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const groups = match.groups;
    const prefix = groups?.prefix;
    const text = (
      prefix ? (groups?.quoted ?? groups?.bare ?? "") : (groups?.looseQuoted ?? groups?.loose ?? "")
    ).trim();
    const term = text ? toTerm(prefix ? (SEARCH_PREFIX_MAP[prefix] ?? null) : null, text) : null;
    if (term) {
      terms.push(term);
    }
  }
  return terms;
}

/**
 * The fields a query's typed prefixes target, in {@link ALL_SEARCH_FIELDS}
 * order. Unlike {@link parseSearchTerms} this counts a prefix carrying no text
 * yet, so a half-typed `n:` already reports the name field — the search bar
 * mirrors it back as a chip the moment the colon lands.
 *
 * @returns The prefixed fields, deduplicated; empty when the query has no prefixes.
 *
 * @example
 * ```ts
 * searchPrefixFields("n:") // => ["name"]
 * searchPrefixFields("k:fury n:teemo fire") // => ["name", "keywords"]
 * ```
 */
export function searchPrefixFields(raw: string): SearchField[] {
  const regex = new RegExp(SEARCH_TERM_PATTERN, "gu");
  const found = new Set<SearchField>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const prefix = match.groups?.prefix;
    const field = prefix ? SEARCH_PREFIX_MAP[prefix] : undefined;
    if (field) {
      found.add(field);
    }
  }
  return ALL_SEARCH_FIELDS.filter((field) => found.has(field));
}

/**
 * Whether a folded haystack contains a folded term. Prose fields stop here.
 * @returns `true` when the value contains the term after folding.
 */
function foldedContains(value: string | null | undefined, term: ParsedSearchTerm): boolean {
  return value ? foldCached(value).includes(term.folded) : false;
}

/**
 * As {@link foldedContains}, but also accepts a match once every separator is
 * removed from both sides, so `quickdraw` finds `Quick-Draw` and `ogn269` finds
 * `OGN-269`. Restricted to short identifier-like fields — see
 * {@link squashForSearch} for why prose must not go through this.
 * @returns `true` when the value contains the term after folding or squashing.
 */
function looselyContains(value: string | null | undefined, term: ParsedSearchTerm): boolean {
  if (!value) {
    return false;
  }
  return foldCached(value).includes(term.folded) || squashCached(value).includes(term.squashed);
}

/**
 * Checks whether a single printing matches a search term against a specific field.
 * Used by both prefixed searches (e.g. "n:dragon") and un-prefixed broad searches.
 *
 * Both sides are folded (see `search-fold.ts`), so typographic punctuation in the
 * stored data never blocks a match. Identifier-like fields additionally match with
 * separators removed; rules and flavor text deliberately do not.
 *
 * @returns `true` if the printing's field value contains the search text.
 *
 * @example
 * ```ts
 * printingMatchesField(printing, "name", term) // true if card name contains the term
 * ```
 */
function printingMatchesField(
  printing: Printing,
  field: SearchField,
  term: ParsedSearchTerm,
  keywordReverseMap?: Map<string, string>,
): boolean {
  const { card } = printing;
  if (field === "name") {
    return looselyContains(card.name, term) || looselyContains(printing.printedName, term);
  }
  if (field === "cardText") {
    return (
      foldedContains(card.errata?.correctedRulesText, term) ||
      foldedContains(card.errata?.correctedEffectText, term) ||
      foldedContains(printing.printedRulesText, term) ||
      foldedContains(printing.printedEffectText, term)
    );
  }
  if (field === "keywords") {
    // Match against canonical keywords directly
    if (card.keywords.some((kw) => looselyContains(kw, term))) {
      return true;
    }
    // Also try resolving the search term via the translation reverse map, whose
    // keys are folded by `buildTranslationReverseMap` so this lookup lines up.
    if (keywordReverseMap) {
      const canonical = keywordReverseMap.get(term.folded);
      if (canonical) {
        const foldedCanonical = foldForSearch(canonical);
        return card.keywords.some((kw) => foldCached(kw) === foldedCanonical);
      }
    }
    return false;
  }
  if (field === "tags") {
    return card.tags.some((tag) => looselyContains(tag, term));
  }
  if (field === "artist") {
    return looselyContains(printing.artist, term);
  }
  if (field === "flavorText") {
    return foldedContains(printing.flavorText, term);
  }
  if (field === "type") {
    return (
      card.types.some((t) => looselyContains(t, term)) ||
      card.superTypes.some((st) => looselyContains(st, term))
    );
  }
  return looselyContains(printing.shortCode, term);
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
 * Negation for a scalar dimension: rejects when the value is explicitly excluded.
 * @returns `true` when the value passes (not excluded).
 */
function notExcluded<T>(excluded: T[], value: T): boolean {
  return excluded.length === 0 || !excluded.includes(value);
}

/**
 * Negation for an array dimension: rejects when any of the row's values is excluded.
 * @returns `true` when none of the row's values are excluded.
 */
export function noneExcluded<T>(excluded: T[], values: readonly T[]): boolean {
  return excluded.length === 0 || !values.some((v) => excluded.includes(v));
}

/**
 * Domain filter: 0 selected = all, 1 selected = any card with that domain,
 * 2+ selected = card's domains must all be within the selected set.
 *
 * Exported because the deck list filters by domain too, over a deck's identity
 * domains rather than a card's. Sharing the rule is what keeps two filters that
 * look identical from reading differently.
 * @returns Whether the row matches the domain filter.
 */
export function matchesDomains<T>(allowed: T[], values: T[]): boolean {
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

function matchesMarkers(markerSlugs: string[], actualSlugs: readonly string[]): boolean {
  if (markerSlugs.length === 0) {
    return true;
  }
  return markerSlugs.some((slug) => actualSlugs.includes(slug));
}

function matchesDistributionChannels(
  channelSlugs: string[],
  actualSlugs: readonly string[],
): boolean {
  if (channelSlugs.length === 0) {
    return true;
  }
  return channelSlugs.some((slug) => actualSlugs.includes(slug));
}

function matchesCustomTags(filterSlugs: string[], actualSlugs: readonly string[]): boolean {
  if (filterSlugs.length === 0) {
    return true;
  }
  return filterSlugs.some((slug) => actualSlugs.includes(slug));
}

/**
 * Compares by a nullable numeric value. Nulls are always pushed to the end,
 * the primary comparison respects `dir`, and the tiebreaker (card ID) is
 * always ascending.
 *
 * @returns A negative, zero, or positive number for sort ordering.
 */
function compareWithFallback(
  a: Printing,
  b: Printing,
  getValue: (p: Printing) => number | null | undefined,
  dir: 1 | -1,
  byId: (a: Printing, b: Printing) => number,
): number {
  const va = getValue(a);
  const vb = getValue(b);
  const aNullish = va === null || va === undefined;
  const bNullish = vb === null || vb === undefined;
  if (aNullish && bNullish) {
    return byId(a, b);
  }
  if (aNullish) {
    return 1;
  }
  if (bNullish) {
    return -1;
  }
  return dir * (va - vb) || byId(a, b);
}

/**
 * Orders two printings by card ID: the set's place in the app's set order
 * first, then the number inside the short code, which is zero-padded and so
 * sorts as a plain string ("OGN-002" before "OGN-010").
 *
 * Without set metadata the short code stands alone, which orders sets by their
 * alphabetical prefix — fine within one set, wrong across several, hence the
 * `sets` requirement on the "id" sort.
 *
 * @returns A comparator over two printings.
 */
function idComparator(sets?: readonly SetOrderInfo[]): (a: Printing, b: Printing) => number {
  if (!sets) {
    return (a, b) => a.shortCode.localeCompare(b.shortCode);
  }
  const indexes = setIndexById(sets);
  const indexOf = (printing: Printing) => indexes.get(printing.setId) ?? UNKNOWN_SET_INDEX;
  return (a, b) => indexOf(a) - indexOf(b) || a.shortCode.localeCompare(b.shortCode);
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
      return printingMatchesField(printing, term.field, term, keywordReverseMap);
    }
    // Un-prefixed terms widen to all fields when any prefix is present (e.g. "n:Dragon fire"
    // searches "fire" everywhere), but respect the user's search scope when no prefixes are used.
    const fields = hasPrefixes ? ALL_SEARCH_FIELDS : searchScope;
    return fields.some((f) => printingMatchesField(printing, f, term, keywordReverseMap));
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
  /**
   * Card id → custom-tag slugs lookup. Only consulted when `filters.customTagSlugs`
   * is non-empty (i.e. the freeform deck-builder custom-tag filter is active).
   * Standard filtering paths leave this undefined and pay no overhead.
   */
  customTagAssignments?: Record<string, readonly string[]>;
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
  rawFilters: CardFilters,
  options: FilterCardsOptions = {},
): Printing[] {
  // Backfill any missing dimension against the blank filter set. Persisted list
  // rules (ADR-034) store their filter as jsonb and are re-hydrated with a bare
  // `JSON.parse` (no schema pass), so a rule saved before a newer dimension
  // existed lacks that key. Without this, the first predicate to read the absent
  // field (e.g. `keywordsExclude`) dereferences `undefined` and throws.
  const filters: CardFilters = { ...EMPTY_CARD_FILTERS, ...rawFilters };
  const terms = filters.search ? parseSearchTerms(filters.search) : [];
  const hasPrefixes = terms.some((t) => t.field !== null);
  const getPrice = options.getPrice;
  const presence = filters.presence;

  // Per-printing slug projections allocate; decide once whether any active
  // filter actually reads them. The presence checks below need only lengths,
  // never the slug arrays, so they don't force a projection.
  const needMarkerSlugs = filters.markerSlugs.length > 0 || filters.markerSlugsExclude.length > 0;
  const needChannelSlugs =
    filters.distributionChannelSlugs.length > 0 ||
    filters.distributionChannelSlugsExclude.length > 0;
  const needCustomTags =
    filters.customTagSlugs.length > 0 ||
    filters.customTagSlugsExclude.length > 0 ||
    presence.customTags !== undefined;

  return printings.filter((printing) => {
    const { card } = printing;
    const artVariant = printing.artVariant || WellKnown.artVariant.NORMAL;
    if (
      !(
        includes(filters.sets, printing.setSlug) &&
        includes(filters.languages, printing.language) &&
        matchesDomains(filters.domains, card.domains) &&
        overlaps(filters.types, card.types) &&
        overlaps(filters.superTypes, card.superTypes) &&
        includes(filters.rarities, printing.rarity) &&
        includes(filters.artVariants, artVariant) &&
        includes(filters.finishes, printing.finish) &&
        includes(filters.cardSizes, printing.size) &&
        notExcluded(filters.setsExclude, printing.setSlug) &&
        notExcluded(filters.languagesExclude, printing.language) &&
        notExcluded(filters.raritiesExclude, printing.rarity) &&
        noneExcluded(filters.typesExclude, card.types) &&
        notExcluded(filters.artVariantsExclude, artVariant) &&
        notExcluded(filters.finishesExclude, printing.finish) &&
        noneExcluded(filters.superTypesExclude, card.superTypes) &&
        noneExcluded(filters.domainsExclude, card.domains) &&
        noneExcluded(filters.keywordsExclude, card.keywords) &&
        noneExcluded(filters.tagsExclude, card.tags) &&
        overlaps(filters.keywords, card.keywords) &&
        overlaps(filters.tags, card.tags) &&
        matchesFlag(filters.isStandard, isStandardPrinting(printing)) &&
        matchesFlag(filters.isSigned, printing.isSigned) &&
        matchesRange(card.energy, filters.energy) &&
        matchesRange(card.might, filters.might) &&
        matchesRange(card.power, filters.power) &&
        matchesRange(getPrice?.(printing) ?? null, filters.price) &&
        matchesFlag(filters.isBanned, card.bans.length > 0) &&
        matchesFlag(filters.hasErrata, card.errata !== null)
      )
    ) {
      return false;
    }
    if (needMarkerSlugs) {
      const markerSlugs = printing.markers.map((m) => m.slug);
      if (
        !matchesMarkers(filters.markerSlugs, markerSlugs) ||
        !noneExcluded(filters.markerSlugsExclude, markerSlugs)
      ) {
        return false;
      }
    }
    if (needChannelSlugs) {
      const channelSlugs = printing.distributionChannels.map((dc) => dc.channel.slug);
      if (
        !matchesDistributionChannels(filters.distributionChannelSlugs, channelSlugs) ||
        !noneExcluded(filters.distributionChannelSlugsExclude, channelSlugs)
      ) {
        return false;
      }
    }
    if (needCustomTags) {
      const customTagSlugs = options.customTagAssignments?.[printing.cardId] ?? EMPTY_STRINGS;
      if (
        !matchesCustomTags(filters.customTagSlugs, customTagSlugs) ||
        !noneExcluded(filters.customTagSlugsExclude, customTagSlugs)
      ) {
        return false;
      }
      if (presence.customTags && (presence.customTags === "any") !== customTagSlugs.length > 0) {
        return false;
      }
    }
    // Remaining presence checks read only lengths — no slug projections.
    if (presence.markers && (presence.markers === "any") !== printing.markers.length > 0) {
      return false;
    }
    if (
      presence.superTypes &&
      (presence.superTypes === "any") !==
        card.superTypes.some((superType) => superType !== WellKnown.superType.BASIC)
    ) {
      return false;
    }
    if (
      presence.distributionChannels &&
      (presence.distributionChannels === "any") !== printing.distributionChannels.length > 0
    ) {
      return false;
    }
    if (presence.keywords && (presence.keywords === "any") !== card.keywords.length > 0) {
      return false;
    }
    if (presence.tags && (presence.tags === "any") !== card.tags.length > 0) {
      return false;
    }
    return matchesSearch(
      printing,
      terms,
      hasPrefixes,
      filters.searchScope,
      options.keywordReverseMap,
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
  cardSizes: string[];
  hasSigned: boolean;
  hasNonStandard: boolean;
  hasBanned: boolean;
  hasErrata: boolean;
  hasNullEnergy: boolean;
  hasNullMight: boolean;
  hasNullPower: boolean;
  markers: Marker[];
  distributionChannels: DistributionChannel[];
  /** Distinct keyword names across the printings' cards, sorted alphabetically. */
  keywords: string[];
  /** Distinct printed tags across the printings' cards, sorted alphabetically. */
  tags: string[];
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
  /**
   * Full distribution-channel registry (typically every channel returned by
   * `/api/v1/promos`). When provided, `distributionChannels` in the result
   * uses this list directly; the channel filter UI can then walk parent
   * chains to render full breadcrumbs. When omitted, the result is derived
   * from the printings' direct channel links only — which loses parent
   * channels that no printing links to directly.
   */
  channels?: readonly DistributionChannel[];
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

  // One pass. The previous shape read `printings` about twenty times over —
  // eight `flatMap`s each materialising a catalog-sized intermediate array,
  // seven full `some()` scans, and four `Math.min(...array)` spreads. Collecting
  // everything in a single loop is what makes this cheap enough to run on the
  // first render of /cards.
  const setSlugs = new Set<string>();
  const domainSet = new Set<string>();
  const typeSet = new Set<string>();
  const superTypeSet = new Set<string>();
  const raritySet = new Set<string>();
  const artVariantSet = new Set<string>();
  const finishSet = new Set<string>();
  const cardSizeSet = new Set<string>();
  const keywordSet = new Set<string>();
  const tagSet = new Set<string>();
  // Later occurrences overwrite earlier ones, matching the Map-from-pairs build
  // these replaced.
  const markerBySlug = new Map<string, Marker>();
  const channelBySlug = new Map<string, DistributionChannel>();
  const energy = { min: Infinity, max: -Infinity, any: false } as BoundsAcc;
  const might = { min: Infinity, max: -Infinity, any: false } as BoundsAcc;
  const power = { min: Infinity, max: -Infinity, any: false } as BoundsAcc;
  const price = { min: Infinity, max: -Infinity, any: false } as BoundsAcc;
  let hasSigned = false;
  let hasNonStandard = false;
  let hasBanned = false;
  let hasErrata = false;
  let hasNullEnergy = false;
  let hasNullMight = false;
  let hasNullPower = false;

  for (const printing of printings) {
    const { card } = printing;
    setSlugs.add(printing.setSlug);
    raritySet.add(printing.rarity);
    artVariantSet.add(printing.artVariant || WellKnown.artVariant.NORMAL);
    finishSet.add(printing.finish);
    cardSizeSet.add(printing.size);
    for (const domain of card.domains) {
      domainSet.add(domain);
    }
    for (const type of card.types) {
      typeSet.add(type);
    }
    for (const superType of card.superTypes) {
      superTypeSet.add(superType);
    }
    for (const keyword of card.keywords) {
      keywordSet.add(keyword);
    }
    for (const tag of card.tags) {
      tagSet.add(tag);
    }
    for (const marker of printing.markers) {
      markerBySlug.set(marker.slug, marker);
    }
    for (const link of printing.distributionChannels) {
      channelBySlug.set(link.channel.slug, link.channel);
    }
    if (printing.isSigned) {
      hasSigned = true;
    }
    if (!hasNonStandard && !isStandardPrinting(printing)) {
      hasNonStandard = true;
    }
    if (card.bans.length > 0) {
      hasBanned = true;
    }
    if (card.errata !== null) {
      hasErrata = true;
    }
    if (card.energy === null) {
      hasNullEnergy = true;
    } else {
      bumpBounds(energy, card.energy);
    }
    if (card.might === null) {
      hasNullMight = true;
    } else {
      bumpBounds(might, card.might);
    }
    if (card.power === null) {
      hasNullPower = true;
    } else {
      bumpBounds(power, card.power);
    }
    if (getPrice) {
      const value = getPrice(printing);
      if (value !== undefined) {
        bumpBounds(price, value);
      }
    }
  }

  const sets = [...setSlugs];
  if (setMeta) {
    const setSlugOrder = new Map(orderSetsMainFirst(setMeta).map((s, i) => [s.slug, i]));
    sets.sort((a, b) => (setSlugOrder.get(a) ?? Infinity) - (setSlugOrder.get(b) ?? Infinity));
  }
  const byOrder = (order: readonly string[]) => (a: string, b: string) =>
    orderIndex(order, a) - orderIndex(order, b);

  return {
    sets,
    supplementalSets: setMeta
      ? new Set(
          setMeta.filter((s) => s.setType === WellKnown.setType.SUPPLEMENTAL).map((s) => s.slug),
        )
      : new Set<string>(),
    domains: [...domainSet].sort(byOrder(orders.domains)),
    types: [...typeSet].sort(byOrder(orders.cardTypes)),
    superTypes: [...superTypeSet]
      .filter((st) => st !== WellKnown.superType.BASIC)
      .sort(byOrder(orders.superTypes)),
    rarities: [...raritySet].sort(byOrder(orders.rarities)),
    artVariants: [...artVariantSet].sort(byOrder(orders.artVariants)),
    finishes: [...finishSet].sort(byOrder(orders.finishes)),
    cardSizes: [...cardSizeSet].sort(byOrder(orders.cardSizes)),
    hasSigned,
    hasNonStandard,
    hasBanned,
    hasErrata,
    hasNullEnergy,
    hasNullMight,
    hasNullPower,
    markers: [...markerBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    distributionChannels: (options.channels ?? [...channelBySlug.values()]).toSorted((a, b) =>
      a.slug.localeCompare(b.slug),
    ),
    keywords: [...keywordSet].sort((a, b) => a.localeCompare(b)),
    tags: [...tagSet].sort((a, b) => a.localeCompare(b)),
    energy: readBounds(energy),
    might: readBounds(might),
    power: readBounds(power),
    price: readBounds(price),
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
  cardSizes: Map<string, number>;
  markers: Map<string, number>;
  channels: Map<string, number>;
  keywords: Map<string, number>;
  tags: Map<string, number>;
  /**
   * Counts for the single-chip "More"-section flags. Each value reflects the
   * count *if the chip's currently-displayed state were applied*, combined
   * with all other active filters.
   */
  flags: {
    signed: number;
    banned: number;
    errata: number;
    standard: number;
  };
  /**
   * Counts for the generic presence options. For each dimension, `any` is the
   * count if "has any" were applied and `none` if "has none" were applied,
   * combined with every other active filter but ignoring this dimension's own
   * presence and value selection (same widen-as-you-toggle rule as the value
   * facets).
   */
  presence: Record<PresenceDimension, { any: number; none: number }>;
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
  key: Exclude<keyof FilterCounts, "flags" | "ranges" | "presence">;
  filterField: keyof CardFilters;
  /**
   * The negation companion field, cleared alongside `filterField` when faceting.
   * Omitted for dimensions that have no exclude variant (e.g. card size).
   */
  excludeField?: keyof CardFilters;
  /**
   * Reads the one value a single-valued dimension contributes. Exactly one of
   * `scalar` / `values` is set. The split exists so the counting loop doesn't
   * wrap six scalars per printing in throwaway one-element arrays — at catalog
   * scale that was ~40k allocations per pass, and this runs on every filter
   * change.
   */
  scalar?: (printing: Printing) => string;
  /** Reads every value a multi-valued dimension contributes. */
  values?: (printing: Printing) => readonly string[];
}

const COUNTABLE_DIMENSIONS: readonly CountableDimension[] = [
  { key: "sets", filterField: "sets", excludeField: "setsExclude", scalar: (p) => p.setSlug },
  {
    key: "languages",
    filterField: "languages",
    excludeField: "languagesExclude",
    scalar: (p) => p.language,
  },
  {
    key: "domains",
    filterField: "domains",
    excludeField: "domainsExclude",
    values: (p) => p.card.domains,
  },
  {
    key: "types",
    filterField: "types",
    excludeField: "typesExclude",
    values: (p) => p.card.types,
  },
  {
    key: "superTypes",
    filterField: "superTypes",
    excludeField: "superTypesExclude",
    values: (p) => p.card.superTypes,
  },
  {
    key: "rarities",
    filterField: "rarities",
    excludeField: "raritiesExclude",
    scalar: (p) => p.rarity,
  },
  {
    key: "artVariants",
    filterField: "artVariants",
    excludeField: "artVariantsExclude",
    scalar: (p) => p.artVariant || WellKnown.artVariant.NORMAL,
  },
  {
    key: "finishes",
    filterField: "finishes",
    excludeField: "finishesExclude",
    scalar: (p) => p.finish,
  },
  // Card size (main) has no negation companion; faceting just clears its include.
  { key: "cardSizes", filterField: "cardSizes", scalar: (p) => p.size },
  {
    key: "markers",
    filterField: "markerSlugs",
    excludeField: "markerSlugsExclude",
    values: (p) => p.markers.map((m) => m.slug),
  },
  {
    key: "channels",
    filterField: "distributionChannelSlugs",
    excludeField: "distributionChannelSlugsExclude",
    values: (p) => p.distributionChannels.map((dc) => dc.channel.slug),
  },
  {
    key: "keywords",
    filterField: "keywords",
    excludeField: "keywordsExclude",
    values: (p) => p.card.keywords,
  },
  {
    key: "tags",
    filterField: "tags",
    excludeField: "tagsExclude",
    values: (p) => p.card.tags,
  },
];

/**
 * A countable dimension with its tally state and clear mask resolved, built
 * once per {@link computeFilterCounts} call so the per-printing loop reads
 * plain fields instead of looking dimensions up by string key.
 */
interface PreparedDimension {
  clear: number;
  scalar: ((printing: Printing) => string) | null;
  values: (printing: Printing) => readonly string[];
  /**
   * Where the dimension's values come from. Markers and channels reuse the slug
   * arrays the loop already projected for the atom checks; everything else calls
   * `scalar` / `values`.
   */
  projection: "own" | "markers" | "channels";
  counts: Map<string, number>;
  cardIds: Map<string, Set<number>> | null;
}

const NO_VALUES = (): readonly string[] => EMPTY_STRINGS;

interface FlagDimension {
  key: keyof FilterCounts["flags"];
  filterField: "isSigned" | "isBanned" | "hasErrata" | "isStandard";
}

const FLAG_DIMENSIONS: readonly FlagDimension[] = [
  { key: "signed", filterField: "isSigned" },
  { key: "banned", filterField: "isBanned" },
  { key: "errata", filterField: "hasErrata" },
  { key: "standard", filterField: "isStandard" },
];

/**
 * One bit per independent filter group ("atom") for the single-pass faceted
 * counter below. A printing's failure mask has an atom's bit set when the
 * printing does not satisfy that group's active filter (an include and its
 * exclude companion form ONE atom — every facet that ignores one ignores
 * both). Search has no bit: no facet clears it, so a search miss just drops
 * the printing from the scan entirely.
 */
const ATOM = {
  sets: 1,
  languages: 1 << 1,
  domains: 1 << 2,
  types: 1 << 3,
  superTypes: 1 << 4,
  rarities: 1 << 5,
  artVariants: 1 << 6,
  finishes: 1 << 7,
  cardSizes: 1 << 8,
  markers: 1 << 9,
  channels: 1 << 10,
  keywords: 1 << 11,
  tags: 1 << 12,
  customTags: 1 << 13,
  presenceMarkers: 1 << 14,
  presenceSuperTypes: 1 << 15,
  presenceCustomTags: 1 << 16,
  presenceChannels: 1 << 17,
  presenceKeywords: 1 << 18,
  presenceTags: 1 << 19,
  isStandard: 1 << 20,
  isSigned: 1 << 21,
  isBanned: 1 << 22,
  hasErrata: 1 << 23,
  energy: 1 << 24,
  might: 1 << 25,
  power: 1 << 26,
  price: 1 << 27,
} as const;

const DIMENSION_CLEARS: Record<CountableDimension["key"], number> = {
  sets: ATOM.sets,
  languages: ATOM.languages,
  domains: ATOM.domains,
  types: ATOM.types,
  superTypes: ATOM.superTypes,
  rarities: ATOM.rarities,
  artVariants: ATOM.artVariants,
  finishes: ATOM.finishes,
  cardSizes: ATOM.cardSizes,
  markers: ATOM.markers,
  channels: ATOM.channels,
  keywords: ATOM.keywords,
  tags: ATOM.tags,
};

/**
 * Which atoms each presence facet ignores: the dimension's own presence
 * constraint plus its include/exclude value filters, so the facet widens as
 * the user toggles (keywords has no value filter).
 */
const PRESENCE_CLEARS: Record<PresenceDimension, number> = {
  markers: ATOM.presenceMarkers | ATOM.markers,
  superTypes: ATOM.presenceSuperTypes | ATOM.superTypes,
  customTags: ATOM.presenceCustomTags | ATOM.customTags,
  distributionChannels: ATOM.presenceChannels | ATOM.channels,
  keywords: ATOM.presenceKeywords,
  tags: ATOM.presenceTags | ATOM.tags,
};

const FLAG_CLEARS: Record<FlagDimension["key"], number> = {
  standard: ATOM.isStandard,
  signed: ATOM.isSigned,
  banned: ATOM.isBanned,
  errata: ATOM.hasErrata,
};

const EMPTY_STRINGS: readonly string[] = [];

/**
 * A printing/card tally that counts each printing once, or each distinct card
 * once in card mode. Cards are identified by a small integer (their first-seen
 * index) rather than their id string: the sets below are hit up to twenty times
 * per printing, and hashing an integer is markedly cheaper than hashing a UUID.
 */
interface MatchCounter {
  n: number;
  cards: Set<number> | null;
}

function makeCounter(byCard: boolean): MatchCounter {
  return { n: 0, cards: byCard ? new Set<number>() : null };
}

function bumpCounter(counter: MatchCounter, card: number): void {
  if (counter.cards) {
    counter.cards.add(card);
  } else {
    counter.n += 1;
  }
}

function readCounter(counter: MatchCounter): number {
  return counter.cards ? counter.cards.size : counter.n;
}

/** Records that `card` contributed to `value`, creating the set on first use. */
function bumpCardSet(byValue: Map<string, Set<number>>, value: string, card: number): void {
  const cards = byValue.get(value);
  if (cards === undefined) {
    byValue.set(value, new Set([card]));
  } else {
    cards.add(card);
  }
}

/** Running min/max in `boundsOf` semantics (floor/ceil, empty → 0/0). */
interface BoundsAcc {
  min: number;
  max: number;
  any: boolean;
}

function bumpBounds(acc: BoundsAcc, value: number): void {
  acc.any = true;
  if (value < acc.min) {
    acc.min = value;
  }
  if (value > acc.max) {
    acc.max = value;
  }
}

function readBounds(acc: BoundsAcc): { min: number; max: number } {
  return acc.any ? { min: Math.floor(acc.min), max: Math.ceil(acc.max) } : { min: 0, max: 0 };
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
export function computeFilterCounts(
  printings: Printing[],
  rawFilters: CardFilters,
  options: ComputeFilterCountsOptions,
): FilterCounts {
  // Same backfill as filterCards: persisted list rules re-hydrate without a
  // schema pass, so older saved filters may lack newer dimensions.
  const filters: CardFilters = { ...EMPTY_CARD_FILTERS, ...rawFilters };
  const terms = filters.search ? parseSearchTerms(filters.search) : [];
  const hasPrefixes = terms.some((t) => t.field !== null);
  const getPrice = options.getPrice;
  const byCard = options.countBy === "card";
  const presence = filters.presence;

  // Per-facet tally state. Each countable dimension gets a value→count map in
  // printing mode, or a value→cardIds set-map in card mode (a card counts once
  // per value; sets dedup without allocating a string key per printing×value);
  // flags and presence get printing/card counters; ranges get running bounds.
  const dimCounts: Map<string, number>[] = COUNTABLE_DIMENSIONS.map(() => new Map());
  const dimCardIds: (Map<string, Set<number>> | null)[] = COUNTABLE_DIMENSIONS.map(() =>
    byCard ? new Map() : null,
  );
  // cardId → small integer, assigned on first sight. Card-mode dedup then works
  // on integers instead of UUID strings (see MatchCounter).
  const cardIndexes = byCard ? new Map<string, number>() : null;
  // One record per dimension holding everything the per-printing loop needs, so
  // that loop does no record lookups by string key and no index bounds dance.
  const dims: PreparedDimension[] = COUNTABLE_DIMENSIONS.map((d, i) => ({
    clear: DIMENSION_CLEARS[d.key],
    scalar: d.scalar ?? null,
    values: d.values ?? NO_VALUES,
    projection: d.key === "markers" ? "markers" : d.key === "channels" ? "channels" : "own",
    counts: dimCounts[i] as Map<string, number>,
    cardIds: dimCardIds[i] ?? null,
  }));
  const flagCounters = {
    signed: makeCounter(byCard),
    banned: makeCounter(byCard),
    errata: makeCounter(byCard),
    standard: makeCounter(byCard),
  };
  // Each flag chip cycles null → true → false → null. The displayed label
  // reads "Signed" for null/true and "Not Signed" for false; the count
  // reflects whichever state the label currently advertises.
  const flagTargets = {
    standard: filters.isStandard !== false,
    signed: filters.isSigned !== false,
    banned: filters.isBanned !== false,
    errata: filters.hasErrata !== false,
  };
  const presenceCounters = Object.fromEntries(
    PRESENCE_DIMENSIONS.map((d) => [d, { any: makeCounter(byCard), none: makeCounter(byCard) }]),
  ) as Record<PresenceDimension, { any: MatchCounter; none: MatchCounter }>;
  const statBounds = {
    energy: { min: Infinity, max: -Infinity, any: false } as BoundsAcc,
    might: { min: Infinity, max: -Infinity, any: false } as BoundsAcc,
    power: { min: Infinity, max: -Infinity, any: false } as BoundsAcc,
  };
  const statNulls = { energy: false, might: false, power: false };
  const priceBounds: BoundsAcc = { min: Infinity, max: -Infinity, any: false };

  // Is each axis filtered at all? An unfiltered axis can never set its bit, so
  // hoisting these turns the per-printing atom pass from ~50 predicate calls
  // into one comparison per *active* axis. The catalog has ~7k printings and
  // this runs on every filter change, so the constant factor is the cost.
  const setsActive = filters.sets.length > 0 || filters.setsExclude.length > 0;
  const languagesActive = filters.languages.length > 0 || filters.languagesExclude.length > 0;
  const domainsActive = filters.domains.length > 0 || filters.domainsExclude.length > 0;
  const typesActive = filters.types.length > 0 || filters.typesExclude.length > 0;
  const superTypesActive = filters.superTypes.length > 0 || filters.superTypesExclude.length > 0;
  const raritiesActive = filters.rarities.length > 0 || filters.raritiesExclude.length > 0;
  const artVariantsActive = filters.artVariants.length > 0 || filters.artVariantsExclude.length > 0;
  const finishesActive = filters.finishes.length > 0 || filters.finishesExclude.length > 0;
  const cardSizesActive = filters.cardSizes.length > 0;
  const markersActive = filters.markerSlugs.length > 0 || filters.markerSlugsExclude.length > 0;
  const channelsActive =
    filters.distributionChannelSlugs.length > 0 ||
    filters.distributionChannelSlugsExclude.length > 0;
  const keywordsActive = filters.keywords.length > 0 || filters.keywordsExclude.length > 0;
  const tagsActive = filters.tags.length > 0 || filters.tagsExclude.length > 0;
  const customTagsActive =
    filters.customTagSlugs.length > 0 || filters.customTagSlugsExclude.length > 0;
  const energyActive = filters.energy.min !== null || filters.energy.max !== null;
  const mightActive = filters.might.min !== null || filters.might.max !== null;
  const powerActive = filters.power.min !== null || filters.power.max !== null;
  const priceActive = filters.price.min !== null || filters.price.max !== null;
  // The customTags presence facet reports its any/none counts whether or not
  // that presence filter is set, so the slugs are needed for every printing —
  // but only when the caller supplied assignments at all (the catalog doesn't).
  const customTagAssignments = options.customTagAssignments;

  for (const printing of printings) {
    const { card } = printing;
    // No facet clears the search, so a miss can't count anywhere.
    if (
      terms.length > 0 &&
      !matchesSearch(printing, terms, hasPrefixes, filters.searchScope, options.keywordReverseMap)
    ) {
      continue;
    }

    const markerSlugs =
      printing.markers.length > 0 ? printing.markers.map((m) => m.slug) : EMPTY_STRINGS;
    const channelSlugs =
      printing.distributionChannels.length > 0
        ? printing.distributionChannels.map((dc) => dc.channel.slug)
        : EMPTY_STRINGS;
    const customTagSlugs =
      customTagAssignments === undefined
        ? EMPTY_STRINGS
        : (customTagAssignments[printing.cardId] ?? EMPTY_STRINGS);
    const artVariant = printing.artVariant || WellKnown.artVariant.NORMAL;
    // The `basic` placeholder supertype is not filterable (see presenceValues).
    const hasSuperTypes = card.superTypes.some((st) => st !== WellKnown.superType.BASIC);
    const isStandard = isStandardPrinting(printing);
    const isBanned = card.bans.length > 0;
    const hasErrata = card.errata !== null;

    // Evaluate every *active* atom against the printing. The `active` flags are
    // hoisted out of the loop (see above): an unfiltered axis can never set its
    // bit, so with the usual one or two axes in play this drops from ~50
    // predicate calls per printing to two.
    let fail = 0;
    if (
      setsActive &&
      (!includes(filters.sets, printing.setSlug) ||
        !notExcluded(filters.setsExclude, printing.setSlug))
    ) {
      fail |= ATOM.sets;
    }
    if (
      languagesActive &&
      (!includes(filters.languages, printing.language) ||
        !notExcluded(filters.languagesExclude, printing.language))
    ) {
      fail |= ATOM.languages;
    }
    if (
      domainsActive &&
      (!matchesDomains(filters.domains, card.domains) ||
        !noneExcluded(filters.domainsExclude, card.domains))
    ) {
      fail |= ATOM.domains;
    }
    if (
      typesActive &&
      (!overlaps(filters.types, card.types) || !noneExcluded(filters.typesExclude, card.types))
    ) {
      fail |= ATOM.types;
    }
    if (
      superTypesActive &&
      (!overlaps(filters.superTypes, card.superTypes) ||
        !noneExcluded(filters.superTypesExclude, card.superTypes))
    ) {
      fail |= ATOM.superTypes;
    }
    if (
      raritiesActive &&
      (!includes(filters.rarities, printing.rarity) ||
        !notExcluded(filters.raritiesExclude, printing.rarity))
    ) {
      fail |= ATOM.rarities;
    }
    if (
      artVariantsActive &&
      (!includes(filters.artVariants, artVariant) ||
        !notExcluded(filters.artVariantsExclude, artVariant))
    ) {
      fail |= ATOM.artVariants;
    }
    if (
      finishesActive &&
      (!includes(filters.finishes, printing.finish) ||
        !notExcluded(filters.finishesExclude, printing.finish))
    ) {
      fail |= ATOM.finishes;
    }
    if (cardSizesActive && !includes(filters.cardSizes, printing.size)) {
      fail |= ATOM.cardSizes;
    }
    if (
      markersActive &&
      (!matchesMarkers(filters.markerSlugs, markerSlugs) ||
        !noneExcluded(filters.markerSlugsExclude, markerSlugs))
    ) {
      fail |= ATOM.markers;
    }
    if (
      channelsActive &&
      (!matchesDistributionChannels(filters.distributionChannelSlugs, channelSlugs) ||
        !noneExcluded(filters.distributionChannelSlugsExclude, channelSlugs))
    ) {
      fail |= ATOM.channels;
    }
    if (
      keywordsActive &&
      (!overlaps(filters.keywords, card.keywords) ||
        !noneExcluded(filters.keywordsExclude, card.keywords))
    ) {
      fail |= ATOM.keywords;
    }
    if (
      tagsActive &&
      (!overlaps(filters.tags, card.tags) || !noneExcluded(filters.tagsExclude, card.tags))
    ) {
      fail |= ATOM.tags;
    }
    if (
      customTagsActive &&
      (!matchesCustomTags(filters.customTagSlugs, customTagSlugs) ||
        !noneExcluded(filters.customTagSlugsExclude, customTagSlugs))
    ) {
      fail |= ATOM.customTags;
    }
    if (presence.markers && (presence.markers === "any") !== markerSlugs.length > 0) {
      fail |= ATOM.presenceMarkers;
    }
    if (presence.superTypes && (presence.superTypes === "any") !== hasSuperTypes) {
      fail |= ATOM.presenceSuperTypes;
    }
    if (presence.customTags && (presence.customTags === "any") !== customTagSlugs.length > 0) {
      fail |= ATOM.presenceCustomTags;
    }
    if (
      presence.distributionChannels &&
      (presence.distributionChannels === "any") !== channelSlugs.length > 0
    ) {
      fail |= ATOM.presenceChannels;
    }
    if (presence.keywords && (presence.keywords === "any") !== card.keywords.length > 0) {
      fail |= ATOM.presenceKeywords;
    }
    if (presence.tags && (presence.tags === "any") !== card.tags.length > 0) {
      fail |= ATOM.presenceTags;
    }
    if (filters.isStandard !== null && filters.isStandard !== isStandard) {
      fail |= ATOM.isStandard;
    }
    if (filters.isSigned !== null && filters.isSigned !== printing.isSigned) {
      fail |= ATOM.isSigned;
    }
    if (filters.isBanned !== null && filters.isBanned !== isBanned) {
      fail |= ATOM.isBanned;
    }
    if (filters.hasErrata !== null && filters.hasErrata !== hasErrata) {
      fail |= ATOM.hasErrata;
    }
    if (energyActive && !matchesRange(card.energy, filters.energy)) {
      fail |= ATOM.energy;
    }
    if (mightActive && !matchesRange(card.might, filters.might)) {
      fail |= ATOM.might;
    }
    if (powerActive && !matchesRange(card.power, filters.power)) {
      fail |= ATOM.power;
    }
    // getPrice still runs for every printing when supplied: the price slider's
    // faceted bounds need it whether or not the price filter itself is set.
    const price = getPrice?.(printing);
    if (priceActive && !matchesRange(price ?? null, filters.price)) {
      fail |= ATOM.price;
    }

    // Every facet below one of the presence facets clears at most one atom, so
    // a printing failing two or more can't count anywhere except a presence
    // facet. Checking that once skips ~20 mask tests per printing, and with any
    // two filters active most of the catalog takes this path.
    const oneFailAtMost = (fail & (fail - 1)) === 0;
    // Card-mode tallies dedup by this integer; printing mode never reads it.
    let cardIndex = 0;
    if (cardIndexes) {
      const known = cardIndexes.get(printing.cardId);
      if (known === undefined) {
        cardIndex = cardIndexes.size;
        cardIndexes.set(printing.cardId, cardIndex);
      } else {
        cardIndex = known;
      }
    }

    // A printing counts toward a facet iff everything it fails is cleared by
    // that facet. Precomputed marker/channel slugs double as the tally sources,
    // so those aren't re-projected per dimension.
    if (oneFailAtMost) {
      for (const dim of dims) {
        if ((fail & ~dim.clear) !== 0) {
          continue;
        }
        const { cardIds, counts, scalar } = dim;
        if (scalar) {
          const value = scalar(printing);
          if (cardIds) {
            bumpCardSet(cardIds, value, cardIndex);
          } else {
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
          continue;
        }
        const values =
          dim.projection === "markers"
            ? markerSlugs
            : dim.projection === "channels"
              ? channelSlugs
              : dim.values(printing);
        if (cardIds) {
          for (const value of values) {
            bumpCardSet(cardIds, value, cardIndex);
          }
        } else {
          for (const value of values) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
        }
      }
      for (const { key } of FLAG_DIMENSIONS) {
        if ((fail & ~FLAG_CLEARS[key]) !== 0) {
          continue;
        }
        const actual =
          key === "standard"
            ? isStandard
            : key === "signed"
              ? printing.isSigned
              : key === "banned"
                ? isBanned
                : hasErrata;
        if (actual === flagTargets[key]) {
          bumpCounter(flagCounters[key], cardIndex);
        }
      }
      // Faceted slider bounds: this dim's range cleared, everything else active.
      if ((fail & ~ATOM.energy) === 0) {
        if (card.energy === null) {
          statNulls.energy = true;
        } else {
          bumpBounds(statBounds.energy, card.energy);
        }
      }
      if ((fail & ~ATOM.might) === 0) {
        if (card.might === null) {
          statNulls.might = true;
        } else {
          bumpBounds(statBounds.might, card.might);
        }
      }
      if ((fail & ~ATOM.power) === 0) {
        if (card.power === null) {
          statNulls.power = true;
        } else {
          bumpBounds(statBounds.power, card.power);
        }
      }
      if (getPrice && (fail & ~ATOM.price) === 0 && price !== undefined) {
        bumpBounds(priceBounds, price);
      }
    }
    // Presence facets clear two atoms each (their own plus the dimension's
    // value filter), so they're the one family a two-atom failure can still
    // reach — hence their own pass outside the fast path above.
    for (const dimension of PRESENCE_DIMENSIONS) {
      if ((fail & ~PRESENCE_CLEARS[dimension]) !== 0) {
        continue;
      }
      const has =
        dimension === "markers"
          ? markerSlugs.length > 0
          : dimension === "superTypes"
            ? hasSuperTypes
            : dimension === "customTags"
              ? customTagSlugs.length > 0
              : dimension === "distributionChannels"
                ? channelSlugs.length > 0
                : dimension === "keywords"
                  ? card.keywords.length > 0
                  : card.tags.length > 0;
      const target = presenceCounters[dimension];
      bumpCounter(has ? target.any : target.none, cardIndex);
    }
  }

  const result = {
    flags: {
      signed: readCounter(flagCounters.signed),
      banned: readCounter(flagCounters.banned),
      errata: readCounter(flagCounters.errata),
      standard: readCounter(flagCounters.standard),
    },
    presence: Object.fromEntries(
      PRESENCE_DIMENSIONS.map((d) => [
        d,
        { any: readCounter(presenceCounters[d].any), none: readCounter(presenceCounters[d].none) },
      ]),
    ) as FilterCounts["presence"],
    ranges: {
      energy: { ...readBounds(statBounds.energy), hasNullStat: statNulls.energy },
      might: { ...readBounds(statBounds.might), hasNullStat: statNulls.might },
      power: { ...readBounds(statBounds.power), hasNullStat: statNulls.power },
      price: readBounds(priceBounds),
    },
  } as FilterCounts;
  for (const [i, dim] of COUNTABLE_DIMENSIONS.entries()) {
    const cardIds = dimCardIds[i];
    if (cardIds) {
      const counts = dimCounts[i] as Map<string, number>;
      for (const [value, ids] of cardIds) {
        counts.set(value, ids.size);
      }
    }
    result[dim.key] = dimCounts[i] as Map<string, number>;
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
  /**
   * The catalog's sets, in catalog order. Required when `sortBy === "id"`, and
   * used by every other sort's tiebreaker when supplied: a card ID orders by
   * its set's place in {@link orderSetsMainFirst} order first, so IDs across
   * sets follow the same set order as the grid's group headers rather than the
   * alphabetical set prefix inside the short code.
   */
  sets?: readonly SetOrderInfo[];
}

/**
 * Sorts a printings array by the given sort option. Direction applies only to
 * the primary key; the tiebreaker (card ID) is always ascending. Null
 * stats/prices are always pushed to the end. Card ID means set order then card
 * number, so `options.sets` has to be supplied — see {@link SortCardsOptions}.
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
  const byId = idComparator(options.sets);
  if (sortBy === "name") {
    return printings.toSorted((a, b) => dir * a.card.name.localeCompare(b.card.name) || byId(a, b));
  }
  if (sortBy === "id") {
    if (!options.sets) {
      throw new Error("sortCards: `sets` is required when sortBy is 'id'");
    }
    return printings.toSorted((a, b) => dir * byId(a, b));
  }
  if (sortBy === "energy") {
    return printings.toSorted((a, b) => compareWithFallback(a, b, (p) => p.card.energy, dir, byId));
  }
  if (sortBy === "rarity") {
    if (!options.rarityOrder) {
      throw new Error("sortCards: `rarityOrder` is required when sortBy is 'rarity'");
    }
    const rarityOrder = options.rarityOrder;
    return printings.toSorted(
      (a, b) =>
        dir * (orderIndex(rarityOrder, a.rarity) - orderIndex(rarityOrder, b.rarity)) || byId(a, b),
    );
  }
  // oxlint-disable-next-line unicorn/no-useless-undefined -- returning undefined satisfies the getPrice contract
  const getPrice = options.getPrice ?? (() => undefined);
  return printings.toSorted((a, b) => compareWithFallback(a, b, getPrice, dir, byId));
}
