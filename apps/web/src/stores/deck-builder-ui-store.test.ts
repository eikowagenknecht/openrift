import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useDeckBuilderUiStore } from "./deck-builder-ui-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useDeckBuilderUiStore);
});

afterEach(() => {
  resetStore();
});

describe("useDeckBuilderUiStore", () => {
  it("updates the active zone", () => {
    useDeckBuilderUiStore.getState().setActiveZone("sideboard");
    expect(useDeckBuilderUiStore.getState().activeZone).toBe("sideboard");
  });

  it("clears the active zone when set to null", () => {
    useDeckBuilderUiStore.getState().setActiveZone("main");
    useDeckBuilderUiStore.getState().setActiveZone(null);
    expect(useDeckBuilderUiStore.getState().activeZone).toBeNull();
  });

  it("stores the runes-by-domain catalog map", () => {
    const map = new Map<string, []>([["fury", []]]);
    useDeckBuilderUiStore.getState().setRunesByDomain(map);
    expect(useDeckBuilderUiStore.getState().runesByDomain).toBe(map);
  });

  it("reset clears active zone and rune catalog", () => {
    useDeckBuilderUiStore.getState().setActiveZone("main");
    useDeckBuilderUiStore.getState().setRunesByDomain(new Map([["fury", []]]));
    useDeckBuilderUiStore.getState().reset();
    expect(useDeckBuilderUiStore.getState().activeZone).toBeNull();
    expect(useDeckBuilderUiStore.getState().runesByDomain.size).toBe(0);
  });
});
