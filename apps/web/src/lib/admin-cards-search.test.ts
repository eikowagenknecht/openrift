import { describe, expect, it } from "vitest";

import { filterCardsBySet, parseSortParam, stringifySort } from "./admin-cards-search";

describe("parseSortParam", () => {
  it("returns empty state for undefined", () => {
    expect(parseSortParam(undefined)).toEqual([]);
  });

  it("returns empty state for empty string", () => {
    expect(parseSortParam("")).toEqual([]);
  });

  it("parses ascending sort", () => {
    expect(parseSortParam("name:asc")).toEqual([{ id: "name", desc: false }]);
  });

  it("parses descending sort", () => {
    expect(parseSortParam("name:desc")).toEqual([{ id: "name", desc: true }]);
  });

  it("treats missing direction as ascending", () => {
    expect(parseSortParam("name")).toEqual([{ id: "name", desc: false }]);
  });

  it("treats unknown direction as ascending", () => {
    expect(parseSortParam("name:sideways")).toEqual([{ id: "name", desc: false }]);
  });
});

describe("stringifySort", () => {
  it("returns undefined for empty state", () => {
    expect(stringifySort([])).toBeUndefined();
  });

  it("serializes ascending sort", () => {
    expect(stringifySort([{ id: "name", desc: false }])).toBe("name:asc");
  });

  it("serializes descending sort", () => {
    expect(stringifySort([{ id: "name", desc: true }])).toBe("name:desc");
  });

  it("uses only the first entry for multi-sort states", () => {
    expect(
      stringifySort([
        { id: "name", desc: false },
        { id: "printings", desc: true },
      ]),
    ).toBe("name:asc");
  });
});

describe("round-trip", () => {
  it("preserves sort state through stringify and parse", () => {
    const original = [{ id: "marketplaces", desc: true }];
    expect(parseSortParam(stringifySort(original))).toEqual(original);
  });
});

describe("filterCardsBySet", () => {
  const rows = [
    { cardSlug: "jinx" },
    { cardSlug: "viktor" },
    { cardSlug: "annie" },
    { cardSlug: null },
  ];
  const setSlugsByCardSlug = new Map([
    ["jinx", ["ogn", "unleashed"]],
    ["viktor", ["ogn"]],
    ["annie", ["unleashed"]],
  ]);

  it("returns the input unchanged when no set filter is active", () => {
    expect(filterCardsBySet(rows, undefined, setSlugsByCardSlug)).toEqual(rows);
  });

  it("keeps only cards whose setSlugs include the active set", () => {
    // Regression: /admin/cards?set=unleashed must actually narrow the list.
    const filtered = filterCardsBySet(rows, "unleashed", setSlugsByCardSlug);
    expect(filtered.map((r) => r.cardSlug)).toEqual(["jinx", "annie"]);
  });

  it("keeps reprint cards that appear in multiple sets", () => {
    // Jinx is in both OGN and Unleashed; filtering by OGN must still find her.
    const filtered = filterCardsBySet(rows, "ogn", setSlugsByCardSlug);
    expect(filtered.map((r) => r.cardSlug)).toEqual(["jinx", "viktor"]);
  });

  it("excludes rows without a cardSlug (candidates)", () => {
    const filtered = filterCardsBySet(rows, "unleashed", setSlugsByCardSlug);
    expect(filtered.some((r) => r.cardSlug === null)).toBe(false);
  });

  it("returns an empty array when no card belongs to the set", () => {
    expect(filterCardsBySet(rows, "mystery-set", setSlugsByCardSlug)).toEqual([]);
  });

  it("returns an empty array for a card whose slug is missing from the map", () => {
    const sparseMap = new Map([["jinx", ["unleashed"]]]);
    const filtered = filterCardsBySet(rows, "unleashed", sparseMap);
    expect(filtered.map((r) => r.cardSlug)).toEqual(["jinx"]);
  });
});
