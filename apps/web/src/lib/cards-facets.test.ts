import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
  EnumOrders,
  PricesResponse,
  Printing,
} from "@openrift/shared";
import { getAvailableFilters, priceLookupFromMap } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  extractAvailableLanguages,
  extractCardCounts,
  extractCatalogFacets,
  extractSetLabels,
} from "./cards-facets";
import { enrichCatalog } from "./catalog-query";
import type { FilterSearch } from "./search-schemas";

function makeSet(id: string, slug: string): CatalogSetResponse {
  return { id, slug, name: slug, releasedAt: null, released: true, setType: "main" };
}

function makeCard(overrides: Partial<CatalogResponseCardValue> = {}): CatalogResponseCardValue {
  return {
    slug: "test-card",
    name: "Test Card",
    type: "Unit",
    superTypes: [],
    domains: [],
    might: null,
    energy: null,
    power: null,
    keywords: [],
    tags: [],
    mightBonus: null,
    errata: null,
    bans: [],
    ...overrides,
  };
}

function makePrinting(
  overrides: Partial<CatalogResponsePrintingValue> = {},
): CatalogResponsePrintingValue {
  return {
    cardId: "card-1",
    shortCode: "OGN-001",
    setId: "set-ogn",
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    images: [{ face: "front", imageId: "019d6c25-b081-74b3-a901-64da4ae0aaaa" }],
    artist: "Test Artist",
    publicCode: "ogn-001",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    language: "EN",
    comment: null,
    canonicalRank: 0,
    ...overrides,
  };
}

function makeCatalog(
  cards: Record<string, CatalogResponseCardValue>,
  printings: Record<string, CatalogResponsePrintingValue>,
  sets: CatalogSetResponse[] = [makeSet("set-ogn", "OGN")],
): CatalogResponse {
  return { sets, cards, printings, totalCopies: 0 };
}

const ORDERS: EnumOrders = {
  finishes: ["normal", "foil"],
  rarities: ["Common", "Uncommon", "Rare", "Mythic"],
  domains: ["body", "mind", "calm"],
  cardTypes: ["Unit", "Spell", "Battlefield"],
  superTypes: [],
  artVariants: ["normal", "alternate"],
};

const NO_PRICES: PricesResponse = { prices: {} };

describe("extractCatalogFacets", () => {
  it("returns facets shape derived from the catalog", () => {
    const cards = {
      "card-1": makeCard({ type: "Unit", domains: ["body"], might: 3, energy: 2, power: 4 }),
      "card-2": makeCard({ type: "Spell", domains: ["mind"], might: null, energy: 5, power: null }),
    };
    const printings = {
      "p-1": makePrinting({ cardId: "card-1", rarity: "Common", finish: "normal" }),
      "p-2": makePrinting({
        cardId: "card-2",
        rarity: "Rare",
        finish: "foil",
        shortCode: "OGN-002",
      }),
    };
    const facets = extractCatalogFacets(makeCatalog(cards, printings), NO_PRICES, ORDERS);

    expect(facets.sets).toEqual(["OGN"]);
    expect(facets.types).toEqual(["Spell", "Unit"]);
    expect(facets.domains).toEqual(["body", "mind"]);
    expect(facets.rarities).toEqual(["Common", "Rare"]);
    expect(facets.finishes).toEqual(["normal", "foil"]);
    expect(facets.energy).toEqual({ min: 2, max: 5 });
    expect(facets.might).toEqual({ min: 3, max: 3 });
    expect(facets.power).toEqual({ min: 4, max: 4 });
    expect(facets.hasNullMight).toBe(true);
    expect(facets.hasNullPower).toBe(true);
    expect(facets.hasNullEnergy).toBe(false);
  });

  it("computes price range from the cardtrader marketplace, ignoring others", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-1": makePrinting({ shortCode: "OGN-001" }),
      "p-2": makePrinting({ shortCode: "OGN-002" }),
      "p-3": makePrinting({ shortCode: "OGN-003" }),
    };
    const prices: PricesResponse = {
      prices: {
        "p-1": { cardtrader: 1.5, tcgplayer: 999, cardmarket: 50 },
        "p-2": { cardtrader: 12.3 },
        "p-3": { tcgplayer: 7.5 },
      },
    };
    const facets = extractCatalogFacets(makeCatalog(cards, printings), prices, ORDERS);

    // boundsOf snaps min down and max up to whole numbers.
    expect(facets.price).toEqual({ min: 1, max: 13 });
  });

  it("returns a zero price range when prices map is empty", () => {
    const cards = { "card-1": makeCard() };
    const printings = { "p-1": makePrinting() };
    const facets = extractCatalogFacets(makeCatalog(cards, printings), NO_PRICES, ORDERS);

    expect(facets.price).toEqual({ min: 0, max: 0 });
  });

  it("returns empty facets for an empty catalog", () => {
    const facets = extractCatalogFacets(makeCatalog({}, {}, []), NO_PRICES, ORDERS);

    expect(facets.sets).toEqual([]);
    expect(facets.types).toEqual([]);
    expect(facets.rarities).toEqual([]);
    expect(facets.energy).toEqual({ min: 0, max: 0 });
    expect(facets.might).toEqual({ min: 0, max: 0 });
    expect(facets.power).toEqual({ min: 0, max: 0 });
    expect(facets.price).toEqual({ min: 0, max: 0 });
  });
});

