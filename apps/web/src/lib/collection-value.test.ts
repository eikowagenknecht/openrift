import type { CollectionResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { aggregatePersonalCollectionValue } from "./collection-value";

/**
 * Minimal CollectionResponse builder — only the fields this helper reads matter.
 * @returns A complete CollectionResponse with overrides applied.
 */
function col(overrides: Partial<CollectionResponse> = {}): CollectionResponse {
  return {
    id: "c1",
    name: "Collection",
    description: null,
    availableForDeckbuilding: true,
    sidebarHidden: false,
    isInbox: false,
    sortOrder: 0,
    isPublic: false,
    shareToken: null,
    copyCount: 0,
    totalValueCents: 0,
    unpricedCopyCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    groupId: null,
    groupSlug: null,
    groupName: null,
    viewerCanAdmin: true,
    ...overrides,
  };
}

describe("aggregatePersonalCollectionValue", () => {
  it("returns zero for an empty list", () => {
    expect(aggregatePersonalCollectionValue([])).toEqual({ valueCents: 0, unpricedCount: 0 });
  });

  it("sums value and unpriced count across personal collections", () => {
    const result = aggregatePersonalCollectionValue([
      col({ totalValueCents: 1000, unpricedCopyCount: 2 }),
      col({ totalValueCents: 500, unpricedCopyCount: 1 }),
    ]);
    expect(result).toEqual({ valueCents: 1500, unpricedCount: 3 });
  });

  it("excludes shared group collections from the aggregate", () => {
    const result = aggregatePersonalCollectionValue([
      col({ totalValueCents: 1000, unpricedCopyCount: 2 }),
      col({ groupId: "g1", totalValueCents: 54_772, unpricedCopyCount: 5 }),
    ]);
    expect(result).toEqual({ valueCents: 1000, unpricedCount: 2 });
  });

  it("reports zero when the only remaining value is in group collections (cleared personal cards)", () => {
    // Regression: an emptied personal collection must not show group worth.
    const result = aggregatePersonalCollectionValue([
      col({ totalValueCents: 0, unpricedCopyCount: 0 }),
      col({ groupId: "g1", totalValueCents: 54_772, unpricedCopyCount: 3 }),
    ]);
    expect(result).toEqual({ valueCents: 0, unpricedCount: 0 });
  });

  it("treats null value and unpriced count as zero", () => {
    const result = aggregatePersonalCollectionValue([
      col({ totalValueCents: null, unpricedCopyCount: null }),
      col({ totalValueCents: 250, unpricedCopyCount: 4 }),
    ]);
    expect(result).toEqual({ valueCents: 250, unpricedCount: 4 });
  });
});
