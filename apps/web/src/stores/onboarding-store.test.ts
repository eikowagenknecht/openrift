import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useOnboardingStore } from "./onboarding-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useOnboardingStore);
});

afterEach(() => {
  resetStore();
});

describe("useOnboardingStore", () => {
  it("starts with the deck-builder intro un-dismissed", () => {
    expect(useOnboardingStore.getState().deckBuilderIntroDismissed).toBe(false);
  });

  it("dismisses the deck-builder intro when called", () => {
    useOnboardingStore.getState().dismissDeckBuilderIntro();
    expect(useOnboardingStore.getState().deckBuilderIntroDismissed).toBe(true);
  });

  describe("persistence merge", () => {
    it("rejects non-boolean dismiss values and keeps current", () => {
      const store = useOnboardingStore;
      const current = store.getState();
      const persisted = { deckBuilderIntroDismissed: "yes" };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.deckBuilderIntroDismissed).toBe(current.deckBuilderIntroDismissed);
      }
    });

    it("accepts a true boolean from persisted storage", () => {
      const store = useOnboardingStore;
      const current = store.getState();
      const persisted = { deckBuilderIntroDismissed: true };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.deckBuilderIntroDismissed).toBe(true);
      }
    });

    it("falls back to current state when persisted blob is missing the key", () => {
      const store = useOnboardingStore;
      const current = store.getState();
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.({}, current);
      if (result) {
        expect(result.deckBuilderIntroDismissed).toBe(current.deckBuilderIntroDismissed);
      }
    });
  });
});
