import { describe, expect, it } from "vitest";

import { parseSortParam, stringifySort } from "./admin-cards-search";

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
