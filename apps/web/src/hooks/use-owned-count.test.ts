import type { CopyResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { aggregateScopedCount, aggregateScopedTotals } from "./use-owned-count";

function copy(printingId: string, collectionId: string, groupId: string | null): CopyResponse {
  return { id: `${collectionId}:${printingId}`, printingId, collectionId, groupId };
}

describe("aggregateScopedCount", () => {
  it("excludes group-collection copies from the global owned total", () => {
    const copies = [
      copy("garen", "personal-1", null),
      copy("garen", "personal-1", null),
      // Three copies sitting in a group collection — they belong to the group,
      // not the viewer, so they must not count toward the viewer's owned total.
      copy("garen", "bulkbox", "group-1"),
      copy("garen", "bulkbox", "group-1"),
      copy("garen", "bulkbox", "group-1"),
    ];

    expect(aggregateScopedCount(copies)).toEqual({ count: 2, totalCount: 2 });
  });

  it("counts every copy in a group collection for its in-collection figure but keeps the global total personal-only", () => {
    const copies = [
      copy("garen", "personal-1", null),
      copy("garen", "bulkbox", "group-1"),
      copy("garen", "bulkbox", "group-1"),
    ];

    // Viewing the group collection itself: the in-collection count is the
    // group's two copies; the global total is the viewer's single personal copy.
    expect(aggregateScopedCount(copies, "bulkbox")).toEqual({ count: 2, totalCount: 1 });
  });

  it("reports zero owned for a card the viewer holds only inside a group collection", () => {
    // The crux for the shared-collection owned filter: a card you "have" only
    // because it lives in a group collection reads as None in your personal
    // totals, so it surfaces under "less than a playset".
    const copies = [copy("garen", "bulkbox", "group-1")];

    expect(aggregateScopedCount(copies)).toEqual({ count: 0, totalCount: 0 });
  });
});

describe("aggregateScopedTotals", () => {
  it("builds a personal-only per-printing map, dropping group-only printings", () => {
    const copies = [
      copy("garen", "personal-1", null),
      copy("garen", "personal-1", null),
      copy("garen", "bulkbox", "group-1"),
      // Lux exists for the viewer only inside the group collection.
      copy("lux", "bulkbox", "group-1"),
    ];

    const result = aggregateScopedTotals(copies, ["garen", "lux"]);

    expect(result.allTotals).toEqual({ garen: 2 });
    expect(result.allTotal).toBe(2);
    // No collectionId → scoped totals mirror the personal-only global map.
    expect(result.totals).toEqual(result.allTotals);
  });

  it("scopes per-printing totals to a group collection while keeping the global map personal-only", () => {
    const copies = [
      copy("garen", "personal-1", null),
      copy("garen", "bulkbox", "group-1"),
      copy("lux", "bulkbox", "group-1"),
    ];

    const result = aggregateScopedTotals(copies, ["garen", "lux"], "bulkbox");

    expect(result.totals).toEqual({ garen: 1, lux: 1 });
    expect(result.total).toBe(2);
    expect(result.allTotals).toEqual({ garen: 1 });
    expect(result.allTotal).toBe(1);
  });
});
