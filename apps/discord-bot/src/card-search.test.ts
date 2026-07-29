import { describe, expect, it } from "vitest";

import { buildCardIndex, findCard, searchCards } from "./card-search.js";
import type { CatalogCard, CatalogPrinting } from "./catalog-cache.js";
import { makeCard, makePrinting } from "./test/factories.js";

const cards = [
  makeCard({ id: "c1", slug: "jinx-rebel", name: "Jinx, Rebel" }),
  makeCard({ id: "c2", slug: "jinx-loose-cannon", name: "Jinx, Loose Cannon" }),
  makeCard({ id: "c3", slug: "dorans-shield", name: "Doran’s Shield" }),
  makeCard({ id: "c4", slug: "mecha-jinx", name: "Mecha Jinx" }),
  makeCard({ id: "c5", slug: "viktor", name: "Viktor" }),
];

const printingsByCardId = new Map<string, CatalogPrinting[]>([
  [
    "c1",
    [makePrinting({ id: "p1", cardId: "c1", shortCode: "OGN-202", publicCode: "OGN-202/298" })],
  ],
  [
    "c5",
    [makePrinting({ id: "p5", cardId: "c5", shortCode: "OGN-045", publicCode: "OGN-045/298" })],
  ],
]);

function indexFor(list: CatalogCard[] = cards) {
  return buildCardIndex(list, printingsByCardId);
}

const index = indexFor();

describe("searchCards", () => {
  it("puts an exact match before prefix and substring matches", () => {
    const results = searchCards(
      indexFor([...cards, makeCard({ id: "c6", slug: "jinx", name: "Jinx" })]),
      "jinx",
      10,
    );
    expect(results[0]?.name).toBe("Jinx");
  });

  it("matches printing short codes and public codes, dashes optional", () => {
    expect(searchCards(index, "OGN-202", 10).map((c) => c.id)).toEqual(["c1"]);
    expect(searchCards(index, "ogn202", 10).map((c) => c.id)).toEqual(["c1"]);
    expect(searchCards(index, "ogn202298", 10).map((c) => c.id)).toEqual(["c1"]);
  });

  it("ranks code prefix matches after name prefix matches", () => {
    expect(searchCards(index, "ogn", 10).map((c) => c.id)).toEqual(["c1", "c5"]);
  });

  it("puts prefix matches before substring matches", () => {
    const results = searchCards(index, "jinx", 10);
    expect(results.map((c) => c.name)).toEqual(["Jinx, Loose Cannon", "Jinx, Rebel", "Mecha Jinx"]);
  });

  it("matches case-insensitively", () => {
    expect(searchCards(index, "VIKTOR", 10)).toHaveLength(1);
  });

  it("matches a keyboard apostrophe against the typographic one in card names", () => {
    expect(searchCards(index, "doran's shield", 10).map((c) => c.slug)).toEqual(["dorans-shield"]);
  });

  it("matches with the apostrophe omitted entirely", () => {
    expect(searchCards(index, "dorans", 10).map((c) => c.slug)).toEqual(["dorans-shield"]);
  });

  it("returns empty for a blank or whitespace query", () => {
    expect(searchCards(index, "", 10)).toEqual([]);
    expect(searchCards(index, "   ", 10)).toEqual([]);
  });

  it("returns empty when nothing matches", () => {
    expect(searchCards(index, "teemo", 10)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchCards(index, "jinx", 2)).toHaveLength(2);
  });
});

describe("findCard", () => {
  it("resolves an exact slug directly", () => {
    expect(findCard(index, "jinx-rebel")?.id).toBe("c1");
  });

  it("falls back to the best free-text match", () => {
    expect(findCard(index, "viktor")?.id).toBe("c5");
  });

  it("returns undefined when nothing matches", () => {
    expect(findCard(index, "teemo")).toBeUndefined();
  });
});
