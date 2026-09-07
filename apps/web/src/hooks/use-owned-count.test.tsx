import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { Finish } from "@openrift/shared/types/enums";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { stubCopy } from "@/test/factories";

import type { OwnedBreakdownVariant } from "./use-owned-count";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      // oxlint-disable-next-line react/function-component-definition -- mocked server-fn handler, not a component
      handler: () => async () => null,
      middleware: () => chain,
      validator: () => chain,
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = { server: () => chain };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApi: vi.fn(),
  fetchApiJson: vi.fn(),
}));

vi.mock("@/lib/server-fns/middleware", () => ({
  withCookies: () => {},
}));

const {
  aggregateByVariant,
  aggregateDeckBuildingCounts,
  aggregateScopedCount,
  aggregateScopedTotals,
  useOwnedCountFor,
  useOwnedCountsForPrintings,
} = await import("./use-owned-count");

const v1: OwnedBreakdownVariant = { id: "p1", shortCode: "OGN-001", finish: "normal" as Finish };
const v2: OwnedBreakdownVariant = { id: "p2", shortCode: "OGN-001p", finish: "foil" as Finish };

function copy(printingId: string, collectionId: string, onLoan = false): CopyResponse {
  return stubCopy({
    id: `${printingId}-${collectionId}-${Math.random()}`,
    printingId,
    collectionId,
    onLoan,
  });
}

function groupCopy(printingId: string, collectionId: string, groupId: string): CopyResponse {
  return stubCopy({
    id: `${printingId}-${collectionId}-${Math.random()}`,
    printingId,
    collectionId,
    groupId,
  });
}

const NAME_MAP = new Map([
  ["c-import", "RiftCore Import"],
  ["c-inbox", "Inbox"],
]);

describe("aggregateByVariant", () => {
  it("buckets copies per variant and sums per collection", () => {
    const copies = [
      copy("p1", "c-import"),
      copy("p1", "c-import"),
      copy("p1", "c-import"),
      copy("p1", "c-import"),
      copy("p1", "c-import"),
      copy("p1", "c-import"),
      copy("p2", "c-inbox"),
      copy("p2", "c-inbox"),
    ];
    const result = aggregateByVariant(copies, [v1, v2], NAME_MAP);
    expect(result).toEqual([
      {
        printingId: "p1",
        shortCode: "OGN-001",
        finish: "normal",
        collections: [{ collectionId: "c-import", collectionName: "RiftCore Import", count: 6 }],
      },
      {
        printingId: "p2",
        shortCode: "OGN-001p",
        finish: "foil",
        collections: [{ collectionId: "c-inbox", collectionName: "Inbox", count: 2 }],
      },
    ]);
  });

  it("preserves variant input order even when copy order is mixed", () => {
    const copies = [copy("p2", "c-inbox"), copy("p1", "c-import")];
    const result = aggregateByVariant(copies, [v1, v2], NAME_MAP);
    expect(result.map((entry) => entry.printingId)).toEqual(["p1", "p2"]);
  });

  it("drops variants with no owned copies", () => {
    const copies = [copy("p1", "c-import")];
    const result = aggregateByVariant(copies, [v1, v2], NAME_MAP);
    expect(result.map((entry) => entry.printingId)).toEqual(["p1"]);
  });

  it("ignores copies whose printingId is not in the variant set", () => {
    const copies = [copy("p1", "c-import"), copy("p-other", "c-import")];
    const result = aggregateByVariant(copies, [v1], NAME_MAP);
    expect(result).toEqual([
      {
        printingId: "p1",
        shortCode: "OGN-001",
        finish: "normal",
        collections: [{ collectionId: "c-import", collectionName: "RiftCore Import", count: 1 }],
      },
    ]);
  });

  it("falls back to empty collection name when not in the name map", () => {
    const copies = [copy("p1", "c-unknown")];
    const result = aggregateByVariant(copies, [v1], new Map());
    expect(result[0]?.collections[0]?.collectionName).toBe("");
  });

  it("returns an empty array when no variants are provided", () => {
    expect(aggregateByVariant([copy("p1", "c-import")], [], NAME_MAP)).toEqual([]);
  });

  it("skips group copies when no collection is being viewed", () => {
    const copies = [groupCopy("p1", "c-group", "g1"), copy("p2", "c-inbox")];

    const result = aggregateByVariant(copies, [v1, v2], NAME_MAP);

    expect(result.map((entry) => entry.printingId)).toEqual(["p2"]);
  });

  it("counts group copies that sit in the viewed collection", () => {
    const copies = [
      groupCopy("p1", "c-group", "g1"),
      groupCopy("p1", "c-group", "g1"),
      groupCopy("p2", "c-group", "g1"),
    ];

    const result = aggregateByVariant(copies, [v1, v2], NAME_MAP, "c-group");

    expect(result).toEqual([
      {
        printingId: "p1",
        shortCode: "OGN-001",
        finish: "normal",
        collections: [{ collectionId: "c-group", collectionName: "", count: 2 }],
      },
      {
        printingId: "p2",
        shortCode: "OGN-001p",
        finish: "foil",
        collections: [{ collectionId: "c-group", collectionName: "", count: 1 }],
      },
    ]);
  });

  it("still skips group copies held in another group collection", () => {
    const copies = [groupCopy("p1", "c-group", "g1"), groupCopy("p1", "c-other-group", "g2")];

    const result = aggregateByVariant(copies, [v1], NAME_MAP, "c-group");

    expect(result[0]?.collections).toEqual([
      { collectionId: "c-group", collectionName: "", count: 1 },
    ]);
  });
});

