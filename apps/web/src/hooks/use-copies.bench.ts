// Phase 1b before/after benchmarks.
//
// The "before" path pre-computed filter/aggregate results server-side and
// the client did near-zero work per read — pass-through of already-filtered
// items or direct field access. One exception: useOwnedCount ran
// `selectTotals` over the server breakdown, which IS real work.
//
// The "after" path stores all copies in one collection and derives the
// per-collection filter + owned-count aggregates on the client via live
// queries. These benches compare the two pure-JS derivations side-by-side
// so we can see the added absolute cost, not just ratios.
//
// What this does NOT measure:
// - The cost of TanStack DB's live-query machinery around the JS derivation
//   (subscription, graph building, incremental updates). Cold-start
//   overhead was measured in Phase 1a (~15ms for a trivial query, one-time
//   per subscription). Steady-state incremental updates aren't measured.
// - The saved network round-trip: the old useOwnedCount called
//   /api/v1/copies/count-by-collection (a separate server round-trip with
//   60s staleTime). The new path eliminates that entirely. Typical network
//   latency would be ~50-200ms per call.

import type {
  CollectionResponse,
  CopyCollectionBreakdownEntry,
  CopyCollectionBreakdownResponse,
  CopyListResponse,
  CopyResponse,
} from "@openrift/shared";
import { bench, describe } from "vitest";

const COLLECTION_COUNT = 10;
const PRINTING_COUNT = 800;
const COPY_COUNT = 2000;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49_297) % 233_280;
    return s / 233_280;
  };
}

function pick<T>(arr: readonly T[], r: () => number): T {
  const value = arr[Math.floor(r() * arr.length)];
  if (value === undefined) {
    throw new Error("pick() from empty array");
  }
  return value;
}

function buildFixture() {
  const r = seededRandom(42);

  const collections: CollectionResponse[] = Array.from({ length: COLLECTION_COUNT }, (_, i) => ({
    id: `col-${i}`,
    name: `Collection ${i}`,
    description: null,
    availableForDeckbuilding: true,
    isInbox: i === 0,
    sortOrder: i,
    shareToken: null,
    copyCount: 0,
    totalValueCents: null,
    unpricedCopyCount: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  }));

  const printingIds: string[] = Array.from({ length: PRINTING_COUNT }, (_, i) => `printing-${i}`);
  const collectionIds: string[] = collections.map((c) => c.id);

  const copies: CopyResponse[] = Array.from({ length: COPY_COUNT }, (_, i) => ({
    id: `copy-${i}`,
    printingId: pick(printingIds, r),
    collectionId: pick(collectionIds, r),
    createdAt: "2025-01-01T00:00:00Z",
  }));

  return { collections, copies };
}

const { collections, copies } = buildFixture();
const TARGET_COLLECTION_ID = "col-3";
const nameById = new Map(collections.map((c) => [c.id, c.name]));

// ── "Before" fixtures: the pre-computed shapes the server used to send ──────

// The server's pre-filtered `copiesQueryOptions(collectionId)` returned just
// the copies in that one collection, wrapped in a CopyListResponse.
const prefilteredCopies: CopyListResponse = {
  items: copies.filter((c) => c.collectionId === TARGET_COLLECTION_ID),
  nextCursor: null,
};

// The server's /api/v1/copies/count-by-collection endpoint returned a
// breakdown keyed by printingId, each with per-collection entries. Build the
// equivalent from our copies fixture so we can bench the selectTotals select.
function buildBreakdown(all: readonly CopyResponse[]): CopyCollectionBreakdownResponse {
  const perPrinting = new Map<string, Map<string, number>>();
  for (const copy of all) {
    let byCollection = perPrinting.get(copy.printingId);
    if (!byCollection) {
      byCollection = new Map();
      perPrinting.set(copy.printingId, byCollection);
    }
    byCollection.set(copy.collectionId, (byCollection.get(copy.collectionId) ?? 0) + 1);
  }
  const items: Record<string, CopyCollectionBreakdownEntry[]> = {};
  for (const [printingId, byCollection] of perPrinting) {
    const entries: CopyCollectionBreakdownEntry[] = [];
    for (const [collectionId, count] of byCollection) {
      entries.push({
        collectionId,
        collectionName: nameById.get(collectionId) ?? "",
        count,
      });
    }
    items[printingId] = entries;
  }
  return { items };
}

