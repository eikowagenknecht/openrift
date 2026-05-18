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
      buy: true,
      sell: true,
      organize: true,
    });
  });

  it("setOpen flips a single group without affecting others", () => {
    useSidebarFoldStore.getState().setOpen("buy", false);
    expect(useSidebarFoldStore.getState().byKey).toEqual({
      collections: true,
      buy: false,
      sell: true,
      organize: true,
    });
  });

  it("toggle flips the open state for one group", () => {
    useSidebarFoldStore.getState().toggle("sell");
    expect(useSidebarFoldStore.getState().byKey.sell).toBe(false);
    useSidebarFoldStore.getState().toggle("sell");
    expect(useSidebarFoldStore.getState().byKey.sell).toBe(true);
  });

  it("reset restores defaults after folding", () => {
    useSidebarFoldStore.getState().setOpen("collections", false);
    useSidebarFoldStore.getState().setOpen("organize", false);
    useSidebarFoldStore.getState().reset();
    expect(useSidebarFoldStore.getState().byKey).toEqual({
      collections: true,
      buy: true,
      sell: true,
      organize: true,
    });
  });
});
