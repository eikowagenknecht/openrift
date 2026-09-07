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
    { id: "jinx", setSlugs: ["ogn", "unleashed"] },
    { id: "viktor", setSlugs: ["ogn"] },
    { id: "annie", setSlugs: ["unleashed"] },
    { id: "no-set", setSlugs: [] },
  ];

  it("returns the input unchanged when no set filter is active", () => {
    expect(filterCardsBySet(rows, undefined)).toEqual(rows);
  });

  it("keeps only rows whose setSlugs include the active set", () => {
    const filtered = filterCardsBySet(rows, "unleashed");
    expect(filtered.map((r) => r.id)).toEqual(["jinx", "annie"]);
  });

  it("keeps reprint rows that appear in multiple sets", () => {
    const filtered = filterCardsBySet(rows, "ogn");
    expect(filtered.map((r) => r.id)).toEqual(["jinx", "viktor"]);
  });

  it("narrows candidates by their pending set slugs", () => {
    const candidates = [
      { cardSlug: null, setSlugs: ["ven"] },
      { cardSlug: null, setSlugs: ["ogn"] },
    ];
    const filtered = filterCardsBySet(candidates, "ven");
    expect(filtered).toEqual([{ cardSlug: null, setSlugs: ["ven"] }]);
  });

  it("drops rows with no set slugs when a filter is active", () => {
    const filtered = filterCardsBySet(rows, "unleashed");
    expect(filtered.some((r) => r.id === "no-set")).toBe(false);
  });

  it("returns an empty array when no row belongs to the set", () => {
    expect(filterCardsBySet(rows, "mystery-set")).toEqual([]);
  });
});