describe("aggregateScopedCount", () => {
  it("returns the global count for both fields when no collectionId is given", () => {
    const copies = [copy("p1", "c-a"), copy("p1", "c-b"), copy("p1", "c-b")];
    expect(aggregateScopedCount(copies)).toEqual({ count: 3, totalCount: 3 });
  });

  it("restricts count to the requested collection while totalCount stays global", () => {
    const copies = [copy("p1", "c-a"), copy("p1", "c-b"), copy("p1", "c-b")];
    expect(aggregateScopedCount(copies, "c-b")).toEqual({ count: 2, totalCount: 3 });
  });

  it("returns count=0 when the requested collection has no copies", () => {
    const copies = [copy("p1", "c-a"), copy("p1", "c-a")];
    expect(aggregateScopedCount(copies, "c-elsewhere")).toEqual({ count: 0, totalCount: 2 });
  });
});

describe("aggregateScopedTotals", () => {
  const printingIds = ["p1", "p2"] as const;

  it("returns identical scoped and global totals when no collectionId is given", () => {
    const copies = [copy("p1", "c-a"), copy("p2", "c-b"), copy("p2", "c-b")];
    expect(aggregateScopedTotals(copies, printingIds)).toEqual({
      totals: { p1: 1, p2: 2 },
      total: 3,
      allTotals: { p1: 1, p2: 2 },
      allTotal: 3,
    });
  });

  it("restricts per-printing totals to the requested collection while allTotals stay global", () => {
    const copies = [
      copy("p1", "c-a"),
      copy("p1", "c-b"),
      copy("p2", "c-a"),
      copy("p2", "c-a"),
      copy("p2", "c-b"),
    ];
    expect(aggregateScopedTotals(copies, printingIds, "c-a")).toEqual({
      totals: { p1: 1, p2: 2 },
      total: 3,
      allTotals: { p1: 2, p2: 3 },
      allTotal: 5,
    });
  });

  it("ignores copies whose printingId is not in the requested set when summing total/allTotal", () => {
    const copies = [
      copy("p1", "c-a"),
      copy("p2", "c-a"),
      copy("p-other", "c-a"),
      copy("p-other", "c-b"),
    ];
    const result = aggregateScopedTotals(copies, printingIds, "c-a");
    expect(result.total).toBe(2);
    expect(result.allTotal).toBe(2);
    expect(result.allTotals["p-other"]).toBe(2);
  });
});

