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
});
