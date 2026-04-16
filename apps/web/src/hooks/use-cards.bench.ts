// Benchmark: useCards() JS-layer cost before vs after the TanStack DB rewire.
//
// Before: one TanStack Query select (enrichCatalog) runs over the raw blob.
// After: three useLiveSuspenseQuery reads + JS join (enrichFromCollections).
//
// This bench isolates the JS enrichment work. It does NOT include the
// one-time collection-setup / dataflow-graph-build cost of useLiveQuery on
// first subscription — that's captured by the earlier queryOnce bench. For
// steady-state re-renders, the JS loop below is the dominant cost.

import type {
  Card,
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
  Printing,
} from "@openrift/shared";
import { bench, describe } from "vitest";

const SET_COUNT = 7;
const CARD_COUNT = 771;
const PRINTING_COUNT = 2916;

const RARITIES = ["common", "uncommon", "rare", "legendary"] as const;
const DOMAINS = ["chaos", "order", "fury", "calm"] as const;
const TYPES = ["unit", "spell", "gear", "battlefield"] as const;
const LANGUAGES = ["EN", "DE", "FR", "ES"] as const;
const ART_VARIANTS = ["normal", "alternate", "borderless"] as const;
const FINISHES = ["normal", "foil"] as const;

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

// Build a raw CatalogResponse (the old fetch shape) and the three array
// slices (the new collection shape) from the same synthetic source.

function buildFixtures() {
  const r = seededRandom(42);

  const sets: CatalogSetResponse[] = Array.from({ length: SET_COUNT }, (_, i) => ({
    id: `set-${i}`,
    slug: `SET${i + 1}`,
    name: `Test Set ${i + 1}`,
    releasedAt: null,
    setType: i < 5 ? "main" : "supplemental",
  }));

  const cardsRecord: Record<string, CatalogResponseCardValue> = {};
  const cardsArray: (Card & { id: string })[] = [];
  for (let i = 0; i < CARD_COUNT; i++) {
    const id = `card-${i}`;
    const card: CatalogResponseCardValue = {
      slug: id,
      name: `Card ${i}`,
      type: pick(TYPES, r),
      superTypes: [],
      domains: [pick(DOMAINS, r)],
      might: Math.floor(r() * 10) - 1,
      energy: Math.floor(r() * 8) + 1,
      power: r() > 0.5 ? Math.floor(r() * 6) : null,
      keywords: [],
      tags: [],
      mightBonus: null,
      errata: null,
      bans: [],
    };
    cardsRecord[id] = card;
    cardsArray.push({ ...card, id });
  }

  const printingsRecord: Record<string, CatalogResponsePrintingValue> = {};
  const printingsArray: (CatalogResponsePrintingValue & { id: string })[] = [];
  for (let i = 0; i < PRINTING_COUNT; i++) {
    const id = `printing-${i}`;
    const cardIdx = i % CARD_COUNT;
    const setIdx = Math.floor(r() * SET_COUNT);
    const printing: CatalogResponsePrintingValue = {
      shortCode: `SET-${String(i).padStart(3, "0")}`,
      setId: `set-${setIdx}`,
      rarity: pick(RARITIES, r),
      artVariant: pick(ART_VARIANTS, r),
      isSigned: false,
      markers: [],
      distributionChannels: [],
      finish: pick(FINISHES, r),
      images: [],
      artist: "Synthetic",
      publicCode: `synth-${i}`,
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      printedName: null,
      language: pick(LANGUAGES, r),
      cardId: `card-${cardIdx}`,
    };
    printingsRecord[id] = printing;
    printingsArray.push({ ...printing, id });
  }

  const rawCatalog: CatalogResponse = {
    sets,
    cards: cardsRecord,
    printings: printingsRecord,
    totalCopies: PRINTING_COUNT,
  };

  return { rawCatalog, sets, cardsArray, printingsArray };
}

const { rawCatalog, sets, cardsArray, printingsArray } = buildFixtures();

// ── Old path: enrichCatalog (the select on catalogQueryOptions pre-spike) ───

function enrichCatalog(catalog: CatalogResponse) {
  const slugById = new Map(catalog.sets.map((s) => [s.id, s.slug]));
  const cardsById: Record<string, Card> = catalog.cards;
  const allPrintings: Printing[] = [];
  const printingsById: Record<string, Printing> = {};
  for (const [id, value] of Object.entries(catalog.printings)) {
    const setSlug = slugById.get(value.setId);
    const card = cardsById[value.cardId];
    if (setSlug && card) {
      const printing: Printing = { ...value, id, setSlug, card };
      allPrintings.push(printing);
      printingsById[id] = printing;
    }
  }
  const printingsByCardId = Map.groupBy(allPrintings, (p) => p.cardId);
  const setOrderMap = new Map(catalog.sets.map((s, i) => [s.id, i]));
  return {
    allPrintings,
    cardsById,
    printingsById,
    printingsByCardId,
    setOrderMap,
    sets: catalog.sets,
  };
}

// ── New path: enrichFromCollections (runs every useCards() call) ────────────

function enrichFromCollections(
  rawPrintings: readonly (CatalogResponsePrintingValue & { id: string })[],
  rawCards: readonly (Card & { id: string })[],
  rawSets: readonly CatalogSetResponse[],
) {
  const slugById = new Map(rawSets.map((s) => [s.id, s.slug]));
  const cardsById: Record<string, Card> = {};
  for (const { id, ...card } of rawCards) {
    cardsById[id] = card;
  }
  const allPrintings: Printing[] = [];
  const printingsById: Record<string, Printing> = {};
  for (const raw of rawPrintings) {
    const setSlug = slugById.get(raw.setId);
    const card = cardsById[raw.cardId];
    if (setSlug && card) {
      const printing: Printing = { ...raw, setSlug, card };
      allPrintings.push(printing);
      printingsById[raw.id] = printing;
    }
  }
  const printingsByCardId = Map.groupBy(allPrintings, (p) => p.cardId);
  const setOrderMap = new Map(rawSets.map((s, i) => [s.id, i]));
  return {
    allPrintings,
    cardsById,
    printingsById,
    printingsByCardId,
    setOrderMap,
    sets: [...rawSets],
  };
}

describe("useCards() JS enrichment cost", () => {
  bench("before: enrichCatalog(rawBlob)", () => {
    enrichCatalog(rawCatalog);
  });

  bench("after: enrichFromCollections(arrays)", () => {
    enrichFromCollections(printingsArray, cardsArray, sets);
  });
});
