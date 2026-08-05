import { describe, expect, it } from "vitest";

import { computeFilterCounts, filterCards } from "./filters";
import type { FilterCounts } from "./filters";
import type { Card, CardFilters, FilterRange, PresenceDimension, Printing } from "./types";
import { EMPTY_CARD_FILTERS, NONE, PRESENCE_DIMENSIONS } from "./types";
import { boundsOf } from "./utils";

// ---------------------------------------------------------------------------
// Reference implementation: the original computeFilterCounts, which faceted by
// re-running filterCards once per dimension (27 passes). The production
// implementation is a single-pass bitmask scan; this test pins the two to
// identical output over a randomized catalog and a broad scenario matrix.
// ---------------------------------------------------------------------------

interface RefOptions {
  countBy: "printing" | "card";
  keywordReverseMap?: Map<string, string>;
  getPrice?: (printing: Printing) => number | undefined;
  customTagAssignments?: Record<string, readonly string[]>;
}

interface RefCountableDimension {
  key: Exclude<keyof FilterCounts, "flags" | "ranges" | "presence">;
  filterField: keyof CardFilters;
  excludeField?: keyof CardFilters;
  values: (printing: Printing) => readonly string[];
}

const REF_DIMENSIONS: readonly RefCountableDimension[] = [
  { key: "sets", filterField: "sets", excludeField: "setsExclude", values: (p) => [p.setSlug] },
  {
    key: "languages",
    filterField: "languages",
    excludeField: "languagesExclude",
    values: (p) => [p.language],
  },
  {
    key: "domains",
    filterField: "domains",
    excludeField: "domainsExclude",
    values: (p) => p.card.domains,
  },
  { key: "types", filterField: "types", excludeField: "typesExclude", values: (p) => p.card.types },
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
    values: (p) => [p.rarity],
  },
  {
    key: "artVariants",
    filterField: "artVariants",
    excludeField: "artVariantsExclude",
    values: (p) => [p.artVariant || "normal"],
  },
  {
    key: "finishes",
    filterField: "finishes",
    excludeField: "finishesExclude",
    values: (p) => [p.finish],
  },
  { key: "cardSizes", filterField: "cardSizes", values: (p) => [p.size] },
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
  { key: "tags", filterField: "tags", excludeField: "tagsExclude", values: (p) => p.card.tags },
];

const REF_FLAGS = [
  { key: "signed", filterField: "isSigned" },
  { key: "banned", filterField: "isBanned" },
  { key: "errata", filterField: "hasErrata" },
  { key: "standard", filterField: "isStandard" },
] as const;

const REF_PRESENCE_VALUE_FIELDS: Record<
  PresenceDimension,
  { include?: keyof CardFilters; exclude?: keyof CardFilters }
> = {
  markers: { include: "markerSlugs", exclude: "markerSlugsExclude" },
  superTypes: { include: "superTypes", exclude: "superTypesExclude" },
  customTags: { include: "customTagSlugs", exclude: "customTagSlugsExclude" },
  distributionChannels: {
    include: "distributionChannelSlugs",
    exclude: "distributionChannelSlugsExclude",
  },
  keywords: {},
  tags: { include: "tags", exclude: "tagsExclude" },
};

function refPresenceValues(
  printing: Printing,
  customTagSlugs: readonly string[],
): Record<PresenceDimension, readonly string[]> {
  return {
    markers: printing.markers.map((m) => m.slug),
    superTypes: printing.card.superTypes.filter((superType) => superType !== "basic"),
    customTags: customTagSlugs,
    distributionChannels: printing.distributionChannels.map((dc) => dc.channel.slug),
    keywords: printing.card.keywords,
    tags: printing.card.tags,
  };
}

function refCountMatches(matched: Printing[], countBy: "printing" | "card"): number {
  if (countBy === "card") {
    return new Set(matched.map((p) => p.cardId)).size;
  }
  return matched.length;
}

const REF_EMPTY_RANGE: FilterRange = { min: null, max: null };

