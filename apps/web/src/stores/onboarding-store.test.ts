import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { groupNudgeKey, useOnboardingStore } from "./onboarding-store";

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

  it("starts with the collection intro un-dismissed", () => {
    expect(useOnboardingStore.getState().collectionIntroDismissed).toBe(false);
  });

  it("dismisses the collection intro when called", () => {
    useOnboardingStore.getState().dismissCollectionIntro();
    expect(useOnboardingStore.getState().collectionIntroDismissed).toBe(true);
  });

  it("keeps the intros independent", () => {
    useOnboardingStore.getState().dismissCollectionIntro();
    expect(useOnboardingStore.getState().deckBuilderIntroDismissed).toBe(false);
  });

  describe("group nudges", () => {
    it("starts with nothing dismissed", () => {
      expect(useOnboardingStore.getState().dismissedGroupNudges).toEqual([]);
    });

    it("records a dismissal under the group and kind", () => {
      useOnboardingStore.getState().dismissGroupNudge("bothfeld", "contacts");
      expect(useOnboardingStore.getState().dismissedGroupNudges).toEqual(["bothfeld:contacts"]);
    });

    it("keeps the same nudge separate per group", () => {
      useOnboardingStore.getState().dismissGroupNudge("bothfeld", "lists");
      useOnboardingStore.getState().dismissGroupNudge("cube-night", "lists");
      expect(useOnboardingStore.getState().dismissedGroupNudges).toEqual([
        "bothfeld:lists",
        "cube-night:lists",
      ]);
    });

    it("does not duplicate a repeated dismissal", () => {
      useOnboardingStore.getState().dismissGroupNudge("bothfeld", "contacts");
      useOnboardingStore.getState().dismissGroupNudge("bothfeld", "contacts");
      expect(useOnboardingStore.getState().dismissedGroupNudges).toEqual(["bothfeld:contacts"]);
    });

    it("builds the key from the slug and kind", () => {
      expect(groupNudgeKey("bothfeld", "lists")).toBe("bothfeld:lists");
    });
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
        expect(result.collectionIntroDismissed).toBe(current.collectionIntroDismissed);
      }
    });

    it("accepts a persisted collection-intro dismissal", () => {
      const store = useOnboardingStore;
      const current = store.getState();
      const persisted = { collectionIntroDismissed: true };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.collectionIntroDismissed).toBe(true);
      }
    });

    it("rejects a non-boolean collection-intro value and keeps current", () => {
      const store = useOnboardingStore;
      const current = store.getState();
      const persisted = { collectionIntroDismissed: "yes" };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.collectionIntroDismissed).toBe(current.collectionIntroDismissed);
      }
    });

    it("accepts persisted group-nudge dismissals and drops non-string entries", () => {
      const store = useOnboardingStore;
      const current = store.getState();
      const persisted = { dismissedGroupNudges: ["bothfeld:contacts", 7, null] };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.dismissedGroupNudges).toEqual(["bothfeld:contacts"]);
      }
    });

    it("keeps current group-nudge dismissals when the persisted value isn't an array", () => {
      const store = useOnboardingStore;
      const current = store.getState();
      const persisted = { dismissedGroupNudges: "bothfeld:contacts" };
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, current);
      if (result) {
        expect(result.dismissedGroupNudges).toEqual(current.dismissedGroupNudges);
      }
    });
  });
});
