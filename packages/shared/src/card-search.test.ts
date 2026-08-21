import { describe, expect, it } from "vitest";

import type { SearchableCard, SearchablePrintingCodes } from "./card-search.js";
import { buildCardIndex, findCard, searchCards } from "./card-search.js";

const cards: SearchableCard[] = [
  { id: "c1", slug: "jinx-rebel", name: "Jinx, Rebel" },
  { id: "c2", slug: "jinx-loose-cannon", name: "Jinx, Loose Cannon" },
  { id: "c3", slug: "dorans-shield", name: "Doran’s Shield" },
  { id: "c4", slug: "mecha-jinx", name: "Mecha Jinx" },
  { id: "c5", slug: "viktor", name: "Viktor" },
  { id: "c7", slug: "annie-dark-child", name: "Annie, Dark Child" },
];

const printingsByCardId = new Map<string, SearchablePrintingCodes[]>([
  ["c1", [{ shortCode: "OGN-202", publicCode: "OGN-202/298" }]],
  ["c5", [{ shortCode: "OGN-045", publicCode: "OGN-045/298" }]],
]);

function indexFor(list: SearchableCard[] = cards) {
  return buildCardIndex(list, printingsByCardId);
}

const index = indexFor();

describe("searchCards", () => {
  it("puts an exact match before prefix and substring matches", () => {
    const results = searchCards(
      indexFor([...cards, { id: "c6", slug: "jinx", name: "Jinx" }]),
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

  it("ranks a word-boundary hit above a mid-word one", () => {
    const results = searchCards(
      indexFor([
        { id: "m1", slug: "unjinxed", name: "Unjinxed" },
        { id: "m2", slug: "mecha-jinx", name: "Mecha Jinx" },
      ]),
      "jinx",
      10,
    );
    expect(results.map((c) => c.slug)).toEqual(["mecha-jinx", "unjinxed"]);
  });

  it("matches every token regardless of the order they were typed in", () => {
    expect(searchCards(index, "dark annie", 10).map((c) => c.slug)).toEqual(["annie-dark-child"]);
    expect(searchCards(index, "child annie", 10).map((c) => c.slug)).toEqual(["annie-dark-child"]);
  });

  it("ranks a contiguous match above an out-of-order one", () => {
    const results = searchCards(
      indexFor([
        { id: "t1", slug: "dark-annie", name: "Dark Annie" },
        { id: "t2", slug: "annie-dark-child", name: "Annie, Dark Child" },
      ]),
      "dark annie",
      10,
    );
    expect(results.map((c) => c.slug)).toEqual(["dark-annie", "annie-dark-child"]);
  });

  it("lets one token match a name and another a printing code", () => {
    expect(searchCards(index, "rebel ogn202", 10).map((c) => c.id)).toEqual(["c1"]);
  });

  it("still requires every token to match", () => {
    expect(searchCards(index, "annie teemo", 10)).toEqual([]);
  });

  it("matches a printing code as a substring", () => {
    expect(searchCards(index, "202", 10).map((c) => c.id)).toEqual(["c1"]);
  });

  it("keeps the caller's richer card type on the way out", () => {
    const richIndex = buildCardIndex(
      [{ id: "c5", slug: "viktor", name: "Viktor", energy: 3 }],
      printingsByCardId,
    );
    expect(searchCards(richIndex, "viktor", 1)[0]?.energy).toBe(3);
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
