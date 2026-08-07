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

  it("starts on the overview tab", () => {
    expect(useDeckBuilderUiStore.getState().overviewTab).toBe("overview");
  });

  it("switches the overview tab", () => {
    useDeckBuilderUiStore.getState().setOverviewTab("plan");
    expect(useDeckBuilderUiStore.getState().overviewTab).toBe("plan");
    useDeckBuilderUiStore.getState().setOverviewTab("test");
    expect(useDeckBuilderUiStore.getState().overviewTab).toBe("test");
    useDeckBuilderUiStore.getState().setOverviewTab("overview");
    expect(useDeckBuilderUiStore.getState().overviewTab).toBe("overview");
  });

  it("reset returns to the overview tab", () => {
    useDeckBuilderUiStore.getState().setOverviewTab("test");
    useDeckBuilderUiStore.getState().reset();
    expect(useDeckBuilderUiStore.getState().overviewTab).toBe("overview");
  });
});