const breakdown = buildBreakdown(copies);

// ── "Before" paths: what the client did per render on the old code ──────────

// useCopies(collectionId) old path: useSuspenseQuery(copiesQueryOptions(id))
// with `select: (data) => data.items` — pass-through of the server-filtered
// items array.
function oldFilterPassThrough(response: CopyListResponse): CopyResponse[] {
  return response.items;
}

// useOwnedCount old path: the `selectTotals` select from the old
// use-owned-count.ts, verbatim. Iterates printings, sums each printing's
// per-collection counts.
function oldSelectTotals(data: CopyCollectionBreakdownResponse): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [printingId, entries] of Object.entries(data.items)) {
    let sum = 0;
    for (const entry of entries) {
      sum += entry.count;
    }
    totals[printingId] = sum;
  }
  return totals;
}

// ── The "new" JS aggregations, extracted for benching ────────────────────────

function filterByCollection(all: readonly CopyResponse[], collectionId: string): CopyResponse[] {
  return all.filter((c) => c.collectionId === collectionId);
}

function aggregateTotals(all: readonly CopyResponse[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const copy of all) {
    totals[copy.printingId] = (totals[copy.printingId] ?? 0) + 1;
  }
  return totals;
}

function aggregateCollectionCopyCounts(all: readonly CopyResponse[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const copy of all) {
    counts.set(copy.collectionId, (counts.get(copy.collectionId) ?? 0) + 1);
  }
  return counts;
}

function aggregateOwnedCollections(
  all: readonly CopyResponse[],
  printingId: string,
  names: Map<string, string>,
): { collectionId: string; collectionName: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const copy of all) {
    if (copy.printingId === printingId) {
      counts.set(copy.collectionId, (counts.get(copy.collectionId) ?? 0) + 1);
    }
  }
  const result: { collectionId: string; collectionName: string; count: number }[] = [];
  for (const [collectionId, count] of counts) {
    result.push({
      collectionId,
      collectionName: names.get(collectionId) ?? "",
      count,
    });
  }
  return result;
}

// ── Benches ───────────────────────────────────────────────────────────────────

describe("useCopies(collectionId) filter — before vs after", () => {
  bench("before: pass-through server-filtered array", () => {
    oldFilterPassThrough(prefilteredCopies);
  });

  bench("after: client-side filter over all copies", () => {
    filterByCollection(copies, TARGET_COLLECTION_ID);
  });
});

describe("useOwnedCount totals — before vs after", () => {
  bench("before: selectTotals over server breakdown (~800 printings)", () => {
    oldSelectTotals(breakdown);
  });

  bench("after: aggregate over 2000 copies", () => {
    aggregateTotals(copies);
  });
});

describe("collections.copyCount — before vs after", () => {
  bench("before: pass-through server-computed field", () => {
    // The old code just read col.copyCount directly from the server data.
    // Simulating "read a field off each collection" to get a floor.
    for (const col of collections) {
      void col.copyCount;
    }
  });

  bench("after: aggregate over 2000 copies", () => {
    aggregateCollectionCopyCounts(copies);
  });
});

describe("useOwnedCollections per-printing breakdown — before vs after", () => {
  bench("before: lookup + map over breakdown entries for one printing", () => {
    // selectTotals wasn't this hook — the old useOwnedCollections select was a
    // direct Record lookup. Simulating the same floor.
    const entries = breakdown.items["printing-0"] ?? [];
    const copy = entries.map((e) => ({ ...e }));
    void copy.length;
  });

  bench("after: scan all copies + aggregate by collection for one printing", () => {
    aggregateOwnedCollections(copies, "printing-0", nameById);
  });
});
