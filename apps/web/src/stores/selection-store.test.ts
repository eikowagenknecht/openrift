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

    it("disambiguates by zone when the same card appears in multiple zones", () => {
      const printing = stubPrinting({ id: "p1", cardId: "c1", card: { name: "Alpha" } });
      const items = [
        { id: "main:p1", printing, zone: "main" as const },
        { id: "sideboard:p1", printing, zone: "sideboard" as const },
      ];

      useSelectionStore.getState().selectCard(printing, items, "card", { zone: "sideboard" });

      const state = useSelectionStore.getState();
      expect(state.selectedIndex).toBe(1);
      expect(state.selectedZone).toBe("sideboard");
    });

    it("anchors on the clicked copy when several tiles share a printing", () => {
      const printing = stubPrinting({ id: "p1", cardId: "c1", card: { name: "Alpha" } });
      const items = [
        { id: "copy-1", printing },
        { id: "copy-2", printing },
        { id: "copy-3", printing },
      ];

      useSelectionStore.getState().selectCard(printing, items, "printing", { itemId: "copy-3" });

      expect(useSelectionStore.getState().selectedIndex).toBe(2);
    });

    it("falls back to the printing lookup when the item id is not in the list", () => {
      const printing = stubPrinting({ id: "p1", cardId: "c1" });
      const items = [{ id: "copy-1", printing }];

      useSelectionStore.getState().selectCard(printing, items, "printing", { itemId: "gone" });

      expect(useSelectionStore.getState().selectedIndex).toBe(0);
    });

    it("leaves selectedZone null when zone is omitted (catalog path)", () => {
      const printing = stubPrinting({ id: "p1", cardId: "c1" });
      useSelectionStore.getState().selectCard(printing, [{ id: "p1", printing }], "printing");

      expect(useSelectionStore.getState().selectedZone).toBeNull();
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

    it("updates selectedZone when provided", () => {
      const printing = stubPrinting({ id: "p1" });
      useSelectionStore.getState().navigateToIndex(2, printing, "sideboard");

      expect(useSelectionStore.getState().selectedZone).toBe("sideboard");
    });

    it("clears selectedZone when omitted", () => {
      const printing = stubPrinting({ id: "p1" });
      useSelectionStore.setState({ selectedZone: "main" });
      useSelectionStore.getState().navigateToIndex(2, printing);

      expect(useSelectionStore.getState().selectedZone).toBeNull();
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

  describe("reconcileSelection", () => {
    const alpha = () => stubPrinting({ id: "p1", cardId: "c1", card: { name: "Alpha" } });
    const beta = () => stubPrinting({ id: "p2", cardId: "c2", card: { name: "Beta" } });
    const gamma = () => stubPrinting({ id: "p3", cardId: "c3", card: { name: "Gamma" } });

    it("moves the selection onto the card that took the removed one's place", () => {
      const [a, b, c] = [alpha(), beta(), gamma()];
      const items = [
        { id: "p1", printing: a },
        { id: "p2", printing: b },
        { id: "p3", printing: c },
      ];
      useSelectionStore.getState().selectCard(b, items, "printing");

      useSelectionStore.getState().reconcileSelection([
        { id: "p1", printing: a },
        { id: "p3", printing: c },
      ]);

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p3");
      expect(state.selectedIndex).toBe(1);
      expect(state.detailOpen).toBe(true);
    });

    it("falls back to the new last card when the removed one was at the end", () => {
      const [a, b] = [alpha(), beta()];
      const items = [
        { id: "p1", printing: a },
        { id: "p2", printing: b },
      ];
      useSelectionStore.getState().selectCard(b, items, "printing");

      useSelectionStore.getState().reconcileSelection([{ id: "p1", printing: a }]);

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p1");
      expect(state.selectedIndex).toBe(0);
    });

    it("clears the selection when the list empties", () => {
      const a = alpha();
      useSelectionStore.getState().selectCard(a, [{ id: "p1", printing: a }], "printing");

      useSelectionStore.getState().reconcileSelection([]);

      const state = useSelectionStore.getState();
      expect(state.selectedCard).toBeNull();
      expect(state.selectedIndex).toBe(-1);
      expect(state.detailOpen).toBe(false);
    });

    it("follows the selected card when the list reorders", () => {
      const [a, b] = [alpha(), beta()];
      const items = [
        { id: "p1", printing: a },
        { id: "p2", printing: b },
      ];
      useSelectionStore.getState().selectCard(a, items, "printing");

      useSelectionStore.getState().reconcileSelection([
        { id: "p2", printing: b },
        { id: "p1", printing: a },
      ]);

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p1");
      expect(state.selectedIndex).toBe(1);
    });

    it("leaves an unchanged list alone", () => {
      const [a, b] = [alpha(), beta()];
      const items = [
        { id: "p1", printing: a },
        { id: "p2", printing: b },
      ];
      useSelectionStore.getState().selectCard(b, items, "printing");

      useSelectionStore.getState().reconcileSelection(items);

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p2");
      expect(state.selectedIndex).toBe(1);
    });

    it("keeps a picked sibling printing that has no tile of its own", () => {
      const a = alpha();
      const sibling = stubPrinting({ id: "p1-alt", cardId: "c1", card: { name: "Alpha" } });
      const items = [{ id: "p1", printing: a }];
      useSelectionStore.getState().selectCard(a, items, "card");
      useSelectionStore.getState().setSelectedCard(sibling);

      useSelectionStore.getState().reconcileSelection(items);

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p1-alt");
      expect(state.selectedIndex).toBe(0);
    });

    it("keeps the selection on a card whose other copy was removed", () => {
      const a = alpha();
      const items = [
        { id: "copy-1", printing: a },
        { id: "copy-2", printing: a },
      ];
      useSelectionStore.getState().selectCard(a, items, "printing", { itemId: "copy-2" });

      useSelectionStore.getState().reconcileSelection([{ id: "copy-1", printing: a }]);

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p1");
      expect(state.selectedIndex).toBe(0);
    });

    it("stays within the selected zone on the deck overview", () => {
      const a = alpha();
      const b = beta();
      const items = [
        { id: "main:p1", printing: a, zone: "main" as const },
        { id: "sideboard:p1", printing: a, zone: "sideboard" as const },
        { id: "sideboard:p2", printing: b, zone: "sideboard" as const },
      ];
      useSelectionStore.getState().selectCard(a, items, "card", { zone: "sideboard" });

      useSelectionStore.getState().reconcileSelection([
        { id: "sideboard:p1", printing: a, zone: "sideboard" as const },
        { id: "sideboard:p2", printing: b, zone: "sideboard" as const },
      ]);

      const state = useSelectionStore.getState();
      expect(state.selectedCard?.id).toBe("p1");
      expect(state.selectedIndex).toBe(0);
      expect(state.selectedZone).toBe("sideboard");
    });

    it("ignores an empty selection", () => {
      const a = alpha();

      useSelectionStore.getState().reconcileSelection([{ id: "p1", printing: a }]);

      const state = useSelectionStore.getState();
      expect(state.selectedCard).toBeNull();
      expect(state.selectedIndex).toBe(-1);
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

    it("clears selectedZone", () => {
      useSelectionStore.setState({ selectedZone: "main" });
      useSelectionStore.getState().closeDetail();

      expect(useSelectionStore.getState().selectedZone).toBeNull();
    });
  });
});
