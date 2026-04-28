import type { CopyResponse, Finish } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { OwnedBreakdownVariant } from "./use-owned-count";
import { aggregateByVariant } from "./use-owned-count";

const v1: OwnedBreakdownVariant = { id: "p1", shortCode: "OGN-001", finish: "normal" as Finish };
const v2: OwnedBreakdownVariant = { id: "p2", shortCode: "OGN-001p", finish: "foil" as Finish };

function copy(printingId: string, collectionId: string): CopyResponse {
  return {
    id: `${printingId}-${collectionId}-${Math.random()}`,
    printingId,
    collectionId,
    addedAt: new Date().toISOString(),
  } as CopyResponse;
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
