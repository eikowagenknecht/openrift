import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useDeckCheckViewStore } from "./deck-check-view-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useDeckCheckViewStore);
});

afterEach(() => {
  resetStore();
});

describe("useDeckCheckViewStore", () => {
  it("defaults to the wide layout", () => {
    expect(useDeckCheckViewStore.getState().wide).toBe(true);
  });

  it("toggles off and back on", () => {
    useDeckCheckViewStore.getState().setWide(false);
    expect(useDeckCheckViewStore.getState().wide).toBe(false);
    useDeckCheckViewStore.getState().setWide(true);
    expect(useDeckCheckViewStore.getState().wide).toBe(true);
  });

  it("defaults to deck-order sort, ascending", () => {
    expect(useDeckCheckViewStore.getState().sortBy).toBe("deck");
    expect(useDeckCheckViewStore.getState().sortDir).toBe("asc");
  });

  it("updates the sort field and direction", () => {
    useDeckCheckViewStore.getState().setSortBy("name");
    useDeckCheckViewStore.getState().setSortDir("desc");
    expect(useDeckCheckViewStore.getState().sortBy).toBe("name");
    expect(useDeckCheckViewStore.getState().sortDir).toBe("desc");
  });

  it("defaults to auto columns (null)", () => {
    expect(useDeckCheckViewStore.getState().maxColumns).toBeNull();
  });

  it("sets and clears the column override", () => {
    useDeckCheckViewStore.getState().setMaxColumns(4);
    expect(useDeckCheckViewStore.getState().maxColumns).toBe(4);
    useDeckCheckViewStore.getState().setMaxColumns(null);
    expect(useDeckCheckViewStore.getState().maxColumns).toBeNull();
  });
});