describe("extractAvailableLanguages", () => {
  it("returns the unique set of printing languages", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-en": makePrinting({ language: "EN", shortCode: "OGN-001" }),
      "p-en-2": makePrinting({ language: "EN", shortCode: "OGN-002" }),
      "p-de": makePrinting({ language: "DE", shortCode: "OGN-003" }),
      "p-ja": makePrinting({ language: "JA", shortCode: "OGN-004" }),
    };
    const languages = extractAvailableLanguages(makeCatalog(cards, printings));

    expect(languages.toSorted()).toEqual(["DE", "EN", "JA"]);
  });

  it("returns an empty array for an empty catalog", () => {
    expect(extractAvailableLanguages(makeCatalog({}, {}, []))).toEqual([]);
  });
});

describe("extractSetLabels", () => {
  it("maps set slugs to their display names", () => {
    const sets = [
      makeSet("set-ogn", "OGN"),
      {
        id: "set-arc",
        slug: "ARC",
        name: "Arcanum",
        releasedAt: null,
        released: true,
        setType: "main" as const,
      },
    ];
    const catalog = makeCatalog({}, {}, sets);

    expect(extractSetLabels(catalog)).toEqual({ OGN: "OGN", ARC: "Arcanum" });
  });
});

describe("extractCardCounts", () => {
  const emptySearch: FilterSearch = {};

  it("counts unique card ids in cards view (default)", () => {
    const cards = { "card-1": makeCard(), "card-2": makeCard() };
    const printings = {
      "p-1": makePrinting({ cardId: "card-1", shortCode: "OGN-001" }),
      "p-2": makePrinting({ cardId: "card-1", shortCode: "OGN-002" }),
      "p-3": makePrinting({ cardId: "card-2", shortCode: "OGN-003" }),
    };
    const counts = extractCardCounts(makeCatalog(cards, printings), NO_PRICES, emptySearch);

    expect(counts).toEqual({ totalCards: 2, filteredCount: 2 });
  });

  it("counts every printing when view=printings", () => {
    const cards = { "card-1": makeCard(), "card-2": makeCard() };
    const printings = {
      "p-1": makePrinting({ cardId: "card-1", shortCode: "OGN-001" }),
      "p-2": makePrinting({ cardId: "card-1", shortCode: "OGN-002" }),
      "p-3": makePrinting({ cardId: "card-2", shortCode: "OGN-003" }),
    };
    const counts = extractCardCounts(makeCatalog(cards, printings), NO_PRICES, {
      view: "printings",
    });

    expect(counts).toEqual({ totalCards: 3, filteredCount: 3 });
  });

  it("filteredCount drops when URL filters narrow the catalog", () => {
    const cards = {
      "card-unit": makeCard({ type: "Unit" }),
      "card-spell": makeCard({ type: "Spell" }),
    };
    const printings = {
      "p-1": makePrinting({ cardId: "card-unit", shortCode: "OGN-001" }),
      "p-2": makePrinting({ cardId: "card-spell", shortCode: "OGN-002" }),
    };
    const counts = extractCardCounts(makeCatalog(cards, printings), NO_PRICES, {
      types: ["Unit"],
    });

    expect(counts).toEqual({ totalCards: 2, filteredCount: 1 });
  });
});