function referenceComputeFilterCounts(
  printings: Printing[],
  filters: CardFilters,
  options: RefOptions,
): FilterCounts {
  const result = {
    flags: { signed: 0, banned: 0, errata: 0, standard: 0 },
    presence: {
      markers: { any: 0, none: 0 },
      superTypes: { any: 0, none: 0 },
      customTags: { any: 0, none: 0 },
      distributionChannels: { any: 0, none: 0 },
      keywords: { any: 0, none: 0 },
      tags: { any: 0, none: 0 },
    },
    ranges: {
      energy: { min: 0, max: 0, hasNullStat: false },
      might: { min: 0, max: 0, hasNullStat: false },
      power: { min: 0, max: 0, hasNullStat: false },
      price: { min: 0, max: 0 },
    },
  } as FilterCounts;
  for (const dim of REF_DIMENSIONS) {
    const filtersWithoutDim = {
      ...filters,
      [dim.filterField]: [],
      ...(dim.excludeField ? { [dim.excludeField]: [] } : {}),
    };
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
  for (const { key, filterField } of REF_FLAGS) {
    const targetValue = filters[filterField] !== false;
    const matched = filterCards(printings, { ...filters, [filterField]: targetValue }, options);
    result.flags[key] = refCountMatches(matched, options.countBy);
  }
  for (const dimension of PRESENCE_DIMENSIONS) {
    const valueFields = REF_PRESENCE_VALUE_FIELDS[dimension];
    const cleared: CardFilters = {
      ...filters,
      presence: { ...filters.presence, [dimension]: undefined },
      ...(valueFields.include ? { [valueFields.include]: [] } : {}),
      ...(valueFields.exclude ? { [valueFields.exclude]: [] } : {}),
    };
    const matched = filterCards(printings, cleared, options);
    const withValue: Printing[] = [];
    const withoutValue: Printing[] = [];
    for (const printing of matched) {
      const customTagSlugs = options.customTagAssignments?.[printing.cardId] ?? [];
      const values = refPresenceValues(printing, customTagSlugs)[dimension];
      (values.length > 0 ? withValue : withoutValue).push(printing);
    }
    result.presence[dimension] = {
      any: refCountMatches(withValue, options.countBy),
      none: refCountMatches(withoutValue, options.countBy),
    };
  }
  const statDims: { key: "energy" | "might" | "power"; pick: (p: Printing) => number | null }[] = [
    { key: "energy", pick: (p) => p.card.energy },
    { key: "might", pick: (p) => p.card.might },
    { key: "power", pick: (p) => p.card.power },
  ];
  for (const { key, pick } of statDims) {
    const matched = filterCards(printings, { ...filters, [key]: REF_EMPTY_RANGE }, options);
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
    const matchedForPrice = filterCards(printings, { ...filters, price: REF_EMPTY_RANGE }, options);
    const priceGetter = options.getPrice;
    const prices = matchedForPrice.flatMap((p) => {
      const price = priceGetter(p);
      return price === undefined ? [] : [price];
    });
    result.ranges.price = boundsOf(prices);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Randomized catalog fixture (seeded — deterministic across runs)
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49_297) % 233_280;
    return s / 233_280;
  };
}

function pickOne<T>(arr: readonly T[], r: () => number): T {
  const value = arr[Math.floor(r() * arr.length)];
  if (value === undefined) {
    throw new Error("pickOne() from empty array");
  }
  return value;
}

