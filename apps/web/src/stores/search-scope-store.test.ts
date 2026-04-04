import type { SearchField } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, DEFAULT_SEARCH_SCOPE } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useSearchScopeStore } from "./search-scope-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useSearchScopeStore);
});

afterEach(() => {
  resetStore();
});

describe("useSearchScopeStore", () => {
  it("starts with the default search scope", () => {
    expect(useSearchScopeStore.getState().scope).toEqual(DEFAULT_SEARCH_SCOPE);
  });

  describe("toggleField", () => {
    it("removes a field that is already in the scope", () => {
      useSearchScopeStore.getState().toggleField("name");

      const scope = useSearchScopeStore.getState().scope;
      expect(scope).not.toContain("name");
    });

    it("adds a field that is not in the scope", () => {
      useSearchScopeStore.getState().selectOnly("name");
      useSearchScopeStore.getState().toggleField("cardText");

      const scope = useSearchScopeStore.getState().scope;
      expect(scope).toContain("name");
      expect(scope).toContain("cardText");
    });

    it("prevents removing the last field (empty scope)", () => {
      useSearchScopeStore.getState().selectOnly("name");
      useSearchScopeStore.getState().toggleField("name");

      // Should still have "name" since removing it would leave scope empty
      expect(useSearchScopeStore.getState().scope).toEqual(["name"]);
    });
  });

  describe("selectAll", () => {
    it("sets scope to all search fields", () => {
      useSearchScopeStore.getState().selectOnly("name");
      useSearchScopeStore.getState().selectAll();

      expect(useSearchScopeStore.getState().scope).toEqual(ALL_SEARCH_FIELDS);
    });
  });

  describe("selectOnly", () => {
    it("sets scope to a single field", () => {
      useSearchScopeStore.getState().selectOnly("artist");

      expect(useSearchScopeStore.getState().scope).toEqual(["artist"]);
    });

    it("works for each field type", () => {
      for (const field of ALL_SEARCH_FIELDS) {
        useSearchScopeStore.getState().selectOnly(field);
        expect(useSearchScopeStore.getState().scope).toEqual([field]);
      }
    });
  });

  describe("persistence merge", () => {
    it("filters out invalid fields from persisted data", () => {
      const store = useSearchScopeStore;
      const current = store.getState();
      const persisted = { scope: ["name", "invalidField" as SearchField, "artist"] };

      const merge = store.persist?.getOptions()?.merge;
      const mergeResult = merge?.(persisted, current);
      if (mergeResult) {
        expect(mergeResult.scope).toEqual(["name", "artist"]);
      }
    });

    it("falls back to default scope when all persisted fields are invalid", () => {
      const store = useSearchScopeStore;
      const current = store.getState();
      const persisted = { scope: ["invalid1", "invalid2"] };

      const merge = store.persist?.getOptions()?.merge;
      const mergeResult = merge?.(persisted, current);
      if (mergeResult) {
        expect(mergeResult.scope).toEqual(DEFAULT_SEARCH_SCOPE);
      }
    });

    it("uses current state when persisted scope is not an array", () => {
      const store = useSearchScopeStore;
      const current = store.getState();
      const persisted = { scope: "not-an-array" };

      const merge = store.persist?.getOptions()?.merge;
      const mergeResult = merge?.(persisted, current);
      if (mergeResult) {
        expect(mergeResult.scope).toEqual(current.scope);
      }
    });
  });
});
