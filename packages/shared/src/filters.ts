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
import { cardSearchAltNames, legendDisplayName } from "./utils.js";
import { WellKnown } from "./well-known.js";

interface ParsedSearchTerm {
  field: SearchField | null;
  text: string;
  folded: string;
  squashed: string;
}

function toTerm(field: SearchField | null, text: string): ParsedSearchTerm | null {
  const folded = foldForSearch(text);
  if (folded === "") {
    return null;
  }
  return { field, text, folded, squashed: squashForSearch(text) };
}

/** Kept as a source string so each caller builds its own stateful `g` regex; a shared instance would share `lastIndex`. */
const SEARCH_TERM_PATTERN =
  /(?:(?<prefix>id|ty|[ndktaf]):(?:"(?<quoted>[^"]*)"|(?<bare>[\S]*)))|(?:"(?<looseQuoted>[^"]*)")|(?<loose>\S+)/u
    .source;

/** Tokenizes a raw search string, supporting `n:Fireball`-style field prefixes and quoted phrases. */
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
 * Unlike {@link parseSearchTerms}, this counts a prefix carrying no text yet,
 * so a half-typed `n:` already reports the name field.
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

function foldedContains(value: string | null | undefined, term: ParsedSearchTerm): boolean {
  return value ? foldCached(value).includes(term.folded) : false;
}

/**
 * As {@link foldedContains}, but also matches with separators stripped from
 * both sides. Restricted to identifier-like fields; see {@link squashForSearch}.
 */
function looselyContains(value: string | null | undefined, term: ParsedSearchTerm): boolean {
  if (!value) {
    return false;
  }
  return foldCached(value).includes(term.folded) || squashCached(value).includes(term.squashed);
}

function printingMatchesField(
  printing: Printing,
  field: SearchField,
  term: ParsedSearchTerm,
  keywordReverseMap?: Map<string, string>,
): boolean {
  const { card } = printing;
  if (field === "name") {
    return (
      looselyContains(card.name, term) ||
      looselyContains(printing.printedName, term) ||
      cardSearchAltNames(card).some((name) => looselyContains(name, term))
    );
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
    if (card.keywords.some((kw) => looselyContains(kw, term))) {
      return true;
    }
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
  return looselyContains(printing.shortCode, term) || looselyContains(printing.publicCode, term);
}

/**
 * A null value fails any non-empty range unless `min` is `NONE` (-1), which
 * opts null-stat cards in; `max === NONE` then blocks every non-null value.
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

function notExcluded<T>(excluded: T[], value: T): boolean {
  return excluded.length === 0 || !excluded.includes(value);
}

export function noneExcluded<T>(excluded: T[], values: readonly T[]): boolean {
  return excluded.length === 0 || !values.some((v) => excluded.includes(v));
}

/** 0 selected = all, 1 selected = any card with that domain, 2+ = domains must all be within the set. */
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

/** Nulls always sort to the end; the tiebreaker (card ID) is always ascending. */
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

/** Without `sets`, the short code stands alone and orders sets by their alphabetical prefix. */
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
  keywordReverseMap?: Map<string, string>;
  /** Defaults to a no-op returning `undefined`, so the price filter only matches priceless printings. */
  getPrice?: (printing: Printing) => number | undefined;
  customTagAssignments?: Record<string, readonly string[]>;
}

export function filterCards(
  printings: Printing[],
  rawFilters: CardFilters,
  options: FilterCardsOptions = {},
): Printing[] {
  // Persisted list rules re-hydrate via a bare JSON.parse, so an older rule may
  // lack a newer dimension's key; backfill or the first predicate to read it throws.
  const filters: CardFilters = { ...EMPTY_CARD_FILTERS, ...rawFilters };
  const terms = filters.search ? parseSearchTerms(filters.search) : [];
  const hasPrefixes = terms.some((t) => t.field !== null);
  const getPrice = options.getPrice;
  const presence = filters.presence;

  // Per-printing slug projections allocate; decide once whether any active filter
  // reads them (the presence checks below need only lengths, not the arrays).
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
        matchesFlag(filters.isOvernumbered, printing.isOvernumbered) &&
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

function orderIndex(order: readonly string[], value: string): number {
  const idx = order.indexOf(value);
  return idx === -1 ? Infinity : idx;
}

export interface AvailableFilters {
  sets: string[];
  supplementalSets: ReadonlySet<string>;
  domains: string[];
  types: string[];
  superTypes: string[];
  rarities: string[];
  artVariants: string[];
  finishes: string[];
  cardSizes: string[];
  hasSigned: boolean;
  hasOvernumbered: boolean;
  hasNonStandard: boolean;
  hasBanned: boolean;
  hasErrata: boolean;
  hasNullEnergy: boolean;
  hasNullMight: boolean;
  hasNullPower: boolean;
  markers: Marker[];
  distributionChannels: DistributionChannel[];
  keywords: string[];
  tags: string[];
  energy: { min: number; max: number };
  might: { min: number; max: number };
  power: { min: number; max: number };
  price: { min: number; max: number };
}

interface GetAvailableFiltersOptions {
  /** Pass the live orders from `/api/enums` so admin re-ordering takes effect. */
  orders: EnumOrders;
  /** When omitted, sets appear in insertion order and `supplementalSets` is empty. */
  sets?: readonly { slug: string; setType?: string }[];
  /** Defaults to `() => undefined`, which yields a `{ min: 0, max: 0 }` price range. */
  getPrice?: (printing: Printing) => number | undefined;
  /**
   * When omitted, `distributionChannels` is derived from the printings' direct
   * channel links only, losing parent channels no printing links to directly.
   */
  channels?: readonly DistributionChannel[];
}

export function getAvailableFilters(
  printings: Printing[],
  options: GetAvailableFiltersOptions,
): AvailableFilters {
  const orders = options.orders;
  const getPrice = options.getPrice;
  const setMeta = options.sets;

  // One pass: the previous shape read `printings` ~20 times over (flatMaps,
  // some() scans, Math.min spreads), too slow for the first render of /cards.
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
  let hasOvernumbered = false;
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
    if (printing.isOvernumbered) {
      hasOvernumbered = true;
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
    hasOvernumbered,
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
  flags: {
    signed: number;
    overnumbered: number;
    banned: number;
    errata: number;
    standard: number;
  };
  presence: Record<PresenceDimension, { any: number; none: number }>;
  ranges: {
    energy: { min: number; max: number; hasNullStat: boolean };
    might: { min: number; max: number; hasNullStat: boolean };
    power: { min: number; max: number; hasNullStat: boolean };
    price: { min: number; max: number };
  };
}

interface ComputeFilterCountsOptions extends FilterCardsOptions {
  countBy: "printing" | "card";
}

interface CountableDimension {
  key: Exclude<keyof FilterCounts, "flags" | "ranges" | "presence">;
  filterField: keyof CardFilters;
  excludeField?: keyof CardFilters;
  scalar?: (printing: Printing) => string;
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

/** Built once per {@link computeFilterCounts} call so the per-printing loop reads plain fields. */
interface PreparedDimension {
  clear: number;
  scalar: ((printing: Printing) => string) | null;
  values: (printing: Printing) => readonly string[];
  projection: "own" | "markers" | "channels";
  counts: Map<string, number>;
  cardIds: Map<string, Set<number>> | null;
}

const NO_VALUES = (): readonly string[] => EMPTY_STRINGS;

interface FlagDimension {
  key: keyof FilterCounts["flags"];
  filterField: "isSigned" | "isOvernumbered" | "isBanned" | "hasErrata" | "isStandard";
}

const FLAG_DIMENSIONS: readonly FlagDimension[] = [
  { key: "signed", filterField: "isSigned" },
  { key: "overnumbered", filterField: "isOvernumbered" },
  { key: "banned", filterField: "isBanned" },
  { key: "errata", filterField: "hasErrata" },
  { key: "standard", filterField: "isStandard" },
];

/**
 * One bit per independent filter group for the single-pass faceted counter below.
 * An include and its exclude companion share one atom. Search has no bit: no facet clears it.
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
  isOvernumbered: 1 << 28,
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

/** Each presence facet ignores its own presence constraint plus its value filters (keywords has none). */
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
  overnumbered: ATOM.isOvernumbered,
  banned: ATOM.isBanned,
  errata: ATOM.hasErrata,
};

const EMPTY_STRINGS: readonly string[] = [];

/** Cards are identified by a small first-seen integer, cheaper to hash than a UUID. */
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
 * Each dimension's count ignores its own current selection so multi-select
 * still widens results (e.g. picking `language=EN` doesn't zero other languages).
 */
export function computeFilterCounts(
  printings: Printing[],
  rawFilters: CardFilters,
  options: ComputeFilterCountsOptions,
): FilterCounts {
  const filters: CardFilters = { ...EMPTY_CARD_FILTERS, ...rawFilters };
  const terms = filters.search ? parseSearchTerms(filters.search) : [];
  const hasPrefixes = terms.some((t) => t.field !== null);
  const getPrice = options.getPrice;
  const byCard = options.countBy === "card";
  const presence = filters.presence;

  const dimCounts: Map<string, number>[] = COUNTABLE_DIMENSIONS.map(() => new Map());
  const dimCardIds: (Map<string, Set<number>> | null)[] = COUNTABLE_DIMENSIONS.map(() =>
    byCard ? new Map() : null,
  );
  const cardIndexes = byCard ? new Map<string, number>() : null;
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
    overnumbered: makeCounter(byCard),
    banned: makeCounter(byCard),
    errata: makeCounter(byCard),
    standard: makeCounter(byCard),
  };
  // Each flag chip cycles null → true → false → null; the count reflects
  // whichever state the chip's label is currently advertising.
  const flagTargets = {
    standard: filters.isStandard !== false,
    signed: filters.isSigned !== false,
    overnumbered: filters.isOvernumbered !== false,
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

  // An unfiltered axis can never set its bit, so hoisting these turns the
  // per-printing atom pass from ~50 predicate calls into one per active axis.
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
  const customTagAssignments = options.customTagAssignments;

  for (const printing of printings) {
    const { card } = printing;
    // No facet clears search, so a miss can't count anywhere.
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
    const hasSuperTypes = card.superTypes.some((st) => st !== WellKnown.superType.BASIC);
    const isStandard = isStandardPrinting(printing);
    const isBanned = card.bans.length > 0;
    const hasErrata = card.errata !== null;

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
    if (filters.isOvernumbered !== null && filters.isOvernumbered !== printing.isOvernumbered) {
      fail |= ATOM.isOvernumbered;
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
    // getPrice runs for every printing when supplied: the faceted bounds need it
    // whether or not the price filter itself is set.
    const price = getPrice?.(printing);
    if (priceActive && !matchesRange(price ?? null, filters.price)) {
      fail |= ATOM.price;
    }

    // A printing failing two or more atoms can only still count toward a presence facet.
    const oneFailAtMost = (fail & (fail - 1)) === 0;
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
              : key === "overnumbered"
                ? printing.isOvernumbered
                : key === "banned"
                  ? isBanned
                  : hasErrata;
        if (actual === flagTargets[key]) {
          bumpCounter(flagCounters[key], cardIndex);
        }
      }
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
    // Presence facets clear two atoms each, so they get their own pass outside the fast path above.
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
      overnumbered: readCounter(flagCounters.overnumbered),
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
  /** Without it, all printings appear price-less and fall back to shortCode order. */
  getPrice?: (p: Printing) => number | null | undefined;
  rarityOrder?: readonly string[];
  /** Also used as every other sort's tiebreaker when supplied, in place of the short code's alphabetical prefix. */
  sets?: readonly SetOrderInfo[];
}

export function sortCards(
  printings: Printing[],
  sortBy: SortOption,
  options: SortCardsOptions = {},
): Printing[] {
  const dir: 1 | -1 = options.sortDir === "desc" ? -1 : 1;
  const byId = idComparator(options.sets);
  if (sortBy === "name") {
    // Decorated first so composing the display name doesn't rebuild it O(n log n) times.
    return printings
      .map((printing) => ({ printing, name: legendDisplayName(printing.card) }))
      .sort((a, b) => dir * a.name.localeCompare(b.name) || byId(a.printing, b.printing))
      .map((entry) => entry.printing);
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
