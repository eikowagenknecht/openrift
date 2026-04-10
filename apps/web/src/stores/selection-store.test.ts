import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { useSelectionStore } from "./selection-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useSelectionStore);
  resetIdCounter();
});

afterEach(() => {
  resetStore();
});

describe("useSelectionStore", () => {
  describe("selectCard", () => {
    it("selects a card by printing id and opens detail", () => {
      const printing = stubPrinting({ id: "p1", cardId: "c1", card: { name: "Alpha" } });
      const items = [{ id: "p1", printing }];

      useSelectionStore.getState().selectCard(printing, items, "printing");

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p1");
      expect(state.selectedIndex).toBe(0);
      expect(state.detailOpen).toBe(true);
    });

    it("selects a card by card id", () => {
      const printing1 = stubPrinting({ id: "p1", cardId: "c1", card: { name: "Alpha" } });
      const printing2 = stubPrinting({ id: "p2", cardId: "c2", card: { name: "Beta" } });
      const items = [
        { id: "p1", printing: printing1 },
        { id: "p2", printing: printing2 },
      ];

      useSelectionStore.getState().selectCard(printing2, items, "card");

      const state = useSelectionStore.getState();
      expect(state.selectedIndex).toBe(1);
    });

    it("sets index to -1 when card is not found in items", () => {
      const printing = stubPrinting({ id: "p-missing", cardId: "c-missing" });

      useSelectionStore.getState().selectCard(printing, [], "printing");

      expect(useSelectionStore.getState().selectedIndex).toBe(-1);
    });
  });

  describe("navigateToIndex", () => {
    it("updates index and printing without affecting detailOpen", () => {
      const printing = stubPrinting({ id: "p1" });
      useSelectionStore.getState().navigateToIndex(5, printing);

      const state = useSelectionStore.getState();
      expect(state.selectedIndex).toBe(5);
      expect(state.selectedCard?.id).toBe("p1");
      expect(state.detailOpen).toBe(false);
    });
  });

  describe("setSelectedCard", () => {
    it("changes the printing without changing index or open state", () => {
      const first = stubPrinting({ id: "p1" });
      useSelectionStore.getState().selectCard(first, [{ id: "p1", printing: first }], "printing");

      const second = stubPrinting({ id: "p2" });
      useSelectionStore.getState().setSelectedCard(second);

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p2");
      expect(state.selectedIndex).toBe(0);
      expect(state.detailOpen).toBe(true);
    });
  });

  describe("closeDetail", () => {
    it("clears selection and closes detail pane", () => {
      const printing = stubPrinting({ id: "p1" });
      useSelectionStore.getState().selectCard(printing, [{ id: "p1", printing }], "printing");

      useSelectionStore.getState().closeDetail();

      const state = useSelectionStore.getState();
      expect(state.selectedCard).toBeNull();
      expect(state.selectedIndex).toBe(-1);
      expect(state.detailOpen).toBe(false);
    });
  });
});
