import { afterEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useFilterDrawerStore } from "./filter-drawer-store";

const resetStore = createStoreResetter(useFilterDrawerStore);

afterEach(() => {
  resetStore();
});

describe("useFilterDrawerStore", () => {
  it("starts closed and never-opened", () => {
    expect(useFilterDrawerStore.getState().open).toBe(false);
    expect(useFilterDrawerStore.getState().openedOnce).toBe(false);
  });

  it("opening sets both open and openedOnce", () => {
    useFilterDrawerStore.getState().setOpen(true);
    expect(useFilterDrawerStore.getState().open).toBe(true);
    expect(useFilterDrawerStore.getState().openedOnce).toBe(true);
  });

  it("closing keeps openedOnce latched", () => {
    useFilterDrawerStore.getState().setOpen(true);
    useFilterDrawerStore.getState().setOpen(false);
    expect(useFilterDrawerStore.getState().open).toBe(false);
    expect(useFilterDrawerStore.getState().openedOnce).toBe(true);
  });

  it("closing before any open leaves openedOnce false", () => {
    useFilterDrawerStore.getState().setOpen(false);
    expect(useFilterDrawerStore.getState().openedOnce).toBe(false);
  });
});
