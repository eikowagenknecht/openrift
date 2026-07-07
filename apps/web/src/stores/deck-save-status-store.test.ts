import { afterEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { deckSaveKey, useDeckSaveStatusStore } from "./deck-save-status-store";

const resetStore = createStoreResetter(useDeckSaveStatusStore);

afterEach(() => {
  resetStore();
});

const KEY = deckSaveKey("user-a", "deck-1");

function entry(key = KEY) {
  return useDeckSaveStatusStore.getState().statuses[key];
}

describe("deckSaveKey", () => {
  it("scopes the key by user and deck", () => {
    expect(deckSaveKey("user-a", "deck-1")).toBe("user-a:deck-1");
    expect(deckSaveKey("user-b", "deck-1")).not.toBe(deckSaveKey("user-a", "deck-1"));
  });
});

describe("useDeckSaveStatusStore", () => {
  it("starts empty", () => {
    expect(entry()).toBeUndefined();
  });

  it("markDirty sets the dirty state and clears any error", () => {
    useDeckSaveStatusStore.getState().markError(KEY, new Error("boom"));
    useDeckSaveStatusStore.getState().markDirty(KEY);
    expect(entry()).toEqual({ state: "dirty", error: null });
  });

  it("markSaving sets the saving state", () => {
    useDeckSaveStatusStore.getState().markSaving(KEY);
    expect(entry()).toEqual({ state: "saving", error: null });
  });

  it("markSettled maps synced to saved and queued to queued", () => {
    useDeckSaveStatusStore.getState().markSettled(KEY, "synced");
    expect(entry()?.state).toBe("saved");
    useDeckSaveStatusStore.getState().markSettled(KEY, "queued");
    expect(entry()?.state).toBe("queued");
  });

  it("markError records the error", () => {
    const error = new Error("rejected");
    useDeckSaveStatusStore.getState().markError(KEY, error);
    expect(entry()).toEqual({ state: "error", error });
  });

  it("keeps decks independent", () => {
    const otherKey = deckSaveKey("user-a", "deck-2");
    useDeckSaveStatusStore.getState().markDirty(KEY);
    useDeckSaveStatusStore.getState().markSaving(otherKey);
    expect(entry()?.state).toBe("dirty");
    expect(entry(otherKey)?.state).toBe("saving");
  });
});
