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
    expect(state.sort).toBe("updated-desc");
    expect(state.density).toBe("grid");
    expect(state.groupBy).toBe("none");
    expect(state.formatFilter).toBe("all");
    expect(state.validityFilter).toBe("all");
    expect(state.domainFilter).toEqual([]);
    expect(state.showArchived).toBe(false);
  });

  describe("toggleDomainFilter", () => {
    it("adds a domain that is not selected", () => {
      useDeckListPrefsStore.getState().toggleDomainFilter("Fury");
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual(["Fury"]);
    });

    it("removes a domain that is already selected", () => {
      useDeckListPrefsStore.getState().toggleDomainFilter("Body");
      useDeckListPrefsStore.getState().toggleDomainFilter("Body");
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual([]);
    });

    it("supports multiple selected domains", () => {
      useDeckListPrefsStore.getState().toggleDomainFilter("Calm");
      useDeckListPrefsStore.getState().toggleDomainFilter("Mind");
      expect(useDeckListPrefsStore.getState().domainFilter).toEqual(["Calm", "Mind"]);
    });
  });

  describe("resetFilters", () => {
    it("clears search and filters but keeps density/sort/group", () => {
      const store = useDeckListPrefsStore.getState();
      store.setSearch("aatrox");
      store.setFormatFilter("constructed");
      store.setValidityFilter("invalid");
      store.toggleDomainFilter("Fury");
      store.setSort("name-asc");
      store.setDensity("list");
      store.setGroupBy("legend");

      useDeckListPrefsStore.getState().resetFilters();

      const after = useDeckListPrefsStore.getState();
      expect(after.search).toBe("");
      expect(after.formatFilter).toBe("all");
      expect(after.validityFilter).toBe("all");
      expect(after.domainFilter).toEqual([]);
      // Display preferences are preserved.
      expect(after.sort).toBe("name-asc");
      expect(after.density).toBe("list");
      expect(after.groupBy).toBe("legend");
    });
  });

  describe("persistence merge", () => {
    it("rejects unknown sort/density/group values and keeps current", () => {
      const store = useDeckListPrefsStore;
      const current = store.getState();
      const persisted = {
        sort: "bogus",
        density: "grid-of-doom",
        groupBy: "moonphase",
        formatFilter: "all",
        validityFilter: "all",
        domainFilter: [],
        showArchived: false,
      };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.sort).toBe(current.sort);
        expect(result.density).toBe(current.density);
        expect(result.groupBy).toBe(current.groupBy);
      }
    });

    it("filters non-string entries from persisted domainFilter", () => {
      const store = useDeckListPrefsStore;
      const current = store.getState();
      const persisted = {
        domainFilter: ["Fury", 42, null, "Body"],
      };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.domainFilter).toEqual(["Fury", "Body"]);
      }
    });

    it("accepts a fully valid persisted blob", () => {
      const store = useDeckListPrefsStore;
      const current = store.getState();
      const persisted = {
        sort: "name-asc",
        density: "list",
        groupBy: "format",
        formatFilter: "constructed",
        validityFilter: "valid",
        domainFilter: ["Fury"],
        showArchived: true,
      };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.sort).toBe("name-asc");
        expect(result.density).toBe("list");
        expect(result.groupBy).toBe("format");
        expect(result.formatFilter).toBe("constructed");
        expect(result.validityFilter).toBe("valid");
        expect(result.domainFilter).toEqual(["Fury"]);
        expect(result.showArchived).toBe(true);
      }
    });
  });
});
