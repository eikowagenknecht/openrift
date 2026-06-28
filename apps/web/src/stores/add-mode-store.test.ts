import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { useAddModeStore } from "./add-mode-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useAddModeStore);
  resetIdCounter();
});

afterEach(() => {
  resetStore();
});

describe("useAddModeStore", () => {
  describe("incrementPending", () => {
    it("creates a new entry with pendingCount 1", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry).toBeDefined();
      expect(entry?.pendingCount).toBe(1);
      expect(entry?.quantity).toBe(0);
      expect(entry?.copyIds).toEqual([]);
    });

    it("increments pendingCount for existing entries", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().incrementPending(printing);

      expect(useAddModeStore.getState().addedItems.get("p1")?.pendingCount).toBe(2);
    });

    it("moves entry to the end of the map (most recently touched)", () => {
      const p1 = stubPrinting({ id: "p1" });
      const p2 = stubPrinting({ id: "p2" });

      useAddModeStore.getState().incrementPending(p1);
      useAddModeStore.getState().incrementPending(p2);
      useAddModeStore.getState().incrementPending(p1);

      const keys = [...useAddModeStore.getState().addedItems.keys()];
      expect(keys).toEqual(["p2", "p1"]);
    });
  });

  describe("decrementPending", () => {
    it("decrements pendingCount", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().decrementPending("p1");

      expect(useAddModeStore.getState().addedItems.get("p1")?.pendingCount).toBe(1);
    });

    it("removes entry when both pending and quantity are 0", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().decrementPending("p1");

      expect(useAddModeStore.getState().addedItems.has("p1")).toBe(false);
    });

    it("keeps entry when quantity > 0 even if pending reaches 0", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().decrementPending("p1");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry).toBeDefined();
      expect(entry?.pendingCount).toBe(0);
      expect(entry?.quantity).toBe(1);
    });

    it("does nothing when entry does not exist", () => {
      const before = useAddModeStore.getState();
      useAddModeStore.getState().decrementPending("nonexistent");
      expect(useAddModeStore.getState()).toBe(before);
    });

    it("does nothing when pendingCount is already 0", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");

      const before = useAddModeStore.getState();
      useAddModeStore.getState().decrementPending("p1");
      expect(useAddModeStore.getState()).toBe(before);
    });
  });

  describe("recordAdd", () => {
    it("increments quantity and records copyId", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry?.quantity).toBe(1);
      expect(entry?.copyIds).toEqual(["copy-1"]);
    });

    it("accumulates multiple adds", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().recordAdd(printing, "copy-2");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry?.quantity).toBe(2);
      expect(entry?.copyIds).toEqual(["copy-1", "copy-2"]);
    });
  });

  describe("recordUndo", () => {
    it("decrements quantity and removes last copyId", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().recordAdd(printing, "copy-2");
      useAddModeStore.getState().recordUndo("p1");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry?.quantity).toBe(1);
      expect(entry?.copyIds).toEqual(["copy-1"]);
    });

    it("removes entry when last copy is undone and no pending", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().recordUndo("p1");

      expect(useAddModeStore.getState().addedItems.has("p1")).toBe(false);
    });

    it("keeps entry when copies are gone but pending remains", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().recordUndo("p1");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry).toBeDefined();
      expect(entry?.quantity).toBe(0);
      expect(entry?.pendingCount).toBe(1);
    });

    it("does nothing for unknown printingId", () => {
      const before = useAddModeStore.getState();
      useAddModeStore.getState().recordUndo("nonexistent");
      expect(useAddModeStore.getState()).toBe(before);
    });
  });

  describe("UI toggles", () => {
    it("openVariants stores the anchor element and intent", () => {
      const anchor = document.createElement("button");
      useAddModeStore.getState().openVariants("card-1", anchor, "remove");

      const state = useAddModeStore.getState();
      expect(state.variantPopover).toMatchObject({
        cardId: "card-1",
        anchorEl: anchor,
        intent: "remove",
        setId: undefined,
      });
    });

    it("openVariants wraps the element in a frozen positioning anchor", () => {
      const anchor = document.createElement("button");
      useAddModeStore.getState().openVariants("card-1", anchor, "remove");

      const stored = useAddModeStore.getState().variantPopover?.anchor;
      expect(stored?.contextElement).toBe(anchor);
      expect(typeof stored?.getBoundingClientRect).toBe("function");
    });

    it("closeVariants clears the popover", () => {
      useAddModeStore.getState().openVariants("card-1", document.createElement("button"), "add");
      useAddModeStore.getState().closeVariants();
      expect(useAddModeStore.getState().variantPopover).toBeNull();
    });

    it("openVariants scopes to a single printing when printingId is given", () => {
      const anchor = document.createElement("button");
      useAddModeStore.getState().openVariants("card-1", anchor, "add", undefined, "printing-9");

      expect(useAddModeStore.getState().variantPopover).toMatchObject({
        cardId: "card-1",
        printingId: "printing-9",
      });
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().openVariants("card-1", document.createElement("button"), "add");

      useAddModeStore.getState().reset();

      const state = useAddModeStore.getState();
      expect(state.addedItems.size).toBe(0);
      expect(state.variantPopover).toBeNull();
    });
  });
});
