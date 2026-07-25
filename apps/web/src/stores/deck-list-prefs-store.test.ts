import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useDeckListPrefsStore } from "./deck-list-prefs-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useDeckListPrefsStore);
});

afterEach(() => {
  resetStore();
});

describe("useDeckListPrefsStore", () => {
  it("starts with sensible defaults", () => {
    const state = useDeckListPrefsStore.getState();
    expect(state.search).toBe("");
    expect(state.density).toBe("grid");
    expect(state.formatFilter).toBe("all");
    expect(state.validityFilter).toBe("all");
    expect(state.domainFilter).toEqual([]);
    expect(state.showArchived).toBe(false);
  });

  describe("setDomainFilter", () => {
    it("sets the selection", () => {
      useDeckListPrefsStore.getState().setDomainFilter(["fury"]);
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual(["fury"]);
    });

    it("replaces the entire selection", () => {
      const store = useDeckListPrefsStore.getState();
      store.setDomainFilter(["fury"]);
      store.setDomainFilter(["calm", "mind"]);
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual(["calm", "mind"]);
    });

    it("clears when given an empty array", () => {
      const store = useDeckListPrefsStore.getState();
      store.setDomainFilter(["body"]);
      store.setDomainFilter([]);
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual([]);
    });
  });

  describe("resetFilters", () => {
    it("clears search and filters but keeps display preferences", () => {
      const store = useDeckListPrefsStore.getState();
      store.setSearch("aatrox");
      store.setFormatFilter("constructed");
      store.setValidityFilter("invalid");
      store.setDomainFilter(["fury"]);
      store.setDensity("list");

      useDeckListPrefsStore.getState().resetFilters();

      const after = useDeckListPrefsStore.getState();
      expect(after.search).toBe("");
      expect(after.formatFilter).toBe("all");
      expect(after.validityFilter).toBe("all");
      expect(after.domainFilter).toEqual([]);
      // Display preferences are preserved.
      expect(after.density).toBe("list");
    });
  });

  describe("persistence merge", () => {
    it("rejects an unknown density value and keeps current", () => {
      const store = useDeckListPrefsStore;
      const current = store.getState();
      const persisted = {
        density: "grid-of-doom",
        formatFilter: "all",
        validityFilter: "all",
        domainFilter: [],
        showArchived: false,
      };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.density).toBe(current.density);
      }
    });

    it("filters non-string entries from persisted domainFilter", () => {
      const store = useDeckListPrefsStore;
      const current = store.getState();
      const persisted = {
        domainFilter: ["fury", 42, null, "body"],
      };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.domainFilter).toEqual(["fury", "body"]);
      }
    });

    it("accepts a fully valid persisted blob", () => {
      const store = useDeckListPrefsStore;
      const current = store.getState();
      const persisted = {
        density: "list",
        formatFilter: "constructed",
        validityFilter: "valid",
        domainFilter: ["fury"],
        showArchived: true,
      };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.density).toBe("list");
        expect(result.formatFilter).toBe("constructed");
        expect(result.validityFilter).toBe("valid");
        expect(result.domainFilter).toEqual(["fury"]);
        expect(result.showArchived).toBe(true);
      }
    });
  });
});
