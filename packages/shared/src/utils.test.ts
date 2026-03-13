import { describe, expect, it } from "bun:test";

import { boundsOf, buildPrintingId, unique } from "./utils";

describe("unique", () => {
  it("returns empty array for empty input", () => {
    expect(unique([])).toEqual([]);
  });

  it("preserves insertion order of first occurrences", () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it("returns same elements when no duplicates", () => {
    expect(unique(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("deduplicates strings", () => {
    expect(unique(["foo", "bar", "foo", "baz", "bar"])).toEqual(["foo", "bar", "baz"]);
  });

  it("handles single-element array", () => {
    expect(unique([42])).toEqual([42]);
  });
});

describe("buildPrintingId", () => {
  it("builds ID for a normal non-signed non-promo card", () => {
    expect(buildPrintingId("OGN-001", "normal", false, false, "normal")).toBe(
      "OGN-001:normal:::normal",
    );
  });

  it("includes signed flag", () => {
    expect(buildPrintingId("OGN-001", "normal", true, false, "normal")).toBe(
      "OGN-001:normal:signed::normal",
    );
  });

  it("includes promo flag", () => {
    expect(buildPrintingId("OGN-001", "normal", false, true, "foil")).toBe(
      "OGN-001:normal::promo:foil",
    );
  });

  it("includes both signed and promo flags", () => {
    expect(buildPrintingId("SFD-010", "altart", true, true, "foil")).toBe(
      "SFD-010:altart:signed:promo:foil",
    );
  });

  it("handles overnumbered art variant", () => {
    expect(buildPrintingId("OGN-105", "overnumbered", false, false, "normal")).toBe(
      "OGN-105:overnumbered:::normal",
    );
  });
});

describe("boundsOf", () => {
  it("returns { min: 0, max: 0 } for empty array", () => {
    expect(boundsOf([])).toEqual({ min: 0, max: 0 });
  });

  it("returns same value for single integer element", () => {
    expect(boundsOf([5])).toEqual({ min: 5, max: 5 });
  });

  it("finds min and max across multiple values", () => {
    expect(boundsOf([3, 1, 7, 2])).toEqual({ min: 1, max: 7 });
  });

  it("floors min and ceils max for fractional values", () => {
    expect(boundsOf([2.3, 5.7])).toEqual({ min: 2, max: 6 });
  });

  it("handles negative values", () => {
    expect(boundsOf([-3.5, 2.1])).toEqual({ min: -4, max: 3 });
  });

  it("handles all-equal values", () => {
    expect(boundsOf([4, 4, 4])).toEqual({ min: 4, max: 4 });
  });

  it("floors and ceils a single fractional value", () => {
    expect(boundsOf([3.5])).toEqual({ min: 3, max: 4 });
  });
});
