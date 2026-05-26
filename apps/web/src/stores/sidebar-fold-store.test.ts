import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useSidebarFoldStore } from "./sidebar-fold-store";

describe("sidebar-fold-store", () => {
  let resetStore: () => void;

  beforeEach(() => {
    resetStore = createStoreResetter(useSidebarFoldStore);
  });

  afterEach(() => {
    resetStore();
  });

  it("defaults to open for every group", () => {
    expect(useSidebarFoldStore.getState().byKey).toEqual({
      collections: true,
      wish: true,
      trade: true,
      organize: true,
    });
  });

  it("setOpen flips a single group without affecting others", () => {
    useSidebarFoldStore.getState().setOpen("wish", false);
    expect(useSidebarFoldStore.getState().byKey).toEqual({
      collections: true,
      wish: false,
      trade: true,
      organize: true,
    });
  });

  it("toggle flips the open state for one group", () => {
    useSidebarFoldStore.getState().toggle("trade");
    expect(useSidebarFoldStore.getState().byKey.trade).toBe(false);
    useSidebarFoldStore.getState().toggle("trade");
    expect(useSidebarFoldStore.getState().byKey.trade).toBe(true);
  });

  it("reset restores defaults after folding", () => {
    useSidebarFoldStore.getState().setOpen("collections", false);
    useSidebarFoldStore.getState().setOpen("organize", false);
    useSidebarFoldStore.getState().reset();
    expect(useSidebarFoldStore.getState().byKey).toEqual({
      collections: true,
      wish: true,
      trade: true,
      organize: true,
    });
  });
});
