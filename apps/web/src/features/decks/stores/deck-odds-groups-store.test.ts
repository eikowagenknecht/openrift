import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useDeckOddsGroupsStore } from "./deck-odds-groups-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useDeckOddsGroupsStore);
});

afterEach(() => {
  resetStore();
});

describe("useDeckOddsGroupsStore", () => {
  it("starts with no per-deck selections", () => {
    expect(useDeckOddsGroupsStore.getState().selectionByDeck).toEqual({});
  });

  it("stores a selection per deck and clears back to defaults", () => {
    const { setSelection, clearSelection } = useDeckOddsGroupsStore.getState();
    setSelection("deck-1", ["early-unit", "type-gear"]);
    setSelection("deck-2", ["combat-trick"]);
    expect(useDeckOddsGroupsStore.getState().selectionByDeck["deck-1"]).toEqual([
      "early-unit",
      "type-gear",
    ]);
    clearSelection("deck-1");
    expect(useDeckOddsGroupsStore.getState().selectionByDeck["deck-1"]).toBeUndefined();
    expect(useDeckOddsGroupsStore.getState().selectionByDeck["deck-2"]).toEqual(["combat-trick"]);
  });
});

describe("custom groups", () => {
  it("adds and removes per-deck custom groups", () => {
    const { addCustomGroup, removeCustomGroup } = useDeckOddsGroupsStore.getState();
    addCustomGroup("deck-1", {
      key: "custom-a",
      label: "Turn-1 gear",
      types: ["gear"],
      energyMax: 1,
    });
    addCustomGroup("deck-1", {
      key: "custom-b",
      label: "Cheap spells",
      types: ["spell"],
      energyMax: 2,
    });
    expect(useDeckOddsGroupsStore.getState().customByDeck["deck-1"]).toHaveLength(2);
    removeCustomGroup("deck-1", "custom-a");
    expect(useDeckOddsGroupsStore.getState().customByDeck["deck-1"]?.map((g) => g.key)).toEqual([
      "custom-b",
    ]);
  });
});

describe("rehydrate validation", () => {
  afterEach(() => {
    localStorage.removeItem("deck-odds-groups");
  });

  it("keeps valid entries and drops junk ones", async () => {
    localStorage.setItem(
      "deck-odds-groups",
      JSON.stringify({
        state: {
          selectionByDeck: {
            good: ["turn-one-first-unit"],
            bad: "not-an-array",
            worse: [1, 2],
          },
          customByDeck: {
            good: [
              { key: "custom-a", label: "Turn-1 gear", types: ["gear"], energyMax: 1 },
              { key: 5, label: "missing key" },
              "junk",
            ],
            bad: "not-an-array",
          },
        },
        version: 0,
      }),
    );
    await useDeckOddsGroupsStore.persist.rehydrate();
    const state = useDeckOddsGroupsStore.getState();
    expect(state.selectionByDeck).toEqual({ good: ["turn-one-first-unit"] });
    expect(state.customByDeck).toEqual({
      good: [{ key: "custom-a", label: "Turn-1 gear", types: ["gear"], energyMax: 1 }],
    });
  });

  it("survives a corrupt persisted blob", async () => {
    localStorage.setItem("deck-odds-groups", JSON.stringify({ state: "corrupt", version: 0 }));
    await useDeckOddsGroupsStore.persist.rehydrate();
    expect(useDeckOddsGroupsStore.getState().selectionByDeck).toEqual({});
  });
});
