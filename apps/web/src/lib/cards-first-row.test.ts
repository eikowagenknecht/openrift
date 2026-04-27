import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
} from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { extractFirstRow } from "./cards-first-row";

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
    setId: "set-1",
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    images: [
      {
        face: "front",
        full: "https://cdn.test/front-full.webp",
        thumbnail: "https://cdn.test/front-400w.webp",
      },
    ],
    artist: "Test Artist",
    publicCode: "ogn-001",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    language: "EN",
    comment: null,
    canonicalRank: 0,
    ...overrides,
  };
}

function makeCatalog(
  cards: Record<string, CatalogResponseCardValue>,
  printings: Record<string, CatalogResponsePrintingValue>,
): CatalogResponse {
  return { sets: [], cards, printings, totalCopies: 0 };
}

describe("extractFirstRow", () => {
  it("sorts printings by canonicalRank ascending", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-c": makePrinting({ canonicalRank: 30 }),
      "p-a": makePrinting({ canonicalRank: 10 }),
      "p-b": makePrinting({ canonicalRank: 20 }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("excludes battlefields (landscape orientation)", () => {
    const cards = {
      "unit-card": makeCard({ type: "Unit" }),
      "bf-card": makeCard({ type: "Battlefield" }),
    };
    const printings = {
      "p-bf": makePrinting({ cardId: "bf-card", canonicalRank: 1 }),
      "p-unit": makePrinting({ cardId: "unit-card", canonicalRank: 2 }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-unit"]);
  });

  it("falls back to the first image when no front face exists", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-1": makePrinting({
        images: [
          {
            face: "back",
            full: "https://cdn.test/back-full.webp",
            thumbnail: "https://cdn.test/back-400w.webp",
          },
        ],
      }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
    expect(result).toHaveLength(1);
    expect(result[0]?.thumbnail).toBe("https://cdn.test/back-400w.webp");
    expect(result[0]?.full).toBe("https://cdn.test/back-full.webp");
  });

  it("caps results at the requested limit", () => {
    const cards = { "card-1": makeCard() };
    const printings: Record<string, CatalogResponsePrintingValue> = {};
    for (let i = 0; i < 20; i++) {
      printings[`p-${i}`] = makePrinting({ canonicalRank: i });
    }
    const result = extractFirstRow(makeCatalog(cards, printings), 12);
    expect(result).toHaveLength(12);
    expect(result.map((r) => r.printingId)).toEqual(Array.from({ length: 12 }, (_, i) => `p-${i}`));
  });

  it("returns an empty array for an empty catalog", () => {
    expect(extractFirstRow(makeCatalog({}, {}), 12)).toEqual([]);
  });

  it("skips printings with no images at all", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-noimg": makePrinting({ images: [], canonicalRank: 1 }),
      "p-img": makePrinting({ canonicalRank: 2 }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-img"]);
  });

  it("returns the slim shape with name pulled from the card", () => {
    const cards = { "card-1": makeCard({ name: "Garen, the Might of Demacia" }) };
    const printings = { "p-1": makePrinting() };
    const [card] = extractFirstRow(makeCatalog(cards, printings), 1);
    expect(card).toEqual({
      printingId: "p-1",
      cardName: "Garen, the Might of Demacia",
      thumbnail: "https://cdn.test/front-400w.webp",
      full: "https://cdn.test/front-full.webp",
    });
  });
});