describe("aggregateDeckBuildingCounts", () => {
  it("counts copies in available collections as available, not locked", () => {
    const copies = [copy("p1", "c-playset"), copy("p1", "c-playset"), copy("p2", "c-playset")];
    const availability = new Map([["c-playset", true]]);
    expect(aggregateDeckBuildingCounts(copies, availability)).toEqual({
      available: { p1: 2, p2: 1 },
      locked: {},
      lockedLoaned: {},
      lockedReserved: {},
      lockedExcluded: {},
    });
  });

  it("buckets on-loan copies as locked even in available collections", () => {
    const copies = [copy("p1", "c-playset"), copy("p1", "c-playset", true)];
    const availability = new Map([["c-playset", true]]);
    expect(aggregateDeckBuildingCounts(copies, availability)).toEqual({
      available: { p1: 1 },
      locked: { p1: 1 },
      lockedLoaned: { p1: 1 },
      lockedReserved: {},
      lockedExcluded: {},
    });
  });

  it("buckets reserved copies as locked even in available collections, matching the server's buildable-stock count", () => {
    const copies = [
      copy("p1", "c-playset"),
      stubCopy({ printingId: "p1", collectionId: "c-playset", reserved: true }),
    ];
    const availability = new Map([["c-playset", true]]);
    expect(aggregateDeckBuildingCounts(copies, availability)).toEqual({
      available: { p1: 1 },
      locked: { p1: 1 },
      lockedLoaned: {},
      lockedReserved: { p1: 1 },
      lockedExcluded: {},
    });
  });

  it("buckets copies in excluded collections as locked, never available", () => {
    const copies = [copy("p1", "c-unl"), copy("p1", "c-unl"), copy("p2", "c-unl")];
    const availability = new Map([["c-unl", false]]);
    expect(aggregateDeckBuildingCounts(copies, availability)).toEqual({
      available: {},
      locked: { p1: 2, p2: 1 },
      lockedLoaned: {},
      lockedReserved: {},
      lockedExcluded: { p1: 2, p2: 1 },
    });
  });

  it("splits copies of the same printing across available and excluded collections", () => {
    const copies = [copy("p1", "c-main"), copy("p1", "c-unl"), copy("p1", "c-unl")];
    const availability = new Map([
      ["c-main", true],
      ["c-unl", false],
    ]);
    expect(aggregateDeckBuildingCounts(copies, availability)).toEqual({
      available: { p1: 1 },
      locked: { p1: 2 },
      lockedLoaned: {},
      lockedReserved: {},
      lockedExcluded: { p1: 2 },
    });
  });

  it("defaults to available when the collection is unknown (stale cache / create race)", () => {
    const copies = [copy("p1", "c-missing")];
    expect(aggregateDeckBuildingCounts(copies, new Map())).toEqual({
      available: { p1: 1 },
      locked: {},
      lockedLoaned: {},
      lockedReserved: {},
      lockedExcluded: {},
    });
  });

  it("never locks group copies the viewer hasn't opted into — they're not the viewer's", () => {
    const copies = [groupCopy("p1", "c-group", "g1")];
    const availability = new Map([["c-group", false]]);
    expect(aggregateDeckBuildingCounts(copies, availability)).toEqual({
      available: {},
      locked: {},
      lockedLoaned: {},
      lockedReserved: {},
      lockedExcluded: {},
    });
  });

  it("counts opted-in group copies as available", () => {
    const copies = [groupCopy("p1", "c-group", "g1")];
    const availability = new Map([["c-group", true]]);
    expect(aggregateDeckBuildingCounts(copies, availability)).toEqual({
      available: { p1: 1 },
      locked: {},
      lockedLoaned: {},
      lockedReserved: {},
      lockedExcluded: {},
    });
  });

  it("splits locked copies into per-reason buckets when multiple reasons apply to the same printing", () => {
    const copies = [
      copy("p1", "c-playset", true),
      stubCopy({ printingId: "p1", collectionId: "c-playset", reserved: true }),
      copy("p1", "c-unl"),
    ];
    const availability = new Map([
      ["c-playset", true],
      ["c-unl", false],
    ]);
    expect(aggregateDeckBuildingCounts(copies, availability)).toEqual({
      available: {},
      locked: { p1: 3 },
      lockedLoaned: { p1: 1 },
      lockedReserved: { p1: 1 },
      lockedExcluded: { p1: 1 },
    });
  });
});

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("per-printing owned-count hooks tolerate an unauthenticated session", () => {
  it("useOwnedCountFor returns undefined when disabled", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOwnedCountFor("p1", false), {
      wrapper: wrap(client),
    });
    expect(result.current.data).toBeUndefined();
  });

  it("useOwnedCountFor returns undefined when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOwnedCountFor("p1", true), {
      wrapper: wrap(client),
    });
    expect(result.current.data).toBeUndefined();
  });

  it("useOwnedCountsForPrintings returns undefined when disabled", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOwnedCountsForPrintings(["p1", "p2"], false), {
      wrapper: wrap(client),
    });
    expect(result.current.data).toBeUndefined();
  });

  it("useOwnedCountsForPrintings returns undefined when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOwnedCountsForPrintings(["p1", "p2"], true), {
      wrapper: wrap(client),
    });
    expect(result.current.data).toBeUndefined();
  });
});
