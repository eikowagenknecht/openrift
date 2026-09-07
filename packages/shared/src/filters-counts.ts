import {
  includes,
  matchesCustomTags,
  matchesDistributionChannels,
  matchesDomains,
  matchesMarkers,
  matchesRange,
  noneExcluded,
  notExcluded,
  overlaps,
} from "./filters-predicates.js";
import { matchesSearch, parseSearchTerms } from "./filters-search.js";
import type { BoundsAcc, FilterCardsOptions } from "./filters-shared.js";
import { bumpBounds, EMPTY_STRINGS, readBounds } from "./filters-shared.js";
import { isStandardPrinting } from "./standard.js";
import type { Printing } from "./types/catalog.js";
import type { CardFilters, PresenceDimension } from "./types/search.js";
import { EMPTY_CARD_FILTERS, PRESENCE_DIMENSIONS } from "./types/search.js";
import { WellKnown } from "./well-known.js";

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
