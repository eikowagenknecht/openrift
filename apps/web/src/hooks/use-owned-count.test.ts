import type { CopyResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubCopy } from "@/test/factories";

import {
  aggregateDeckBuildingCounts,
  aggregateScopedCount,
  aggregateScopedTotals,
} from "./use-owned-count";

function copy(printingId: string, collectionId: string, groupId: string | null): CopyResponse {
  return stubCopy({ id: `${collectionId}:${printingId}`, printingId, collectionId, groupId });
}

describe("aggregateScopedCount", () => {
  it("excludes group-collection copies from the global owned total", () => {
    const copies = [
      copy("garen", "personal-1", null),
      copy("garen", "personal-1", null),
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

    expect(aggregateScopedCount(copies, "bulkbox")).toEqual({ count: 2, totalCount: 1 });
  });

  it("reports zero owned for a card the viewer holds only inside a group collection", () => {
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
      copy("lux", "bulkbox", "group-1"),
    ];

    const result = aggregateScopedTotals(copies, ["garen", "lux"]);

    expect(result.allTotals).toEqual({ garen: 2 });
    expect(result.allTotal).toBe(2);
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

describe("aggregateDeckBuildingCounts", () => {
  // "red-box" is a deck's home collection: excluded from deck building in
  // general, but the deck stored in it must still see its own cards.
  const availability = new Map([
    ["open-shelf", true],
    ["red-box", false],
    ["blue-box", false],
  ]);

  it("locks copies in an excluded collection when no collection is exempt", () => {
    const copies = [copy("garen", "open-shelf", null), copy("garen", "red-box", null)];

    const result = aggregateDeckBuildingCounts(copies, availability);

    expect(result.available).toEqual({ garen: 1 });
    expect(result.locked).toEqual({ garen: 1 });
    expect(result.lockedExcluded).toEqual({ garen: 1 });
  });

  it("counts copies in the exempt collection as available", () => {
    const copies = [copy("garen", "open-shelf", null), copy("garen", "red-box", null)];

    const result = aggregateDeckBuildingCounts(copies, availability, "red-box");

    expect(result.available).toEqual({ garen: 2 });
    expect(result.locked).toEqual({});
    expect(result.lockedExcluded).toEqual({});
  });

  it("keeps another excluded collection locked", () => {
    const copies = [copy("garen", "red-box", null), copy("garen", "blue-box", null)];

    const result = aggregateDeckBuildingCounts(copies, availability, "red-box");

    expect(result.available).toEqual({ garen: 1 });
    expect(result.lockedExcluded).toEqual({ garen: 1 });
  });

  it("changes nothing when the exempt collection is already available", () => {
    const copies = [copy("garen", "open-shelf", null), copy("garen", "red-box", null)];

    const exempt = aggregateDeckBuildingCounts(copies, availability, "open-shelf");

    expect(exempt).toEqual(aggregateDeckBuildingCounts(copies, availability));
  });

  it("still locks loaned and reserved copies from the exempt collection", () => {
    const copies = [
      stubCopy({ printingId: "garen", collectionId: "red-box", groupId: null, onLoan: true }),
      stubCopy({ printingId: "garen", collectionId: "red-box", groupId: null, reserved: true }),
      copy("garen", "red-box", null),
    ];

    const result = aggregateDeckBuildingCounts(copies, availability, "red-box");

    expect(result.available).toEqual({ garen: 1 });
    expect(result.lockedLoaned).toEqual({ garen: 1 });
    expect(result.lockedReserved).toEqual({ garen: 1 });
    expect(result.lockedExcluded).toEqual({});
  });

  it("treats a null exemption like no exemption", () => {
    const copies = [copy("garen", "red-box", null)];

    const result = aggregateDeckBuildingCounts(copies, availability, null);

    expect(result.available).toEqual({});
    expect(result.lockedExcluded).toEqual({ garen: 1 });
  });

  it("counts a group collection's copies when it is the deck's home box", () => {
    const groupAvailability = new Map([["shared-box", false]]);
    const copies = [copy("garen", "shared-box", "group-1")];

    expect(aggregateDeckBuildingCounts(copies, groupAvailability).available).toEqual({});
    expect(aggregateDeckBuildingCounts(copies, groupAvailability, "shared-box").available).toEqual({
      garen: 1,
    });
  });
});
