import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useDeckListPrefsStore } from "./deck-list-prefs-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useDeckListPrefsStore);
});

afterEach(() => {
  resetStore();
});

describe("useDeckListPrefsStore", () => {
  it("starts in grid density", () => {
    expect(useDeckListPrefsStore.getState().density).toBe("grid");
  });

  it("switches density", () => {
    useDeckListPrefsStore.getState().setDensity("list");
    expect(useDeckListPrefsStore.getState().density).toBe("list");
  });

  describe("persistence merge", () => {
    it("rejects an unknown density value and keeps current", () => {
      const store = useDeckListPrefsStore;
      const current = store.getState();
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.({ density: "grid-of-doom" }, current);
      if (result) {
        expect(result.density).toBe(current.density);
      }
    });

    it("accepts a valid persisted blob", () => {
      const store = useDeckListPrefsStore;
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.({ density: "list" }, store.getState());
      if (result) {
        expect(result.density).toBe("list");
      }
    });

    it("ignores the filter keys left behind by the pre-URL store", () => {
      // Filters moved into the URL. An old blob still carries them, and it must
      // merge cleanly rather than reviving state the store no longer owns.
      const store = useDeckListPrefsStore;
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(
        {
          density: "list",
          formatFilter: "constructed",
          validityFilter: "valid",
          domainFilter: ["fury"],
          showArchived: true,
        },
        store.getState(),
      );
      if (result) {
        expect(result.density).toBe("list");
        expect(result).not.toHaveProperty("formatFilter");
        expect(result).not.toHaveProperty("domainFilter");
      }
    });
  });
});