const SETS = ["OGN", "SFD", "PRM"];
const LANGUAGES = ["EN", "DE", "FR"];
const DOMAINS = ["fury", "calm", "mind", "body", "chaos", "order"];
const TYPES = ["unit", "spell", "gear", "battlefield", "legend"];
const SUPER_TYPES = [[], ["champion"], ["basic"], ["basic", "token"]] as const;
const RARITIES = ["common", "uncommon", "rare", "epic", "showcase"];
const ART_VARIANTS = ["normal", "altart", "ultimate"];
const FINISHES = ["normal", "foil", "metal"];
const SIZES = ["standard", "oversized"];
const KEYWORDS = [["Shield"], ["Deflect", "Tank"], [], ["Accelerate"]] as const;
const TAGS = [["Warrior"], ["Dragon", "Noxus"], [], ["Yordle"]] as const;
function marker(slug: string): Printing["markers"][number] {
  return { id: `marker-${slug}`, slug, label: slug, description: null };
}
function channelLink(slug: string): Printing["distributionChannels"][number] {
  return {
    channel: {
      id: `channel-${slug}`,
      slug,
      label: slug,
      description: null,
      kind: "event",
      parentId: null,
      childrenLabel: null,
    },
    distributionNote: null,
    ancestorLabels: [],
  };
}
const MARKERS = [[], [], [marker("stamp")], [marker("galaxy")]];
const CHANNELS = [[], [], [channelLink("store-champ")], [channelLink("prerelease")]];

function buildCatalog(count: number): { printings: Printing[]; prices: WeakMap<Printing, number> } {
  const r = seededRandom(1337);
  const prices = new WeakMap<Printing, number>();
  const printings: Printing[] = [];
  const cardCount = Math.floor(count / 3);
  const cards: Card[] = Array.from({ length: cardCount }, (_, i) => {
    const type = pickOne(TYPES, r);
    return {
      slug: `card-${i}`,
      name: `Card ${i} ${pickOne(["Dragon", "Hero", "Ghost", "Knight"], r)}`,
      type,
      types: [type],
      superTypes: [...pickOne(SUPER_TYPES, r)],
      domains: [pickOne(DOMAINS, r), ...(r() > 0.7 ? [pickOne(DOMAINS, r)] : [])],
      energy: r() > 0.15 ? Math.floor(r() * 9) : null,
      might: r() > 0.4 ? Math.floor(r() * 10) : null,
      power: r() > 0.4 ? Math.floor(r() * 7) : null,
      keywords: [...pickOne(KEYWORDS, r)],
      tags: [...pickOne(TAGS, r)],
      mightBonus: 0,
      maxCopiesOverride: null,
      errata: r() > 0.9 ? { correctedRulesText: "Fixed.", correctedEffectText: null } : null,
      bans:
        r() > 0.92
          ? [{ formatId: "fmt-1", formatName: "Standard", bannedAt: "2026-01-01", reason: null }]
          : [],
    } as Card;
  });
  for (let i = 0; i < count; i++) {
    const card = cards[i % cardCount] as Card;
    const set = pickOne(SETS, r);
    const printing = {
      id: `printing-${i}`,
      cardId: `card-${i % cardCount}`,
      shortCode: `${set}-${String(i).padStart(3, "0")}`,
      setId: `set-${set}`,
      setSlug: set,
      setReleased: true,
      rarity: pickOne(RARITIES, r),
      artVariant: pickOne(ART_VARIANTS, r),
      isSigned: r() > 0.93,
      markers: pickOne(MARKERS, r),
      distributionChannels: pickOne(CHANNELS, r),
      finish: pickOne(FINISHES, r),
      size: pickOne(SIZES, r),
      images: [],
      artist: "Artist",
      publicCode: `pub-${i}`,
      printedRulesText: null,
      printedEffectText: null,
      flavorText: r() > 0.7 ? "A whisper of the rift." : null,
      printedName: null,
      printedYear: null,
      comment: null,
      language: pickOne(LANGUAGES, r),
      canonicalRank: i,
      card,
    } as Printing;
    if (r() > 0.3) {
      prices.set(printing, Math.round(r() * 5000) / 100);
    }
    printings.push(printing);
  }
  return { printings, prices };
}

const { printings: CATALOG, prices: PRICES } = buildCatalog(300);
const getPrice = (p: Printing): number | undefined => PRICES.get(p);

const CUSTOM_TAGS: Record<string, readonly string[]> = Object.fromEntries(
  CATALOG.filter((_, i) => i % 7 === 0).map((p) => [p.cardId, ["combo", "staple"]]),
);

function makeFilters(overrides: Partial<CardFilters>): CardFilters {
  return { ...EMPTY_CARD_FILTERS, ...overrides };
}

