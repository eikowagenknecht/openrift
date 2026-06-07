import type { CopyResponse, Finish } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { OwnedBreakdownVariant } from "./use-owned-count";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
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
  aggregateScopedCount,
  aggregateScopedTotals,
  useOwnedCountFor,
  useOwnedCountsForPrintings,
} = await import("./use-owned-count");

const v1: OwnedBreakdownVariant = { id: "p1", shortCode: "OGN-001", finish: "normal" as Finish };
const v2: OwnedBreakdownVariant = { id: "p2", shortCode: "OGN-001p", finish: "foil" as Finish };

function copy(printingId: string, collectionId: string): CopyResponse {
  return {
    id: `${printingId}-${collectionId}-${Math.random()}`,
    printingId,
    collectionId,
    groupId: null,
  };
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

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// Per-row hooks are mounted on /cards rows even when disabled (logged-out users
// see the same DOM, gated by the `enabled` flag). They must tolerate a missing
// session at mount and return undefined data without throwing.
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
