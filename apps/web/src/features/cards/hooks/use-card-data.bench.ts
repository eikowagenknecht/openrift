// Benchmark: current JS filter/sort path vs. TanStack DB query-builder path.
// Measures whether migrating /cards filter+sort logic onto TanStack DB
// introduces a perceptible regression for the filter-toggle workload
// (query-changing, data-stable — the worst case for live-query dataflow).

import { filterCards } from "@openrift/shared/filters";
import { sortCards } from "@openrift/shared/filters-sort";
import type { CatalogSetResponse } from "@openrift/shared/types/api/catalog";
import type { Card, Printing } from "@openrift/shared/types/catalog";
import type { CardFilters } from "@openrift/shared/types/search";
import { EMPTY_CARD_FILTERS } from "@openrift/shared/types/search";
import {
  and,
  createCollection,
  gte,
  ilike,
  inArray,
  localOnlyCollectionOptions,
  lte,
  queryOnce,
} from "@tanstack/react-db";
import { test } from "vitest";

const SET_COUNT = 7;
const CARD_COUNT = 771;
const PRINTING_COUNT = 2916;

const RARITIES = ["common", "uncommon", "rare", "legendary"] as const;
const DOMAINS = ["chaos", "order", "fury", "calm"] as const;
const TYPES = ["unit", "spell", "gear", "battlefield"] as const;
const LANGUAGES = ["EN", "DE", "FR", "ES"] as const;
const ART_VARIANTS = ["normal", "alternate", "borderless"] as const;
const FINISHES = ["normal", "foil"] as const;
const KEYWORDS_POOL = ["slam", "mighty", "swift", "fragile", "loyal", "deft"];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49_297) % 233_280;
    return s / 233_280;
  };
}

function pick<T>(arr: readonly T[], r: () => number): T {
  const value = arr[Math.floor(r() * arr.length)];
  if (value === undefined) {
    throw new Error("pick() from empty array");
  }
  return value;
}

function buildFixture() {
  const r = seededRandom(42);

  const sets: CatalogSetResponse[] = Array.from({ length: SET_COUNT }, (_, i) => ({
    id: `set-${i}`,
    slug: `SET${i + 1}`,
    name: `Test Set ${i + 1}`,
    releases: {},
    setType: i < 5 ? "main" : "supplemental",
  }));

  const cards: (Card & { id: string })[] = Array.from({ length: CARD_COUNT }, (_, i) => {
    const type = pick(TYPES, r);
    return {
      id: `card-${i}`,
      slug: `card-${i}`,
      name: `Card ${i} ${pick(["Hero", "Rebel", "Ghost", "Knight", "Sage"], r)}`,
      type,
      types: [type],
      superTypes: r() > 0.8 ? ["champion"] : [],
      domains: [pick(DOMAINS, r), ...(r() > 0.7 ? [pick(DOMAINS, r)] : [])],
      tokenCardIds: [],
      might: Math.floor(r() * 10) - 1,
      energy: Math.floor(r() * 8) + 1,
      power: r() > 0.5 ? Math.floor(r() * 6) : null,
      keywords: r() > 0.5 ? [pick(KEYWORDS_POOL, r)] : [],
      tags: [],
      mightBonus: null,
      maxCopiesOverride: null,
      errata: null,
      bans: [],
    };
  });

  const printings: Printing[] = Array.from({ length: PRINTING_COUNT }, (_, i) => {
    const card = cards[i % CARD_COUNT];
    const set = sets[Math.floor(r() * SET_COUNT)];
    if (!card || !set) {
      throw new Error("fixture indexing out of range");
    }
    return {
      id: `printing-${i}`,
      cardId: card.id,
      shortCode: `${set.slug}-${String(i).padStart(3, "0")}`,
      setId: set.id,
      setSlug: set.slug,
      setReleased: true,
      rarity: pick(RARITIES, r),
      artVariant: pick(ART_VARIANTS, r),
      isSigned: r() > 0.9,
      isOvernumbered: false,
      markers: [],
      distributionChannels: [],
      finish: pick(FINISHES, r),
      size: "standard",
      images: [],
      artist: "Synthetic",
      publicCode: `synth-${i}`,
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      printedName: null,
      printedYear: null,
      comment: null,
      language: pick(LANGUAGES, r),
      canonicalRank: i + 1,
      card,
    };
  });

  return { sets, cards, printings };
}

const fixture = buildFixture();

function emptyFilters(): CardFilters {
  return { ...EMPTY_CARD_FILTERS };
}

const SCENARIOS = {
  noop: emptyFilters(),
  simple: {
    ...emptyFilters(),
    domains: ["chaos"],
    energy: { min: 2, max: 5 },
    rarities: ["common", "rare"],
  } as CardFilters,
  complex: {
    ...emptyFilters(),
    search: "hero",
    searchScope: ["name"],
    domains: ["chaos", "order"],
    energy: { min: 2, max: 6 },
    might: { min: 0, max: 5 },
    rarities: ["common", "rare", "legendary"],
    languages: ["EN"],
    types: ["unit"],
  } as CardFilters,
};

const printingsCollection = createCollection(
  localOnlyCollectionOptions<Printing>({
    getKey: (p) => p.id,
    initialData: fixture.printings,
  }),
);

function runTanstackQuery(filters: CardFilters) {
  return queryOnce({
    query: (q) => {
      let builder = q.from({ p: printingsCollection });
      if (filters.rarities.length > 0) {
        builder = builder.where(({ p }) => inArray(p.rarity, filters.rarities));
      }
      if (filters.domains.length > 0) {
        const [firstDomain] = filters.domains;
        if (firstDomain) {
          builder = builder.where(({ p }) => inArray(firstDomain, p.card.domains));
        }
      }
      if (filters.types.length > 0) {
        builder = builder.where(({ p }) => inArray(p.card.type, filters.types));
      }
      if (filters.languages.length > 0) {
        builder = builder.where(({ p }) => inArray(p.language, filters.languages));
      }
      if (filters.energy.min !== null && filters.energy.max !== null) {
        builder = builder.where(({ p }) =>
          and(gte(p.card.energy, filters.energy.min), lte(p.card.energy, filters.energy.max)),
        );
      }
      if (filters.might.min !== null && filters.might.max !== null) {
        builder = builder.where(({ p }) =>
          and(gte(p.card.might, filters.might.min), lte(p.card.might, filters.might.max)),
        );
      }
      if (filters.search) {
        const pattern = `%${filters.search}%`;
        builder = builder.where(({ p }) => ilike(p.card.name, pattern));
      }
      return builder.orderBy(({ p }) => p.card.name);
    },
  });
}

test("filter+sort: current JS path", async ({ bench }) => {
  await bench.compare(
    bench("noop", () => {
      const f = filterCards(fixture.printings, SCENARIOS.noop);
      sortCards(f, "name", { sortDir: "asc" });
    }),
    bench("simple", () => {
      const f = filterCards(fixture.printings, SCENARIOS.simple);
      sortCards(f, "name", { sortDir: "asc" });
    }),
    bench("complex", () => {
      const f = filterCards(fixture.printings, SCENARIOS.complex);
      sortCards(f, "name", { sortDir: "asc" });
    }),
  );
});

test("filter+sort: TanStack DB queryOnce path", async ({ bench }) => {
  await bench.compare(
    bench("noop", async () => {
      await runTanstackQuery(SCENARIOS.noop);
    }),
    bench("simple", async () => {
      await runTanstackQuery(SCENARIOS.simple);
    }),
    bench("complex", async () => {
      await runTanstackQuery(SCENARIOS.complex);
    }),
  );
});
