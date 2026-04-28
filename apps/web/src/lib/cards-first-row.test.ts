import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
} from "@openrift/shared";
import { describe, expect, it } from "vitest";

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

describe("extractFirstRow", () => {
  it("iterates sets in catalog.sets order before sorting by shortCode within a set", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-arc": makePrinting({ shortCode: "ARC-001", setId: "set-arc" }),
      "p-ogn": makePrinting({ shortCode: "OGN-005", setId: "set-ogn" }),
    };
    const sets = [makeSet("set-ogn", "OGN"), makeSet("set-arc", "ARC")];
    const result = extractFirstRow(makeCatalog(cards, printings, sets), 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-ogn", "p-arc"]);
  });

  it("sorts by shortCode (locale-compare ascending) within a set", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-c": makePrinting({ shortCode: "OGN-003" }),
      "p-a": makePrinting({ shortCode: "OGN-001" }),
      "p-b": makePrinting({ shortCode: "OGN-002" }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("excludes non-EN printings (the live grid hides them for default users)", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-zh": makePrinting({ shortCode: "OGN-001", language: "ZH", canonicalRank: 1 }),
      "p-en": makePrinting({ shortCode: "OGN-005", language: "EN", canonicalRank: 5 }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-en"]);
  });

  it("does not let an earlier-shortCode non-EN printing displace an EN one", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-de-first": makePrinting({ shortCode: "OGN-001", language: "DE" }),
      "p-en-later": makePrinting({ shortCode: "OGN-002", language: "EN" }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 1);
    expect(result.map((r) => r.printingId)).toEqual(["p-en-later"]);
  });

  it("breaks identical-shortCode ties by canonicalRank", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-2": makePrinting({ shortCode: "OGN-001", canonicalRank: 50 }),
      "p-1": makePrinting({ shortCode: "OGN-001", canonicalRank: 10 }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
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
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
    expect(result.map((r) => r.printingId)).toEqual(["p-unit", "p-bf"]);
  });

  it("falls back to the first image when no front face exists", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-1": makePrinting({
        images: [{ face: "back", imageId: "019d6c25-b081-74b3-a901-64da4ae0bbbb" }],
      }),
    };
    const result = extractFirstRow(makeCatalog(cards, printings), 10);
    expect(result).toHaveLength(1);
    expect(result[0]?.imageId).toBe("019d6c25-b081-74b3-a901-64da4ae0bbbb");
  });

  it("caps results at the requested limit", () => {
    const cards = { "card-1": makeCard() };
    const printings: Record<string, CatalogResponsePrintingValue> = {};
    for (let i = 0; i < 20; i++) {
      printings[`p-${String(i).padStart(3, "0")}`] = makePrinting({
        shortCode: `OGN-${String(i).padStart(3, "0")}`,
      });
    }
    const result = extractFirstRow(makeCatalog(cards, printings), 12);
    expect(result).toHaveLength(12);
    expect(result.map((r) => r.printingId)).toEqual(
      Array.from({ length: 12 }, (_, i) => `p-${String(i).padStart(3, "0")}`),
    );
  });

  it("returns an empty array for an empty catalog", () => {
    expect(extractFirstRow(makeCatalog({}, {}, []), 12)).toEqual([]);
  });

  it("skips printings with no images at all", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-noimg": makePrinting({ shortCode: "OGN-001", images: [] }),
      "p-img": makePrinting({ shortCode: "OGN-002" }),
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
      setSlug: "OGN",
      imageId: "019d6c25-b081-74b3-a901-64da4ae0aaaa",
    });
  });

  it("populates setSlug per-card from the catalog set lookup", () => {
    const cards = { "card-1": makeCard() };
    const printings = {
      "p-arc": makePrinting({ shortCode: "ARC-001", setId: "set-arc" }),
      "p-ogn": makePrinting({ shortCode: "OGN-001", setId: "set-ogn" }),
    };
    const sets = [makeSet("set-ogn", "OGN"), makeSet("set-arc", "ARC")];
    const result = extractFirstRow(makeCatalog(cards, printings, sets), 10);
    expect(result.map((r) => r.setSlug)).toEqual(["OGN", "ARC"]);
  });
});
