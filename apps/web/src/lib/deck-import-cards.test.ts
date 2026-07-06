import { describe, expect, it } from "vitest";

import { dedupeMatchedEntries } from "./deck-import-cards";

function entry(
  cardId: string,
  zone: string,
  quantity: number,
  preferredPrintingId: string | null = null,
) {
  return {
    zone: zone as never,
    entry: { quantity },
    resolvedCard: { cardId, preferredPrintingId },
  };
}

describe("dedupeMatchedEntries", () => {
  it("returns an empty array for no entries", () => {
    expect(dedupeMatchedEntries([])).toEqual([]);
  });

  it("sums quantities for the same card, zone, and printing", () => {
    const result = dedupeMatchedEntries([entry("card-a", "main", 2), entry("card-a", "main", 1)]);
    expect(result).toEqual([
      { cardId: "card-a", zone: "main", quantity: 3, preferredPrintingId: null },
    ]);
  });

  it("keeps distinct rows per zone and per preferred printing", () => {
    const result = dedupeMatchedEntries([
      entry("card-a", "main", 2),
      entry("card-a", "sideboard", 1),
      entry("card-a", "main", 1, "printing-1"),
    ]);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({
      cardId: "card-a",
      zone: "main",
      quantity: 2,
      preferredPrintingId: null,
    });
    expect(result).toContainEqual({
      cardId: "card-a",
      zone: "sideboard",
      quantity: 1,
      preferredPrintingId: null,
    });
    expect(result).toContainEqual({
      cardId: "card-a",
      zone: "main",
      quantity: 1,
      preferredPrintingId: "printing-1",
    });
  });

  it("skips entries without a resolved card", () => {
    const unresolved = { zone: "main" as never, entry: { quantity: 4 }, resolvedCard: null };
    const result = dedupeMatchedEntries([unresolved, entry("card-b", "main", 1)]);
    expect(result).toEqual([
      { cardId: "card-b", zone: "main", quantity: 1, preferredPrintingId: null },
    ]);
  });
});
