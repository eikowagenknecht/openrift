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

  it("defaults to catalog printings and can prefer owned ones", () => {
    expect(useDeckOverviewViewStore.getState().preferOwnedPrintings).toBe(false);
    useDeckOverviewViewStore.getState().setPreferOwnedPrintings(true);
    expect(useDeckOverviewViewStore.getState().preferOwnedPrintings).toBe(true);
  });

  it("defaults to stacked duplicates and can show every copy", () => {
    expect(useDeckOverviewViewStore.getState().showAllCopies).toBe(false);
    useDeckOverviewViewStore.getState().setShowAllCopies(true);
    expect(useDeckOverviewViewStore.getState().showAllCopies).toBe(true);
  });

  it("defaults to expanded stats and can collapse them", () => {
    expect(useDeckOverviewViewStore.getState().statsOpen).toBe(true);
    useDeckOverviewViewStore.getState().setStatsOpen(false);
    expect(useDeckOverviewViewStore.getState().statsOpen).toBe(false);
    useDeckOverviewViewStore.getState().setStatsOpen(true);
    expect(useDeckOverviewViewStore.getState().statsOpen).toBe(true);
  });

  it("defaults to showing ownership bands and can hide them", () => {
    expect(useDeckOverviewViewStore.getState().showOwnershipBands).toBe(true);
    useDeckOverviewViewStore.getState().setShowOwnershipBands(false);
    expect(useDeckOverviewViewStore.getState().showOwnershipBands).toBe(false);
    useDeckOverviewViewStore.getState().setShowOwnershipBands(true);
    expect(useDeckOverviewViewStore.getState().showOwnershipBands).toBe(true);
  });

  it("defaults to hidden prices and can show them", () => {
    expect(useDeckOverviewViewStore.getState().showPrices).toBe(false);
    useDeckOverviewViewStore.getState().setShowPrices(true);
    expect(useDeckOverviewViewStore.getState().showPrices).toBe(true);
    useDeckOverviewViewStore.getState().setShowPrices(false);
    expect(useDeckOverviewViewStore.getState().showPrices).toBe(false);
  });

  it("defaults to automatic columns and takes an explicit count", () => {
    expect(useDeckOverviewViewStore.getState().columns).toBeNull();
    useDeckOverviewViewStore.getState().setColumns(4);
    expect(useDeckOverviewViewStore.getState().columns).toBe(4);
    useDeckOverviewViewStore.getState().setColumns(null);
    expect(useDeckOverviewViewStore.getState().columns).toBeNull();
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
        state: {
          displayMode: "carousel",
          columns: 2.5,
          sortBy: "garbage",
          sortDir: "up",
          showAllCopies: "yes",
          statsOpen: "nope",
          showOwnershipBands: "sure",
          showPrices: "yes",
        },
        version: 0,
      }),
    );
    await useDeckOverviewViewStore.persist.rehydrate();
    const state = useDeckOverviewViewStore.getState();
    expect(state.displayMode).toBe("grid");
    expect(state.columns).toBeNull();
    expect(state.sortBy).toBe("default");
    expect(state.sortDir).toBe("asc");
    expect(state.showAllCopies).toBe(false);
    expect(state.statsOpen).toBe(true);
    expect(state.showOwnershipBands).toBe(true);
    expect(state.showPrices).toBe(false);
  });

  it("keeps valid persisted values", async () => {
    localStorage.setItem(
      "deck-overview-view",
      JSON.stringify({
        state: {
          displayMode: "list",
          columns: 6,
          sortBy: "ownership",
          sortDir: "desc",
          statsOpen: false,
          showOwnershipBands: false,
          showPrices: true,
        },
        version: 0,
      }),
    );
    await useDeckOverviewViewStore.persist.rehydrate();
    const state = useDeckOverviewViewStore.getState();
    expect(state.displayMode).toBe("list");
    expect(state.columns).toBe(6);
    expect(state.sortBy).toBe("ownership");
    expect(state.sortDir).toBe("desc");
    expect(state.statsOpen).toBe(false);
    expect(state.showOwnershipBands).toBe(false);
    expect(state.showPrices).toBe(true);
  });

  it("rejects a column count outside the usable range", async () => {
    for (const columns of [0, -3, 999]) {
      localStorage.setItem(
        "deck-overview-view",
        JSON.stringify({ state: { columns }, version: 0 }),
      );
      await useDeckOverviewViewStore.persist.rehydrate();
      expect(useDeckOverviewViewStore.getState().columns).toBeNull();
    }
  });

  it("ignores a blob left over from the old thumb-size control", async () => {
    localStorage.setItem(
      "deck-overview-view",
      JSON.stringify({ state: { thumbSize: "lg", displayMode: "list" }, version: 0 }),
    );
    await useDeckOverviewViewStore.persist.rehydrate();
    const state = useDeckOverviewViewStore.getState();
    // The retired key is simply not read; the rest of the blob still loads.
    expect(state.columns).toBeNull();
    expect(state.displayMode).toBe("list");
    expect("thumbSize" in state).toBe(false);
  });

  it("survives a corrupt persisted blob", async () => {
    localStorage.setItem("deck-overview-view", JSON.stringify({ state: "corrupt", version: 0 }));
    await useDeckOverviewViewStore.persist.rehydrate();
    expect(useDeckOverviewViewStore.getState().sortBy).toBe("default");
  });
});
