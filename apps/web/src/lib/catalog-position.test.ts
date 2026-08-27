import { describe, expect, it } from "vitest";

import { compareCatalogPosition } from "@/lib/catalog-position";

describe("compareCatalogPosition", () => {
  it("orders by set before card number", () => {
    const early = { setIndex: 0, shortCode: "FND-249" };
    const late = { setIndex: 1, shortCode: "OGN-001" };
    expect(compareCatalogPosition(early, late)).toBeLessThan(0);
    expect(compareCatalogPosition(late, early)).toBeGreaterThan(0);
  });

  it("orders zero-padded numbers numerically within a set", () => {
    const sorted = [
      { setIndex: 1, shortCode: "OGN-010" },
      { setIndex: 1, shortCode: "OGN-002" },
      { setIndex: 1, shortCode: "OGN-100" },
    ].toSorted(compareCatalogPosition);
    expect(sorted.map((position) => position.shortCode)).toEqual(["OGN-002", "OGN-010", "OGN-100"]);
  });

  it("treats an identical position as equal", () => {
    const position = { setIndex: 2, shortCode: "UNL-007" };
    expect(compareCatalogPosition(position, { ...position })).toBe(0);
  });
});
