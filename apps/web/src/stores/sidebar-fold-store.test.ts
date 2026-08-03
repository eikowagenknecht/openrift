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

  it("keeps the 'Show more' reveal closed until asked", () => {
    expect(useSidebarFoldStore.getState().isMoreShown("wish")).toBe(false);
    useSidebarFoldStore.getState().setMoreShown("wish", true);
    expect(useSidebarFoldStore.getState().isMoreShown("wish")).toBe(true);
    expect(useSidebarFoldStore.getState().byKey["more:wish"]).toBe(true);
  });

  it("toggleMoreShown flips one group's reveal without touching its fold state", () => {
    useSidebarFoldStore.getState().toggleMoreShown("collections");
    expect(useSidebarFoldStore.getState().isMoreShown("collections")).toBe(true);
    expect(useSidebarFoldStore.getState().isOpen("collections")).toBe(true);
    useSidebarFoldStore.getState().toggleMoreShown("collections");
    expect(useSidebarFoldStore.getState().isMoreShown("collections")).toBe(false);
  });

  it("keeps fold and reveal state separate for the same group", () => {
    useSidebarFoldStore.getState().setOpen("trade", false);
    useSidebarFoldStore.getState().setMoreShown("trade", true);
    expect(useSidebarFoldStore.getState().isOpen("trade")).toBe(false);
    expect(useSidebarFoldStore.getState().isMoreShown("trade")).toBe(true);
  });

  it("reset restores defaults after folding", () => {
    useSidebarFoldStore.getState().setOpen("collections", false);
    useSidebarFoldStore.getState().setOpen("organize", false);
    useSidebarFoldStore.getState().setMoreShown("organize", true);
    useSidebarFoldStore.getState().reset();
    expect(useSidebarFoldStore.getState().byKey).toEqual({
      collections: true,
      wish: true,
      trade: true,
      organize: true,
    });
  });
});
