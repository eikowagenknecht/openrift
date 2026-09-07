import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useMatchVariantsFoldStore } from "./match-variants-fold-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useMatchVariantsFoldStore);
});

afterEach(() => {
  resetStore();
});

describe("useMatchVariantsFoldStore", () => {
  it("starts collapsed (empty expanded set)", () => {
    expect(useMatchVariantsFoldStore.getState().expanded.size).toBe(0);
  });

  describe("toggle", () => {
    it("expands a tile when collapsed", () => {
      useMatchVariantsFoldStore.getState().toggle("user-1:entry-1");
      expect(useMatchVariantsFoldStore.getState().expanded.has("user-1:entry-1")).toBe(true);
    });

    it("collapses a tile when already expanded", () => {
      useMatchVariantsFoldStore.getState().toggle("user-1:entry-1");
      useMatchVariantsFoldStore.getState().toggle("user-1:entry-1");
      expect(useMatchVariantsFoldStore.getState().expanded.has("user-1:entry-1")).toBe(false);
    });

    it("returns a new Set reference so subscribers see a state change", () => {
      const before = useMatchVariantsFoldStore.getState().expanded;
      useMatchVariantsFoldStore.getState().toggle("user-1:entry-1");
      const after = useMatchVariantsFoldStore.getState().expanded;
      expect(after).not.toBe(before);
    });

    it("does not affect other tiles (the same wish under a different member stays collapsed)", () => {
      useMatchVariantsFoldStore.getState().toggle("user-1:entry-1");
      useMatchVariantsFoldStore.getState().toggle("user-2:entry-1");
      useMatchVariantsFoldStore.getState().toggle("user-1:entry-1");
      expect(useMatchVariantsFoldStore.getState().expanded.has("user-1:entry-1")).toBe(false);
      expect(useMatchVariantsFoldStore.getState().expanded.has("user-2:entry-1")).toBe(true);
    });
  });
});
