import { describe, expect, it } from "vitest";

import {
  copyIdsInCollection,
  isReplaceableTarget,
  LIST_TARGET_PREFIX,
  NEW_COLLECTION_TARGET,
} from "./import-replace";

const collections = [
  { id: "col-empty", copyCount: 0 },
  { id: "col-full", copyCount: 3 },
];

describe("isReplaceableTarget", () => {
  it("is true for an existing collection that already has cards", () => {
    expect(isReplaceableTarget("col-full", collections)).toBe(true);
  });

  it("is false for an existing but empty collection", () => {
    expect(isReplaceableTarget("col-empty", collections)).toBe(false);
  });

  it("is false for the create-new sentinel", () => {
    expect(isReplaceableTarget(NEW_COLLECTION_TARGET, collections)).toBe(false);
  });

  it("is false for a list target", () => {
    expect(isReplaceableTarget(`${LIST_TARGET_PREFIX}list-1`, collections)).toBe(false);
  });

  it("is false for an empty selection", () => {
    expect(isReplaceableTarget("", collections)).toBe(false);
  });

  it("is false for an unknown collection id", () => {
    expect(isReplaceableTarget("col-missing", collections)).toBe(false);
  });
});

describe("copyIdsInCollection", () => {
  const copies = [
    { id: "c1", collectionId: "col-a" },
    { id: "c2", collectionId: "col-b" },
    { id: "c3", collectionId: "col-a" },
  ];

  it("returns only the copy ids in the given collection", () => {
    expect(copyIdsInCollection(copies, "col-a")).toEqual(["c1", "c3"]);
  });

  it("returns an empty array when the collection has no copies", () => {
    expect(copyIdsInCollection(copies, "col-empty")).toEqual([]);
  });

  it("returns an empty array for an empty copies list", () => {
    expect(copyIdsInCollection([], "col-a")).toEqual([]);
  });
});
