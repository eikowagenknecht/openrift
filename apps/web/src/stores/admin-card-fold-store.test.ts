import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { getCollapsedPrintings, useAdminCardFoldStore } from "./admin-card-fold-store";

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

      const collapsed = getCollapsedPrintings(useAdminCardFoldStore.getState(), "ahri-inquisitive");
      expect(collapsed.has("printing-1")).toBe(true);
    });

    it("removes a printing id from the collapsed set when present", () => {
      const { togglePrinting } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-1");
      togglePrinting("ahri-inquisitive", "printing-1");

      const collapsed = getCollapsedPrintings(useAdminCardFoldStore.getState(), "ahri-inquisitive");
      expect(collapsed.has("printing-1")).toBe(false);
    });

    it("keeps fold state independent per card", () => {
      const { togglePrinting } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-1");
      togglePrinting("other-card", "printing-1");
      togglePrinting("other-card", "printing-2");

      const state = useAdminCardFoldStore.getState();
      expect(getCollapsedPrintings(state, "ahri-inquisitive").size).toBe(1);
      expect(getCollapsedPrintings(state, "other-card").size).toBe(2);
    });
  });

  describe("expandPrinting", () => {
    it("removes a printing id from the collapsed set", () => {
      const { togglePrinting, expandPrinting } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-1");
      togglePrinting("ahri-inquisitive", "printing-2");

      expandPrinting("ahri-inquisitive", "printing-1");

      const collapsed = getCollapsedPrintings(useAdminCardFoldStore.getState(), "ahri-inquisitive");
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

      const collapsed = getCollapsedPrintings(useAdminCardFoldStore.getState(), "ahri-inquisitive");
      expect(collapsed.has("printing-old")).toBe(false);
      expect(collapsed.has("printing-a")).toBe(true);
      expect(collapsed.has("printing-b")).toBe(true);
    });

    it("stores an empty set to mean all expanded", () => {
      const { togglePrinting, setCollapsedForCard } = useAdminCardFoldStore.getState();
      togglePrinting("ahri-inquisitive", "printing-1");

      setCollapsedForCard("ahri-inquisitive", new Set());

      expect(getCollapsedPrintings(useAdminCardFoldStore.getState(), "ahri-inquisitive").size).toBe(
        0,
      );
    });

    it("copies the input so later mutations of the caller's set don't leak in", () => {
      const input = new Set(["printing-1"]);
      useAdminCardFoldStore.getState().setCollapsedForCard("ahri-inquisitive", input);
      input.add("printing-2");

      const collapsed = getCollapsedPrintings(useAdminCardFoldStore.getState(), "ahri-inquisitive");
      expect(collapsed.has("printing-2")).toBe(false);
    });
  });

  describe("getCollapsedPrintings", () => {
    it("returns an empty set for an unknown card", () => {
      const collapsed = getCollapsedPrintings(useAdminCardFoldStore.getState(), "never-visited");
      expect(collapsed.size).toBe(0);
    });
  });
});