// Pins `extractCatalogFacets` to the contract "= getAvailableFilters over
// `enrichCatalog(catalog).allPrintings` with cardtrader-priced getPrice."
// `useCardData` makes the equivalent call client-side with
// `favoriteMarketplace = marketplaceOrder[0] ?? "cardtrader"`, so for a
// default-marketplace user the SSR shell and the hydrated CardBrowser see
// identical facets — no slider snap, no chip-list reorder. If anyone tweaks
// one path without the other, this test fails.
describe("extractCatalogFacets ↔ useCardData parity", () => {
  it("returns the same value the client-side path computes for default-marketplace users", () => {
    const cards = {
      "card-unit": makeCard({
        type: "Unit",
        domains: ["body", "mind"],
        might: 4,
        energy: 3,
        power: 5,
        superTypes: ["Champion"],
      }),
      "card-spell": makeCard({
        type: "Spell",
        domains: ["calm"],
        might: null,
        energy: 1,
        power: null,
      }),
    };
    const printings = {
      "p-unit-c": makePrinting({
        cardId: "card-unit",
        shortCode: "OGN-001",
        rarity: "Common",
        finish: "normal",
      }),
      "p-unit-r-foil": makePrinting({
        cardId: "card-unit",
        shortCode: "OGN-001*",
        rarity: "Rare",
        finish: "foil",
        artVariant: "alternate",
        isSigned: true,
      }),
      "p-spell": makePrinting({
        cardId: "card-spell",
        shortCode: "OGN-002",
        rarity: "Uncommon",
        finish: "normal",
      }),
    };
    const sets = [
      makeSet("set-ogn", "OGN"),
      {
        id: "set-supp",
        slug: "SUPP",
        name: "Supplemental",
        releasedAt: null,
        released: true,
        setType: "supplemental" as const,
      },
    ];
    const catalog = makeCatalog(cards, printings, sets);
    const prices: PricesResponse = {
      prices: {
        "p-unit-c": { cardtrader: 0.5, tcgplayer: 99 },
        "p-unit-r-foil": { cardtrader: 12.4, cardmarket: 100 },
        "p-spell": { cardtrader: 2.1 },
      },
    };

    const ssrFacets = extractCatalogFacets(catalog, prices, ORDERS);

    // Replicate the client path exactly: same enrichment, same args, same
    // marketplace ("cardtrader" matches `extractCatalogFacets`'s default).
    const enriched = enrichCatalog(catalog);
    const lookup = priceLookupFromMap(prices.prices);
    const getPrice = (printing: Printing) => lookup.get(printing.id, "cardtrader");
    const clientFacets = getAvailableFilters(enriched.allPrintings, {
      orders: ORDERS,
      sets: enriched.sets,
      getPrice,
    });

    expect(ssrFacets).toEqual(clientFacets);
  });

  it("matches even with an empty catalog", () => {
    const catalog = makeCatalog({}, {}, []);
    const ssrFacets = extractCatalogFacets(catalog, NO_PRICES, ORDERS);
    const enriched = enrichCatalog(catalog);
    const clientFacets = getAvailableFilters(enriched.allPrintings, {
      orders: ORDERS,
      sets: enriched.sets,
      getPrice: () => undefined,
    });
    expect(ssrFacets).toEqual(clientFacets);
  });
});
