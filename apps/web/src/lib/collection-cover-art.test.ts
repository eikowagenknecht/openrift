import { describe, expect, it } from "vitest";

import { deriveCollectionCovers } from "./collection-cover-art";

function copy(collectionId: string, printingId: string) {
  return { collectionId, printingId };
}

describe("deriveCollectionCovers", () => {
  it("returns an empty map for no copies", () => {
    expect(deriveCollectionCovers([], 4).size).toBe(0);
  });

  it("ranks printings most-copies-first within a collection", () => {
    const covers = deriveCollectionCovers(
      [copy("col-a", "p-2"), copy("col-a", "p-1"), copy("col-a", "p-2")],
      4,
    );
    expect(covers.get("col-a")).toEqual(["p-2", "p-1"]);
  });

  it("breaks count ties by printing id for a stable order", () => {
    const covers = deriveCollectionCovers(
      [copy("col-a", "p-b"), copy("col-a", "p-a"), copy("col-a", "p-c")],
      4,
    );
    expect(covers.get("col-a")).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("caps each collection at the limit", () => {
    const covers = deriveCollectionCovers(
      [copy("col-a", "p-1"), copy("col-a", "p-2"), copy("col-a", "p-3")],
      2,
    );
    expect(covers.get("col-a")).toHaveLength(2);
  });

  it("keys results per collection without cross-talk", () => {
    const covers = deriveCollectionCovers(
      [copy("col-a", "p-1"), copy("col-b", "p-2"), copy("col-b", "p-2")],
      4,
    );
    expect(covers.get("col-a")).toEqual(["p-1"]);
    expect(covers.get("col-b")).toEqual(["p-2"]);
  });
});
