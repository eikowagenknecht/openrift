import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useRulesSearchStore } from "./rules-search-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useRulesSearchStore);
});

afterEach(() => {
  resetStore();
});

describe("useRulesSearchStore", () => {
  it("starts with an empty query and resetSignal at 0", () => {
    const state = useRulesSearchStore.getState();
    expect(state.query).toBe("");
    expect(state.resetSignal).toBe(0);
  });

  describe("setQuery", () => {
    it("updates the query", () => {
      useRulesSearchStore.getState().setQuery("trigger");
      expect(useRulesSearchStore.getState().query).toBe("trigger");
    });

    it("clears when set to an empty string", () => {
      useRulesSearchStore.getState().setQuery("trigger");
      useRulesSearchStore.getState().setQuery("");
      expect(useRulesSearchStore.getState().query).toBe("");
    });

    it("does not bump resetSignal", () => {
      useRulesSearchStore.getState().setQuery("trigger");
      useRulesSearchStore.getState().setQuery("");
      expect(useRulesSearchStore.getState().resetSignal).toBe(0);
    });

    it("preserves the state reference when the query is unchanged", () => {
      useRulesSearchStore.getState().setQuery("trigger");
      const before = useRulesSearchStore.getState();
      useRulesSearchStore.getState().setQuery("trigger");
      const after = useRulesSearchStore.getState();
      expect(after).toBe(before);
    });
  });

  describe("reset", () => {
    it("clears the query", () => {
      useRulesSearchStore.getState().setQuery("trigger");
      useRulesSearchStore.getState().reset();
      expect(useRulesSearchStore.getState().query).toBe("");
    });

    it("bumps resetSignal each call", () => {
      useRulesSearchStore.getState().reset();
      expect(useRulesSearchStore.getState().resetSignal).toBe(1);
      useRulesSearchStore.getState().reset();
      expect(useRulesSearchStore.getState().resetSignal).toBe(2);
    });

    it("bumps resetSignal even when the query is already empty", () => {
      useRulesSearchStore.getState().reset();
      expect(useRulesSearchStore.getState().query).toBe("");
      expect(useRulesSearchStore.getState().resetSignal).toBe(1);
    });
  });
});
