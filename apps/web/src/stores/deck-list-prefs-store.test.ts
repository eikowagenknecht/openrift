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
    expect(state.sortField).toBe("updated");
    expect(state.sortDir).toBe("desc");
    expect(state.density).toBe("grid");
    expect(state.groupBy).toBe("none");
    expect(state.groupDir).toBe("asc");
    expect(state.formatFilter).toBe("all");
    expect(state.validityFilter).toBe("all");
    expect(state.domainFilter).toEqual([]);
    expect(state.showArchived).toBe(false);
  });

  describe("toggleDomainFilter", () => {
    it("adds a domain that is not selected", () => {
      useDeckListPrefsStore.getState().toggleDomainFilter("fury");
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual(["fury"]);
    });

    it("removes a domain that is already selected", () => {
      useDeckListPrefsStore.getState().toggleDomainFilter("body");
      useDeckListPrefsStore.getState().toggleDomainFilter("body");
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual([]);
    });

    it("supports multiple selected domains", () => {
      useDeckListPrefsStore.getState().toggleDomainFilter("calm");
      useDeckListPrefsStore.getState().toggleDomainFilter("mind");
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual(["calm", "mind"]);
    });
  });

  describe("resetFilters", () => {
    it("clears search and filters but keeps display preferences", () => {
      const store = useDeckListPrefsStore.getState();
      store.setSearch("aatrox");
      store.setFormatFilter("constructed");
      store.setValidityFilter("invalid");
      store.toggleDomainFilter("fury");
      store.setSortField("name");
      store.setSortDir("asc");
      store.setDensity("list");
      store.setGroupBy("legend");
      store.setGroupDir("desc");

      useDeckListPrefsStore.getState().resetFilters();

      const after = useDeckListPrefsStore.getState();
      expect(after.search).toBe("");
      expect(after.formatFilter).toBe("all");
      expect(after.validityFilter).toBe("all");
      expect(after.domainFilter).toEqual([]);
      // Display preferences are preserved.
      expect(after.sortField).toBe("name");
      expect(after.sortDir).toBe("asc");
      expect(after.density).toBe("list");
      expect(after.groupBy).toBe("legend");
      expect(after.groupDir).toBe("desc");
    });
  });

  describe("persistence merge", () => {
    it("rejects unknown sort/density/group values and keeps current", () => {
      const store = useDeckListPrefsStore;
      const current = store.getState();
      const persisted = {
        sortField: "bogus",
        sortDir: "sideways",
        density: "grid-of-doom",
        groupBy: "moonphase",
        groupDir: "diagonal",
        formatFilter: "all",
        validityFilter: "all",
        domainFilter: [],
        showArchived: false,
      };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.sortField).toBe(current.sortField);
        expect(result.sortDir).toBe(current.sortDir);
        expect(result.density).toBe(current.density);
        expect(result.groupBy).toBe(current.groupBy);
        expect(result.groupDir).toBe(current.groupDir);
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
        sortField: "name",
        sortDir: "asc",
        density: "list",
        groupBy: "format",
        groupDir: "desc",
        formatFilter: "constructed",
        validityFilter: "valid",
        domainFilter: ["fury"],
        showArchived: true,
      };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.sortField).toBe("name");
        expect(result.sortDir).toBe("asc");
        expect(result.density).toBe("list");
        expect(result.groupBy).toBe("format");
        expect(result.groupDir).toBe("desc");
        expect(result.formatFilter).toBe("constructed");
        expect(result.validityFilter).toBe("valid");
        expect(result.domainFilter).toEqual(["fury"]);
        expect(result.showArchived).toBe(true);
      }
    });
  });
});
