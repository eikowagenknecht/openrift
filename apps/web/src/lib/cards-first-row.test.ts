import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
} from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { FilterSearch } from "@/lib/search-schemas";

import { extractFirstRow } from "./cards-first-row";

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

const NO_FILTERS: FilterSearch = {};

describe("extractFirstRow", () => {
  it("iterates sets in catalog.sets order before sorting by shortCode within a set", () => {
    const cards = { "card-a": makeCard(), "card-b": makeCard() };
    const printings = {
      "p-arc": makePrinting({ cardId: "card-a", shortCode: "ARC-001", setId: "set-arc" }),
      "p-ogn": makePrinting({ cardId: "card-b", shortCode: "OGN-005", setId: "set-ogn" }),
    };
    const sets = [makeSet("set-ogn", "OGN"), makeSet("set-arc", "ARC")];
    const result = extractFirstRow(makeCatalog(cards, printings, sets), NO_FILTERS, 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-ogn", "p-arc"]);
  });

  it("sorts by shortCode (locale-compare ascending) within a set", () => {
    const cards = {
      "card-a": makeCard(),
      "card-b": makeCard(),
      "card-c": makeCard(),
    };
    const printings = {
      "p-c": makePrinting({ cardId: "card-c", shortCode: "OGN-003" }),
      "p-a": makePrinting({ cardId: "card-a", shortCode: "OGN-001" }),
      "p-b": makePrinting({ cardId: "card-b", shortCode: "OGN-002" }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("prefers EN over non-EN for the same (cardId, setId) via language-rank dedup", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-zh": makePrinting({ shortCode: "OGN-001", language: "ZH", canonicalRank: 1 }),
      "p-en": makePrinting({ shortCode: "OGN-005", language: "EN", canonicalRank: 5 }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-en"]);
  });

  it("does not let an earlier-shortCode non-EN printing displace an EN one", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-de-first": makePrinting({ shortCode: "OGN-001", language: "DE" }),
      "p-en-later": makePrinting({ shortCode: "OGN-002", language: "EN" }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 1);
    expect(result.map((r) => r.printingId)).toEqual(["p-en-later"]);
  });

  it("breaks identical-shortCode ties by canonicalRank (printings view)", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-2": makePrinting({ shortCode: "OGN-001", canonicalRank: 50 }),
      "p-1": makePrinting({ shortCode: "OGN-001", canonicalRank: 10 }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), { view: "printings" }, 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-1", "p-2"]);
  });

  it("includes battlefields (the live grid shows them too)", () => {
    const cards = {
      "unit-card": makeCard({ type: "Unit" }),
      "bf-card": makeCard({ type: "Battlefield" }),
    };
    const printings = {
      "p-bf": makePrinting({ cardId: "bf-card", shortCode: "OGN-100" }),
      "p-unit": makePrinting({ cardId: "unit-card", shortCode: "OGN-001" }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-unit", "p-bf"]);
  });

  it("falls back to the first image when no front face exists", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-1": makePrinting({
        images: [{ face: "back", imageId: "019d6c25-b081-74b3-a901-64da4ae0bbbb" }],
      }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 10);
    expect(result).toHaveLength(1);
    expect(result[0]?.imageId).toBe("019d6c25-b081-74b3-a901-64da4ae0bbbb");
  });

  it("caps results at the requested limit", () => {
    const cards: Record<string, CatalogResponseCardValue> = {};
    const printings: Record<string, CatalogResponsePrintingValue> = {};
    for (let i = 0; i < 20; i++) {
      const cardId = `card-${String(i).padStart(3, "0")}`;
      cards[cardId] = makeCard();
      printings[`p-${String(i).padStart(3, "0")}`] = makePrinting({
        cardId,
        shortCode: `OGN-${String(i).padStart(3, "0")}`,
      });
    }
    const result = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 12);
    expect(result).toHaveLength(12);
    expect(result.map((r) => r.printingId)).toEqual(
      Array.from({ length: 12 }, (_, i) => `p-${String(i).padStart(3, "0")}`),
    );
  });

  it("returns an empty array for an empty catalog", () => {
    expect(extractFirstRow(makeCatalog({}, {}, []), NO_FILTERS, 12)).toEqual([]);
  });

  it("skips printings with no images at all", () => {
    const cards = { "card-a": makeCard(), "card-b": makeCard() };
    const printings = {
      "p-noimg": makePrinting({ cardId: "card-a", shortCode: "OGN-001", images: [] }),
      "p-img": makePrinting({ cardId: "card-b", shortCode: "OGN-002" }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-img"]);
  });

  it("returns the slim shape with name pulled from the card", () => {
    const cards = { "card-1": makeCard({ name: "Garen, the Might of Demacia" }) };
    const printings = { "p-1": makePrinting() };
    const [card] = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 1);
    expect(card).toEqual({
      printingId: "p-1",
      cardName: "Garen, the Might of Demacia",
      setSlug: "OGN",
      imageId: "019d6c25-b081-74b3-a901-64da4ae0aaaa",
    });
  });

  it("populates setSlug per-card from the catalog set lookup", () => {
    const cards = { "card-a": makeCard(), "card-b": makeCard() };
    const printings = {
      "p-arc": makePrinting({ cardId: "card-a", shortCode: "ARC-001", setId: "set-arc" }),
      "p-ogn": makePrinting({ cardId: "card-b", shortCode: "OGN-001", setId: "set-ogn" }),
    };
    const sets = [makeSet("set-ogn", "OGN"), makeSet("set-arc", "ARC")];
    const result = extractFirstRow(makeCatalog(cards, printings, sets), NO_FILTERS, 10);
    expect(result.map((r) => r.setSlug)).toEqual(["OGN", "ARC"]);
  });

  describe("cards view (default)", () => {
    it("dedups multiple printings of the same card in the same set to one tile", () => {
      const cards = { "card-1": makeCard() };
      const printings = {
        "p-foil": makePrinting({ shortCode: "OGN-001★", finish: "foil", canonicalRank: 5 }),
        "p-normal": makePrinting({ shortCode: "OGN-001", canonicalRank: 1 }),
        "p-art-variant": makePrinting({
          shortCode: "OGN-001-alt",
          artVariant: "alternate",
          canonicalRank: 3,
        }),
      };
      const result = extractFirstRow(makeCatalog(cards, printings), NO_FILTERS, 10);
      // Earliest in (langRank, canonicalRank) wins: p-normal (canonicalRank 1).
      expect(result.map((r) => r.printingId)).toEqual(["p-normal"]);
    });

    it("keeps separate tiles per (cardId, setId) when the card is reprinted across sets", () => {
      const cards = { "card-1": makeCard() };
      const printings = {
        "p-ogn": makePrinting({ shortCode: "OGN-001", setId: "set-ogn" }),
        "p-arc": makePrinting({ shortCode: "ARC-001", setId: "set-arc" }),
      };
      const sets = [makeSet("set-ogn", "OGN"), makeSet("set-arc", "ARC")];
      const result = extractFirstRow(makeCatalog(cards, printings, sets), NO_FILTERS, 10);
      expect(result.map((r) => r.printingId)).toEqual(["p-ogn", "p-arc"]);
    });

    it("dedups per cardId (not per (cardId, setId)) when groupBy is none", () => {
      const cards = { "card-1": makeCard() };
      const printings = {
        "p-ogn": makePrinting({ shortCode: "OGN-001", setId: "set-ogn", canonicalRank: 1 }),
        "p-arc": makePrinting({ shortCode: "ARC-001", setId: "set-arc", canonicalRank: 5 }),
      };
      const sets = [makeSet("set-ogn", "OGN"), makeSet("set-arc", "ARC")];
      const result = extractFirstRow(makeCatalog(cards, printings, sets), { groupBy: "none" }, 10);
      expect(result.map((r) => r.printingId)).toEqual(["p-ogn"]);
    });
  });

  describe("printings view", () => {
    it("does not dedup — every printing in the same (cardId, setId) renders a tile", () => {
      const cards = { "card-1": makeCard() };
      const printings = {
        "p-foil": makePrinting({ shortCode: "OGN-001★", finish: "foil", canonicalRank: 5 }),
        "p-normal": makePrinting({ shortCode: "OGN-001", canonicalRank: 1 }),
      };
      const result = extractFirstRow(makeCatalog(cards, printings), { view: "printings" }, 10);
      expect(result.map((r) => r.printingId)).toEqual(["p-normal", "p-foil"]);
    });
  });

  describe("URL filter passthrough", () => {
    it("applies the URL search filter so SSR matches the hydrated grid", () => {
      const cards = {
        "card-fury": makeCard({ name: "Fury of the North" }),
        "card-other": makeCard({ name: "Calm Waters" }),
      };
      const printings = {
        "p-fury": makePrinting({ cardId: "card-fury", shortCode: "OGN-001" }),
        "p-other": makePrinting({ cardId: "card-other", shortCode: "OGN-002" }),
      };
      const result = extractFirstRow(makeCatalog(cards, printings), { search: "fury" }, 10);
      expect(result.map((r) => r.printingId)).toEqual(["p-fury"]);
    });

    it("applies the URL languages filter", () => {
      const cards = { "card-a": makeCard(), "card-b": makeCard() };
      const printings = {
        "p-de": makePrinting({ cardId: "card-a", shortCode: "OGN-001", language: "DE" }),
        "p-en": makePrinting({ cardId: "card-b", shortCode: "OGN-002", language: "EN" }),
      };
      const result = extractFirstRow(makeCatalog(cards, printings), { languages: ["EN"] }, 10);
      expect(result.map((r) => r.printingId)).toEqual(["p-en"]);
    });

    it("applies the URL sets filter", () => {
      const cards = { "card-a": makeCard(), "card-b": makeCard() };
      const printings = {
        "p-ogn": makePrinting({ cardId: "card-a", shortCode: "OGN-001", setId: "set-ogn" }),
        "p-arc": makePrinting({ cardId: "card-b", shortCode: "ARC-001", setId: "set-arc" }),
      };
      const sets = [makeSet("set-ogn", "OGN"), makeSet("set-arc", "ARC")];
      const result = extractFirstRow(makeCatalog(cards, printings, sets), { sets: ["ARC"] }, 10);
      expect(result.map((r) => r.printingId)).toEqual(["p-arc"]);
    });
  });
});
