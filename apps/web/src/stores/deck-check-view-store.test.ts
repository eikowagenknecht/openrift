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

  it("defaults to the grid display mode", () => {
    expect(useDeckCheckViewStore.getState().displayMode).toBe("grid");
  });

  it("switches the display mode to list and back", () => {
    useDeckCheckViewStore.getState().setDisplayMode("list");
    expect(useDeckCheckViewStore.getState().displayMode).toBe("list");
    useDeckCheckViewStore.getState().setDisplayMode("grid");
    expect(useDeckCheckViewStore.getState().displayMode).toBe("grid");
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

describe("rehydrate validation", () => {
  afterEach(() => {
    localStorage.removeItem("deck-check-view");
  });

  it("falls back to defaults for junk persisted values", async () => {
    localStorage.setItem(
      "deck-check-view",
      JSON.stringify({
        state: {
          wide: "yes",
          displayMode: "carousel",
          sortBy: "garbage",
          sortDir: "up",
          maxColumns: -2,
        },
        version: 0,
      }),
    );
    await useDeckCheckViewStore.persist.rehydrate();
    const state = useDeckCheckViewStore.getState();
    expect(state.wide).toBe(true);
    expect(state.displayMode).toBe("grid");
    expect(state.sortBy).toBe("deck");
    expect(state.sortDir).toBe("asc");
    expect(state.maxColumns).toBeNull();
  });

  it("keeps valid persisted values", async () => {
    localStorage.setItem(
      "deck-check-view",
      JSON.stringify({
        state: { wide: false, displayMode: "list", sortBy: "name", sortDir: "desc", maxColumns: 4 },
        version: 0,
      }),
    );
    await useDeckCheckViewStore.persist.rehydrate();
    const state = useDeckCheckViewStore.getState();
    expect(state.wide).toBe(false);
    expect(state.displayMode).toBe("list");
    expect(state.sortBy).toBe("name");
    expect(state.sortDir).toBe("desc");
    expect(state.maxColumns).toBe(4);
  });

  it("survives a corrupt persisted blob", async () => {
    localStorage.setItem("deck-check-view", JSON.stringify({ state: "corrupt", version: 0 }));
    await useDeckCheckViewStore.persist.rehydrate();
    expect(useDeckCheckViewStore.getState().sortBy).toBe("deck");
  });
});
