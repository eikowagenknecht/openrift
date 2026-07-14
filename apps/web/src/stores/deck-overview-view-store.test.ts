import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useDeckOverviewViewStore } from "./deck-overview-view-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useDeckOverviewViewStore);
});

afterEach(() => {
  resetStore();
});

describe("useDeckOverviewViewStore", () => {
  it("defaults to the grid display mode", () => {
    expect(useDeckOverviewViewStore.getState().displayMode).toBe("grid");
  });

  it("switches the display mode to list and back", () => {
    useDeckOverviewViewStore.getState().setDisplayMode("list");
    expect(useDeckOverviewViewStore.getState().displayMode).toBe("list");
    useDeckOverviewViewStore.getState().setDisplayMode("grid");
    expect(useDeckOverviewViewStore.getState().displayMode).toBe("grid");
  });

  it("defaults to the default sort, ascending", () => {
    expect(useDeckOverviewViewStore.getState().sortBy).toBe("default");
    expect(useDeckOverviewViewStore.getState().sortDir).toBe("asc");
  });

  it("updates the sort field and direction", () => {
    useDeckOverviewViewStore.getState().setSortBy("price");
    useDeckOverviewViewStore.getState().setSortDir("desc");
    expect(useDeckOverviewViewStore.getState().sortBy).toBe("price");
    expect(useDeckOverviewViewStore.getState().sortDir).toBe("desc");
  });
});

describe("rehydrate validation", () => {
  afterEach(() => {
    localStorage.removeItem("deck-overview-view");
  });

  it("falls back to defaults for junk persisted values", async () => {
    localStorage.setItem(
      "deck-overview-view",
      JSON.stringify({
        state: { displayMode: "carousel", sortBy: "garbage", sortDir: "up" },
        version: 0,
      }),
    );
    await useDeckOverviewViewStore.persist.rehydrate();
    const state = useDeckOverviewViewStore.getState();
    expect(state.displayMode).toBe("grid");
    expect(state.sortBy).toBe("default");
    expect(state.sortDir).toBe("asc");
  });

  it("keeps valid persisted values", async () => {
    localStorage.setItem(
      "deck-overview-view",
      JSON.stringify({
        state: { displayMode: "list", sortBy: "ownership", sortDir: "desc" },
        version: 0,
      }),
    );
    await useDeckOverviewViewStore.persist.rehydrate();
    const state = useDeckOverviewViewStore.getState();
    expect(state.displayMode).toBe("list");
    expect(state.sortBy).toBe("ownership");
    expect(state.sortDir).toBe("desc");
  });

  it("survives a corrupt persisted blob", async () => {
    localStorage.setItem("deck-overview-view", JSON.stringify({ state: "corrupt", version: 0 }));
    await useDeckOverviewViewStore.persist.rehydrate();
    expect(useDeckOverviewViewStore.getState().sortBy).toBe("default");
  });
});
