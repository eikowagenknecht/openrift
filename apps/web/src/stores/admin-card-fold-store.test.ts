import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import {
  getCollapsedSections,
  getStoredCollapsedPrintings,
  useAdminCardFoldStore,
} from "./admin-card-fold-store";

/**
 * The card's collapsed set, treating an unseeded card as nothing collapsed.
 *
 * @returns The collapsed printing ids for the card.
 */
function collapsedOf(cardId: string): ReadonlySet<string> {
  return getStoredCollapsedPrintings(useAdminCardFoldStore.getState(), cardId) ?? new Set();
}

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useAdminCardFoldStore);
});

afterEach(() => {
  resetStore();
});

describe("useAdminCardFoldStore", () => {
  describe("togglePrinting", () => {
    it("adds a printing id to the collapsed set when absent", () => {
      useAdminCardFoldStore.getState().togglePrinting("ahri-inquisitive", "printing-1");

      const collapsed = collapsedOf("ahri-inquisitive");
      expect(collapsed.has("printing-1")).toBe(true);
    });

    it("removes a printing id from the collapsed set when present", () => {
      const { togglePrinting } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-1");
      togglePrinting("ahri-inquisitive", "printing-1");

      const collapsed = collapsedOf("ahri-inquisitive");
      expect(collapsed.has("printing-1")).toBe(false);
    });

    it("keeps fold state independent per card", () => {
      const { togglePrinting } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-1");
      togglePrinting("other-card", "printing-1");
      togglePrinting("other-card", "printing-2");

      expect(collapsedOf("ahri-inquisitive").size).toBe(1);
      expect(collapsedOf("other-card").size).toBe(2);
    });
  });

  describe("expandPrinting", () => {
    it("removes a printing id from the collapsed set", () => {
      const { togglePrinting, expandPrinting } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-1");
      togglePrinting("ahri-inquisitive", "printing-2");

      expandPrinting("ahri-inquisitive", "printing-1");

      const collapsed = collapsedOf("ahri-inquisitive");
      expect(collapsed.has("printing-1")).toBe(false);
      expect(collapsed.has("printing-2")).toBe(true);
    });

    it("is a no-op when the printing is already expanded", () => {
      const before = useAdminCardFoldStore.getState().collapsedByCard;
      useAdminCardFoldStore.getState().expandPrinting("ahri-inquisitive", "printing-1");
      expect(useAdminCardFoldStore.getState().collapsedByCard).toBe(before);
    });

    it("is a no-op for an unknown card", () => {
      const before = useAdminCardFoldStore.getState().collapsedByCard;
      useAdminCardFoldStore.getState().expandPrinting("never-visited", "printing-1");
      expect(useAdminCardFoldStore.getState().collapsedByCard).toBe(before);
    });
  });

  describe("setCollapsedForCard", () => {
    it("replaces the collapsed set for a card", () => {
      const { togglePrinting, setCollapsedForCard } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-old");

      setCollapsedForCard("ahri-inquisitive", new Set(["printing-a", "printing-b"]));

      const collapsed = collapsedOf("ahri-inquisitive");
      expect(collapsed.has("printing-old")).toBe(false);
      expect(collapsed.has("printing-a")).toBe(true);
      expect(collapsed.has("printing-b")).toBe(true);
    });

    it("stores an empty set to mean all expanded", () => {
      const { togglePrinting, setCollapsedForCard } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-1");

      setCollapsedForCard("ahri-inquisitive", new Set());

      expect(collapsedOf("ahri-inquisitive").size).toBe(0);
    });

    it("copies the input so later mutations of the caller's set don't leak in", () => {
      const input = new Set(["printing-1"]);
      useAdminCardFoldStore.getState().setCollapsedForCard("ahri-inquisitive", input);
      input.add("printing-2");

      const collapsed = collapsedOf("ahri-inquisitive");
      expect(collapsed.has("printing-2")).toBe(false);
    });
  });

  describe("initCollapsedForCard", () => {
    it("seeds the card's default folds", () => {
      useAdminCardFoldStore
        .getState()
        .initCollapsedForCard("ahri-inquisitive", new Set(["printing-2", "printing-3"]));

      const collapsed = collapsedOf("ahri-inquisitive");
      expect(collapsed.has("printing-1")).toBe(false);
      expect(collapsed.has("printing-2")).toBe(true);
      expect(collapsed.has("printing-3")).toBe(true);
    });

    // A refetch re-runs the seeding effect; it must not re-fold rows the admin
    // has since opened, nor undo an "Expand all".
    it("leaves an already-seeded card alone", () => {
      const { initCollapsedForCard, setCollapsedForCard } = useAdminCardFoldStore.getState();
      setCollapsedForCard("ahri-inquisitive", new Set());

      initCollapsedForCard("ahri-inquisitive", new Set(["printing-2"]));

      expect(collapsedOf("ahri-inquisitive").size).toBe(0);
    });

    it("copies the input so later mutations of the caller's set don't leak in", () => {
      const input = new Set(["printing-2"]);
      useAdminCardFoldStore.getState().initCollapsedForCard("ahri-inquisitive", input);
      input.add("printing-3");

      expect(collapsedOf("ahri-inquisitive").has("printing-3")).toBe(false);
    });
  });

  describe("getStoredCollapsedPrintings", () => {
    it("returns undefined for a card that has not been seeded", () => {
      expect(
        getStoredCollapsedPrintings(useAdminCardFoldStore.getState(), "never-visited"),
      ).toBeUndefined();
    });
  });

  describe("toggleSection", () => {
    it("adds a section id to the collapsed set when absent", () => {
      useAdminCardFoldStore.getState().toggleSection("marketplace");

      const collapsed = getCollapsedSections(useAdminCardFoldStore.getState());
      expect(collapsed.has("marketplace")).toBe(true);
    });

    it("removes a section id from the collapsed set when present", () => {
      const { toggleSection } = useAdminCardFoldStore.getState();
      toggleSection("printings");
      toggleSection("printings");

      const collapsed = getCollapsedSections(useAdminCardFoldStore.getState());
      expect(collapsed.has("printings")).toBe(false);
    });

    it("shares section fold state across cards", () => {
      const { toggleSection } = useAdminCardFoldStore.getState();
      toggleSection("cardFields");
      toggleSection("marketplace");

      const collapsed = getCollapsedSections(useAdminCardFoldStore.getState());
      expect(collapsed.has("cardFields")).toBe(true);
      expect(collapsed.has("marketplace")).toBe(true);
      expect(collapsed.has("printings")).toBe(false);
    });
  });

  describe("getCollapsedSections", () => {
    it("returns an empty set initially", () => {
      const collapsed = getCollapsedSections(useAdminCardFoldStore.getState());
      expect(collapsed.size).toBe(0);
    });
  });
});
