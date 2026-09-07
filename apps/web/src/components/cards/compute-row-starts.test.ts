import { describe, expect, it } from "vitest";

import type { VRow } from "./card-grid-types";
import { computeRowStarts } from "./compute-row-starts";

function headerRow(): VRow {
  return { kind: "header", group: { id: "g", slug: "g", name: "G" }, cardCount: 0 };
}

function cardsRow(): VRow {
  return { kind: "cards", items: [], cardsBefore: 0 };
}

describe("computeRowStarts", () => {
  it("returns an empty array for no rows", () => {
    expect(computeRowStarts([], () => 10, 0)).toEqual([]);
  });

  it("starts the first row at 0", () => {
    const starts = computeRowStarts([cardsRow()], () => 56, 0);
    expect(starts).toEqual([0]);
  });

  it("accumulates fixed row heights with no gap", () => {
    const rows = [cardsRow(), cardsRow(), cardsRow()];
    expect(computeRowStarts(rows, () => 56, 0)).toEqual([0, 56, 112]);
  });

  it("adds the gap between rows but not before the first", () => {
    const rows = [cardsRow(), cardsRow(), cardsRow()];
    expect(computeRowStarts(rows, () => 100, 16)).toEqual([0, 116, 232]);
  });

  it("uses the per-index estimator so header and card rows can differ", () => {
    const rows = [headerRow(), cardsRow(), headerRow(), cardsRow()];
    const estimate = (index: number) => (rows[index]!.kind === "header" ? 48 : 56);
    expect(computeRowStarts(rows, estimate, 0)).toEqual([0, 48, 104, 152]);
  });
});
