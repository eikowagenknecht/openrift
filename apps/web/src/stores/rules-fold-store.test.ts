import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useRulesFoldStore } from "./rules-fold-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useRulesFoldStore);
});

afterEach(() => {
  resetStore();
});

describe("useRulesFoldStore", () => {
  it("starts with an empty foldedRules set", () => {
    expect(useRulesFoldStore.getState().foldedRules.size).toBe(0);
  });

  describe("toggle", () => {
    it("adds a rule number when absent", () => {
      useRulesFoldStore.getState().toggle("103");
      expect(useRulesFoldStore.getState().foldedRules.has("103")).toBe(true);
    });

    it("removes a rule number when present", () => {
      useRulesFoldStore.getState().toggle("103");
      useRulesFoldStore.getState().toggle("103");
      expect(useRulesFoldStore.getState().foldedRules.has("103")).toBe(false);
    });

    it("returns a new Set reference so subscribers see a state change", () => {
      const before = useRulesFoldStore.getState().foldedRules;
      useRulesFoldStore.getState().toggle("103");
      const after = useRulesFoldStore.getState().foldedRules;
      expect(after).not.toBe(before);
    });

    it("does not affect other rules", () => {
      useRulesFoldStore.getState().toggle("103");
      useRulesFoldStore.getState().toggle("104");
      useRulesFoldStore.getState().toggle("103");
      expect(useRulesFoldStore.getState().foldedRules.has("103")).toBe(false);
      expect(useRulesFoldStore.getState().foldedRules.has("104")).toBe(true);
    });
  });

  describe("collapseAll", () => {
    it("replaces foldedRules with the provided rule numbers", () => {
      useRulesFoldStore.getState().toggle("103");
      useRulesFoldStore.getState().collapseAll(["200", "201"]);
      const folded = useRulesFoldStore.getState().foldedRules;
      expect(folded.has("103")).toBe(false);
      expect(folded.has("200")).toBe(true);
      expect(folded.has("201")).toBe(true);
      expect(folded.size).toBe(2);
    });

    it("accepts an empty iterable", () => {
      useRulesFoldStore.getState().toggle("103");
      useRulesFoldStore.getState().collapseAll([]);
      expect(useRulesFoldStore.getState().foldedRules.size).toBe(0);
    });
  });

  describe("expandAll", () => {
    it("clears foldedRules", () => {
      useRulesFoldStore.getState().toggle("103");
      useRulesFoldStore.getState().expandAll();
      expect(useRulesFoldStore.getState().foldedRules.size).toBe(0);
    });

    it("is a no-op when already empty (preserves Set reference)", () => {
      const before = useRulesFoldStore.getState().foldedRules;
      useRulesFoldStore.getState().expandAll();
      const after = useRulesFoldStore.getState().foldedRules;
      expect(after).toBe(before);
    });
  });
});