// ---------------------------------------------------------------------------
// Scenario matrix
// ---------------------------------------------------------------------------

const SCENARIOS: Record<string, CardFilters> = {
  "no filters": makeFilters({}),
  "one include": makeFilters({ rarities: ["rare"] }),
  "multi include across dims": makeFilters({
    rarities: ["rare", "epic"],
    sets: ["OGN"],
    domains: ["fury"],
    languages: ["EN"],
  }),
  "two domains (subset rule)": makeFilters({ domains: ["fury", "calm"] }),
  excludes: makeFilters({
    raritiesExclude: ["common"],
    setsExclude: ["PRM"],
    typesExclude: ["gear"],
    languagesExclude: ["FR"],
  }),
  "include + exclude same dim": makeFilters({
    rarities: ["rare", "epic"],
    raritiesExclude: ["epic"],
  }),
  "markers and channels": makeFilters({
    markerSlugs: ["stamp"],
    distributionChannelSlugsExclude: ["prerelease"],
  }),
  "keywords / tags": makeFilters({ keywords: ["Shield"], tagsExclude: ["Dragon"] }),
  "presence any/none": makeFilters({
    presence: { markers: "any", keywords: "none", tags: undefined },
  }),
  "presence + value filter same dim": makeFilters({
    presence: { markers: "any" },
    markerSlugs: ["galaxy"],
  }),
  "flags true": makeFilters({ isSigned: true, isStandard: true }),
  "flags false": makeFilters({ isSigned: false, hasErrata: false, isBanned: false }),
  ranges: makeFilters({ energy: { min: 2, max: 6 }, might: { min: 0, max: 5 } }),
  "range with NONE sentinel": makeFilters({ power: { min: NONE, max: NONE } }),
  "price range": makeFilters({ price: { min: 1, max: 30 } }),
  search: makeFilters({ search: "dragon", searchScope: ["name"] }),
  "search with prefix": makeFilters({ search: "n:dragon t:unit", searchScope: ["name"] }),
  "custom tags": makeFilters({ customTagSlugs: ["combo"] }),
  "kitchen sink": makeFilters({
    search: "card",
    searchScope: ["name"],
    sets: ["OGN", "SFD"],
    raritiesExclude: ["common"],
    domains: ["fury", "mind"],
    presence: { keywords: "any" },
    isStandard: true,
    energy: { min: 1, max: 7 },
    price: { min: 0, max: 40 },
  }),
};

describe("computeFilterCounts single-pass equivalence", () => {
  for (const countBy of ["printing", "card"] as const) {
    describe(`countBy=${countBy}`, () => {
      for (const [name, scenario] of Object.entries(SCENARIOS)) {
        it(name, () => {
          const options = {
            countBy,
            getPrice,
            customTagAssignments: CUSTOM_TAGS,
          };
          const actual = computeFilterCounts(CATALOG, scenario, options);
          const expected = referenceComputeFilterCounts(CATALOG, scenario, options);
          expect(actual).toEqual(expected);
        });
      }

      it("without getPrice, price bounds stay zero and price filter matches only null", () => {
        const scenario = makeFilters({ price: { min: NONE, max: NONE } });
        const options = { countBy };
        const actual = computeFilterCounts(CATALOG, scenario, options);
        const expected = referenceComputeFilterCounts(CATALOG, scenario, options);
        expect(actual).toEqual(expected);
      });
    });
  }

  it("backfills dimensions missing from persisted filters (ADR-034 jsonb hydration)", () => {
    // A rule saved before newer dimensions existed lacks those keys entirely.
    const legacy = { sets: ["OGN"], rarities: [] } as unknown as CardFilters;
    const options = { countBy: "printing" as const };
    const actual = computeFilterCounts(CATALOG, legacy, options);
    const expected = referenceComputeFilterCounts(
      CATALOG,
      { ...EMPTY_CARD_FILTERS, ...legacy },
      options,
    );
    expect(actual).toEqual(expected);
  });
});
